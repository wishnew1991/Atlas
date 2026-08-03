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

/** Tool schemas change rarely; invalidate explicitly on admin Discover/upsert. */
const CACHE_TTL_MS = 10 * 60_000;
const toolCache = new Map<string, CacheEntry>();

/** Provider / server capability metadata cache (roles, tool counts). */
interface CapabilityCacheEntry {
  roles: string[];
  toolRoles: Record<string, string[]>;
  toolCount: number;
  expiresAt: number;
}

const capabilityCache = new Map<string, CapabilityCacheEntry>();
const CAPABILITY_TTL_MS = 10 * 60_000;

export function getCachedCapabilities(serverId: string): CapabilityCacheEntry | null {
  const cached = capabilityCache.get(serverId);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached;
}

export function setCachedCapabilities(
  serverId: string,
  value: Omit<CapabilityCacheEntry, "expiresAt">
) {
  capabilityCache.set(serverId, { ...value, expiresAt: Date.now() + CAPABILITY_TTL_MS });
}

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
    capabilityCache.delete(serverId);
  } else {
    toolCache.clear();
    capabilityCache.clear();
  }
}

/** Warm the tool schema cache after a successful discover. */
export function primeToolCache(serverId: string, tools: McpToolDefinition[]) {
  toolCache.set(serverId, { tools, expiresAt: Date.now() + CACHE_TTL_MS });
}
