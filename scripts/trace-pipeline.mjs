/**
 * Atlas pipeline tracer.
 * Replays the 3-turn food conversation through each stage and logs the trace.
 * Read-only: does not modify application code.
 */
import Database from "better-sqlite3";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const db = new Database("dev.db", { readonly: true });

// Load the REAL shared conversation-state resolver used by the app.
const work = mkdtempSync(join(tmpdir(), "atlas-trace-"));
const stateJs = ts.transpileModule(
  readFileSync("src/lib/atlas/conversation/state.ts", "utf8")
    .replace(/^import "server-only";?\s*$/gm, "")
    .replace(/^import type .*$/gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }
).outputText;
const statePath = join(work, "state.mjs");
writeFileSync(statePath, stateJs);
const { resolveConversationState } = await import(statePath);

const log = (...a) => console.log(...a);
const hr = (t) => log("\n" + "=".repeat(78) + "\n" + t + "\n" + "=".repeat(78));

// ---------------------------------------------------------------------------
// Stage 1 mirrors: planner + intent (ported verbatim from src)
// ---------------------------------------------------------------------------
const actionVerbs =
  /\b(buy|order|book|reserve|schedule|place\s+an?\s+order|checkout|purchase|pay\s+for|confirm|send|email|message|create|add|set|update|delete|search|find|compare|book|cancel)\b/i;
const taskConnectors = /\b(then|after that|and then|next|subsequently|finally|also|followed by)\b/i;
const clarificationSignals = /\b(what|which|when|where|who|how much|how many|can you|should i|do you want|confirm|clarify)\b/i;
const identityChat =
  /^\s*(who\s+are\s+you|introduce\s+yourself|what\s+are\s+you|what\s+is\s+atlas|tell\s+me\s+about\s+(you|atlas|yourself)|what\s+can\s+you\s+do|your\s+name|are\s+you\s+(a\s+)?(bot|assistant|ai)|describe\s+yourself)\b/i;
const greetingChat =
  /^\s*(hi|hello|hey|yo|hii|heya|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|sup|thanks|thank\s+you|ok|okay|cool|nice|who\s+are\s+you|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself)\b/i;
const foodHint =
  /\b(hungry|starving|famished|craving|feel\s+like|in\s+the\s+mood\s+for|want\s+something\s+to\s+eat|want\s+(to|some)?\s*(food|snack|bite)|what\s+should\s+i\s+(eat|have|get)|not\s+sure\s+what\s+to\s+eat|need\s+(a|something|some)\s+(food|snack|bite))\b/i;

function analyzeIntent(message) {
  const text = message.trim();
  if (text.length === 0) return { kind: "chat", confidence: "high", reason: "empty" };
  if (identityChat.test(text)) return { kind: "chat", confidence: "high", reason: "identity question" };
  if (foodHint.test(text)) return { kind: "chat", confidence: "high", reason: "food hint — offer help, do not call tools yet" };
  if (taskConnectors.test(text) && actionVerbs.test(text))
    return { kind: "task", confidence: "medium", reason: "multi-step phrasing detected" };
  if (actionVerbs.test(text)) {
    if (clarificationSignals.test(text) && !text.includes("?") === false)
      return { kind: "clarify", confidence: "low", reason: "may need a missing detail" };
    return { kind: "tool", confidence: "medium", reason: "action verb present" };
  }
  if (clarificationSignals.test(text)) return { kind: "clarify", confidence: "low", reason: "question that may need a follow-up" };
  if (greetingChat.test(text) || text.split(/\s+/).length <= 4)
    return { kind: "chat", confidence: "medium", reason: "short greeting / small talk" };
  return { kind: "chat", confidence: "low", reason: "general conversation / knowledge" };
}

const CAPABILITY_KEYWORDS = [
  { capability: "food", pattern: /\b(food|restaurant|restaurants|biryani|biriyani|dinner|lunch|breakfast|swiggy|zomato|deliver(?:y|ed)?|menu|pizza|burger|sushi|meal|snack|eat|cuisine|hungry|craving|mcp)\b/i },
  { capability: "travel", pattern: /\b(flight|flights|hotel|hotels|trip|trips|travel|book(ing)?\s+(a\s+)?(flight|hotel|trip)|vacation|itinerary|airbnb|airline)\b/i },
  { capability: "shopping", pattern: /\b(buy|purchase|shop|shopping|cart|checkout|product|amazon|flipkart|order)\b/i },
  { capability: "rides", pattern: /\b(ride|rides|uber|ola|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop|chauffeur)\b/i },
  { capability: "calendar", pattern: /\b(appointment|appointments|schedule|meeting|book\s+(a\s+)?(slot|appointment)|salon|spa|dentist|consultation|calendar|remind\s+me|event)\b/i },
  { capability: "communication", pattern: /\b(email|e-mail|message|text|call|send|sms|whatsapp|slack|notify|tell\s+\w+)\b/i },
  { capability: "web", pattern: /\b(news|search|lookup|what\s+is|who\s+is|latest|current|weather|explain|how\s+(to|do)|why\s+|research)\b/i },
];

