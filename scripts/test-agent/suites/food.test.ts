import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initMockLlm, initLiveLlm } from "../adapters";
import { resetAtlasTestState, resetAtlasTestTimers } from "../reset";
import { memoryStore } from "../helpers/memory-store";
import { dummyPaymentProvider } from "../helpers/dummy-payment";
import { routineObsStore } from "../helpers/prisma-mock";

const MOCK_ADDRESSES = [
  { id: "addr_1", line: "123 MG Road, Indiranagar, Bengaluru 560038", label: "Home" },
  { id: "addr_2", line: "456 Brigade Road, Bengaluru 560001", label: "Work" },
];

const MOCK_RESTAURANTS = [
  { id: "rest_1", name: "Meghana Foods", cuisines: ["Biryani", "Andhra"], avgRating: 4.5, deliveryTimeRange: "30-35 min", costForTwo: "₹500", availabilityStatus: "OPEN" },
  { id: "rest_2", name: "Paradise Biryani", cuisines: ["Biryani", "Mughlai"], avgRating: 4.2, deliveryTimeRange: "40-45 min", costForTwo: "₹450", availabilityStatus: "OPEN" },
  { id: "rest_3", name: "Closed Kitchen", cuisines: ["Fast Food"], avgRating: 3.8, deliveryTimeRange: "25 min", costForTwo: "₹300", availabilityStatus: "CLOSED" },
];

const MOCK_MENU = [
  { id: "item_1", name: "Chicken Biryani", category: "Biryani", price: "₹320", veg: false, available: true },
  { id: "item_2", name: "Mutton Biryani", category: "Biryani", price: "₹380", veg: false, available: true },
  { id: "item_3", name: "Paneer Biryani", category: "Biryani", price: "₹280", veg: true, available: true },
  { id: "item_4", name: "Gulab Jamun", category: "Desserts", price: "₹120", veg: true, available: true },
  { id: "item_5", name: "Coke 500ml", category: "Beverages", price: "₹60", veg: true, available: false },
];

