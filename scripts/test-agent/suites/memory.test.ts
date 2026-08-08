import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initMockLlm, initLiveLlm } from "../adapters";
import { resetAtlasTestState, resetAtlasTestTimers } from "../reset";
import { memoryStore } from "../helpers/memory-store";
import type { MemoryRecord, RetrievedMemory } from "@/lib/atlas/memory/service";
import {
  assertMemoryCount,
  assertContainsText,
  assertDoesNotContainText,
  assertHigherScoredFirst,
  assertEmptyResult,
} from "../assertions/memory";

import recallScenarios from "../fixtures/memory/recall-scenarios.json";

vi.mock("@/lib/atlas/server/prisma", () => ({
  prisma: {
    memory: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        return Promise.resolve(memoryStore.create({
          ...args.data,
          status: (args.data.status as string) ?? "active",
          accessCount: (args.data.accessCount as number) ?? 0,
        } as Parameters<typeof memoryStore.create>[0]));
      }),
      findMany: vi.fn((args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => {
        return Promise.resolve(memoryStore.findMany(args.where, { orderBy: args.orderBy, take: args.take }));
      }),
      findUnique: vi.fn((args: { where: Record<string, string> }) => {
        return Promise.resolve(memoryStore.findUnique(args.where));
      }),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        return Promise.resolve(memoryStore.update(args.where, args.data));
      }),
      updateMany: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        return Promise.resolve(memoryStore.updateMany(args.where, args.data));
      }),
      deleteMany: vi.fn((args: { where: Record<string, unknown> }) => {
        return Promise.resolve(memoryStore.deleteMany(args.where));
      }),
    },
    memoryEntity: {
      upsert: vi.fn((args: { where: { userId_name: { userId: string; name: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        return Promise.resolve(memoryStore.entityUpsert(args.where, args.create as Parameters<typeof memoryStore.entityUpsert>[1], args.update));
      }),
    },
    memoryRelation: {
      findFirst: vi.fn((args: { where: Record<string, unknown>; include?: { subject: boolean; object: boolean } }) => {
        return Promise.resolve(memoryStore.relationFindFirst(args.where, args.include));
      }),
      findMany: vi.fn((args: { where: Record<string, unknown>; orderBy?: unknown; take?: number; include: { subject: boolean; object: boolean } }) => {
        return Promise.resolve(memoryStore.relationFindMany(args.where, { orderBy: args.orderBy, take: args.take, include: args.include }));
      }),
      create: vi.fn((args: { data: Record<string, unknown>; include?: { subject: boolean; object: boolean } }) => {
        return Promise.resolve(memoryStore.relationCreate(args.data as Parameters<typeof memoryStore.relationCreate>[0], args.include));
      }),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown>; include?: { subject: boolean; object: boolean } }) => {
        return Promise.resolve(memoryStore.relationUpdate(args.where, args.data, args.include));
      }),
      updateMany: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        return Promise.resolve(memoryStore.relationUpdateMany(args.where, args.data));
      }),
    },
    workflowSession: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/atlas/server/model-registry", () => ({
  resolveEmbeddingModel: vi.fn().mockResolvedValue({
    id: "test-model",
    provider: "openai",
    label: "test",
    apiKey: "test-key",
    enabled: true,
  }),
  resolveDefaultModel: vi.fn().mockResolvedValue({
    id: "test-model",
    provider: "openai",
    label: "test",
    apiKey: "test-key",
    enabled: true,
  }),
}));

vi.mock("@/lib/atlas/server/provider-map", () => ({
  toLlmProvider: vi.fn((provider: string) => ({
    provider: "openai" as const,
    baseUrl: undefined as string | undefined,
  })),
}));

import { memoryService, memoryOrchestrator } from "@/lib/atlas/memory/service";

beforeEach(() => {
  resetAtlasTestState();
  memoryStore.reset();
  initMockLlm();
});

afterEach(() => {
  initLiveLlm();
  resetAtlasTestTimers();
});

