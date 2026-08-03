import "server-only";

import type { AtlasPendingAction } from "@/lib/atlas/agent-contract";

/**
 * Routines — a domain-agnostic abstraction for user routines that Atlas learns
 * naturally rather than being configured.
 *
 * A Routine is a user habit ("order my usual", "book my regular ride") stored
 * under a `domain` whose registered `RoutineRunner` knows how to replay the
 * routine's payload and drive it to a prepared, approval-gated outcome. The
 * food flow is the first runner. Future domains (rides, groceries, hotels,
 * appointments) register their own runner with the same store and dispatch.
 */

export interface RoutineRunResult {
  /** Conversational reply shown to the user (also the tool result message). */
  message: string;
  /** Optional prepared action surfaced for explicit approval — never executed here. */
  action?: AtlasPendingAction;
  /** True when the runner needs the user to answer before it can finish. */
  awaitingUser?: boolean;
}

export interface RoutineRunner {
  /** Domain this runner owns, e.g. "food". */
  domain: string;
  /**
   * Replay a stored routine for a user. `payload` is the opaque, domain-specific
   * spec saved when the routine was captured. Must never finalize an
   * order/booking — at most it prepares one for approval.
   */
  run(userId: string, payload: unknown, opts?: { label?: string }): Promise<RoutineRunResult>;
}