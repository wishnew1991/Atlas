/**
 * Domain detection for the execution pipeline.
 * Runs after intent classification and decides which domain-specific
 * memory, tools, and models apply for this turn.
 */

import type { AtlasActionDomain, AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { resolveConversationState } from "@/lib/atlas/conversation/state";
import {
  detectRecommendationDomain,
  type MemoryIntent,
  type RecommendationDomain,
} from "@/lib/atlas/intent/memory-intent-core";

export type DetectedDomain = {
  /** Model / MCP routing domain */
  actionDomain: AtlasActionDomain;
  /** Preference / recommendation memory category */
  preferenceDomain: RecommendationDomain;
  reason: string;
};

const ACTION_DOMAINS: AtlasActionDomain[] = [
  "food",
  "travel",
  "shopping",
  "rides",
  "appointments",
];

function toActionDomain(domain: RecommendationDomain | string): AtlasActionDomain {
  if (domain === "food") return "food";
  if (domain === "travel") return "travel";
  if (domain === "rides") return "rides";
  if (domain === "shopping") return "shopping";
  if (domain === "entertainment") return "shopping";
  if (domain === "appointments") return "appointments";
  return "shopping";
}

function isActionDomain(value: string): value is AtlasActionDomain {
  return (ACTION_DOMAINS as string[]).includes(value);
}

/**
 * Detect the active domain for this turn.
 * Priority: explicit message signals → memory-intent domain → conversation state → shopping.
 */
export async function detectDomain(input: {
  message: string;
  history?: AtlasChatHistoryItem[];
  memoryIntent?: MemoryIntent | null;
  conversationDomainHint?: string;
}): Promise<DetectedDomain> {
  const fromMessage = detectRecommendationDomain(input.message);
  const fromIntent = input.memoryIntent?.domain;
  const state =
    input.history !== undefined
      ? await resolveConversationState(input.message, input.history)
      : null;
  const fromConversation = state?.domain;
  const hint = input.conversationDomainHint;

  // Strong message signal wins when it is not "general".
  if (fromMessage !== "general") {
    return {
      preferenceDomain: fromMessage,
      actionDomain: toActionDomain(fromMessage),
      reason: `message signals → ${fromMessage}`,
    };
  }

  if (fromIntent && fromIntent !== "general") {
    return {
      preferenceDomain: fromIntent,
      actionDomain: toActionDomain(fromIntent),
      reason: `intent domain → ${fromIntent}`,
    };
  }

  if (fromConversation && isActionDomain(fromConversation)) {
    const preferenceDomain =
      fromConversation === "appointments"
        ? "general"
        : (fromConversation as RecommendationDomain);
    return {
      preferenceDomain,
      actionDomain: fromConversation,
      reason: `conversation state → ${fromConversation}`,
    };
  }

  if (hint && isActionDomain(hint)) {
    return {
      preferenceDomain: hint === "appointments" ? "general" : (hint as RecommendationDomain),
      actionDomain: hint,
      reason: `hint → ${hint}`,
    };
  }

  return {
    preferenceDomain: "general",
    actionDomain: "shopping",
    reason: "default → shopping/general",
  };
}
