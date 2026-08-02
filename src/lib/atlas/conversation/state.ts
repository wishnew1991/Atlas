import "server-only";

import type { AtlasActionDomain, AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import type { Capability } from "@/lib/atlas/planner/planner";
import { classifyCapabilities } from "@/lib/atlas/planner/classifier";

/**
 * Single source of truth for conversational understanding.
 *
 * Both the Planner (capabilities) and the agent (action domain) derive their
 * answer from this module, so they can never disagree again. It resolves the
 * *conversation*, not just the latest utterance: a bare confirmation such as
 * "yes" inherits the capability and domain that were already active.
 */

// Topic signals. These describe WHAT a turn is about, never HOW it is fulfilled.
//
// Each keyword is tagged `strong` (unambiguous anchor — deterministic routing is
// safe) or `weak` (ambiguous verb like "order"/"book"/"send" whose object decides
// the capability). Weak matches alone trigger the semantic classifier rather than
// guessing. This keeps the deterministic planner as the hot path while avoiding a
// growing keyword list: the set of weak verbs is small and stable.
export const CAPABILITY_KEYWORDS: { capability: Capability; pattern: RegExp; strength: "strong" | "weak" }[] = [
  { capability: "food", strength: "strong", pattern: /\b(food|restaurant|restaurants|biryani|biriyani|dinner|lunch|breakfast|swiggy|zomato|deliver(?:y|ed)?|menu|pizza|burger|sushi|meal|snack|eat|cuisine|hungry|craving|mcp)\b/i },
  { capability: "travel", strength: "strong", pattern: /\b(flight|flights|hotel|hotels|trip|trips|travel|book(ing)?\s+(a\s+)?(flight|hotel|trip)|vacation|itinerary|airbnb|airline)\b/i },
  { capability: "shopping", strength: "strong", pattern: /\b(buy|purchase|shop|shopping|cart|checkout|product|amazon|flipkart)\b/i },
  { capability: "shopping", strength: "weak", pattern: /\b(order)\b/i },
  { capability: "rides", strength: "strong", pattern: /\b(ride|rides|uber|ola|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop|chauffeur)\b/i },
  { capability: "calendar", strength: "strong", pattern: /\b(appointment|appointments|schedule|meeting|book\s+(a\s+)?(slot|appointment)|salon|spa|dentist|consultation|calendar|remind\s+me|event)\b/i },
  { capability: "communication", strength: "strong", pattern: /\b(email|e-mail|message|text|sms|whatsapp|slack)\b/i },
  { capability: "communication", strength: "weak", pattern: /\b(call|send|notify|tell\s+\w+)\b/i },
  { capability: "web", strength: "strong", pattern: /\b(news|lookup|what\s+is|who\s+is|latest|current|weather|explain|how\s+(to|do)|why\s+|research)\b/i },
  { capability: "web", strength: "weak", pattern: /\b(search)\b/i },
];

/** Capabilities that map onto a real-world action domain (MCP-backed). */
const CAPABILITY_TO_DOMAIN: Partial<Record<Capability, AtlasActionDomain>> = {
  food: "food",
  travel: "travel",
  shopping: "shopping",
  rides: "rides",
  calendar: "appointments",
};

/**
 * Affirmative / continuation utterances. This is deliberately broad and
 * *generic* — it is not a list of magic words tied to one domain. Anything that
 * carries no topic of its own but moves the current task forward belongs here.
 */
const CONFIRMATION_PATTERN =
  /^\s*(?:(?:yes|yeah|yep|yup|ya|sure|ok|okay|k|fine|right|correct|affirmative|please|pls|absolutely|definitely|indeed|agreed|sounds?\s+good|works?\s+for\s+me|that\s+works|go\s+ahead|go\s+for\s+it|do\s+it|make\s+it\s+happen|proceed|continue|carry\s+on|confirm(?:ed)?|approve(?:d)?|accept(?:ed)?|book\s+it|order\s+it|buy\s+it|place\s+it|get\s+it|take\s+it|send\s+it|schedule\s+it|that\s+one|this\s+one|the\s+first\s+one|the\s+second\s+one|first\s+one|second\s+one|either|any|whatever|surprise\s+me)\b[\s,.!]*)+$/i;

/** Short deictic references that only make sense against a previous turn. */
const REFERENTIAL_PATTERN =
  /^\s*(?:(?:that|this|it|them|those|these|the\s+\w+)\s+(?:one|ones|option|item|place|restaurant|flight|hotel|slot|time)?|#?\d{1,2}|option\s+#?\d{1,2}|number\s+#?\d{1,2})\s*[.!]?\s*$/i;

/** A turn that supplies a missing detail (address, date, time) continues a task. */
const SLOT_FILL_PATTERN =
  /\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|noon|midnight|\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)|\d{1,2}\/\d{1,2}|next\s+week|this\s+week|works?\s+for\s+me)\b/i;

