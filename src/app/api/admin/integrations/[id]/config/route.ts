import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  getIntegrationConfig,
  upsertIntegrationConfig,
} from "@/lib/atlas/integrations/registry";

export const runtime = "edge";
export const dynamic = "force-dynamic";


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const { id } = await params;

  const config = await getIntegrationConfig(id);
  if (!config) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({
    config: {
      id: config.id,
      integrationId: config.integrationId,
      label: config.label,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? "••••" : null,
      enabled: config.enabled,
      metadata: JSON.parse(config.metadataJson),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const { id } = await params;
  const payload: unknown = await request.json();

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const config = await upsertIntegrationConfig({
    integrationId: id,
    label: typeof payload.label === "string" ? payload.label : undefined,
    baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl : undefined,
    apiKey: typeof payload.apiKey === "string" ? payload.apiKey : undefined,
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : undefined,
    metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
  });

  return NextResponse.json({
    config: {
      id: config.id,
      integrationId: config.integrationId,
      label: config.label,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? "••••" : null,
      enabled: config.enabled,
      metadata: JSON.parse(config.metadataJson),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    },
  });
}
