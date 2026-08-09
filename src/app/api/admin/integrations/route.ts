import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  listIntegrations,
  createIntegration,
  listCapabilities,
} from "@/lib/atlas/integrations/registry";
import { isCanonicalCapability, type CanonicalCapability } from "@/lib/atlas/capabilities/types";
import type { AuthMethod } from "@/lib/atlas/integrations/types";
import { TRANSPORT_KINDS } from "@/lib/atlas/integrations/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAuthMethod(value: unknown): value is Omit<AuthMethod, "kind"> & { kind: string } {
  return isRecord(value) && typeof value.kind === "string";
}

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const [integrations, capabilities] = await Promise.all([
    listIntegrations(),
    listCapabilities(),
  ]);

  return NextResponse.json({ integrations, capabilities });
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const id = payload.id;
  const name = payload.name;
  const transport = payload.transport;

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (typeof transport !== "string" || !TRANSPORT_KINDS.includes(transport as typeof TRANSPORT_KINDS[number])) {
    return NextResponse.json({ error: `transport must be one of: ${TRANSPORT_KINDS.join(", ")}` }, { status: 400 });
  }

  const authMethods: AuthMethod[] = [];
  if (Array.isArray(payload.authMethods)) {
    for (const method of payload.authMethods) {
      if (isAuthMethod(method)) {
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
  }

  const capabilities: { capabilityId: CanonicalCapability; priority: number }[] = [];
  if (Array.isArray(payload.capabilities)) {
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
  }

  const integration = await createIntegration({
    id: id.trim(),
    name: name.trim(),
    transport: transport as typeof TRANSPORT_KINDS[number],
    authMethods,
    icon: typeof payload.icon === "string" ? payload.icon : undefined,
    description: typeof payload.description === "string" ? payload.description : undefined,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
  }).catch(() => null);

  if (!integration) {
    return NextResponse.json({ error: "Integration with this id already exists." }, { status: 409 });
  }

  return NextResponse.json({ integration }, { status: 201 });
}
