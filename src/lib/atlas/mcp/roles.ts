import "server-only";

import type { McpToolDefinition } from "@/lib/atlas/server/mcp-client";

/**
 * Role-based MCP classification.
 *
 * Instead of assigning every MCP server a single business domain by hand, Atlas
 * classifies a server by ROLE from the tools it actually exposes. Roles describe
 * how a server should be used (knowledge source, browser, memory, agent
 * capability, ...). A server can belong to many roles, and individual tools are
 * classified to capability-level categories so agents can reason over tools.
 */

/** High-level roles an MCP server can play. */
export type McpRole =
  | "agent" // Agent capability: food, travel, shopping, calendar, communication, rides
  | "knowledge" // Web search, documentation, knowledge base
  | "memory" // Long-term memory provider
  | "automation" // Automation provider (workflows, tasks, triggers)
  | "development" // Development tools (git, repos, CI)
  | "filesystem" // File access
  | "browser" // Browsing / scraping
  | "utility" // General-purpose helpers
  | "multi"; // Serves several unrelated roles

export const ALL_MCP_ROLES: McpRole[] = [
  "agent",
  "knowledge",
  "memory",
  "automation",
  "development",
  "filesystem",
  "browser",
  "utility",
  "multi",
];

export const ROLE_LABELS: Record<McpRole, string> = {
  agent: "Agent Capability",
  knowledge: "Knowledge Source",
  memory: "Memory Provider",
  automation: "Automation Provider",
  development: "Development Tools",
  filesystem: "Filesystem",
  browser: "Browser",
  utility: "General Utility",
  multi: "Multi-purpose",
};

/** Capability-level categories for a single tool. */
export type ToolCategory =
  | "food"
  | "travel"
  | "shopping"
  | "rides"
  | "calendar"
  | "communication"
  | "web"
  | "knowledge"
  | "browser"
  | "memory"
  | "automation"
  | "development"
  | "filesystem"
  | "utility";

export const ALL_TOOL_CATEGORIES: ToolCategory[] = [
  "food",
  "travel",
  "shopping",
  "rides",
  "calendar",
  "communication",
  "web",
  "knowledge",
  "browser",
  "memory",
  "automation",
  "development",
  "filesystem",
  "utility",
];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  food: "Food",
  travel: "Travel",
  shopping: "Shopping",
  rides: "Rides",
  calendar: "Calendar",
  communication: "Communication",
  web: "Web",
  knowledge: "Knowledge",
  browser: "Browser",
  memory: "Memory",
  automation: "Automation",
  development: "Development",
  filesystem: "Filesystem",
  utility: "Utility",
};

/** Capability categories that map to the planner's Capability type. */
export const AGENT_CAPABILITIES: ToolCategory[] = [
  "food",
  "travel",
  "shopping",
  "rides",
  "calendar",
  "communication",
];

/** Roles whose tools the natural chat agent should receive automatically. */
export const CHAT_ROLES: McpRole[] = [
  "knowledge",
  "utility",
  "browser",
  "filesystem",
  "memory",
];

/** Category rules split by whether they should match the tool NAME (strong) or
 *  only the DESCRIPTION (weak). Names like `search_restaurants` or `send_email`
 *  are unambiguous; descriptions of Swiggy-style tools are full of orchestration
 *  words ("must call get_addresses", "update_food_cart calls") that would
 *  otherwise cause false positives. */
