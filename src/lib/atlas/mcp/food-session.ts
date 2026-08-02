import "server-only";

// FoodSession — the conversational state for a single food ordering journey.
//
// This is deliberately a *temporary* store, independent of the Memory Service
// and Knowledge Graph. Nothing here is a long-term fact about the user; it is
// the working set for one ordering conversation (which address they picked,
// which restaurant they are browsing, what the live cart looks like).
//
// The LLM orchestrates the flow by calling granular food tools. It never sees
// or handles raw Swiggy identifiers — those live here, keyed by userId, and are
// resolved server-side from the natural-language references the user gives
// ("the second one", "Meghana", "make it two").

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

// Sessions expire so a stale address/restaurant from hours ago never leaks into
// a brand-new ordering conversation.
const SESSION_TTL_MS = 60 * 60 * 1000;

const sessions = new Map<string, FoodSession>();

export function getFoodSession(userId: string): FoodSession {
  const existing = sessions.get(userId);

  if (!existing) return emptySession();

  if (Date.now() - existing.updatedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return emptySession();
  }

  return existing;
}

export function updateFoodSession(userId: string, patch: Partial<FoodSession>): FoodSession {
  const next: FoodSession = { ...getFoodSession(userId), ...patch, updatedAt: Date.now() };
  sessions.set(userId, next);
  return next;
}

export function clearFoodSession(userId: string): void {
  sessions.delete(userId);
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
