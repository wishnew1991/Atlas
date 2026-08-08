import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  getIntegration,
  updateIntegration,
  deleteIntegration,
} from "@/lib/atlas/integrations/registry";
import { isCanonicalCapability, type CanonicalCapability } from "@/lib/atlas/capabilities/types";
import type { AuthMethod } from "@/lib/atlas/integrations/types";
import { TRANSPORT_KINDS } from "@/lib/atlas/integrations/types";

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

  const integration = await getIntegration(id);
  if (!integration) {
    return NextResponse.json({ error: "Integration not found." }, { status: 404 });
  }

  return NextResponse.json({ integration });
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

  const existing = await getIntegration(id);
  if (!existing) {
    return NextResponse.json({ error: "Integration not found." }, { status: 404 });
  }

  const fields: Parameters<typeof updateIntegration>[1] = {};

  if (typeof payload.name === "string" && payload.name.trim()) {
    fields.name = payload.name.trim();
  }
  if (typeof payload.transport === "string" && TRANSPORT_KINDS.includes(payload.transport as typeof TRANSPORT_KINDS[number])) {
    fields.transport = payload.transport as typeof TRANSPORT_KINDS[number];
  }
  if (payload.icon === null || typeof payload.icon === "string") {
    fields.icon = payload.icon;
  }
  if (payload.description === null || typeof payload.description === "string") {
    fields.description = payload.description;
  }
  if (typeof payload.enabled === "boolean") {
    fields.enabled = payload.enabled;
  }
  if (Array.isArray(payload.authMethods)) {
    const authMethods: AuthMethod[] = [];
    for (const method of payload.authMethods) {
      if (isRecord(method) && typeof method.kind === "string") {
        const validKinds = ["oauth2", "api_key", "none"];
        if (!validKinds.includes(method.kind)) {
          return NextResponse.json({ error: `Invalid auth method kind: ${method.kind}` }, { status: 400 });
        }
        authMethods.push({
          kind: method.kind as AuthMethod["kind"],
          label: typeof method.label === "string" ? method.label : undefined,
          authorizeUrl: typeof method.authorizeUrl === "string" ? method.authorizeUrl : undefined,
          tokenUrl: typeof method.tokenUrl === "string" ? method.tokenUrl : undefined,
          scopes: Array.isArray(method.scopes)
            ? (method.scopes as unknown[]).filter((s): s is string => typeof s === "string")
            : undefined,
        });
      }
    }
    fields.authMethods = authMethods;
  }
  if (Array.isArray(payload.capabilities)) {
    const capabilities: { capabilityId: CanonicalCapability; priority: number }[] = [];
    for (const cap of payload.capabilities) {
      if (isRecord(cap) && typeof cap.capabilityId === "string") {
        if (!isCanonicalCapability(cap.capabilityId)) {
          return NextResponse.json({ error: `Invalid capability: ${cap.capabilityId}` }, { status: 400 });
        }
        capabilities.push({
          capabilityId: cap.capabilityId,
          priority: typeof cap.priority === "number" ? cap.priority : 10,
        });
      }
    }
    fields.capabilities = capabilities;
  }

  const updated = await updateIntegration(id, fields);
  if (!updated) {
    return NextResponse.json({ error: "Integration not found." }, { status: 404 });
  }

  return NextResponse.json({ integration: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const { id } = await params;

  const deleted = await deleteIntegration(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Integration not found or has active user connections." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
