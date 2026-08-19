import { routeToolCall, type McpIntent } from "@/lib/atlas/mcp/router";
import type { AtlasActionDomain } from "@/lib/atlas/agent-contract";
import type { ConnectorExecuteResult } from "../types";

export async function mcpAdapterCall(
  domain: AtlasActionDomain,
  intent: McpIntent,
  args: Record<string, unknown>
): Promise<ConnectorExecuteResult | null> {
  // Wrap the existing MCP router
  const result = await routeToolCall(domain, intent, args);
  
  if (!result) return null;

  return {
    message: result.message,
    data: result.data,
  };
}
