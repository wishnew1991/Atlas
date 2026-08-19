import { describe, it, expect, beforeEach, vi } from "vitest";

import { chat } from "@/lib/atlas/llm";
import type { CandidateItem } from "@/lib/proactive/types";
import { validateCandidates, filterRelevant } from "@/lib/proactive/rules";
import { evaluateForUser, dueCheck, periodKey } from "@/lib/proactive/engine";
import { writeUserPreference, writeAdminDefaults, resolveEffectiveConfig } from "@/lib/proactive/config";

const state = vi.hoisted(() => {
  type BriefRow = Record<string, unknown> & { [k: string]: unknown };
  const briefs = new Map<string, BriefRow>();
  const triggers = new Map<string, Record<string, unknown>>();
  const settings = new Map<string, string>();
  const executions: Array<Record<string, unknown>> = [];
  const approvals: Array<Record<string, unknown>> = [];
  const memories: Array<Record<string, unknown>> = [];

  return { briefs, triggers, settings, executions, approvals, memories };
});

vi.mock("@/lib/atlas/server/prisma", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const value = state.settings.get(where.key);
        return value !== undefined ? { key: where.key, value } : null;
      }),
      upsert: vi.fn(
        async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => {
          state.settings.set(where.key, (create ?? update).value);
          return { key: where.key, value: state.settings.get(where.key) };
        }
      ),
    },
    proactiveTrigger: {
      findUnique: vi.fn(async ({ where }: { where: { userId_triggerType: { userId: string; triggerType: string } } }) => {
        const key = `${where.userId_triggerType.userId}:${where.userId_triggerType.triggerType}`;
        return state.triggers.get(key) ?? null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId_triggerType: { userId: string; triggerType: string } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = `${where.userId_triggerType.userId}:${where.userId_triggerType.triggerType}`;
          const existing = state.triggers.get(key);
          const row = existing
            ? { ...state.triggers.get(key), ...update, updatedAt: new Date() }
            : { id: `tr_${key}`, ...create, updatedAt: new Date() };
          state.triggers.set(key, row);
          return row;
        }
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${data.userId}:${data.triggerType}`;
        const row = { id: `tr_${key}`, ...data, updatedAt: new Date() };
        state.triggers.set(key, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        let updated: Record<string, unknown> | null = null;
        state.triggers.forEach((row, key) => {
          if (row.id === where.id) {
            const next = { ...row, ...data, updatedAt: new Date() };
            state.triggers.set(key, next);
            updated = next;
          }
        });
        return updated;
      }),
    },
    proactiveBrief: {
      findUnique: vi.fn(
        async ({ where }: { where: { userId_triggerType_period: { userId: string; triggerType: string; period: string } } }) => {
          const u = where.userId_triggerType_period.userId;
          const t = where.userId_triggerType_period.triggerType;
          const p = where.userId_triggerType_period.period;
          let found: Record<string, unknown> | null = null;
          state.briefs.forEach((row) => {
            if (row.userId === u && row.triggerType === t && row.period === p) found = row;
          });
          return found;
        }
      ),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let found: Record<string, unknown> | null = null;
        state.briefs.forEach((row) => {
          if (found) return;
          let match = true;
          for (const [k, v] of Object.entries(where)) {
            if (row[k] !== v) match = false;
          }
          if (match) found = row;
        });
        return found;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows: Array<Record<string, unknown>> = [];
        state.briefs.forEach((row) => {
          let match = true;
          for (const [k, v] of Object.entries(where)) {
            if (row[k] !== v) match = false;
          }
          if (match) rows.push(row);
        });
        return rows.sort(
          (a, b) => (b.deliveredAt as number) - (a.deliveredAt as number)
        );
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        let duplicate = false;
        state.briefs.forEach((row) => {
          if (row.userId === data.userId && row.triggerType === data.triggerType && row.period === data.period) {
            duplicate = true;
          }
        });
        if (duplicate) {
          const err = new Error("Unique constraint failed") as { code?: string };
          err.code = "P2002";
          throw err;
        }
        const row: Record<string, unknown> = {
          id: `brief_${state.briefs.size + 1}`,
          ...data,
          status: "delivered",
          deliveredAt: new Date(),
          acknowledgedAt: null,
          synthetic: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.briefs.set(String(row.id), row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.briefs.get(where.id);
        if (!row) return null;
        const next = { ...row, ...data, updatedAt: new Date() };
        state.briefs.set(where.id, next);
        return next;
      }),
    },
    execution: {
      findMany: vi.fn(async () => [...state.executions]),
    },
    approval: {
      findMany: vi.fn(async () => [...state.approvals]),
    },
    memory: {
      findMany: vi.fn(async () => [...state.memories]),
    },
  },
}));

vi.mock("@/lib/atlas/server/agent/reply", () => ({
  resolveActiveModel: vi.fn(async () => ({
    id: "test-model",
    provider: "openai",
    apiKey: "test-key",
  })),
}));

vi.mock("@/lib/atlas/llm", () => ({
  chat: vi.fn(async () => {
    throw new Error("no LLM in tests — forces deterministic fallback");
  }),
}));

function resetState() {
  state.briefs.clear();
  state.triggers.clear();
  state.settings.clear();
  state.executions.length = 0;
  state.approvals.length = 0;
  state.memories.length = 0;
  vi.mocked(chat).mockClear();
}

beforeEach(() => {
  resetState();
});

describe("Proactive Context Engine — invariant suite", () => {
  it("enables admin accounts as normal consumers (eligibility follows preferences, not the admin list)", async () => {
    process.env.ATLAS_ADMIN_USER_IDS = "admin-user-123";
    state.executions.push({
      id: "exec1",
      userId: "admin-user-123",
      goal: "Follow up with vendor",
      status: "executing",
      updatedAt: new Date(),
      completedAt: null,
    });

    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: ["executions"], maxItems: 5, llmCompose: false, triggerMode: "lazy" });

    const result = await evaluateForUser("admin-user-123", { now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.brief?.userId).toBe("admin-user-123");
    expect(result.brief?.items.length).toBeGreaterThan(0);
    delete process.env.ATLAS_ADMIN_USER_IDS;
  });

  it("demo/preview never persists and never surfaces as a delivered brief", async () => {
    const result = await evaluateForUser("user-1", { demo: true });
    expect(result.ok).toBe(true);
    expect(result.preview?.synthetic).toBe(true);
    expect(result.brief).toBeUndefined();
    expect(state.briefs.size).toBe(0);
  });

  it("no meaningful items → no brief and no LLM composition", async () => {
    await writeUserPreference("user-1", "daily", { enabled: true, schedule: "07:00" });
    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: ["executions", "approvals"], maxItems: 5, llmCompose: true, triggerMode: "lazy" });

    const result = await evaluateForUser("user-1", { now: new Date() });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_items");
    expect(state.briefs.size).toBe(0);
    expect(vi.mocked(chat)).not.toHaveBeenCalled();
  });

  it("privacy-sensitive candidates never reach the LLM or the composed brief", async () => {
    const sensitive: CandidateItem = {
      id: "memory:secret",
      provider: "memory-deadlines",
      source: "memory:secret",
      title: "Salary deadline",
      body: "",
      kind: "deadline",
      reason: "Memory deadline",
      urgency: 0.9,
      importance: 0.9,
      privacySensitive: true,
    };
    const safe: CandidateItem = {
      id: "execution:pub",
      provider: "executions",
      source: "execution:pub",
      title: "Public task",
      body: "",
      kind: "task",
      reason: "Active task",
      urgency: 0.6,
      importance: 0.5,
      privacySensitive: false,
    };

    const relevant = filterRelevant([sensitive, safe], { maxItems: 5 });
    expect(relevant.map((c) => c.id)).toEqual(["execution:pub"]);
    expect(relevant.some((c) => c.id === "memory:secret")).toBe(false);
  });

  it("two simultaneous evaluations for the same user/trigger/period persist exactly one brief", async () => {
    state.executions.push({
      id: "exec1",
      userId: "user-1",
      goal: "Ship proactive engine",
      status: "executing",
      updatedAt: new Date(),
      completedAt: null,
    });

    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: ["executions"], maxItems: 5, llmCompose: false, triggerMode: "lazy" });

    const now = new Date();
    const results = await Promise.all([
      evaluateForUser("user-1", { now }),
      evaluateForUser("user-1", { now }),
      evaluateForUser("user-1", { now }),
    ]);

    const delivered = results.filter((r) => r.ok && r.brief);
    expect(delivered.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(delivered.map((r) => r.brief?.id));
    expect(ids.size).toBe(1);
    expect(state.briefs.size).toBe(1);
  });

  it("sequential re-evaluation in the same period is a no-op (no duplicate delivery)", async () => {
    state.executions.push({
      id: "exec1",
      userId: "user-1",
      goal: "Send invoice",
      status: "planning",
      updatedAt: new Date(),
      completedAt: null,
    });

    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: ["executions"], maxItems: 5, llmCompose: false, triggerMode: "lazy" });

    const now = new Date();
    const first = await evaluateForUser("user-1", { now });
    const second = await evaluateForUser("user-1", { now });
    expect(first.ok).toBe(true);
    expect(second.reason).toBe("already_delivered");
    expect(state.briefs.size).toBe(1);
  });

  it("rejects candidates that are missing a required reason", () => {
    const bad: CandidateItem = {
      id: "execution:x",
      provider: "executions",
      source: "execution:x",
      title: "No reason",
      body: "",
      kind: "task",
      reason: "",
      urgency: 0.5,
      importance: 0.5,
      privacySensitive: false,
    };
    expect(() => validateCandidates([bad])).toThrow(/reason/);
  });

  it("composed items are grounded: only candidate ids appear", async () => {
    state.executions.push({
      id: "exec1",
      userId: "user-1",
      goal: "Pay electricity bill",
      status: "pending_approval",
      updatedAt: new Date(),
      completedAt: null,
    });

    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: ["executions"], maxItems: 5, llmCompose: true, triggerMode: "lazy" });

    // chat() throws → deterministic fallback, still grounded.
    const result = await evaluateForUser("user-1", { now: new Date() });
    expect(result.ok).toBe(true);
    const expected = new Set(["execution:exec1"]);
    for (const entry of result.brief?.items ?? []) {
      expect(expected.has(entry.item.id)).toBe(true);
    }
  });

  it("user preference overrides admin default (consent)", async () => {
    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: ["executions"], maxItems: 5, llmCompose: false, triggerMode: "lazy" });
    await writeUserPreference("user-1", "daily", { enabled: false, schedule: "09:00" });

    const entry = await resolveEffectiveConfig("user-1", "daily");
    expect(entry.enabled).toBe(false);
    expect(entry.triggerTime).toBe("09:00");
  });

  it("lazy due-check is honest: administers only when scheduled time has passed", async () => {
    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: ["executions"], maxItems: 5, llmCompose: false, triggerMode: "lazy" });

    const before = new Date("2026-08-11T06:00:00");
    expect((await dueCheck("user-1", { now: before })).reason).toBe("not_due");

    state.executions.push({
      id: "exec1",
      userId: "user-1",
      goal: "Plan trip",
      status: "executing",
      updatedAt: new Date(),
      completedAt: null,
    });

    const after = new Date("2026-08-11T07:05:00");
    const result = await dueCheck("user-1", { now: after });
    expect(result.ok).toBe(true);
    expect(result.brief?.period).toBe("2026-08-11");
  });

  it("demo leaks nothing to the real evaluation store", async () => {
    await evaluateForUser("user-1", { demo: true });
    await writeAdminDefaults({ enabled: true, triggerTime: "07:00", providers: [], maxItems: 5, llmCompose: false, triggerMode: "lazy" });
    const real = await evaluateForUser("user-1", { now: new Date() });
    expect(real.reason).toBe("no_items");
    expect(real.brief ?? real.preview).toBeUndefined();
  });

  it("periodKey produces a stable local date key", () => {
    expect(periodKey(new Date("2026-08-11T22:00:00"))).toBe("2026-08-11");
  });
});