import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/lib/atlas/server/prisma";
import { foodLog } from "@/lib/atlas/mcp/food-log";
import { formatCartLines, formatTotals, rupees } from "@/lib/atlas/mcp/food-format";
import type { AtlasApprovalField, AtlasPendingAction } from "@/lib/atlas/agent-contract";
import type { FoodSession } from "@/lib/atlas/mcp/food-session";

const APPROVAL_TTL_MS = 15 * 60 * 1000;

/**
 * Payload persisted alongside the approval so execution can place the exact
 * order the user approved, without trusting anything sent back by the browser.
 */
export interface FoodOrderIntent {
  kind: "food_order";
  addressId: string;
  restaurantId: string;
  restaurantName?: string;
  paymentMethod?: string;
  intentApp?: string;
  generateUPIQR?: boolean;
  items: { menuItemId: string; name: string; quantity: number }[];
  toPay?: number;
}

/**
 * Builds the detailed approval card the brief calls for: restaurant, itemised
 * quantities, subtotal, taxes, delivery fee, discount, ETA, payment method and
 * grand total — instead of an opaque internal item ID.
 */
export async function createFoodApproval(session: FoodSession, userId: string): Promise<AtlasPendingAction> {
  const restaurant = session.restaurant;
  const totals = session.totals;

  if (!session.address || !restaurant) {
    throw new Error("Cannot create a food approval without an address and restaurant.");
  }

  const fields: AtlasApprovalField[] = [
    { label: "Restaurant", value: restaurant.name },
  ];

  const itemsValue = session.cart
    .map((line) => `${line.name} × ${line.quantity} — ${rupees(line.lineTotal ?? line.unitPrice)}`)
    .join("\n");
  fields.push({ label: "Items", value: itemsValue || "—" });

  if (totals.itemTotal !== undefined) fields.push({ label: "Subtotal", value: rupees(totals.itemTotal) });
  if (totals.taxesAndCharges !== undefined) fields.push({ label: "Taxes & charges", value: rupees(totals.taxesAndCharges) });
  if (totals.deliveryCharge !== undefined) {
    fields.push({
      label: "Delivery fee",
      value: totals.freeDelivery || totals.deliveryCharge === 0 ? "Free" : rupees(totals.deliveryCharge),
    });
  }
  if (totals.discount) {
    fields.push({
      label: "Discount",
      value: `−${rupees(totals.discount)}${totals.couponApplied ? ` (${totals.couponApplied})` : ""}`,
    });
  }

  const eta = restaurant.etaText ?? (restaurant.etaMinutes !== undefined ? `${restaurant.etaMinutes} min` : undefined);
  if (eta) fields.push({ label: "Estimated delivery", value: eta });

  fields.push({ label: "Deliver to", value: session.address.tag ?? session.address.line.slice(0, 60) });
  fields.push({ label: "Payment method", value: session.paymentMethod?.displayName ?? "Cash on delivery" });

  if (totals.toPay !== undefined) fields.push({ label: "Grand total", value: rupees(totals.toPay) });

  const intent: FoodOrderIntent = {
    kind: "food_order",
    addressId: session.address.id,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    paymentMethod:
      session.paymentMethod?.kind === "intent" || session.paymentMethod?.kind === "qr"
        ? "UPI"
        : session.paymentMethod?.displayName,
    intentApp: session.paymentMethod?.kind === "intent" ? session.paymentMethod.id : undefined,
    generateUPIQR: session.paymentMethod?.kind === "qr" ? true : undefined,
    items: session.cart.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
    })),
    toPay: totals.toPay,
  };

  const id = `atlas_${randomUUID()}`;
  const itemCount = session.cart.reduce((sum, line) => sum + line.quantity, 0);
  const summary = `${itemCount} item${itemCount === 1 ? "" : "s"} from ${restaurant.name}${
    totals.toPay !== undefined ? ` · ${rupees(totals.toPay)}` : ""
  }`;

  const action: AtlasPendingAction = {
    id,
    domain: "food",
    title: "Approve order",
    summary,
    approvalLabel: totals.toPay !== undefined ? `Place order · ${rupees(totals.toPay)}` : "Place order",
    fields,
  };

  await prisma.approval.create({
    data: {
      id,
      userId: userId === "atlas-demo-user" ? null : userId,
      domain: "food",
      title: action.title,
      summary: action.summary,
      // `fields` is the rendered card; `intent` is the server-trusted execution payload.
      fields: JSON.stringify({ fields, intent }),
      status: "pending",
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    },
  });

  foodLog("approval", {
    id,
    restaurant: restaurant.name,
    items: itemCount,
    toPay: totals.toPay,
    payment: intent.paymentMethod ?? "Cash",
  });

  return action;
}

/** Recovers the execution intent stored with an approval, if it is a food order. */
export function readFoodOrderIntent(fieldsJson: string): FoodOrderIntent | null {
  try {
    const parsed: unknown = JSON.parse(fieldsJson);
    if (typeof parsed !== "object" || parsed === null) return null;
    const intent = (parsed as { intent?: unknown }).intent;
    if (typeof intent !== "object" || intent === null) return null;
    if ((intent as FoodOrderIntent).kind !== "food_order") return null;
    return intent as FoodOrderIntent;
  } catch {
    return null;
  }
}

/** The approval card fields, tolerating both the legacy array and the new object shape. */
export function readApprovalFields(fieldsJson: string): AtlasApprovalField[] {
  try {
    const parsed: unknown = JSON.parse(fieldsJson);
    if (Array.isArray(parsed)) return parsed as AtlasApprovalField[];
    if (typeof parsed === "object" && parsed !== null) {
      const fields = (parsed as { fields?: unknown }).fields;
      if (Array.isArray(fields)) return fields as AtlasApprovalField[];
    }
  } catch {
    // fall through
  }
  return [];
}

export function summarizeForLog(session: FoodSession): string {
  return `${session.cart.length} lines / ${formatCartLines(session.cart).length} chars / ${formatTotals(session.totals).replace(/\n/g, "; ")}`;
}
