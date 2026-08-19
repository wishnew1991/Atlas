import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";

export interface ConnectorAuditInput {
  integrationId: string;
  userId?: string | null;
  action: string;
  resource?: string | null;
  status?: "success" | "failed" | "pending_approval";
  details?: Record<string, unknown>;
}

/**
 * Record a connector action into the audit feed shown in Admin → Audit.
 * Best-effort by design: auditing must never break the action that produced it.
 */
export async function recordConnectorAudit(input: ConnectorAuditInput): Promise<void> {
  try {
    await prisma.connectorAudit.create({
      data: {
        id: crypto.randomUUID(),
        integrationId: input.integrationId,
        userId: input.userId ?? null,
        action: input.action,
        resource: input.resource ?? null,
        status: input.status ?? "success",
        detailsJson: JSON.stringify(input.details ?? {}),
      },
    });
  } catch (err) {
    console.error("[atlas] recordConnectorAudit failed:", err);
  }
}