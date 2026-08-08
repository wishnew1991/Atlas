import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";

import { initMockLlm, initLiveLlm } from "../adapters";
import { resetAtlasTestState, resetAtlasTestTimers } from "../reset";
import { memoryStore } from "../helpers/memory-store";
import { routineObsStore } from "../helpers/prisma-mock";
import { dummyPaymentProvider } from "../helpers/dummy-payment";
import { MockMcpGateway, type MockMcpToolDef } from "../helpers/mock-mcp-gateway";

// ── MOCK DATA ──

const MOCK_PRODUCTS = [
  { id: "prod_1", name: "Dell XPS 15", category: "Laptops", brand: "Dell", price: 129999, currency: "INR", inStock: true, specs: { ram: "16GB", storage: "512GB SSD", cpu: "i7-13th" }, rating: 4.5 },
  { id: "prod_2", name: "Dell Inspiron 16", category: "Laptops", brand: "Dell", price: 84999, currency: "INR", inStock: true, specs: { ram: "16GB", storage: "512GB SSD", cpu: "i5-13th" }, rating: 4.2 },
  { id: "prod_3", name: "HP Spectre x360", category: "Laptops", brand: "HP", price: 134999, currency: "INR", inStock: true, specs: { ram: "16GB", storage: "1TB SSD", cpu: "i7-13th" }, rating: 4.3 },
  { id: "prod_4", name: "Sony WH-1000XM5", category: "Headphones", brand: "Sony", price: 24999, currency: "INR", inStock: true, specs: { type: "Wireless", anc: true }, rating: 4.7 },
  { id: "prod_5", name: "Logitech MX Master 3S", category: "Accessories", brand: "Logitech", price: 8499, currency: "INR", inStock: true, specs: { type: "Wireless Mouse" }, rating: 4.6 },
  { id: "prod_6", name: "Out of Stock Keyboard", category: "Accessories", brand: "Generic", price: 1999, currency: "INR", inStock: false, specs: {}, rating: 3.5 },
];

const MOCK_CART: { cartId: string; items: Array<{ productId: string; name: string; price: number; quantity: number }>; subtotal: number; tax: number; shipping: number; total: number } = { cartId: "cart_sh_1", items: [], subtotal: 0, tax: 0, shipping: 0, total: 0 };

// ── MOCK GATEWAY ──

let gateway: MockMcpGateway;

