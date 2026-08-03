import "server-only";

import { routeToolCall } from "@/lib/atlas/mcp/router";
import { foodLog } from "@/lib/atlas/mcp/food-log";
import type {
  FoodAddress,
  FoodCartLine,
  FoodMenuItem,
  FoodMenuPage,
  FoodPaymentMethod,
  FoodRestaurant,
  FoodTotals,
} from "@/lib/atlas/mcp/food-session";

// Typed access layer over the Swiggy Food MCP server.
//
// The MCP returns BOTH a human-readable `message` and a machine-readable
// `structuredContent` payload. Earlier versions regex-scraped the prose, which
// silently dropped ratings, ETAs, prices, veg flags, stock and tax breakdowns.
// This module reads the structured payload and normalises it into the session
// types, falling back to prose only when structured data is genuinely absent.

export class SwiggyUnavailableError extends Error {
  constructor(public readonly tool: string) {
    super(`The Swiggy service did not respond to "${tool}".`);
    this.name = "SwiggyUnavailableError";
  }
}

/** Non-fatal condition Swiggy reports in-band (closed restaurant, sold out, etc.). */
export interface SwiggyNotice {
  code?: number;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

interface RawCall {
  message: string;
  data: unknown;
}

async function call(tool: string, args: Record<string, unknown>): Promise<RawCall> {
  const started = Date.now();
  let result;

  try {
    result = await routeToolCall("food", "any", args, tool);
  } catch (error) {
    foodLog("mcp.error", { tool, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    throw new SwiggyUnavailableError(tool);
  }

  if (!result) {
    foodLog("mcp.empty", { tool, ms: Date.now() - started });
    throw new SwiggyUnavailableError(tool);
  }

  foodLog("mcp.call", { tool, ms: Date.now() - started, args: redact(args) });
  return { message: result.message, data: result.data };
}

function redact(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = Array.isArray(value) ? `[${value.length} items]` : value;
  }
  return out;
}

/** Swiggy nests the useful cart payload under `data`, alongside a status code. */
function unwrap(data: unknown): { body: Record<string, unknown>; notice: SwiggyNotice } {
  if (!isRecord(data)) return { body: {}, notice: {} };

  const notice: SwiggyNotice = {
    code: num(data.statusCode),
    message: str(data.statusMessage),
  };

  const inner = isRecord(data.data) ? data.data : data;
  return { body: inner, notice };
}

// ---------------------------------------------------------------- addresses

export async function fetchAddresses(): Promise<FoodAddress[]> {
  const collected: FoodAddress[] = [];

  const harvestStructured = (record: Record<string, unknown>, offset: number): boolean => {
    const list = arr(record.addresses);
    for (const entry of list.filter(isRecord)) {
      const id = str(entry.id);
      if (!id) continue;
      collected.push({
        id,
        index: offset + collected.length + 1,
        tag: str(entry.addressTag),
        line: str(entry.addressLine) ?? "Saved address",
      });
    }
    return list.length > 0;
  };

  // Swiggy paginates saved addresses (page size 10). Walk every page so the
  // user sees their complete address book, not just the first page.
  let page = 1;
  let lastMessage = "";
  for (;;) {
    const { message, data } = await call("get_addresses", { page });
    lastMessage = message;
    const record = isRecord(data) ? data : {};
    harvestStructured(record, collected.length);

    const pagination = isRecord(record.pagination) ? record.pagination : {};
    const pageSize = num(pagination.pageSize) ?? 10;
    const hasMore = pagination.hasMore === true;

    if (!hasMore) break;
    // Guard against a misbehaving server that never flips hasMore.
    if (collected.length > 0 && collected.length % pageSize !== 0) break;
    if (page > 20) break;
    page += 1;
  }

  if (collected.length > 0) return collected;

  // Fallback: parse the numbered prose list.
  const parsed: FoodAddress[] = [];
  for (const line of lastMessage.split("\n")) {
    const id = line.match(/\(ID:\s*([A-Za-z0-9_-]{4,})\)/)?.[1];
    if (!id) continue;
    const tag = line.match(/\[([^\]]+)\]/)?.[1]?.trim();
    const text = line
      .replace(/\(ID:\s*[A-Za-z0-9_-]+\)/, "")
      .replace(/^\s*\d+\.\s*/, "")
      .replace(/\[[^\]]+\]/g, "")
      .trim();
    parsed.push({ id, index: parsed.length + 1, tag, line: text || "Saved address" });
  }
  return parsed;
}

