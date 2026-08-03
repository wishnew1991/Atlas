import "server-only";

import type { RoutineRunResult, RoutineRunner } from "@/lib/atlas/routines/types";
import {
  checkout,
  discoverRestaurants,
  ensureAddress,
  selectRestaurant,
  updateCart,
} from "@/lib/atlas/mcp/food-service";
import { getFoodSession, clearFoodSession } from "@/lib/atlas/mcp/food-session";
import { foodLog } from "@/lib/atlas/mcp/food-log";

/**
 * Food routine spec captured when a user says "remember this as my usual" or
 * when Atlas observes a repeating order. Stores only what's needed to rebuild
 * the order server-side: the dish to search, the preferred restaurant, and the
 * item line.
 */
export interface FoodRoutinePayload {
  dish: string;
  restaurant?: string;
  items?: Array<{ name: string; quantity: number }>;
}

export function isFoodRoutinePayload(value: unknown): value is FoodRoutinePayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.dish === "string" && v.dish.trim().length > 0;
}

/**
 * The first specialization of the Routine abstraction: replays a saved
 * "usual" order by driving the existing food pipeline (address → restaurant →
 * menu → cart) and ends by preparing an approval card. It never places the
 * order — checkout() only builds the approval.
 */
export const foodRoutineRunner: RoutineRunner = {
  domain: "food",

  async run(userId, payload) {
    if (!isFoodRoutinePayload(payload)) {
      return {
        message:
          "I don't have a saved usual order for you. Next time you order, I'll offer to remember it if I notice a pattern.",
        awaitingUser: false,
      };
    }

    foodLog("routine.run", { dish: payload.dish, restaurant: payload.restaurant ?? null });
    clearFoodSession(userId);

    // 1. Address — reuse the existing address flow (list or confirm).
    let result = await ensureAddress(userId);
    if (result.awaitingUser) return { message: result.reply, awaitingUser: true };

    // 2. Find the restaurant by the remembered dish.
    result = await discoverRestaurants(userId, payload.dish);
    if (result.awaitingUser) return { message: result.reply, awaitingUser: true };

    // 3. Prefer the remembered restaurant when it is in the results.
    if (payload.restaurant) {
      result = await selectRestaurant(userId, payload.restaurant);
      if (result.awaitingUser) return { message: result.reply, awaitingUser: true };
    }

    // 4. Add the remembered item(s) to the cart.
    if (payload.items && payload.items.length > 0) {
      for (const item of payload.items) {
        result = await updateCart(userId, `add ${item.quantity} ${item.name}`);
        if (result.awaitingUser) return { message: result.reply, awaitingUser: true };
      }
    } else {
      result = await updateCart(userId, `add 1 ${payload.dish}`);
      if (result.awaitingUser) return { message: result.reply, awaitingUser: true };
    }

    // 5. Prepare the approval (never place).
    const checkoutResult = await checkout(userId);
    if (checkoutResult.action) {
      foodLog("routine.approval", { restaurant: getFoodSession(userId).restaurant?.name });
      return { message: checkoutResult.reply, action: checkoutResult.action, awaitingUser: true };
    }
    return { message: checkoutResult.reply, awaitingUser: checkoutResult.awaitingUser };
  },
};