// Mirrors src/lib/atlas/planner/planner.ts, delegating to the shared resolver.
function plan(message, history = []) {
  const intent = analyzeIntent(message);
  const state = resolveConversationState(message, history);

  if (state.capabilities.length > 0) {
    return {
      capabilities: state.capabilities,
      intent,
      reason: state.reason,
      isContinuation: state.isContinuation,
    };
  }
  if (intent.kind === "chat") {
    return { capabilities: ["none"], intent, reason: "Conversational message — no capability required.", isContinuation: false };
  }
  return { capabilities: ["web"], intent, reason: "No specific capability matched — allowing web lookup.", isContinuation: false };
}

// detectDomain (agent)
const domainKeywords = {
  travel: /\b(flight|flights|hotel|hotels|trip|trips|travel|book(ing)?\s+(a\s+)?(flight|hotel|trip)|vacation|itinerary|airbnb|airline)\b/i,
  food: /\b(food|restaurant|restaurants|biryani|dinner|lunch|breakfast|swiggy|zomato|deliver(?:y|ed)?|menu|order\s+(food|from)|pizza|burger|sushi|meal|snack|eat|cuisine)\b/i,
  rides: /\b(ride|rides|uber|ola|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop|chauffeur)\b/i,
  appointments: /\b(appointment|appointments|doctor|salon|spa|meeting|book\s+(a\s+)?(slot|appointment)|schedule\s+(a\s+)?(visit|call)|dentist|consultation)\b/i,
  shopping: /\b(buy|purchase|shop|shopping|cart|checkout|product|amazon|flipkart|order\s+(a|the|some)?\s*\w+)\b/i,
};
function domainForText(text) {
  const lower = text.toLowerCase();
  for (const d of ["travel", "food", "rides", "appointments", "shopping"]) if (domainKeywords[d].test(lower)) return d;
  return null;
}
// Now delegates to the shared resolver (single source of truth).
function detectDomain(message, history) {
  return resolveConversationState(message, history).domain;
}

// Tool registry capability map
const CAPABILITY_TOOLS = {
  food: [
    "food_set_address",
    "food_find_restaurants",
    "food_select_restaurant",
    "food_browse_menu",
    "food_update_cart",
    "food_view_cart",
    "food_checkout",
    "food_select_payment",
    "food_cancel_order",
  ],
  travel: ["atlas_search", "atlas_prepare_approval"],
  shopping: ["atlas_search", "atlas_prepare_approval"],
  rides: ["atlas_search", "atlas_prepare_approval"],
  calendar: ["atlas_search", "atlas_prepare_approval"],
  communication: ["atlas_search", "atlas_prepare_approval"],
  web: ["web_search"],
};
function getToolNamesForCapabilities(caps) {
  const names = new Set();
  for (const c of caps) {
    if (c === "none") continue;
    for (const n of CAPABILITY_TOOLS[c] ?? []) names.add(n);
  }
  return [...names];
}

