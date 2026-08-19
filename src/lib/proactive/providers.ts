/**
 * Context providers for the Proactive Context Engine.
 * Each provider is deterministic and cheap: gather → candidates with `reason`.
 * Providers registered here are the ONLY v1 sources (executions, approvals,
 * memory-deadlines) plus the isolated demo fixture provider.
 */

import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import type { CandidateItem } from "./types";

export type ContextProvider = (userId: string, now: Date) => Promise<CandidateItem[]>;

function dbUserId(userId: string): string | null {
  return userId === "atlas-demo-user" ? null : userId;
}

function minutesLeft(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60000));
}

/** Active executions = unfinished work. */
export const executionsProvider: ContextProvider = async (userId, now) => {
  const uid = dbUserId(userId);
  const rows = await prisma.execution.findMany({
    where: {
      userId: uid,
      status: { in: ["planning", "executing", "pending_approval", "observing", "reflecting", "blocked"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return rows.map((row): CandidateItem => {
    const statusLabel = row.status === "pending_approval" ? "waiting for approval" : row.status;
    const ageHours = Math.max(0, (now.getTime() - new Date(row.updatedAt).getTime()) / 3600000);
    const urgency = Math.min(1, 0.3 + ageHours / 24);
    const importance = row.status === "pending_approval" ? 0.9 : 0.6;
    return {
      id: `execution:${row.id}`,
      provider: "executions",
      source: `execution:${row.id}`,
      title: row.goal || "Unfinished task",
      body: `Still ${statusLabel === "pending_approval" ? "waiting for your approval" : `in progress (${statusLabel})`}.`,
      kind: "task",
      reason: `Unfinished task — ${statusLabel}.`,
      urgency,
      importance,
      privacySensitive: false,
      dueAt: row.completedAt?.toISOString(),
    };
  });
};

/** Pending approvals = expiring action the user still controls. */
export const approvalsProvider: ContextProvider = async (userId, now) => {
  const uid = dbUserId(userId);
  const rows = await prisma.approval.findMany({
    where: { userId: uid, status: "pending", expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
    take: 8,
  });

  return rows.map((row): CandidateItem => {
    const mins = minutesLeft(row.expiresAt, now);
    const urgency = Math.min(1, 1 - mins / (15 * 60));
    return {
      id: `approval:${row.id}`,
      provider: "approvals",
      source: `approval:${row.id}`,
      title: row.title.replace(/^Approve\s+/i, "").trim() || row.summary || "Approval needed",
      body: row.summary || "",
      kind: "approval",
      reason: `Approval pending — expires in ${mins <= 1 ? "under a minute" : `${mins} min`}.`,
      urgency,
      importance: 0.9,
      privacySensitive: false,
      dueAt: row.expiresAt.toISOString(),
    };
  });
};

/**
 * Deadline warnings from long-term memory. Pure rule-based scan of active
 * memories for deadline-like phrasing; NEVER invented. Requires memory to be
 * populated; returns [] when memory is unavailable/sparse.
 */
const DEADLINE_PATTERNS =
  /\b(due|deadline|due by|by (tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|end of|the (end of the )?(week|month|day)))\b/i;

export const memoryDeadlinesProvider: ContextProvider = async (userId, now) => {
  if (userId === "atlas-demo-user") return [];

  const rows = await prisma.memory.findMany({
    where: {
      userId,
      kind: "user",
      status: "active",
      type: { in: ["work", "project", "goal", "event"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { importance: "desc" },
    take: 20,
  });

  const items: CandidateItem[] = [];
  for (const row of rows) {
    if (!DEADLINE_PATTERNS.test(row.text)) continue;
    items.push({
      id: `memory:${row.id}`,
      provider: "memory-deadlines",
      source: `memory:${row.id}`,
      title: row.text,
      body: "",
      kind: "deadline",
      reason: `Memory mentions a deadline and matters for today (type "${row.type}").`,
      urgency: 0.7,
      importance: Math.min(1, row.importance ?? 0.5),
      privacySensitive: true,
      dueAt: row.expiresAt?.toISOString(),
    });
  }

  return items.slice(0, 6);
};

/** Deterministic demo/candidate fixture for Admin previews. Never persisted. */
export function demoCandidates(now: Date): CandidateItem[] {
  const iso = now.toISOString();
  return [
    {
      id: "demo:execution",
      provider: "demo",
      source: "demo:execution",
      title: "Review the Q3 travel budget",
      body: "Unfinished task you flagged — still in progress.",
      kind: "task",
      reason: "Demo item — unfinished task from the fixture.",
      urgency: 0.6,
      importance: 0.7,
      privacySensitive: false,
      synthetic: true,
      dueAt: iso,
    },
    {
      id: "demo:approval",
      provider: "demo",
      source: "demo:approval",
      title: "Book 11:40 flight to Bengaluru",
      body: "Your approval is still pending for this booking.",
      kind: "approval",
      reason: "Demo item — pending approval from the fixture.",
      urgency: 0.9,
      importance: 0.9,
      privacySensitive: false,
      synthetic: true,
      dueAt: iso,
    },
    {
      id: "demo:deadline",
      provider: "demo",
      source: "demo:deadline",
      title: "Project deliverable due Friday",
      body: "Work memory notes an upcoming deadline.",
      kind: "deadline",
      reason: "Demo item — deadline memory from the fixture.",
      urgency: 0.7,
      importance: 0.8,
      privacySensitive: true,
      synthetic: true,
      dueAt: iso,
    },
  ];
}

export const PROVIDERS: Record<string, ContextProvider> = {
  executions: executionsProvider,
  approvals: approvalsProvider,
  "memory-deadlines": memoryDeadlinesProvider,
};

export function allProviderIds(): string[] {
  return Object.keys(PROVIDERS);
}