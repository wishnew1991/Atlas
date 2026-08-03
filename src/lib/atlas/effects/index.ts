import "server-only";

import { routines } from "@/lib/atlas/routines";
import type { ActionEntity } from "@/lib/atlas/routines/learning";
import type { AtlasActionDomain } from "@/lib/atlas/agent-contract";

/**
 * Generic Effect — the single, domain-agnostic signal that feeds the learning
 * subsystem. Any tool execution or completed action can emit one; the pattern
 * learner consumes it and decides whether a routine is emerging.
 *
 * This is intentionally NOT food-specific and NOT an event/queue system. It is
 * a thin, shared funnel from "something happened" to "does it form a routine?",
 * so a new MCP/tool participates in learning without writing any feature code.
 */
export interface EffectPayload {
  /** The acting tool or action, e.g. "food_set_address" / "food_order". */
  tool: string;
  /** High-level domain, so the learner can scope signatures & runners. */
  domain: string;
  /** The canonical, stable parts of what happened (fingerprinted for identity). */
  payload: unknown;
  /** Short human description of the behavior, e.g. "chicken biryani from Meghana". */
  summary?: string;
  /** Structured facts extracted about the effect (entities). Optional. */
  entities?: ActionEntity[];
  /** Any extra context (prices, ids, counts). Not used for identity. */
  metadata?: Record<string, unknown>;
  /** Whether the effect reflects a real, completed side effect (not just a search). */
  committed?: boolean;
}

export type EmitEffectResult =
  | { suggestion: { observationId: string; message: string } }
  | { suggestion: null };

/**
 * Emit an effect into the learning pipeline. All tool executions and completed
 * actions funnel through here; the pattern learner (routines) is the only
 * consumer. Returns a gentle suggestion only once confidence crosses its
 * threshold — the caller may surface that to the user.
 */
export async function emitEffect(
  userId: string,
  effect: EffectPayload
): Promise<EmitEffectResult> {
  if (!effect.domain || !effect.payload) {
    return { suggestion: null };
  }

  try {
    const observed = await routines.observe(userId, {
      domain: effect.domain,
      payload: effect.payload,
      summary: effect.summary,
      entities: effect.entities,
    });
    if (observed.suggested && observed.message) {
      return { suggestion: { observationId: observed.observationId, message: observed.message } };
    }
    return { suggestion: null };
  } catch {
    // Learning is best-effort and must never break the effecting tool or action.
    return { suggestion: null };
  }
}

/** Extract a stable observing identity from a payload's canonical keys. */
export function effectFingerprint(payload: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(payload)
      .sort()
      .map((k) => [k, payload[k]])
  );
}

/** Normalize a completed public action effect via a per-domain adapter. */
function actionEffect(domain: AtlasActionDomain, pending: unknown): EffectPayload | null {
  const normalize = ACTION_EFFECTS[domain];
  if (!normalize) return null;
  return normalize(pending);
}

// Domain adapters: turn a completed action into a normalized EffectPayload,
// so learning stays domain-agnostic and the adapter is the only seam to extend.
// A domain without an adapter simply doesn't feed routine learning — emission
// itself is always possible via the generic tool hook.
type ActionEffectAdapter = (pending: unknown) => EffectPayload | null;

export const ACTION_EFFECTS: Partial<Record<AtlasActionDomain, ActionEffectAdapter>> = {
  food: (pending: unknown) => {
    const intent = pending as {
      restaurantName?: string;
      items?: Array<{ name: string; quantity: number }>;
    };
    const dish = intent.items?.[0]?.name;
    if (!dish) return null;
    const restaurant = intent.restaurantName;
    const entities: ActionEntity[] = [{ kind: "dish", value: dish }];
    if (restaurant) entities.push({ kind: "restaurant", value: restaurant });
    return {
      tool: "food_order",
      domain: "food",
      payload: {
        dish,
        restaurant,
        items: intent.items?.map((line) => ({ name: line.name, quantity: line.quantity })) ?? [],
      },
      entities,
      summary: `${dish}${restaurant ? ` from ${restaurant}` : ""}`,
      committed: true,
    };
  },
};

export { actionEffect };

export type EmitCommittedDomainEffectResult = {
  suggestion: { observationId: string; message: string } | null;
};

/**
 * Bridge for the action-completion path: a domain adapter normalizes a
 * completed action (e.g. a placed order) into an EffectPayload, then emits it.
 * Returns the routine suggestion (if any) so the action handler can surface it.
 */
export async function emitCommittedDomainEffect(
  domain: AtlasActionDomain,
  pending: unknown,
  userId: string
): Promise<EmitCommittedDomainEffectResult> {
  const normalized = actionEffect(domain, pending);
  if (!normalized) return { suggestion: null };
  const emitted = await emitEffect(userId, normalized);
  return emitted.suggestion ? { suggestion: emitted.suggestion } : { suggestion: null };
}