// -------------------------------------------------------------- restaurants

function parseDistanceKm(entry: Record<string, unknown>): number | undefined {
  const direct =
    num(entry.distanceKm) ??
    num(entry.distance_km) ??
    num(entry.distance) ??
    num(entry.lastMileTravel) ??
    num(entry.last_mile_travel) ??
    num(entry.slaDistance);

  if (direct !== undefined) {
    // Swiggy sometimes returns metres for lastMileTravel.
    if (direct > 100) return Math.round((direct / 1000) * 10) / 10;
    return Math.round(direct * 10) / 10;
  }

  const sla = isRecord(entry.sla) ? entry.sla : null;
  if (sla) {
    const fromSla =
      num(sla.lastMileTravel) ??
      num(sla.last_mile_travel) ??
      num(sla.distance) ??
      num(sla.distanceKm);
    if (fromSla !== undefined) {
      if (fromSla > 100) return Math.round((fromSla / 1000) * 10) / 10;
      return Math.round(fromSla * 10) / 10;
    }
  }

  const asText =
    str(entry.distanceString) ?? str(entry.distanceText) ?? str(entry.lastMileTravelString);
  if (asText) {
    const km = asText.match(/([\d.]+)\s*km/i);
    if (km) return Number.parseFloat(km[1]);
    const metres = asText.match(/([\d.]+)\s*m\b/i);
    if (metres) return Math.round((Number.parseFloat(metres[1]) / 1000) * 10) / 10;
  }

  return undefined;
}

export async function searchRestaurants(addressId: string, query: string, offset = 0): Promise<FoodRestaurant[]> {
  const { data } = await call("search_restaurants", { addressId, query, offset });
  const record = isRecord(data) ? data : {};

  const restaurants = arr(record.restaurants)
    .filter(isRecord)
    .map((entry, i) => {
      const availability = str(entry.availabilityStatus) ?? "OPEN";
      const isOpen = availability.toUpperCase().startsWith("OPEN");

      return {
        id: str(entry.id) ?? "",
        index: i + 1,
        name: str(entry.name) ?? "Restaurant",
        cuisines: arr(entry.cuisines).map((c) => str(c) ?? "").filter(Boolean),
        rating: num(entry.avgRating),
        ratingCount: str(entry.totalRatings),
        etaMinutes: num(entry.deliveryTimeMinutes),
        etaText: str(entry.deliveryTimeRange),
        costForTwo: str(entry.costForTwo),
        areaName: str(entry.areaName),
        distanceKm: parseDistanceKm(entry),
        isOpen,
        closedReason: isOpen ? undefined : availability,
        nextOpenTime: str(entry.nextOpenTime),
      };
    })
    .filter((entry) => entry.id.length > 0);

  foodLog("restaurant.search.fields", {
    count: restaurants.length,
    withDistance: restaurants.filter((r) => r.distanceKm !== undefined).length,
  });

  return restaurants;
}

/**
 * Swiggy's `search_restaurants` degenerates when the query is a dish name: it
 * returns results whose `name` is the dish (e.g. "Chicken Biryani") with no
 * rating, ETA or cuisine. `search_menu` (the dish search) returns the same
 * matches but grouped by the REAL restaurant, with name, rating and price.
 *
 * This builds a proper restaurant list (one row per restaurant that serves the
 * dish) from the dish search, so the user sees actual restaurants, not a list
 * of identical dish names.
 */
