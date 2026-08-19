import { NextResponse } from "next/server";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { readTierPlans, saveTierPlans, TIER_IDS, type TierPlan } from "@/lib/atlas/server/tiers";

export const dynamic = "force-dynamic";

/** GET /api/admin/tiers — per-tier limits (rpm, tokens/day, voice minutes). */
export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const plans = await readTierPlans();
    return NextResponse.json({ plans });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load tier limits.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/tiers — persist per-tier limits. */
export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }
    const rawPlans = (body as { plans?: unknown }).plans;
    if (!Array.isArray(rawPlans)) {
      return NextResponse.json({ error: "plans array is required." }, { status: 400 });
    }

    const plans: TierPlan[] = [];
    for (const raw of rawPlans) {
      if (typeof raw !== "object" || raw === null) continue;
      const obj = raw as Record<string, unknown>;
      const tier = obj.tier as string;
      if (!TIER_IDS.includes(tier as (typeof TIER_IDS)[number])) continue;
      const limits = obj.limits as Record<string, unknown> | undefined;
      plans.push({
        tier: tier as TierPlan["tier"],
        label: typeof obj.label === "string" ? obj.label : tier,
        limits: {
          maxRequestsPerMinute: clampNumber(limits?.maxRequestsPerMinute, 120),
          maxTokensPerDay: clampNumber(limits?.maxTokensPerDay, 500_000),
          maxVoiceMinutesPerDay: clampNumber(limits?.maxVoiceMinutesPerDay, 0),
          responseDelayMs: clampNumber(limits?.responseDelayMs, 0),
        },
      });
    }

    if (plans.length !== TIER_IDS.length) {
      return NextResponse.json({ error: "All tiers (free, premium, vip) are required." }, { status: 400 });
    }

    await saveTierPlans(plans);
    return NextResponse.json({ success: true, plans });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save tier limits.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}