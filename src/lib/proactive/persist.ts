/**
 * Persistence for the Proactive Context Engine.
 *
 * Duplicate prevention is concurrent-safe: the @unique(userId, triggerType,
 * period) constraint is the final authority. On a unique-constraint conflict
 * (P2002), the loser coalesces to the winning row instead of erroring — exactly
 * one brief survives even when two evaluations race.
 */

import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import type { CandidateItem } from "./types";

export interface BriefRow {
  id: string;
  userId: string;
  triggerType: string;
  period: string;
  status: string;
  title: string;
  items: Array<{ item: CandidateItem; text: string }>;
  synthetic: boolean;
  deliveredAt: Date;
  acknowledgedAt: Date | null;
}

function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function parseItems(raw: string): Array<{ item: CandidateItem; text: string }> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Array<{ item: CandidateItem; text: string }>) : [];
  } catch {
    return [];
  }
}

function toBriefRow(row: {
  id: string;
  userId: string;
  triggerType: string;
  period: string;
  status: string;
  title: string;
  itemsJson: string;
  synthetic: boolean;
  deliveredAt: Date;
  acknowledgedAt: Date | null;
}): BriefRow {
  return {
    id: row.id,
    userId: row.userId,
    triggerType: row.triggerType,
    period: row.period,
    status: row.status,
    title: row.title,
    items: parseItems(row.itemsJson),
    synthetic: row.synthetic,
    deliveredAt: row.deliveredAt,
    acknowledgedAt: row.acknowledgedAt,
  };
}

export interface PersistBriefInput {
  userId: string;
  triggerType: string;
  period: string;
  title: string;
  items: Array<{ item: CandidateItem; text: string }>;
}

/** Idempotent create. Returns the surviving row + created flag. */
export async function persistBrief(input: PersistBriefInput): Promise<{
  brief: BriefRow;
  created: boolean;
}> {
  const data = {
    id: crypto.randomUUID(),
    userId: input.userId,
    triggerType: input.triggerType,
    period: input.period,
    title: input.title,
    itemsJson: JSON.stringify(input.items),
  };

  try {
    const created = await prisma.proactiveBrief.create({ data });
    return { brief: toBriefRow(created), created: true };
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      const existing = await prisma.proactiveBrief.findUnique({
        where: {
          userId_triggerType_period: {
            userId: input.userId,
            triggerType: input.triggerType,
            period: input.period,
          },
        },
      });
      if (existing) return { brief: toBriefRow(existing), created: false };
    }
    throw error;
  }
}

export async function getBrief(userId: string, id: string): Promise<BriefRow | null> {
  const row = await prisma.proactiveBrief.findFirst({ where: { id, userId } });
  return row ? toBriefRow(row) : null;
}

/** Cheap duplicate pre-check (not authoritative — the unique constraint is). */
export async function briefExistsForPeriod(
  userId: string,
  triggerType: string,
  period: string
): Promise<boolean> {
  const row = await prisma.proactiveBrief.findUnique({
    where: { userId_triggerType_period: { userId, triggerType, period } },
    select: { id: true },
  });
  return row !== null;
}

export async function listUserBriefs(userId: string, opts: { synthetic?: boolean; limit?: number } = {}): Promise<BriefRow[]> {
  const rows = await prisma.proactiveBrief.findMany({
    where: {
      userId,
      ...(opts.synthetic !== undefined ? { synthetic: opts.synthetic } : {}),
    },
    orderBy: { deliveredAt: "desc" },
    take: opts.limit ?? 20,
  });
  return rows.map(toBriefRow);
}

export async function acknowledgeBrief(userId: string, id: string): Promise<BriefRow | null> {
  const row = await prisma.proactiveBrief.findFirst({ where: { id, userId } });
  if (!row || row.acknowledgedAt) return row ? toBriefRow(row) : null;

  const updated = await prisma.proactiveBrief.update({
    where: { id },
    data: { status: "acknowledged", acknowledgedAt: new Date() },
  });
  return toBriefRow(updated);
}