export async function discoverRestaurantsByDish(addressId: string, query: string): Promise<FoodRestaurant[]> {
  const { data } = await call("search_menu", { addressId, query, offset: 0 });
  const record = isRecord(data) ? data : {};

  // Preferred shape: structured `restaurants[].items[]` groups.
  const groups = arr(record.restaurants).filter(isRecord);
  const byRestaurant = new Map<string, { name: string; rating?: number; items: { id: string; name: string; price?: number }[] }>();

  if (groups.length > 0) {
    for (const group of groups) {
      const rid = str(group.id) ?? str(group.restaurantId);
      const rname = str(group.name);
      if (!rid || !rname) continue;
      const bucket = byRestaurant.get(rid) ?? { name: rname, items: [] };
      bucket.rating = bucket.rating ?? num(group.rating);
      for (const item of arr(group.items).filter(isRecord)) {
        const id = str(item.menu_item_id) ?? str(item.id);
        if (!id) continue;
        bucket.items.push({ id, name: str(item.name) ?? "Item", price: num(item.price) });
      }
      byRestaurant.set(rid, bucket);
    }
  } else {
    // Fallback: flat `items[]` each carrying restaurant_id / restaurant_name.
    for (const item of arr(record.items).filter(isRecord)) {
      const rid = str(item.restaurant_id);
      const rname = str(item.restaurant_name);
      if (!rid || !rname) continue;
      const bucket = byRestaurant.get(rid) ?? { name: rname, rating: num(item.rating), items: [] };
      const id = str(item.menu_item_id) ?? str(item.id);
      if (id) bucket.items.push({ id, name: str(item.name) ?? "Item", price: num(item.price) });
      byRestaurant.set(rid, bucket);
    }
  }

  return Array.from(byRestaurant.entries()).map(([rid, bucket], i) => ({
    id: rid,
    index: i + 1,
    name: bucket.name,
    cuisines: bucket.items.length > 0 ? [`from ₹${Math.min(...bucket.items.map((it) => it.price ?? Infinity).filter(Number.isFinite))}`] : [],
    rating: bucket.rating,
    isOpen: true,
  }));
}

// --------------------------------------------------------------------- menu

export interface MenuResult {
  restaurant?: Partial<FoodRestaurant>;
  items: Omit<FoodMenuItem, "index">[];
  page: FoodMenuPage;
}

function readMenuItem(entry: Record<string, unknown>, category?: string): Omit<FoodMenuItem, "index"> {
  // `inStock` is omitted when the item is available; only an explicit 0 means out of stock.
  const stock = num(entry.inStock);

  return {
    id: str(entry.id) ?? "",
    name: str(entry.name) ?? "Item",
    description: str(entry.description),
    price: num(entry.price),
    category,
    isVeg: typeof entry.isVeg === "boolean" ? entry.isVeg : undefined,
    isBestseller: entry.isBestseller === true,
    rating: str(entry.rating),
    inStock: stock === undefined ? true : stock !== 0,
    hasVariants: entry.hasVariants === true,
    hasAddons: entry.hasAddons === true,
  };
}

export async function fetchRestaurantMenu(
  addressId: string,
  restaurantId: string,
  page = 1,
  pageSize = 5
): Promise<MenuResult> {
  const { data } = await call("get_restaurant_menu", { addressId, restaurantId, page, pageSize });
  const record = isRecord(data) ? data : {};
  const restaurantRaw = isRecord(record.restaurant) ? record.restaurant : {};

  const items: Omit<FoodMenuItem, "index">[] = [];
  for (const category of arr(record.categories).filter(isRecord)) {
    const title = str(category.title);
    for (const item of arr(category.items).filter(isRecord)) {
      const parsed = readMenuItem(item, title);
      if (parsed.id) items.push(parsed);
    }
  }

  return {
    restaurant: {
      id: str(restaurantRaw.id) ?? restaurantId,
      name: str(restaurantRaw.name),
      cuisines: arr(restaurantRaw.cuisines).map((c) => str(c) ?? "").filter(Boolean),
      rating: num(restaurantRaw.avgRating),
      ratingCount: str(restaurantRaw.totalRatingsString),
      etaMinutes: num(restaurantRaw.deliveryTime),
      etaText: str(restaurantRaw.slaString),
      costForTwo: str(restaurantRaw.costForTwoMessage),
      areaName: str(restaurantRaw.areaName),
      isOpen: restaurantRaw.isOpen !== false,
    },
    items,
    page: {
      page: num(record.page) ?? page,
      pageSize: num(record.pageSize) ?? pageSize,
      totalCategories: num(record.totalCategories),
      hasMore: record.hasMore === true,
    },
  };
}

