import { NextResponse } from "next/server";

import { listAccomplishments } from "@/lib/atlas/activity";
import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";


/** GET /api/activity — accomplishments (receipts / order outcomes). */
export async function GET(request: Request) {
  try {
    const actor = await getAtlasActor();
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") || "40");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 40;

    const items = await listAccomplishments(actor.userId, limit);

    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load activity." }, { status: 500 });
  }
}
