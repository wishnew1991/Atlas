import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { CheckoutError, completeUpiOrder, createUpiOrderForUser } from "@/lib/atlas/server/checkout";
import { resolveEffectiveTier, setUserTier, type TierId } from "@/lib/atlas/server/tiers";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const PLAN_RANK: Record<TierId, number> = { free: 0, premium: 1, vip: 2 };

/**
 * Initiate or complete a UPI collect upgrade.
 * - POST /api/checkout/upi  body { plan, upiId } → creates a pending order + intent link.
 * - POST /api/checkout/upi/verify  body { orderId } → marks paid (demo PSP) when upgrading.
 */
export async function POST(request: Request) {
  try {
    const actor = await getAtlasActor();
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const isVerify = payload.verify === true;

    if (!isVerify) {
      const plan = (typeof payload.plan === "string" ? payload.plan : "") as TierId;
      const upiId = typeof payload.upiId === "string" ? payload.upiId.trim() : "";
      if (plan !== "premium" && plan !== "vip") {
        return NextResponse.json({ error: "Choose Standard or VIP." }, { status: 400 });
      }
      const current = await resolveEffectiveTier(actor);
      if (PLAN_RANK[plan] <= PLAN_RANK[current]) {
        return NextResponse.json(
          { error: `You are already on ${current}. Pick a higher plan.` },
          { status: 400 }
        );
      }

      const { order, intentUri } = await createUpiOrderForUser(actor.userId, plan, upiId);
      return NextResponse.json({ orderId: order.orderId, intentUri, amountInr: order.amountInr, expiresAt: order.expiresAt });
    }

    const orderId = typeof payload.orderId === "string" ? payload.orderId : "";
    if (!orderId) return NextResponse.json({ error: "orderId required." }, { status: 400 });

    const { plan } = await completeUpiOrder(actor.userId, orderId);
    await setUserTier(actor.userId, plan);
    const tier = await resolveEffectiveTier(actor);
    return NextResponse.json({ ok: true, tier });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not process payment." }, { status: 500 });
  }
}