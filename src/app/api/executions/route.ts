import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { getUserExecutions, listExecutionsByConversation, toPublicExecution } from "@/lib/execution/manager";


export const dynamic = "force-dynamic";


/** GET /api/executions?conversationId=&limit= — list recent executions for a thread or user. */
export async function GET(request: Request) {
  try {
    const actor = await getAtlasActor();
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId")?.trim() || "";
    const limitRaw = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 50;

    const executions = conversationId
      ? await listExecutionsByConversation(conversationId, limit)
      : await getUserExecutions(actor.userId, limit);

    return NextResponse.json(
      { executions: executions.map(toPublicExecution) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not list executions." }, { status: 500 });
  }
}