const MOCK_PAYMENT_METHODS = [
  { id: "pm_1", displayName: "Google Pay (UPI)", kind: "upi" as const },
  { id: "pm_2", displayName: "Cash on Delivery", kind: "cash" as const },
  { id: "pm_3", displayName: "PhonePe (UPI)", kind: "upi" as const },
];

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
    approval: { create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `approval_${Date.now()}`, ...args.data, status: "pending", createdAt: new Date(), completedAt: null })), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }), findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    domain: { findMany: vi.fn().mockResolvedValue([]) },
    routingRule: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
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
    routine: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
    routineObservation: {
      findMany: vi.fn(() => Promise.resolve(routineObsStore.findMany())),
      findUnique: vi.fn((args: { where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } } }) => Promise.resolve(routineObsStore.findUnique(args.where))),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `obs_${Date.now()}`, ...args.data })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn((args: { where: { userId_domain_fingerprint: { userId: string; domain: string; fingerprint: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise.resolve(routineObsStore.upsert(args))),
    },
    execution: { create: vi.fn().mockResolvedValue({ id: "e1", goal: "", status: "planning", planJson: "{}", stateJson: "{}", resultsJson: "[]", metadataJson: "{}" }), update: vi.fn().mockResolvedValue({}) },
    executionEvent: { create: vi.fn().mockResolvedValue({}) },
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

vi.mock("@/lib/atlas/effects", () => ({
  emitEffect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/atlas/mcp/food-log", () => ({ foodLog: vi.fn(), logSessionState: vi.fn() }));

vi.mock("@/lib/atlas/mcp/router", () => ({
  routeToolCall: vi.fn(async (domain: string, intent: string, args: Record<string, unknown>, toolName?: string) => {
    if (toolName === "get_addresses") {
      return {
        message: "Addresses loaded.",
        data: {
          addresses: MOCK_ADDRESSES.map((a) => ({ id: a.id, addressTag: a.label, addressLine: a.line })),
          pagination: { hasMore: false },
        },
        serverName: "food",
        toolName: "get_addresses",
      };
    }
    if (toolName === "search_restaurants") {
      return { message: "Restaurants found.", data: { restaurants: MOCK_RESTAURANTS }, serverName: "food", toolName: "search_restaurants" };
    }
    if (toolName === "discover_by_dish") {
      return { message: "Dish results.", data: { restaurants: MOCK_RESTAURANTS.slice(0, 1) }, serverName: "food", toolName: "discover_by_dish" };
    }
    if (toolName === "fetch_menu") {
      return { message: "Menu loaded.", data: { menu: MOCK_MENU.map((m, i) => ({ ...m, menuItemId: m.id, index: i + 1 })), pagination: { hasMore: false } }, serverName: "food", toolName: "fetch_menu" };
    }
    if (toolName === "search_dishes") {
      return { message: "Dishes found.", data: { dishes: [MOCK_MENU[0]] }, serverName: "food", toolName: "search_dishes" };
    }
    if (toolName === "write_cart") {
      return { message: "Cart updated.", data: { cartId: "cart_1", lines: [{ id: "item_1", name: "Chicken Biryani", price: "₹320", quantity: 2, total: "₹640" }], totals: { subtotal: "₹640", delivery: "₹40", tax: "₹34", discount: "₹0", total: "₹714" }, restaurantName: "Meghana Foods" }, serverName: "food", toolName: "write_cart" };
    }
    if (toolName === "fetch_cart") {
      return { message: "Cart.", data: { cartId: "cart_1", lines: [{ id: "item_1", name: "Chicken Biryani", price: "₹320", quantity: 2, total: "₹640" }], totals: { subtotal: "₹640", delivery: "₹40", tax: "₹34", discount: "₹0", total: "₹714" }, restaurantName: "Meghana Foods" }, serverName: "food", toolName: "fetch_cart" };
    }
    if (toolName === "get_payment_options") {
      return {
        message: "Payment methods.",
        data: {
          platforms: {
            upi: { methods: [{ id: "pm_1", displayName: "Google Pay", kind: "upi" }, { id: "pm_3", displayName: "PhonePe", kind: "upi" }] },
            cash: { methods: [{ id: "pm_2", displayName: "Cash on Delivery", kind: "cash" }] },
          },
        },
        serverName: "food",
        toolName: "get_payment_options",
      };
    }
    if (toolName === "place_order") {
      return { message: "Order placed.", data: { orderId: "ord_1", status: "PLACED", upiLink: "upi://pay", upiQr: "qr_code", paymentRef: "pay_1", cartId: "cart_1", lat: 12.97, lng: 77.59 }, serverName: "food", toolName: "place_order" };
    }
    if (toolName === "flush_cart") {
      return { message: "Cart flushed.", data: {}, serverName: "food", toolName: "flush_cart" };
    }
    return { message: "Mock food MCP response.", data: {}, serverName: "food", toolName: toolName ?? "unknown" };
  }),
  routeGlobalToolCall: vi.fn().mockResolvedValue({ message: "global", data: {}, serverName: "global", toolName: "test" }),
}));

import { ensureAddress, discoverRestaurants, selectRestaurant, loadMenu, updateCart, showCart, checkout, cancelOrder } from "@/lib/atlas/mcp/food-service";
import { getFoodSession, clearFoodSession } from "@/lib/atlas/mcp/food-session";

beforeEach(() => {
  resetAtlasTestState();
  memoryStore.reset();
  routineObsStore.reset();
  dummyPaymentProvider.reset();
  initMockLlm();
  clearFoodSession("user-1");
});

afterEach(() => {
  initLiveLlm();
  resetAtlasTestTimers();
  clearFoodSession("user-1");
});

describe("Food — Happy Path Ordering", () => {
  it("ensureAddress lists delivery addresses", async () => {
    const result = await ensureAddress("user-1");
    expect(result.awaitingUser).toBe(true);
    expect(result.reply).toContain("Home");
    expect(result.reply).toContain("Work");
  });

  it("ensureAddress with reference selects address", async () => {
    await ensureAddress("user-1", "Home");
    const session = getFoodSession("user-1");
    expect(session.address).toBeDefined();
    expect(session.address?.tag).toBe("Home");
  });

  it("full address → restaurant → menu flow", async () => {
    await ensureAddress("user-1", "Home");
    const session1 = getFoodSession("user-1");
    expect(session1.address?.id).toBe("addr_1");

    const restResult = await discoverRestaurants("user-1", "biryani");
    expect(restResult.reply).toContain("Meghana");
    expect(restResult.reply).toContain("Paradise");
    expect(restResult.awaitingUser).toBe(true);

    const session2 = getFoodSession("user-1");
    expect(session2.restaurantOptions).toBeDefined();
    expect(session2.restaurantOptions!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Food — Restaurant Selection & Menu", () => {
  it("selectRestaurant picks a restaurant", async () => {
    await ensureAddress("user-1", "Home");
    await discoverRestaurants("user-1", "biryani");

    const result = await selectRestaurant("user-1", "Meghana");
    expect(result.reply).toContain("Meghana");

    const session = getFoodSession("user-1");
    expect(session.restaurant).toBeDefined();
    expect(session.restaurant?.name).toBe("Meghana Foods");
    expect(session.menuItems).toBeDefined();
  });

  it("rejects closed restaurant", async () => {
    await ensureAddress("user-1", "Home");
    await discoverRestaurants("user-1", "biryani");

    const result = await selectRestaurant("user-1", "Closed Kitchen");
    expect(result.awaitingUser).toBe(true);
  });
});

describe("Food — Cart Operations", () => {
  beforeEach(async () => {
    await ensureAddress("user-1", "Home");
    await discoverRestaurants("user-1", "biryani");
    await selectRestaurant("user-1", "Meghana");
  });

  it("adds items to cart", async () => {
    const result = await updateCart("user-1", "add Chicken Biryani");
    expect(result.reply).toBeTruthy();
  });

  it("shows current cart", async () => {
    await updateCart("user-1", "add Chicken Biryani");
    const result = await showCart("user-1");
    expect(result.reply).toBeTruthy();
  });

  it("cancelOrder clears cart and resets", async () => {
    await updateCart("user-1", "add Chicken Biryani");
    await cancelOrder("user-1");

    const session = getFoodSession("user-1");
    expect(session.step).not.toBe("building_cart");
  });
});

describe("Food — Checkout & Approval", () => {
  beforeEach(async () => {
    await ensureAddress("user-1", "Home");
    await discoverRestaurants("user-1", "biryani");
    await selectRestaurant("user-1", "Meghana");
    await updateCart("user-1", "add Chicken Biryani");
  });

  it("checkout produces a result", async () => {
    const result = await checkout("user-1");
    expect(result.reply).toBeTruthy();
    expect(result.awaitingUser !== undefined).toBe(true);
  });
});

describe("Food — Dummy Payment", () => {
  it("creates payment with success scenario", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "success");
    expect(payment.paymentId).toMatch(/^pay_/);
    expect(payment.amount).toBe(500);
    expect(payment.status).toBe("created");
  });

  it("confirmPayment resolves success scenario", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "success");
    const result = dummyPaymentProvider.confirmPayment(payment.paymentId)!;
    expect(result.status).toBe("success");
  });

  it("pending_then_success transitions through pending", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "pending_then_success");
    const s1 = dummyPaymentProvider.checkStatus(payment.paymentId)!;
    expect(s1.status).toBe("pending");
    const s2 = dummyPaymentProvider.checkStatus(payment.paymentId)!;
    expect(s2.status).toBe("success");
  });

  it("failure scenario returns failed", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "failure");
    const result = dummyPaymentProvider.confirmPayment(payment.paymentId)!;
    expect(result.status).toBe("failed");
  });

  it("cancelPayment marks as cancelled", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "success");
    const result = dummyPaymentProvider.cancelPayment(payment.paymentId)!;
    expect(result.status).toBe("cancelled");
  });

  it("timeout scenario throws on checkStatus", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "timeout");
    expect(() => dummyPaymentProvider.checkStatus(payment.paymentId)).toThrow("timed out");
  });

  it("network_error scenario throws on checkStatus", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "network_error");
    expect(() => dummyPaymentProvider.checkStatus(payment.paymentId)).toThrow("Network error");
  });

  it("idempotent_retry succeeds on second attempt", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "idempotent_retry");
    dummyPaymentProvider.confirmPayment(payment.paymentId);
    const result = dummyPaymentProvider.confirmPayment(payment.paymentId)!;
    expect(result.status).toBe("success");
  });

  it("duplicate payment fails on second attempt", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "duplicate");
    dummyPaymentProvider.confirmPayment(payment.paymentId);
    const result = dummyPaymentProvider.confirmPayment(payment.paymentId)!;
    expect(result.status).toBe("failed");
  });

  it("fireWebhook sets webhookSent", () => {
    const payment = dummyPaymentProvider.createPayment(500, "INR", "success");
    const result = dummyPaymentProvider.fireWebhook(payment.paymentId)!;
    expect(result.webhookSent).toBe(true);
  });
});

