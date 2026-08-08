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
  // Check for any <tool_call> block (handles any opening/closing tag style)
  const toolCallBlock = content.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
  if (toolCallBlock) {
    const inner = toolCallBlock[1];
    const nameMatch =
      inner.match(/<function[=_\s]+(?:name=)?["']?([\w_.:-]+)["']?>/i) ||
      inner.match(/<function_name>([\w_.:-]+)<\/function_name>/i) ||
      inner.match(/<([\w_.:-]+)>/i);

    if (nameMatch) {
      const rawName = nameMatch[1];
      const name =
        rawName.includes("search") || rawName.includes("weather")
          ? "web_search"
          : rawName.replace(/^mcp__.*?__/, "");

      const args: Record<string, unknown> = {};
      const xmlParamRe = /<parameter=([\w_]+)>\s*([\s\S]*?)\s*<\/parameter>/gi;
      let m;
      while ((m = xmlParamRe.exec(inner)) !== null) {
        const key = m[1];
        const val = m[2].trim();
        args[key] = /^\d+$/.test(val) ? Number(val) : val;
      }

      const paramJson = inner.match(/<parameters>([\s\S]*?)<\/parameters>/i);
      if (paramJson) {
        try {
          Object.assign(args, JSON.parse(paramJson[1].trim()));
        } catch {
          args.query = paramJson[1].trim();
        }
      }

      return { id: crypto.randomUUID(), name, arguments: JSON.stringify(args) };
    }
  }

  // Format 1: <function=name><parameter=k>v</parameter></function>
  const xmlFunc1 = content.match(/<function=([\w_.:-]+)>/) || content.match(/<function\s+name=["']?([\w_.:-]+)["']?>/);
  if (xmlFunc1) {
    const rawName = xmlFunc1[1];
    const name =
      rawName.includes("web_search") || rawName.includes("brave_search") || rawName.includes("google_search") || rawName.includes("search")
        ? "web_search"
        : rawName.replace(/^mcp__.*?__/, "");
    const args: Record<string, unknown> = {};
    const xmlParamRe = /<parameter=([\w_]+)>\s*([\s\S]*?)\s*<\/parameter>/g;
    let m;
    while ((m = xmlParamRe.exec(content)) !== null) {
      const key = m[1];
      const val = m[2].trim();
      args[key] = /^\d+$/.test(val) ? Number(val) : val;
    }
    return { id: crypto.randomUUID(), name, arguments: JSON.stringify(args) };
  }

  // Format 2: <function_name>name</function_name><parameters>{...}</parameters>
  const xmlFunc2 = content.match(/<function_name>([\w_.:-]+)<\/function_name>/);
  if (xmlFunc2) {
    const rawName = xmlFunc2[1];
    const name = rawName.includes("search") ? "web_search" : rawName.replace(/^mcp__.*?__/, "");
    const paramMatch = content.match(/<parameters>([\s\S]*?)<\/parameters>/);
    let args: Record<string, unknown> = {};
    if (paramMatch) {
      try {
        args = JSON.parse(paramMatch[1].trim());
      } catch {
        args = { query: paramMatch[1].trim() };
      }
    }
    return { id: crypto.randomUUID(), name, arguments: JSON.stringify(args) };
  }

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

  return null;
}

export function looksLikeToolPayload(content: string): boolean {
  const trimmed = content.trim();
  if (
    trimmed.startsWith("<tool_call") ||
    trimmed.startsWith("<function") ||
    trimmed.includes("<tool_call") ||
    trimmed.includes("<function") ||
    trimmed.includes("<parameter")
  ) {
    return true;
  }
  if (!trimmed.includes("{")) return false;

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
 * Strip tokenizer garbage and raw pseudo-tool tags some models emit as text.
 * Returns empty string when nothing usable remains.
 */
export function sanitizeAssistantText(content: string): string {
  const text = content
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<function=[\s\S]*?<\/function>/gi, "")
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
  const toolResultsSummary = results
    .map((r, i) => {
      const summaryText = r.message || (isRecord(r.data) ? JSON.stringify(r.data) : String(r.data || ""));
      return `[Tool Result for "${toolCalls[i]?.name}"]: ${summaryText}`;
    })
    .join("\n\n");

  return [
    ...baseMessages,
    {
      role: "assistant",
      content: `I'll look that up for you using ${toolCalls.map((t) => t.name).join(", ")}.`,
    },
    {
      role: "user",
      content: `Here is the information from the search:\n${toolResultsSummary}\n\nPlease provide a clear, helpful, and complete final answer to my question based on the information above. Do not output raw tool tags or call additional tools.`,
    },
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
