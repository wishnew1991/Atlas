import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { loadLatestConversationSnapshot } from "@/lib/atlas/conversation/persist";


/** GET /api/conversations?latest=1 — restore the actor's most recent thread. */
export async function GET(request: Request) {
  try {
    const actor = await getAtlasActor();
    const url = new URL(request.url);
    const latest = url.searchParams.get("latest") === "1";

    if (!latest) {
      return NextResponse.json({ error: "Use ?latest=1 to load the current conversation." }, { status: 400 });
    }

    const conversation = await loadLatestConversationSnapshot(actor.userId);
    return NextResponse.json(
      { conversation },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load conversations." }, { status: 500 });
  }
}