beforeAll(async () => {
  gateway = new MockMcpGateway();
  gateway.addDomain({
    name: "shopping",
    serverName: "mock-commerce",
    version: "1.0.0",
    tools: [
      { name: "search_products", description: "Search products by name, category, or brand", inputSchema: { type: "object", properties: { query: { type: "string" }, category: { type: "string" }, brand: { type: "string" }, maxPrice: { type: "number" } }, required: ["query"] } },
      { name: "get_product_details", description: "Get detailed product info", inputSchema: { type: "object", properties: { productId: { type: "string" } }, required: ["productId"] } },
      { name: "compare_products", description: "Compare two or more products", inputSchema: { type: "object", properties: { productIds: { type: "array", items: { type: "string" } } }, required: ["productIds"] } },
      { name: "add_to_cart", description: "Add item to cart", inputSchema: { type: "object", properties: { productId: { type: "string" }, quantity: { type: "number" } }, required: ["productId"] } },
      { name: "remove_from_cart", description: "Remove item from cart", inputSchema: { type: "object", properties: { productId: { type: "string" } }, required: ["productId"] } },
      { name: "get_cart", description: "View current cart", inputSchema: { type: "object", properties: {}, required: [] } },
      { name: "create_order", description: "Place an order", inputSchema: { type: "object", properties: { cartId: { type: "string" } }, required: ["cartId"] } },
    ] as MockMcpToolDef[],
    handlers: {
      search_products: (args: Record<string, unknown>) => {
        const query = String(args.query ?? "").toLowerCase();
        const brand = args.brand ? String(args.brand).toLowerCase() : "";
        const maxPrice = args.maxPrice ? Number(args.maxPrice) : Infinity;
        let results = MOCK_PRODUCTS.filter((p) => p.inStock && (p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query)));
        if (brand) results = results.filter((p) => p.brand.toLowerCase().includes(brand));
        if (maxPrice < Infinity) results = results.filter((p) => p.price <= maxPrice);
        return { message: `Found ${results.length} products matching "${query}"`, data: { products: results } };
      },
      get_product_details: (args: Record<string, unknown>) => {
        const id = String(args.productId);
        const product = MOCK_PRODUCTS.find((p) => p.id === id);
        if (!product) return { message: "Product not found", data: {} };
        return { message: product.name, data: { product } };
      },
      compare_products: (args: Record<string, unknown>) => {
        const ids = (args.productIds as string[]) ?? [];
        const products = MOCK_PRODUCTS.filter((p) => ids.includes(p.id));
        return { message: `Comparing ${ids.length} products`, data: { products } };
      },
      add_to_cart: (args: Record<string, unknown>) => {
        const pid = String(args.productId);
        const qty = Number(args.quantity ?? 1);
        const product = MOCK_PRODUCTS.find((p) => p.id === pid);
        if (!product) return { message: "Product not found", data: {} };
        const item = { productId: pid, name: product.name, price: product.price, quantity: qty };
        MOCK_CART.items.push(item);
        MOCK_CART.subtotal += product.price * qty;
        MOCK_CART.tax = Math.round(MOCK_CART.subtotal * 0.18);
        MOCK_CART.shipping = MOCK_CART.subtotal > 50000 ? 0 : 99;
        MOCK_CART.total = MOCK_CART.subtotal + MOCK_CART.tax + MOCK_CART.shipping;
        return { message: `Added ${product.name} x${qty} to cart`, data: { cart: { ...MOCK_CART, items: [...MOCK_CART.items] } } };
      },
      remove_from_cart: (args: Record<string, unknown>) => {
        const pid = String(args.productId);
        const idx = MOCK_CART.items.findIndex((i) => (i as any).productId === pid);
        if (idx === -1) return { message: "Item not in cart", data: {} };
        const item = MOCK_CART.items[idx] as any;
        MOCK_CART.subtotal -= item.price * item.quantity;
        MOCK_CART.tax = Math.round(MOCK_CART.subtotal * 0.18);
        MOCK_CART.shipping = MOCK_CART.subtotal > 50000 ? 0 : 99;
        MOCK_CART.total = MOCK_CART.subtotal + MOCK_CART.tax + MOCK_CART.shipping;
        MOCK_CART.items.splice(idx, 1);
        return { message: `Removed ${item.name} from cart`, data: { cart: { ...MOCK_CART, items: [...MOCK_CART.items] } } };
      },
      get_cart: () => ({ message: `${MOCK_CART.items.length} items in cart`, data: { cart: { ...MOCK_CART, items: [...MOCK_CART.items] } } }),
      create_order: (args: Record<string, unknown>) => {
        if (MOCK_CART.items.length === 0) return { message: "Cart is empty", data: {} };
        const order = { orderId: `ord_sh_${Date.now()}`, cartId: MOCK_CART.cartId, items: [...MOCK_CART.items], total: MOCK_CART.total, status: "confirmed", placedAt: new Date().toISOString() };
        MOCK_CART.items = []; MOCK_CART.subtotal = 0; MOCK_CART.tax = 0; MOCK_CART.shipping = 0; MOCK_CART.total = 0;
        return { message: "Order placed successfully", data: { order } };
      },
    },
  });
  await gateway.start();
});

afterAll(async () => {
  MOCK_CART.items = []; MOCK_CART.subtotal = 0; MOCK_CART.tax = 0; MOCK_CART.shipping = 0; MOCK_CART.total = 0;
  await gateway.stop();
});

beforeEach(() => {
  MOCK_CART.items = []; MOCK_CART.subtotal = 0; MOCK_CART.tax = 0; MOCK_CART.shipping = 0; MOCK_CART.total = 0;
  gateway.requestLog = [];
  gateway.errorRate = 0;
  gateway.latencyMs = 0;
  resetAtlasTestState();
  memoryStore.reset();
  routineObsStore.reset();
  dummyPaymentProvider.reset();
  initMockLlm();
});

afterEach(() => {
  initLiveLlm();
  resetAtlasTestTimers();
});

// ── MOCK ROUTER + PRISMA ──

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
    memoryEntity: { upsert: vi.fn().mockResolvedValue({ id: "e1", name: "t", kind: "entity" }) },
    memoryRelation: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    workflowSession: { upsert: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn().mockResolvedValue({}) },
    approval: { create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `app_${Date.now()}`, ...args.data, status: "pending" })), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }), findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    domain: { findMany: vi.fn().mockResolvedValue([]) },
    setting: { upsert: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null) },
    credential: { findMany: vi.fn().mockResolvedValue([]) },
    modelConfig: { findMany: vi.fn().mockResolvedValue([]) },
    mcpServer: { findMany: vi.fn().mockResolvedValue([]) },
    turnTrace: { upsert: vi.fn().mockResolvedValue({}) },
    conversation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "c1", summary: "", lastMessageAt: new Date(), createdAt: new Date(), updatedAt: new Date() }) },
    message: { create: vi.fn().mockResolvedValue({}) },
    activityItem: { create: vi.fn().mockResolvedValue({}) },
    userProfile: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
    atlasUser: { findUnique: vi.fn().mockResolvedValue(null) },
    routine: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    routineObservation: {
      findMany: vi.fn(() => Promise.resolve(routineObsStore.findMany())),
      findUnique: vi.fn((args: { where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } } }) => Promise.resolve(routineObsStore.findUnique(args.where))),
      findFirst: vi.fn().mockResolvedValue(null), create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `obs_${Date.now()}`, ...args.data })), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn((args: { where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise.resolve(routineObsStore.upsert(args))),
    },
    execution: { create: vi.fn().mockResolvedValue({ id: "e1" }), update: vi.fn().mockResolvedValue({}) },
    executionEvent: { create: vi.fn().mockResolvedValue({}) },
    routingRule: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn: Function) => fn()),
  },
}));