export interface ConversationState {
  /** Capabilities active for this turn, in priority order. */
  capabilities: Capability[];
  /** The action domain for model/MCP routing. */
  domain: AtlasActionDomain;
  /** True when the current message only continues an existing task. */
  isContinuation: boolean;
  /** Human-readable explanation, used by the planner's `reason` and tracing. */
  reason: string;
}

interface TextCapabilityMatch {
  capability: Capability;
  strength: "strong" | "weak";
}

function capabilitiesInText(text: string): TextCapabilityMatch[] {
  const found: TextCapabilityMatch[] = [];
  for (const entry of CAPABILITY_KEYWORDS) {
    if (entry.pattern.test(text)) found.push({ capability: entry.capability, strength: entry.strength });
  }
  return found;
}

/** True when a message carries no topic of its own and leans on prior context. */
export function isContinuationUtterance(message: string): boolean {
  const text = message.trim();
  if (text.length === 0) return false;

  // Checked BEFORE keyword matching: phrases like "order it" or "book it"
  // contain topic words ("order", "book") but carry no topic of their own —
  // the object is a pronoun referring to the task already in flight.
  if (CONFIRMATION_PATTERN.test(text)) return true;
  if (REFERENTIAL_PATTERN.test(text)) return true;

  // Any other message that names its own topic is not a pure continuation.
  if (capabilitiesInText(text.toLowerCase()).length > 0) return false;

  // Slot-filling replies ("tomorrow works", "7pm") continue the active task, but
  // only when they are short — a long sentence usually introduces a new topic.
  if (SLOT_FILL_PATTERN.test(text) && text.split(/\s+/).length <= 6) return true;

  return false;
}

/**
 * Walk the conversation backwards and return the most recent set of
 * capabilities established by a topical turn.
 *
 * USER turns are authoritative: they are what the person actually asked for.
 * Assistant turns are only consulted as a fallback, because assistant phrasing
 * ("Would you like me to order it?") frequently contains incidental keywords
 * ("order") that would otherwise hijack the inherited capability.
 */
function priorCapabilities(history: AtlasChatHistoryItem[]): Capability[] {
  const scan = (role: AtlasChatHistoryItem["role"]): Capability[] => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i];
      if (!item || item.role !== role || typeof item.text !== "string") continue;
      // Skip turns that are themselves continuations — they carry no topic.
      if (role === "user" && isContinuationUtterance(item.text)) continue;
      const found = capabilitiesInText(item.text.toLowerCase());
      if (found.length > 0) return found.map((entry) => entry.capability);
    }
    return [];
  };

  const fromUser = scan("user");
  if (fromUser.length > 0) return fromUser;
  return scan("assistant");
}

function domainForCapabilities(capabilities: Capability[]): AtlasActionDomain | null {
  for (const capability of capabilities) {
    const domain = CAPABILITY_TO_DOMAIN[capability];
    if (domain) return domain;
  }
  return null;
}

/**
 * Resolve the active conversational state for a turn.
 *
 * Resolution order:
 *  1. Topic named in the current message wins.
 *  2. Otherwise, if the message is a confirmation/reference/slot-fill, inherit
 *     the capabilities from the most recent topical turn.
 *  3. Otherwise there is no active task.
 */
