import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";

const DOMAIN_KEYWORDS: { domain: string; pattern: RegExp }[] = [
  { domain: "food", pattern: /\b(food|restaurant|biryani|dinner|lunch|breakfast|swiggy|zomato|deliver|menu|pizza|burger|sushi|meal|snack|eat|cuisine|hungry|craving|order\s+(food|from))\b/i },
  { domain: "travel", pattern: /\b(flight|flights|hotel|hotels|trip|trips|travel|vacation|itinerary|airbnb|airline)\b/i },
  { domain: "rides", pattern: /\b(ride|rides|uber|ola|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop)\b/i },
  { domain: "appointments", pattern: /\b(appointment|doctor|salon|spa|meeting|book\s+a\s+(slot|appointment)|dentist|consultation)\b/i },
  { domain: "shopping", pattern: /\b(buy|purchase|shop|shopping|cart|checkout|product|amazon|flipkart|order\s+(a|the|some))\b/i },
];

/**
 * Determine the domain for a message. Current message takes precedence over
 * history so topic switches are honored ("book a flight" after food → travel),
 * while continuations ("yes", "that one") inherit the prior domain from history.
 */
export function inferDomain(text: string, history?: AtlasChatHistoryItem[]): string {
  for (const { domain, pattern } of DOMAIN_KEYWORDS) {
    if (pattern.test(text)) return domain;
  }
  if (history && history.length > 0) {
    for (const item of history.slice(-6).reverse()) {
      for (const { domain, pattern } of DOMAIN_KEYWORDS) {
        if (pattern.test(item.text)) return domain;
      }
    }
  }
  return "general";
}
