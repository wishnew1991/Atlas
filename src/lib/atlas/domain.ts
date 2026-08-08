import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";

export const DOMAIN_KEYWORDS: { domain: string; pattern: RegExp }[] = [
  { domain: "food", pattern: /\b(food|restaurant|biryani|biriyani|dinner|lunch|breakfast|deliver|menu|pizza|burger|sushi|meal|snack|eat|cuisine|hungry|craving|order\s+(food|from))\b/i },
  { domain: "travel", pattern: /\b(flight|flights|hotel|hotels|trip|trips|travel|vacation|itinerary|airbnb|airline)\b/i },
  { domain: "rides", pattern: /\b(ride|rides|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop)\b/i },
  { domain: "appointments", pattern: /\b(appointment|doctor|salon|spa|meeting|book\s+a\s+(slot|appointment)|dentist|consultation)\b/i },
  { domain: "shopping", pattern: /\b(buy|purchase|shop|shopping|cart|checkout|product|order\s+(a|the|some))\b/i },
];

const CONTINUATION_PATTERN = /^(yes|yeah|yep|sure|ok|okay|no|nope|confirm|proceed|cancel|change|1|2|3|4|5|option\s+\d+|the\s+(first|second|third|last)\s+one|that\s+one|this\s+one|go\s+ahead|book\s+it|order\s+it)$/i;

/**
 * Determine the domain for a message. Current message takes precedence over
 * history so topic switches are honored ("search weather" after travel → general),
 * while short continuations ("yes", "that one", "2") inherit the prior domain from history.
 */
export function inferDomain(text: string, history?: AtlasChatHistoryItem[]): string {
  const trimmed = text.trim();
  for (const { domain, pattern } of DOMAIN_KEYWORDS) {
    if (pattern.test(trimmed)) return domain;
  }

  // Only check history if the current message is a short continuation or digit selection
  const words = trimmed.split(/\s+/);
  const isShortContinuation = words.length <= 4 && (CONTINUATION_PATTERN.test(trimmed) || /^\d+$/.test(trimmed));

  if (isShortContinuation && history && history.length > 0) {
    for (const item of history.slice(-4).reverse()) {
      for (const { domain, pattern } of DOMAIN_KEYWORDS) {
        if (pattern.test(item.text)) return domain;
      }
    }
  }

  return "general";
}
