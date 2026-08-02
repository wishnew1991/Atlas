import type { LlmAdapter, LlmChatOptions, LlmChunk, LlmMessage, LlmResult, LlmTool, LlmEmbedOptions, LlmEmbedResult } from "./types";

function toGoogleMessages(messages: LlmMessage[]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "tool" && m.tool_call_id) {
        return {
          role: "user",
          parts: [{ text: `Tool result for ${m.tool_call_id}: ${m.content ?? ""}` }],
        };
      }

      if (m.role === "assistant" && m.tool_calls?.length) {
        return {
          role: "model",
          parts: [
            ...(m.content ? [{ text: m.content }] : []),
            ...m.tool_calls.map((tc) => ({
              functionCall: { name: tc.name, args: safeParse(tc.arguments) },
            })),
          ],
        };
      }

      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content ?? "" }],
      };
    });
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function toGoogleTools(tools: LlmTool[]) {
  return {
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  };
}

export const googleAdapter: LlmAdapter = {
  async chat(options: LlmChatOptions): Promise<LlmResult> {
    const baseUrl = options.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    const url = `${baseUrl}/models/${options.model}:generateContent?key=${options.apiKey}`;
    const system = options.messages.find((m) => m.role === "system")?.content;

    const body: Record<string, unknown> = {
      contents: toGoogleMessages(options.messages),
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      tools: options.tools?.length ? [toGoogleTools(options.tools)] : undefined,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Google request returned ${response.status}${text ? `: ${text}` : ""}`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return { content: "", toolCalls: [] };
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const candidate = isRecord(candidates[0]) ? candidates[0] : null;
    const content = isRecord(candidate?.content) ? candidate!.content : null;
    const parts = Array.isArray(content?.parts) ? content!.parts : [];

    const text = parts
      .filter(isRecord)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");

    const toolCalls = parts
      .filter(isRecord)
      .filter((part) => isRecord(part.functionCall))
      .map((part) => {
        const fc = part.functionCall as Record<string, unknown>;
        return {
          id: crypto.randomUUID(),
          name: typeof fc.name === "string" ? fc.name : "",
          arguments: JSON.stringify(fc.args ?? {}),
        };
      })
      .filter((tc) => tc.name.length > 0);

    return { content: text, toolCalls };
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

  async embed(options: LlmEmbedOptions): Promise<LlmEmbedResult> {
    const baseUrl = options.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    const inputs = Array.isArray(options.input) ? options.input : [options.input];

    const results: number[][] = [];
    for (const text of inputs) {
      const url = `${baseUrl}/models/${options.model}:batchEmbedContents?key=${options.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{ model: `models/${options.model}`, content: { parts: [{ text }] } }],
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Google embedding returned ${response.status}${errText ? `: ${errText}` : ""}`);
      }

      const payload: unknown = await response.json();
      const embeddings = isRecord(payload) && Array.isArray(payload.embeddings) ? payload.embeddings : [];
      const first = embeddings[0];
      const values =
        isRecord(first) && Array.isArray(first.values) ? (first.values as unknown[]) : [];
      results.push(values.filter((n) => typeof n === "number") as number[]);
    }

    if (results.length === 0) {
      throw new Error("Embedding provider returned no vectors.");
    }

    return { embeddings: results };
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
