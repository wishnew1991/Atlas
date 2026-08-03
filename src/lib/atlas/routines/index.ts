import "server-only";

import { routineRegistry } from "@/lib/atlas/routines/registry";
import { routineStore, type SaveRoutineInput } from "@/lib/atlas/routines/store";
import type { RoutineRunResult, RoutineRunner } from "@/lib/atlas/routines/types";
import { foodRoutineRunner } from "@/lib/atlas/routines/food-routine";
import { fingerprintOf, type ActionEntity } from "@/lib/atlas/routines/learning";

let registered = false;
function ensureRunners() {
  if (registered) return;
  routineRegistry.registerRunner(foodRoutineRunner);
  registered = true;
}

/**
 * Routines — how Atlas learns a user's habits without being told.
 *
 * Three paths:
 *  1. Explicit: user says "remember this as my usual" → saveNow() persists at once.
 *  2. Silent: each time the behavior repeats, observe() bumps the count/confidence
 *     and says nothing.
 *  3. Timed ask: once confidence is high enough, observe() returns a gentle
 *     one-time question. accept() persists it; decline() marks it "never again"
 *     for that same signature.
 */
export const routines = {
  register(runner: RoutineRunner): void {
    ensureRunners();
    routineRegistry.registerRunner(runner);
  },

  /** Persist a routine immediately (explicit request, or after the user accepts). */
  async save(userId: string, input: SaveRoutineInput) {
    ensureRunners();
    return routineStore.save(userId, input);
  },

  /**
   * Replay a saved routine by its label and return the prepared result.
   * (This is the "order my usual" invocation path.)
   */
  async run(userId: string, domain: string, label: string): Promise<RoutineRunResult> {
    ensureRunners();
    const record = await routineStore.findByLabel(userId, domain, label);
    if (!record) {
      return {
        message: `I don't have a saved "${label}" routine for you yet. I'll learn it over time as you repeat things.`,
        awaitingUser: false,
      };
    }
    return routineRegistry.run(userId, domain, record.payload, { label: record.label });
  },

  /**
   * Silent observation. Returns a suggestion message ONLY once the same
   * behavior has been observed enough that remembering would clearly help.
   * The caller surfaces that message to the user; nothing is persisted as a
   * routine until they say yes.
   */
  async observe(
    userId: string,
    opts: { domain: string; payload: unknown; summary?: string; entities?: ActionEntity[] }
  ) {
    ensureRunners();
    const { record, suggest } = await routineStore.observe(userId, {
      domain: opts.domain,
      payload: opts.payload,
      summary: opts.summary,
      entities: opts.entities,
    });

    if (!suggest) {
      // Quietly learning — no output.
      return { observationId: record.id, suggested: false };
    }

    await routineStore.markSuggested(userId, record.id);
    return {
      observationId: record.id,
      suggested: true,
      message: `I've noticed you usually ${record.summary || "do this"}. Would you like me to remember it as your regular ${
        record.domain === "food" ? "order" : "routine"
      }?`,
    };
  },

  /**
   * The user said yes to a discovered routine. Persists it so `run` can replay it.
   */
  async accept(userId: string, observationId: string): Promise<{ label: string } | null> {
    const obs = await routineStore.findObservation(userId, observationId);
    if (!obs) return null;

    const label = routineLabel(obs.domain, obs.payload, obs.summary);
    await routineStore.save(userId, {
      domain: obs.domain,
      label,
      payload: obs.payload,
      summary: obs.summary,
    });
    await routineStore.acceptObservation(userId, observationId).catch(() => {});
    return { label };
  },

  /**
   * The user said no. We honor "don't ask again unless the behavior changes
   * significantly" — a new signature is a new observation.
   */
  async decline(userId: string, observationId: string): Promise<void> {
    await routineStore.declareDeclined(userId, observationId);
  },

  /**
   * Single entry point for a Yes/No decision on a naturally-discovered routine.
   * Returns natural, conversational copy shared by the LLM tool and the chat UI.
   * Accept persists the routine; decline honors "never ask again" for that
   * signature. Returns the acknowledgment string to surface to the user.
   */
  async decide(
    userId: string,
    observationId: string,
    accept: boolean
  ): Promise<{ message: string; label?: string }> {
    const obs = await routineStore.findObservation(userId, observationId);
    if (!obs) {
      return { message: "That routine is no longer pending." };
    }

    if (!accept) {
      await routineStore.declareDeclined(userId, observationId);
      return {
        message: obs.domain === "food" ? "No problem — I won't bring that up again." : "Noted — I'll leave that one alone.",
      };
    }

    const created = await routines.accept(userId, observationId);
    if (!created) {
      return { message: "That routine is no longer pending." };
    }
    return {
      label: created.label,
      message: `Got it. Next time you can simply say "order my usual."`,
    };
  },

  /** List a user's saved routines (for Profile viewing / management). */
  async list(userId: string) {
    ensureRunners();
    return routineStore.list(userId);
  },

  async remove(userId: string, id: string) {
    ensureRunners();
    return routineStore.archive(userId, id);
  },
};

function routineLabel(domain: string, payload: unknown, summary: string): string {
  if (domain === "food" && payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const dish = typeof p.dish === "string" ? p.dish : "";
    const restaurant = typeof p.restaurant === "string" ? p.restaurant : "";
    if (dish) return restaurant ? `usual ${dish} from ${restaurant}` : `usual ${dish}`;
  }
  return `my regular ${domain}`;
}

export function fingerprintOfPayload(payload: unknown): string {
  return fingerprintOf(payload);
}

export type { RoutineRunResult } from "@/lib/atlas/routines/types";