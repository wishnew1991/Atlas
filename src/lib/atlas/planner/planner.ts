import "server-only";

import { analyzeIntent, type IntentResult } from "@/lib/atlas/intent/analyzer";
import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { resolveConversationState } from "@/lib/atlas/conversation/state";
import type { MemoryIntent } from "@/lib/atlas/intent/memory-intent";
import { wantsLiveRecommendationTools } from "@/lib/atlas/intent/memory-intent-core";

/**
 * Capabilities describe WHAT a request is about, not HOW it is fulfilled. They are
 * intentionally decoupled from any specific MCP or tool — the Tool Registry maps a
 * capability to the tools that can satisfy it. This keeps the Planner free of
 * domain/MCP-specific conditionals and lets new integrations register new
 * capabilities without touching the planner.
 */
export type Capability = import("@/lib/atlas/capabilities/types").CanonicalCapability;

export const ALL_CAPABILITIES: Capability[] = [
  "food",
  "travel",
  "shopping",
  "rides",
  "calendar",
  "communication",
  "web",
  "payments",
  "email",
  "documents",
  "messaging",
  "none",
];

export interface Plan {
  /** The capabilities this request requires, in priority order. */
  capabilities: Capability[];
  intent: IntentResult;
  reason: string;
  /** True when this turn continues an already-active task (e.g. "yes"). */
  isContinuation: boolean;
}

function withRecommendationWeb(
  capabilities: Capability[],
  memoryIntent?: MemoryIntent | null
): Capability[] {
  if (!memoryIntent || !wantsLiveRecommendationTools(memoryIntent)) return capabilities;
  if (capabilities.includes("web")) return capabilities;
  if (capabilities.length === 1 && capabilities[0] === "none") return ["web"];
  return [...capabilities, "web"];
}

/**
 * The Planner produces an *advisory* set of capabilities for the request. It does
 * NOT decide whether tools are used — that belongs to the reasoning LLM via
 * tool_choice "auto". Memory intent is classified in the execution pipeline
 * (`classify_intent`); pass it here only when already known so web can be enabled.
 *
 * Planning operates on the CONVERSATION, not the final utterance. A bare
 * confirmation ("yes", "go ahead", "book it") inherits the capabilities of the
 * task already in flight.
 */
export async function plan(
  message: string,
  history: AtlasChatHistoryItem[] = [],
  precomputedState?: Awaited<ReturnType<typeof resolveConversationState>>,
  memoryIntent?: MemoryIntent | null
): Promise<Plan> {
  const intent = analyzeIntent(message);
  const state = precomputedState ?? (await resolveConversationState(message, history));

  if (state.isContinuation && state.capabilities.length > 0) {
    return {
      capabilities: withRecommendationWeb(state.capabilities, memoryIntent),
      intent,
      reason: state.reason,
      isContinuation: true,
    };
  }

  if (state.capabilities.length > 0) {
    return {
      capabilities: withRecommendationWeb(state.capabilities, memoryIntent),
      intent,
      reason: state.reason,
      isContinuation: false,
    };
  }

  if (intent.kind === "chat") {
    return {
      capabilities: withRecommendationWeb(["none"], memoryIntent),
      intent,
      reason: memoryIntent && wantsLiveRecommendationTools(memoryIntent)
        ? "Recommendation ask — enabling web lookup for live context."
        : "Conversational message — no capability required.",
      isContinuation: false,
    };
  }

  return {
    capabilities: ["web"],
    intent,
    reason: "No specific capability matched — allowing web lookup.",
    isContinuation: false,
  };
}
