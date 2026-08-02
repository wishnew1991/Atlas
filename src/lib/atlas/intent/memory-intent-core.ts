/**
 * Pure memory-intent scoring (no server runtime). Used by the classifier and tests.
 */

export type MemoryIntentKind =
  | "conversational"
  | "recommendation"
  | "execution"
  | "hybrid"
  | "ambiguous";

export type RecommendationDomain =
  | "food"
  | "travel"
  | "shopping"
  | "entertainment"
  | "rides"
  | "general";

export type MemoryIntent = {
  kind: MemoryIntentKind;
  domain: RecommendationDomain;
  /** 0..1 confidence in the chosen kind */
  confidence: number;
  reason: string;
  /** How the decision was made */
  source: "heuristic" | "llm";
  /** True when Atlas should ask if the user wants ideas vs a direct action */
  needsClarification: boolean;
};

export type IntentScores = Record<MemoryIntentKind, number>;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function detectRecommendationDomain(
  message: string,
  domainHint?: string
): RecommendationDomain {
  const m = message.toLowerCase();
  const hint = (domainHint || "").toLowerCase();

  if (
    /(food|eat|dinner|lunch|breakfast|restaurant|cuisine|hungry|craving|biryani|pizza|menu|swiggy|zomato)/.test(
      m
    ) ||
    hint === "food"
  ) {
    return "food";
  }
  if (
    /(flight|hotel|trip|travel|vacation|itinerary|destination|weekend getaway|airport)/.test(m) ||
    hint === "travel"
  ) {
    return "travel";
  }
  if (
    /(laptop|phone|buy|shop|product|amazon|price|gadget|headphones)/.test(m) ||
    hint === "shopping"
  ) {
    return "shopping";
  }
  if (/(movie|show|watch|music|concert|game|entertainment|netflix)/.test(m)) {
    return "entertainment";
  }
  if (/(ride|uber|ola|cab|taxi|driver)/.test(m) || hint === "rides") {
    return "rides";
  }
  if (hint === "appointments") return "general";
  return "general";
}

/**
 * Multi-signal scorer — not a single keyword gate. Features are weighted and
 * combined so close races fall through to LLM or ambiguous clarification.
 */
