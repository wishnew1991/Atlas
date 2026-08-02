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
import { runChatExecution, streamChatExecution } from "@/lib/execution/engine";

export type ActiveModel = {
  id: string;
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
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

export async function resolveActiveModel(domain: string): Promise<ActiveModel | null> {
  const { resolveModelForDomain } = await import("@/lib/atlas/server/model-registry");
  const model = await resolveModelForDomain(domain as "food" | "travel" | "shopping" | "rides" | "appointments");

  if (model) {
    const mapped = toLlmProvider(model.provider);
    return {
      id: model.id,
      provider: mapped.provider,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl || mapped.baseUrl,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      id: process.env.ATLAS_MODEL || "gpt-4.1-mini",
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: undefined,
    };
  }

  return null;
}

export async function createAtlasReplyCore(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  demoFallback: (message: string, userId: string) => Promise<AtlasChatResponse>,
  options?: { conversationId?: string }
): Promise<AtlasChatResponse & { conversationId?: string; runId?: string; executionId?: string }> {
  return runChatExecution(message, history, userId, capabilities, demoFallback, options);
}

export async function* streamAtlasReplyCore(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  demoFallback: (message: string, userId: string) => Promise<AtlasChatResponse>,
  signal?: AbortSignal,
  options?: { conversationId?: string }
): AsyncGenerator<AtlasStreamChunk> {
  yield* streamChatExecution(message, history, userId, capabilities, demoFallback, signal, options);
}

export { looksLikeToolPayload } from "./tools";
