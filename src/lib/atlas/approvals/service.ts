import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/lib/atlas/server/prisma";
import type { AtlasActionDomain, AtlasPendingAction } from "@/lib/atlas/agent-contract";

const pendingActionLifetimeMs = 15 * 60 * 1000;

function titleForDomain(domain: AtlasActionDomain): string {
  switch (domain) {
    case "travel":
      return "Approve booking";
    case "food":
      return "Approve order";
    case "rides":
      return "Approve ride";
    case "appointments":
      return "Approve appointment";
    default:
      return "Approve purchase";
  }
}

export async function createApproval(
  domain: AtlasActionDomain,
  request: string,
  userId: string
): Promise<AtlasPendingAction> {
  const detailLabel =
    domain === "travel"
      ? "Trip"
      : domain === "food"
        ? "Order"
        : domain === "rides"
          ? "Route"
          : domain === "appointments"
            ? "Appointment"
            : "Request";
  const moneyLabel = domain === "rides" ? "Fare estimate" : "Total";

  const id = `atlas_${randomUUID()}`;

  const action: AtlasPendingAction = {
    id,
    domain,
    title: titleForDomain(domain),
    summary: request,
    approvalLabel: titleForDomain(domain),
    fields: [
      { label: detailLabel, value: request },
      { label: moneyLabel, value: "To be confirmed by the connected provider" },
      { label: "Payment", value: "Your selected payment method" },
      { label: "Control", value: "Nothing happens until you confirm" },
    ],
  };

  await prisma.approval.create({
    data: {
      id,
      userId: userId === "atlas-demo-user" ? null : userId,
      domain,
      title: action.title,
      summary: action.summary,
      fields: JSON.stringify(action.fields),
      status: "pending",
      expiresAt: new Date(Date.now() + pendingActionLifetimeMs),
    },
  });

  return action;
}