const TOOL_RULES: { category: ToolCategory; patterns: RegExp[]; namePatterns: RegExp[] }[] = [
  {
    category: "food",
    namePatterns: [/restaurant|menu|food|dish|cart|order|cook|meal|eat|recipe|cuisine|biryani|checkout.*food/i],
    patterns: [
      /food|restaurant|restaurants|menu|dish|cuisine|biryani|meal|snack|eatery|kitchen|deliver.*(food|meal|dish)|search.*(restaurant|dish|food)/i,
    ],
  },
  {
    category: "travel",
    namePatterns: [/(?<![\w-])flight\b|hotel|trip|travel|booking|itinerary|stay|vacation|airline/i],
    patterns: [/(?<![\w-])flight\b|hotel|hotels|trip|itinerary|travel|stay|vacation|booking.*(flight|hotel)|airline/i],
  },
  {
    category: "shopping",
    namePatterns: [/product|cart|checkout|shop|shopping|price|catalog|store|inventory|buy|purchase/i],
    patterns: [/product|cart|checkout|shop|shopping|price|catalog|store|inventory/i],
  },
  {
    category: "rides",
    namePatterns: [/ride|taxi|cab|uber|pickup|dropoff|chauffeur|route/i],
    patterns: [/ride|rides|taxi|cab|pickup|drop\s*off|chauffeur/i],
  },
  {
    category: "calendar",
    namePatterns: [/calendar|event|schedule|appointment|meeting|reminder|booking.*slot|availability/i],
    patterns: [/calendar|event|schedule|appointment|meeting|reminder|slot|availability/i],
  },
  {
    category: "communication",
    namePatterns: [/email|mail|message|sms|whatsapp|slack|notify|notification|phone.*call|send.*(message|email)/i],
    patterns: [/email|e-?mail|message|sms|whatsapp|slack|notify|notification|send\s+.*(message|email)|text\s+(him|her|them|mom|dad)/i],
  },
  {
    category: "web",
    namePatterns: [/search_web|web_search|search.*web|google|bing|duckduckgo/i],
    patterns: [/search.*web|web.*search|internet|query/i],
  },
  {
    category: "knowledge",
    namePatterns: [/knowledge|document|docs|article|wiki|reference|faq|research|summarize|learn/i],
    patterns: [/knowledge|documentation|docs|article|wiki|reference|faq|research|read.*(page|url|document)|summarize/i],
  },
  {
    category: "browser",
    namePatterns: [/browser|navigate|browse.*(url|page|web)|open.*url|screenshot|scrape|crawl/i],
    patterns: [/browser|navigate|browse.*(url|page|web)|open.*(url|page|link)|url.*(fetch|open|load)|screenshot|scrape|dom/i],
  },
  {
    category: "memory",
    namePatterns: [/memory|remember|recall|forget/i],
    patterns: [/memory|remember|recall|store.*fact|retrieve.*(fact|memory)|forget/i],
  },
  {
    category: "automation",
    namePatterns: [/automate|automation|workflow|trigger|cron|scheduler|job/i],
    patterns: [/automate|automation|workflow|trigger|cron|schedule.*job|run.*(job|task|script)/i],
  },
  {
    category: "development",
    namePatterns: [/\bgit\b|github|\brepo\b|repository|commit|branch|pull.?request|deploy|compile|lint/i],
    patterns: [/\bgit\b|github|\brepo\b|repository|pull.?request|commit|branch|build|deploy|lint|compile|issue/i],
  },
  {
    category: "filesystem",
    namePatterns: [/filesystem|read_file|write_file|file.*(read|write|list)|directory|dir\b/i],
    patterns: [/filesystem|read.*(file|directory)|write.*(file|directory)|list.*directory/i],
  },
  {
    category: "utility",
    namePatterns: [/utility|helper|format|parse|encode|decode|hash|crypto|math|calculate|convert|uuid|json/i],
    patterns: [/utility|helper|format|parse|encode|decode|hash|crypto|math|calculate|convert|uuid|json|http\b|request/i],
  },
];

function classifyTool(tool: McpToolDefinition): ToolCategory[] {
  const name = tool.name.toLowerCase();
  const description = tool.description.toLowerCase();

  // Name matches are authoritative — the tool's own name is the clearest signal
  // and never contains orchestration noise from the description.
  const fromName = new Set<ToolCategory>();
  for (const rule of TOOL_RULES) {
    if (rule.namePatterns.some((pattern) => pattern.test(name))) {
      fromName.add(rule.category);
    }
  }

  if (fromName.size > 0) {
    return Array.from(fromName);
  }

  // Description fallback. Domain capabilities dominate; generic categories are
  // kept only when no capability was named.
  const found = new Set<ToolCategory>();
  for (const rule of TOOL_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(description))) {
      found.add(rule.category);
    }
  }

  const domainHits = Array.from(found).filter((category) => AGENT_CAPABILITIES.includes(category));

  if (domainHits.length > 0) {
    return domainHits;
  }

  // A tool with no signal is still generally useful.
  if (found.size === 0) {
    found.add("utility");
  }

  return Array.from(found);
}

