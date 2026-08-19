/**
 * Config precedence for the Proactive Context Engine:
 *   System defaults → Admin defaults → User preference (user wins).
 * Admin layer lives in the global Setting store (not keyed to any user).
 * User layer lives in ProactiveTrigger rows.
 */

import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import type {
  AdminBriefDefaults,
  EffectiveConfig,
  TriggerMode,
  UserBriefPreference,
} from "./types";

const ADMIN_DEFAULTS_KEY = "proactive:adminDefaults";

export const SYSTEM_DEFAULTS: AdminBriefDefaults = {
  enabled: false,
  triggerTime: "07:00",
  providers: ["executions", "approvals", "memory-deadlines"],
  maxItems: 5,
  llmCompose: true,
  triggerMode: "lazy",
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function isTriggerMode(value: unknown): value is TriggerMode {
  return value === "worker" || value === "lazy";
}

export function normalizeAdminDefaults(raw: unknown): AdminBriefDefaults {
  const base = { ...SYSTEM_DEFAULTS };
  if (typeof raw !== "object" || raw === null) return base;
  const obj = raw as Record<string, unknown>;

  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : base.enabled;
  const triggerTime =
    typeof obj.triggerTime === "string" && /^\d{2}:\d{2}$/.test(obj.triggerTime)
      ? obj.triggerTime
      : base.triggerTime;
  const providers = isStringArray(obj.providers) && obj.providers.length > 0 ? obj.providers : base.providers;
  const maxItems = clampNumber(obj.maxItems, base.maxItems, 1, 10);
  const llmCompose = typeof obj.llmCompose === "boolean" ? obj.llmCompose : base.llmCompose;
  const triggerMode = isTriggerMode(obj.triggerMode) ? obj.triggerMode : base.triggerMode;

  return { enabled, triggerTime, providers, maxItems, llmCompose, triggerMode };
}

export async function readAdminDefaults(): Promise<AdminBriefDefaults> {
  const row = await prisma.setting.findUnique({ where: { key: ADMIN_DEFAULTS_KEY } });
  if (!row?.value) return { ...SYSTEM_DEFAULTS };
  try {
    return normalizeAdminDefaults(JSON.parse(row.value));
  } catch {
    return { ...SYSTEM_DEFAULTS };
  }
}

export async function writeAdminDefaults(defaults: AdminBriefDefaults): Promise<AdminBriefDefaults> {
  const clean = normalizeAdminDefaults(defaults);
  await prisma.setting.upsert({
    where: { key: ADMIN_DEFAULTS_KEY },
    create: { key: ADMIN_DEFAULTS_KEY, value: JSON.stringify(clean) },
    update: { value: JSON.stringify(clean) },
  });
  return clean;
}

export async function readUserPreference(
  userId: string,
  triggerType: string
): Promise<UserBriefPreference | null> {
  const row = await prisma.proactiveTrigger.findUnique({
    where: { userId_triggerType: { userId, triggerType } },
  });
  if (!row) return null;
  return { enabled: row.enabled, schedule: row.schedule };
}

export async function writeUserPreference(
  userId: string,
  triggerType: string,
  value: UserBriefPreference
): Promise<UserBriefPreference> {
  const schedule =
    typeof value.schedule === "string" && /^\d{2}:\d{2}$/.test(value.schedule)
      ? value.schedule
      : SYSTEM_DEFAULTS.triggerTime;
  const enabled = typeof value.enabled === "boolean" ? value.enabled : true;

  await prisma.proactiveTrigger.upsert({
    where: { userId_triggerType: { userId, triggerType } },
    create: { id: crypto.randomUUID(), userId, triggerType, schedule, enabled },
    update: { schedule, enabled },
  });

  return { enabled, schedule };
}

export async function touchTriggerRun(
  userId: string,
  triggerType: string,
  at: Date = new Date()
): Promise<void> {
  await prisma.proactiveTrigger.upsert({
    where: { userId_triggerType: { userId, triggerType } },
    create: { id: crypto.randomUUID(), userId, triggerType, schedule: SYSTEM_DEFAULTS.triggerTime, enabled: true, lastRunAt: at },
    update: { lastRunAt: at },
  });
}

/**
 * Resolve effective config for a user: system → admin defaults → user preference.
 * User participation is governed by their ProactiveTrigger row when one exists;
 * otherwise the admin default applies (users control their own participation).
 */
export async function resolveEffectiveConfig(
  userId: string,
  triggerType: string
): Promise<EffectiveConfig> {
  const admin = await readAdminDefaults();
  const user = await readUserPreference(userId, triggerType);

  return {
    enabled: user ? user.enabled : admin.enabled,
    triggerTime: user?.schedule ?? admin.triggerTime,
    providers: admin.providers,
    maxItems: admin.maxItems,
    llmCompose: admin.llmCompose,
    triggerMode: admin.triggerMode,
  };
}