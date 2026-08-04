/**
 * Provider Registry
 *
 * Discovers available providers per domain from configured MCP servers,
 * merged with static metadata overrides for display names and priority.
 *
 * Adding a new provider:
 * 1. Add MCP server via Admin API (POST /api/admin/mcp)
 * 2. (Optional) Add metadata override below for display name / priority
 * 3. (Optional) Add provider guide in flows/provider-guides/<domain>/<id>.md
 *
 * No code changes to engine, router, or service files required.
 */

import "server-only";

import { getServersForDomain } from "@/lib/atlas/mcp/registry";
import type { AtlasMcpServer } from "@/lib/atlas/server/model-registry";

export interface Provider {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
  priority: number;
  source: "registry" | "mcp-server";
}

/**
 * Static metadata overrides for providers.
 * Use this to set display names, priority, or enable/disable providers
 * that are discovered from MCP servers.
 *
 * Only id is required; other fields override MCP server metadata.
 */
const PROVIDER_OVERRIDES: Map<string, Partial<Provider>> = new Map([
  ["swiggy", { name: "Swiggy", priority: 1 }],
  ["zomato", { name: "Zomato", priority: 2 }],
  ["uber_eats", { name: "Uber Eats", priority: 3 }],
  ["makemytrip", { name: "MakeMyTrip", priority: 1 }],
  ["cleartrip", { name: "Cleartrip", priority: 2 }],
  ["booking_com", { name: "Booking.com", priority: 3 }],
  ["uber", { name: "Uber", priority: 1 }],
  ["ola", { name: "Ola", priority: 2 }],
  ["amazon", { name: "Amazon", priority: 1 }],
  ["walmart", { name: "Walmart", priority: 2 }],
]);

/**
 * Extract a provider id from an MCP server name.
 * "Swiggy Food MCP" → "swiggy"
 * "Zomato Delivery" → "zomato"
 * "mcp__swiggy_food" → "swiggy"
 */
function extractProviderId(serverName: string): string {
  const lower = serverName.toLowerCase();
  // Check known overrides first
  const overridesArray = Array.from(PROVIDER_OVERRIDES.entries());
  for (const [id] of overridesArray) {
    if (lower.includes(id)) return id;
  }
  // Fallback: slugify the first word
  return lower
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")[0] || "unknown";
}

/**
 * Extract a display name from an MCP server name.
 * "Swiggy Food MCP" → "Swiggy"
 * "Zomato Delivery" → "Zomato"
 */
function extractDisplayName(serverName: string): string {
  const lower = serverName.toLowerCase();
  const overridesArray = Array.from(PROVIDER_OVERRIDES.entries());
  for (const [, override] of overridesArray) {
    if (override.name && lower.includes(override.name.toLowerCase())) {
      return override.name;
    }
  }
  // Fallback: first word, capitalized
  const firstWord = serverName.split(/\s+/)[0];
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

/**
 * Check if a server name matches a provider id.
 */
function serverMatchesProvider(serverName: string, providerId: string): boolean {
  const lower = serverName.toLowerCase();
  return lower.includes(providerId.toLowerCase());
}

/**
 * Get all enabled providers for a domain.
 * Providers are discovered from MCP servers, merged with static overrides.
 */
export async function getProvidersForDomain(domain: string): Promise<Provider[]> {
  const servers = await getServersForDomain(domain);

  const providers: Provider[] = [];
  const seen = new Set<string>();

  for (const server of servers) {
    const id = extractProviderId(server.name);
    if (seen.has(id)) continue;
    seen.add(id);

    const override = PROVIDER_OVERRIDES.get(id);
    providers.push({
      id,
      name: override?.name ?? extractDisplayName(server.name),
      domain: server.domain,
      enabled: server.enabled && (override?.enabled ?? true),
      priority: override?.priority ?? 10,
      source: "mcp-server",
    });
  }

  return providers
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Resolve a single provider for a domain.
 * Returns null when multiple providers exist and no hint is given.
 */
export async function resolveProvider(
  domain: string,
  userHint?: string
): Promise<Provider | null> {
  const providers = await getProvidersForDomain(domain);

  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];

  if (userHint) {
    const hint = userHint.toLowerCase().trim();
    const match = providers.find(
      (p) =>
        p.id.toLowerCase() === hint ||
        p.name.toLowerCase() === hint
    );
    if (match) return match;
  }

  return null; // Multiple providers, no hint
}

/**
 * Get a provider by its id.
 */
export async function getProviderById(id: string): Promise<Provider | undefined> {
  const providers = await getProvidersForDomain(
    PROVIDER_OVERRIDES.get(id)?.domain ?? "unknown"
  );
  return providers.find((p) => p.id === id);
}

/**
 * Check if a server matches a given provider id.
 * Used by the routing layer to filter servers.
 */
export function serverMatchesProviderFilter(
  server: AtlasMcpServer,
  providerId: string
): boolean {
  return serverMatchesProvider(server.name, providerId);
}
