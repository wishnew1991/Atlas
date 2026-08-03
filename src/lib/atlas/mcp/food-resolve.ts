import "server-only";

// Natural-language reference resolution for the food flow.
//
// The LLM passes the user's own words through to the food tools; these helpers
// turn phrases like "the second one", "Meghana", "andhra chicken biryani" or
// "make it two" into concrete Swiggy identifiers held in the FoodSession. This
// is what lets the user converse instead of typing menu numbers.

const ORDINALS: Record<string, number> = {
  first: 1, "1st": 1, one: 1,
  second: 2, "2nd": 2, two: 2,
  third: 3, "3rd": 3, three: 3,
  fourth: 4, "4th": 4, four: 4,
  fifth: 5, "5th": 5, five: 5,
  sixth: 6, "6th": 6, six: 6,
  seventh: 7, "7th": 7, seven: 7,
  eighth: 8, "8th": 8, eight: 8,
  ninth: 9, "9th": 9, nine: 9,
  tenth: 10, "10th": 10, ten: 10,
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  couple: 2, pair: 2, dozen: 12,
};

export interface Indexed {
  index: number;
  id: string;
  name: string;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Token overlap score in [0,1]; rewards matching the candidate's whole name. */
function similarity(query: string, candidate: string): number {
  const q = normalise(query);
  const c = normalise(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.9;

  const qt = new Set(q.split(" ").filter((t) => t.length > 2));
  const ct = c.split(" ").filter((t) => t.length > 2);
  if (qt.size === 0 || ct.length === 0) return 0;

  let hits = 0;
  for (const token of ct) if (qt.has(token)) hits += 1;
  return hits / Math.max(ct.length, qt.size);
}

/**
 * Resolve a reference against a numbered list.
 * Tries: exact ID, "#2"/"number 2", bare ordinal/number, then fuzzy name match.
 */
export function resolveReference<T extends Indexed>(reference: string, options: T[]): T | undefined {
  if (options.length === 0) return undefined;
  const raw = reference.trim();
  const lower = raw.toLowerCase();

  const byId = options.find((option) => option.id === raw);
  if (byId) return byId;

  const explicit = lower.match(/(?:^|\b)(?:#|no\.?\s*|number\s*|option\s*|item\s*)(\d{1,3})\b/);
  if (explicit) {
    const found = options.find((option) => option.index === Number.parseInt(explicit[1], 10));
    if (found) return found;
  }

  const ordinalWord = lower.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b/);
  if (ordinalWord) {
    const found = options.find((option) => option.index === ORDINALS[ordinalWord[1]]);
    if (found) return found;
  }

  // A message that is *only* a number is a selection (menu indices can be 10+).
  const bare = lower.match(/^\s*(\d{1,3})\s*$/);
  if (bare) {
    const found = options.find((option) => option.index === Number.parseInt(bare[1], 10));
    if (found) return found;
  }

  const scored = options
    .map((option) => ({ option, score: similarity(raw, option.name) }))
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
    return scored[0].option;
  }

  return scored[0]?.option;
}

/** All candidates matching a name, used to detect ambiguous references. */
export function rankByName<T extends Indexed>(reference: string, options: T[], min = 0.5): T[] {
  return options
    .map((option) => ({ option, score: similarity(reference, option.name) }))
    .filter((entry) => entry.score >= min)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.option);
}

export type CartIntent =
  | { kind: "add"; reference: string; quantity: number }
  | { kind: "add_many"; references: string[]; quantity: number }
  | { kind: "remove"; reference: string }
  | { kind: "set_quantity"; reference: string; quantity: number }
  | { kind: "replace"; from: string; to: string }
  | { kind: "clear" }
  | { kind: "unknown"; reference: string };

function parseQuantity(text: string): number | undefined {
  const digits = text.match(/\b(\d{1,2})\b/);
  if (digits) return Number.parseInt(digits[1], 10);
  const word = text.toLowerCase().match(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple|pair|dozen)\b/);
  if (word) return NUMBER_WORDS[word[1]];
  return undefined;
}

