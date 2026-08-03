import "server-only";

import type { FoodSession } from "@/lib/atlas/mcp/food-session";

// Structured, single-line observability for the food ordering pipeline.
//
// Every stage of the journey emits one parseable record, so a failed order can
// be reconstructed end to end:
//   session state -> restaurant -> menu -> cart change -> checkout -> approval -> placement
//
// Enabled by default in development; set ATLAS_FOOD_LOG=0 to silence, or =1 to
// force it on in production.

export type FoodLogEvent =
  | "session.state"
  | "address.list"
  | "address.select"
  | "restaurant.search"
  | "restaurant.search.fields"
  | "restaurant.search.fallback"
  | "restaurant.select"
  | "menu.fetch"
  | "menu.search"
  | "menu.search.redirect"
  | "cart.change"
  | "cart.absorb.empty"
  | "cart.snapshot"
  | "checkout"
  | "approval"
  | "order.place"
  | "upi.finalize"
  | "upi.status"
  | "recovery"
  | "remembered.run"
  | "remembered.approval"
  | "remembered.missing"
  | "remembered.save"
  | "routine.run"
  | "routine.approval"
  | "routine.observe"
  | "routine.accept"
  | "routine.decline"
  | "mcp.call"
  | "mcp.error"
  | "mcp.empty"
  | "tool.call";

function enabled(): boolean {
  const flag = process.env.ATLAS_FOOD_LOG;
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function foodLog(event: FoodLogEvent, detail: Record<string, unknown> = {}): void {
  if (!enabled()) return;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined || value === null) continue;
    const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
    parts.push(`${key}=${rendered}`);
  }

  // console.info keeps these out of the error stream used for real failures.
  console.info(`[atlas:food] ${event}${parts.length ? " " + parts.join(" ") : ""}`);
}

/** Snapshot of the FoodSession, logged at the start of every food tool call. */
export function logSessionState(userId: string, session: FoodSession): void {
  foodLog("session.state", {
    user: userId.slice(0, 12),
    step: session.step,
    address: session.address?.id,
    restaurant: session.restaurant ? `${session.restaurant.id}:${session.restaurant.name}` : undefined,
    menuItems: session.menuItems.length,
    cartLines: session.cart.length,
    toPay: session.totals.toPay,
    approval: session.approvalId,
  });
}
