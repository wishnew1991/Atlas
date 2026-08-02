import "server-only";

import {
  getFoodSession,
  updateFoodSession,
  resetOrderKeepAddress,
  mergeMenuItems,
  type FoodCartLine,
  type FoodMenuItem,
  type FoodRestaurant,
  type FoodSession,
} from "@/lib/atlas/mcp/food-session";
import {
  fetchAddresses,
  fetchCart,
  fetchPaymentOptions,
  fetchRestaurantMenu,
  flushCart,
  searchDishes,
  searchRestaurants,
  discoverRestaurantsByDish,
  writeCart,
  SwiggyUnavailableError,
  type CartSnapshot,
} from "@/lib/atlas/mcp/swiggy-client";
import { parseCartIntent, rankByName, resolveReference } from "@/lib/atlas/mcp/food-resolve";
import {
  formatAddressList,
  formatCartSummary,
  formatMenu,
  formatRestaurantList,
  rupees,
} from "@/lib/atlas/mcp/food-format";
import { createFoodApproval } from "@/lib/atlas/mcp/food-approval";
import { foodLog, logSessionState } from "@/lib/atlas/mcp/food-log";
import type { AtlasPendingAction } from "@/lib/atlas/agent-contract";

// The operations the LLM orchestrates. Each is a small, single-purpose step
// that performs one Swiggy interaction and returns conversational text plus the
// updated FoodSession. The LLM decides which to call and when; this module owns
// the identifiers, the live cart, and all recovery behaviour.

export interface FoodResult {
  reply: string;
  action?: AtlasPendingAction;
  /** Signals the LLM should stop and let the user respond. */
  awaitingUser: boolean;
}

function ok(reply: string, awaitingUser = true): FoodResult {
  return { reply, awaitingUser };
}

/** Uniform handling for a Swiggy outage so the conversation survives it. */
function unavailable(error: unknown, fallback: string): FoodResult {
  if (error instanceof SwiggyUnavailableError) {
    foodLog("recovery", { reason: "mcp_unavailable", tool: error.tool });
    return ok(`I couldn't reach Swiggy just then (${error.tool}). ${fallback}`);
  }
  foodLog("recovery", { reason: "unexpected", error: error instanceof Error ? error.message : String(error) });
  return ok(`Something went wrong talking to Swiggy. ${fallback}`);
}

// ------------------------------------------------------------------ address

/** True when restaurant search returned degenerate dish-name results (no rating/ETA/cuisine). */
function isDegenerateRestaurants(restaurants: FoodRestaurant[]): boolean {
  if (restaurants.length === 0) return false;
  const withMeta = restaurants.filter(
    (r) => r.rating !== undefined || r.etaMinutes !== undefined || r.cuisines.length > 0
  );
  return withMeta.length < Math.ceil(restaurants.length / 2);
}

export async function ensureAddress(userId: string, reference?: string): Promise<FoodResult> {
  const session = getFoodSession(userId);
  logSessionState(userId, session);

  if (reference && session.addressOptions.length > 0) {
    const match = resolveReference(
      reference,
      session.addressOptions.map((a) => ({ index: a.index, id: a.id, name: `${a.tag ?? ""} ${a.line}`.trim() }))
    );
    if (match) {
      const chosen = session.addressOptions.find((a) => a.id === match.id)!;
      updateFoodSession(userId, { address: chosen, step: "browsing_restaurants" });
      foodLog("address.select", { id: chosen.id, tag: chosen.tag });
      return ok(`Delivering to **${chosen.tag ?? chosen.line}**. What would you like to eat?`);
    }
  }

  // Address is already set — confirm it rather than resetting the flow.
  // This breaks the loop where the LLM repeatedly calls food_set_address
  // instead of progressing to food_find_restaurants.
  if (session.address) {
    const label = session.address.tag ?? session.address.line;
    if (reference) {
      foodLog("recovery", { reason: "address_already_set_unrecognized_reference", reference });
    }
    return ok(`Delivering to **${label}**. What would you like to eat?`);
  }

  try {
    const addresses = await fetchAddresses();
    foodLog("address.list", { count: addresses.length });

    if (addresses.length === 0) {
      return ok("You don't have any saved addresses on Swiggy yet. Please add one in the Swiggy app, then tell me to try again.");
    }

    const next = updateFoodSession(userId, { addressOptions: addresses, step: "awaiting_address" });

    // A reference we could not resolve before the list was loaded — retry now.
    if (reference) {
      const match = resolveReference(
        reference,
        addresses.map((a) => ({ index: a.index, id: a.id, name: `${a.tag ?? ""} ${a.line}`.trim() }))
      );
      if (match) {
        const chosen = addresses.find((a) => a.id === match.id)!;
        updateFoodSession(userId, { address: chosen, step: "browsing_restaurants" });
        foodLog("address.select", { id: chosen.id, tag: chosen.tag });
        return ok(`Delivering to **${chosen.tag ?? chosen.line}**. What would you like to eat?`);
      }
    }

    // Always present the full list so the user can (re)view and change the
    // delivery address — never silently collapse to a "using saved" notice.
    return ok(formatAddressList(next));
  } catch (error) {
    return unavailable(error, "Want me to try again?");
  }
}