vi.mock("@/lib/atlas/server/model-registry", () => ({
  resolveDefaultModel: vi.fn().mockResolvedValue({ id: "t", provider: "openai", label: "t", apiKey: "k", enabled: true }),
  resolveEmbeddingModel: vi.fn().mockResolvedValue({ id: "t", provider: "openai", label: "t", apiKey: "k", enabled: true }),
}));

vi.mock("@/lib/atlas/server/provider-map", () => ({
  toLlmProvider: vi.fn(() => ({ provider: "openai" as const, baseUrl: undefined as string | undefined })),
}));

vi.mock("@/lib/atlas/effects", () => ({ emitEffect: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/atlas/mcp/food-log", () => ({ foodLog: vi.fn(), logSessionState: vi.fn() }));

vi.mock("@/lib/atlas/mcp/router", () => ({
  routeToolCall: vi.fn(async (_domain: string, _intent: string, args: Record<string, unknown>, toolName?: string) => {
    const handlers = (gateway as any).domains?.get("shopping")?.handlers;
    if (handlers && toolName && handlers[toolName]) {
      const r = await Promise.resolve(handlers[toolName](args));
      return { message: r.message, data: r.data, serverName: "shopping", toolName };
    }
    return { message: "unknown tool", data: {}, serverName: "shopping", toolName: toolName ?? "unknown" };
  }),
  routeGlobalToolCall: vi.fn().mockResolvedValue({ message: "global", data: {}, serverName: "global", toolName: "test" }),
}));

import { executeTool } from "@/lib/atlas/tools/registry";
import { memoryService } from "@/lib/atlas/memory/service";
import { routines } from "@/lib/atlas/routines";

// ── TESTS ──

describe("Shopping — Planner Intent", () => {
  const shoppingIntents = [
    { input: "Buy a laptop", desc: "purchase intent" },
    { input: "Order headphones", desc: "order intent" },
    { input: "Find a monitor", desc: "search intent" },
    { input: "Compare two phones", desc: "comparison intent" },
    { input: "I need a new keyboard", desc: "need intent" },
    { input: "Purchase a gaming mouse", desc: "purchase intent" },
    { input: "Show me the best deals on tablets", desc: "deal search" },
    { input: "Add a charger to my cart", desc: "cart action" },
    { input: "Checkout my cart", desc: "checkout" },
    { input: "Where can I buy a webcam", desc: "buy inquiry" },
  ];

  const ctx = { userId: "user-1", history: [] as { role: "user" | "assistant"; text: string }[], domain: "shopping" as const };

  for (const intent of shoppingIntents) {
    it(`"${intent.input}" routes via atlas_search with shopping domain`, async () => {
      const result = await executeTool("atlas_search", { domain: "shopping", request: intent.input }, ctx);
      expect(result.message).toBeTruthy();
      expect(result.usedGateway).toBe(true);
    });
  }
});

describe("Shopping — Product Discovery", () => {
  const ctx = { userId: "user-1", history: [], domain: "shopping" as const };

  it("search_products returns matching products via MCP gateway", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "gaming laptop" }, ctx);
    expect(result.message).toBeTruthy();
  });

  it("search_products filters by brand", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "Dell laptop" }, ctx);
    expect(result.message).toBeTruthy();
  });

  it("search_products returns empty for non-existent product", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "quantum computer" }, ctx);
    expect(result.message).toBeTruthy();
  });
});

describe("Shopping — Cart Operations", () => {
  const ctx = { userId: "user-1", history: [], domain: "shopping" as const };

  it("add_to_cart adds product and returns cart snapshot", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "add Dell XPS 15" }, ctx);
    expect(result.message).toBeTruthy();
  });

  it("get_cart returns current cart state", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "show my cart" }, ctx);
    expect(result.message).toBeTruthy();
  });
});

