import { NextRequest, NextResponse } from "next/server";

import { routines } from "@/lib/atlas/routines";
import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";


export const dynamic = "force-dynamic";


/**
 * Handle the user's Yes/No on a naturally-discovered routine suggestion.
 * Accept persists the routine (e.g. the "usual order"); decline says "never
 * ask again" for that signature. This is the chat-side equivalent of the
 * `routine_decision` LLM tool — it never places any action on its own.
 */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const body =
    typeof payload === "object" && payload !== null
      ? (payload as { accept?: unknown; observationId?: unknown })
      : null;

  const observationId = typeof body?.observationId === "string" ? body.observationId : "";
  const accept = body?.accept === true;

  if (!observationId) {
    return NextResponse.json({ error: "This routine suggestion is invalid." }, { status: 400 });
  }

  try {
    const actor = await getAtlasActor();
    const result = await routines.decide(actor.userId, observationId, accept);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The routine could not be updated.";
    const status = error instanceof AtlasAuthenticationError ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}