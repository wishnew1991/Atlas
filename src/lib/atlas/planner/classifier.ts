import "server-only";

import type { AtlasActionDomain } from "@/lib/atlas/agent-contract";
import type { Capability } from "@/lib/atlas/planner/planner";
import { chat } from "@/lib/atlas/llm";
import { resolveDefaultModel } from "@/lib/atlas/server/model-registry";

/**
 * Semantic capability classifier.
 *
 * The deterministic planner (conversation/state.ts) is the hot path and handles
 * obvious single-keyword cases for every domain. This classifier is only
 * invoked when the regex is insufficient:
 *   - no capability matched,
 *   - only weak/ambiguous keywords matched (low confidence), or
 *   - multiple capabilities are plausible.
 *
 * It asks the configured reasoning model to resolve the capability from the
 * whole utterance + recent context, returning structured JSON. The planner owns
 * the conversation-aware inheritance; this module only classifies a single
 * turn. A deterministic fallback is used when confidence is low or the call
 * fails, so the system degrades gracefully without a growing keyword list.
 */

export interface ClassifierInput {
  message: string;
  history: { role: "user" | "assistant"; text: string }[];
}

export interface ClassifierOutput {
  capabilities: Capability[];
  confidence: number;
  domain: AtlasActionDomain | null;
  entities?: Record<string, string | undefined>;
  reason: string;
}

const CAPABILITY_DEFINITIONS: { capability: Capability; description: string }[] = [
  { capability: "food", description: "Ordering, browsing, or talking about food, restaurants, delivery, or meals (e.g. 'order biryani', 'I'm hungry', 'find pizza near me')." },
  { capability: "travel", description: "Flights, hotels, trips, vacations, itineraries, or travel booking (e.g. 'book a flight', 'hotel in Paris')." },
  { capability: "shopping", description: "Buying products, goods, or general purchases that are not food, travel, or rides (e.g. 'order an iPhone', 'buy headphones')." },
  { capability: "rides", description: "Taxis, cabs, ride-hailing, or chauffeur bookings (e.g. 'call an Uber', 'book a ride')." },
  { capability: "calendar", description: "Appointments, meetings, salon/spa visits, schedules, reminders, or events (e.g. 'book a dentist appointment')." },
  { capability: "communication", description: "Sending messages, emails, calls, or notifications to a person (e.g. 'email John', 'text mom')." },
  { capability: "web", description: "General knowledge, news, lookups, explanations, or research with no real-world action (e.g. 'what is photosynthesis')." },
];

const CLASSIFIER_SYSTEM_PROMPT = `You are a capability classifier for the Atlas assistant. Given the user's latest message and recent conversation, decide which Atlas capability or capabilities it belongs to.

Capabilities:
${CAPABILITY_DEFINITIONS.map((entry) => `- ${entry.capability}: ${entry.description}`).join("\n")}

Rules:
- Choose from the capability names above only.
- Use the whole message AND the conversation context to disambiguate. For example:
  - "order an iPhone" -> shopping (a product, not food)
  - "order biryani" -> food
  - "book a flight" -> travel
  - "call an Uber" -> rides
  - "email John" -> communication
- Disambiguate verbs by their object: "order"/"book"/"buy" alone are ambiguous; the item decides the capability.
- If the message is small talk, identity, or general conversation with no action, return ["web"] only when it is a knowledge question; otherwise return [] (no capability).
- List the single best capability first; add a second only when two are genuinely plausible.
- Extract a brief entity if useful (e.g. dish, item, destination, recipient).

Respond with ONLY a JSON object:
{"capabilities": string[], "confidence": number, "domain": string|null, "entities": object|null, "reason": string}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCapability(value: unknown): Capability | null {
  if (typeof value !== "string") return null;
  const allowed: Capability[] = [
    "food",
    "travel",
    "shopping",
    "rides",
    "calendar",
    "communication",
    "web",
    "none",
  ];
  return (allowed as string[]).includes(value) ? (value as Capability) : null;
}

function parseClassifierJson(content: string): ClassifierOutput | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!isRecord(parsed)) return null;

    const rawCaps = Array.isArray(parsed.capabilities) ? parsed.capabilities : [];
    const capabilities = rawCaps
      .map(normalizeCapability)
      .filter((cap): cap is Capability => cap !== null);

    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0;

    const domain =
      typeof parsed.domain === "string" && parsed.domain.length > 0
        ? (parsed.domain as AtlasActionDomain)
        : null;

    const entities = isRecord(parsed.entities) ? parsed.entities : undefined;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "semantic classifier";

    return {
      capabilities: capabilities.length > 0 ? capabilities : ["web"],
      confidence,
      domain,
      entities: entities as Record<string, string | undefined> | undefined,
      reason,
    };
  } catch {
    return null;
  }
}

const classifierCache = new Map<string, { result: ClassifierOutput; expires: number }>();
const CLASSIFIER_TTL_MS = 60_000;

/**
 * Classify a turn semantically. Falls back to a low-confidence web result when
 * the model is unavailable or returns an unusable response, so the planner
 * always receives a structured capability list.
 */
export async function classifyCapabilities(input: ClassifierInput): Promise<ClassifierOutput> {
  const cacheKey = input.message.trim().toLowerCase();
  const cached = classifierCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }

  const model = await resolveDefaultModel();
  if (!model) {
    return { capabilities: ["web"], confidence: 0, domain: null, reason: "no model configured — fallback" };
  }

  const historyMessages = input.history
    .slice(-6)
    .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`)
    .join("\n");

  const userContent = historyMessages.length > 0
    ? `${historyMessages}\n\nUser: ${input.message}`
    : input.message;

  try {
    const result = await chat({
      model: model.id,
      provider: model.provider,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      toolChoice: "none",
      temperature: 0,
      maxTokens: 200,
    });

    const parsed = parseClassifierJson(result.content || "");
    const output: ClassifierOutput =
      parsed && parsed.confidence >= 0.5
        ? parsed
        : { capabilities: ["web"], confidence: 0, domain: null, reason: "low confidence — fallback" };

    classifierCache.set(cacheKey, { result: output, expires: Date.now() + CLASSIFIER_TTL_MS });
    return output;
  } catch {
    return { capabilities: ["web"], confidence: 0, domain: null, reason: "classifier error — fallback" };
  }
}
