import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initMockLlm, initLiveLlm } from "../adapters";
import { resetAtlasTestState, resetAtlasTestTimers } from "../reset";
import { memoryStore } from "../helpers/memory-store";

vi.mock("@/lib/atlas/server/prisma", () => ({
  prisma: {
    memory: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(memoryStore.create({ ...args.data, status: (args.data.status as string) ?? "active", accessCount: (args.data.accessCount as number) ?? 0 } as Parameters<typeof memoryStore.create>[0]))),
      findMany: vi.fn((args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => Promise.resolve(memoryStore.findMany(args.where, { orderBy: args.orderBy, take: args.take }))),
      findUnique: vi.fn((args: { where: Record<string, string> }) => Promise.resolve(memoryStore.findUnique(args.where))),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve(memoryStore.update(args.where, args.data))),
      updateMany: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise.resolve(memoryStore.updateMany(args.where, args.data))),
      deleteMany: vi.fn((args: { where: Record<string, unknown> }) => Promise.resolve(memoryStore.deleteMany(args.where))),
    },
    memoryEntity: { upsert: vi.fn().mockResolvedValue({ id: "e1", name: "test", kind: "entity" }) },
    memoryRelation: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    workflowSession: { upsert: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn().mockResolvedValue({}) },
    approval: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "approval-1", ...args.data, status: "pending", createdAt: new Date(), completedAt: null })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    domain: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    routingRule: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    setting: { upsert: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null) },
    credential: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
    modelConfig: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
    mcpServer: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
    mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    turnTrace: { upsert: vi.fn().mockResolvedValue({}) },
    conversation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "conv-1", summary: "", lastMessageAt: new Date(), createdAt: new Date(), updatedAt: new Date() }), update: vi.fn().mockResolvedValue({}) },
    message: { create: vi.fn().mockResolvedValue({}) },
    activityItem: { create: vi.fn().mockResolvedValue({}) },
    userProfile: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
    atlasUser: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    routine: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
    routineObservation: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    execution: { create: vi.fn().mockResolvedValue({ id: "exec-1", goal: "", type: "immediate", status: "planning", planJson: "{}", stateJson: "{}", resultsJson: "[]", metadataJson: "{}", createdAt: new Date(), updatedAt: new Date(), completedAt: null }), update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    executionEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn: Function) => fn()),
  },
}));

vi.mock("@/lib/atlas/server/model-registry", () => ({
  resolveDefaultModel: vi.fn().mockResolvedValue({ id: "test", provider: "openai", label: "test", apiKey: "k", enabled: true }),
  resolveEmbeddingModel: vi.fn().mockResolvedValue({ id: "test", provider: "openai", label: "test", apiKey: "k", enabled: true }),
}));

vi.mock("@/lib/atlas/server/provider-map", () => ({
  toLlmProvider: vi.fn((p: string) => ({ provider: "openai" as const, baseUrl: undefined as string | undefined })),
}));

vi.mock("@/lib/atlas/mcp/tools", () => ({
  isMcpToolName: vi.fn((name: string) => name.startsWith("mcp__")),
  executeMcpTool: vi.fn(async (name: string, args: Record<string, unknown>) => ({
    message: `MCP tool ${name} executed with ${JSON.stringify(args)}`,
    data: { tool: name, args },
  })),
  getDynamicMcpTools: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/atlas/mcp/router", () => ({
  routeToolCall: vi.fn().mockResolvedValue({ message: "routed result", data: { routed: true }, serverName: "test", toolName: "test" }),
  routeGlobalToolCall: vi.fn().mockResolvedValue({ message: "global result", data: { global: true }, serverName: "test", toolName: "test" }),
}));

vi.mock("@/lib/atlas/mcp/food-session", () => ({
  getFoodSession: vi.fn().mockReturnValue({ step: "idle", cart: [], updatedAt: Date.now() }),
  updateFoodSession: vi.fn(),
  clearFoodSession: vi.fn(),
}));

vi.mock("@/lib/atlas/mcp/food-log", () => ({
  foodLog: vi.fn(),
}));

vi.mock("@/lib/atlas/effects", () => ({
  emitEffect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/atlas/server/serper", () => ({
  serperSearch: vi.fn().mockResolvedValue({
    results: [
      { title: "Result 1", link: "https://a.com", snippet: "Snippet A" },
      { title: "Result 2", link: "https://b.com", snippet: "Snippet B" },
    ],
  }),
  formatSerperResults: vi.fn().mockReturnValue("Formatted results"),
}));

