import "server-only";

import type {
  AtlasActionDomain,
  AtlasChatHistoryItem,
  AtlasChatResponse,
  AtlasPendingAction,
} from "@/lib/atlas/agent-contract";
import type { AtlasActionResponse } from "@/lib/atlas/agent-contract";
import { prisma } from "@/lib/atlas/server/prisma";
import { chat, streamChat, type LlmChatOptions, type LlmMessage, type LlmTool, type LlmToolCall, type LlmChunk, type LlmProvider } from "@/lib/atlas/llm";
import { toLlmProvider } from "@/lib/atlas/server/provider-map";
import { ConversationManager } from "@/lib/atlas/conversation/manager";
import { plan } from "@/lib/atlas/planner/planner";
import { getToolSchemas, getToolsForCapabilities, executeTool, type ToolExecResult } from "@/lib/atlas/tools/registry";
import { compose } from "@/lib/atlas/response/composer";
import { routeToolCall } from "@/lib/atlas/mcp/router";
import { resolveConversationState } from "@/lib/atlas/conversation/state";
import { readFoodOrderIntent } from "@/lib/atlas/mcp/food-approval";
import { memoryService, MEMORY_TYPES, type MemoryType } from "@/lib/atlas/memory/service";
import { getFoodSession } from "@/lib/atlas/mcp/food-session";
import type { AtlasCapabilities } from "@/lib/atlas/server/auth";

const BASE_SYSTEM_PROMPT = `You are Atlas, a warm, concise personal AI assistant. You behave like a smart friend who can both chat and get things done.

## Conversation style
- For normal conversation, knowledge, coding, writing, or brainstorming: answer directly and naturally, like ChatGPT. Do NOT call any tool for small talk, greetings, or casual questions.
- Keep replies concise and friendly. Match the user's energy.

## Connected services
- Tools prefixed with \`mcp__\` come from connected MCP services (web search, browsing, files, memory, food, travel, etc.). Use them when they clearly help with the user's request — a tool whose description matches the task. If a service is not exposed here, it is not connected; say so instead of inventing results.
- Never invent data the tools did not return. If a connected tool fails or is unavailable, tell the user plainly.

## Memory
- You have access to the user's long-term memory (preferences, habits, family, work, goals, dietary needs, travel likes, important dates). It is provided in the "User Memory" section of this prompt. Use it naturally to personalize replies. Never mention the raw memory system to the user.

## Proactive food help
- When the user hints at hunger, cravings, or food ("I'm hungry", "want something to eat", "craving pizza", "what should I have for dinner"), be proactive:
  1. Acknowledge it warmly (e.g. "You sound hungry — I can sort that out for you.").
  2. Volunteer a concrete suggestion or two based on what they said (cuisine, dish, or "I can look up places near you").
  3. Offer to actually find or order food. Do NOT demand an address up front.
- Only call atlas_search / food tools AFTER the user shows they want you to look (e.g. "yes", "find me something", "order it"). When they do, call atlas_search first to pull saved addresses, menus, and restaurants, then continue the flow.
- For other real-world domains (shopping, travel, rides, appointments), call atlas_search when the user clearly wants action; don't over-ask for missing details — call with what you have.

## Safety
- atlas_prepare_approval: call ONLY after the user has chosen a specific item/option and you are ready to prepare an order or booking for their explicit confirmation.
- Never claim a purchase, payment, reservation, or order is complete until the user confirms an approval card.
- Ask ONE focused follow-up only if a tool genuinely cannot proceed without a missing detail.

## Food ordering (Swiggy)
You orchestrate food ordering as a guided conversation using these tools. Atlas remembers the address, restaurant, menu and cart between turns, so you never handle raw IDs — pass the user's own words and the tool resolves them.

The flow, in order:
1. **food_set_address** — set the delivery address. Call with no arguments to list saved addresses; call with \`reference\` when the user picks one ("the office one", "2"). ONCE the address is confirmed (you see "Delivering to…" in the conversation), skip this step — do NOT call it again.
2. **food_find_restaurants** — once the address is set AND the user says what they want to eat ("chicken biryani"), find restaurants. Shows rating, ETA and price.
3. **food_select_restaurant** — the user picks one; this automatically loads the menu.
4. **food_browse_menu** — show more of the menu (\`page\`) or search a dish within it (\`query\`).
5. **food_update_cart** — pass the user's instruction verbatim: "add Andhra chicken biryani", "two gulab jamuns", "remove the Coke", "make it two", "replace it with mutton biryani".
6. **food_checkout** — ONLY when the user is finished adding items. Returns the approval card.

Rules:
- NEVER call food_set_address if the conversation already shows a delivery address is set.
- If the user says what they want to eat and the address is already confirmed, jump straight to food_find_restaurants.
- Search restaurants BEFORE listing dishes. Don't jump straight to menu items when the user names a dish — show them where they can get it.
- After every successful cart change, ask if they'd like anything else. Keep it natural and brief.
- Relay the tool's list of restaurants, menu items or cart contents as-is — it is already formatted. Add at most one short sentence of your own.
- Use food_view_cart, food_select_payment and food_cancel_order when the user asks for those directly.

CRITICAL SAFETY RULES:
- Never claim an order was placed, confirmed, or paid for unless food_checkout returned an approval card AND the user confirmed it. Creating the card is NOT placing the order.
- Never invent prices, ETAs, restaurants, or menu items the tools did not return.
- If a tool asks the user a question or shows options, relay it and STOP. Do not answer on the user's behalf.

## Shopping, travel, rides, appointments, and general web tasks
When the user asks you to find products, compare prices, search for items, or interact with a website, use \`mcp__browser_use__*\` tools to browse the web like a human. These tools control a real browser.

Key tools (prefixed \`mcp__browser_use__\`):
- \`browser_run_task\` — autonomous multi-step task. Best for "find the cheapest MacBook on Amazon" or "search for flights to Delhi". Be specific: describe exactly what to find and from where.
- \`browser_navigate\` — go to a URL (e.g. "https://www.amazon.in/s?k=macbook")
- \`browser_extract_content\` — pull structured data (names, prices, ratings) from the current page
- \`browser_click\` / \`browser_type\` — interact with elements on the page
- \`browser_get_state\` — see what's on the current page

For shopping:
1. Use \`browser_run_task\` or \`browser_navigate\` to search an e-commerce site
2. Use \`browser_extract_content\` to pull product details and prices
3. Present the top 3-5 results with prices in a comparison
4. Call \`atlas_prepare_approval\` ONLY when the user picks a specific item

For travel, rides, appointments: use the browser tools to search booking sites, compare options, and fill forms. Call \`atlas_prepare_approval\` when the user confirms a choice.
`;

