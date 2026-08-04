import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import { logStructured } from "@/lib/atlas/observability/trace";

// FoodSession — the conversational state for a single food ordering journey.
//
// Working set for one ordering conversation. Backed by an in-memory L1 cache
// with durable WorkflowSession persistence so orders survive restarts and
// multi-instance deploys after hydrateFoodSession() runs at turn start.

export type FoodStep =
  | "idle"
  | "awaiting_address"
  | "browsing_restaurants"
  | "browsing_menu"
  | "building_cart"
  | "awaiting_approval"
  | "pending_payment"
  | "placed";

export interface FoodAddress {
  id: string;
  index: number;
  tag?: string;
  line: string;
}

export interface FoodRestaurant {
  id: string;
  index: number;
  name: string;
  cuisines: string[];
  rating?: number;
  ratingCount?: string;
  etaMinutes?: number;
  etaText?: string;
  costForTwo?: string;
  areaName?: string;
  distanceKm?: number;
  isOpen: boolean;
  closedReason?: string;
  nextOpenTime?: string;
}

export interface FoodMenuItem {
  id: string;
  index: number;
  name: string;
  description?: string;
  price?: number;
  category?: string;
  isVeg?: boolean;
  isBestseller?: boolean;
  rating?: string;
  inStock: boolean;
  hasVariants?: boolean;
  hasAddons?: boolean;
}

export interface FoodCartLine {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  inStock: boolean;
  isVeg?: boolean;
}

export interface FoodTotals {
  itemTotal?: number;
  deliveryCharge?: number;
  taxesAndCharges?: number;
  discount?: number;
  toPay?: number;
  couponApplied?: string | null;
  freeDelivery?: boolean;
}

export interface FoodPaymentMethod {
  id: string;
  displayName: string;
  kind: string;
}

export interface FoodMenuPage {
  page: number;
  pageSize: number;
  totalCategories?: number;
  hasMore: boolean;
}

export interface FoodSession {
  step: FoodStep;

  address?: FoodAddress;
  addressOptions: FoodAddress[];

  restaurant?: FoodRestaurant;
  restaurantOptions: FoodRestaurant[];

  /** Every menu item seen so far this session, so name/number references resolve. */
  menuItems: FoodMenuItem[];
  menuPage?: FoodMenuPage;
  lastDishQuery?: string;

  cartId?: string;
  cart: FoodCartLine[];
  totals: FoodTotals;

  paymentOptions: FoodPaymentMethod[];
  paymentMethod?: FoodPaymentMethod;

  approvalId?: string;
  updatedAt: number;
}

function emptySession(): FoodSession {
  return {
    step: "idle",
    addressOptions: [],
    restaurantOptions: [],
    menuItems: [],
    cart: [],
    totals: {},
    paymentOptions: [],
    updatedAt: Date.now(),
  };
}

const SESSION_TTL_MS = 60 * 60 * 1000;
const KIND = "food";

const sessions = new Map<string, FoodSession>();

function sessionKey(userId: string): string {
  return `food:${userId}`;
}

function isExpired(session: FoodSession): boolean {
  return Date.now() - session.updatedAt > SESSION_TTL_MS;
}

function persistAsync(userId: string, session: FoodSession) {
  const id = sessionKey(userId);
  void prisma.workflowSession
    .upsert({
      where: { id },
      create: {
        id,
        kind: KIND,
        userId: userId === "atlas-demo-user" ? null : userId,
        payload: JSON.stringify(session),
        expiresAt: new Date(session.updatedAt + SESSION_TTL_MS),
      },
      update: {
        payload: JSON.stringify(session),
        expiresAt: new Date(session.updatedAt + SESSION_TTL_MS),
        userId: userId === "atlas-demo-user" ? null : userId,
      },
    })
    .catch((error) => {
      logStructured("food_session.persist_failed", {
        userId,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
}

function deletePersistedAsync(userId: string) {
  void prisma.workflowSession.delete({ where: { id: sessionKey(userId) } }).catch(() => {});
}

/** Load durable session into L1 cache at the start of a turn. */
export async function hydrateFoodSession(userId: string): Promise<FoodSession> {
  const existing = sessions.get(userId);
  if (existing && !isExpired(existing)) {
    return existing;
  }

  try {
    const row = await prisma.workflowSession.findUnique({ where: { id: sessionKey(userId) } });
    if (!row) {
      sessions.delete(userId);
      return emptySession();
    }

    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await prisma.workflowSession.delete({ where: { id: row.id } }).catch(() => {});
      sessions.delete(userId);
      return emptySession();
    }

    const parsed = JSON.parse(row.payload) as FoodSession;
    if (!parsed || typeof parsed !== "object") {
      return emptySession();
    }

    if (isExpired(parsed)) {
      deletePersistedAsync(userId);
      sessions.delete(userId);
      return emptySession();
    }

    sessions.set(userId, parsed);
    return parsed;
  } catch (error) {
    logStructured("food_session.hydrate_failed", {
      userId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return existing && !isExpired(existing) ? existing : emptySession();
  }
}

export function resetFoodSession(userId: string): void {
  sessions.delete(userId);
  deletePersistedAsync(userId);
}

const lastConversationIds = new Map<string, string>();

export function getLastConversationId(userId: string): string | undefined {
  return lastConversationIds.get(userId);
}

export function setLastConversationId(userId: string, conversationId: string): void {
  lastConversationIds.set(userId, conversationId);
}

export function getFoodSession(userId: string): FoodSession {
  const existing = sessions.get(userId);

  if (!existing) return emptySession();

  if (isExpired(existing)) {
    sessions.delete(userId);
    deletePersistedAsync(userId);
    return emptySession();
  }

  return existing;
}

export function updateFoodSession(userId: string, patch: Partial<FoodSession>): FoodSession {
  const next: FoodSession = { ...getFoodSession(userId), ...patch, updatedAt: Date.now() };
  sessions.set(userId, next);
  persistAsync(userId, next);
  return next;
}

export function clearFoodSession(userId: string): void {
  sessions.delete(userId);
  deletePersistedAsync(userId);
}

/**
 * Resets the ordering context but keeps the delivery address, which is the one
 * piece the user almost never wants to re-pick after cancelling an order.
 */
export function resetOrderKeepAddress(userId: string): FoodSession {
  const current = getFoodSession(userId);
  const fresh = emptySession();
  fresh.address = current.address;
  fresh.addressOptions = current.addressOptions;
  fresh.step = current.address ? "browsing_restaurants" : "awaiting_address";
  sessions.set(userId, fresh);
  persistAsync(userId, fresh);
  return fresh;
}

/** Merge newly seen menu items into the session, de-duped by id, keeping stable numbering. */
export function mergeMenuItems(existing: FoodMenuItem[], incoming: Omit<FoodMenuItem, "index">[]): FoodMenuItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  let nextIndex = existing.length;

  for (const item of incoming) {
    const prior = byId.get(item.id);
    if (prior) {
      byId.set(item.id, { ...prior, ...item, index: prior.index });
      continue;
    }
    nextIndex += 1;
    byId.set(item.id, { ...item, index: nextIndex });
  }

  return Array.from(byId.values()).sort((a, b) => a.index - b.index);
}