// --------------------------------------------------------------- discovery

export async function discoverRestaurants(userId: string, dish: string): Promise<FoodResult> {
  const session = getFoodSession(userId);
  logSessionState(userId, session);

  if (!session.address) {
    return ensureAddress(userId);
  }

  const query = dish.trim() || session.lastDishQuery || "food";

  try {
    let restaurants = await searchRestaurants(session.address.id, query);
    foodLog("restaurant.search", { query, count: restaurants.length, addressId: session.address.id });

    // Swiggy's restaurant search degenerates on dish queries (returns the dish
    // name as every restaurant with no rating/ETA). Recover by building the
    // restaurant list from the dish search instead, which has real names.
    if (isDegenerateRestaurants(restaurants)) {
      foodLog("restaurant.search.fallback", { query, reason: "degenerate" });
      restaurants = await discoverRestaurantsByDish(session.address.id, query);
    }

    if (restaurants.length === 0) {
      return ok(`I couldn't find anything matching "${query}" near your address. Try a different dish or cuisine?`);
    }

    // Surface open restaurants first — a closed one cannot be ordered from.
    const ordered = [...restaurants].sort((a, b) => Number(b.isOpen) - Number(a.isOpen));
    const renumbered = ordered.map((restaurant, i) => ({ ...restaurant, index: i + 1 }));

    updateFoodSession(userId, {
      restaurantOptions: renumbered,
      lastDishQuery: query,
      step: "browsing_restaurants",
    });

    return ok(formatRestaurantList(renumbered, query));
  } catch (error) {
    return unavailable(error, "Want me to try that search again?");
  }
}

export async function selectRestaurant(userId: string, reference: string): Promise<FoodResult> {
  const session = getFoodSession(userId);
  logSessionState(userId, session);

  if (!session.address) return ensureAddress(userId);

  if (session.restaurantOptions.length === 0) {
    return discoverRestaurants(userId, reference);
  }

  const match = resolveReference(reference, session.restaurantOptions);
  if (!match) {
    return ok(`I'm not sure which one you mean. ${formatRestaurantList(session.restaurantOptions, session.lastDishQuery ?? "food")}`);
  }

  const restaurant = session.restaurantOptions.find((r) => r.id === match.id)!;

  if (!restaurant.isOpen) {
    foodLog("recovery", { reason: "restaurant_closed", restaurant: restaurant.name });
    const open = session.restaurantOptions.filter((r) => r.isOpen);
    const suggestion = open.length
      ? `\n\nStill open:\n${open.slice(0, 5).map((r) => `${r.index}. **${r.name}** ⭐${r.rating ?? "—"} • ${r.etaMinutes ?? "—"} min`).join("\n")}\n\nWould you like one of these instead?`
      : `\n\nEverywhere I found for "${session.lastDishQuery ?? "that"}" is closed at the moment. Want me to try a different dish or cuisine?`;

    return ok(
      `**${restaurant.name}** isn't taking orders right now${restaurant.nextOpenTime ? ` — it ${restaurant.nextOpenTime.toLowerCase()}` : ""}.${suggestion}`
    );
  }

  updateFoodSession(userId, { restaurant, step: "browsing_menu", menuItems: [], menuPage: undefined });
  foodLog("restaurant.select", { id: restaurant.id, name: restaurant.name });

  return loadMenu(userId, 1);
}

