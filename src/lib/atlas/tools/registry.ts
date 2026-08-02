import "server-only";

import type { LlmTool } from "@/lib/atlas/llm/types";
import { routeGlobalToolCall, routeToolCall, type McpCallResult } from "@/lib/atlas/mcp/router";
import { createApproval } from "@/lib/atlas/approvals/service";
import {
  cancelOrder,
  checkout,
  discoverRestaurants,
  ensureAddress,
  loadMenu,
  searchMenuItems,
  selectPayment,
  selectRestaurant,
  showCart,
  updateCart,
  type FoodResult,
} from "@/lib/atlas/mcp/food-service";
import { getFoodSession } from "@/lib/atlas/mcp/food-session";
import { foodLog } from "@/lib/atlas/mcp/food-log";
import { executeMcpTool, isMcpToolName, getDynamicMcpTools } from "@/lib/atlas/mcp/tools";
import type { AtlasActionDomain, AtlasPendingAction, AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import type { Capability } from "@/lib/atlas/planner/planner";

const ACTION_DOMAINS: AtlasActionDomain[] = ["shopping", "travel", "food", "rides", "appointments"];

export interface ToolContext {
  userId: string;
  history: { role: "user" | "assistant"; text: string }[];
  domain?: AtlasActionDomain;
}

export interface ToolExecResult {
  message: string;
  data: unknown;
  action?: AtlasPendingAction;
  usedGateway: boolean;
  /** True when the tool left a question/prompt for the user and the conversation
   *  should pause (e.g. "pick a delivery address", "which restaurant?"). When set,
   *  the agent relays the message verbatim instead of asking the model to
   *  re-summarise it, which previously dropped or truncated the list. */
  awaitingUser?: boolean;
}

export interface AtlasTool {
  name: string;
  description: string;
  parameters: LlmTool["parameters"];
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult>;
}

function stringArg(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Keywords that let us infer the Atlas action domain from free-form text when
// the model omits or guesses the `domain` argument.
const DOMAIN_INFERENCE: { domain: AtlasActionDomain; pattern: RegExp }[] = [
  { domain: "food", pattern: /\b(food|restaurant|restaurants|biryani|biriyani|dinner|lunch|breakfast|swiggy|zomato|deliver(?:y|ed)?|menu|pizza|burger|sushi|meal|snack|eat|cuisine|hungry|craving)\b/i },
  { domain: "travel", pattern: /\b(flight|flights|hotel|hotels|trip|trips|travel|book(ing)?\s+(a\s+)?(flight|hotel|trip)|vacation|itinerary|airbnb|airline)\b/i },
  { domain: "rides", pattern: /\b(ride|rides|uber|ola|taxi|cab|car\s+(ride|booking)|book\s+a\s+ride|pickup|drop|chauffeur)\b/i },
  { domain: "appointments", pattern: /\b(appointment|appointments|doctor|salon|spa|meeting|book\s+(a\s+)?(slot|appointment)|schedule\s+(a\s+)?(visit|call)|dentist|consultation)\b/i },
  { domain: "shopping", pattern: /\b(buy|purchase|shop|shopping|cart|checkout|product|amazon|flipkart|order)\b/i },
];

function inferDomain(text: string): AtlasActionDomain {
  const lower = text.toLowerCase();
  for (const entry of DOMAIN_INFERENCE) {
    if (entry.pattern.test(lower)) return entry.domain;
  }
  return "shopping";
}

function domainArg(value: unknown, fallbackText = ""): AtlasActionDomain {
  const candidate = stringArg(value);
  if ((ACTION_DOMAINS as string[]).includes(candidate)) return candidate as AtlasActionDomain;
  // Fall back to inferring the domain from the request text so a missing or
  // wrong `domain` argument (e.g. the model sends only `query`) still routes
  // to the correct MCP server.
  return inferDomain(fallbackText);
}

const webSearchTool: AtlasTool = {
  name: "web_search",
  description:
    "Search the public web for current information, facts, news, or anything that benefits from live results. Use this freely for general knowledge questions, recent events, or when a fetch would improve the answer. Never use it for bookings, orders, or payments.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
    },
    required: ["query"],
  },
  async execute(args) {
    const query = stringArg(args.query);
    const serper = await import("@/lib/atlas/server/serper");
    const { formatSerperResults, serperSearch } = serper;

    // Serper is the primary web search when a key is configured.
    const response = await serperSearch(query);

    if (response.results.length > 0) {
      return {
        message: formatSerperResults(response),
        data: response.results,
        usedGateway: true,
      };
    }

    // Fall back to the MCP web-search gateway (parallel.ai / connected servers).
    const result: McpCallResult | null = await routeGlobalToolCall("search", { query });

    if (!result) {
      return {
        message: "I couldn't reach the web search service right now, but I'll answer from what I know.",
        data: { query },
        usedGateway: false,
      };
    }

    return { message: result.message, data: result.data, usedGateway: true };
  },
};

