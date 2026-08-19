import type { AtlasActionDomain } from "@/lib/atlas/agent-contract";
import type { ConnectorExecuteResult, TransportKind } from "./types";
import { resolveTransport } from "./resolver";
import { mcpAdapterCall } from "./adapters/mcp";
import { apiAdapterCall } from "./adapters/api";
import type { McpIntent } from "@/lib/atlas/mcp/router";

// Currently hardcoded to get the selected provider for a domain.
// In the future, this should pull from provider-state directly if needed.
import { getSelectedProvider } from "@/lib/atlas/flows/provider-state";

export async function gatewayCall(
  domain: AtlasActionDomain,
  intent: McpIntent,
  args: Record<string, unknown>
): Promise<ConnectorExecuteResult | null> {
  const providerId = getSelectedProvider(domain);
  
  // If we know the exact integration provider, use the resolver
  if (providerId) {
    const transport = await resolveTransport(providerId);

    if (transport === "mcp") {
      return await mcpAdapterCall(domain, intent, args);
    } else if (transport === "rest" || transport === "sdk") {
      return await apiAdapterCall(domain, intent, args);
    } else if (transport === "browser") {
      throw new Error("Browser transport not yet supported on this server.");
    }
  }

  // Fallback if no specific provider is selected or transport resolution failed:
  // We default to MCP routing which tries all available global & domain servers
  return await mcpAdapterCall(domain, intent, args);
}
