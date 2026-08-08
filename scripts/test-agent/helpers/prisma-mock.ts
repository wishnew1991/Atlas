import { vi } from "vitest";
import { memoryStore } from "./memory-store";
import { InMemoryMemoryStore } from "./memory-store";

class RoutineObservationStore {
  private rows = new Map<string, Record<string, unknown>>();

  private key(userId: string, domain: string, fingerprint: string): string {
    return `${userId}:${domain}:${fingerprint}`;
  }

  findUnique(where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } }): Record<string, unknown> | null {
    const k = this.key(where.userId_domain_fingerprint.userId, where.userId_domain_fingerprint.domain, where.userId_domain_fingerprint.fingerprint);
    return this.rows.get(k) ?? null;
  }

  upsert(args: {
    where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Record<string, unknown> {
    const k = this.key(args.where.userId_domain_fingerprint.userId, args.where.userId_domain_fingerprint.domain, args.where.userId_domain_fingerprint.fingerprint);
    const existing = this.rows.get(k);
    if (existing) {
      const merged = { ...existing, ...args.update, updatedAt: new Date() };
      this.rows.set(k, merged);
      return merged;
    }
    const row = { id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...args.create, updatedAt: new Date() };
    this.rows.set(k, row);
    return row;
  }

  findMany(): Record<string, unknown>[] {
    return Array.from(this.rows.values());
  }

  update(): Record<string, unknown> {
    return { id: "r1", state: "accepted", count: 3 };
  }

  reset(): void {
    this.rows.clear();
  }
}

export const routineObsStore = new RoutineObservationStore();

export function createPrismaMock(routineStore: RoutineObservationStore = routineObsStore) {
  return {
    memory: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(memoryStore.create({ ...args.data, status: (args.data.status as string) ?? "active", accessCount: (args.data.accessCount as number) ?? 0 } as Parameters<typeof memoryStore.create>[0]))),
      findMany: vi.fn((args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => Promise.resolve(memoryStore.findMany(args.where, { orderBy: args.orderBy, take: args.take }))),
      findUnique: vi.fn((args: { where: Record<string, string> }) => Promise.resolve(memoryStore.findUnique(args.where))),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve(memoryStore.update(args.where, args.data))),
      updateMany: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise.resolve(memoryStore.updateMany(args.where, args.data))),
      deleteMany: vi.fn((args: { where: Record<string, unknown> }) => Promise.resolve(memoryStore.deleteMany(args.where))),
    },
    memoryEntity: {
      upsert: vi.fn((args: { where: { userId_name: { userId: string; name: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise.resolve(memoryStore.entityUpsert(args.where, args.create as Parameters<typeof memoryStore.entityUpsert>[1], args.update))),
    },
    memoryRelation: {
      findFirst: vi.fn((args: { where: Record<string, unknown>; include?: { subject: boolean; object: boolean } }) => Promise.resolve(memoryStore.relationFindFirst(args.where, args.include))),
      findMany: vi.fn((args: { where: Record<string, unknown>; orderBy?: unknown; take?: number; include: { subject: boolean; object: boolean } }) => Promise.resolve(memoryStore.relationFindMany(args.where, { orderBy: args.orderBy, take: args.take, include: args.include }))),
      create: vi.fn((args: { data: Record<string, unknown>; include?: { subject: boolean; object: boolean } }) => Promise.resolve(memoryStore.relationCreate(args.data as Parameters<typeof memoryStore.relationCreate>[0], args.include))),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown>; include?: { subject: boolean; object: boolean } }) => Promise.resolve(memoryStore.relationUpdate(args.where, args.data, args.include))),
      updateMany: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise.resolve(memoryStore.relationUpdateMany(args.where, args.data))),
    },
    workflowSession: { upsert: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn().mockResolvedValue({}) },
    approval: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `approval_${Date.now()}`, ...args.data, status: "pending", createdAt: new Date(), completedAt: null })),
      update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]),
    },
    domain: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    routingRule: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    setting: { upsert: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null) },
    credential: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
    modelConfig: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
    mcpServer: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
    mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    turnTrace: { upsert: vi.fn().mockResolvedValue({}) },
    conversation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "c1", summary: "", lastMessageAt: new Date(), createdAt: new Date(), updatedAt: new Date() }), update: vi.fn().mockResolvedValue({}) },
    message: { create: vi.fn().mockResolvedValue({}) },
    activityItem: { create: vi.fn().mockResolvedValue({}) },
    userProfile: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
    atlasUser: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    routine: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
    routineObservation: {
      findMany: vi.fn(() => Promise.resolve(routineStore.findMany())),
      findUnique: vi.fn((args: { where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } } }) => Promise.resolve(routineStore.findUnique(args.where))),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `obs_${Date.now()}`, ...args.data })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn((args: { where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        return Promise.resolve(routineStore.upsert(args));
      }),
    },
    execution: { create: vi.fn().mockResolvedValue({ id: "e1", goal: "", status: "planning", planJson: "{}", stateJson: "{}", resultsJson: "[]", metadataJson: "{}", createdAt: new Date(), updatedAt: new Date(), completedAt: null }), update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    executionEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn: Function) => fn()),
  };
}
