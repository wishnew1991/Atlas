import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import { isAtlasAdminActor, type AtlasActor } from "@/lib/atlas/server/auth";
import { readVoiceConfig } from "@/lib/atlas/server/model-registry";
import { resolveEffectiveTier, resolveTierPlanForActor } from "@/lib/atlas/server/tiers";

/** Users in this comma-separated env list are exempt from the daily voice cap. */
const DEV_USER_IDS = (process.env.ATLAS_VOICE_DEV_USER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/** Local dev trust mode is exempt so the feature is testable without caps. */
function isDevTrust(actor: AtlasActor): boolean {
  const env = process.env.NODE_ENV || "development";
  return (
    env === "development" &&
    process.env.ATLAS_DEV_TRUST_ALL === "true" &&
    actor.isAuthenticated
  );
}

/** Admin and dev users never pay the voice cap. */
export function isVoiceExempt(actor: AtlasActor): boolean {
  return isAtlasAdminActor(actor) || isDevTrust(actor) || DEV_USER_IDS.includes(actor.userId);
}

function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Seconds of voice usage the actor has already consumed today. */
export async function getVoiceUsageSeconds(
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const row = await prisma.voiceUsage.findUnique({
    where: { userId_day: { userId, day: todayKey(now) } },
  });
  return row?.seconds ?? 0;
}

export type VoiceBudget = {
  allowed: boolean;
  remainingSeconds: number;
  limitMinutes: number;
  capped: boolean;
  /** 0 = uncapped (VIP/unlimited), or the tier-driven daily limit. */
  tier: "free" | "premium" | "vip";
};

const UNLIMITED: VoiceBudget = {
  allowed: true,
  remainingSeconds: Number.POSITIVE_INFINITY,
  limitMinutes: 0,
  capped: false,
  tier: "free",
};

/**
 * Daily voice budget check resolved from the user's effective tier.
 * - Admin / dev (always VIP) → unlimited.
 * - VIP → unlimited (0 = uncapped).
 * - Premium → tier voice minutes per day (falls back to the global
 *   VoiceConfig dailyVoiceLimitMinutes admin setting).
 * - Free → voice is not included; not allowed.
 */
export async function resolveVoiceBudget(
  actor: AtlasActor,
  now: Date = new Date()
): Promise<VoiceBudget> {
  const [effectiveTier, plan, voice] = await Promise.all([
    resolveEffectiveTier(actor),
    resolveTierPlanForActor(actor),
    readVoiceConfig(),
  ]);

  if (isVoiceExempt(actor) || effectiveTier === "vip") {
    return { ...UNLIMITED, tier: effectiveTier };
  }

  // Free tier → no voice.
  if (effectiveTier === "free") {
    return {
      allowed: false,
      remainingSeconds: 0,
      limitMinutes: 0,
      capped: true,
      tier: "free",
    };
  }

  // Standard (premium) → tier-configured minutes, or the global admin cap as fallback.
  let limitMinutes = plan.limits.maxVoiceMinutesPerDay;
  if (!limitMinutes || limitMinutes <= 0) {
    limitMinutes = voice.dailyVoiceLimitMinutes ?? 0;
  }
  if (limitMinutes <= 0) {
    return { ...UNLIMITED, tier: effectiveTier };
  }

  const used = await getVoiceUsageSeconds(actor.userId, now);
  const limitSeconds = limitMinutes * 60;
  const remainingSeconds = Math.max(0, limitSeconds - used);

  return {
    allowed: remainingSeconds > 0,
    remainingSeconds,
    limitMinutes,
    capped: true,
    tier: effectiveTier,
  };
}

/** Record voice activity (at least 1s) against the actor's daily budget. */
export async function recordVoiceUsage(userId: string, seconds: number): Promise<void> {
  const amount = Math.max(1, Math.round(seconds));
  const day = todayKey();

  await prisma.voiceUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, seconds: amount },
    update: { seconds: { increment: amount } },
  });
}