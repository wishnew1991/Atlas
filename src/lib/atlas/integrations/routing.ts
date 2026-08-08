/**
 * Generic domain lock resolver — replaces the hardcoded food-session check
 * in engine.ts. A domain is considered "active" when there is a WorkflowSession
 * row whose step is not "idle", indicating an in-progress orchestrated flow
 * (food ordering, travel booking, etc.).
 */
import { prisma } from "@/lib/atlas/server/prisma";

export interface DomainLockResult {
  domain: string;
  isActive: boolean;
}

export async function resolveDomainLock(
  userId: string,
  lockedDomain: string
): Promise<DomainLockResult> {
  try {
    const row = await prisma.workflowSession.findUnique({
      where: { id: `${lockedDomain}:${userId}` },
    });

    if (!row || !row.expiresAt || row.expiresAt.getTime() < Date.now()) {
      return { domain: lockedDomain, isActive: false };
    }

    const payload = JSON.parse(row.payload ?? "{}");
    const step = payload.step ?? "idle";
    return { domain: lockedDomain, isActive: step !== "idle" };
  } catch {
    return { domain: lockedDomain, isActive: false };
  }
}

export function buildToolRules(toolDefs: Array<{ name: string }>): string {
  if (toolDefs.length === 0) return "";

  const domains = new Set<string>();
  for (const t of toolDefs) {
    if (t.name.startsWith("food_")) domains.add("food");
    else if (t.name.startsWith("mcp__")) domains.add("mcp");
    else domains.add("general");
  }

  let prompt = `\n\n## TOOL CALLING RULES (MANDATORY)\n`;
  prompt += `You have domain tools available. When the user's request matches a domain, call the most specific tool for that domain first. Do not use web_search when a domain tool applies.\n`;
  prompt += `RULE: Always call the most specific tool for the user's request. Never explain what you would do — just call the tool.`;

  return prompt;
}
