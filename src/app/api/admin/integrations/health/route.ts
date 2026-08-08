import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  listIntegrations,
  getIntegrationConfig,
} from "@/lib/atlas/integrations/registry";

interface HealthEntry {
  integrationId: string;
  name: string;
  configured: boolean;
  status: "healthy" | "unconfigured" | "disabled";
}

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const integrations = await listIntegrations();
  const entries: HealthEntry[] = [];

  for (const integration of integrations) {
    if (!integration.enabled) {
      entries.push({
        integrationId: integration.id,
        name: integration.name,
        configured: false,
        status: "disabled",
      });
      continue;
    }

    const config = await getIntegrationConfig(integration.id);
    const configured = Boolean(config?.apiKey || config?.baseUrl || config?.oauthToken);

    entries.push({
      integrationId: integration.id,
      name: integration.name,
      configured,
      status: configured ? "healthy" : "unconfigured",
    });
  }

  return NextResponse.json({ health: entries });
}
