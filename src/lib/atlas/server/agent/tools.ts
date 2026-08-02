import "server-only";

import type { LlmMessage, LlmToolCall } from "@/lib/atlas/llm";
import type { ToolExecResult } from "@/lib/atlas/tools/registry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function extractToolCallFromContent(content: string): LlmToolCall | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isRecord(parsed)) {
        const name =
          typeof parsed.tool === "string" ? parsed.tool : typeof parsed.name === "string" ? parsed.name : "";
        if (name) {
          const rawArgs = parsed.arguments ?? parsed.parameters ?? parsed.input ?? {};
          const argumentsStr = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
          return { id: crypto.randomUUID(), name, arguments: argumentsStr };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const xmlFunc = content.match(/<function=([\w_]+)>/);
  if (xmlFunc) {
    const name = xmlFunc[1];
    const args: Record<string, unknown> = {};
    const xmlParamRe = /<parameter=(\w+)>\s*([\s\S]*?)\s*<\/parameter>/g;
    let m;
    while ((m = xmlParamRe.exec(content)) !== null) {
      const key = m[1];
      const val = m[2].trim();
      args[key] = /^\d+$/.test(val) ? Number(val) : val;
    }
    return { id: crypto.randomUUID(), name, arguments: JSON.stringify(args) };
  }

  return null;
}

export function looksLikeToolPayload(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.includes("{") && !trimmed.includes("<tool_call>")) return false;
  if (trimmed.includes("<function=")) return true;

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return false;

  try {
    const parsed = JSON.parse(match[0]);
    if (!isRecord(parsed)) return false;
    const hasName = typeof parsed.tool === "string" || typeof parsed.name === "string";
    const hasArgs = "arguments" in parsed || "parameters" in parsed || "input" in parsed;
    return hasName && hasArgs;
  } catch {
    return false;
  }
}

/**
 * Strip tokenizer garbage some models emit (e.g. Nemotron `<unk>` dumps).
 * Returns empty string when nothing usable remains.
 */
export function sanitizeAssistantText(content: string): string {
  const text = content
    .replace(/<\/?unk>/gi, "")
    .replace(/<unk>/gi, "")
    .replace(/<\/?x\d+>/gi, "")
    .replace(/<\|[^|>]+?\|>/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) return "";

  const letters = (text.match(/[a-zA-Z0-9\u00C0-\u024F]/g) || []).length;
  if (letters === 0 || letters / text.length < 0.25) {
    return "";
  }

  return text;
}

export function resolveToolCalls(result: { content: string; toolCalls: LlmToolCall[] }): LlmToolCall[] {
  if (result.toolCalls.length > 0) return result.toolCalls;
  const embedded = result.content ? extractToolCallFromContent(result.content) : null;
  return embedded ? [embedded] : [];
}

export function buildFollowUpMessages(
  baseMessages: LlmMessage[],
  assistantContent: string,
  toolCalls: LlmToolCall[],
  results: ToolExecResult[]
): LlmMessage[] {
  return [
    ...baseMessages,
    {
      role: "assistant",
      content: looksLikeToolPayload(assistantContent) ? null : assistantContent || null,
      tool_calls: toolCalls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })),
    },
    ...toolCalls.map((call, index) => ({
      role: "tool" as const,
      tool_call_id: call.id,
      content: JSON.stringify(results[index] ?? { message: "" }),
    })),
  ];
}

export function summarizeToolTurn(toolCalls: LlmToolCall[], results: ToolExecResult[]): string {
  const parts = results
    .map((result) => (result?.message ?? "").trim())
    .filter((message) => message.length > 0);

  if (parts.length > 0) return parts.join("\n\n");
  return `(${toolCalls.map((call) => call.name).join(", ")} completed)`;
}

export function humanizeToolName(name: string): string {
  return name
    .replace(/^mcp__/, "")
    .replace(/^food_/, "food · ")
    .replace(/^atlas_/, "")
    .replace(/__/g, " · ")
    .replace(/_/g, " ");
}
