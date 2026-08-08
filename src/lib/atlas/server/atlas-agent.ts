import "server-only";

import type {
  AtlasActionDomain,
  AtlasChatHistoryItem,
  AtlasChatResponse,
  AtlasActionResponse,
} from "@/lib/atlas/agent-contract";
import { prisma } from "@/lib/atlas/server/prisma";
import { routeToolCall } from "@/lib/atlas/mcp/router";
import { readFoodOrderIntent, type FoodOrderIntent } from "@/lib/atlas/mcp/food-approval";
import type { AtlasCapabilities } from "@/lib/atlas/server/auth";
import {
  createAtlasReplyCore,
  streamAtlasReplyCore,
  looksLikeToolPayload,
  type AtlasStreamChunk,
} from "@/lib/atlas/server/agent/reply";
import { emitCommittedDomainEffect } from "@/lib/atlas/effects";
import { runChatExecution, streamChatExecution } from "@/lib/execution/engine";

export { looksLikeToolPayload };
export type { AtlasStreamChunk };

export async function createAtlasReply(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  options?: { conversationId?: string; executionId?: string }
): Promise<AtlasChatResponse> {
  const result = await runChatExecution(
    message,
    history,
    userId,
    capabilities,
    demoResponse,
    options
  );
  return result;
}

export async function* streamAtlasReply(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  signal?: AbortSignal,
  options?: { conversationId?: string; executionId?: string }
): AsyncGenerator<AtlasStreamChunk> {
  yield* streamChatExecution(
    message,
    history,
    userId,
    capabilities,
    demoResponse,
    signal,
    options
  );
}

