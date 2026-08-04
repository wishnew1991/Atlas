/**
 * Generic domain → provider mapping.
 *
 * Replaces per-domain session fields (like FoodSession.selectedProvider)
 * with a single module-level map. This keeps provider context at the routing
 * layer without threading providerId through every service function.
 *
 * State is per-process (like _activeDomain in engine.ts). It resets on server
 * restart, which is acceptable for a single-session assistant.
 */

const _domainProviders = new Map<string, string>();

export function setSelectedProvider(domain: string, providerId: string): void {
  _domainProviders.set(domain, providerId);
}

export function getSelectedProvider(domain: string): string | undefined {
  return _domainProviders.get(domain);
}

export function clearSelectedProvider(domain: string): void {
  _domainProviders.delete(domain);
}

export function clearAllProviders(): void {
  _domainProviders.clear();
}
