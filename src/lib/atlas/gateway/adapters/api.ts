import type { AtlasActionDomain } from "@/lib/atlas/agent-contract";
import type { ConnectorExecuteResult } from "../types";

export async function apiAdapterCall(
  domain: AtlasActionDomain,
  intent: string,
  args: Record<string, unknown>
): Promise<ConnectorExecuteResult | null> {
  // Placeholder for direct API calls
  return null;
}