// -------------------------------------------------------------------- menu

export async function loadMenu(userId: string, page = 1): Promise<FoodResult> {
  const session = getFoodSession(userId);
  logSessionState(userId, session);

  if (!session.address) return ensureAddress(userId);
  if (!session.restaurant) {
    return ok("Which restaurant would you like to see the menu for?");
  }

  try {
    const result = await fetchRestaurantMenu(session.address.id, session.restaurant.id, page);
    foodLog("menu.fetch", {
      restaurant: session.restaurant.name,
      page,
      items: result.items.length,
      hasMore: result.page.hasMore,
    });

    // Page 1 replaces; later pages append so earlier numbering stays valid.
    const base = page === 1 ? [] : session.menuItems;
    const menuItems = mergeMenuItems(base, result.items);

    const merged: FoodRestaurant = {
      ...session.restaurant,
      ...Object.fromEntries(Object.entries(result.restaurant ?? {}).filter(([, v]) => v !== undefined)),
    } as FoodRestaurant;

    const next = updateFoodSession(userId, {
      restaurant: merged,
      menuItems,
      menuPage: result.page,
      step: "browsing_menu",
    });

    const shown = page === 1 ? menuItems : menuItems.filter((item) => result.items.some((i) => i.id === item.id));
    return ok(formatMenu(next, shown));
  } catch (error) {
    return unavailable(error, "Want me to try loading the menu again?");
  }
}

export async function searchMenuItems(userId: string, query: string, vegOnly = false): Promise<FoodResult> {
  const session = getFoodSession(userId);
  logSessionState(userId, session);

  if (!session.address) return ensureAddress(userId);

  // Dishes only make sense once a restaurant is chosen. If the user searches a
  // dish before picking a restaurant, show the restaurant list first — that is
  // the intended flow and is what the user expects to see (names, ratings, ETA),
  // not a bare list of dish names with no restaurant context.
  if (!session.restaurant) {
    foodLog("menu.search.redirect", { query, reason: "no_restaurant" });
    return discoverRestaurants(userId, query);
  }

  try {
    const { items, restaurants } = await searchDishes(session.address.id, query, {
      restaurantId: session.restaurant?.id,
      vegOnly,
    });
    foodLog("menu.search", { query, count: items.length, scoped: Boolean(session.restaurant) });

    if (items.length === 0) {
      return ok(`I couldn't find "${query}" at ${session.restaurant.name}. Want to try another dish?`);
    }

    const menuItems = mergeMenuItems(session.menuItems, items);
    const next = updateFoodSession(userId, { menuItems, lastDishQuery: query });

    const shown = menuItems.filter((item) => items.some((i) => i.id === item.id));

    return ok(formatMenu(next, shown));
  } catch (error) {
    return unavailable(error, "Want me to search again?");
  }
}

// -------------------------------------------------------------------- cart

function toWriteLines(lines: FoodCartLine[]): { menuItemId: string; quantity: number }[] {
  return lines.filter((line) => line.quantity > 0).map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity }));
}

/**
 * Applies a Swiggy cart snapshot to the session.
 *
 * Swiggy's `update_food_cart` / `get_food_cart` sometimes return an EMPTY cart
 * (closed restaurant, area not serviceable, or the write silently dropping
 * items) while still reporting success. Treating that as the new truth would
 * wipe a cart the user already built. So when the snapshot carries no lines, we
 * keep the cart we already have and surface a recovery note — we only replace
 * the cart when the snapshot actually contains items. `cartId` is likewise
 * preserved when the snapshot omits one (Swiggy rotates cart ids per call, so
 * an absent id must not clobber the known good one).
 */
