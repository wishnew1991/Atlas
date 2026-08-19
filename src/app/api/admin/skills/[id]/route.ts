import { NextResponse } from "next/server";

import { getSkill, updateSkill, deleteSkill } from "@/lib/atlas/registry";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "edge";

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
  const skill = await getSkill(id);
  if (!skill) {
    return NextResponse.json({ error: "Skill not found." }, { status: 404 });
  }
  return NextResponse.json({ skill });
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
  const skill = await updateSkill(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    category: typeof body.category === "string" ? body.category : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    capabilityId: typeof body.capabilityId === "string" ? body.capabilityId : undefined,
    connectorId: typeof body.connectorId === "string" ? body.connectorId : undefined,
    providerId: typeof body.providerId === "string" ? body.providerId : undefined,
    requiresApproval:
      typeof body.requiresApproval === "boolean" ? body.requiresApproval : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
  });
  if (!skill) {
    return NextResponse.json({ error: "Skill not found." }, { status: 404 });
  }
  return NextResponse.json({ skill });
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
  const ok = await deleteSkill(id);
  if (!ok) {
    return NextResponse.json({ error: "Skill not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}