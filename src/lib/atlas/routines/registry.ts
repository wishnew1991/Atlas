import "server-only";

import type { RoutineRunner, RoutineRunResult } from "@/lib/atlas/routines/types";

const runners = new Map<string, RoutineRunner>();

/**
 * Registry + thin dispatch. A domain wires in by calling `registerRunner` once
 * (e.g. at module load / first use). This file stays small on purpose — it is
 * not an automation engine, just a lookup.
 */
export function resetRunners(): void {
  runners.clear();
}

export const routineRegistry = {
  registerRunner(runner: RoutineRunner): void {
    runners.set(runner.domain, runner);
  },

  getRunner(domain: string): RoutineRunner | undefined {
    return runners.get(domain);
  },

  has(domain: string): boolean {
    return runners.has(domain);
  },

  async run(
    userId: string,
    domain: string,
    payload: unknown,
    opts?: { label?: string }
  ): Promise<RoutineRunResult> {
    const runner = runners.get(domain);
    if (!runner) {
      return {
        message: `I don't yet have a way to handle "${domain}" routines.`,
        awaitingUser: false,
      };
    }
    return runner.run(userId, payload, opts);
  },
};

export type { RoutineRunner, RoutineRunResult } from "@/lib/atlas/routines/types";