describe("Memory — Orchestrator", () => {
  it("maps food category to food/preference types", () => {
    const types = memoryOrchestrator.relevantTypes("food");
    expect(types).toContain("food");
    expect(types).toContain("preference");
  });

  it("maps travel category to travel/preference types", () => {
    const types = memoryOrchestrator.relevantTypes("travel");
    expect(types).toContain("travel");
    expect(types).toContain("preference");
  });

  it("maps shopping category to preference types", () => {
    const types = memoryOrchestrator.relevantTypes("shopping");
    expect(types).toContain("preference");
  });

  it("returns defaults for unknown categories", () => {
    const types = memoryOrchestrator.relevantTypes("unknown-stuff");
    expect(types).toContain("identity");
    expect(types).toContain("preference");
    expect(types).toContain("goal");
  });
});

describe("Memory — Semantic Storage", () => {
  it("remember creates a memory with embedding", async () => {
    const mem = await memoryService.remember("user-1", "I like Hyderabadi biryani", {
      type: "preference",
      confidence: 0.9,
    });

    expect(mem).not.toBeNull();
    expect(mem!.text).toBe("I like Hyderabadi biryani");
    expect(mem!.type).toBe("preference");
    expect(mem!.confidence).toBe(0.9);
    expect(mem!.status).toBe("active");
  });

  it("rememberPlain creates memory without requiring embeddings", async () => {
    const mem = await memoryService.rememberPlain("user-1", "I prefer window seats", {
      type: "preference",
    });

    expect(mem.text).toBe("I prefer window seats");
    expect(mem.type).toBe("preference");
    expect(mem.status).toBe("active");
  });

  it("listForUser returns only active user memories", async () => {
    await memoryService.rememberPlain("user-1", "Memory A", { type: "preference" });
    await memoryService.rememberPlain("user-1", "Memory B", { type: "food" });
    await memoryService.rememberPlain("user-2", "Memory C", { type: "preference" });

    const list = await memoryService.listForUser("user-1");

    expect(list.length).toBe(2);
    const texts = list.map((m) => m.text);
    expect(texts).toContain("Memory A");
    expect(texts).toContain("Memory B");
    expect(texts).not.toContain("Memory C");
  });

  it("listForUser respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await memoryService.rememberPlain("user-1", `Memory ${i}`, { type: "preference" });
    }

    const list = await memoryService.listForUser("user-1", 3);

    expect(list.length).toBe(3);
  });
});