export async function searchDishes(
  addressId: string,
  query: string,
  opts: { restaurantId?: string; vegOnly?: boolean; offset?: number } = {}
): Promise<{ items: Omit<FoodMenuItem, "index">[]; restaurants: Map<string, string> }> {
  const args: Record<string, unknown> = { addressId, query, offset: opts.offset ?? 0 };
  if (opts.restaurantId) args.restaurantIdOfAddedItem = opts.restaurantId;
  if (opts.vegOnly) args.vegFilter = 1;

  const { message, data } = await call("search_menu", args);
  const record = isRecord(data) ? data : {};
  const restaurants = new Map<string, string>();
  const items: Omit<FoodMenuItem, "index">[] = [];

  // search_menu groups items by restaurant in its structured payload.
  const groups = arr(record.restaurants).filter(isRecord);
  if (groups.length > 0) {
    for (const group of groups) {
      const rid = str(group.id) ?? str(group.restaurantId);
      const rname = str(group.name);
      if (rid && rname) restaurants.set(rid, rname);
      for (const item of arr(group.items).filter(isRecord)) {
        const parsed = readMenuItem(item);
        if (parsed.id) items.push(parsed);
      }
    }
  }

  for (const item of arr(record.items).filter(isRecord)) {
    const parsed = readMenuItem(item);
    if (parsed.id) items.push(parsed);
  }

  if (items.length === 0 && message) {
    for (const line of message.split("\n")) {
      const id = line.match(/\(ID:\s*(\d+)\)/)?.[1];
      if (!id) continue;
      const name = line.split("—")[0].split("(")[0].replace(/^\s*[-\d.]+\s*/, "").trim();
      items.push({ id, name: name || `Item ${id}`, inStock: true });
    }
  }

  return { items, restaurants };
}

// --------------------------------------------------------------------- cart

export interface CartSnapshot {
  cartId?: string;
  restaurantName?: string;
  deliverySubtitle?: string;
  lines: FoodCartLine[];
  totals: FoodTotals;
  notice: SwiggyNotice;
}

function readCart(data: unknown): CartSnapshot {
  const { body, notice } = unwrap(data);
  const pricing = isRecord(body.pricing) ? body.pricing : {};
  const offers = isRecord(body.offers) ? body.offers : {};
  const restaurant = isRecord(body.restaurant) ? body.restaurant : {};

  const lines: FoodCartLine[] = arr(body.items)
    .filter(isRecord)
    .map((entry) => {
      const stock = num(entry.in_stock);
      const vegFlag = str(entry.is_veg);

      return {
        menuItemId: str(entry.menu_item_id) ?? "",
        name: str(entry.name) ?? "Item",
        quantity: num(entry.quantity) ?? 1,
        unitPrice: num(entry.final_price),
        lineTotal: num(entry.total) ?? num(entry.subtotal),
        inStock: stock === undefined ? true : stock !== 0,
        isVeg: vegFlag === undefined ? undefined : vegFlag === "1",
      };
    })
    .filter((line) => line.menuItemId.length > 0);

  return {
    cartId: str(body.cart_id),
    restaurantName: str(restaurant.name),
    deliverySubtitle: str(restaurant.deliverySubtitle),
    lines,
    totals: {
      itemTotal: num(pricing.item_total),
      deliveryCharge: num(pricing.delivery_charge),
      taxesAndCharges: num(pricing.taxes_and_charges),
      discount: num(offers.coupon_discount),
      toPay: num(pricing.to_pay),
      couponApplied: str(offers.coupon_applied) ?? null,
      freeDelivery: offers.free_delivery_applied === true,
    },
    notice,
  };
}

/**
 * Writes the desired cart contents to Swiggy.
 *
 * `update_food_cart` is a declarative replace for the item set it receives, so
 * removals and quantity changes are expressed by sending the full desired state.
 */