export async function executeAtlasAction(actionId: string, userId: string) {
  const pending = await prisma.approval.findUnique({ where: { id: actionId } });

  const ownsAction = userId === "atlas-demo-user" ? pending?.userId === null : pending?.userId === userId;

  if (!pending || !ownsAction || pending.expiresAt.getTime() < Date.now()) {
    if (pending) {
      await prisma.approval.delete({ where: { id: actionId } }).catch(() => {});
    }
    throw new Error("This approval request has expired. Please ask Atlas to prepare it again.");
  }

  const resumeLinkedExecution = async () => {
    try {
      const { findPendingExecutionForApproval, resumeExecutionAfterApproval } = await import(
        "@/lib/execution/engine"
      );
      const executionId = await findPendingExecutionForApproval(actionId);
      if (executionId) {
        await resumeExecutionAfterApproval(executionId, actionId);
      }
    } catch {
      /* execution resume is best-effort */
    }
  };

  const domain = pending.domain as AtlasActionDomain;

  if (domain === "food") {
    const intent = readFoodOrderIntent(pending.fields);

    if (intent) {
      const { placeOrder } = await import("@/lib/atlas/mcp/swiggy-client");
      const { foodLog } = await import("@/lib/atlas/mcp/food-log");
      const { updateFoodSession } = await import("@/lib/atlas/mcp/food-session");

      foodLog("order.place", {
        approval: actionId,
        restaurant: intent.restaurantName,
        items: intent.items.length,
        toPay: intent.toPay,
        payment: intent.paymentMethod ?? "Cash",
      });

      const placed = await placeOrder({
        addressId: intent.addressId,
        paymentMethod: intent.paymentMethod,
        intentApp: intent.intentApp,
        // Always ask for a QR backup — desktop browsers cannot open gpay:// deep links.
        generateUPIQR: Boolean(intent.generateUPIQR || intent.intentApp),
      });

      const isPendingPayment = placed.status === "PENDING_PAYMENT" || Boolean(placed.upiLink || placed.upiQr);

      if (isPendingPayment) {
        foodLog("order.place", { approval: actionId, result: "pending_payment", orderId: placed.orderId });

        const meta = JSON.stringify({
          orderId: placed.orderId ?? null,
          paasId: placed.paasId ?? null,
          cartId: placed.cartId ?? null,
          lat: placed.lat ?? null,
          lng: placed.lng ?? null,
          addressId: intent.addressId,
          upiLink: placed.upiLink ?? null,
          upiQr: placed.upiQr ?? null,
          paymentRef: placed.paymentRef ?? null,
        });

        await prisma.approval.update({
          where: { id: actionId },
          data: { status: "pending_payment", meta, reference: placed.orderId ?? placed.paymentRef ?? pending.id },
        });

        updateFoodSession(userId, { step: "pending_payment", approvalId: actionId });

        const amount =
          typeof intent.toPay === "number" ? `₹${Math.round(intent.toPay)}` : "the order total";

        return {
          message: `Swiggy is waiting for UPI payment of ${amount}. This will **not** show up as a request inside Google Pay by itself — open the payment link (on your phone) or scan the QR, then come back and tap I’ve paid.`,
          reference: placed.orderId ?? placed.paymentRef ?? pending.id,
          mode: "live" as const,
          pending: true,
          upiRedirect: placed.upiLink,
          upiQr: placed.upiQr,
        };
      }

      await prisma.approval.update({
        where: { id: actionId },
        data: { status: "completed", completedAt: new Date(), reference: placed.orderId ?? pending.id },
      });

      updateFoodSession(userId, { step: "placed", approvalId: undefined });
      foodLog("order.place", { approval: actionId, result: "ok", orderId: placed.orderId });
      await resumeLinkedExecution();

      const suggestion = await emitCommittedDomainEffect("food", intent, userId);

      return {
        message: placed.message || `Your order from ${intent.restaurantName ?? "the restaurant"} is placed.`,
        reference: placed.orderId ?? pending.id,
        mode: "live" as const,
        ...(suggestion ? { routineSuggestion: suggestion } : {}),
      };
    }
  }

  const gatewayResult = await routeToolCall(domain, "execute", { domain, request: pending.summary });

  await prisma.approval.update({
    where: { id: actionId },
    data: {
      status: "completed",
      completedAt: new Date(),
      reference: gatewayResult?.message ?? pending.id,
    },
  });

  await resumeLinkedExecution();

  if (gatewayResult) {
    return {
      message: gatewayResult.message || pending.title.replace("Approve ", "") + " confirmed.",
      reference: pending.id,
      mode: "live" as const,
    };
  }

  return {
    message:
      pending.title.replace("Approve ", "") +
      " confirmed in demo mode. Connect the MCP gateway to place a live " +
      domain +
      " request.",
    reference: pending.id,
    mode: "demo" as const,
  };
}

