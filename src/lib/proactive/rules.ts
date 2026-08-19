/**
 * Relevance / priority rules for the Proactive Context Engine.
 * Pure, deterministic, NO LLM. Any candidate excluded by user privacy settings
 * is dropped here so it can never reach composition or the LLM.
 */

import "server-only";

import type { CandidateItem } from "./types";

export interface RelevanceFilter {
  minScore?: number;
  maxItems?: number;
}

export function scoreCandidate(item: CandidateItem): number {
  const urgency = clamp01(item.urgency);
  const importance = clamp01(item.importance);
  const recency = clamp01(1 - (item.urgency - item.importance));
  // urgency 0.4, importance 0.3, recency 0.2, base 0.1
  const score = 0.4 * urgency + 0.3 * importance + 0.2 * recency + 0.1;
  return Math.min(1, Math.max(0, score));
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

/**
 * Drop privacy-sensitive candidates + apply score threshold and size cap.
 * Excluded privacy candidates are removed before composition so no copy ever
 * reaches the LLM. Deterministic ordering: score desc, then id asc.
 */
export function filterRelevant(
  candidates: CandidateItem[],
  opts: RelevanceFilter = {}
): CandidateItem[] {
  const { minScore = 0, maxItems = 5 } = opts;
  return candidates
    .filter((c) => !c.privacySensitive)
    .map((c) => ({ item: c, score: scoreCandidate(c) }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, maxItems)
    .map((entry) => entry.item);
}

/** True when the given candidate violates the "reason required" invariant. */
export function lacksReason(item: CandidateItem): boolean {
  return typeof item.reason !== "string" || item.reason.trim().length === 0;
}

/** Validation gate for candidates: every item must carry a source + reason. */
export function validateCandidates(candidates: CandidateItem[]): void {
  for (const item of candidates) {
    if (lacksReason(item)) {
      throw new Error(`Proactive candidate "${item.id}" is missing a required reason.`);
    }
    if (typeof item.source !== "string" || item.source.trim().length === 0) {
      throw new Error(`Proactive candidate "${item.id}" is missing a required source.`);
    }
  }
}