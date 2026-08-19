import { NextResponse } from "next/server";

import { getProvider, updateProvider, deleteProvider, recordProviderTest } from "@/lib/atlas/registry";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";

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
  const provider = await getProvider(id);
  if (!provider) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }
  return NextResponse.json({ provider });
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
  const body = await request.json().catch(() => ({}));
  const provider = await updateProvider(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    kind: typeof body.kind === "string" ? (body.kind as never) : undefined,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    authType: typeof body.authType === "string" ? (body.authType as never) : undefined,
    credentialId: typeof body.credentialId === "string" ? body.credentialId : undefined,
    endpoints: Array.isArray(body.endpoints) ? body.endpoints : undefined,
    source: typeof body.source === "string" ? (body.source as never) : undefined,
    status: typeof body.status === "string" ? (body.status as never) : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }
  return NextResponse.json({ provider });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (body && typeof body === "object" && "testOk" in body) {
    await recordProviderTest(id, Boolean(body.testOk));
    const provider = await getProvider(id);
    return NextResponse.json({ provider });
  }
  const provider = await updateProvider(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    kind: typeof body.kind === "string" ? (body.kind as never) : undefined,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    authType: typeof body.authType === "string" ? (body.authType as never) : undefined,
    credentialId: typeof body.credentialId === "string" ? body.credentialId : undefined,
    endpoints: Array.isArray(body.endpoints) ? body.endpoints : undefined,
    source: typeof body.source === "string" ? (body.source as never) : undefined,
    status: typeof body.status === "string" ? (body.status as never) : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }
  return NextResponse.json({ provider });
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
  const ok = await deleteProvider(id);
  if (!ok) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}