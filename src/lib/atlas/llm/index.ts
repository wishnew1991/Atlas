import "server-only";

import type { LlmAdapter, LlmChatOptions, LlmChunk, LlmResult, LlmProvider, LlmEmbedOptions, LlmEmbedResult } from "./types";
import { openAiAdapter } from "./openai";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";

const adapters: Record<LlmProvider, LlmAdapter> = {
  openai: openAiAdapter,
  custom: openAiAdapter,
  nvidia: openAiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
};

export function getLlmAdapter(provider: LlmProvider): LlmAdapter {
  return adapters[provider] ?? openAiAdapter;
}

export function setLlmAdapter(provider: LlmProvider, adapter: LlmAdapter): void {
  adapters[provider] = adapter;
}

export async function chat(options: LlmChatOptions): Promise<LlmResult> {
  return getLlmAdapter(options.provider).chat(options);
}

export async function* streamChat(options: LlmChatOptions): AsyncIterable<LlmChunk> {
  yield* getLlmAdapter(options.provider).streamChat(options);
}

export async function embed(options: LlmEmbedOptions): Promise<LlmEmbedResult> {
  const adapter = getLlmAdapter(options.provider);
  if (!adapter.embed) {
    throw new Error(`The ${options.provider} provider does not support embeddings.`);
  }
  return adapter.embed(options);
}

export type {
  LlmChatOptions,
  LlmChunk,
  LlmResult,
  LlmMessage,
  LlmTool,
  LlmToolCall,
  LlmEmbedOptions,
  LlmEmbedResult,
  LlmProvider,
} from "./types";
