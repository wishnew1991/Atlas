import "server-only";

import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { listAccomplishments } from "@/lib/atlas/activity";
import { prisma } from "@/lib/atlas/server/prisma";
import type { RecommendationDomain } from "@/lib/atlas/intent/memory-intent-core";

/** Minimum confidence before a preference shapes recommendations. */
export const ESTABLISHED_PREFERENCE_MIN = 0.55;

const EXPLORATION_BY_DOMAIN: Record<RecommendationDomain, string[]> = {
  food: ["Italian", "Mexican", "Thai", "Japanese", "Mediterranean", "Korean", "Vietnamese"],
  travel: ["hill station weekend", "beach getaway", "heritage city break", "nature trail stay"],
  shopping: ["highly rated mid-range option", "newer alternative brand", "value pick with strong reviews"],
  entertainment: ["critically acclaimed title outside usual genre", "local live event", "documentary"],
  rides: ["reliable mid-tier option", "shared ride if time allows"],
  general: ["something adjacent to past likes but not identical"],
};

export type PreferenceFacet = {
  text: string;
  confidence: number;
  role: "like" | "dislike" | "habit" | "constraint" | "gap";
};

export type RecommendationSituation = {
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  dayOfWeek: string;
  localHour: number;
  locationHint: string | null;
};

export type RecommendationContext = {
  domain: RecommendationDomain;
  preferences: PreferenceFacet[];
  establishedLikes: string[];
  dislikes: string[];
  explorationCandidates: string[];
  recentActivity: string[];
  situation: RecommendationSituation;
  /** 0..1 — how much to lean on known favorites vs novelty */
  familiarityWeight: number;
  explorationWeight: number;
  /** Prompt-ready structured briefing for the LLM */
  briefing: string;
  /** Flat lines for memory injection compatibility */
  lines: string[];
};

function timeOfDay(hour: number): RecommendationSituation["timeOfDay"] {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function parseConfidence(raw: string): number {
  const match = raw.match(/conf=([0-9.]+)/i) || raw.match(/str=([0-9.]+)/i);
  if (!match) return 0.6;
  const n = Number(match[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.6;
}

/**
 * Turn pipeline preference/safety lines into facets — no keyword intent matching.
 * Lines come from retrievePreferenceMemories / retrieveSafetyMemories.
 */
function facetsFromLines(preferenceLines: string[], safetyLines: string[]): PreferenceFacet[] {
  const facets: PreferenceFacet[] = [];

  for (const line of safetyLines) {
    const text = line.replace(/^\[.*?\]\s*/, "").trim();
    if (!text) continue;
    facets.push({ text, confidence: Math.max(0.85, parseConfidence(line)), role: "constraint" });
  }

  for (const line of preferenceLines) {
    const text = line.replace(/^\[.*?\]\s*/, "").trim();
    if (!text) continue;
    const confidence = parseConfidence(line);
    const lower = line.toLowerCase();
    if (lower.includes("[weak|") || confidence < ESTABLISHED_PREFERENCE_MIN) {
      facets.push({ text, confidence, role: "habit" });
      continue;
    }
    if (/(dislike|no_longer|avoid|hate)/i.test(text)) {
      facets.push({ text, confidence, role: "dislike" });
      continue;
    }
    facets.push({ text, confidence, role: "like" });
  }

  return facets;
}

async function locationHint(userId: string): Promise<string | null> {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { addressesJson: true, privacyJson: true },
    });
    if (!profile) return null;
    let useLocation = true;
    try {
      const privacy = JSON.parse(profile.privacyJson) as { useLocation?: boolean };
      if (privacy.useLocation === false) useLocation = false;
    } catch {
      /* default on */
    }
    if (!useLocation) return null;
    const addresses = JSON.parse(profile.addressesJson) as Array<{ label?: string; line?: string }>;
    const first = addresses[0];
    if (!first) return null;
    return [first.label, first.line].filter(Boolean).join(" — ") || null;
  } catch {
    return null;
  }
}

async function recentActivityLines(userId: string, domain: RecommendationDomain): Promise<string[]> {
  try {
    const rows = await listAccomplishments(userId, 8);
    return rows
      .filter((r) => domain === "general" || r.domain === domain || (domain === "food" && r.domain === "food"))
      .slice(0, 5)
      .map((r) => `${r.domain}: ${r.title} (${r.headlineStatus})`);
  } catch {
    return [];
  }
}

function explorationGaps(
  domain: RecommendationDomain,
  likes: string[],
  recent: string[]
): string[] {
  const corpus = `${likes.join(" ")} ${recent.join(" ")}`.toLowerCase();
  const catalog = EXPLORATION_BY_DOMAIN[domain] ?? EXPLORATION_BY_DOMAIN.general;
  const gaps = catalog.filter((item) => !corpus.includes(item.toLowerCase().split(" ")[0]!));
  return (gaps.length ? gaps : catalog).slice(0, 4);
}

