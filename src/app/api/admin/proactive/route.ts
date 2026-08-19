import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

import { readAdminDefaults, writeAdminDefaults } from "@/lib/proactive/config";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** GET /api/admin/proactive — global Daily Brief defaults (admin only). */
export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const defaults = await readAdminDefaults();
  return NextResponse.json({ defaults }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/admin/proactive — update global Daily Brief defaults (admin only). */
export async function POST(request: NextRequest) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const saved = await writeAdminDefaults({
    enabled: typeof body.enabled === "boolean" ? body.enabled : false,
    triggerTime: typeof body.triggerTime === "string" ? body.triggerTime : "07:00",
    providers: Array.isArray(body.providers) && body.providers.every((p) => typeof p === "string")
      ? body.providers
      : [],
    maxItems: typeof body.maxItems === "number" ? body.maxItems : 5,
    llmCompose: typeof body.llmCompose === "boolean" ? body.llmCompose : true,
    triggerMode: body.triggerMode === "worker" || body.triggerMode === "lazy" ? body.triggerMode : "lazy",
  });

  return NextResponse.json({ defaults: saved }, { headers: { "Cache-Control": "no-store" } });
}