const atlasSearchTool: AtlasTool = {
  name: "atlas_search",
  description:
    "Search connected Atlas services (shopping, travel, food, rides, appointments) for addresses, menus, restaurants, hotels, options, availability, or prices. ALWAYS call this first for any request in those domains, even when the user has not provided a full address or item — the service returns what it can (for example saved addresses) so the conversation can continue. Required: domain and request.",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", enum: ACTION_DOMAINS, description: "The Atlas domain to search (shopping, travel, food, rides, appointments). If omitted, Atlas infers it from the request text." },
      request: { type: "string", description: "The user's request, including any useful constraints (dish, cuisine, city, etc.). Partial info is fine." },
      query: { type: "string", description: "Alias for `request` — the search query text. Use this or `request`." },
    },
    required: ["request"],
  },
  async execute(args, ctx) {
    const request = stringArg(args.request, stringArg(args.query));
    const domain = domainArg(args.domain, request);

    // Food has its own granular tool suite (food_set_address, food_find_restaurants,
    // ...). Route a stray atlas_search into it so the flow still starts correctly.
    if (domain === "food") {
      const session = getFoodSession(ctx.userId);
      const result = session.address
        ? await discoverRestaurants(ctx.userId, request)
        : await ensureAddress(ctx.userId);
      return toToolResult(result);
    }

    const result = await routeToolCall(domain, "search", { domain, request, query: request });

    if (!result) {
      return {
        message: `I can help with ${domain}, but no connected service responded yet.`,
        data: { domain, request },
        usedGateway: false,
      };
    }

    return { message: result.message, data: result.data, usedGateway: true };
  },
};

const atlasPrepareApprovalTool: AtlasTool = {
  name: "atlas_prepare_approval",
  description:
    "Prepare an approval card ONLY after the user has clearly requested or selected an order, booking, or action through Atlas. Never execute the action yourself.",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", enum: ACTION_DOMAINS, description: "The Atlas domain for the action." },
      request: { type: "string", description: "The exact request to place or book." },
    },
    required: ["domain", "request"],
  },
  async execute(args, ctx) {
    const request = stringArg(args.request, stringArg(args.query));
    const domain = domainArg(args.domain, request);
    const action: AtlasPendingAction = await createApproval(domain, request, ctx.userId);

    return {
      message: "I prepared the next step for your review.",
      data: { domain, request },
      action,
      usedGateway: false,
    };
  },
};

// --------------------------------------------------------------------------
// Food ordering tools.
//
// The LLM orchestrates the conversation by choosing which of these to call;
// the FoodSession (server-side) owns every Swiggy identifier, the live cart and
// all recovery behaviour. The model never handles raw IDs — it passes along the
// user's own words ("the second one", "make it two") and these resolve them.
// --------------------------------------------------------------------------

function toToolResult(result: FoodResult): ToolExecResult {
  return {
    message: result.reply,
    data: { awaitingUser: result.awaitingUser },
    action: result.action,
    usedGateway: true,
    awaitingUser: result.awaitingUser,
  };
}