function stripQuantity(text: string): string {
  return text
    .replace(/\b\d{1,2}\s*x\b/gi, " ")
    .replace(/\b(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple of|couple|pair of|dozen)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NOISE = /\b(please|pls|can you|could you|i(?:'| a)?d like|i want|i'll have|lets|let's|add|order|get|put|to (?:my |the )?cart|from the menu|for me|also|and)\b/gi;

function cleanReference(text: string): string {
  return text.replace(NOISE, " ").replace(/\s+/g, " ").trim();
}

/**
 * Detect menu-index selections like "24", "24 and 22", "add 22, 24".
 * Must not match quantity+name phrases like "2 gulab jamuns".
 */
function parseMenuIndexSelection(text: string): CartIntent | null {
  const stripped = text
    .toLowerCase()
    .replace(/\b(please|pls|add|also|items?|numbers?|options?|dishes?|from the menu|to (?:my |the )?cart)\b/gi, " ")
    .replace(/[#&,]/g, " ")
    .replace(/\band\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) return null;

  const tokens = stripped.split(" ").filter(Boolean);
  if (tokens.length === 0 || !tokens.every((token) => /^\d{1,3}$/.test(token))) {
    return null;
  }

  // De-dupe while preserving order.
  const refs: string[] = [];
  for (const token of tokens) {
    if (!refs.includes(token)) refs.push(token);
  }

  if (refs.length === 1) {
    return { kind: "add", reference: refs[0], quantity: 1 };
  }

  return { kind: "add_many", references: refs, quantity: 1 };
}

/** True when the user is naming menu row numbers (e.g. "24 and 22"). */
export function isMenuIndexSelection(message: string): boolean {
  return parseMenuIndexSelection(message) !== null;
}

/**
 * Pull a dish/cuisine keyword from a short food request ("pizza", "I want biryani").
 * Returns null for vague hunger with no dish named.
 */
export function extractDishQuery(message: string): string | null {
  const lower = message.trim().toLowerCase();
  if (!lower) return null;

  const explicit = lower.match(
    /\b(?:want|craving|order|get|find|looking for|in the mood for|feel like)\s+(?:some\s+|a\s+|an\s+)?([a-z][a-z\s-]{1,40}?)(?:\s+please|\s+for\s+me|[?.!]|$)/i
  );
  if (explicit?.[1]) {
    const dish = explicit[1].replace(/\b(food|something|anything|to eat|delivery)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (dish.length >= 3) return dish;
  }

  // Bare cuisine / dish one-liners (tolerate speech typos like "[izza").
  const normalized = lower.replace(/^\[/, "p").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(pizza|burger|biryani|sushi|noodles|pasta|chinese|indian|thai|mexican|dessert|breakfast|lunch|dinner|sandwich|salad|coffee|chaat|dosa|idli|paratha|shawarma|kebab|fried chicken|momos?)$/i.test(normalized)) {
    return normalized;
  }

  if (/pizza/.test(normalized)) return "pizza";
  if (/biryani/.test(normalized)) return "biryani";
  if (/burger/.test(normalized)) return "burger";

  return null;
}

/** User wants to start / continue ordering food and needs the address list shown. */
export function needsAddressList(message: string, hasAddress: boolean): boolean {
  if (hasAddress) return false;
  const lower = message.trim().toLowerCase();
  if (!lower) return false;
  if (extractDishQuery(message)) return true;
  return (
    /\b(hungry|starving|food|eat|dinner|lunch|breakfast|order|delivery|swiggy)\b/.test(lower) ||
    /\bwhat (?:should|can) i (?:eat|have|order)\b/.test(lower) ||
    /\b(address|deliver(?:y| to)?)\b/.test(lower)
  );
}

/**
 * User wants to keep ordering — show the restaurant menu again (not invent a shortlist).
 * "show more" alone usually means next menu page; that is handled separately.
 */
export function wantsMenuAgain(message: string): boolean {
  const lower = message.trim().toLowerCase();
  if (!lower) return false;

  return (
    /\badd more\b/.test(lower) ||
    /\bmore (?:items|dishes|food|options)\b/.test(lower) ||
    /\b(?:show|see|browse|open)(?:\s+me)?(?:\s+the)?\s+menu(?:\s+again)?\b/.test(lower) ||
    /\bwhat else (?:can|do|should) (?:i|we) (?:get|add|order|have)\b/.test(lower) ||
    /\bsomething else\b/.test(lower) ||
    /\banything else to (?:add|order|get)\b/.test(lower) ||
    /^(?:more|menu)$/i.test(lower)
  );
}

/**
 * Classify a free-form cart instruction. Ordering matters: "replace X with Y"
 * and removals are checked before additions so "remove the coke and add a
 * pepsi" is not mistaken for a plain add.
 */
export function parseCartIntent(message: string): CartIntent {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (/\b(clear|empty|reset)\b.*\bcart\b|\bcart\b.*\b(clear|empty)\b|\bstart over\b|\bcancel (?:the |my )?order\b/.test(lower)) {
    return { kind: "clear" };
  }

  const replace = lower.match(/\b(?:replace|swap|change|switch)\b\s+(?:the\s+)?(.+?)\s+(?:with|for|to)\s+(.+)$/);
  if (replace) {
    return { kind: "replace", from: cleanReference(replace[1]), to: cleanReference(replace[2]) };
  }

  const remove = lower.match(/\b(?:remove|delete|drop|take out|take off|get rid of|no more|cancel)\b\s+(?:the\s+)?(.+)$/);
  if (remove) {
    return { kind: "remove", reference: cleanReference(stripQuantity(remove[1])) };
  }

  // "increase biryani to 2", "change the coke to 3" — the subject sits between
  // the verb and "to", so it must be captured rather than consumed.
  const setQtySubject = lower.match(
    /\b(?:increase|decrease|change|update|set|make)\b\s+(?:the\s+)?(.*?)\s+to\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/
  );
  if (setQtySubject) {
    return {
      kind: "set_quantity",
      reference: cleanReference(stripQuantity(setQtySubject[1])),
      quantity: parseQuantity(setQtySubject[2]) ?? 1,
    };
  }

  // "make it two", "change to 3" — no explicit subject; the caller applies it to
  // the only cart line, or asks which item was meant.
  const setQty = lower.match(
    /\b(?:make (?:it|that|them)|change (?:it )?to|set (?:it )?to|update (?:it )?to)\b\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/
  );
  if (setQty) {
    return { kind: "set_quantity", reference: "", quantity: parseQuantity(setQty[1]) ?? 1 };
  }

  // Menu numbers must be handled before stripQuantity — otherwise "24 and 22"
  // collapses to unknown and the UI loops on "What would you like to add?"
  const indexSelection = parseMenuIndexSelection(text);
  if (indexSelection) return indexSelection;

  if (/\b(increase|one more|another|add another|double)\b/.test(lower)) {
    const quantity = parseQuantity(lower) ?? 1;
    const subject = cleanReference(stripQuantity(lower));
    return { kind: "add", reference: subject, quantity: /\bdouble\b/.test(lower) ? 2 : quantity };
  }

  const quantity = parseQuantity(lower) ?? 1;
  const reference = cleanReference(stripQuantity(text));

  if (reference.length === 0) return { kind: "unknown", reference: text };
  return { kind: "add", reference, quantity };
}
