import { NextResponse } from "next/server";

import { listProviders, createProvider } from "@/lib/atlas/registry";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  try {
    const providers = await listProviders();
    return NextResponse.json({ providers });
  } catch (err) {
    console.error("[admin/providers] GET failed:", err);
    return NextResponse.json({ error: "Could not load providers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Provider name is required." }, { status: 400 });
    }
    const provider = await createProvider({
      name: body.name.trim(),
      kind: typeof body.kind === "string" ? (body.kind as never) : "mcp",
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      authType: typeof body.authType === "string" ? (body.authType as never) : "api_key",
      credentialId: typeof body.credentialId === "string" ? body.credentialId : undefined,
      endpoints: Array.isArray(body.endpoints) ? body.endpoints : undefined,
      source: typeof body.source === "string" ? (body.source as never) : "manual",
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    return NextResponse.json({ provider }, { status: 201 });
  } catch (err) {
    console.error("[admin/providers] POST failed:", err);
    return NextResponse.json({ error: "Could not create provider." }, { status: 500 });
  }
}