function foodTool(
  name: string,
  description: string,
  parameters: LlmTool["parameters"],
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<FoodResult>
): AtlasTool {
  return {
    name,
    description,
    parameters,
    async execute(args, ctx) {
      foodLog("tool.call", { tool: name, args: JSON.stringify(args).slice(0, 160) });
      return toToolResult(await run(args, ctx));
    },
  };
}

const noArgs: LlmTool["parameters"] = { type: "object", properties: {}, required: [] };

const foodSetAddressTool = foodTool(
  "food_set_address",
  "Show or set the delivery address. Call with no arguments to list saved addresses; call with `reference` when the user names or numbers an address. Only call this ONCE at the start — do NOT call it again if the conversation already confirms an address (e.g. 'Delivering to Chennai').",
  {
    type: "object",
    properties: {
      reference: { type: "string", description: "How the user referred to the address, in their words. Omit to list addresses." },
    },
    required: [],
  },
  (args, ctx) => ensureAddress(ctx.userId, stringArg(args.reference) || undefined)
);

const foodFindRestaurantsTool = foodTool(
  "food_find_restaurants",
  "Search nearby restaurants that deliver a dish or cuisine. Returns name, rating, delivery ETA, and price. Call this when the user says what they want to eat (e.g. 'chicken biryani', 'pizza'). Do NOT list dishes before the user has picked a restaurant.",
  {
    type: "object",
    properties: {
      dish: { type: "string", description: "The dish or cuisine the user asked for, e.g. 'chicken biryani'." },
    },
    required: ["dish"],
  },
  (args, ctx) => discoverRestaurants(ctx.userId, stringArg(args.dish) || stringArg(args.query) || stringArg(args.q))
);

const foodSelectRestaurantTool = foodTool(
  "food_select_restaurant",
  "Choose a restaurant from the list just shown and automatically load its menu. Pass the user's words ('Meghana', 'the second one', '1').",
  {
    type: "object",
    properties: {
      reference: { type: "string", description: "How the user referred to the restaurant." },
    },
    required: ["reference"],
  },
  (args, ctx) => selectRestaurant(ctx.userId, stringArg(args.reference))
);

const foodBrowseMenuTool = foodTool(
  "food_browse_menu",
  "Show the CURRENT restaurant's menu, grouped by category with prices, veg/non-veg and availability. Use `page` to show more categories when the user asks for more options. Use `query` ONLY to search for a specific dish WITHIN the already-selected restaurant. NEVER use this to discover restaurants — if the user has not yet picked a restaurant, call food_find_restaurants with the dish instead.",
  {
    type: "object",
    properties: {
      page: { type: "number", description: "Menu page for pagination. Defaults to 1; increment when the user wants more." },
      query: { type: "string", description: "Optional dish name to search for WITHIN the current restaurant's menu. Do not use this for finding restaurants." },
    },
    required: [],
  },
  (args, ctx) => {
    const query = stringArg(args.query);
    if (query) return searchMenuItems(ctx.userId, query);
    const page = typeof args.page === "number" ? args.page : 1;
    return loadMenu(ctx.userId, page);
  }
);

const foodUpdateCartTool = foodTool(
  "food_update_cart",
  "Update the cart using the user's own words. Handles adding ('add Andhra chicken biryani', 'two gulab jamuns'), removing ('remove the Coke'), quantity changes ('make it two', 'add another biryani'), replacing ('replace it with mutton biryani') and clearing ('empty the cart'). Pass the instruction verbatim — do not translate it into IDs.",
  {
    type: "object",
    properties: {
      instruction: { type: "string", description: "The user's cart instruction, in their own words." },
    },
    required: ["instruction"],
  },
  (args, ctx) => updateCart(ctx.userId, stringArg(args.instruction))
);

const foodViewCartTool = foodTool(
  "food_view_cart",
  "Show the current cart with live items and totals. Use when the user asks what's in their cart.",
  noArgs,
  (_args, ctx) => showCart(ctx.userId)
);

const foodCheckoutTool = foodTool(
  "food_checkout",
  "Produce the final order summary and the approval card the user must confirm. Call this ONLY when the user says they are done adding items (e.g. 'checkout', 'that's all', 'place the order'). This never places the order by itself — the user must confirm the approval card.",
  noArgs,
  (_args, ctx) => checkout(ctx.userId)
);