function absorbCart(userId: string, snapshot: CartSnapshot): FoodSession {
  const session = getFoodSession(userId);

  if (snapshot.lines.length === 0) {
    foodLog("cart.absorb.empty", {
      hadCart: session.cart.length,
      hadCartId: session.cartId ? "yes" : "no",
      snapshotCartId: snapshot.cartId ?? null,
    });
    return updateFoodSession(userId, {
      cartId: session.cartId ?? snapshot.cartId,
      cart: session.cart,
      totals: session.totals,
      step: session.step,
    });
  }

  return updateFoodSession(userId, {
    cartId: snapshot.cartId ?? session.cartId,
    cart: snapshot.lines,
    totals: snapshot.totals,
    step: "building_cart",
  });
}

/**
 * Natural-language cart update. Understands add / remove / set quantity /
 * replace / clear, resolving items by name or number against the menu the user
 * has actually seen.
 */
export async function updateCart(userId: string, instruction: string): Promise<FoodResult> {
  let session = getFoodSession(userId);
  logSessionState(userId, session);

  if (!session.address) return ensureAddress(userId);

  const intent = parseCartIntent(instruction);
  foodLog("cart.change", { intent: intent.kind, instruction: instruction.slice(0, 80) });

  if (intent.kind === "clear") {
    await flushCart();
    resetOrderKeepAddress(userId);
    foodLog("cart.change", { result: "cleared" });
    return ok("Cleared your cart. What would you like instead?");
  }

  if (intent.kind === "unknown") {
    return ok("What would you like to add?");
  }

  // Removals and quantity edits operate on the live cart.
  if (intent.kind === "remove" || intent.kind === "set_quantity") {
    if (session.cart.length === 0) return ok("Your cart is empty right now. What would you like to order?");
    if (!session.restaurant) return ok("Let's pick a restaurant first — what are you in the mood for?");

    const candidates = session.cart.map((line, i) => ({ index: i + 1, id: line.menuItemId, name: line.name }));
    const reference = intent.reference.trim();

    // "make it two" with a single-line cart unambiguously means that line.
    const match =
      reference.length === 0 && session.cart.length === 1
        ? candidates[0]
        : resolveReference(reference, candidates);

    if (!match) {
      return ok(`I couldn't tell which item you meant. Your cart has:\n\n${session.cart.map((l, i) => `${i + 1}. ${l.name} ×${l.quantity}`).join("\n")}`);
    }

    const nextLines = session.cart.map((line) =>
      line.menuItemId === match.id
        ? { ...line, quantity: intent.kind === "remove" ? 0 : intent.quantity }
        : line
    );

    const remaining = toWriteLines(nextLines);

    try {
      if (remaining.length === 0) {
        await flushCart();
        updateFoodSession(userId, { cart: [], totals: {}, cartId: undefined });
        foodLog("cart.change", { result: "emptied", item: match.name });
        return ok(`Removed **${match.name}**. Your cart is empty now — anything else you'd like?`);
      }

      const snapshot = await writeCart(session.restaurant.id, session.address.id, session.restaurant.name, remaining);
      session = absorbCart(userId, snapshot);
      foodLog("cart.snapshot", { lines: session.cart.length, toPay: session.totals.toPay });

      const verb = intent.kind === "remove" ? `Removed **${match.name}**` : `Updated **${match.name}** to ×${intent.quantity}`;
      return ok(`${verb}.\n\n${formatCartSummary(session)}`);
    } catch (error) {
      return unavailable(error, "Your cart is unchanged.");
    }
  }

  if (intent.kind === "replace") {
    const removal = await updateCart(userId, `remove ${intent.from}`);
    if (getFoodSession(userId).cart.some((line) => line.name.toLowerCase().includes(intent.from.toLowerCase()))) {
      return removal;
    }
    return updateCart(userId, `add ${intent.to}`);
  }

  // -------- add
  const reference = intent.reference;
  let target = resolveReference(reference, session.menuItems);

  // Not in the menu we have seen — search Swiggy for it.
  if (!target) {
    const search = await searchMenuItems(userId, reference);
    session = getFoodSession(userId);
    target = resolveReference(reference, session.menuItems);
    if (!target) return search;
  }

  const item = session.menuItems.find((entry) => entry.id === target!.id);
  if (!item) return ok("I couldn't find that on the menu. What else would you like?");

  if (!item.inStock) {
    foodLog("recovery", { reason: "item_sold_out", item: item.name });
    const alternatives = suggestAlternatives(session.menuItems, item);
    return ok(
      `**${item.name}** is sold out right now.${alternatives ? `\n\nSimilar options:\n${alternatives}` : ""}\n\nWould you like one of these instead?`
    );
  }

  const restaurant = session.restaurant;
  const address = session.address;
  if (!address) return ensureAddress(userId);
  if (!restaurant) {
    return ok("Which restaurant would you like to order from?");
  }

  const existing = session.cart.find((line) => line.menuItemId === item.id);
  const nextLines: FoodCartLine[] = existing
    ? session.cart.map((line) =>
        line.menuItemId === item.id ? { ...line, quantity: line.quantity + intent.quantity } : line
      )
    : [
        ...session.cart,
        {
          menuItemId: item.id,
          name: item.name,
          quantity: intent.quantity,
          unitPrice: item.price,
          inStock: true,
          isVeg: item.isVeg,
        },
      ];

  try {
    const snapshot = await writeCart(
      restaurant.id,
      address.id,
      restaurant.name,
      toWriteLines(nextLines)
    );

    const recovery = detectCartProblem(snapshot, item.name);
    session = absorbCart(userId, snapshot);
    foodLog("cart.snapshot", { lines: session.cart.length, toPay: session.totals.toPay });

    if (recovery) return ok(recovery);

    // Swiggy reported success but the item we just tried to add is not in the
    // cart (closed restaurant, not serviceable, or the item was dropped). Don't
    // claim it was added — report it honestly so the user isn't misled.
    const landed = session.cart.some(
      (line) => line.menuItemId === item.id || line.name.toLowerCase() === item.name.toLowerCase()
    );
    if (!landed) {
      foodLog("recovery", { reason: "cart_not_added", item: item.name });
      return ok(
        `I tried to add **${item.name}**, but Swiggy didn't confirm it — it's not in your cart. This usually means that restaurant isn't taking orders for this item right now. Want to try a different restaurant or dish?`
      );
    }

    const added = intent.quantity > 1 ? `${intent.quantity} × **${item.name}**` : `**${item.name}**`;
    return ok(`Added ${added}.\n\n${formatCartSummary(session)}`);
  } catch (error) {
    return unavailable(error, "Nothing was added to your cart.");
  }
}

