import "server-only";

import { chat, type LlmMessage, type LlmProvider } from "@/lib/atlas/llm";
import { memoryService, MEMORY_TYPES, type MemoryType } from "@/lib/atlas/memory/service";
import {
  classifyMemoryIntent,
  classifyMemoryIntentHeuristic,
  type MemoryIntent,
} from "@/lib/atlas/intent/memory-intent";
import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";

type ActiveModel = {
  id: string;
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
};

export type MemoryRecallMode = "recommendation" | "safety" | "clarify" | "none";

/** @deprecated Use MemoryRecallMode — kept as alias for older call sites */
export type LegacySuggestionMode = "suggestion" | "safety" | "none";

export type MemoryRecallResult = {
  mode: MemoryRecallMode;
  lines: string[];
  intent: MemoryIntent;
};

export {
  classifyMemoryIntent,
  classifyMemoryIntentHeuristic,
  wantsLiveRecommendationTools,
  usesPreferenceMemory,
  usesSafetyMemory,
} from "@/lib/atlas/intent/memory-intent";
export type { MemoryIntent, MemoryIntentKind } from "@/lib/atlas/intent/memory-intent";

/** Keyword helper retained for tests / callers; prefer classifyMemoryIntent. */
export function wantsSuggestion(message: string): boolean {
  const intent = classifyMemoryIntentHeuristic(message);
  return intent.kind === "recommendation" || intent.kind === "hybrid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const SAFETY_RELATIONS = [
  "allergic_to",
  "diet",
  "budget",
  "accessibility",
  "spending_limit",
  "avoids",
  "cannot_eat",
  "visa",
  "visa_requirement",
  "requires_visa",
  "medical",
  "takes_medication",
  "has_condition",
];

const PREFERENCE_RELATIONS_EXCLUDE = new Set(SAFETY_RELATIONS);

function isSafetyLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("allergic") ||
    lower.includes("allergy") ||
    lower.includes("[health]") ||
    lower.includes("allergic_to") ||
    lower.includes("intoleran") ||
    lower.includes("cannot eat") ||
    lower.includes("can't eat") ||
    lower.includes("do not eat") ||
    lower.includes("don't eat") ||
    lower.includes("accessibility") ||
    lower.includes("spending_limit") ||
    lower.includes("budget") ||
    lower.includes("visa") ||
    lower.includes("medical") ||
    lower.includes("has_condition") ||
    lower.includes("takes_medication") ||
    /\b\[instruction\]\b/.test(lower) ||
    /\b\[constraint\]\b/.test(lower) ||
    /\bdiet\b/.test(lower)
  );
}

