/**
 * Flow Loader
 *
 * Loads domain guides and provider guides, merges them, and injects them
 * into the system prompt. The domain guide describes the business process;
 * the provider guide adds provider-specific behavior and quirks.
 *
 * Guide resolution:
 *   flows/domain-guides/<domain>.md          → business process
 *   flows/provider-guides/<domain>/<id>.md   → provider quirks
 */

import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import { resolveProvider, type Provider } from "./registry";
import { getSelectedProvider } from "./provider-state";

const FLOWS_DIR = join(process.cwd(), "src/lib/atlas/flows");

/**
 * Load a domain guide (business process) for a given domain.
 * Returns empty string if no guide exists.
 */
export function loadDomainGuide(domain: string): string {
  const path = join(FLOWS_DIR, "domain-guides", `${domain}.md`);
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Load a provider guide (behavior/quirks) for a given provider.
 * Returns empty string if no guide exists.
 */
export function loadProviderGuide(providerId: string, domain: string): string {
  const path = join(FLOWS_DIR, "provider-guides", domain, `${providerId}.md`);
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Load the complete flow for a provider: domain guide + provider guide.
 */
export function loadFlowForProvider(provider: Provider): string {
  const domainGuide = loadDomainGuide(provider.domain);
  const providerGuide = loadProviderGuide(provider.id, provider.domain);

  let flow = domainGuide;
  if (providerGuide) {
    flow += `\n\n---\n\n## Provider Details\n\n${providerGuide}`;
  }

  return flow;
}

/**
 * Inject the appropriate flow guide into a system prompt.
 *
 * Resolution order:
 * 1. Use explicitly provided providerId
 * 2. Use the selected provider from provider-state
 * 3. Auto-resolve if only one provider exists for the domain
 * 4. Return base prompt unchanged if no provider can be resolved
 */
export function injectFlowIntoPrompt(
  basePrompt: string,
  domain: string,
  providerId?: string
): string {
  if (domain === "general") return basePrompt;

  // Resolve provider: explicit > selected > auto
  const selected = providerId ?? getSelectedProvider(domain);
  const provider = selected
    ? { id: selected, name: selected, domain, enabled: true, priority: 1, source: "registry" as const }
    : null;

  // Try auto-resolution if no explicit provider
  if (!provider) {
    // Async resolution not possible here; return base prompt
    // The caller should resolve beforehand and pass providerId
    return basePrompt;
  }

  const flow = loadFlowForProvider(provider);
  if (!flow) return basePrompt;

  return `${basePrompt}\n\n---\n\n${flow}`;
}

/**
 * Resolve the flow guide for a domain, given a provider hint.
 * Returns the merged guide content, or empty string if no provider resolves.
 */
export async function resolveFlowGuide(
  domain: string,
  providerId?: string
): Promise<string> {
  if (domain === "general") return "";

  const provider = await resolveProvider(domain, providerId);
  if (!provider) return "";

  return loadFlowForProvider(provider);
}
