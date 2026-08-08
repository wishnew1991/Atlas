import { setLlmAdapter, getLlmAdapter } from "@/lib/atlas/llm";
import type { LlmAdapter } from "@/lib/atlas/llm/types";
import { MockLlmAdapter } from "./mock-llm";
import { CachedLlmAdapter } from "./cached-llm";
import { join } from "node:path";

const originalAdapters: Map<string, LlmAdapter> = new Map();

function saveOriginal(provider: string): void {
  if (!originalAdapters.has(provider)) {
    originalAdapters.set(provider, getLlmAdapter(provider as Parameters<typeof getLlmAdapter>[0]));
  }
}

function overrideAllMock(mock: MockLlmAdapter): void {
  const providers = ["openai", "custom", "nvidia"] as const;
  for (const p of providers) {
    saveOriginal(p);
    setLlmAdapter(p, mock);
  }
}

export function initMockLlm(): MockLlmAdapter {
  const mock = new MockLlmAdapter();
  overrideAllMock(mock);
  return mock;
}

export function initCachedLlm(cacheDir?: string): CachedLlmAdapter {
  const dir = cacheDir ?? join(process.cwd(), "scripts", "test-agent", "cache", "llm-responses");

  const providers = ["openai", "custom", "nvidia"] as const;
  for (const p of providers) {
    saveOriginal(p);
    const real = originalAdapters.get(p)!;
    const cached = new CachedLlmAdapter(real, dir);
    setLlmAdapter(p, cached);
  }

  const real = originalAdapters.get("openai")!;
  return new CachedLlmAdapter(real, dir);
}

export function initLiveLlm(): void {
  originalAdapters.forEach((adapter, provider) => {
    setLlmAdapter(provider as Parameters<typeof setLlmAdapter>[0], adapter);
  });
  originalAdapters.clear();
}

export { MockLlmAdapter } from "./mock-llm";
export type { MockScenario, MockScenarioMatch, MockScenarioOutput, MockScenarioError, MockScenarioToolCallRound, MockToolCall } from "./mock-llm";
export { CachedLlmAdapter } from "./cached-llm";
