import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import {
  confidenceForCount,
  fingerprintOf,
  fingerprintOfEntities,
  pickAction,
  shouldSuggest,
  type ObservationState,
  type ActionEntity,
} from "@/lib/atlas/routines/learning";

/** A saved user routine Atlas can replay. Domain-agnostic by design. */
export interface RoutineRecord {
  id: string;
  userId: string;
  domain: string;
  label: string;
  payload: unknown;
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveRoutineInput {
  domain: string;
  label: string;
  payload?: unknown;
  summary?: string;
}

export interface ObservationRecord {
  id: string;
  userId: string;
  domain: string;
  fingerprint: string;
  summary: string;
  count: number;
  confidence: number;
  state: ObservationState;
  declinedEver: boolean;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

type RowBase = {
  id: string;
  userId: string;
  domain: string;
  payloadJson: string;
};

type RoutineRow = RowBase & {
  label: string;
  summary: string;
  createdAt: Date;
  updatedAt: Date;
};

type ObservationRow = RowBase & {
  fingerprint: string;
  summary: string;
  count: number;
  confidence: number;
  state: string;
  declinedEver: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toRoutine(row: RoutineRow): RoutineRecord {
  return {
    id: row.id,
    userId: row.userId,
    domain: row.domain,
    label: row.label,
    payload: parsePayload(row.payloadJson),
    summary: row.summary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toObservation(row: ObservationRow): ObservationRecord {
  return {
    id: row.id,
    userId: row.userId,
    domain: row.domain,
    fingerprint: row.fingerprint,
    summary: row.summary,
    count: row.count,
    confidence: row.confidence,
    state: row.state as ObservationState,
    declinedEver: row.declinedEver,
    payload: parsePayload(row.payloadJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Store layer for Routines + their observations. Cheap, generic persistence —
 * no embeddings; fought lookup by label/fingerprint, not similarity.
 */
export const routineStore = {
  async save(userId: string, input: SaveRoutineInput): Promise<RoutineRecord> {
    const row = await prisma.routine.upsert({
      where: { userId_domain_label: { userId, domain: input.domain, label: input.label } },
      create: {
        userId,
        domain: input.domain,
        label: input.label,
        payloadJson: JSON.stringify(input.payload ?? {}),
        summary: input.summary ?? "",
        status: "active",
      },
      update: {
        payloadJson: JSON.stringify(input.payload ?? {}),
        summary: input.summary ?? "",
        status: "active",
      },
    });
    return toRoutine(row as RoutineRow);
  },

  /** Fetch a routine by its label (e.g. "my usual"). Scoped to active. */
  async findByLabel(userId: string, domain: string, label: string): Promise<RoutineRecord | null> {
    const rows = await prisma.routine.findMany({
      where: { userId, domain, status: "active" },
      orderBy: { updatedAt: "desc" },
    });
    const match = pickAction(rows as RoutineRow[], label);
    return match ? toRoutine(match) : null;
  },

  async list(userId: string): Promise<RoutineRecord[]> {
    const rows = await prisma.routine.findMany({
      where: { userId, status: "active" },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => toRoutine(row as RoutineRow));
  },

  async archive(userId: string, id: string): Promise<void> {
    await prisma.routine.updateMany({ where: { userId, id }, data: { status: "archived" } });
  },

  // ----- observations (natural learning) -----

  /**
   * Record one instance of a behavior. Bumps the count, recomputes confidence,
   * and returns whether we should now gently suggest remembering it.
   */
  async observe(
    userId: string,
    opts: {
      domain: string;
      payload: unknown;
      summary?: string;
      entities?: ActionEntity[];
      fingerprint?: string;
    }
  ): Promise<{ record: ObservationRecord; suggest: boolean }> {
    const fingerprint =
      opts.fingerprint ??
      (opts.entities?.length ? fingerprintOfEntities(opts.entities) : fingerprintOf(opts.payload));
    const existing = await prisma.routineObservation.findUnique({
      where: { userId_domain_fingerprint: { userId, domain: opts.domain, fingerprint } },
    });

    const count = (existing?.count ?? 0) + 1;
    const confidence = confidenceForCount(count);

    const row = await prisma.routineObservation.upsert({
      where: { userId_domain_fingerprint: { userId, domain: opts.domain, fingerprint } },
      create: {
        userId,
        domain: opts.domain,
        fingerprint,
        summary: opts.summary ?? "",
        count,
        confidence,
        state: "observing",
        payloadJson: JSON.stringify(opts.payload ?? {}),
      },
      update: {
        count,
        confidence,
        summary: opts.summary ?? "",
        updatedAt: new Date(),
      },
    });

    const record = toObservation(row as ObservationRow);
    const suggest = shouldSuggest({
      count: record.count,
      state: record.state,
      declinedEver: record.declinedEver,
    });
    return { record, suggest };
  },

  /** Mark an observation as asked; persist its current state. */
  async markSuggested(userId: string, id: string): Promise<void> {
    await prisma.routineObservation.updateMany({
      where: { userId, id },
      data: { state: "suggested", updatedAt: new Date() },
    });
  },

  /** Record that the user declined this signature — never suggest again. */
  async declareDeclined(userId: string, id: string): Promise<void> {
    await prisma.routineObservation.updateMany({
      where: { userId, id },
      data: { state: "declined", declinedEver: true, updatedAt: new Date() },
    });
  },

  async acceptObservation(userId: string, id: string): Promise<ObservationRecord | null> {
    await prisma.routineObservation.updateMany({
      where: { userId, id },
      data: { state: "accepted", updatedAt: new Date() },
    });
    const row = await prisma.routineObservation.findFirst({ where: { userId, id } });
    return row ? toObservation(row as ObservationRow) : null;
  },

  async findObservation(userId: string, id: string): Promise<ObservationRecord | null> {
    const row = await prisma.routineObservation.findFirst({ where: { userId, id } });
    return row ? toObservation(row as ObservationRow) : null;
  },
};

