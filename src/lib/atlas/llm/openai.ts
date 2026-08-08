import type {
  LlmAdapter,
  LlmChatOptions,
  LlmChunk,
  LlmResult,
  LlmMessage,
  LlmTool,
  LlmEmbedOptions,
  LlmEmbedResult,
  LlmUsage,
} from "./types";

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  custom: "",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  nvidia: "https://integrate.api.nvidia.com/v1",
};

function resolveBaseUrl(options: LlmChatOptions): string {
  if (options.baseUrl) {
    return options.baseUrl;
  }
  return DEFAULT_BASE_URLS[options.provider] ?? "";
}

function toOpenAiTools(tools: LlmTool[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function toOpenAiMessages(messages: LlmMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant" && message.tool_calls?.length) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }

    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.tool_call_id,
        content: message.content ?? "",
      };
    }

    return { role: message.role, content: message.content };
  });
}

function toOpenAiToolChoice(choice: LlmChatOptions["toolChoice"]) {
  if (choice === "required") return "required";
  if (choice === "none") return "none";
  return "auto";
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Model request returned ${response.status}${text ? `: ${text}` : ""}`);
  }

  return response;
}

export const openAiAdapter: LlmAdapter = {
  async chat(options: LlmChatOptions): Promise<LlmResult> {
    const baseUrl = resolveBaseUrl(options);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const         response = await postJson(
        `${baseUrl}/chat/completions`,
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        {
          model: options.model,
          messages: toOpenAiMessages(options.messages),
          tools: options.tools?.length ? toOpenAiTools(options.tools) : undefined,
          tool_choice: options.tools?.length ? toOpenAiToolChoice(options.toolChoice) : undefined,
          temperature: options.temperature ?? 0.4,
          max_tokens: options.maxTokens,
        },
        options.signal ?? controller.signal
      );

      const payload: unknown = await response.json();
      const choice = extractChoice(payload);
      return {
        content: choice.content,
        toolCalls: choice.toolCalls,
        finishReason: choice.finishReason,
        usage: extractUsage(payload),
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  async *streamChat(options: LlmChatOptions): AsyncIterable<LlmChunk> {
    const baseUrl = resolveBaseUrl(options);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await postJson(
        `${baseUrl}/chat/completions`,
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
          Accept: "text/event-stream",
        },
        {
          model: options.model,
          messages: toOpenAiMessages(options.messages),
          tools: options.tools?.length ? toOpenAiTools(options.tools) : undefined,
          tool_choice: options.tools?.length ? toOpenAiToolChoice(options.toolChoice) : undefined,
          temperature: options.temperature ?? 0.4,
          max_tokens: options.maxTokens,
          stream: true,
          // OpenAI requires stream_options.include_usage to emit usage in the
          // stream. OpenRouter returns usage in the final chunk by default;
          // NVIDIA/custom endpoints may reject the unknown field, so skip it.
          ...(options.provider === "openai" ? { stream_options: { include_usage: true } } : {}),
        },
        controller.signal
      );

      if (!response.body) {
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
      let lastUsage: LlmUsage | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            yield { type: "done", usage: lastUsage };
            return;
          }

          let json: Record<string, unknown>;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }

          const usage = extractUsage(json);
          if (usage) lastUsage = usage;

          const choice = firstChoice(json);
          if (!choice) continue;
          const delta = isRecord(choice.delta) ? choice.delta : {};

          if (typeof delta.content === "string" && delta.content.length > 0) {
            yield { type: "token", text: delta.content };
          }

          const rawToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
          for (const raw of rawToolCalls) {
            if (!isRecord(raw)) continue;
            const index = typeof raw.index === "number" ? raw.index : 0;
            const existing = toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
            if (typeof raw.id === "string") existing.id = raw.id;
            if (isRecord(raw.function)) {
              if (typeof raw.function.name === "string") existing.name = raw.function.name;
              if (typeof raw.function.arguments === "string") existing.arguments += raw.function.arguments;
            }
            toolCalls.set(index, existing);
          }
        }
      }

      for (const call of Array.from(toolCalls.values())) {
        yield { type: "tool_call", call: { id: call.id || crypto.randomUUID(), name: call.name, arguments: call.arguments } };
      }
      yield { type: "done", usage: lastUsage };
    } finally {
      clearTimeout(timeout);
    }
  },

  async embed(options: LlmEmbedOptions): Promise<LlmEmbedResult> {
    const baseUrl = options.baseUrl || DEFAULT_BASE_URLS[options.provider] || "https://api.openai.com/v1";

    const body: Record<string, unknown> = {
      model: options.model,
      input: options.input,
    };

    if (options.inputType) {
      body.input_type = options.inputType;
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Embedding request returned ${response.status}${text ? `: ${text}` : ""}`);
    }

    const payload: unknown = await response.json();
    const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];

    const embeddings = data
      .filter(isRecord)
      .map((entry) => (Array.isArray(entry.embedding) ? (entry.embedding as unknown[]) : []))
      .filter((vec) => vec.every((n) => typeof n === "number"))
      .map((vec) => vec as number[]);

    if (embeddings.length === 0) {
      throw new Error("Embedding provider returned no vectors.");
    }

    return { embeddings };
  },
};

function extractUsage(payload: unknown): LlmUsage | undefined {
  if (!isRecord(payload)) return undefined;
  const usage = isRecord(payload.usage) ? payload.usage : null;
  if (!usage) return undefined;

  const usageOut: LlmUsage = {};
  if (typeof usage.prompt_tokens === "number") usageOut.promptTokens = usage.prompt_tokens;
  if (typeof usage.completion_tokens === "number") usageOut.completionTokens = usage.completion_tokens;
  if (typeof usage.total_tokens === "number") usageOut.totalTokens = usage.total_tokens;
  return usageOut.promptTokens !== undefined || usageOut.completionTokens !== undefined ? usageOut : undefined;
}

function extractChoice(payload: unknown): { content: string; toolCalls: LlmResult["toolCalls"]; finishReason?: string } {
  const choice = firstChoice(payload);
  if (!choice) {
    return { content: "", toolCalls: [] };
  }
  const message = isRecord(choice.message) ? choice.message : {};
  const content = typeof message.content === "string" ? message.content : "";
  const toolCalls = Array.isArray(message.tool_calls)
    ? (message.tool_calls as unknown[])
        .filter(isRecord)
        .map((tc) => ({
          id: typeof tc.id === "string" ? tc.id : crypto.randomUUID(),
          name: isRecord(tc.function) && typeof tc.function.name === "string" ? tc.function.name : "",
          arguments: isRecord(tc.function) && typeof tc.function.arguments === "string" ? tc.function.arguments : "{}",
        }))
        .filter((tc) => tc.name.length > 0)
    : [];
  return { content, toolCalls, finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined };
}

function firstChoice(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = choices[0];
  return isRecord(choice) ? choice : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