export async function finalizeFoodUpi(actionId: string, userId: string): Promise<AtlasActionResponse> {
  const pending = await prisma.approval.findUnique({ where: { id: actionId } });

  const ownsAction = userId === "atlas-demo-user" ? pending?.userId === null : pending?.userId === userId;
  if (!pending || !ownsAction) {
    throw new Error("This approval request is invalid or has expired.");
  }
  if (pending.status !== "pending_payment") {
    return {
      message: pending.status === "completed" ? "Your order is already confirmed." : "This order is not awaiting UPI payment.",
      reference: pending.reference ?? pending.id,
      mode: "live" as const,
    };
  }

  let meta: Record<string, unknown> = {};
  try {
    if (pending.meta) meta = JSON.parse(pending.meta);
  } catch {
    meta = {};
  }

  const orderId = typeof meta.orderId === "string" ? meta.orderId : undefined;
  const paasId = typeof meta.paasId === "string" ? meta.paasId : undefined;
  const cartId = typeof meta.cartId === "string" ? meta.cartId : undefined;
  const addressId = typeof meta.addressId === "string" ? meta.addressId : undefined;
  const lat = typeof meta.lat === "number" ? meta.lat : undefined;
  const lng = typeof meta.lng === "number" ? meta.lng : undefined;

  if (!orderId || !addressId) {
    throw new Error("Missing order details needed to confirm payment.");
  }

  const { checkUpiPayment, confirmFoodOrder } = await import("@/lib/atlas/mcp/swiggy-client");
  const { foodLog } = await import("@/lib/atlas/mcp/food-log");
  const { updateFoodSession } = await import("@/lib/atlas/mcp/food-session");

  foodLog("upi.finalize", { approval: actionId, orderId });

  const status = await checkUpiPayment({ orderId, paasId, addressId, cartId, lat, lng });

  if (status === "SUCCESS" || status === "PAID") {
    await confirmFoodOrder({ orderId, addressId, cartId, lat, lng });
    await prisma.approval.update({
      where: { id: actionId },
      data: { status: "completed", completedAt: new Date(), reference: orderId },
    });
    updateFoodSession(userId, { step: "placed", approvalId: undefined });
    foodLog("upi.finalize", { approval: actionId, result: "confirmed", orderId });

    try {
      const { findPendingExecutionForApproval, resumeExecutionAfterApproval } = await import(
        "@/lib/execution/engine"
      );
      const executionId = await findPendingExecutionForApproval(actionId);
      if (executionId) {
        await resumeExecutionAfterApproval(executionId, actionId);
      }
    } catch {
      /* execution resume is best-effort */
    }

    return {
      message: "Payment received — your Swiggy order is placed. 🎉",
      reference: orderId,
      mode: "live" as const,
    };
  }

  if (status === "FAILED" || status === "REFUND-INITIATED" || status === "CANCELLED" || status === "CANCELED" || status === "EXPIRED") {
    await prisma.approval.update({
      where: { id: actionId },
      data: { status: "failed", completedAt: new Date() },
    });
    foodLog("upi.finalize", { approval: actionId, result: status, orderId });

    try {
      const { findPendingExecutionForApproval, resumeExecutionAfterApproval } = await import(
        "@/lib/execution/engine"
      );
      const executionId = await findPendingExecutionForApproval(actionId);
      if (executionId) {
        await resumeExecutionAfterApproval(executionId, actionId, { failed: true });
      }
    } catch {
      /* execution resume is best-effort */
    }

    return {
      message:
        status === "REFUND-INITIATED"
          ? "A refund has been initiated for the failed payment."
          : status === "CANCELLED" || status === "CANCELED"
            ? "The UPI payment was cancelled. No order was placed — you can checkout again when ready."
            : "The UPI payment didn't go through. You can checkout again to retry.",
      reference: orderId,
      mode: "live" as const,
    };
  }

  return {
    message:
      "Payment is still processing — it will update automatically once your UPI app confirms. You can check again in a moment.",
    reference: orderId,
    mode: "live" as const,
    pending: true,
  };
}

const domainKeywords: Record<AtlasActionDomain, RegExp> = {
  travel:
    /\b(flight|flights|hotel|hotels|trip|trips|travel|book(ing)?\s+(a\s+)?(flight|hotel|trip)|vacation|itinerary|airbnb|airline)\b/i,
  food: /\b(food|restaurant|restaurants|biryani|dinner|lunch|breakfast|swiggy|zomato|deliver(?:y|ed)?|menu|order\s+(food|from)|pizza|burger|sushi|meal|snack|eat|cuisine)\b/i,
  rides:
    /\b(ride|rides|uber|ola|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop|chauffeur)\b/i,
  appointments:
    /\b(appointment|appointments|doctor|salon|spa|meeting|book\s+(a\s+)?(slot|appointment)|schedule\s+(a\s+)?(visit|call)|dentist|consultation)\b/i,
  shopping: /\b(buy|purchase|shop|shopping|cart|checkout|product|amazon|flipkart|order\s+(a|the|some)?\s*\w+)\b/i,
};