function looksLikeOneOffExecution(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  const intent = classifyMemoryIntentHeuristic(m);
  if (intent.kind !== "execution") return false;
  // Explicit lasting preference language is not a one-off
  if (/\b(always|favorite|favourite|prefer|i love|i hate|i'm allergic|i am allergic|never eat)\b/.test(m)) {
    return false;
  }
  return /\b(order|book|reserve|buy|add)\b/.test(m);
}

function looksLikeExplicitPreference(message: string): boolean {
  return /\b(always|favorite|favourite|i (?:really )?prefer|i love|i hate|i'm allergic|i am allergic|from now on|remember that)\b/i.test(
    message
  );
}

/**
 * Safety / hard constraints only — allergies, diet, budget, accessibility,
 * visa, medical, spending limits, standing instructions.
 */
export async function retrieveSafetyMemories(
  userId: string,
  message: string,
  category: string
): Promise<string[]> {
  if (userId === "atlas-demo-user") return [];

  const lines: string[] = [];

  try {
    const graph = await memoryService.queryGraph(userId, {
      relation: SAFETY_RELATIONS,
      limit: 16,
    });
    for (const rel of graph) {
      lines.push(`[constraint] ${rel.subject.name} --${rel.relation}--> ${rel.object.name}`);
    }
  } catch {
    /* graph optional */
  }

  // Also catch health/finance/instruction memories via semantic recall, then filter.
  try {
    const semantic = await memoryService.recall(userId, message, {
      category,
      types: ["health", "instruction", "finance", "travel"],
      limit: 8,
    });
    for (const m of semantic) {
      const line = `[${m.type}|conf=${m.confidence.toFixed(2)}] ${m.text}`;
      if (isSafetyLine(line) && !lines.includes(line)) lines.push(line);
    }
  } catch {
    /* semantic optional */
  }

  return lines;
}

/** Minimum confidence for a preference to influence recommendations. */
export const PREFERENCE_RECALL_MIN_CONFIDENCE = 0.45;

/**
 * Domain preference / habit memory only — excludes safety constraints.
 * Low-confidence one-offs are included but tagged so the recommendation engine
 * can ignore them as long-term favorites.
 */
export async function retrievePreferenceMemories(
  userId: string,
  message: string,
  category: string
): Promise<string[]> {
  if (userId === "atlas-demo-user") return [];

  const lines: string[] = [];
  const { graph, semantic } = await memoryService.reason(userId, message, {
    category,
    limit: 10,
  });

  for (const rel of graph) {
    if (PREFERENCE_RELATIONS_EXCLUDE.has(rel.relation)) continue;
    if (/(allerg|visa|accessib|spending|budget|diet|medical|medication|condition)/i.test(rel.relation)) {
      continue;
    }
    lines.push(
      `[graph|str=${rel.strength.toFixed(2)}] ${rel.subject.name} --${rel.relation}--> ${rel.object.name}`
    );
  }

  for (const m of semantic) {
    if (m.type === "health" || m.type === "instruction") continue;
    const line = `[${m.type}|conf=${m.confidence.toFixed(2)}] ${m.text}`;
    if (isSafetyLine(line)) continue;
    // Keep weak signals visible but marked.
    if (m.confidence < PREFERENCE_RECALL_MIN_CONFIDENCE) {
      lines.push(`[weak|conf=${m.confidence.toFixed(2)}] ${m.text}`);
    } else {
      lines.push(line);
    }
  }

  return lines;
}

/**
 * Compose recall from an already-classified intent (no re-classification).
 * Prefer calling retrieveSafetyMemories / retrievePreferenceMemories from pipeline steps.
 */
export async function retrieveMemoriesForTurn(
  userId: string,
  message: string,
  category: string,
  opts?: {
    history?: AtlasChatHistoryItem[];
    model?: ActiveModel | null;
    intent?: MemoryIntent;
  }
): Promise<MemoryRecallResult> {
  const intent =
    opts?.intent ??
    (await classifyMemoryIntent({
      message,
      history: opts?.history,
      domainHint: category,
      model: opts?.model,
    }));

  if (userId === "atlas-demo-user") {
    return { mode: intent.needsClarification ? "clarify" : "none", lines: [], intent };
  }

  if (intent.kind === "ambiguous" || intent.needsClarification) {
    return { mode: "clarify", lines: [], intent };
  }

  if (intent.kind === "conversational") {
    return { mode: "none", lines: [], intent };
  }

  if (intent.kind === "recommendation") {
    const lines = await retrievePreferenceMemories(userId, message, category || intent.domain);
    return { mode: "recommendation", lines, intent };
  }

  if (intent.kind === "execution") {
    const lines = await retrieveSafetyMemories(userId, message, category || intent.domain);
    return { mode: lines.length ? "safety" : "none", lines, intent };
  }

  // hybrid
  const [prefs, safety] = await Promise.all([
    retrievePreferenceMemories(userId, message, category || intent.domain),
    retrieveSafetyMemories(userId, message, category || intent.domain),
  ]);
  const merged = [...safety];
  for (const line of prefs) {
    if (!merged.includes(line)) merged.push(line);
  }
  return { mode: "recommendation", lines: merged, intent };
}

/**
 * Memory retrieval — graph facts + semantic recall, limited to relevant lines.
 */
export async function retrieveMemories(userId: string, message: string, category: string): Promise<string[]> {
  if (userId === "atlas-demo-user") return [];

  const { graph, semantic } = await memoryService.reason(userId, message, { category, limit: 6 });
  const lines: string[] = [];

  for (const rel of graph) {
    lines.push(`[graph] ${rel.subject.name} --${rel.relation}--> ${rel.object.name} (strength ${rel.strength.toFixed(2)})`);
  }
  for (const m of semantic) {
    lines.push(`[${m.type}|conf=${m.confidence.toFixed(2)}] ${m.text}`);
  }
  return lines;
}

/**
 * Best-effort memory extraction after a reply. Confidence-aware:
 * one-off orders do not replace long-standing preferences.
 */
export async function extractAndStoreMemories(
  userId: string,
  userMessage: string,
  assistantReply: string,
  model: ActiveModel
) {
  if (userId === "atlas-demo-user") return;

  const oneOff = looksLikeOneOffExecution(userMessage);
  const explicitPref = looksLikeExplicitPreference(userMessage);

  const extractPrompt: LlmMessage[] = [
    {
      role: "system",
      content:
        "Extract durable long-term facts about the user from this conversation turn. " +
        "For each fact emit a JSON object with: " +
        "text (short phrase), type (one of: identity, preference, relationship, goal, project, habit, health, travel, food, work, finance, event, instruction, knowledge), " +
        "temporary (boolean — true for short-lived context like 'visiting Paris next week' or a one-off order, false for permanent facts), " +
        "expiresInHours (if temporary, roughly how many hours; else omit), " +
        "confidence (0-1; use >=0.75 only for explicit lasting preferences or repeated habits; use ~0.35 for one-off orders/bookings), " +
        "graph (optional, when the fact is a relationship): { subject (usually 'user'), relation (verb like prefers, works_at, travels_to, likes, dislikes, allergic_to, lives_in, no_longer_prefers, budget, accessibility, spending_limit), object (the entity), operation (one of: create, replace, append, remove, strengthen, weaken, archive) }. " +
        "PREFERENCE RULES: " +
        "1) Explicit lasting prefs ('I love biryani', 'my favorite is Hyatt', 'I'm vegetarian') → preference, temporary:false, high confidence, replace/strengthen OK. " +
        "2) One-off execution ('order pasta', 'book this flight') → type event or food/travel, temporary:true, low confidence (~0.35). Do NOT use operation 'replace'. Prefer omit graph or 'strengthen' only if reinforcing an existing like. " +
        "3) Never overwrite a long-standing preference with a contradictory one-off action. " +
        "INSTRUCTIONS: if the user states how they want Atlas to behave, use type 'instruction'. " +
        "Do NOT save greetings, jokes, one-off chit-chat, or generic questions. " +
        "Respond with a JSON array of such objects (max 5). If nothing is worth saving, respond with []." +
        (oneOff
          ? " CONTEXT: this turn looks like a one-off execution — bias toward temporary low-confidence events, not preference replace."
          : "") +
        (explicitPref ? " CONTEXT: user stated an explicit lasting preference — allow high confidence." : ""),
    },
    { role: "user", content: `User: ${userMessage}\nAssistant: ${assistantReply}` },
  ];

  try {
    const result = await chat({
      model: model.id,
      provider: model.provider,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      messages: extractPrompt,
      toolChoice: "none",
      temperature: 0.2,
    });

    const content = (result.content || "").trim();
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return;

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return;

    for (const entry of parsed.slice(0, 5)) {
      if (!isRecord(entry)) continue;
      let text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (!text) continue;

      let type =
        typeof entry.type === "string" && (MEMORY_TYPES as string[]).includes(entry.type)
          ? (entry.type as MemoryType)
          : "knowledge";
      let temporary = entry.temporary === true;
      let expiresInHours = typeof entry.expiresInHours === "number" ? entry.expiresInHours : undefined;
      let confidence =
        typeof entry.confidence === "number" ? Math.max(0, Math.min(1, entry.confidence)) : 0.55;

      // Hard guard: one-off executions never land as high-confidence preferences.
      if (oneOff && (type === "preference" || type === "habit")) {
        type = type === "habit" ? "event" : "food";
        temporary = true;
        expiresInHours = expiresInHours ?? 24 * 14;
        confidence = Math.min(confidence, 0.4);
      }
      if (explicitPref && (type === "preference" || type === "food" || type === "travel" || type === "health")) {
        temporary = false;
        expiresInHours = undefined;
        confidence = Math.max(confidence, 0.75);
      }

      if (isRecord(entry.graph)) {
        const g = entry.graph as Record<string, unknown>;
        const subject = typeof g.subject === "string" ? g.subject : "user";
        const relation = typeof g.relation === "string" ? g.relation : "";
        const object = typeof g.object === "string" ? g.object : "";
        let operation =
          typeof g.operation === "string"
            ? (g.operation as "create" | "replace" | "append" | "remove" | "strengthen" | "weaken" | "archive")
            : "create";

        // Never replace long-term graph prefs on a one-off order.
        if (oneOff && operation === "replace") {
          operation = "strengthen";
        }
        if (oneOff && (relation === "prefers" || relation === "likes") && operation === "create") {
          // Episodic strengthen/create at low strength path via strengthen
          operation = "strengthen";
        }

        if (relation && object) {
          await memoryService.applyRelationOperation(userId, operation, {
            subject,
            relation,
            object,
            subjectKind: "user",
            objectKind: typeof g.objectKind === "string" ? g.objectKind : undefined,
          });
        }
      }

      const existing = await memoryService.recall(userId, text, { types: [type], limit: 3 });
      const duplicate = existing.find((m) => m.score > 0.82);

      if (duplicate) {
        // Repeated evidence strengthens; one-off evidence barely moves high-confidence prefs.
        const nextConfidence = oneOff
          ? Math.min(1, (duplicate.confidence ?? 0.5) + 0.05)
          : Math.min(1, (duplicate.confidence ?? 0.5) + (explicitPref ? 0.2 : 0.12));
        await memoryService.update(duplicate.id, {
          text: explicitPref ? text : duplicate.text,
          confidence: nextConfidence,
          type,
          status: "active",
        });
        continue;
      }

      await memoryService.remember(userId, text, {
        kind: type === "knowledge" ? "knowledge" : "user",
        type,
        importance: type === "instruction" || type === "health" ? 0.85 : explicitPref ? 0.75 : 0.55,
        confidence,
        expiresInHours: temporary ? (expiresInHours ?? 24 * 7) : undefined,
      });
    }
  } catch {
    /* memory extraction is best-effort */
  }
}
