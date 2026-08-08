import { NextResponse } from "next/server";

import { getAtlasActor } from "@/lib/atlas/server/auth";
import { deleteUserConnectionByIntegration } from "@/lib/atlas/integrations/registry";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const actor = await getAtlasActor();
  if (!actor.isAuthenticated) {
    return NextResponse.json({ error: "Sign in to disconnect services." }, { status: 401 });
  }

  const { integrationId } = await params;

  const deleted = await deleteUserConnectionByIntegration(actor.userId, integrationId);
  if (!deleted) {
    return NextResponse.json(
      { error: "No active connection found for this service." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
