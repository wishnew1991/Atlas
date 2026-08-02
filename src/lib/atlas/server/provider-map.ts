import type { AtlasProvider } from "@/lib/atlas/server/model-registry";
import type { LlmProvider } from "@/lib/atlas/llm";

/**
 * Maps an Atlas provider (stored in the registry) to the LLM-layer provider used
 * by the adapters, including NVIDIA which rides on the OpenAI-compatible wire
 * format against a custom base URL.
 */
export function toLlmProvider(provider: AtlasProvider): { provider: LlmProvider; baseUrl?: string } {
  if (provider === "openai" || provider === "anthropic" || provider === "google" || provider === "custom") {
    return { provider };
  }
  if (provider === "nvidia") {
    return { provider: "openai", baseUrl: "https://integrate.api.nvidia.com/v1" };
  }
  return { provider: "openai" };
}
