import "server-only";

import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import type { LlmMessage } from "@/lib/atlas/llm";

const RECENT_FULL_TURNS = 8;
const MAX_TURN_CHARS = 1200;
const MAX_SUMMARY_CHARS = 1800;

/**
 * Trim conversation history for the model:
 * - Keep the most recent turns verbatim (capped per turn).
 * - Collapse older turns into a compact rolling summary string.
 * Reduces tokens without dropping the active task context.
 */
export function trimHistoryForModel(
  history: AtlasChatHistoryItem[],
  rollingSummary = ""
): { recent: AtlasChatHistoryItem[]; summary: string } {
  const normalized = history
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({
      role: item.role,
      text: item.text.length > MAX_TURN_CHARS ? `${item.text.slice(0, MAX_TURN_CHARS)}…` : item.text,
    }));

  if (normalized.length <= RECENT_FULL_TURNS) {
    return { recent: normalized, summary: rollingSummary.trim() };
  }

  const older = normalized.slice(0, -RECENT_FULL_TURNS);
  const recent = normalized.slice(-RECENT_FULL_TURNS);
  const olderDigest = older
    .map((item) => `${item.role === "user" ? "User" : "Atlas"}: ${item.text}`)
    .join("\n");

  const merged = [rollingSummary.trim(), olderDigest].filter(Boolean).join("\n");
  const summary =
    merged.length > MAX_SUMMARY_CHARS
      ? `${merged.slice(merged.length - MAX_SUMMARY_CHARS)}`
      : merged;

  return { recent, summary };
}

/** Build LLM messages with optional rolling summary injected after the system prompt. */
export function historyToLlmMessages(
  systemPrompt: string,
  history: AtlasChatHistoryItem[],
  message: string,
  rollingSummary = ""
): LlmMessage[] {
  const { recent, summary } = trimHistoryForModel(history, rollingSummary);
  const messages: LlmMessage[] = [{ role: "system", content: systemPrompt }];

  if (summary) {
    messages.push({
      role: "system",
      content: `Earlier conversation summary (for context only):\n${summary}`,
    });
  }

  for (const item of recent) {
    messages.push({ role: item.role, content: item.text });
  }

  messages.push({ role: "user", content: message });
  return messages;
}

/** Cheap local estimate of prompt size for observability (not tokenizer-accurate). */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

export function estimateMessagesTokens(messages: LlmMessage[]): number {
  return messages.reduce((sum, message) => {
    const content = typeof message.content === "string" ? message.content : "";
    return sum + estimateTokenCount(content);
  }, 0);
}