export function scoreMemoryIntent(message: string): IntentScores {
  const m = message.trim().toLowerCase();
  const scores: IntentScores = {
    conversational: 0.12,
    recommendation: 0,
    execution: 0,
    hybrid: 0,
    ambiguous: 0,
  };

  if (!m) {
    scores.conversational = 1;
    return scores;
  }

  // --- Recommendation features ---
  if (/\b(suggest|suggestion|suggestions|recommend|recommendation|recommendations)\b/.test(m)) {
    scores.recommendation += 0.42;
  }
  if (/\b(what|where)\s+should\s+i\b/.test(m)) scores.recommendation += 0.4;
  if (/\b(pick|choose|decide)\s+(for\s+me|something|one|tonight|today)\b/.test(m)) {
    scores.recommendation += 0.38;
  }
  if (/\b(pick|choose|decide)\b.{0,40}\bfor\s+me\b/.test(m)) {
    scores.recommendation += 0.38;
  }
  if (/\bsurprise\s+me\b/.test(m)) scores.recommendation += 0.45;
  if (/\bhelp\s+me\s+(pick|choose|decide|find|figure)\b/.test(m)) scores.recommendation += 0.35;
  if (/\b(any|some)\s+(ideas?|options?|picks?|recs?)\b/.test(m)) scores.recommendation += 0.32;
  if (/\bbest\s+(places?|restaurants?|cafes?|hotels?|flights?|destinations?|laptops?|options?)\b/.test(m)) {
    scores.recommendation += 0.3;
  }
  if (/\b(explore|something\s+new|never\s+tried|something\s+different)\b/.test(m)) {
    scores.recommendation += 0.28;
  }
  if (/\blooking\s+for\s+(a\s+|some\s+)?(recommendation|suggestions?|ideas?)\b/.test(m)) {
    scores.recommendation += 0.35;
  }
  if (/\bwhat\s+to\s+(eat|order|try|watch|do|visit|book)\b/.test(m)) scores.recommendation += 0.34;

  // --- Execution features ---
  if (/\b(order|book|reserve|buy|purchase|checkout|pay\s+for|place\s+an?\s+order)\b/.test(m)) {
    scores.execution += 0.44;
  }
  if (/\b(add|remove)\b.+\b(cart|order|bag)\b/.test(m)) scores.execution += 0.4;
  if (/\b(cancel|confirm)\s+(the\s+)?(order|booking|reservation|payment)\b/.test(m)) {
    scores.execution += 0.36;
  }
  if (/\b(this|that)\s+(flight|hotel|restaurant|dish|item|one|option)\b/.test(m) && scores.execution > 0) {
    scores.execution += 0.18;
  }
  if (/\b(order|book|reserve|buy)\s+\w+/.test(m) && scores.recommendation < 0.25) {
    scores.execution += 0.12;
  }

  // --- Ambiguous need-state (no clear ask for ideas or action) ---
  if (/\b(i'?m|i\s+am)\s+(hungry|starving|famished|bored|tired|craving)\b/.test(m)) {
    scores.ambiguous += 0.48;
  }
  if (/\bi\s+want\s+to\s+go\s+somewhere\b/.test(m) && scores.recommendation < 0.3) {
    scores.ambiguous += 0.46;
  }
  if (/\b(craving|in\s+the\s+mood\s+for|feel\s+like)\b/.test(m) && scores.recommendation < 0.3) {
    scores.ambiguous += 0.36;
  }
  if (/\bwant\s+something\s+to\s+eat\b/.test(m) && scores.recommendation < 0.3 && scores.execution < 0.3) {
    scores.ambiguous += 0.4;
  }

  // --- Conversational / knowledge / coding ---
  if (
    /\b(code|function|typescript|javascript|python|bug|error|stack\s*trace|refactor|implement|debug)\b/.test(
      m
    )
  ) {
    scores.conversational += 0.5;
    scores.recommendation *= 0.2;
    scores.execution *= 0.25;
    scores.ambiguous *= 0.2;
  }
  if (/\b(what\s+is|who\s+is|explain|how\s+does|define|meaning\s+of)\b/.test(m) && scores.execution < 0.3) {
    scores.conversational += 0.35;
  }
  if (
    /^\s*(hi|hello|hey|thanks|thank\s+you|ok|okay|cool|nice|how\s+are\s+you)\b/.test(m)
  ) {
    scores.conversational += 0.35;
  } else if (
    m.split(/\s+/).length <= 3 &&
    scores.recommendation < 0.25 &&
    scores.execution < 0.25 &&
    scores.ambiguous < 0.25
  ) {
    scores.conversational += 0.35;
  }

  // Hybrid: clear ask to choose AND act
  if (scores.recommendation >= 0.32 && scores.execution >= 0.32) {
    scores.hybrid = clamp01((scores.recommendation + scores.execution) / 2 + 0.18);
  }
  if (/\b(suggest|recommend|pick).{0,40}\b(and\s+)?(order|book|buy|reserve)\b/.test(m)) {
    scores.hybrid = Math.max(scores.hybrid, 0.72);
  }

  const actionPeak = Math.max(scores.recommendation, scores.execution, scores.hybrid, scores.ambiguous);
  if (actionPeak < 0.28) {
    scores.conversational += 0.4;
  }

  if (scores.recommendation >= 0.4) scores.ambiguous *= 0.35;
  if (scores.execution >= 0.45 && scores.recommendation < 0.25) scores.ambiguous *= 0.3;

  return scores;
}

function pickFromScores(scores: IntentScores): {
  kind: MemoryIntentKind;
  confidence: number;
  reason: string;
} {
  const ranked = (Object.entries(scores) as Array<[MemoryIntentKind, number]>).sort(
    (a, b) => b[1] - a[1]
  );
  const [topKind, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = topScore - secondScore;

  if (
    margin < 0.12 &&
    ((topKind === "recommendation" && ranked[1]?.[0] === "execution") ||
      (topKind === "execution" && ranked[1]?.[0] === "recommendation"))
  ) {
    return {
      kind: "hybrid",
      confidence: clamp01((topScore + secondScore) / 2),
      reason: "Close mix of suggestion and action signals",
    };
  }

  if (margin < 0.1 && (topKind === "ambiguous" || ranked[1]?.[0] === "ambiguous") && topScore < 0.55) {
    return {
      kind: "ambiguous",
      confidence: clamp01(topScore),
      reason: "Need-state without a clear ask for ideas or action",
    };
  }

  return {
    kind: topKind,
    confidence: clamp01(topScore),
    reason: `Top signal "${topKind}" (${topScore.toFixed(2)}, margin ${margin.toFixed(2)})`,
  };
}

export function classifyMemoryIntentHeuristic(
  message: string,
  opts?: { domainHint?: string }
): MemoryIntent {
  const scores = scoreMemoryIntent(message);
  const picked = pickFromScores(scores);
  const domain = detectRecommendationDomain(message, opts?.domainHint);

  return {
    kind: picked.kind,
    domain,
    confidence: picked.confidence,
    reason: picked.reason,
    source: "heuristic",
    needsClarification: picked.kind === "ambiguous",
  };
}

export function usesPreferenceMemory(intent: MemoryIntent): boolean {
  return intent.kind === "recommendation" || intent.kind === "hybrid";
}

export function usesSafetyMemory(intent: MemoryIntent): boolean {
  return intent.kind === "execution" || intent.kind === "hybrid";
}

export function wantsLiveRecommendationTools(intent: MemoryIntent): boolean {
  return intent.kind === "recommendation" || intent.kind === "hybrid";
}
