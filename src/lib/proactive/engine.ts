/**
 * Proactive Context Engine — pipeline orchestrator.
 *
 * Trigger (worker cron OR lazy due-check) → gather → relevance/priority rules →
 * optional LLM composition → user-facing action (persisted brief).
 *
 * Invariants enforced here:
 *   - Admin is NOT special: eligibility follows the user's normal Proactive
 *     preferences (admins are ordinary users in the consumer app).
 *   - Demo/preview runs never persist and never surface synthetic items as real.
 *   - No candidates → no brief, no LLM call.
 *   - Duplicate prevention is concurrent-safe via the unique constraint.
 */

import "server-only";

import { demoCandidates, PROVIDERS } from "./providers";
import { readAdminDefaults, resolveEffectiveConfig, touchTriggerRun } from "./config";
import { composeDraft } from "./compose";
import { briefExistsForPeriod, persistBrief, type PersistBriefInput } from "./persist";
import { filterRelevant, validateCandidates } from "./rules";
import { TRIGGER_TYPE_DAILY, type BriefEvaluationResult, type CandidateItem, type ProactiveBriefDraft } from "./types";

export const TRIGGER_TYPE = TRIGGER_TYPE_DAILY;

/** Local date key "YYYY-MM-DD" used as the uniqueness period. */
export function periodKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface EvaluationOptions {
  triggerType?: string;
  now?: Date;
  /** Admin preview mode — uses demo fixtures, never persists. */
  demo?: boolean;
}

/**
 * Run one evaluation for a user. Returns the persisted brief (or preview for
 * demo). Never throws for "no items" / "disabled" — those returns reasons.
 */
export async function evaluateForUser(
  userId: string,
  opts: EvaluationOptions = {}
): Promise<BriefEvaluationResult> {
  const triggerType = opts.triggerType ?? TRIGGER_TYPE;
  const now = opts.now ?? new Date();
  const demo = opts.demo === true;

  // Demo/preview: deterministic fixtures only, never persisted, never delivered.
  if (demo) {
    const candidates = demoCandidates(now);
    validateCandidates(candidates);
    const relevant = filterRelevant(candidates, { maxItems: 5 });
    const draft = await composeDraft(relevant, { llmCompose: false });
    return {
      ok: true,
      preview: {
        title: draft.title,
        items: linkDraft(draft, relevant),
        synthetic: true,
      },
    };
  }

  const config = await resolveEffectiveConfig(userId, triggerType);
  if (!config.enabled) {
    return { ok: false, reason: "disabled" };
  }

  const period = periodKey(now);

  // Cheap sequential duplicate guard — the unique constraint is the authority
  // for concurrent races, but this avoids redundant gather/compose when the
  // brief for today already exists.
  if (await briefExistsForPeriod(userId, triggerType, period)) {
    return { ok: false, reason: "already_delivered" };
  }

  const providers = config.providers ?? Object.keys(PROVIDERS);
  const gathered = await Promise.all(
    providers.map(async (id) => (PROVIDERS[id] ? PROVIDERS[id](userId, now) : []))
  );
  const candidates = gathered.flat();

  // Hard invariant: every candidate must carry source + reason.
  validateCandidates(candidates);

  const relevant = filterRelevant(candidates, { minScore: 0, maxItems: config.maxItems });

  // No items → no brief, and no LLM call.
  if (relevant.length === 0) {
    return { ok: false, reason: "no_items" };
  }

  const draft = await composeDraft(relevant, { llmCompose: config.llmCompose });

  const { brief, created } = await persistBrief({
    userId,
    triggerType,
    period,
    title: draft.title,
    items: linkDraft(draft, relevant),
  });

  if (created) {
    await touchTriggerRun(userId, triggerType, now).catch(() => {});
  }

  return {
    ok: true,
    brief: {
      id: brief.id,
      userId: brief.userId,
      triggerType: brief.triggerType,
      period: brief.period,
      title: brief.title,
      items: brief.items,
      synthetic: brief.synthetic,
      deliveredAt: brief.deliveredAt.toISOString(),
      acknowledgedAt: brief.acknowledgedAt?.toISOString() ?? null,
    },
  };
}

/**
 * Lazy due-check for a scheduled trigger (mode "lazy"). Evaluates only when the
 * user is enabled and the trigger time for today has passed. Honest labelling:
 * this is a due-check on activity, not true proactive scheduling.
 */
export async function dueCheck(
  userId: string,
  opts: { triggerType?: string; now?: Date } = {}
): Promise<BriefEvaluationResult> {
  const triggerType = opts.triggerType ?? TRIGGER_TYPE;
  const now = opts.now ?? new Date();

  const config = await resolveEffectiveConfig(userId, triggerType);
  if (!config.enabled) return { ok: false, reason: "disabled" };

  const [hh, mm] = parseTime(config.triggerTime);
  const dueAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (now < dueAt) {
    return { ok: false, reason: "not_due" };
  }

  return evaluateForUser(userId, { triggerType, now });
}

function parseTime(value: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return [7, 0];
  return [Math.min(23, Math.max(0, Number(match[1]))), Math.min(59, Math.max(0, Number(match[2])))];
}

function linkDraft(
  draft: ProactiveBriefDraft,
  candidates: CandidateItem[]
): PersistBriefInput["items"] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return draft.items
    .map((entry) => {
      const item = byId.get(entry.itemId);
      return item ? { item, text: entry.text } : null;
    })
    .filter((entry): entry is { item: CandidateItem; text: string } => entry !== null);
}

export { readAdminDefaults } from "./config";