export async function writeCart(
  restaurantId: string,
  addressId: string,
  restaurantName: string | undefined,
  lines: { menuItemId: string; quantity: number }[]
): Promise<CartSnapshot> {
  const { data } = await call("update_food_cart", {
    restaurantId,
    addressId,
    ...(restaurantName ? { restaurantName } : {}),
    cartItems: lines.map((line) => ({ menu_item_id: line.menuItemId, quantity: line.quantity })),
  });

  return readCart(data);
}

export async function fetchCart(addressId: string, restaurantName?: string): Promise<CartSnapshot> {
  const { data } = await call("get_food_cart", {
    addressId,
    ...(restaurantName ? { restaurantName } : {}),
  });

  return readCart(data);
}

export async function flushCart(): Promise<void> {
  try {
    await call("flush_food_cart", {});
  } catch {
    // A failed flush must never block the user from starting over.
  }
}

// ------------------------------------------------------------------ coupons

export interface FoodCoupon {
  code: string;
  label: string;
  applicable: boolean;
  detail?: string;
}

export async function fetchCoupons(restaurantId: string, addressId: string): Promise<FoodCoupon[]> {
  const { message } = await call("fetch_food_coupons", { restaurantId, addressId });
  const coupons: FoodCoupon[] = [];

  for (const line of message.split("\n")) {
    const match = line.match(/^\s*-\s*(.+?)\s*\[(✅|❌)[^\]]*\]\s*—\s*(.+?)\s*\(code:\s*([^)]+)\)/);
    if (!match) continue;
    coupons.push({
      label: match[1].trim(),
      applicable: match[2] === "✅",
      detail: match[3].trim(),
      code: match[4].trim(),
    });
  }

  return coupons;
}

export async function applyCoupon(couponCode: string, addressId: string, cartId?: string): Promise<CartSnapshot> {
  const { data } = await call("apply_food_coupon", {
    couponCode,
    addressId,
    ...(cartId ? { cartId } : {}),
  });

  return readCart(data);
}

// ------------------------------------------------------------------ payment

export async function fetchPaymentOptions(addressId: string): Promise<FoodPaymentMethod[]> {
  const { data } = await call("get_payment_options", { addressId });
  const record = isRecord(data) ? data : {};
  const platforms = isRecord(record.platforms) ? record.platforms : {};
  const out: FoodPaymentMethod[] = [];
  const seen = new Set<string>();

  for (const platform of Object.values(platforms)) {
    if (!isRecord(platform)) continue;
    for (const method of arr(platform.methods).filter(isRecord)) {
      const id = str(method.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        displayName: str(method.displayName) ?? id,
        kind: str(method.kind) ?? "unknown",
      });
    }
  }

  return out;
}

// -------------------------------------------------------------------- order

export interface PlacedOrder {
  orderId?: string;
  message: string;
  /**
   * Swiggy returns "PENDING_PAYMENT" for UPI flows: the order is NOT placed
   * until the user pays in their UPI app and `confirm_order` succeeds. Any
   * other value (or absence) means the order is complete.
   */
  status?: string;
  /** UPI app deep-link / intent URL the user must open to complete payment. */
  upiLink?: string;
  /** UPI QR payload (desktop scan) the user scans to complete payment. */
  upiQr?: string;
  /** Payment reference / transaction id for status polling. */
  paymentRef?: string;
  /** Payment-as-a-service transaction id (Food: echoes into check/confirm). */
  paasId?: string;
  /** Cart id echoed from place_food_order, required for confirm_order (Food). */
  cartId?: string;
  /** Latitude echoed from place_food_order, required for confirm_order (Food). */
  lat?: number;
  /** Longitude echoed from place_food_order, required for confirm_order (Food). */
  lng?: number;
}

