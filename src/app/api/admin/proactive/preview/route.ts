import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { evaluateForUser } from "@/lib/proactive/engine";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * GET /api/admin/proactive/preview
 * Admin-only demo preview: deterministic fixture candidates rendered exactly as
 * a brief would be. Isolation invariants: never persisted, never delivered,
 * never visible on consumer brief endpoints. Evaluate against the admin's own
 * id in demo mode so no user data is touched.
 */
export async function GET() {
  try {
    const actor = await requireAtlasAdmin();
    const result = await evaluateForUser(actor.userId, { demo: true });
    return NextResponse.json({ preview: result.preview ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
}