const identityChat =
  /^\s*(who\s+are\s+you|introduce\s+yourself|what\s+are\s+you|what\s+is\s+atlas|tell\s+me\s+about\s+(you|atlas|yourself)|what\s+can\s+you\s+do|your\s+name|are\s+you\s+(a\s+)?(bot|assistant|ai)|describe\s+yourself)\b/i;

function domainForText(text: string): AtlasActionDomain | null {
  const lower = text.toLowerCase();
  const priority: AtlasActionDomain[] = ["travel", "food", "rides", "appointments", "shopping"];
  for (const domain of priority) {
    if (domainKeywords[domain].test(lower)) return domain;
  }
  return null;
}

async function demoResponse(
  message: string,
  _history: AtlasChatHistoryItem[],
  userId: string,
  _capabilities: AtlasCapabilities,
  _options?: { conversationId?: string; executionId?: string }
): Promise<AtlasChatResponse> {
  if (identityChat.test(message.trim())) {
    return {
      reply:
        "I'm Atlas, your assistant. I can help with shopping, travel, food, rides, and appointments — just ask (for example, “find me a hotel in Paris” or “order biryani”).",
      mode: "demo",
      toolsUsed: [],
    };
  }

  // Check if user is mid-flow in a domain pipeline (e.g. picked an address
  // in the food flow). Continuation messages like "5", "yes", "that one"
  // should route back to the active pipeline, not the LLM.
  const { getFoodSession: getFoodSessionForCheck } = await import("@/lib/atlas/mcp/food-session");
  const activeFoodSession = getFoodSessionForCheck(userId);
  const isFoodContinuation = activeFoodSession.step !== "idle";

  const domain = isFoodContinuation ? "food" : domainForText(message);

  if (!domain) {
    return {
      reply:
        "I'm Atlas, your assistant. I can help with shopping, travel, food, rides, and appointments — just ask, or chat with me about anything.",
      mode: "demo",
      toolsUsed: [],
    };
  }

  if (domain === "food") {
    const { getFoodSession, hydrateFoodSession } = await import("@/lib/atlas/mcp/food-session");
    const foodService = await import("@/lib/atlas/mcp/food-service");
    const { getSelectedProvider } = await import("@/lib/atlas/flows/provider-state");

    await hydrateFoodSession(userId);
    const session = getFoodSession(userId);
    const providerName = getSelectedProvider(domain) ?? "MCP";

    // Route to the right handler based on where the user is in the flow.
    switch (session.step) {
      case "idle":
      case "awaiting_address":
        return { reply: (await foodService.ensureAddress(userId, message)).reply, mode: "demo", toolsUsed: [providerName] };
      case "browsing_restaurants":
        return { reply: (await foodService.selectRestaurant(userId, message)).reply, mode: "demo", toolsUsed: [providerName] };
      case "browsing_menu":
        return { reply: (await foodService.updateCart(userId, message)).reply, mode: "demo", toolsUsed: [providerName] };
      case "building_cart":
        return { reply: (await foodService.updateCart(userId, message)).reply, mode: "demo", toolsUsed: [providerName] };
      case "awaiting_approval":
      case "pending_payment":
        return { reply: (await foodService.checkout(userId)).reply, mode: "demo", toolsUsed: [providerName] };
      default:
        return { reply: (await foodService.ensureAddress(userId, message)).reply, mode: "demo", toolsUsed: [providerName] };
    }
  }

  const result = await routeToolCall(domain, "search", { domain, request: message });

  if (result) {
    const { sanitizeAssistantText } = await import("@/lib/atlas/server/agent/tools");
    const cleanReply = sanitizeAssistantText(result.message);
    return {
      reply: cleanReply || "I found the relevant information for your request.",
      mode: "demo",
      toolsUsed: ["MCP"],
    };
  }

  return {
    reply:
      "I'm Atlas, your assistant. I can help with that — connect an MCP service for this domain and I'll search and prepare actions for your approval.",
    mode: "demo",
    toolsUsed: [],
  };
}
