import type {
  LlmAdapter,
  LlmChatOptions,
  LlmChunk,
  LlmEmbedOptions,
  LlmEmbedResult,
  LlmResult,
} from "@/lib/atlas/llm/types";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export class CachedLlmAdapter implements LlmAdapter {
  private hits = 0;
  private misses = 0;

  constructor(
    private real: LlmAdapter,
    private cacheDir: string
  ) {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
  }

  get stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }

  private cacheKey(options: LlmChatOptions): string {
    const payload = JSON.stringify({
      model: options.model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
        tool_call_id: m.tool_call_id,
      })),
      tools: options.tools?.map((t) => t.name).sort(),
      temperature: options.temperature,
      toolChoice: options.toolChoice,
      maxTokens: options.maxTokens,
    });

    return createHash("sha256").update(payload).digest("hex");
  }

  private cachePath(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  private readCache(key: string): LlmResult | null {
    const p = this.cachePath(key);
    if (!existsSync(p)) return null;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      this.hits += 1;
      return data as LlmResult;
    } catch {
      return null;
    }
  }

  private writeCache(key: string, result: LlmResult): void {
    try {
      writeFileSync(this.cachePath(key), JSON.stringify(result, null, 2));
    } catch {
      // Best-effort cache write — silently ignore failures
    }
  }

  async chat(options: LlmChatOptions): Promise<LlmResult> {
    const key = this.cacheKey(options);
    const cached = this.readCache(key);
    if (cached) return cached;

    this.misses += 1;
    const result = await this.real.chat(options);
    this.writeCache(key, result);
    return result;
  }

  async *streamChat(options: LlmChatOptions): AsyncIterable<LlmChunk> {
    for await (const chunk of this.real.streamChat(options)) {
      yield chunk;
    }
  }

  async embed(options: LlmEmbedOptions): Promise<LlmEmbedResult> {
    if (this.real.embed) {
      return this.real.embed(options);
    }
    throw new Error("The real adapter does not support embeddings.");
  }
}
