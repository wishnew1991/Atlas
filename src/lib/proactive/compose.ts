/**
 * Optional LLM composition for the Proactive Context Engine.
 *
 * Typed internal structure: { title, items: [{ itemId, text }] }. The model
 * output is parsed + validated; any parse/validation failure (or no model)
 * falls back to deterministic templated composition. Composed text is grounded
 * in the supplied candidates only — never invented.
 */

import "server-only";

import { chat } from "@/lib/atlas/llm";
import type { LlmMessage } from "@/lib/atlas/llm";
import { resolveActiveModel } from "@/lib/atlas/server/agent/reply";
import type { CandidateItem, ComposedBriefItem, ProactiveBriefDraft } from "./types";
import { scoreCandidate } from "./rules";

function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function isDraftShape(value: unknown): value is ProactiveBriefDraft {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.trim().length === 0) return false;
  if (!Array.isArray(obj.items)) return false;
  return obj.items.every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).itemId === "string" &&
      typeof (entry as Record<string, unknown>).text === "string" &&
      String((entry as Record<string, unknown>).itemId).trim().length > 0 &&
      String((entry as Record<string, unknown>).text).trim().length > 0
  );
}

/** Validate a model-produced draft against the grounded candidate set. */
export function validateDraft(draft: ProactiveBriefDraft, candidates: CandidateItem[]): boolean {
  if (!isDraftShape(draft)) return false;
  const ids = new Set(candidates.map((c) => c.id));
  return draft.items.every((item) => ids.has(item.itemId));
}

/** Deterministic fallback — used when no model, parse failure, or invalid draft. */
export function deterministicDraft(
  candidates: CandidateItem[],
  opts: { title?: string } = {}
): ProactiveBriefDraft {
  const sorted = [...candidates]
    .map((c) => ({ item: c, score: scoreCandidate(c) }))
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .map((entry) => entry.item);

  return {
    title: opts.title ?? "Your brief for today",
    items: sorted.map((item): ComposedBriefItem => {
      const body = item.body ? ` ${item.body}` : "";
      return { itemId: item.id, text: `${item.title}${body}` };
    }),
  };
}

/**
 * Compose a brief draft from candidates. Uses the LLM when enabled and a model
 * resolves; otherwise (or on parse/validation failure) deterministic fallback.
 */
export async function composeDraft(
  candidates: CandidateItem[],
  opts: {
    llmCompose?: boolean;
    title?: string;
  } = {}
): Promise<ProactiveBriefDraft> {
  if (opts.llmCompose && candidates.length > 0) {
    try {
      const model = await resolveActiveModel("general");
      if (model) {
        const listing = candidates
          .map(
            (c) =>
              `- id: ${c.id}\n  title: ${c.title}\n  body: ${c.body || "(none)"}\n  reason: ${c.reason}`
          )
          .join("\n");

        const system: LlmMessage = {
          role: "system",
          content:
            "You compose a short proactive brief from grounded candidates. " +
            "Reply with a single JSON object only: {\"title\": string, \"items\": [{\"itemId\": string, \"text\": string}]}. " +
            "itemId must reference an id from the given list. text is a one-line human-friendly summary of that item. " +
            "Never invent items, titles, or facts not present in the candidates.",
        };
        const user: LlmMessage = {
          role: "user",
          content: `Candidates:\n${listing}`,
        };

        const result = await chat({
          model: model.id,
          messages: [system, user],
          temperature: 0.4,
          maxTokens: 600,
          apiKey: model.apiKey,
          baseUrl: model.baseUrl,
          provider: model.provider,
        });

        const parsed = extractJson(result.content);
        const draft = parsed as ProactiveBriefDraft;
        if (validateDraft(draft, candidates)) {
          return Object.assign(draft, {
            items: draft.items.map((item) => ({
              itemId: item.itemId,
              text: item.text.trim(),
            })),
          });
        }
      }
    } catch {
      /* fall through to deterministic */
    }
  }

  return deterministicDraft(candidates, { title: opts.title });
}