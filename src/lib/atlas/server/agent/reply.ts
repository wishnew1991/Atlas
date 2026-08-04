import "server-only";

import type {
  AtlasChatHistoryItem,
  AtlasChatResponse,
  AtlasPendingAction,
} from "@/lib/atlas/agent-contract";
import type { AtlasCapabilities } from "@/lib/atlas/server/auth";
import type { LlmProvider } from "@/lib/atlas/llm";
import { toLlmProvider } from "@/lib/atlas/server/provider-map";
import type { StageEvent } from "@/lib/atlas/observability/trace";
import type { AtlasModelConfig } from "@/lib/atlas/server/model-registry";

export type ActiveModel = {
  id: string;
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
};

export type ModelChainEntry = {
  model: ActiveModel;
  isFallback: boolean;
};

export type ModelChain = {
  primary: ModelChainEntry;
  fallbacks: ModelChainEntry[];
};

export type AtlasStreamChunk = {
  text?: string;
  action?: AtlasPendingAction;
  done?: boolean;
  error?: string;
  stage?: StageEvent;
  runId?: string;
  conversationId?: string;
  executionId?: string;
};

function toActiveModel(model: AtlasModelConfig): ActiveModel {
  const mapped = toLlmProvider(model.provider);
  return {
    id: model.id,
    provider: mapped.provider,
    apiKey: model.apiKey,
    baseUrl: model.baseUrl || mapped.baseUrl,
  };
}

/**
 * Resolve the full model chain (primary + fallbacks) for a domain.
 * Returns the primary model and an ordered list of fallback models to try
 * if the primary fails.
 */
export async function resolveModelChain(domain: string): Promise<ModelChain | null> {
  const { resolveModelWithFallbacks } = await import("@/lib/atlas/server/model-registry");
  const { primary, fallbacks } = await resolveModelWithFallbacks(
    domain as "food" | "travel" | "shopping" | "rides" | "appointments"
  );

  if (primary) {
    return {
      primary: { model: toActiveModel(primary), isFallback: false },
      fallbacks: fallbacks.map((m) => ({ model: toActiveModel(m), isFallback: true })),
    };
  }

  if (process.env.OPENAI_API_KEY) {
    const envModel: ActiveModel = {
      id: process.env.ATLAS_MODEL || "gpt-4.1-mini",
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: undefined,
    };
    return { primary: { model: envModel, isFallback: false }, fallbacks: [] };
  }

  return null;
}

export async function resolveActiveModel(domain: string): Promise<ActiveModel | null> {
  const chain = await resolveModelChain(domain);
  return chain?.primary.model ?? null;
}

export async function createAtlasReplyCore(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  generateReply: (
    message: string,
    history: AtlasChatHistoryItem[],
    userId: string,
    capabilities: AtlasCapabilities,
    options?: { conversationId?: string; executionId?: string }
  ) => Promise<AtlasChatResponse>,
  options?: { conversationId?: string; executionId?: string }
): Promise<AtlasChatResponse & { conversationId?: string; runId?: string; executionId?: string }> {
  const response = await generateReply(message, history, userId, capabilities, options);
  return {
    ...response,
    conversationId: options?.conversationId,
    executionId: options?.executionId,
  };
}

export async function* streamAtlasReplyCore(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  generateReply: (
    message: string,
    history: AtlasChatHistoryItem[],
    userId: string,
    capabilities: AtlasCapabilities,
    options?: { conversationId?: string; executionId?: string }
  ) => Promise<AtlasChatResponse>,
  signal?: AbortSignal,
  options?: { conversationId?: string; executionId?: string }
): AsyncGenerator<AtlasStreamChunk> {
  signal?.throwIfAborted();

  const response = await generateReply(message, history, userId, capabilities, options);

  yield {
    text: response.reply,
    action: response.action,
    done: true,
    conversationId: options?.conversationId,
    executionId: options?.executionId,
  };
}

export { looksLikeToolPayload } from "./tools";