/**
 * Resolve the active conversational state for a turn.
 *
 * Resolution order:
 *  1. Topic named in the current message wins (deterministic planner).
 *  2. Otherwise, if the message is a confirmation/reference/slot-fill, inherit
 *     the capabilities from the most recent topical turn.
 *  3. Otherwise there is no active task in the current message.
 *
 * The deterministic planner is the hot path. The semantic classifier is invoked
 * ONLY when the regex is insufficient: no match, only weak/ambiguous matches
 * (low confidence), or multiple capabilities are plausible. This keeps the
 * per-turn LLM cost near zero for obvious cases while still resolving ambiguous
 * phrasings ("order Sweet Corn and Filter Coffee" -> food) across every domain.
 */
export async function resolveConversationState(
  message: string,
  history: AtlasChatHistoryItem[] = []
): Promise<ConversationState> {
  const text = message.toLowerCase().trim();

  // Continuations are resolved FIRST. "order it" / "book it" would otherwise
  // match the shopping/travel keyword patterns and silently reset the task to
  // the wrong capability on the confirmation turn.
  if (isContinuationUtterance(message)) {
    const inherited = priorCapabilities(history);
    if (inherited.length > 0) {
      return {
        capabilities: inherited,
        domain: domainForCapabilities(inherited) ?? "shopping",
        isContinuation: true,
        reason: `Continuation of the active task — inherited capabilities: ${inherited.join(", ")}.`,
      };
    }
  }

  const direct = capabilitiesInText(text);

  if (direct.length > 0) {
    const strong = direct.filter((entry) => entry.strength === "strong");
    const weakOnly = strong.length === 0;
    const multiCapability = new Set(direct.map((entry) => entry.capability)).size > 1;

    // Deterministic routing is safe for a single strong match.
    if (!weakOnly && !multiCapability) {
      const caps = direct.map((entry) => entry.capability);
      return {
        capabilities: caps,
        domain: domainForCapabilities(caps) ?? "shopping",
        isContinuation: false,
        reason: `Capabilities inferred from current message: ${caps.join(", ")}.`,
      };
    }

    // Weak-only or multi-capability: let the semantic classifier disambiguate.
    const classified = await classifyCapabilities({
      message,
      history: history
        .slice(-6)
        .map((entry) => ({ role: entry.role, text: entry.text }))
        .filter((entry): entry is { role: "user" | "assistant"; text: string } =>
          (entry.role === "user" || entry.role === "assistant") && typeof entry.text === "string"
        ),
    });

    return {
      capabilities: classified.capabilities,
      domain: classified.domain ?? domainForCapabilities(classified.capabilities) ?? "shopping",
      isContinuation: false,
      reason: `Classifier (${classified.confidence}): ${classified.reason}`,
    };
  }

  // No keyword matched at all. Let the semantic classifier resolve the turn
  // from the full utterance + context before declaring it capability-less.
  const classified = await classifyCapabilities({
    message,
    history: history
      .slice(-6)
      .map((entry) => ({ role: entry.role, text: entry.text }))
      .filter((entry): entry is { role: "user" | "assistant"; text: string } =>
        (entry.role === "user" || entry.role === "assistant") && typeof entry.text === "string"
      ),
  });

  if (classified.capabilities.length > 0 && classified.capabilities[0] !== "web") {
    return {
      capabilities: classified.capabilities,
      domain: classified.domain ?? domainForCapabilities(classified.capabilities) ?? "shopping",
      isContinuation: false,
      reason: `Classifier (${classified.confidence}): ${classified.reason}`,
    };
  }

  // Genuinely no actionable capability (small talk / knowledge). Keep the last
  // known domain so model routing stays stable across the thread.
  const fallback = priorCapabilities(history);
  return {
    capabilities: [],
    domain: domainForCapabilities(fallback) ?? "shopping",
    isContinuation: false,
    reason: "No actionable capability detected for this turn.",
  };
}
