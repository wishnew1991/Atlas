import "server-only";

import { analyzeIntent, type IntentResult } from "@/lib/atlas/intent/analyzer";
import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { resolveConversationState } from "@/lib/atlas/conversation/state";

/**
 * Capabilities describe WHAT a request is about, not HOW it is fulfilled. They are
 * intentionally decoupled from any specific MCP or tool — the Tool Registry maps a
 * capability to the tools that can satisfy it. This keeps the Planner free of
 * domain/MCP-specific conditionals and lets new integrations register new
 * capabilities without touching the planner.
 */
export type Capability =
  | "food"
  | "travel"
  | "shopping"
  | "rides"
  | "calendar"
  | "communication"
  | "web"
  | "none";

export const ALL_CAPABILITIES: Capability[] = [
  "food",
  "travel",
  "shopping",
  "rides",
  "calendar",
  "communication",
  "web",
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

/**
 * The Planner produces an *advisory* set of capabilities for the request. It does
 * NOT decide whether tools are used — that belongs to the reasoning LLM via
 * tool_choice "auto". Memory is retrieved independently and injected before this
 * step, so the LLM has personal context regardless of the capabilities listed.
 *
 * Planning operates on the CONVERSATION, not the final utterance. A bare
 * confirmation ("yes", "go ahead", "book it") inherits the capabilities of the
 * task already in flight, so tools stay available on the exact turn the user
 * approves an action. Conversational understanding is delegated to
 * `resolveConversationState` — the single source of truth shared with the
 * agent's domain routing.
 */
export async function plan(message: string, history: AtlasChatHistoryItem[] = []): Promise<Plan> {
  const intent = analyzeIntent(message);
  const state = await resolveConversationState(message, history);

  // A continuation inherits the active task's capabilities regardless of what
  // the (context-free) intent analyzer thinks of the bare utterance.
  if (state.isContinuation && state.capabilities.length > 0) {
    return {
      capabilities: state.capabilities,
      intent,
      reason: state.reason,
      isContinuation: true,
    };
  }

  if (state.capabilities.length > 0) {
    return {
      capabilities: state.capabilities,
      intent,
      reason: state.reason,
      isContinuation: false,
    };
  }

  // Identity / pure small talk: no capability required.
  if (intent.kind === "chat") {
    return {
      capabilities: ["none"],
      intent,
      reason: "Conversational message — no capability required.",
      isContinuation: false,
    };
  }

  // General knowledge / fallback: allow web lookup.
  return {
    capabilities: ["web"],
    intent,
    reason: "No specific capability matched — allowing web lookup.",
    isContinuation: false,
  };
}
