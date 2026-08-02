import "server-only";

import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { chat, type LlmProvider } from "@/lib/atlas/llm";
import {
  classifyMemoryIntentHeuristic,
  detectRecommendationDomain,
  type MemoryIntent,
  type MemoryIntentKind,
  type RecommendationDomain,
} from "@/lib/atlas/intent/memory-intent-core";

export type {
  MemoryIntent,
  MemoryIntentKind,
  RecommendationDomain,
  IntentScores,
} from "@/lib/atlas/intent/memory-intent-core";

export {
  classifyMemoryIntentHeuristic,
  detectRecommendationDomain,
  scoreMemoryIntent,
  usesPreferenceMemory,
  usesSafetyMemory,
  wantsLiveRecommendationTools,
} from "@/lib/atlas/intent/memory-intent-core";

type ActiveModel = {
  id: string;
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Optional LLM refine when heuristics are uncertain. Falls back to heuristic on any failure.
 */
export async function classifyMemoryIntent(input: {
  message: string;
  history?: AtlasChatHistoryItem[];
  domainHint?: string;
  model?: ActiveModel | null;
}): Promise<MemoryIntent> {
  const heuristic = classifyMemoryIntentHeuristic(input.message, {
    domainHint: input.domainHint,
  });

  const shouldRefine = Boolean(input.model) && heuristic.confidence < 0.58;

  if (!shouldRefine || !input.model) {
    return heuristic;
  }

  const recent = (input.history ?? [])
    .slice(-4)
    .map((h) => `${h.role}: ${h.text}`)
    .join("\n");

  try {
    const result = await chat({
      model: input.model.id,
      provider: input.model.provider,
      apiKey: input.model.apiKey,
      baseUrl: input.model.baseUrl,
      temperature: 0.1,
      toolChoice: "none",
      messages: [
        {
          role: "system",
          content:
            "Classify the user's latest message for a personal assistant memory system. " +
            "Respond with ONLY a JSON object: " +
            '{"kind":"conversational"|"recommendation"|"execution"|"hybrid"|"ambiguous","domain":"food"|"travel"|"shopping"|"entertainment"|"rides"|"general","confidence":0-1,"reason":"short","needsClarification":boolean}. ' +
            "Definitions: " +
            "conversational = chat, facts, coding, no personalization needed; " +
            "recommendation = user asks Atlas to suggest/choose/explore options; " +
            "execution = user wants a specific action done (order/book/buy this); " +
            "hybrid = wants suggestions AND then to act; " +
            "ambiguous = need-state like 'I'm hungry' without asking for ideas or a direct order — set needsClarification true.",
        },
        {
          role: "user",
          content: `Recent context:\n${recent || "(none)"}\n\nLatest message: ${input.message}\nHeuristic guess: ${heuristic.kind} (${heuristic.confidence.toFixed(2)}) — ${heuristic.reason}`,
        },
      ],
    });

    const raw = (result.content || "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return heuristic;

    const parsed = JSON.parse(match[0]) as unknown;
    if (!isRecord(parsed)) return heuristic;

    const kinds: MemoryIntentKind[] = [
      "conversational",
      "recommendation",
      "execution",
      "hybrid",
      "ambiguous",
    ];
    const kind =
      typeof parsed.kind === "string" && kinds.includes(parsed.kind as MemoryIntentKind)
        ? (parsed.kind as MemoryIntentKind)
        : heuristic.kind;
    const domains: RecommendationDomain[] = [
      "food",
      "travel",
      "shopping",
      "entertainment",
      "rides",
      "general",
    ];
    const domain =
      typeof parsed.domain === "string" && domains.includes(parsed.domain as RecommendationDomain)
        ? (parsed.domain as RecommendationDomain)
        : detectRecommendationDomain(input.message, input.domainHint);

    return {
      kind,
      domain,
      confidence: typeof parsed.confidence === "number" ? clamp01(parsed.confidence) : heuristic.confidence,
      reason: typeof parsed.reason === "string" ? parsed.reason : heuristic.reason,
      source: "llm",
      needsClarification: kind === "ambiguous" || parsed.needsClarification === true,
    };
  } catch {
    return heuristic;
  }
}
