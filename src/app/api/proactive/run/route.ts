import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { evaluateForUser } from "@/lib/proactive/engine";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * POST /api/proactive/run
 * Manually trigger a Daily Brief evaluation for the signed-in user.
 * Never accepts demo mode — demo previews live behind the admin boundary.
 */
export async function POST() {
  try {
    const actor = await getAtlasActor();
    if (!actor.isAuthenticated) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const result = await evaluateForUser(actor.userId, {});
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[proactive] /run failed:", error);
    return NextResponse.json({ error: "Could not generate your brief." }, { status: 500 });
  }
}