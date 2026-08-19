import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { dueCheck } from "@/lib/proactive/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/proactive/due
 * Lazy trigger: called on app/API activity (open, navigation). When the Daily
 * Brief is enabled and today's trigger time has passed, this generates (or
 * returns) today's brief. Honest semantics — this is a due-check, not true
 * proactive scheduling from the server.
 */
export async function GET() {
  try {
    const actor = await getAtlasActor();
    if (!actor.isAuthenticated) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const result = await dueCheck(actor.userId, {});

    return NextResponse.json(
      {
        ...result,
        due: result.ok,
        mode: "lazy",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[proactive] /due failed:", error);
    return NextResponse.json({ error: "Could not check your brief." }, { status: 500 });
  }
}