import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { listUserBriefs } from "@/lib/proactive/persist";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** GET /api/proactive/briefs — this user's delivered briefs (real data only). */
export async function GET(request: Request) {
  try {
    const actor = await getAtlasActor();
    if (!actor.isAuthenticated) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") || "10");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 10;

    const rows = await listUserBriefs(actor.userId, { limit });
    // Only real briefs. Synthetic previews never reach this endpoint.
    const briefs = rows.filter((row) => !row.synthetic).map((row) => ({
      id: row.id,
      triggerType: row.triggerType,
      period: row.period,
      title: row.title,
      items: row.items,
      deliveredAt: row.deliveredAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    }));

    return NextResponse.json({ briefs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[proactive] /briefs failed:", error);
    return NextResponse.json({ error: "Could not list briefs." }, { status: 500 });
  }
}