function buildSystemPrompt(memories: string[], sessionContext?: string): string {
  let prompt = BASE_SYSTEM_PROMPT;
  if (memories.length > 0) {
    prompt += `
    
## User Memory
The following are facts the user has shared previously. Use them to personalize your reply:
${memories.map((m) => `- ${m}`).join("\n")}
`;
  }
  if (sessionContext) {
    prompt += `
## Current Session
${sessionContext}`;
  }
  return prompt;
}

function buildFoodSessionContext(userId: string): string | undefined {
  const session = getFoodSession(userId);
  if (!session.address) return undefined;

  const lines: string[] = [];
  lines.push(`- Delivery address is already set: **${session.address.tag ?? session.address.line}**`);
  lines.push("- The address does NOT need to be set again. Skip food_set_address.");

  if (session.restaurant) {
    lines.push(`- Current restaurant: **${session.restaurant.name}**`);
    lines.push(`- Menu is loaded with ${session.menuItems.length} items`);
  }
  if (session.cart.length > 0) {
    lines.push(`- Cart has ${session.cart.length} item(s)`);
    lines.push(`- Total: ${session.totals.toPay !== undefined ? `₹${session.totals.toPay}` : "unknown"}`);
  }

  return lines.join("\n");
}

const actionDomains: string[] = ["shopping", "travel", "food", "rides", "appointments"];

type ActiveModel = {
  id: string;
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
};

async function resolveActiveModel(domain: AtlasActionDomain): Promise<ActiveModel | null> {
  const { resolveModelForDomain } = await import("@/lib/atlas/server/model-registry");
  const model = await resolveModelForDomain(domain);

  if (model) {
    const mapped = toLlmProvider(model.provider);
    return {
      id: model.id,
      provider: mapped.provider,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl || mapped.baseUrl,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      id: process.env.ATLAS_MODEL || "gpt-4.1-mini",
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: undefined,
    };
  }

  return null;
}

function toLlmMessages(history: AtlasChatHistoryItem[], message: string, memoryTexts: string[] = [], sessionContext?: string): LlmMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(memoryTexts, sessionContext) },
    ...history.slice(-12).map((item) => ({ role: item.role, content: item.text })),
    { role: "user", content: message },
  ];
}