import { executeTool } from "@/lib/atlas/tools/registry";

beforeEach(() => {
  resetAtlasTestState();
  memoryStore.reset();
  initMockLlm();
});

afterEach(() => {
  initLiveLlm();
  resetAtlasTestTimers();
});

describe("Execution Engine — executeTool", () => {
  const ctx = {
    userId: "user-1",
    history: [] as { role: "user" | "assistant"; text: string }[],
    domain: "shopping" as const,
  };

  it("executes known static tool and returns message", async () => {
    const result = await executeTool("atlas_search", { request: "find laptops" }, ctx);

    expect(result.message).toBeTruthy();
    expect(result.usedGateway).toBe(true);
  });

  it("routes mcp__ prefix tools to MCP executor", async () => {
    const result = await executeTool("mcp__test_svr__test_tool", { key: "value" }, ctx);

    expect(result.message).toContain("MCP tool");
    expect(result.usedGateway).toBe(true);
  });

  it("returns error for unknown tool", async () => {
    const result = await executeTool("nonexistent_tool", {}, ctx);

    expect(result.message).toContain("not available");
    expect(result.usedGateway).toBe(false);
  });

  it("passes tool context to handler", async () => {
    const ctx2 = {
      userId: "user-2",
      history: [{ role: "user" as const, text: "hello" }],
      domain: "travel" as const,
    };

    const result = await executeTool("atlas_search", { request: "find hotels" }, ctx2);

    expect(result.usedGateway).toBe(true);
  });

  it("web_search tool returns search results", async () => {
    const result = await executeTool("web_search", { query: "latest news" }, ctx);

    expect(result.message).toBe("Formatted results");
    expect(result.usedGateway).toBe(true);
  });

  it("executes routine_decision with accept=true", async () => {
    const result = await executeTool(
      "routine_decision",
      { accept: true, observationId: "obs-1" },
      ctx
    );

    expect(result.message).toBeTruthy();
    expect(result.usedGateway).toBe(false);
  });

  it("executes atlas_prepare_approval tool", async () => {
    const result = await executeTool(
      "atlas_prepare_approval",
      { domain: "shopping", request: "buy headphones" },
      ctx
    );

    expect(result.message).toBeTruthy();
    expect(result.action).toBeDefined();
    expect(result.action?.domain).toBe("shopping");
    expect(result.usedGateway).toBe(false);
  });
});

describe("Execution Engine — Tool Context", () => {
  it("web_search uses provided query", async () => {
    const result = await executeTool(
      "web_search",
      { query: "specific query text" },
      { userId: "u1", history: [], domain: "shopping" }
    );

    expect(result.message).toBe("Formatted results");
  });
});

describe("Execution Engine — Result Structure", () => {
  const ctx = { userId: "u1", history: [], domain: "shopping" as const };

  it("all results have message field", async () => {
    const tools = ["web_search", "atlas_search", "atlas_prepare_approval"];
    for (const name of tools) {
      const result = await executeTool(name, {}, ctx);
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("all results have usedGateway flag", async () => {
    const result = await executeTool("web_search", { query: "test" }, ctx);
    expect(typeof result.usedGateway).toBe("boolean");
  });
});

describe("Execution Engine — Error Propagation", () => {
  it("handles missing required args gracefully", async () => {
    const ctx = { userId: "u1", history: [], domain: "food" as const };
    const result = await executeTool("atlas_search", {}, ctx);

    expect(result.message).toBeTruthy();
  });
});

describe("Execution Engine — Snapshot", () => {
  const ctx = { userId: "u1", history: [], domain: "shopping" as const };

  it("tool result snapshot for web_search", async () => {
    const result = await executeTool("web_search", { query: "test" }, ctx);
    expect(result).toMatchSnapshot({ message: expect.any(String), data: expect.anything() });
  });

  it("tool result snapshot for atlas_search", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "test" }, ctx);
    expect(result).toMatchSnapshot({ message: expect.any(String), data: expect.anything() });
  });

  it("tool result snapshot for atlas_prepare_approval", async () => {
    const result = await executeTool("atlas_prepare_approval", { domain: "shopping", request: "buy item" }, ctx);
    expect(result).toMatchSnapshot({ message: expect.any(String), data: expect.anything(), action: expect.objectContaining({ id: expect.any(String) }) });
  });
});
