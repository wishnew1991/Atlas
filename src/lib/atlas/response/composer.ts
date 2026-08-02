import "server-only";

import type { AtlasPendingAction } from "@/lib/atlas/agent-contract";
import type { ToolExecResult } from "@/lib/atlas/tools/registry";

export interface ComposedResponse {
  reply: string;
  action?: AtlasPendingAction;
  toolsUsed: string[];
}

/**
 * Merges LLM text with tool execution results into one natural response.
 * Never exposes raw JSON to the user — only the model's prose and, when
 * relevant, an approval card produced by a tool.
 */
export function compose(
  llmText: string,
  toolResults: ToolExecResult[]
): ComposedResponse {
  const action = toolResults.find((result) => result.action)?.action;
  const toolsUsed = toolResults
    .filter((result) => result.usedGateway || result.action)
    .map((result) => (result.action ? "approval" : "MCP"));

  const reply = (llmText || "").trim() || "I'm ready to help.";

  return {
    reply,
    action,
    toolsUsed: toolsUsed.length ? toolsUsed : toolResults.map(() => "tool"),
  };
}