/**
 * Memory retrieval step — runs automatically for every request before the LLM
 * reasons. The Memory Reasoning Layer combines structured graph facts (relationship
 * queries, independent of embeddings) with semantic vector recall, so Atlas
 * understands *what* a memory represents, not just how similar it is. Returns
 * enriched text lines for prompt injection.
 */
async function retrieveMemories(userId: string, message: string, category: string): Promise<string[]> {
  if (userId !== "atlas-demo-user") {
    const { graph, semantic } = await memoryService.reason(userId, message, { category, limit: 6 });
    const lines: string[] = [];

    for (const rel of graph) {
      lines.push(`[graph] ${rel.subject.name} --${rel.relation}--> ${rel.object.name}`);
    }
    for (const m of semantic) {
      lines.push(`[${m.type}] ${m.text}`);
    }
    if (lines.length > 0) return lines;
  }
  return [];
}

/**
 * Memory extraction step — runs after every assistant response. The LLM classifies
 * each durable fact into a MemoryType AND emits structured graph triples with an
 * explicit operation (create/replace/append/remove/strengthen/weaken/archive). The
 * graph layer resolves conflicts structurally (e.g. "prefers Hyatt" with operation
 * "replace" archives the prior "prefers Marriott" relation). Vector memories are
 * still written for fuzzy semantic recall. Procedural "instruction" memories are
 * kept so they influence future responses automatically.
 */
async function extractAndStoreMemories(userId: string, userMessage: string, assistantReply: string, model: ActiveModel) {
  if (userId === "atlas-demo-user") return; // guests do not get persisted memory

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
        'Respond with a JSON array of such objects (max 5). If nothing is worth saving, respond with [].',
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

      const type = typeof entry.type === "string" && (MEMORY_TYPES as string[]).includes(entry.type)
        ? (entry.type as MemoryType)
        : "knowledge";
      const temporary = entry.temporary === true;
      const expiresInHours = typeof entry.expiresInHours === "number" ? entry.expiresInHours : undefined;

      // Structured graph write (relationship reasoning + conflict resolution).
      if (isRecord(entry.graph)) {
        const g = entry.graph as Record<string, unknown>;
        const subject = typeof g.subject === "string" ? g.subject : "user";
        const relation = typeof g.relation === "string" ? g.relation : "";
        const object = typeof g.object === "string" ? g.object : "";
        const operation = typeof g.operation === "string" ? (g.operation as "create" | "replace" | "append" | "remove" | "strengthen" | "weaken" | "archive") : "create";
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

      // Vector memory write for fuzzy semantic recall (lifecycle-aware: update if
      // an existing active memory of the same type is a near-duplicate).
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
    /* memory extraction is best-effort — never block the response */
  }
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractToolCallFromContent(content: string): LlmToolCall | null {
  // Try JSON format first: { "tool": "name", "arguments": {...} }
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!isRecord(parsed)) { /* fall through to XML */ }
      else {
        const name = typeof parsed.tool === "string" ? parsed.tool : typeof parsed.name === "string" ? parsed.name : "";
        if (name) {
          const rawArgs = parsed.arguments ?? parsed.parameters ?? parsed.input ?? {};
          const argumentsStr = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
          return { id: crypto.randomUUID(), name, arguments: argumentsStr };
        }
      }
    } catch { /* fall through to XML */ }
  }

  // Try XML-style format: <tool_call><function=name><parameter=key>val</parameter></function></tool_call>
  const xmlFunc = content.match(/<function=([\w_]+)>/);
  if (xmlFunc) {
    const name = xmlFunc[1];
    const args: Record<string, unknown> = {};
    const xmlParamRe = /<parameter=(\w+)>\s*([\s\S]*?)\s*<\/parameter>/g;
    let m;
    while ((m = xmlParamRe.exec(content)) !== null) {
      const key = m[1];
      const val = m[2].trim();
      args[key] = /^\d+$/.test(val) ? Number(val) : val;
    }
    return { id: crypto.randomUUID(), name, arguments: JSON.stringify(args) };
  }

  return null;
}

/**
 * Last line of defence: true when assistant text still looks like a serialized
 * tool call. Reasoning models sometimes emit a tool call as plain text (for
 * example when the tools array was withheld but the system prompt still names
 * the tools). Such content must never be shown to the user.
 */