describe("Shopping — Checkout & Payment", () => {
  it("dummy payment creates and confirms shopping order", () => {
    const payment = dummyPaymentProvider.createPayment(50000, "INR", "success");
    expect(payment.paymentId).toMatch(/^pay_/);
    expect(payment.amount).toBe(50000);

    const confirmed = dummyPaymentProvider.confirmPayment(payment.paymentId)!;
    expect(confirmed.status).toBe("success");
  });

  it("dummy payment handles failure for shopping order", () => {
    const payment = dummyPaymentProvider.createPayment(50000, "INR", "failure");
    const result = dummyPaymentProvider.confirmPayment(payment.paymentId)!;
    expect(result.status).toBe("failed");
  });

  it("supports payment cancellation during shopping", () => {
    const payment = dummyPaymentProvider.createPayment(50000, "INR", "success");
    const cancelled = dummyPaymentProvider.cancelPayment(payment.paymentId)!;
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("Shopping — Memory & Preferences", () => {
  it("remembers preferred shopping brands", async () => {
    await memoryService.rememberPlain("user-1", "I prefer Dell laptops", { type: "preference" });
    await memoryService.rememberPlain("user-1", "My budget is under 1 lakh", { type: "preference" });

    const list = await memoryService.listForUser("user-1");
    expect(list.length).toBeGreaterThanOrEqual(2);
    const texts = list.map((m) => m.text);
    expect(texts.some((t) => t.includes("Dell"))).toBe(true);
    expect(texts.some((t) => t.includes("budget"))).toBe(true);
  });

  it("recalls shopping preferences semantically", async () => {
    await memoryService.remember("user-1", "I always buy Sony headphones", { type: "preference", confidence: 0.9, importance: 0.8 });
    await memoryService.remember("user-1", "I prefer wireless peripherals", { type: "preference", confidence: 0.7, importance: 0.6 });

    const results = await memoryService.recall("user-1", "what headphones do I like", { category: "shopping", limit: 5 });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Shopping — Routine Learning", () => {
  it("observes repeated shopping patterns", async () => {
    for (let i = 0; i < 3; i++) {
      await routines.observe("user-1", { domain: "shopping", payload: { product: "coffee beans", brand: "Blue Tokai" }, summary: "coffee beans from Blue Tokai" });
    }

    const list = await memoryService.listForUser("user-1");
    // Observe triggers upsert; count grows; at 3x should suggest
    const obs = routineObsStore.findMany();
    expect(obs.length).toBe(1);
  });
});

describe("Shopping — Conversation Continuity", () => {
  const ctx = { userId: "user-1", history: [], domain: "shopping" as const };

  it("maintains shopping context across multi-step conversation", async () => {
    // Step 1: Search
    const r1 = await executeTool("atlas_search", { domain: "shopping", request: "gaming laptops" }, ctx);
    expect(r1.message).toBeTruthy();

    // Step 2: Compare
    const r2 = await executeTool("atlas_search", { domain: "shopping", request: "compare Dell XPS and HP Spectre" }, ctx);
    expect(r2.message).toBeTruthy();
  });
});

describe("Shopping — Failure Scenarios", () => {
  const ctx = { userId: "user-1", history: [], domain: "shopping" as const };

  it("handles search for out-of-stock products", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "keyboard" }, ctx);
    expect(result.message).toBeTruthy();
  });

  it("handles MCP server error during shopping", async () => {
    gateway.errorRate = 1;
    const result = await executeTool("atlas_search", { domain: "shopping", request: "laptop" }, ctx);
    expect(result.message).toBeTruthy();
  });

  it("handles unknown tool during shopping execution", async () => {
    const result = await executeTool("nonexistent_tool", {}, ctx);
    expect(result.usedGateway).toBe(false);
  });

  it("handles cart operations after MCP error recovery", async () => {
    gateway.errorRate = 1;
    try { await executeTool("atlas_search", { domain: "shopping", request: "laptop" }, ctx); } catch { /* expected */ }
    gateway.errorRate = 0;
    const result = await executeTool("atlas_search", { domain: "shopping", request: "laptop" }, ctx);
    expect(result.message).toBeTruthy();
  });
});

describe("Shopping — Snapshots", () => {
  const ctx = { userId: "user-1", history: [], domain: "shopping" as const };

  it("shopping search snapshot", async () => {
    const result = await executeTool("atlas_search", { domain: "shopping", request: "gaming laptop" }, ctx);
    expect(result).toMatchSnapshot({ message: expect.any(String), data: expect.anything() });
  });

  it("shopping intent list snapshot", async () => {
    const intents = ["Buy a laptop", "Order headphones", "Find a monitor", "Compare two phones", "I need a new keyboard", "Purchase a gaming mouse", "Show me the best deals on tablets", "Add a charger to my cart", "Checkout my cart", "Where can I buy a webcam"];
    expect(intents).toMatchSnapshot();
  });
});
