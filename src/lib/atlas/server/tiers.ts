import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import { isAtlasAdminActor, type AtlasActor } from "@/lib/atlas/server/auth";

/** Subscription tier ids. Stored values are `premium` for legacy DB compat; the tier is labeled "Standard". */
export type TierId = "free" | "premium" | "vip";

export const TIER_IDS: TierId[] = ["free", "premium", "vip"];

export const TIER_LABELS: Record<TierId, string> = {
  free: "Free",
  premium: "Standard",
  vip: "VIP",
};

export interface TierLimits {
  maxRequestsPerMinute: number;
  maxTokensPerDay: number;
  /** 0 = voice is not included for this tier. */
  maxVoiceMinutesPerDay: number;
  /** Artificial delay applied to replies on this tier (ms). 0 = none. */
  responseDelayMs: number;
}

export type TierPlan = {
  tier: TierId;
  label: string;
  limits: TierLimits;
};

export const DEFAULT_TIER_LIMITS: Record<TierId, TierLimits> = {
  free: {
    maxRequestsPerMinute: 20,
    maxTokensPerDay: 50_000,
    maxVoiceMinutesPerDay: 0,
    responseDelayMs: 0,
  },
  premium: {
    maxRequestsPerMinute: 60,
    maxTokensPerDay: 150_000,
    maxVoiceMinutesPerDay: 30,
    responseDelayMs: 0,
  },
  vip: {
    maxRequestsPerMinute: 120,
    maxTokensPerDay: 500_000,
    maxVoiceMinutesPerDay: 0, // 0 = unlimited (handled specially)
    responseDelayMs: 0,
  },
};

const SETTING_KEY = "tiers:limits";

function normalizeTier(value: string | null | undefined): TierId {
  if (value === "premium" || value === "prime") return "premium";
  if (value === "vip") return "vip";
  return "free";
}

function normalizeLimits(raw: unknown): TierLimits | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  return {
    maxRequestsPerMinute:
      typeof obj.maxRequestsPerMinute === "number" ? obj.maxRequestsPerMinute : 20,
    maxTokensPerDay: typeof obj.maxTokensPerDay === "number" ? obj.maxTokensPerDay : 50_000,
    maxVoiceMinutesPerDay:
      typeof obj.maxVoiceMinutesPerDay === "number" ? obj.maxVoiceMinutesPerDay : 0,
    responseDelayMs: typeof obj.responseDelayMs === "number" ? obj.responseDelayMs : 0,
  };
}

/** Read any per-tier limits saved in the admin plane (Setting `tiers:limits`). */
export async function readTierPlans(): Promise<TierPlan[]> {
  let stored: unknown = null;
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    stored = row?.value ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }

  if (typeof stored === "object" && stored !== null) {
    const obj = stored as Record<string, unknown>;
    const plans = TIER_IDS.map((tier) => {
      const limits = normalizeLimits(obj[tier]);
      return {
        tier,
        label: TIER_LABELS[tier],
        limits: limits ?? DEFAULT_TIER_LIMITS[tier],
      };
    });
    return plans;
  }

  // Legacy `quotas:limits` key — map the old role rows onto tiers.
  const legacy = await readLegacyQuotas();
  if (legacy) {
    return TIER_IDS.map((tier) => ({
      tier,
      label: TIER_LABELS[tier],
      limits: legacy[tier],
    }));
  }

  return TIER_IDS.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    limits: DEFAULT_TIER_LIMITS[tier],
  }));
}

async function readLegacyQuotas(): Promise<Record<TierId, TierLimits> | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "quotas:limits" } });
    if (!row?.value) return null;
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return null;

    const byRole = new Map<string, TierLimits>();
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const role = (item as Record<string, unknown>).role;
      const limits = normalizeLimits(item);
      if (typeof role === "string" && limits) byRole.set(role.toLowerCase(), limits);
    }

    const map: Partial<Record<TierId, TierLimits>> = {
      free: byRole.get("default user") ?? byRole.get("free"),
      premium: byRole.get("premium user") ?? byRole.get("prime"),
      vip: byRole.get("administrator") ?? byRole.get("vip"),
    };
    if (!map.free && !map.premium && !map.vip) return null;

    return {
      free: map.free ?? DEFAULT_TIER_LIMITS.free,
      premium: map.premium ?? DEFAULT_TIER_LIMITS.premium,
      vip: map.vip ?? DEFAULT_TIER_LIMITS.vip,
    };
  } catch {
    return null;
  }
}

/** Persist admin-tier limits. */
export async function saveTierPlans(plans: TierPlan[]): Promise<void> {
  const value = JSON.stringify(
    Object.fromEntries(plans.map((plan) => [plan.tier, plan.limits]))
  );
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value },
    create: { key: SETTING_KEY, value },
  });
}

/** The signed-in raw tier from the user's profile row ("free" | "premium" | "vip"). */
export async function readUserTier(userId: string): Promise<TierId> {
  try {
    const row = await prisma.userProfile.findUnique({ where: { userId }, select: { tier: true } });
    return normalizeTier(row?.tier);
  } catch {
    return "free";
  }
}

/** Persist a user's tier (e.g. after a successful UPI checkout). */
export async function setUserTier(userId: string, tier: TierId): Promise<void> {
  const actual = userId || "atlas-demo-user";
  await prisma.userProfile.upsert({
    where: { userId: actual },
    update: { tier },
    create: { userId: actual, tier },
  });
}

/**
 * Effective tier for an actor. Admin and dev identities are always VIP
 * regardless of their profile row. Guests default to Free.
 */
export async function resolveEffectiveTier(actor: AtlasActor): Promise<TierId> {
  if (isAtlasAdminActor(actor)) return "vip";
  if (isReservedVipAccount(actor)) return "vip";
  return readUserTier(actor.userId);
}

/** dev@atlas.local and admin@atlas.local are always VIP. */
function isReservedVipAccount(actor: AtlasActor): boolean {
  const email = actor.email?.toLowerCase();
  return email === "dev@atlas.local" || email === "admin@atlas.local";
}

/** Resolve the full plan (tier + limits) for the current actor. */
export async function resolveTierPlanForActor(actor: AtlasActor): Promise<TierPlan> {
  const effective = await resolveEffectiveTier(actor);
  const plans = await readTierPlans();
  return plans.find((plan) => plan.tier === effective) ?? {
    tier: effective,
    label: TIER_LABELS[effective],
    limits: DEFAULT_TIER_LIMITS[effective],
  };
}

export function tierDescription(tier: TierId, plans: TierPlan[]): string {
  const plan = plans.find((p) => p.tier === tier);
  if (!plan) return "";
  const { limits } = plan;
  if (tier === "vip") {
    return "Unlimited everything: highest request capacity, full voice, and priority responses.";
  }
  const bits: string[] = [];
  bits.push(`${limits.maxRequestsPerMinute} requests/min`);
  bits.push(`${limits.maxTokensPerDay.toLocaleString()} tokens/day`);
  if (limits.maxVoiceMinutesPerDay > 0) {
    bits.push(`${limits.maxVoiceMinutesPerDay} min voice/day`);
  } else {
    bits.push("No voice replies");
  }
  return bits.join(" · ");
}