export function looksLikeToolPayload(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.includes("{") && !trimmed.includes("<tool_call>")) return false;

  // XML-style tool calls
  if (trimmed.includes("<function=")) return true;

  // JSON-style tool calls
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return false;

  try {
    const parsed = JSON.parse(match[0]);
    if (!isRecord(parsed)) return false;
    const hasName = typeof parsed.tool === "string" || typeof parsed.name === "string";
    const hasArgs = "arguments" in parsed || "parameters" in parsed || "input" in parsed;
    return hasName && hasArgs;
  } catch {
    return false;
  }
}

/**
 * Resolve a tool call from a model result regardless of how the model expressed
 * it: native `tool_calls` first, then the plain-text JSON fallback parser.
 */
function resolveToolCalls(result: { content: string; toolCalls: LlmToolCall[] }): LlmToolCall[] {
  if (result.toolCalls.length > 0) return result.toolCalls;
  const embedded = result.content ? extractToolCallFromContent(result.content) : null;
  return embedded ? [embedded] : [];
}

/**
 * Build the follow-up message list that feeds tool results back to the model.
 * The assistant turn always carries the tool_calls, so the model sees a valid
 * tool-calling exchange even when the call arrived as plain text.
 */
function buildFollowUpMessages(
  baseMessages: LlmMessage[],
  assistantContent: string,
  toolCalls: LlmToolCall[],
  results: ToolExecResult[]
): LlmMessage[] {
  return [
    ...baseMessages,
    {
      role: "assistant",
      // Suppress raw JSON tool payloads from the transcript.
      content: looksLikeToolPayload(assistantContent) ? null : assistantContent || null,
      tool_calls: toolCalls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })),
    },
    ...toolCalls.map((call, index) => ({
      role: "tool" as const,
      tool_call_id: call.id,
      content: JSON.stringify(results[index] ?? { message: "" }),
    })),
  ];
}

/**
 * Summary of an assistant turn that consisted of tool calls, appended to the
 * transcript so later turns can resolve references like "yes" or "that one".
 * Without this the assistant turn would be stored as an empty string and the
 * conversational state would be lost.
 */
function summarizeToolTurn(toolCalls: LlmToolCall[], results: ToolExecResult[]): string {
  const parts = results
    .map((result) => (result?.message ?? "").trim())
    .filter((message) => message.length > 0);

  if (parts.length > 0) return parts.join("\n\n");
  return `(${toolCalls.map((call) => call.name).join(", ")} completed)`;
}

const conversation = new ConversationManager();

export async function createAtlasReply(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities
): Promise<AtlasChatResponse> {
  if (!capabilities.liveLlm) {
    return demoResponse(message, userId);
  }

  const domain = await detectDomain(message, history);
  const activeModel = await resolveActiveModel(domain);

  if (!activeModel) {
    return demoResponse(message, userId);
  }

  const { capabilities: planCapabilities } = await plan(message, history);
  const tools = await getToolsForCapabilities(planCapabilities);
  const useTools = tools.length > 0;

  const memories = await retrieveMemories(userId, message, domain);
  const sessionCtx = domain === "food" || planCapabilities.includes("food") ? buildFoodSessionContext(userId) : undefined;

  const options: LlmChatOptions = {
    model: activeModel.id,
    provider: activeModel.provider,
    apiKey: activeModel.apiKey,
    baseUrl: activeModel.baseUrl,
    messages: toLlmMessages(history, message, memories, sessionCtx),
    tools: useTools ? tools : undefined,
    toolChoice: useTools ? "auto" : "none",
    temperature: 0.4,
  };

  const finalOptions: LlmChatOptions = { ...options, tools: undefined, toolChoice: "none" };

  try {
    const first = await chat(options);

    // Native tool_calls first, then the plain-text JSON fallback. This runs on
    // every path so a serialized tool call can never reach the user.
    const toolCalls = resolveToolCalls(first);

    if (toolCalls.length === 0) {
      // Defensive: content that still looks like a tool payload must not be shown.
      const reply = looksLikeToolPayload(first.content)
        ? "I'm ready to help."
        : first.content || "I'm ready to help.";
      void extractAndStoreMemories(userId, message, reply, activeModel);
      return { reply, mode: "live", toolsUsed: [] };
    }

    const toolExecResults = await Promise.all(
      toolCalls.map(async (call): Promise<ToolExecResult> =>
        executeTool(call.name, parseToolArgs(call.arguments), { userId, history, domain })
      )
    );

    const action = toolExecResults.find((result) => result.action)?.action;

    // The food tools return fully-formatted lists (addresses, restaurants, menu)
    // that must be shown verbatim. When a result is awaiting user input, relay it
    // directly instead of letting the model re-summarise it (which dropped or
    // truncated the list). We still run the model only when it can add value.
    if (toolExecResults.length === 1 && toolExecResults[0].awaitingUser && !action) {
      const reply = toolExecResults[0].message || summarizeToolTurn(toolCalls, toolExecResults);
      void extractAndStoreMemories(userId, message, reply, activeModel);
      return {
        reply,
        mode: "live",
        toolsUsed: toolCalls.map((call) => call.name),
        action,
      };
    }

    const followUp = buildFollowUpMessages(options.messages, first.content, toolCalls, toolExecResults);

    const final = await chat({ ...finalOptions, messages: followUp });
    const composed = looksLikeToolPayload(final.content) ? "" : final.content;
    const reply = composed || summarizeToolTurn(toolCalls, toolExecResults) || "I've prepared the next step for your review.";
    void extractAndStoreMemories(userId, message, reply, activeModel);

    return {
      reply,
      mode: "live",
      toolsUsed: toolCalls.map((call) => call.name),
      action,
    };
  } catch {
    return demoResponse(message, userId);
  }
}

