/**
 * Pure, testable learning + fingerprinting logic for Routines.
 * Kept free of server-only/Prisma imports so the offline test harness can load
 * them directly. No ML — Atlas earns confidence simply by noticing repetition.
 */

/** How many times a behavior must be observed before we consider suggesting it. */
export const OBSERVE_THRESHOLD = 3;

/** Build the confidence (0..1) from the number of times we've observed a behavior. */
export function confidenceForCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(0.9, 0.25 + 0.0825 * count);
}

/** True once the observed count is high enough that remembering would help. */
export function isWorthSuggesting(count: number): boolean {
  return count >= OBSERVE_THRESHOLD;
}

export type ObservationState = "observing" | "suggested" | "accepted" | "declined";

/**
 * Should we surface a suggestion to the user for this observation?
 * We ask only once, and never re-ask after the user declines the same signature.
 */
export function shouldSuggest(opts: {
  count: number;
  state: ObservationState;
  declinedEver: boolean;
}): boolean {
  if (opts.declinedEver) return false;
  if (opts.state === "accepted" || opts.state === "suggested") return false;
  return isWorthSuggesting(opts.count);
}

/**
 * Stable fingerprint for an observed behavior. Keys are sorted and values lowercased,
 * so deviating only in order/case still tallies the same behavior.
 */
export function fingerprintOf(payload: unknown): string {
  return normalize(payload);
}

function normalize(value: unknown): string {
  if (Array.isArray(value)) {
    const inner = value.map(normalize).filter(Boolean).sort();
    return `[${inner.join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = (Object.entries(value as Record<string, unknown>))
      .map(([key, v]) => `${key}:${normalize(v)}`)
      .filter((s) => !s.endsWith(":"))
      .sort();
    return `{${entries.join(",")}}`;
  }
  return String(value ?? "").trim().toLowerCase();
}

export interface LabeledAction {
  id: string;
  label: string;
}

/**
 * Identity anchor helper: a structured entity with a stable value.
 * `kind` coarsens the entity (e.g. "dish" vs "restaurant") so two bolts in
 * different domains don't collide; `type` is a fine-grained discriminator.
 */
export interface ActionEntity {
  type?: string;
  kind?: string;
  value: string;
}

/**
 * Entity-anchored fingerprint. When a caller supplies structured entities we
 * anchor identity on them (stable across formatting/quoting drift in the raw
 * payload) instead of the whole payload blob. Falls back to raw-payload
 * fingerprinting when no entities are present.
 */
export function fingerprintOfEntities(entities: ActionEntity[]): string {
  const parts = entities
    .map((e) => normalize(e.kind || e.type || "entity") + ":" + normalize(e.value))
    .filter((s) => s !== ":" && s.length > 1)
    .sort();
  return `entities[${parts.join(",")}]`;
}

/** Build a human label from structured entities (used for suggested routine copy). */
export function labelFromEntities(
  domain: string,
  entities: ActionEntity[],
  fallback: string
): string {
  const dish = entities.find((e) => (e.kind || e.type) === "dish")?.value;
  const restaurant = entities.find((e) => (e.kind || e.type) === "restaurant")?.value;
  if (dish) return restaurant ? `usual ${dish} from ${restaurant}` : `usual ${dish}`;
  return fallback;
}

/** Case-insensitive substring match of a query against a routine's label. */
export function matchesLabel(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.trim().toLowerCase());
}

const STOPWORDS = new Set([
  "a", "an", "the", "my", "your", "me", "i", "to", "for", "of", "on", "in",
  "and", "or", "booking", "book", "order", "get", "please", "can", "could",
  "would", "like", "want", "regular",
]);

/**
 * Choose the best stored routine for a query. Ranks by the number of significant
 * query tokens appearing in a label, preferring an exact match, then the
 * most-recently-saved action on ties.
 */
export function pickAction<T extends LabeledAction>(
  actions: T[],
  query: string | null | undefined
): T | null {
  const q = (query ?? "").trim().toLowerCase();
  if (q.length === 0) return actions[0] ?? null;

  const exact = actions.find((a) => a.label.toLowerCase() === q);
  if (exact) return exact;

  const tokens = q.split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));

  let best: T | null = null;
  let bestScore = 0;
  for (const action of actions) {
    const labelLower = action.label.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (labelLower.includes(token)) score += 1;
      if (labelLower === token) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}