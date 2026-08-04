import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { loadConversationSnapshot } from "@/lib/atlas/conversation/persist";


/** GET /api/conversations/:id — restore a specific thread the actor owns. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAtlasActor();
    const { id } = await context.params;
    const conversationId = typeof id === "string" ? id.trim() : "";

    if (!conversationId) {
      return NextResponse.json({ error: "Conversation id required." }, { status: 400 });
    }

    const conversation = await loadConversationSnapshot(actor.userId, conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    return NextResponse.json(
      { conversation },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load conversation." }, { status: 500 });
  }
}