export async function* streamAtlasReply(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  signal?: AbortSignal
): AsyncGenerator<{ text?: string; action?: AtlasPendingAction; done?: boolean; error?: string }> {
  if (!capabilities.liveLlm) {
    const demo = await demoResponse(message, userId);
    yield { text: demo.reply, action: demo.action, done: true };
    return;
  }

  const domain = await detectDomain(message, history);
  const activeModel = await resolveActiveModel(domain);
  if (!activeModel) {
    const demo = await demoResponse(message, userId);
    yield { text: demo.reply, action: demo.action, done: true };
    return;
  }

  const { capabilities: planCapabilities } = await plan(message, history);
  const tools = await getToolsForCapabilities(planCapabilities);
  const useTools = tools.length > 0;

  const memories = await retrieveMemories(userId, message, domain);
  const sessionCtx = domain === "food" || planCapabilities.includes("food") ? buildFoodSessionContext(userId) : undefined;

  const options: LlmChatOptions = {
    model: activeModel.id,
    provider: activeModel.provider,
    apiKey: activeModel.apiKey,
    baseUrl: activeModel.baseUrl,
    messages: toLlmMessages(history, message, memories, sessionCtx),
    tools: useTools ? tools : undefined,
    toolChoice: useTools ? "auto" : "none",
    temperature: 0.4,
  };

  const finalOptions: LlmChatOptions = { ...options, tools: undefined, toolChoice: "none" };

  try {
    // The first turn is ALWAYS non-streaming so tool calls can be detected and
    // executed before a single token reaches the client. Streaming the first
    // turn is what previously let raw tool JSON leak to the frontend.
    const first = await chat(options);
    const toolCalls = resolveToolCalls(first);

    if (toolCalls.length === 0) {
      const reply = looksLikeToolPayload(first.content)
        ? "I'm ready to help."
        : first.content || "I'm ready to help.";
      void extractAndStoreMemories(userId, message, reply, activeModel);
      yield { text: reply, done: true };
      return;
    }

    const toolExecResults = await Promise.all(
      toolCalls.map(async (call) =>
        executeTool(call.name, parseToolArgs(call.arguments), { userId, history, domain })
      )
    );

    const action = toolExecResults.find((result) => result.action)?.action;

    // Relay a fully-formatted, awaiting-user list verbatim (see createAtlasReply
    // for the rationale) instead of streaming a model re-summary of it.
    if (toolExecResults.length === 1 && toolExecResults[0].awaitingUser && !action) {
      const reply = toolExecResults[0].message || summarizeToolTurn(toolCalls, toolExecResults);
      void extractAndStoreMemories(userId, message, reply, activeModel);
      yield { text: reply, action, done: true };
      return;
    }

    const followUp = buildFollowUpMessages(options.messages, first.content, toolCalls, toolExecResults);

    // Stream the natural-language turn. Tokens are buffered until we are sure
    // the model is not serializing another tool call as plain text.
    let reply = "";
    let emitted = 0;
    let suppressed = false;

    for await (const chunk of streamChat({ ...finalOptions, messages: followUp, stream: true, signal })) {
      if (chunk.type !== "token") continue;
      reply += chunk.text;

      if (suppressed) continue;

      // Hold everything back while the buffer still looks like it could be a
      // JSON tool payload; release once it is clearly prose.
      if (reply.trimStart().startsWith("{")) {
        if (looksLikeToolPayload(reply)) {
          suppressed = true;
          emitted = 0;
        }
        continue;
      }

      if (reply.length > emitted) {
        yield { text: reply.slice(emitted) };
        emitted = reply.length;
      }
    }

    if (suppressed || looksLikeToolPayload(reply)) {
      // The follow-up turn produced another tool payload — never show it.
      const fallback = summarizeToolTurn(toolCalls, toolExecResults);
      reply = fallback;
      yield { text: fallback };
    } else if (reply.length > emitted) {
      yield { text: reply.slice(emitted) };
    } else if (reply.trim().length === 0) {
      reply = summarizeToolTurn(toolCalls, toolExecResults);
      yield { text: reply };
    }

    void extractAndStoreMemories(userId, message, reply, activeModel);
    yield { action, done: true };
  } catch (error) {
    console.error("[streamAtlasReply] error", error);
    const demo = await demoResponse(message, userId);
    yield { text: demo.reply, action: demo.action, done: true };
  }
}

