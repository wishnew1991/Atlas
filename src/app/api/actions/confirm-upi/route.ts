import { NextRequest, NextResponse } from "next/server";

import { finalizeFoodUpi } from "@/lib/atlas/server/atlas-agent";
import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";


export const runtime = "edge";
export const dynamic = "force-dynamic";


export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const actionId =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>).actionId
      : undefined;

  if (typeof actionId !== "string" || !actionId.startsWith("atlas_")) {
    return NextResponse.json({ error: "This approval request is invalid or has expired." }, { status: 400 });
  }

  try {
    const actor = await getAtlasActor();
    const result = await finalizeFoodUpi(actionId, actor.userId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The action could not be completed.";
    const status = error instanceof AtlasAuthenticationError ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