const foodSelectPaymentTool = foodTool(
  "food_select_payment",
  "Show or set the payment method for the order (e.g. 'Google Pay', 'cash').",
  {
    type: "object",
    properties: {
      reference: { type: "string", description: "The payment method the user chose. Omit to list options." },
    },
    required: [],
  },
  (args, ctx) => selectPayment(ctx.userId, stringArg(args.reference))
);

const foodCancelOrderTool = foodTool(
  "food_cancel_order",
  "Cancel the in-progress food order and clear the cart. Use when the user says 'cancel the order' or 'never mind'.",
  noArgs,
  (_args, ctx) => cancelOrder(ctx.userId)
);

const foodTools: AtlasTool[] = [
  foodSetAddressTool,
  foodFindRestaurantsTool,
  foodSelectRestaurantTool,
  foodBrowseMenuTool,
  foodUpdateCartTool,
  foodViewCartTool,
  foodCheckoutTool,
  foodSelectPaymentTool,
  foodCancelOrderTool,
];

const tools: AtlasTool[] = [webSearchTool, atlasSearchTool, atlasPrepareApprovalTool, ...foodTools];

export function getRegisteredTools(): AtlasTool[] {
  return tools;
}

/**
 * Maps a capability to the tool names that can satisfy it. This is the single
 * place that binds capabilities to tools — adding a new MCP-backed capability
 * means extending this map, not the planner. Actionable capabilities also expose
 * the approval tool so the LLM can prepare user-confirmed actions.
 */
const CAPABILITY_TOOLS: Record<Exclude<Capability, "none">, string[]> = {
  food: foodTools.map((tool) => tool.name),
  travel: ["atlas_search", "atlas_prepare_approval"],
  shopping: ["atlas_search", "atlas_prepare_approval"],
  rides: ["atlas_search", "atlas_prepare_approval"],
  calendar: ["atlas_search", "atlas_prepare_approval"],
  communication: ["atlas_search", "atlas_prepare_approval"],
  web: ["web_search"],
};

/**
 * Resolve the tool schemas that should be exposed to the LLM for the given
 * capabilities. Static Atlas tools are merged with dynamic MCP tools whose
 * discovered roles/capabilities match. Tools are always returned with the
 * intent that the LLM decides whether to call them (tool_choice "auto" is
 * applied by the caller).
 */
export async function getToolsForCapabilities(capabilities: Capability[]): Promise<LlmTool[]> {
  const names = new Set<string>();
  for (const cap of capabilities) {
    if (cap === "none") continue;
    for (const name of CAPABILITY_TOOLS[cap] ?? []) names.add(name);
  }

  const staticTools = tools
    .filter((tool) => names.has(tool.name))
    .map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));

  // Suppress dynamic MCP tools for capabilities that have full static tool
  // coverage. Food uses the orchestrated food_* tools which call Swiggy
  // internally — exposing the raw mcp__swiggy_food__* tools alongside them
  // causes the LLM to pick the wrong one.
  const dynamicCaps = capabilities.filter((cap) => cap !== "food");
  const dynamicTools = await getDynamicMcpTools(dynamicCaps);

  return [...staticTools, ...dynamicTools];
}

export async function getToolSchemas(_domain?: string): Promise<LlmTool[]> {
  // Food is driven by the server-side `food_order` orchestrator rather than
  // raw MCP tools, so we keep the tool surface small and deterministic:
  // web_search, atlas_search, atlas_prepare_approval, food_order.
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecResult> {
  // Dynamic MCP tools (discovered from connected servers) route by name.
  if (isMcpToolName(name)) {
    try {
      const result = await executeMcpTool(name, args);
      return { message: result.message, data: result.data, usedGateway: true };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : "The connected MCP tool failed.",
        data: {},
        usedGateway: false,
      };
    }
  }

  const tool = tools.find((entry) => entry.name === name);

  if (!tool) {
    return { message: "That tool is not available to Atlas.", data: {}, usedGateway: false };
  }

  return tool.execute(args, ctx);
}