function buildBriefing(ctx: Omit<RecommendationContext, "briefing" | "lines">): string {
  const lines: string[] = [];
  lines.push(`Domain: ${ctx.domain}`);
  lines.push(
    `Situation: ${ctx.situation.dayOfWeek} ${ctx.situation.timeOfDay}` +
      (ctx.situation.locationHint ? ` · near ${ctx.situation.locationHint}` : "")
  );
  lines.push(
    `Balance: ${(ctx.explorationWeight * 100).toFixed(0)}% exploration / ${(ctx.familiarityWeight * 100).toFixed(0)}% familiarity — do NOT default to the usual favorite.`
  );

  if (ctx.establishedLikes.length) {
    lines.push(`Established likes (context only): ${ctx.establishedLikes.join("; ")}`);
  }
  if (ctx.dislikes.length) {
    lines.push(`Avoid / hard constraints: ${ctx.dislikes.join("; ")}`);
  }
  if (ctx.explorationCandidates.length) {
    lines.push(
      `Exploration angles (prefer these when the user did not name a specific item): ${ctx.explorationCandidates.join("; ")}`
    );
  }
  if (ctx.recentActivity.length) {
    lines.push(`Recent activity: ${ctx.recentActivity.join("; ")}`);
  }

  lines.push(
    "Response contract: return 3–5 options. For each, explain WHY (taste fit, gap vs usual, live rating/review if tools returned it, fit for time/location). " +
      "Invoke web_search and domain tools for live ratings, reviews, prices, and short descriptions — never invent them. " +
      "Blend one familiar-adjacent pick with mostly fresh options."
  );

  return lines.join("\n");
}

/**
 * Recommendation Engine — builds a structured briefing from pipeline-retrieved
 * preference/safety memories + situation + recent activity.
 * Does not classify intent and does not keyword-match for recommendations.
 * Live ratings/reviews are gathered later via tools (invoke_tools).
 */
export async function buildRecommendationContext(input: {
  userId: string;
  message: string;
  domain: RecommendationDomain;
  history?: AtlasChatHistoryItem[];
  conversationSummary?: string;
  /** From retrieve_preference_memory step */
  preferenceLines?: string[];
  /** From retrieve_safety_memory step (hybrid / constraints) */
  safetyLines?: string[];
}): Promise<RecommendationContext> {
  const now = new Date();
  const situation: RecommendationSituation = {
    localHour: now.getHours(),
    timeOfDay: timeOfDay(now.getHours()),
    dayOfWeek: now.toLocaleDateString(undefined, { weekday: "long" }),
    locationHint: input.userId === "atlas-demo-user" ? null : await locationHint(input.userId),
  };

  const preferenceLines = input.preferenceLines ?? [];
  const safetyLines = input.safetyLines ?? [];
  const recentActivity =
    input.userId === "atlas-demo-user" ? [] : await recentActivityLines(input.userId, input.domain);

  const preferences = facetsFromLines(preferenceLines, safetyLines);

  const established = preferences.filter(
    (p) => (p.role === "like" || p.role === "habit") && p.confidence >= ESTABLISHED_PREFERENCE_MIN
  );
  const weakOneOffs = preferences.filter(
    (p) => (p.role === "like" || p.role === "habit") && p.confidence < ESTABLISHED_PREFERENCE_MIN
  );

  const establishedLikes = established.map((p) => `${p.text} (conf ${p.confidence.toFixed(2)})`);
  const dislikes = preferences
    .filter((p) => p.role === "dislike" || p.role === "constraint")
    .map((p) => p.text);

  const explorationCandidates = explorationGaps(
    input.domain,
    [...establishedLikes, ...weakOneOffs.map((p) => p.text)],
    recentActivity
  );

  const hasStrongFavorite = established.some((p) => p.confidence >= 0.7);
  const explorationWeight = hasStrongFavorite ? 0.68 : 0.55;
  const familiarityWeight = 1 - explorationWeight;

  const base: Omit<RecommendationContext, "briefing" | "lines"> = {
    domain: input.domain,
    preferences,
    establishedLikes,
    dislikes,
    explorationCandidates,
    recentActivity,
    situation,
    familiarityWeight,
    explorationWeight,
  };

  const briefing = buildBriefing(base);
  const historyHint =
    input.conversationSummary?.trim() ||
    (input.history ?? [])
      .slice(-3)
      .map((h) => h.text)
      .join(" | ");

  const lines = [
    ...briefing.split("\n").map((l) => `[rec] ${l}`),
    ...(historyHint ? [`[rec] Recent conversation cue: ${historyHint.slice(0, 240)}`] : []),
    ...weakOneOffs
      .slice(0, 2)
      .map((p) => `[rec] Weak/recent signal (do not treat as long-term favorite): ${p.text}`),
  ];

  return { ...base, briefing, lines };
}
