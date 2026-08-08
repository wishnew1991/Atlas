import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import { logStructured } from "./trace";

export interface RecordLlmCallInput {
  runId?: string;
  conversationId?: string;
  userId?: string;
  domain?: string;
  modelId?: string;
  provider?: string;
  round?: number;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  success?: boolean;
  error?: string;
  toolCalls?: string[];
}

export async function recordLlmCall(input: RecordLlmCallInput): Promise<void> {
  try {
    await prisma.llmLog.create({
      data: {
        runId: input.runId,
        conversationId: input.conversationId,
        userId: input.userId === "atlas-demo-user" ? null : input.userId,
        domain: input.domain,
        modelId: input.modelId,
        provider: input.provider,
        round: input.round ?? 0,
        tokensIn: input.tokensIn ?? null,
        tokensOut: input.tokensOut ?? null,
        latencyMs: input.latencyMs ?? null,
        success: input.success ?? true,
        error: input.error,
        toolCalls: JSON.stringify(input.toolCalls ?? []),
      },
    });
  } catch (error) {
    logStructured("llm_log.record_failed", {
      model: input.modelId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