describe("Memory — Semantic Recall", () => {
  it("recalls relevant memories for a query", async () => {
    await memoryService.remember("user-1", "I like Hyderabadi biryani", {
      type: "preference", confidence: 0.9, importance: 0.8,
    });
    await memoryService.remember("user-1", "I prefer spicy food", {
      type: "preference", confidence: 0.7, importance: 0.6,
    });

    const results = await memoryService.recall("user-1", "what food do I like", {
      category: "food",
      limit: 5,
    });

    assertMemoryCount(results, 2);
    assertContainsText(results, "I like Hyderabadi biryani");
    assertContainsText(results, "I prefer spicy food");
  });

  it("does not recall memories from other users", async () => {
    await memoryService.remember("user-1", "I like biryani", { type: "preference" });
    await memoryService.remember("user-2", "I like pizza", { type: "preference" });

    const results = await memoryService.recall("user-1", "what do I like", {
      category: "food",
    });

    assertContainsText(results, "I like biryani");
    assertDoesNotContainText(results, "I like pizza");
  });

  it("returns empty for no matching memories", async () => {
    const results = await memoryService.recall("user-1", "something unrelated", {
      category: "food",
    });

    assertEmptyResult(results);
  });

  it("favors semantically similar text in blended ranking", async () => {
    await memoryService.remember("user-1", "User loves spicy Andhra cuisine and biryani", {
      type: "food", confidence: 0.5, importance: 0.5,
    });
    await memoryService.remember("user-1", "User takes morning vitamins every day", {
      type: "health", confidence: 0.99, importance: 0.99,
    });

    const results = await memoryService.recall("user-1", "biryani food restaurants spicy", {
      category: "food",
      limit: 5,
    });

    assertHigherScoredFirst(results, "User loves spicy Andhra cuisine and biryani", "User takes morning vitamins every day");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await memoryService.remember("user-1", `Food memory ${i}`, {
        type: "preference", confidence: 0.7,
      });
    }

    const results = await memoryService.recall("user-1", "food", {
      category: "food",
      limit: 2,
    });

    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe("Memory — Lifecycle", () => {
  it("forget hard-deletes a memory", async () => {
    const mem = await memoryService.remember("user-1", "Delete me", { type: "preference" });
    expect(mem).not.toBeNull();

    await memoryService.forget("user-1", mem!.id);

    const list = await memoryService.listForUser("user-1");
    assertDoesNotContainText(list, "Delete me");
  });

  it("archive soft-deletes a memory", async () => {
    const mem = await memoryService.rememberPlain("user-1", "Archive me", { type: "preference" });
    expect(mem).not.toBeNull();

    await memoryService.archive(mem!.id);

    const list = await memoryService.listForUser("user-1");
    expect(list.length).toBe(0);
  });

  it("update modifies memory fields", async () => {
    const mem = await memoryService.rememberPlain("user-1", "Original text", {
      type: "preference", confidence: 0.5,
    });
    expect(mem).not.toBeNull();

    await memoryService.update(mem!.id, {
      text: "Updated text",
      confidence: 0.9,
      importance: 0.8,
    });

    const list = await memoryService.listForUser("user-1");
    expect(list.length).toBe(1);
    expect(list[0].text).toBe("Updated text");
    expect(list[0].confidence).toBe(0.9);
    expect(list[0].importance).toBe(0.8);
  });
});

describe("Memory — Conflicting & Duplicate", () => {
  it("merge absorbs source into target", async () => {
    const source = await memoryService.remember("user-1", "Source memory", {
      type: "preference", confidence: 0.9, importance: 0.8,
    });
    const target = await memoryService.remember("user-1", "Target memory", {
      type: "preference", confidence: 0.5, importance: 0.4,
    });

    expect(source).not.toBeNull();
    expect(target).not.toBeNull();

    await memoryService.merge(source!.id, target!.id);

    const list = await memoryService.listForUser("user-1");
    expect(list.length).toBe(1);
    expect(list[0].text).toBe("Target memory");
    expect(list[0].confidence).toBe(0.9);
    expect(list[0].importance).toBe(0.8);
  });

  it("consolidate removes exact duplicates", async () => {
    await memoryService.rememberPlain("user-1", "Duplicate text", { type: "preference" });
    await memoryService.rememberPlain("user-1", "Duplicate text", { type: "preference" });

    const before = await memoryService.listForUser("user-1");
    expect(before.length).toBe(2);

    const result = await memoryService.consolidate("user-1");

    const after = await memoryService.listForUser("user-1");
    expect(after.length).toBe(1);
    expect(result.merged).toBeGreaterThanOrEqual(1);
  });

  it("consolidate expires expired temporary memories", async () => {
    const pastDate = new Date(Date.now() - 1000);
    await memoryService.remember("user-1", "Expired memory", {
      type: "preference",
      confidence: 0.5,
    });
    const all = await memoryService.listForUser("user-1");
    const mem = all[0];

    (memoryStore.memories.get(mem.id)!).expiresAt = pastDate;

    const result = await memoryService.consolidate("user-1");

    const list = await memoryService.listForUser("user-1");
    expect(list.length).toBe(0);
    expect(result.expired).toBeGreaterThanOrEqual(1);
  });
});

describe("Memory — Knowledge Graph", () => {
  it("addTriple creates structured relationships", async () => {
    const rel = await memoryService.addTriple("user-1", {
      subject: "user",
      relation: "prefers",
      object: "Meghana Foods",
      subjectKind: "person",
      objectKind: "restaurant",
    });

    expect(rel.relation).toBe("prefers");
    expect(rel.subject.name).toBe("user");
    expect(rel.object.name).toBe("Meghana Foods");
    expect(rel.strength).toBeCloseTo(0.6);
  });

  it("addTriple strengthens existing relationships", async () => {
    await memoryService.addTriple("user-1", {
      subject: "user",
      relation: "likes",
      object: "biryani",
    });

    const rel = await memoryService.addTriple("user-1", {
      subject: "user",
      relation: "likes",
      object: "biryani",
    });

    expect(rel.strength).toBeCloseTo(0.8);
  });

  it("queryGraph finds relations by subject", async () => {
    await memoryService.addTriple("user-1", {
      subject: "user",
      relation: "prefers",
      object: "Hyatt",
    });

    const rel1 = await memoryService.addTriple("user-1", {
      subject: "user",
      relation: "travels_to",
      object: "Paris",
    });

    const results = await memoryService.queryGraph("user-1", {
      subject: "user",
      limit: 10,
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("applyRelationOperation replaces old preferences", async () => {
    await memoryService.addTriple("user-1", {
      subject: "user",
      relation: "prefers",
      object: "Marriott",
    });

    const newRel = await memoryService.applyRelationOperation(
      "user-1",
      "replace",
      {
        subject: "user",
        relation: "prefers",
        object: "Hyatt",
      }
    );

    expect(newRel).not.toBeNull();
    expect(newRel!.object.name).toBe("Hyatt");
  });
});

describe("Memory — isAvailable", () => {
  it("returns true when embedding model is configured", async () => {
    const available = await memoryService.isAvailable();
    expect(available).toBe(true);
  });
});

describe("Memory — Negative Recall", () => {
  it("returns empty for unrelated query", async () => {
    await memoryService.remember("user-1", "I like biryani", { type: "preference" });

    const results = await memoryService.recall("user-1", "quantum physics black holes", {
      category: "general",
    });

    assertEmptyResult(results);
  });
});

describe("Memory — Conversation Continuity", () => {
  it("bumps accessCount on recall touches", async () => {
    await memoryService.remember("user-1", "Frequently used memory", {
      type: "preference", confidence: 0.8,
    });

    await memoryService.recall("user-1", "used memory", { category: "general" });
    await memoryService.recall("user-1", "used memory", { category: "general" });

    const list = await memoryService.listForUser("user-1");
    expect(list[0].accessCount).toBeGreaterThanOrEqual(2);
  });
});

describe("Memory — Golden Recall Scenarios", () => {
  for (const scenario of recallScenarios) {
    it(`"${scenario.scenario}" → ${scenario.expectedRecall.length} recalled`, async () => {
      for (const mem of scenario.memories) {
        await memoryService.remember("user-1", mem.text, {
          type: mem.type as string as Parameters<typeof memoryService.remember>[2],
          confidence: mem.confidence,
          importance: mem.importance,
        } as Parameters<typeof memoryService.remember>[2]);
      }

      const results = await memoryService.recall("user-1", scenario.query, {
        category: scenario.category,
        limit: 10,
      });

      for (const expected of scenario.expectedRecall) {
        assertContainsText(results, expected);
      }
      for (const miss of scenario.expectedMiss) {
        assertDoesNotContainText(results, miss);
      }
    });
  }
});

describe("Memory — Snapshots", () => {
  it("recall result snapshot", async () => {
    await memoryService.remember("user-1", "I like Hyderabadi biryani", {
      type: "preference", confidence: 0.9, importance: 0.8,
    });
    await memoryService.remember("user-1", "I prefer spicy food", {
      type: "preference", confidence: 0.7, importance: 0.6,
    });

    const results = await memoryService.recall("user-1", "what food do I like", {
      category: "food",
      limit: 10,
    });

    const snapshot = results.map((r) => ({
      text: r.text,
      type: r.type,
      score: Math.round(r.score * 1000) / 1000,
      confidence: r.confidence,
      importance: r.importance,
    }));
    expect(snapshot).toMatchSnapshot();
  });

  it("listForUser snapshot after lifecycle operations", async () => {
    await memoryService.rememberPlain("user-1", "Active memory A", { type: "preference" });
    await memoryService.rememberPlain("user-1", "Active memory B", { type: "food" });
    const archived = await memoryService.rememberPlain("user-1", "Archived memory", { type: "preference" });
    await memoryService.archive(archived.id);

    const list = await memoryService.listForUser("user-1");
    const snapshot = list.map((m) => ({ text: m.text, type: m.type, status: m.status }));
    expect(snapshot).toMatchSnapshot();
  });
});