export interface McpClassification {
  /** High-level roles inferred for the server. */
  roles: McpRole[];
  /** Per-tool capability categories. */
  toolRoles: Record<string, ToolCategory[]>;
  /** Agent capabilities present across the server's tools. */
  capabilities: ToolCategory[];
  /** Primary legacy domain hint (e.g. "food") used by existing flows. */
  domain: string;
}

/**
 * Infer a server's roles + tool classifications from its discovered tools.
 * Only tool metadata (names + descriptions) is used — never the URL.
 */
export function classifyMcpServer(tools: McpToolDefinition[]): McpClassification {
  const toolRoles: Record<string, ToolCategory[]> = {};
  const roleSet = new Set<McpRole>();
  const capabilitySet = new Set<ToolCategory>();

  for (const tool of tools) {
    const categories = classifyTool(tool);
    toolRoles[tool.name] = categories;

    for (const category of categories) {
      if (AGENT_CAPABILITIES.includes(category)) {
        roleSet.add("agent");
        capabilitySet.add(category);
      } else {
        switch (category) {
          case "knowledge":
          case "web":
            roleSet.add("knowledge");
            break;
          case "memory":
            roleSet.add("memory");
            break;
          case "automation":
            roleSet.add("automation");
            break;
          case "development":
            roleSet.add("development");
            break;
          case "filesystem":
            roleSet.add("filesystem");
            break;
          case "browser":
            roleSet.add("browser");
            break;
          case "utility":
            roleSet.add("utility");
            break;
          default:
            break;
        }
      }
    }
  }

  const roles = Array.from(roleSet);

  // A domain agent (food, travel, ...) subsumes incidental utility/generic tools
  // that belong to its own flow (e.g. "check payment status" during ordering).
  if (roles.includes("agent") && roles.includes("utility")) {
    roles.splice(roles.indexOf("utility"), 1);
  }

  // Multi-purpose when a server covers several unrelated role families.
  if (roles.length > 2 || (roleSet.has("agent") && roles.length >= 2)) {
    if (!roles.includes("multi")) roles.push("multi");
  }

  if (roles.length === 0) {
    roles.push("utility");
  }

  // Legacy domain hint: pick the dominant agent capability, else default.
  const capabilities = Array.from(capabilitySet);
  let domain = "shopping";

  if (capabilities.includes("food")) domain = "food";
  else if (capabilities.includes("travel")) domain = "travel";
  else if (capabilities.includes("rides")) domain = "rides";
  else if (capabilities.includes("calendar")) domain = "appointments";
  else if (capabilities.includes("shopping")) domain = "shopping";
  else if (capabilities.includes("communication")) domain = "appointments";

  return { roles, toolRoles, capabilities, domain };
}

/** True when the server's roles expose it to the natural chat agent. */
export function hasChatRole(roles: McpRole[]): boolean {
  return roles.some((role) => CHAT_ROLES.includes(role));
}

/** True when the server exposes tools for a given agent capability. */
export function hasCapability(capabilities: ToolCategory[], capability: string): boolean {
  return capabilities.includes(capability as ToolCategory);
}

/** Map an agent capability to the tool categories that satisfy it. */
export function capabilityCategories(capability: string): ToolCategory[] {
  switch (capability) {
    case "food":
      return ["food"];
    case "travel":
      return ["travel"];
    case "shopping":
      return ["shopping"];
    case "rides":
      return ["rides"];
    case "calendar":
      return ["calendar"];
    case "communication":
      return ["communication"];
    default:
      return [];
  }
}

/** Human labels for agent visibility in the admin UI. */
export function roleToAgentLabel(role: McpRole): string {
  switch (role) {
    case "knowledge":
    case "utility":
    case "browser":
    case "filesystem":
    case "memory":
      return "Natural Chat";
    case "agent":
      return "Task Agents";
    default:
      return ROLE_LABELS[role];
  }
}
