import "server-only";

import { chat, type LlmMessage, type LlmProvider } from "@/lib/atlas/llm";
import { memoryService, MEMORY_TYPES, type MemoryType } from "@/lib/atlas/memory/service";

type ActiveModel = {
  id: string;
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Memory retrieval — graph facts + semantic recall, limited to relevant lines.
 */
export async function retrieveMemories(userId: string, message: string, category: string): Promise<string[]> {
  if (userId === "atlas-demo-user") return [];

  const { graph, semantic } = await memoryService.reason(userId, message, { category, limit: 6 });
  const lines: string[] = [];

  for (const rel of graph) {
    lines.push(`[graph] ${rel.subject.name} --${rel.relation}--> ${rel.object.name}`);
  }
  for (const m of semantic) {
    lines.push(`[${m.type}] ${m.text}`);
  }
  return lines;
}

/**
 * Best-effort memory extraction after a reply. Never blocks the user response.
 */
export async function extractAndStoreMemories(
  userId: string,
  userMessage: string,
  assistantReply: string,
  model: ActiveModel
) {
  if (userId === "atlas-demo-user") return;

  const extractPrompt: LlmMessage[] = [
    {
      role: "system",
      content:
        "Extract durable long-term facts about the user from this conversation turn. " +
        "For each fact emit a JSON object with: " +
        "text (short phrase), type (one of: identity, preference, relationship, goal, project, habit, health, travel, food, work, finance, event, instruction, knowledge), " +
        "temporary (boolean — true for short-lived context like 'visiting Paris next week', false for permanent facts like 'I am vegetarian'), " +
        "expiresInHours (if temporary, roughly how many hours; else omit), " +
        "graph (optional, when the fact is a relationship): { subject (usually 'user'), relation (verb like prefers, works_at, travels_to, likes, dislikes, allergic_to, lives_in, no_longer_prefers, budget), object (the entity, e.g. Hyatt, Seattle, NVIDIA), operation (one of: create, replace, append, remove, strengthen, weaken, archive) }. " +
        "Use operation 'replace' when the user changes an existing preference or fact (e.g. 'I prefer Hyatt over Marriott' → graph {subject:'user', relation:'prefers', object:'Hyatt', operation:'replace'}); this archives the old preference automatically. " +
        "INSTRUCTIONS: if the user states how they want Atlas to behave (e.g. 'always answer with TypeScript', 'be concise'), use type 'instruction'. " +
        "Do NOT save greetings, jokes, one-off chit-chat, or generic questions. " +
        "Respond with a JSON array of such objects (max 5). If nothing is worth saving, respond with [].",
    },
    { role: "user", content: `User: ${userMessage}\nAssistant: ${assistantReply}` },
  ];

  try {
    const result = await chat({
      model: model.id,
      provider: model.provider,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      messages: extractPrompt,
      toolChoice: "none",
      temperature: 0.2,
    });

    const content = (result.content || "").trim();
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return;

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return;

    for (const entry of parsed.slice(0, 5)) {
      if (!isRecord(entry)) continue;
      const text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (!text) continue;

      const type =
        typeof entry.type === "string" && (MEMORY_TYPES as string[]).includes(entry.type)
          ? (entry.type as MemoryType)
          : "knowledge";
      const temporary = entry.temporary === true;
      const expiresInHours = typeof entry.expiresInHours === "number" ? entry.expiresInHours : undefined;

      if (isRecord(entry.graph)) {
        const g = entry.graph as Record<string, unknown>;
        const subject = typeof g.subject === "string" ? g.subject : "user";
        const relation = typeof g.relation === "string" ? g.relation : "";
        const object = typeof g.object === "string" ? g.object : "";
        const operation =
          typeof g.operation === "string"
            ? (g.operation as "create" | "replace" | "append" | "remove" | "strengthen" | "weaken" | "archive")
            : "create";
        if (relation && object) {
          await memoryService.applyRelationOperation(userId, operation, {
            subject,
            relation,
            object,
            subjectKind: "user",
            objectKind: typeof g.objectKind === "string" ? g.objectKind : undefined,
          });
        }
      }

      const existing = await memoryService.recall(userId, text, { types: [type], limit: 3 });
      const duplicate = existing.find((m) => m.score > 0.82);

      if (duplicate) {
        await memoryService.update(duplicate.id, {
          text,
          confidence: Math.min(1, (duplicate.confidence ?? 0.5) + 0.2),
          type,
          status: "active",
        });
        continue;
      }

      await memoryService.remember(userId, text, {
        kind: type === "knowledge" ? "knowledge" : "user",
        type,
        importance: type === "instruction" ? 0.8 : 0.6,
        confidence: 0.6,
        expiresInHours: temporary ? (expiresInHours ?? 24 * 7) : undefined,
      });
    }
  } catch {
    /* memory extraction is best-effort */
  }
}
