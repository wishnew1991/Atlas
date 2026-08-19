import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { readUserPreference, writeUserPreference, touchTriggerRun } from "@/lib/proactive/config";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** GET /api/proactive/prefs — the user's Daily Brief participation settings. */
export async function GET() {
  try {
    const actor = await getAtlasActor();
    if (!actor.isAuthenticated) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const pref = await readUserPreference(actor.userId, "daily");
    return NextResponse.json({ pref }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[proactive] prefs read failed:", error);
    return NextResponse.json({ error: "Could not read preferences." }, { status: 500 });
  }
}

/** POST /api/proactive/prefs — update participation + schedule. */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAtlasActor();
    if (!actor.isAuthenticated) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const enabled = typeof body?.enabled === "boolean" ? body.enabled : true;
    const schedule = typeof body?.schedule === "string" ? body.schedule : "07:00";

    const saved = await writeUserPreference(actor.userId, "daily", { enabled, schedule });
    if (enabled) {
      // Reset lastRunAt on opt-in so a fresh brief is generated on next due-check.
      await touchTriggerRun(actor.userId, "daily", new Date(0)).catch(() => {});
    }

    return NextResponse.json({ pref: saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[proactive] prefs write failed:", error);
    return NextResponse.json({ error: "Could not update preferences." }, { status: 500 });
  }
}