function suggestAlternatives(items: FoodMenuItem[], soldOut: FoodMenuItem): string {
  const similar = rankByName(soldOut.name, items.filter((i) => i.inStock && i.id !== soldOut.id), 0.3).slice(0, 3);
  const pool = similar.length > 0 ? similar : items.filter((i) => i.inStock && i.isBestseller).slice(0, 3);
  return pool.map((item) => `${item.index}. ${item.name} — ${rupees(item.price)}`).join("\n");
}

/** Turns Swiggy's in-band notices into a recoverable conversational message. */
function detectCartProblem(snapshot: CartSnapshot, itemName: string): string | null {
  const soldOut = snapshot.lines.filter((line) => !line.inStock);
  if (soldOut.length > 0) {
    return `Swiggy says ${soldOut.map((l) => `**${l.name}**`).join(", ")} just went out of stock. I've kept the rest of your cart — want to pick something else?`;
  }

  const notice = snapshot.notice.message;
  if (notice && /no longer taking|closed|not accepting/i.test(notice) && snapshot.lines.length === 0) {
    return `That restaurant stopped taking orders while we were building the cart. Want me to find somewhere else for ${itemName}?`;
  }

  return null;
}

export async function showCart(userId: string): Promise<FoodResult> {
  const session = getFoodSession(userId);
  logSessionState(userId, session);

  if (!session.address) return ensureAddress(userId);
  if (session.cart.length === 0) return ok("Your cart is empty. What would you like to order?");

  try {
    const snapshot = await fetchCart(session.address.id, session.restaurant?.name);
    const next = absorbCart(userId, snapshot);
    return ok(formatCartSummary(next));
  } catch {
    return ok(formatCartSummary(session));
  }
}