export async function executeAtlasAction(actionId: string, userId: string) {
  const pending = await prisma.approval.findUnique({ where: { id: actionId } });

  const ownsAction = userId === "atlas-demo-user" ? pending?.userId === null : pending?.userId === userId;

  if (!pending || !ownsAction || pending.expiresAt.getTime() < Date.now()) {
    if (pending) {
      await prisma.approval.delete({ where: { id: actionId } }).catch(() => {});
    }
    throw new Error("This approval request has expired. Please ask Atlas to prepare it again.");
  }

  const domain = pending.domain as AtlasActionDomain;

  // Food orders carry a server-trusted execution intent captured at approval
  // time, so we place exactly what the user confirmed rather than re-deriving
  // it from prose. Nothing from the browser is trusted here.
  if (domain === "food") {
    const intent = readFoodOrderIntent(pending.fields);

    if (intent) {
      const { placeOrder } = await import("@/lib/atlas/mcp/swiggy-client");
      const { foodLog } = await import("@/lib/atlas/mcp/food-log");
      const { updateFoodSession } = await import("@/lib/atlas/mcp/food-session");

      foodLog("order.place", {
        approval: actionId,
        restaurant: intent.restaurantName,
        items: intent.items.length,
        toPay: intent.toPay,
        payment: intent.paymentMethod ?? "Cash",
      });

      const placed = await placeOrder({
        addressId: intent.addressId,
        paymentMethod: intent.paymentMethod,
        intentApp: intent.intentApp,
        generateUPIQR: intent.generateUPIQR,
      });

      // UPI returns PENDING_PAYMENT: the order is NOT placed until the user pays
      // in their UPI app and confirm_order succeeds. Swiggy is explicit that we
      // must not announce success on this response, so we keep the approval
      // pending and surface the UPI link/QR without marking it complete.
      const isPendingPayment = placed.status === "PENDING_PAYMENT" || Boolean(placed.upiLink || placed.upiQr);

      if (isPendingPayment) {
        foodLog("order.place", { approval: actionId, result: "pending_payment", orderId: placed.orderId });

        // Persist the handoff so the UPI link/QR survives a refresh and the
        // finalize step (check_payment_status -> confirm_order) can echo the
        // exact ids Swiggy requires, without trusting the browser.
        const meta = JSON.stringify({
          orderId: placed.orderId ?? null,
          paasId: placed.paasId ?? null,
          cartId: placed.cartId ?? null,
          lat: placed.lat ?? null,
          lng: placed.lng ?? null,
          addressId: intent.addressId,
          upiLink: placed.upiLink ?? null,
          upiQr: placed.upiQr ?? null,
          paymentRef: placed.paymentRef ?? null,
        });

        await prisma.approval.update({
          where: { id: actionId },
          data: { status: "pending_payment", meta, reference: placed.orderId ?? placed.paymentRef ?? pending.id },
        });

        updateFoodSession(userId, { step: "pending_payment", approvalId: actionId });

        return {
          message:
            placed.message ||
            "Complete the payment in your UPI app — I'll confirm your order once payment succeeds.",
          reference: placed.orderId ?? placed.paymentRef ?? pending.id,
          mode: "live" as const,
          pending: true,
          upiRedirect: placed.upiLink,
          upiQr: placed.upiQr,
        };
      }

      await prisma.approval.update({
        where: { id: actionId },
        data: { status: "completed", completedAt: new Date(), reference: placed.orderId ?? pending.id },
      });

      updateFoodSession(userId, { step: "placed", approvalId: undefined });
      foodLog("order.place", { approval: actionId, result: "ok", orderId: placed.orderId });

      return {
        message: placed.message || `Your order from ${intent.restaurantName ?? "the restaurant"} is placed.`,
        reference: placed.orderId ?? pending.id,
        mode: "live" as const,
      };
    }
  }

  const gatewayResult = await routeToolCall(domain, "execute", { domain, request: pending.summary });

  await prisma.approval.update({
    where: { id: actionId },
    data: {
      status: "completed",
      completedAt: new Date(),
      reference: gatewayResult?.message ?? pending.id,
    },
  });

  if (gatewayResult) {
    return {
      message: gatewayResult.message || pending.title.replace("Approve ", "") + " confirmed.",
      reference: pending.id,
      mode: "live" as const,
    };
  }

  return {
    message: pending.title.replace("Approve ", "") + " confirmed in demo mode. Connect the MCP gateway to place a live " + domain + " request.",
    reference: pending.id,
    mode: "demo" as const,
  };
}

