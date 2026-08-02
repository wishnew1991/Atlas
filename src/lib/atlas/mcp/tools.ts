import "server-only";

import type { LlmTool, LlmToolParameter } from "@/lib/atlas/llm/types";
import type { Capability } from "@/lib/atlas/planner/planner";
import type { AtlasMcpServer } from "@/lib/atlas/server/model-registry";
import type { McpToolDefinition } from "@/lib/atlas/server/mcp-client";
import { withMcpServer } from "@/lib/atlas/server/mcp-client";
import {
  getChatAgentServers,
  getServersForCapability,
  listServerTools,
  toServerConfig,
} from "./registry";
import { capabilityCategories } from "./roles";

const MCP_TOOL_PREFIX = "mcp__";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "server"
  );
}

export function mcpToolName(server: AtlasMcpServer, tool: McpToolDefinition): string {
  return `${MCP_TOOL_PREFIX}${slugify(server.name)}__${tool.name}`;
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX);
}

export interface McpToolRef {
  server: AtlasMcpServer;
  tool: McpToolDefinition;
}

/** Decode an `mcp__<server>__<tool>` name back to its server + tool. */
export async function resolveMcpToolRef(name: string): Promise<McpToolRef | null> {
  if (!isMcpToolName(name)) return null;

  const parts = name.slice(MCP_TOOL_PREFIX.length).split("__");
  const slug = parts[0];
  const toolName = parts.slice(1).join("__");

  if (!slug || !toolName) return null;

  const { getEnabledServers } = await import("./registry");
  const servers = await getEnabledServers();
  const server = servers.find((entry) => slugify(entry.name) === slug);

  if (!server) return null;

  const tools = await listServerTools(server);
  const tool = tools.find((entry) => entry.name === toolName);

  return tool ? { server, tool } : null;
}

/**
 * Convert an MCP tool definition into an LLM tool schema, keeping Atlas's own
 * built-in tools (web_search, atlas_search, ...) distinct via the mcp__ prefix.
 */
function toLlmTool(server: AtlasMcpServer, tool: McpToolDefinition): LlmTool {
  const input = tool.inputSchema ?? {};
  const properties = isRecord(input.properties) ? input.properties : {};
  const required = Array.isArray(input.required)
    ? input.required.filter((entry): entry is string => typeof entry === "string")
    : [];

  const parameters: LlmToolParameter = {
    type: "object",
    properties: toLlmProperties(properties),
    ...(required.length > 0 ? { required } : {}),
  };

  return {
    name: mcpToolName(server, tool),
    description: tool.description || `Call the ${tool.name} tool on ${server.name}.`,
    parameters,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toLlmProperties(properties: Record<string, unknown>): Record<string, LlmToolParameter> {
  const result: Record<string, LlmToolParameter> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!isRecord(value)) {
      result[key] = { type: "string" };
      continue;
    }

    const type = typeof value.type === "string" ? (value.type as LlmToolParameter["type"]) : "string";
    const param: LlmToolParameter = {
      type,
      description: typeof value.description === "string" ? value.description : undefined,
      enum: Array.isArray(value.enum) ? value.enum.filter((entry): entry is string => typeof entry === "string") : undefined,
    };

    if (isRecord(value.items)) {
      const itemType = typeof value.items.type === "string" ? (value.items.type as LlmToolParameter["type"]) : "string";
      param.items = { type: itemType };
    }

    if (type === "object" && isRecord(value.properties)) {
      param.properties = toLlmProperties(value.properties);
    }

    if (Array.isArray(value.required)) {
      param.required = value.required.filter((entry): entry is string => typeof entry === "string");
    }

    result[key] = param;
  }

  return result;
}

function toolMatchesCapability(
  tool: McpToolDefinition,
  server: AtlasMcpServer,
  capabilities: Capability[]
): boolean {
  if (server.global) return true;

  const desired = new Set(capabilities.flatMap((capability) => capabilityCategories(capability)));
  if (desired.size === 0) return false;

  const toolCategories = server.toolRoles?.[tool.name] ?? [];

  return toolCategories.some((category) => desired.has(category as never));
}

/**
 * Build the dynamic MCP tool set for a conversation turn.
 *
 * - Task capabilities (food, travel, shopping, ...) pull in tools from servers
 *   whose discovered tool classifications match that capability.
 * - Natural-chat servers (knowledge, browser, filesystem, memory, utility) are
 *   always included so Atlas can search the web, read files, browse, etc.
 * - Duplicate tool names across servers stay distinct via the mcp__ prefix.
 */
export async function getDynamicMcpTools(capabilities: Capability[]): Promise<LlmTool[]> {
  const chatServers = new Map<string, AtlasMcpServer>();
  for (const server of await getChatAgentServers()) {
    chatServers.set(server.id, server);
  }

  const servers = new Map<string, AtlasMcpServer>(chatServers);

  if (capabilities.length > 0) {
    for (const capability of capabilities) {
      for (const server of await getServersForCapability(capability)) {
        servers.set(server.id, server);
      }
    }
  }

  const tools: LlmTool[] = [];

  for (const server of Array.from(servers.values())) {
    let discovered: McpToolDefinition[];

    try {
      discovered = await listServerTools(server);
    } catch {
      continue;
    }

    const isChatServer = chatServers.has(server.id);

    for (const tool of discovered) {
      // Chat-role servers expose all their tools; capability-matched servers
      // only expose the tools that actually satisfy the requested capability.
      if (!isChatServer && !server.global && !toolMatchesCapability(tool, server, capabilities)) {
        continue;
      }
      tools.push(toLlmTool(server, tool));
    }
  }

  return tools;
}

/** Execute a dynamic MCP tool by its mcp__ name. */
export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ message: string; data: unknown; serverName: string }> {
  const ref = await resolveMcpToolRef(name);

  if (!ref) {
    throw new Error(`Unknown MCP tool: ${name}`);
  }

  const result = await withMcpServer(toServerConfig(ref.server), async (client) => {
    return client.callTool(ref.tool.name, args);
  });

  return { message: result.message, data: result.data, serverName: ref.server.name };
}