// ---------------------------------------------------------------- checkout

export async function checkout(userId: string): Promise<FoodResult> {
  let session = getFoodSession(userId);
  logSessionState(userId, session);

  const address = session.address;
  const restaurant = session.restaurant;
  if (!address) return ensureAddress(userId);
  if (session.cart.length === 0) return ok("There's nothing in your cart yet. What would you like to order?");
  if (!restaurant) return ok("Let's pick a restaurant first.");

  try {
    // Re-read the cart so the approval reflects live prices, not stale ones.
    const snapshot = await fetchCart(address.id, restaurant.name);
    const priorTotal = session.totals.toPay;
    session = absorbCart(userId, snapshot);

    if (session.cart.length === 0) {
      foodLog("recovery", { reason: "cart_emptied_at_checkout" });
      return ok("Your Swiggy cart came back empty — the restaurant may have stopped taking orders. Want me to find another place?");
    }

    const soldOut = session.cart.filter((line) => !line.inStock);
    if (soldOut.length > 0) {
      foodLog("recovery", { reason: "sold_out_at_checkout", items: soldOut.map((l) => l.name) });
      return ok(
        `Before we place this — ${soldOut.map((l) => `**${l.name}**`).join(", ")} just went out of stock. Shall I remove ${soldOut.length === 1 ? "it" : "them"} and continue?`
      );
    }

    if (priorTotal !== undefined && session.totals.toPay !== undefined && Math.abs(priorTotal - session.totals.toPay) > 1) {
      foodLog("recovery", { reason: "price_changed", from: priorTotal, to: session.totals.toPay });
    }

    // Payment options depend on the live cart amount.
    try {
      const methods = await fetchPaymentOptions(address.id);
      if (methods.length > 0) {
        session = updateFoodSession(userId, {
          paymentOptions: methods,
          paymentMethod: session.paymentMethod ?? methods[0],
        });
      }
    } catch {
      foodLog("recovery", { reason: "payment_options_unavailable" });
    }

    foodLog("checkout", {
      restaurant: restaurant.name,
      lines: session.cart.length,
      toPay: session.totals.toPay,
      payment: session.paymentMethod?.displayName,
    });

    const action = await createFoodApproval(session, userId);
    updateFoodSession(userId, { step: "awaiting_approval", approvalId: action.id });

    return {
      reply: `Here's your order — review and confirm to place it.`,
      action,
      awaitingUser: true,
    };
  } catch (error) {
    return unavailable(error, "Your cart is unchanged — want to try checking out again?");
  }
}

export async function cancelOrder(userId: string): Promise<FoodResult> {
  await flushCart();
  resetOrderKeepAddress(userId);
  foodLog("cart.change", { result: "cancelled" });
  return ok("No problem — I've cancelled that order and cleared the cart. Anything else you'd like?");
}

export async function selectPayment(userId: string, reference: string): Promise<FoodResult> {
  const session = getFoodSession(userId);

  if (session.paymentOptions.length === 0) {
    if (!session.address) return ensureAddress(userId);
    try {
      const methods = await fetchPaymentOptions(session.address.id);
      updateFoodSession(userId, { paymentOptions: methods });
    } catch (error) {
      return unavailable(error, "Want to try again?");
    }
  }

  const options = getFoodSession(userId).paymentOptions;
  const match = resolveReference(
    reference,
    options.map((method, i) => ({ index: i + 1, id: method.id, name: method.displayName }))
  );

  if (!match) {
    return ok(`Available payment methods:\n${options.map((m, i) => `${i + 1}. ${m.displayName}`).join("\n")}\n\nWhich would you like?`);
  }

  const chosen = options.find((m) => m.id === match.id)!;
  updateFoodSession(userId, { paymentMethod: chosen });
  return ok(`Payment set to **${chosen.displayName}**.`);
}
