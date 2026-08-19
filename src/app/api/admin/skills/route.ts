import { NextResponse } from "next/server";

import { listSkills, createSkill } from "@/lib/atlas/registry";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  try {
    const skills = await listSkills();
    return NextResponse.json({ skills });
  } catch (err) {
    console.error("[admin/skills] GET failed:", err);
    return NextResponse.json({ error: "Could not load skills." }, { status: 500 });
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
      return NextResponse.json({ error: "Skill name is required." }, { status: 400 });
    }
    if (typeof body.capabilityId !== "string" || !body.capabilityId) {
      return NextResponse.json({ error: "capabilityId is required." }, { status: 400 });
    }
    const skill = await createSkill({
      name: body.name.trim(),
      category: typeof body.category === "string" ? body.category : "action",
      description: typeof body.description === "string" ? body.description : undefined,
      capabilityId: body.capabilityId,
      connectorId: typeof body.connectorId === "string" ? body.connectorId : undefined,
      providerId: typeof body.providerId === "string" ? body.providerId : undefined,
      requiresApproval:
        typeof body.requiresApproval === "boolean" ? body.requiresApproval : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    return NextResponse.json({ skill }, { status: 201 });
  } catch (err) {
    console.error("[admin/skills] POST failed:", err);
    return NextResponse.json({ error: "Could not create skill." }, { status: 500 });
  }
}