export async function placeOrder(args: {
  addressId: string;
  paymentMethod?: string;
  intentApp?: string;
  generateUPIQR?: boolean;
  noteToRestaurant?: string;
}): Promise<PlacedOrder> {
  const { message, data } = await call("place_food_order", {
    addressId: args.addressId,
    ...(args.paymentMethod ? { paymentMethod: args.paymentMethod } : {}),
    ...(args.intentApp ? { intentApp: args.intentApp } : {}),
    ...(args.generateUPIQR ? { generateUPIQR: args.generateUPIQR } : {}),
    ...(args.noteToRestaurant ? { noteToRestaurant: args.noteToRestaurant } : {}),
  });

  const { body } = unwrap(data);

  const status = str(body.status) ?? str(body.orderStatus);
  const upiLinkFromBody =
    str(body.upiLink) ?? str(body.upiIntentUrl) ?? str(body.intentUrl) ?? str(body.paymentUrl);
  // Prefer https wrappers when the model embeds them in prose (desktop-friendly).
  const httpsFromMessage = message.match(/https?:\/\/[^\s)"']+/i)?.[0];
  const upiLink =
    (httpsFromMessage && /deeplink|upi|pay/i.test(httpsFromMessage) ? httpsFromMessage : undefined) ||
    upiLinkFromBody;
  const upiQr = str(body.upiQr) ?? str(body.qrData) ?? str(body.qrCode);
  const paymentRef = str(body.paymentRef) ?? str(body.transactionId) ?? str(body.paymentReference);
  const paasId = str(body.paasId) ?? str(body.paas_id);
  const cartId = str(body.cartId) ?? str(body.cart_id);

  let lat: number | undefined;
  const rawLat = num(body.lat);
  if (rawLat !== undefined) lat = rawLat;
  let lng: number | undefined;
  const rawLng = num(body.lng);
  if (rawLng !== undefined) lng = rawLng;

  return {
    orderId: str(body.orderId) ?? str(body.order_id),
    message,
    status,
    upiLink: upiLink || undefined,
    upiQr: upiQr || undefined,
    paymentRef: paymentRef || undefined,
    paasId: paasId || undefined,
    cartId: cartId || undefined,
    lat,
    lng,
  };
}

/** Returns the UPI payment status string from Swiggy (SUCCESS / PAID / PENDING / FAILED / REFUND-INITIATED). */
export async function checkUpiPayment(args: {
  orderId: string;
  paasId?: string;
  addressId: string;
  cartId?: string;
  lat?: number;
  lng?: number;
}): Promise<string> {
  const { message, data } = await call("check_payment_status", {
    orderId: args.orderId,
    ...(args.paasId ? { paasId: args.paasId } : {}),
    addressId: args.addressId,
    ...(args.cartId ? { cartId: args.cartId } : {}),
    ...(args.lat !== undefined ? { lat: args.lat } : {}),
    ...(args.lng !== undefined ? { lng: args.lng } : {}),
  });

  const { body } = unwrap(data);
  const rawStatus = str(body.status) ?? str(body.paymentStatus) ?? str(body.state);
  const status = rawStatus?.toUpperCase();
  foodLog("upi.status", {
    orderId: args.orderId,
    paasId: args.paasId,
    status: status ?? "unknown",
    terminal: body.terminal === true || body.isTerminalFailure === true || body.isTerminalSuccess === true,
    bodyKeys: Object.keys(body),
    message: message.slice(0, 240),
  });
  if (status) return status;

  // Some responses encode the outcome in prose; look for the canonical tokens.
  const text = `${message} ${JSON.stringify(body)}`;
  if (/\b(SUCCESS|PAID)\b/i.test(text)) return "SUCCESS";
  if (/\b(FAILED|CANCELLED|CANCELED|EXPIRED|DECLINED)\b/i.test(text)) return "FAILED";
  if (/\b(REFUND[- ]?INITIATED)\b/i.test(text)) return "REFUND-INITIATED";
  // Structured failure flags from Swiggy Food MCP.
  if (body.isTerminalFailure === true) return "FAILED";
  if (body.isTerminalSuccess === true) return "SUCCESS";
  return "PENDING";
}

/** Finalizes a pre-placed (PENDING_PAYMENT) food order to PLACED. Idempotent. */
export async function confirmFoodOrder(args: {
  orderId: string;
  addressId: string;
  cartId?: string;
  lat?: number;
  lng?: number;
}): Promise<void> {
  await call("confirm_order", {
    orderId: args.orderId,
    addressId: args.addressId,
    ...(args.cartId ? { cartId: args.cartId } : {}),
    ...(args.lat !== undefined ? { lat: args.lat } : {}),
    ...(args.lng !== undefined ? { lng: args.lng } : {}),
  });
}