/**
 * Finalize a pending UPI food order. Swiggy's UPI widget normally auto-confirms,
 * but this is the safety net: poll `check_payment_status` once and, on a terminal
 * SUCCESS, call `confirm_order` to move the order to PLACED. We never loop — a
 * single read is enough to decide. The handoff ids are read from the persisted
 * approval `meta` (server-trusted), never from the browser.
 */
export async function finalizeFoodUpi(actionId: string, userId: string): Promise<AtlasActionResponse> {
  const pending = await prisma.approval.findUnique({ where: { id: actionId } });

  const ownsAction = userId === "atlas-demo-user" ? pending?.userId === null : pending?.userId === userId;
  if (!pending || !ownsAction) {
    throw new Error("This approval request is invalid or has expired.");
  }
  if (pending.status !== "pending_payment") {
    return {
      message: pending.status === "completed" ? "Your order is already confirmed." : "This order is not awaiting UPI payment.",
      reference: pending.reference ?? pending.id,
      mode: "live" as const,
    };
  }

  let meta: Record<string, unknown> = {};
  try {
    if (pending.meta) meta = JSON.parse(pending.meta);
  } catch {
    meta = {};
  }

  const orderId = typeof meta.orderId === "string" ? meta.orderId : undefined;
  const paasId = typeof meta.paasId === "string" ? meta.paasId : undefined;
  const cartId = typeof meta.cartId === "string" ? meta.cartId : undefined;
  const addressId = typeof meta.addressId === "string" ? meta.addressId : undefined;
  const lat = typeof meta.lat === "number" ? meta.lat : undefined;
  const lng = typeof meta.lng === "number" ? meta.lng : undefined;

  if (!orderId || !addressId) {
    throw new Error("Missing order details needed to confirm payment.");
  }

  const { checkUpiPayment, confirmFoodOrder } = await import("@/lib/atlas/mcp/swiggy-client");
  const { foodLog } = await import("@/lib/atlas/mcp/food-log");
  const { updateFoodSession } = await import("@/lib/atlas/mcp/food-session");

  foodLog("upi.finalize", { approval: actionId, orderId });

  const status = await checkUpiPayment({ orderId, paasId, addressId, cartId, lat, lng });

  if (status === "SUCCESS" || status === "PAID") {
    await confirmFoodOrder({ orderId, addressId, cartId, lat, lng });
    await prisma.approval.update({
      where: { id: actionId },
      data: { status: "completed", completedAt: new Date(), reference: orderId },
    });
    updateFoodSession(userId, { step: "placed", approvalId: undefined });
    foodLog("upi.finalize", { approval: actionId, result: "confirmed", orderId });

    return {
      message: "Payment received — your Swiggy order is placed. 🎉",
      reference: orderId,
      mode: "live" as const,
    };
  }

  if (status === "FAILED" || status === "REFUND-INITIATED") {
    await prisma.approval.update({
      where: { id: actionId },
      data: { status: "failed", completedAt: new Date() },
    });
    foodLog("upi.finalize", { approval: actionId, result: status, orderId });

    return {
      message:
        status === "FAILED"
          ? "The UPI payment didn't go through. You can pick a payment method again to retry."
          : "A refund has been initiated for the failed payment.",
      reference: orderId,
      mode: "live" as const,
    };
  }

  // PENDING — let the user know it is still processing; the widget auto-confirms.
  return {
    message: "Payment is still processing — it will update automatically once your UPI app confirms. You can check again in a moment.",
    reference: orderId,
    mode: "live" as const,
    pending: true,
  };
}

