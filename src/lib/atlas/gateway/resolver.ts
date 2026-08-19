import type { TransportKind } from "./types";
import { prisma } from "@/lib/atlas/server/prisma";

export async function resolveTransport(
  integrationId: string,
  preferred?: TransportKind
): Promise<TransportKind | null> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration || !integration.enabled) return null;

  let transportOrder: TransportKind[] = [];
  try {
    transportOrder = JSON.parse(integration.transportOrderJson) as TransportKind[];
  } catch {
    // Default fallback if parsing fails
    transportOrder = [integration.transport as TransportKind];
  }

  // If there's no explicit order, fall back to the legacy "transport" field
  if (!transportOrder || transportOrder.length === 0) {
    transportOrder = [integration.transport as TransportKind];
  }

  // If a specific preferred transport was requested, check if it is supported
  if (preferred && transportOrder.includes(preferred)) {
    // Ideally we would run a health check here: if (await isHealthy(preferred)) return preferred
    return preferred;
  }

  // Find the first configured transport
  // In a full implementation, we would iterate and call health() on each until one is "healthy"
  for (const transport of transportOrder) {
    // For now, return the highest priority transport
    return transport;
  }

  return null;
}