describe("Food — Memory Updates", () => {
  it("rememberPlain stores food preferences", async () => {
    const { memoryService } = await import("@/lib/atlas/memory/service");
    await memoryService.rememberPlain("user-1", "I like Hyderabadi biryani", { type: "food" });
    const list = await memoryService.listForUser("user-1");
    expect(list.length).toBe(1);
    expect(list[0].text).toContain("biryani");
  });
});

describe("Food — Routine Observation", () => {
  it("observe increments repetition count", async () => {
    const { routines } = await import("@/lib/atlas/routines");
    const r1 = await routines.observe("user-1", { domain: "food", payload: { dish: "biryani" }, summary: "chicken biryani" });
    const r2 = await routines.observe("user-1", { domain: "food", payload: { dish: "biryani" }, summary: "chicken biryani" });
    const r3 = await routines.observe("user-1", { domain: "food", payload: { dish: "biryani" }, summary: "chicken biryani" });

    expect(r3.suggested).toBe(true);
    expect(r3.message).toContain("remember");
  });

  it("accept creates a routine", async () => {
    const { routines } = await import("@/lib/atlas/routines");
    const o1 = await routines.observe("user-1", { domain: "food", payload: { dish: "biryani" }, summary: "chicken biryani" });
    await routines.observe("user-1", { domain: "food", payload: { dish: "biryani" }, summary: "chicken biryani" });
    const o3 = await routines.observe("user-1", { domain: "food", payload: { dish: "biryani" }, summary: "chicken biryani" });

    expect(o3.suggested).toBe(true);
  });
});

describe("Food — Snapshots", () => {
  it("restaurant discovery snapshot", async () => {
    await ensureAddress("user-1", "Home");
    const result = await discoverRestaurants("user-1", "biryani");
    expect({ reply: result.reply.substring(0, 50), awaitingUser: result.awaitingUser }).toMatchSnapshot();
  });

  it("checkout snapshot", async () => {
    await ensureAddress("user-1", "Home");
    await discoverRestaurants("user-1", "biryani");
    await selectRestaurant("user-1", "Meghana");
    await updateCart("user-1", "add Chicken Biryani");
    const result = await checkout("user-1");
    expect(result).toMatchSnapshot({ reply: expect.any(String) });
  });
});
