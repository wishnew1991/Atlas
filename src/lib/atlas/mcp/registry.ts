import "server-only";

import { listMcpServers, type AtlasMcpServer } from "@/lib/atlas/server/model-registry";
import { withMcpServer, type McpToolDefinition, type McpServerConfig } from "@/lib/atlas/server/mcp-client";
import {
  type McpRole,
  type ToolCategory,
  CHAT_ROLES,
  hasCapability,
} from "./roles";

export function toServerConfig(server: AtlasMcpServer): McpServerConfig {
  return {
    url: server.url ?? undefined,
    token: server.token ?? undefined,
    command: server.command || undefined,
    args: server.args,
    env: server.env,
  };
}

interface CacheEntry {
  tools: McpToolDefinition[];
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const toolCache = new Map<string, CacheEntry>();

export async function getEnabledServers(): Promise<AtlasMcpServer[]> {
  const servers = await listMcpServers();
  return servers.filter((server) => server.enabled);
}

export async function getGlobalServers(): Promise<AtlasMcpServer[]> {
  const servers = await getEnabledServers();
  return servers.filter((server) => server.global);
}

export async function getServersForDomain(domain: string): Promise<AtlasMcpServer[]> {
  const servers = await getEnabledServers();
  return servers.filter((server) => server.domain === domain || server.global);
}

/**
 * Role-based selection: servers that carry any of the given roles.
 * A server marked global is always eligible.
 */
export async function getServersForRoles(roles: McpRole[]): Promise<AtlasMcpServer[]> {
  const servers = await getEnabledServers();
  return servers.filter(
    (server) => server.global || server.roles.some((role) => roles.includes(role as McpRole))
  );
}

/** Servers the natural chat agent should see (knowledge, utility, browser, ...). */
export async function getChatAgentServers(): Promise<AtlasMcpServer[]> {
  return getServersForRoles(CHAT_ROLES);
}

/**
 * Capability-based selection: servers whose tool classifications include the
 * given capability (e.g. "food", "travel"). Used by task-specific agents.
 */
export async function getServersForCapability(capability: string): Promise<AtlasMcpServer[]> {
  const servers = await getEnabledServers();

  return servers.filter((server) => {
    if (server.global) return true;
    if (server.domain === capability) return true;

    // Match against per-tool classifications.
    return Object.values(server.toolRoles).some((categories) =>
      hasCapability(categories as ToolCategory[], capability)
    );
  });
}

export async function listServerTools(server: AtlasMcpServer): Promise<McpToolDefinition[]> {
  const cached = toolCache.get(server.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tools;
  }

  const tools = await withMcpServer(toServerConfig(server), (client) => client.listTools());
  toolCache.set(server.id, { tools, expiresAt: Date.now() + CACHE_TTL_MS });
  return tools;
}

export function invalidateToolCache(serverId?: string) {
  if (serverId) {
    toolCache.delete(serverId);
  } else {
    toolCache.clear();
  }
}
