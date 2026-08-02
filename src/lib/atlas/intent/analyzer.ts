import "server-only";

export type IntentKind = "chat" | "tool" | "task" | "clarify";

export interface IntentResult {
  kind: IntentKind;
  confidence: "low" | "medium" | "high";
  reason: string;
}

const actionVerbs =
  /\b(buy|order|book|reserve|schedule|place\s+an?\s+order|checkout|purchase|pay\s+for|confirm|send|email|message|create|add|set|update|delete|search|find|compare|book|cancel)\b/i;

const taskConnectors = /\b(then|after that|and then|next|subsequently|finally|also|followed by)\b/i;

const clarificationSignals = /\b(what|which|when|where|who|how much|how many|can you|should i|do you want|confirm|clarify)\b/i;

const greetingChat =
  /^\s*(hi|hello|hey|yo|hii|heya|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|sup|thanks|thank\s+you|ok|okay|cool|nice|who\s+are\s+you|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself)\b/i;

const identityChat =
  /^\s*(who\s+are\s+you|introduce\s+yourself|what\s+are\s+you|what\s+is\s+atlas|tell\s+me\s+about\s+(you|atlas|yourself)|what\s+can\s+you\s+do|your\s+name|are\s+you\s+(a\s+)?(bot|assistant|ai)|describe\s+yourself)\b/i;

// Food *hints* — the user is expressing hunger/craving but has NOT asked Atlas
// to act yet. These should stay conversational (Atlas offers help, doesn't call
// tools). They lack explicit action verbs like "order"/"find"/"buy".
const foodHint =
  /\b(hungry|starving|famished|craving|feel\s+like|in\s+the\s+mood\s+for|want\s+something\s+to\s+eat|want\s+(to|some)?\s*(food|snack|bite)|what\s+should\s+i\s+(eat|have|get)|not\s+sure\s+what\s+to\s+eat|need\s+(a|something|some)\s+(food|snack|bite))\b/i;

/**
 * Advisory intent analysis. This is NOT a gate — the LLM makes the final
 * tool/no-tool decision via tool_choice: "auto". The result here is a cheap
 * hint used by the Planner and for telemetry/fast paths only.
 */
export function analyzeIntent(message: string): IntentResult {
  const text = message.trim();

  if (text.length === 0) {
    return { kind: "chat", confidence: "high", reason: "empty" };
  }

  if (identityChat.test(text)) {
    return { kind: "chat", confidence: "high", reason: "identity question" };
  }

  // Hunger/craving hints are conversational — Atlas offers, doesn't act yet.
  if (foodHint.test(text)) {
    return { kind: "chat", confidence: "high", reason: "food hint — offer help, do not call tools yet" };
  }

  if (taskConnectors.test(text) && actionVerbs.test(text)) {
    return { kind: "task", confidence: "medium", reason: "multi-step phrasing detected" };
  }

  if (actionVerbs.test(text)) {
    if (clarificationSignals.test(text) && !text.includes("?") === false) {
      return { kind: "clarify", confidence: "low", reason: "may need a missing detail" };
    }
    return { kind: "tool", confidence: "medium", reason: "action verb present" };
  }

  if (clarificationSignals.test(text)) {
    return { kind: "clarify", confidence: "low", reason: "question that may need a follow-up" };
  }

  if (greetingChat.test(text) || text.split(/\s+/).length <= 4) {
    return { kind: "chat", confidence: "medium", reason: "short greeting / small talk" };
  }

  return { kind: "chat", confidence: "low", reason: "general conversation / knowledge" };
}
