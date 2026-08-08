import type { LlmAdapter, LlmChatOptions, LlmChunk, LlmMessage, LlmResult, LlmTool } from "./types";

const CHAT_TIMEOUT_MS = 25000;
const STREAM_TIMEOUT_MS = 60000;

function toAnthropicMessages(messages: LlmMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content ?? "")
    .join("\n");
  const rest = messages.filter((m) => m.role !== "system");

  const converted = rest.map((m) => {
    if (m.role === "tool" && m.tool_call_id) {
      return {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: m.tool_call_id,
            content: m.content ?? "",
          },
        ],
      };
    }

    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant" as const,
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.tool_calls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: safeParse(tc.arguments),
          })),
        ],
      };
    }

    return {
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content ?? "",
    };
  });

  return { system: system || undefined, messages: converted };
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function toAnthropicTools(tools: LlmTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

/** Build an AbortSignal that combines the caller's signal with a timeout. */
function buildTimedSignal(options: LlmChatOptions, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const onAbort = () => controller.abort();
  let externalBound = false;
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else {
      options.signal.addEventListener("abort", onAbort, { once: true });
      externalBound = true;
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (externalBound) options.signal?.removeEventListener("abort", onAbort);
    },
  };
}

function toAnthropicBody(options: LlmChatOptions, stream: boolean) {
  const { system, messages } = toAnthropicMessages(options.messages);
  return {
    model: options.model,
    max_tokens: options.maxTokens ?? 1024,
    system,
    messages,
    tools: options.tools?.length ? toAnthropicTools(options.tools) : undefined,
    stream,
  };
}

// SSE handler needs access to the accumulated tool calls; returns an emitted chunk.
function handleChunkEvent(
  event: string,
  json: Record<string, unknown>,
  toolCalls: Map<number, { id: string; name: string; arguments: string }>
): LlmChunk | null {
  if (event === "content_block_delta") {
    const delta = isRecord(json.delta) ? json.delta : {};
    if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text.length > 0) {
      return { type: "token", text: delta.text };
    }
    if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
      const index = typeof json.index === "number" ? json.index : 0;
      const existing = toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
      existing.arguments += delta.partial_json;
      toolCalls.set(index, existing);
    }
    return null;
  }

  if (event === "content_block_start") {
    const block = isRecord(json.content_block) ? json.content_block : {};
    const index = typeof json.index === "number" ? json.index : 0;
    if (block.type === "tool_use") {
      toolCalls.set(index, {
        id: typeof block.id === "string" ? block.id : "",
        name: typeof block.name === "string" ? block.name : "",
        arguments: "",
      });
    }
    return null;
  }

  return null;
}

export const anthropicAdapter: LlmAdapter = {
  async chat(options: LlmChatOptions): Promise<LlmResult> {
    const baseUrl = options.baseUrl || "https://api.anthropic.com/v1";
    const { signal, cleanup } = buildTimedSignal(options, CHAT_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(toAnthropicBody(options, false)),
        signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Anthropic request returned ${response.status}${text ? `: ${text}` : ""}`);
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        return { content: "", toolCalls: [] };
      }

      const contentBlocks = Array.isArray(payload.content) ? (payload.content as unknown[]) : [];
      const content = contentBlocks
        .filter(isRecord)
        .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
        .join("");

      const toolCalls = contentBlocks
        .filter(isRecord)
        .filter((block) => block.type === "tool_use")
        .map((block) => ({
          id: typeof block.id === "string" ? block.id : crypto.randomUUID(),
          name: typeof block.name === "string" ? block.name : "",
          arguments: JSON.stringify(block.input ?? {}),
        }))
        .filter((tc) => tc.name.length > 0);

      const usage = isRecord(payload.usage) ? payload.usage : null;
      const usageOut: LlmResult["usage"] =
        usage && (typeof usage.input_tokens === "number" || typeof usage.output_tokens === "number")
          ? {
              promptTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
              completionTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
            }
          : undefined;

      return { content, toolCalls, usage: usageOut };
    } finally {
      cleanup();
    }
  },

  async *streamChat(options: LlmChatOptions): AsyncIterable<LlmChunk> {
    const baseUrl = options.baseUrl || "https://api.anthropic.com/v1";
    const { signal, cleanup } = buildTimedSignal(options, STREAM_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(toAnthropicBody(options, true)),
        signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Anthropic request returned ${response.status}${text ? `: ${text}` : ""}`);
      }

      if (!response.body) {
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pendingEvent: string | null = null;

      const toolCallAccum = new Map<number, { id: string; name: string; arguments: string }>();
      let usage: LlmResult["usage"] | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            pendingEvent = trimmed.slice("event:".length).trim();
            continue;
          }

          if (trimmed.startsWith("data:")) {
            const raw = trimmed.slice("data:".length).trim();
            const event = pendingEvent;
            pendingEvent = null;
            if (raw.length === 0 || raw === "[DONE]") continue;

            let json: Record<string, unknown>;
            try {
              json = JSON.parse(raw);
            } catch {
              continue;
            }

            if (event === "message_delta") {
              const usageBlock = isRecord(json.usage) ? json.usage : null;
              if (usageBlock) {
                if (typeof usageBlock.input_tokens === "number") {
                  usage = { ...usage, promptTokens: usageBlock.input_tokens };
                }
                if (typeof usageBlock.output_tokens === "number") {
                  usage = { ...usage, completionTokens: usageBlock.output_tokens };
                }
              }
              continue;
            }

            const chunk = handleChunkEvent(event ?? "", json, toolCallAccum);
            if (chunk) yield chunk;
          }
        }
      }

      for (const call of Array.from(toolCallAccum.values())) {
        if (call.name) {
          yield {
            type: "tool_call",
            call: {
              id: call.id || crypto.randomUUID(),
              name: call.name,
              arguments: call.arguments || "{}",
            },
          };
        }
      }
      yield { type: "done", usage };
    } finally {
      cleanup();
    }
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}