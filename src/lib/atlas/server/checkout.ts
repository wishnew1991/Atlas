import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import { TIER_LABELS, type TierId } from "@/lib/atlas/server/tiers";
import { CURRENCY, UPI_MERCHANT_NAME, UPI_MERCHANT_VPA } from "@/lib/atlas/tiers";

export interface UpiOrder {
  orderId: string;
  userId: string;
  plan: TierId;
  amountInr: number;
  upiId: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "completed" | "expired";
}

/**
 * Raised when a checkout order cannot be created or completed.
 * Kept minimal so the route can map it straight to a 4xx response.
 */
export class CheckoutError extends Error {}

const ORDERS_KEY = "checkout:orders";
/** UPI collect orders are only considered paid within this window. */
const ORDER_TTL_MS = 15 * 60 * 1000;

let ordersCache: { value: string } | null = null;

function readOrders(): Record<string, UpiOrder> {
  try {
    const stored = ordersCache?.value;
    if (stored) return JSON.parse(stored);
  } catch {
    // fall through to the prisma read below
  }
  return {};
}

async function loadOrders(): Promise<Record<string, UpiOrder>> {
  const row = await prisma.setting.findUnique({ where: { key: ORDERS_KEY } });
  ordersCache = row ? { value: row.value } : null;
  return readOrders();
}

async function persistOrders(orders: Record<string, UpiOrder>): Promise<void> {
  const value = JSON.stringify(orders);
  ordersCache = { value };
  await prisma.setting.upsert({
    where: { key: ORDERS_KEY },
    update: { value },
    create: { key: ORDERS_KEY, value },
  });
}

function buildIntentUri(order: UpiOrder): string {
  const params = new URLSearchParams({
    pa: UPI_MERCHANT_VPA,
    pn: UPI_MERCHANT_NAME,
    am: String(order.amountInr),
    cu: CURRENCY,
    tn: `Atlas ${TIER_LABELS[order.plan]}`,
  });
  return `upi://pay?${params.toString()}`;
}

const UPGRADE_PRICE_INR: Partial<Record<TierId, number>> = { premium: 99, vip: 299 };

/** Create a pending UPI collect order for an upgrade (demo PSP, real intent link). */
export async function createUpiOrderForUser(
  userId: string,
  plan: TierId,
  upiId: string
): Promise<{ order: UpiOrder; intentUri: string }> {
  const amount = UPGRADE_PRICE_INR[plan];
  if (!amount || amount <= 0) {
    throw new CheckoutError("That plan is not available to purchase.");
  }
  if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
    throw new CheckoutError("Enter a valid UPI ID like you@bank.");
  }

  const now = Date.now();
  const orderId = `upi_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const order: UpiOrder = {
    orderId,
    userId,
    plan,
    amountInr: amount,
    upiId,
    createdAt: now,
    expiresAt: now + ORDER_TTL_MS,
    status: "pending",
  };

  const orders = await loadOrders();
  orders[orderId] = order;
  await persistOrders(orders);

  return { order, intentUri: buildIntentUri(order) };
}

/** Mark a pending order paid and return the purchased plan (demo PSP). */
export async function completeUpiOrder(userId: string, orderId: string): Promise<{ plan: TierId }> {
  const orders = await loadOrders();
  const order = orders[orderId];
  if (!order || order.userId !== userId) {
    throw new CheckoutError("That payment reference was not found for this account.");
  }
  if (order.status !== "pending") {
    throw new CheckoutError("This payment has already been processed.");
  }
  if (Date.now() > order.expiresAt) {
    order.status = "expired";
    await persistOrders(orders);
    throw new CheckoutError("This payment link has expired. Please try again.");
  }

  order.status = "completed";
  await persistOrders(orders);
  return { plan: order.plan };
}