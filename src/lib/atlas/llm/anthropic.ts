import type { LlmAdapter, LlmChatOptions, LlmChunk, LlmMessage, LlmResult, LlmTool } from "./types";

function toAnthropicMessages(messages: LlmMessage[]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").join("\n");
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

export const anthropicAdapter: LlmAdapter = {
  async chat(options: LlmChatOptions): Promise<LlmResult> {
    const baseUrl = options.baseUrl || "https://api.anthropic.com/v1";
    const { system, messages } = toAnthropicMessages(options.messages);

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 1024,
        system,
        messages,
        tools: options.tools?.length ? toAnthropicTools(options.tools) : undefined,
      }),
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

    const content = Array.isArray(payload.content)
      ? payload.content
          .filter(isRecord)
          .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
          .join("")
      : "";

    const toolCalls = Array.isArray(payload.content)
      ? payload.content
          .filter(isRecord)
          .filter((block) => block.type === "tool_use")
          .map((block) => ({
            id: typeof block.id === "string" ? block.id : crypto.randomUUID(),
            name: typeof block.name === "string" ? block.name : "",
            arguments: JSON.stringify(block.input ?? {}),
          }))
          .filter((tc) => tc.name.length > 0)
      : [];

    return { content, toolCalls };
  },

  async *streamChat(options: LlmChatOptions): AsyncIterable<LlmChunk> {
    const result = await this.chat(options);
    if (result.content) {
      yield { type: "token", text: result.content };
    }
    for (const call of result.toolCalls) {
      yield { type: "tool_call", call };
    }
    yield { type: "done" };
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