// ---------------------------------------------------------------------------
// Demo mode (no live model / not authenticated). Tries MCP when a domain is
// clearly requested; otherwise replies like a normal chatbot.
// ---------------------------------------------------------------------------

const domainKeywords: Record<AtlasActionDomain, RegExp> = {
  travel: /\b(flight|flights|hotel|hotels|trip|trips|travel|book(ing)?\s+(a\s+)?(flight|hotel|trip)|vacation|itinerary|airbnb|airline)\b/i,
  food: /\b(food|restaurant|restaurants|biryani|dinner|lunch|breakfast|swiggy|zomato|deliver(?:y|ed)?|menu|order\s+(food|from)|pizza|burger|sushi|meal|snack|eat|cuisine)\b/i,
  rides: /\b(ride|rides|uber|ola|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop|chauffeur)\b/i,
  appointments: /\b(appointment|appointments|doctor|salon|spa|meeting|book\s+(a\s+)?(slot|appointment)|schedule\s+(a\s+)?(visit|call)|dentist|consultation)\b/i,
  shopping: /\b(buy|purchase|shop|shopping|cart|checkout|product|amazon|flipkart|order\s+(a|the|some)?\s*\w+)\b/i,
};

const identityChat =
  /^\s*(who\s+are\s+you|introduce\s+yourself|what\s+are\s+you|what\s+is\s+atlas|tell\s+me\s+about\s+(you|atlas|yourself)|what\s+can\s+you\s+do|your\s+name|are\s+you\s+(a\s+)?(bot|assistant|ai)|describe\s+yourself)\b/i;

function domainForText(text: string): AtlasActionDomain | null {
  const lower = text.toLowerCase();
  const priority: AtlasActionDomain[] = ["travel", "food", "rides", "appointments", "shopping"];
  for (const domain of priority) {
    if (domainKeywords[domain].test(lower)) return domain;
  }
  return null;
}

// Pick the active domain for a turn. This delegates to the shared conversation
// state resolver so the domain can never disagree with the planner's
// capabilities (they are derived from the same signals). Confirmations such as
// "yes, order it" inherit the in-flight task's domain.
async function detectDomain(message: string, history: AtlasChatHistoryItem[]): Promise<AtlasActionDomain> {
  return (await resolveConversationState(message, history)).domain;
}

async function demoResponse(message: string, userId: string): Promise<AtlasChatResponse> {
  if (identityChat.test(message.trim())) {
    return {
      reply:
        "I'm Atlas, your assistant. I can help with shopping, travel, food, rides, and appointments — just ask (for example, “find me a hotel in Paris” or “order biryani”).",
      mode: "demo",
      toolsUsed: [],
    };
  }

  const domain = domainForText(message);

  if (!domain) {
    return {
      reply:
        "I'm Atlas, your assistant. I can help with shopping, travel, food, rides, and appointments — just ask, or chat with me about anything.",
      mode: "demo",
      toolsUsed: [],
    };
  }

  // Food has its own orchestration that knows to resolve the delivery address
  // before doing anything address-bound (searching restaurants, loading menus).
  // Route demo food requests through it so the saved-address list is shown
  // instead of a raw `search_restaurants` call that fails without an addressId.
  if (domain === "food") {
    const { getFoodSession } = await import("@/lib/atlas/mcp/food-session");
    const { ensureAddress } = await import("@/lib/atlas/mcp/food-service");

    const session = getFoodSession(userId);
    const result = session.address
      ? await (await import("@/lib/atlas/mcp/food-service")).discoverRestaurants(userId, message)
      : await ensureAddress(userId);

    return { reply: result.reply, mode: "demo", toolsUsed: ["Swiggy"] };
  }

  const result = await routeToolCall(domain, "search", { domain, request: message });

  if (result) {
    return { reply: result.message, mode: "demo", toolsUsed: ["MCP"] };
  }

  return {
    reply:
      "I'm Atlas, your assistant. I can help with that — connect an MCP service for this domain and I'll search and prepare actions for your approval.",
    mode: "demo",
    toolsUsed: [],
  };
}
