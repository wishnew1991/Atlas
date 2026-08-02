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

export type TurnContext = {
  executionId: string;
  userId: string;
  message: string;
  history: AtlasChatHistoryItem[];
  capabilities: AtlasCapabilities;
  conversationId: string;
  conversationSummary: string;
  domain: string;
  planned: Plan | null;
  activeModel: ActiveModel | null;
  tools: LlmTool[];
  memories: Awaited<ReturnType<typeof import("@/lib/atlas/server/agent/memory").retrieveMemories>>;
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
