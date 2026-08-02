/**
 * Per-turn working memory for an Execution (not persisted).
 */

import type { AtlasChatHistoryItem, AtlasPendingAction } from "@/lib/atlas/agent-contract";
import type { AtlasCapabilities } from "@/lib/atlas/server/auth";
import type { Plan } from "@/lib/atlas/planner/planner";
import type { ToolExecResult } from "@/lib/atlas/tools/registry";
import type { ActiveModel } from "@/lib/atlas/server/agent/reply";
import type { RunTrace, StageEvent } from "@/lib/atlas/observability/trace";
import type { LlmTool } from "@/lib/atlas/llm/types";
import type { MemoryIntent, MemoryRecallMode } from "@/lib/atlas/server/agent/memory";
import type { RecommendationContext } from "@/lib/atlas/recommendation/engine";

export type TurnContext = {
  executionId: string;
  userId: string;
  message: string;
  history: AtlasChatHistoryItem[];
  capabilities: AtlasCapabilities;
  conversationId: string;
  conversationSummary: string;
  domain: string;
  /** Domain used for preference/recommendation memory (may differ from action routing). */
  preferenceDomain: string;
  planned: Plan | null;
  activeModel: ActiveModel | null;
  tools: LlmTool[];
  /** Merged lines for the system prompt */
  memories: string[];
  safetyMemories: string[];
  preferenceMemories: string[];
  memoryMode: MemoryRecallMode;
  memoryIntent: MemoryIntent | null;
  recommendation: RecommendationContext | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  toolResults: ToolExecResult[];
  action?: AtlasPendingAction;
  reply: string;
  trace: RunTrace;
  emit: (event: EngineEmit) => void;
  signal?: AbortSignal;
};

export type EngineEmit =
  | { kind: "stage"; stage: StageEvent }
  | { kind: "token"; text: string };

const contexts = new Map<string, TurnContext>();

export function setTurnContext(executionId: string, ctx: TurnContext) {
  contexts.set(executionId, ctx);
}

export function getTurnContext(executionId: string): TurnContext | undefined {
  return contexts.get(executionId);
}

export function clearTurnContext(executionId: string) {
  contexts.delete(executionId);
}

export function mergeMemoryLines(ctx: TurnContext) {
  const merged = [...ctx.safetyMemories];
  for (const line of ctx.preferenceMemories) {
    if (!merged.includes(line)) merged.push(line);
  }
  if (ctx.recommendation) {
    for (const line of ctx.recommendation.lines) {
      if (!merged.includes(line)) merged.push(line);
    }
  }
  ctx.memories = merged;
}
