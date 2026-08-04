import "server-only";

import type { McpToolDefinition } from "@/lib/atlas/server/mcp-client";
import type { AtlasMcpServer } from "@/lib/atlas/server/model-registry";
import { withMcpServer } from "@/lib/atlas/server/mcp-client";
import { getServersForDomain, getChatAgentServers, getGlobalServers, listServerTools, toServerConfig } from "./registry";

export type McpIntent = "search" | "prepare" | "execute" | "any";

export interface McpCallResult {
  message: string;
  data: unknown;
  serverName: string;
  toolName: string;
}

function scoreToolForIntent(tool: McpToolDefinition, intent: McpIntent): number {
  const name = tool.name.toLowerCase();
  const description = tool.description.toLowerCase();
  let score = 0;

  if (intent === "search" || intent === "any") {
    if (/(search|find|list|discover|query|lookup|^get_|get_)/.test(name)) score += 3;
    if (description.includes("search") || description.includes("find")) score += 2;
  }
  if (intent === "prepare") {
    if (/(prepare|create|build|draft|quote|estimate|cart|checkout|add)/.test(name)) score += 3;
    if (description.includes("prepare") || description.includes("checkout") || description.includes("cart")) score += 2;
  }
  if (intent === "execute") {
    if (/(execute|confirm|place|order|book|pay|submit|complete|run|send|email|message)/.test(name)) score += 3;
    if (description.includes("execute") || description.includes("order") || description.includes("book") || description.includes("place") || description.includes("send")) score += 2;
  }

  return score;
}

function pickTool(tools: McpToolDefinition[], intent: McpIntent): McpToolDefinition | null {
  if (tools.length === 0) return null;

  const ranked = tools
    .map((tool) => ({ tool, score: scoreToolForIntent(tool, intent) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return best.score === 0 && intent !== "any" ? null : best.tool;
}

async function callWithRetry(
  server: AtlasMcpServer,
  toolName: string,
  args: Record<string, unknown>,
  retries = 2
): Promise<McpCallResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withMcpServer(toServerConfig(server), async (client) => {
        const tools = await client.listTools();
        const tool = tools.find((entry) => entry.name === toolName);
        if (!tool) return null;
        return client.callTool(tool.name, args);
      });

      if (result) {
        return {
          message: result.message,
          data: result.data,
          serverName: server.name,
          toolName,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("MCP call failed.");
}

/**
 * Routes an LLM tool call to the best matching MCP server/tool and executes it.
 * Tries every candidate server (global + domain) until one succeeds.
 *
 * Provider-aware: when a provider is selected for this domain, only servers
 * matching that provider are tried. This keeps provider context at the routing
 * layer without threading it through service functions.
 */
export async function routeToolCall(
  domain: string,
  intent: McpIntent,
  args: Record<string, unknown>,
  requestedToolName?: string
): Promise<McpCallResult | null> {
  let servers = await getServersForDomain(domain);

  if (servers.length === 0) {
    return null;
  }

  // Provider-aware filtering: narrow to the selected provider's server(s).
  const { getSelectedProvider } = await import("@/lib/atlas/flows/provider-state");
  const { serverMatchesProviderFilter } = await import("@/lib/atlas/flows/registry");
  const selectedProvider = getSelectedProvider(domain);

  if (selectedProvider) {
    servers = servers.filter((s) => serverMatchesProviderFilter(s, selectedProvider));
    // If filtering removed all servers, fall back to the full list.
    // This prevents a broken provider state from killing all tool calls.
    if (servers.length === 0) {
      servers = await getServersForDomain(domain);
    }
  }

  const errors: string[] = [];

  for (const server of servers) {
    try {
      const tools = await listServerTools(server);
      const tool = requestedToolName
        ? tools.find((entry) => entry.name === requestedToolName) ?? null
        : pickTool(tools, intent);

      if (!tool) {
        continue;
      }

      const result = await callWithRetry(server, tool.name, args);
      return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "call failed");
    }
  }

  return null;
}

export async function routeGlobalToolCall(
  intent: McpIntent,
  args: Record<string, unknown>,
  requestedToolName?: string
): Promise<McpCallResult | null> {
  // Natural-chat servers (knowledge, browser, filesystem, memory, utility) are
  // always eligible for general-purpose tools like web search, alongside any
  // legacy "global" servers.
  const [global, chat] = await Promise.all([getGlobalServers(), getChatAgentServers()]);
  const seen = new Set<string>();
  const servers: AtlasMcpServer[] = [];

  for (const server of [...global, ...chat]) {
    if (!seen.has(server.id)) {
      seen.add(server.id);
      servers.push(server);
    }
  }

  if (servers.length === 0) return null;

  for (const server of servers) {
    try {
      const tools = await listServerTools(server);
      const tool = requestedToolName
        ? tools.find((entry) => entry.name === requestedToolName) ?? null
        : pickTool(tools, intent);

      if (!tool) continue;
      return await callWithRetry(server, tool.name, args);
    } catch {
      continue;
    }
  }

  return null;
}
