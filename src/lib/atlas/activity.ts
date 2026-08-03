import "server-only";

import type {
  ActivityAccomplishment,
  ActivityAction,
  ActivityReceiptField,
  ActivityTimelineStep,
} from "@/lib/atlas/activity-types";
import { readApprovalFields } from "@/lib/atlas/mcp/food-approval";
import { prisma } from "@/lib/atlas/server/prisma";

export type {
  ActivityAccomplishment,
  ActivityAction,
  ActivityReceiptField,
  ActivityTimelineStep,
} from "@/lib/atlas/activity-types";

function dbUserId(userId: string): string | null {
  return userId === "atlas-demo-user" ? null : userId;
}

function fieldValue(fields: { label: string; value: string }[], label: string): string | undefined {
  const hit = fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
  return hit?.value;
}

function foodTitle(fields: { label: string; value: string }[], summary: string): string {
  const items = fieldValue(fields, "Items");
  if (items) {
    const first = items
      .split("\n")[0]
      ?.replace(/\s*[—-].*$/, "")
      .replace(/\s*×\s*\d+.*$/, "")
      .trim();
    if (first) return first;
  }
  const restaurant = fieldValue(fields, "Restaurant");
  if (restaurant) return `Order · ${restaurant}`;
  return summary || "Food order";
}

function headlineFor(
  status: string,
  domain: string
): { label: string; tone: ActivityAccomplishment["statusTone"] } {
  if (status === "pending_payment") return { label: "Awaiting payment", tone: "amber" };
  if (status === "failed") return { label: "Failed", tone: "red" };
  if (status === "completed") {
    if (domain === "food") return { label: "Placed", tone: "green" };
    if (domain === "travel") return { label: "Booked", tone: "green" };
    return { label: "Completed", tone: "green" };
  }
  return { label: status, tone: "blue" };
}

function foodTimeline(status: string): ActivityTimelineStep[] {
  const steps = ["Placed", "Preparing", "Out for delivery", "Delivered"] as const;

  if (status === "pending_payment") {
    return [
      { id: "payment", label: "Payment", state: "current" },
      ...steps.map((label) => ({
        id: label.toLowerCase().replace(/\s+/g, "_"),
        label,
        state: "upcoming" as const,
      })),
    ];
  }

  if (status === "failed") {
    return [
      { id: "placed", label: "Placed", state: "upcoming" },
      { id: "failed", label: "Failed", state: "current" },
    ];
  }

  // Honest until live carrier tracking exists: order is placed; later stages upcoming.
  return steps.map((label, index) => ({
    id: label.toLowerCase().replace(/\s+/g, "_"),
    label,
    state: (index === 0 ? "done" : index === 1 ? "current" : "upcoming") as ActivityTimelineStep["state"],
  }));
}

function genericTimeline(status: string, domain: string): ActivityTimelineStep[] {
  const mid = domain === "travel" ? "Booked" : "Confirmed";
  if (status === "failed") {
    return [
      { id: "requested", label: "Requested", state: "done" },
      { id: "failed", label: "Failed", state: "current" },
    ];
  }
  return [
    { id: "requested", label: "Requested", state: "done" },
    { id: "approved", label: "Approved", state: "done" },
    { id: "done", label: mid, state: status === "completed" ? "done" : "current" },
  ];
}

function buildReceipt(
  domain: string,
  fields: { label: string; value: string }[],
  orderNumber: string | undefined,
  status: string,
  completedAt: Date | null
): ActivityReceiptField[] {
  const receipt: ActivityReceiptField[] = [];

  const restaurant = fieldValue(fields, "Restaurant");
  if (restaurant) receipt.push({ label: "Restaurant", value: restaurant });

  if (orderNumber) receipt.push({ label: "Order #", value: orderNumber });

  const eta = fieldValue(fields, "Estimated delivery");
  if (status === "completed" && completedAt) {
    receipt.push({
      label: "ETA",
      value: `Placed ${completedAt.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`,
    });
  } else if (eta) {
    receipt.push({ label: "ETA", value: eta });
  }

  const payment = fieldValue(fields, "Payment method");
  if (payment) receipt.push({ label: "Payment", value: payment });

  const total = fieldValue(fields, "Grand total");
  if (total) receipt.push({ label: "Total", value: total });

  const deliverTo = fieldValue(fields, "Deliver to");
  if (deliverTo) receipt.push({ label: "Deliver to", value: deliverTo });

  if (domain !== "food") {
    for (const field of fields) {
      if (receipt.some((r) => r.label === field.label)) continue;
      receipt.push({ label: field.label, value: field.value });
    }
  } else {
    const items = fieldValue(fields, "Items");
    if (items) receipt.push({ label: "Items", value: items });
  }

  return receipt;
}

function buildActions(domain: string, status: string): ActivityAction[] {
  const actions: ActivityAction[] = [];
  if (domain === "food") {
    actions.push({
      id: "order_again",
      label: "Order again",
      enabled: status === "completed" || status === "failed",
    });
    actions.push({
      id: "track",
      label: status === "pending_payment" ? "Complete payment" : "Track",
      enabled: true,
    });
  }
  actions.push({ id: "open_chat", label: "Open Chat", enabled: true });
  return actions;
}

export function approvalToAccomplishment(row: {
  id: string;
  domain: string;
  title: string;
  summary: string;
  fields: string;
  status: string;
  reference: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): ActivityAccomplishment {
  const fields = readApprovalFields(row.fields);
  const headline = headlineFor(row.status, row.domain);
  const orderNumber = row.reference || undefined;

  const title =
    row.domain === "food"
      ? foodTitle(fields, row.summary)
      : row.summary || row.title.replace(/^Approve\s+/i, "");

  return {
    id: row.id,
    domain: row.domain,
    title,
    headlineStatus: headline.label,
    statusTone: headline.tone,
    summary: row.summary,
    orderNumber,
    receipt: buildReceipt(row.domain, fields, orderNumber, row.status, row.completedAt),
    timeline: row.domain === "food" ? foodTimeline(row.status) : genericTimeline(row.status, row.domain),
    actions: buildActions(row.domain, row.status),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

/** Accomplishments Atlas finished (or is tracking after approval). */
export async function listAccomplishments(
  userId: string,
  limit = 40
): Promise<ActivityAccomplishment[]> {
  const uid = dbUserId(userId);
  const rows = await prisma.approval.findMany({
    where: {
      userId: uid,
      status: { in: ["completed", "failed", "pending_payment"] },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return rows.map(approvalToAccomplishment);
}
