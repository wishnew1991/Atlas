import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { acknowledgeBrief } from "@/lib/proactive/persist";

export const dynamic = "force-dynamic";

/** POST /api/proactive/briefs/[id]/ack — mark the user's brief as acknowledged. */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAtlasActor();
    if (!actor.isAuthenticated) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { id } = await ctx.params;
    const row = await acknowledgeBrief(actor.userId, id);
    if (!row) {
      return NextResponse.json({ error: "Brief not found." }, { status: 404 });
    }

    return NextResponse.json(
      { acknowledged: true, acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[proactive] ack failed:", error);
    return NextResponse.json({ error: "Could not acknowledge the brief." }, { status: 500 });
  }
}