// extractToolCallFromContent (agent, verbatim behaviour)
function extractToolCallFromContent(content) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed !== "object" || parsed === null) return null;
    const name = typeof parsed.tool === "string" ? parsed.tool : typeof parsed.name === "string" ? parsed.name : "";
    if (!name) return null;
    const rawArgs = parsed.arguments ?? parsed.parameters ?? parsed.input ?? {};
    return { name, arguments: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool schemas (as sent to the LLM)
// ---------------------------------------------------------------------------
const ACTION_DOMAINS = ["shopping", "travel", "food", "rides", "appointments"];
const TOOL_DEFS = {
  web_search: {
    name: "web_search",
    description: "Search the public web for current information...",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  atlas_search: {
    name: "atlas_search",
    description: "Search connected Atlas services (shopping, travel, food, rides, appointments)...",
    parameters: {
      type: "object",
      properties: { domain: { type: "string", enum: ACTION_DOMAINS }, request: { type: "string" }, query: { type: "string" } },
      required: ["request"],
    },
  },
  atlas_prepare_approval: {
    name: "atlas_prepare_approval",
    description: "Prepare an approval card ONLY after the user has clearly selected an order...",
    parameters: {
      type: "object",
      properties: { domain: { type: "string", enum: ACTION_DOMAINS }, request: { type: "string" } },
      required: ["domain", "request"],
    },
  },
  food_set_address: {
    name: "food_set_address",
    description: "List or select the Swiggy delivery address. Required before searching for food.",
    parameters: { type: "object", properties: { reference: { type: "string" } }, required: [] },
  },
  food_find_restaurants: {
    name: "food_find_restaurants",
    description: "Search nearby restaurants delivering a dish. Returns name, rating, ETA and price.",
    parameters: { type: "object", properties: { dish: { type: "string" } }, required: ["dish"] },
  },
  food_select_restaurant: {
    name: "food_select_restaurant",
    description: "Pick a restaurant from the list and load its menu.",
    parameters: { type: "object", properties: { reference: { type: "string" } }, required: ["reference"] },
  },
  food_browse_menu: {
    name: "food_browse_menu",
    description: "Show the restaurant menu by category, or search a dish within it.",
    parameters: { type: "object", properties: { page: { type: "number" }, query: { type: "string" } }, required: [] },
  },
  food_update_cart: {
    name: "food_update_cart",
    description: "Add/remove/change quantity/replace/clear cart items using the user's own words.",
    parameters: { type: "object", properties: { instruction: { type: "string" } }, required: ["instruction"] },
  },
  food_view_cart: {
    name: "food_view_cart",
    description: "Show the live cart and totals.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  food_checkout: {
    name: "food_checkout",
    description: "Produce the order summary and approval card. Does not place the order.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  food_select_payment: {
    name: "food_select_payment",
    description: "Show or set the payment method.",
    parameters: { type: "object", properties: { reference: { type: "string" } }, required: [] },
  },
  food_cancel_order: {
    name: "food_cancel_order",
    description: "Cancel the in-progress order and clear the cart.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const BASE_SYSTEM_PROMPT = `You are Atlas, a warm, concise personal AI assistant. [...full prompt as in atlas-agent.ts...]
## Connected service tools (Swiggy food)
Food ordering uses granular tools: food_set_address -> food_find_restaurants -> food_select_restaurant -> food_browse_menu -> food_update_cart -> food_checkout.`;

// ---------------------------------------------------------------------------
// Model + MCP config from DB
// ---------------------------------------------------------------------------
const modelRow = db
  .prepare(
    `SELECT m.id, m.label, m.isDefault, c.provider, c.baseUrl, c.apiKey
     FROM ModelConfig m JOIN Credential c ON c.id = m.credentialId
     WHERE m.enabled = 1 ORDER BY m.isDefault DESC`
  )
  .get();

const mcpRows = db.prepare(`SELECT id,name,domain,enabled,url,token FROM McpServer`).all();

// ---------------------------------------------------------------------------
// Trace a single turn
// ---------------------------------------------------------------------------
async function traceTurn(turnNo, message, history) {
  hr(`TURN ${turnNo}  —  user: "${message}"`);

  // STAGE 1
  log("\n--- [1] INCOMING REQUEST ---");
  log("user message      :", JSON.stringify(message));
  log("conversation hist :", JSON.stringify(history));
  const domain = detectDomain(message, history);
  log("detected domain   :", domain);
  const p = plan(message, history);
  log("planner.intent    :", JSON.stringify(p.intent));
  log("planner.caps      :", JSON.stringify(p.capabilities));
  log("planner.contin.   :", p.isContinuation);
  log("planner.reason    :", p.reason);

  // STAGE 2
  log("\n--- [2] TOOL REGISTRY ---");
  const toolNames = getToolNamesForCapabilities(p.capabilities);
  log("capabilities      :", JSON.stringify(p.capabilities));
  log("tools selected    :", JSON.stringify(toolNames));
  const tools = toolNames.map((n) => TOOL_DEFS[n]).filter(Boolean);
  const useTools = tools.length > 0;
  log("useTools          :", useTools);
  log("tool_choice       :", useTools ? "auto" : "none");
  log("schemas → LLM     :", JSON.stringify(tools.map((t) => ({ name: t.name, required: t.parameters.required })), null, 2));

  // STAGE 3
  log("\n--- [3] LLM REQUEST (NVIDIA) ---");
  const messages = [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: message },
  ];
  const body = {
    model: modelRow.id,
    messages,
    tools: useTools ? tools.map((t) => ({ type: "function", function: t })) : undefined,
    tool_choice: useTools ? "auto" : undefined,
    temperature: 0.4,
  };
  log("model             :", body.model);
  log("provider/baseUrl  :", modelRow.provider, "→", modelRow.baseUrl || "https://integrate.api.nvidia.com/v1");
  log("tools in payload  :", body.tools ? body.tools.map((t) => t.function.name) : "(none — omitted)");
  log("tool_choice       :", body.tool_choice ?? "(omitted)");
  log("messages          :", JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content.slice(0, 120) })), null, 2));

  // STAGE 4
  log("\n--- [4] LLM RESPONSE (raw) ---");
  const baseUrl = modelRow.baseUrl || "https://integrate.api.nvidia.com/v1";
  let raw;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${modelRow.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      log("HTTP ERROR", res.status, t.slice(0, 600));
      return { message, reply: "(error)" };
    }
    raw = await res.json();
  } catch (e) {
    log("FETCH FAILED:", e.message);
    return { message, reply: "(error)" };
  }

  const choice = raw.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  log("finish_reason     :", choice.finish_reason);
  log("native tool_calls :", JSON.stringify(msg.tool_calls ?? null));
  log("reasoning_content :", (msg.reasoning_content ?? "").slice(0, 300) || "(none)");
  log("assistant content :", JSON.stringify(msg.content));

  const hasNative = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
  log("→ emitted native  :", hasNative);
  log("→ emitted JSON txt:", !hasNative && /\{[\s\S]*\}/.test(msg.content ?? ""));

  // STAGE 5
  log("\n--- [5] TOOL EXTRACTION ---");
  let extracted = null;
  if (hasNative) {
    log("parser: NATIVE tool_calls → accepted");
    extracted = { name: msg.tool_calls[0].function.name, arguments: msg.tool_calls[0].function.arguments };
  } else {
    log("parser: native tool_calls → EMPTY, falling back");
    extracted = extractToolCallFromContent(msg.content ?? "");
    if (extracted) log("parser: extractToolCallFromContent → extracted", JSON.stringify(extracted));
    else log("parser: extractToolCallFromContent → returned null (no JSON object / no `tool` key)");
  }
  log("EXTRACTED         :", JSON.stringify(extracted));

  // STAGE 6/7
  log("\n--- [6/7] TOOL DISPATCH / MCP ROUTER ---");
  if (!extracted) {
    log("Router NOT called: no tool call was extracted.");
    log("→ Atlas returns first.content verbatim to the UI.");
    log("→ UI RECEIVES:", JSON.stringify(msg.content));
  } else {
    const known = ["web_search", "atlas_search", "atlas_prepare_approval", "food_set_address", "food_find_restaurants", "food_select_restaurant", "food_browse_menu", "food_update_cart", "food_view_cart", "food_checkout", "food_select_payment", "food_cancel_order"];
    const registered = known.includes(extracted.name);
    log("tool name         :", extracted.name);
    log("registered in reg :", registered);
    log("exposed this turn :", toolNames.includes(extracted.name));
    if (!registered) log('→ executeTool returns "That tool is not available to Atlas." — MCP router NEVER called.');
    else log("→ would dispatch to tool.execute()");
  }

  return { message, reply: msg.content ?? "", extracted, hasNative, finish: choice.finish_reason };
}

// ---------------------------------------------------------------------------
hr("ATLAS PIPELINE TRACE");
log("Active model row  :", JSON.stringify({ id: modelRow.id, provider: modelRow.provider, isDefault: modelRow.isDefault, baseUrl: modelRow.baseUrl }));
log("\nMCP servers in DB :");
for (const r of mcpRows) log(`  - ${r.name} | domain=${r.domain} | enabled=${r.enabled} | url=${r.url} | token=${r.token ? "present" : "MISSING"}`);

const turns = ["I am hungry", "chicken biriyani", "yes"];
const history = [];
for (let i = 0; i < turns.length; i++) {
  const r = await traceTurn(i + 1, turns[i], [...history]);
  history.push({ role: "user", text: turns[i] });
  // P3: a tool turn must never be stored as an empty string, otherwise the next
  // turn loses the conversational state. Mirror summarizeToolTurn().
  const assistantText =
    (r.reply && r.reply.trim()) ||
    (r.extracted ? `(${r.extracted.name} completed)` : "I'm ready to help.");
  history.push({ role: "assistant", text: assistantText });
}

rmSync(work, { recursive: true, force: true });

hr("END OF TRACE");
