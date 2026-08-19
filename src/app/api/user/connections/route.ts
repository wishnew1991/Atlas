import { NextResponse } from "next/server";

import { getAtlasActor } from "@/lib/atlas/server/auth";
import { listUserConnections } from "@/lib/atlas/integrations/registry";
import { listIntegrations } from "@/lib/atlas/integrations/registry";

export const dynamic = "force-dynamic";


export async function GET() {
  const actor = await getAtlasActor();
  if (!actor.isAuthenticated) {
    return NextResponse.json({ error: "Sign in to view connections." }, { status: 401 });
  }

  const [connections, availableIntegrations] = await Promise.all([
    listUserConnections(actor.userId),
    listIntegrations(),
  ]);

  const result = connections.map((conn) => {
    const integration = availableIntegrations.find((i) => i.id === conn.integrationId);
    return {
      id: conn.id,
      integrationId: conn.integrationId,
      integrationName: integration?.name ?? conn.integrationId,
      transport: integration?.transport ?? "unknown",
      capabilities: integration?.capabilities.map((c) => c.capabilityId) ?? [],
      displayName: conn.displayName,
      status: conn.status,
      authMethod: integration?.authMethods.map((m) => m.kind).join(", ") ?? "unknown",
      scopes: integration?.authMethods.flatMap((m) => m.scopes ?? []) ?? [],
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      createdAt: conn.createdAt.toISOString(),
      updatedAt: conn.updatedAt.toISOString(),
    };
  });

  const connectedIds = new Set(result.map((c) => c.integrationId));
  const available = availableIntegrations
    .filter((i) => i.enabled && !connectedIds.has(i.id))
    .map((i) => ({
      integrationId: i.id,
      integrationName: i.name,
      capabilities: i.capabilities.map((c) => c.capabilityId),
      authMethod: i.authMethods.map((m) => m.kind).join(", "),
      transport: i.transport,
    }));

  return NextResponse.json({ connections: result, available });
}
