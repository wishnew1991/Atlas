/**
 * Execution Engine
 * Bridges the existing chat system with the new execution model
 * This is a compatibility layer that will evolve into the full execution engine
 */

import "server-only";

import type {
  AtlasChatHistoryItem,
  AtlasChatResponse,
  AtlasPendingAction,
} from "@/lib/atlas/agent-contract";
import type { AtlasCapabilities } from "@/lib/atlas/server/auth";
import type { AtlasStreamChunk } from "@/lib/atlas/server/agent/reply";
import { createAtlasReplyCore, streamAtlasReplyCore } from "@/lib/atlas/server/agent/reply";
import { prisma } from "@/lib/atlas/server/prisma";
import type { Execution } from "./types";
import {
  createExecution,
  updateExecutionStatus,
  addExecutionResult,
  updateExecutionState,
  incrementExecutionProgress,
  getExecution,
} from "./manager";

export type GenerateReply = (
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  options?: { conversationId?: string; executionId?: string }
) => Promise<AtlasChatResponse>;

/**
 * Run a chat execution through the execution engine.
 * If an executionId is provided, it reuses that execution (e.g. created by the
 * chat route); otherwise it creates a new one. The execution is transitioned
 * planning → executing → completed and the reply is stored as a result.
 */
export async function runChatExecution(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  generateReply: GenerateReply,
  options?: { conversationId?: string; executionId?: string }
): Promise<AtlasChatResponse & { conversationId?: string; runId?: string; executionId?: string }> {
  const execution = await getOrCreateExecution(message, userId, capabilities, options);

  await updateExecutionStatus(execution.id, "executing");

  const startedAt = Date.now();
  let response: AtlasChatResponse;
  try {
    response = await createAtlasReplyCore(
      message,
      history,
      userId,
      capabilities,
      generateReply,
      { conversationId: options?.conversationId, executionId: execution.id }
    );
  } catch (error) {
    await updateExecutionStatus(execution.id, "failed");
    throw error;
  }

  if (response.action) {
    await updateExecutionState(execution.id, {
      approvals: [
        ...(execution.state.approvals ?? []),
        {
          id: response.action.id,
          type: response.action.domain,
          status: "pending",
          requiredFor: "chat-reply",
        },
      ],
    });
    await updateExecutionStatus(execution.id, "pending_approval");
  } else {
    await updateExecutionStatus(execution.id, "completed");
  }

  await addExecutionResult(execution.id, {
    stepId: "chat-reply",
    outcome: "success",
    data: response,
    artifacts: [],
    metrics: {
      duration: Date.now() - startedAt,
      success: true,
    },
    timestamp: new Date(),
  });

  const executionStatus = response.action ? "pending_approval" : "completed";

  return {
    ...response,
    conversationId: options?.conversationId,
    executionId: execution.id,
    executionStatus,
  };
}

/**
 * Stream a chat execution through the execution engine.
 * Reuses an existing execution when executionId is provided; otherwise creates
 * one. The reply is streamed via the core reply generator and the execution is
 * updated as the stream progresses.
 */
export async function* streamChatExecution(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  generateReply: GenerateReply,
  signal?: AbortSignal,
  options?: { conversationId?: string; executionId?: string }
): AsyncGenerator<AtlasStreamChunk> {
  const execution = await getOrCreateExecution(message, userId, capabilities, options);
  await updateExecutionStatus(execution.id, "executing");

  const startedAt = Date.now();
  let completed = false;
  let pendingAction: AtlasPendingAction | undefined;

  try {
    for await (const chunk of streamAtlasReplyCore(
      message,
      history,
      userId,
      capabilities,
      generateReply,
      signal,
      { conversationId: options?.conversationId, executionId: execution.id }
    )) {
      yield {
        ...chunk,
        executionId: execution.id,
      };

      if (chunk.stage) {
        await updateExecutionState(execution.id, {
          progress: {
            currentStep: chunk.stage.status === "completed" ? 1 : 0,
            totalSteps: 1,
            percentage: chunk.stage.status === "completed" ? 100 : 50,
          },
        });
      }

      if (chunk.action) {
        pendingAction = chunk.action;
      }

      if (chunk.done) {
        completed = true;
      }
    }
  } catch (error) {
    await updateExecutionStatus(execution.id, "failed");
    throw error;
  }

  if (pendingAction && completed) {
    await updateExecutionState(execution.id, {
      approvals: [
        ...(execution.state.approvals ?? []),
        {
          id: pendingAction.id,
          type: pendingAction.domain,
          status: "pending",
          requiredFor: "chat-reply",
        },
      ],
    });
    await updateExecutionStatus(execution.id, "pending_approval");
  } else {
    const status = completed ? "completed" : "failed";
    await updateExecutionStatus(execution.id, status);
  }

  await addExecutionResult(execution.id, {
    stepId: "chat-reply",
    outcome: completed ? "success" : "failure",
    data: { completed, duration: Date.now() - startedAt, action: pendingAction },
    artifacts: [],
    metrics: {
      duration: Date.now() - startedAt,
      success: completed,
    },
    timestamp: new Date(),
  });
}

async function getOrCreateExecution(
  message: string,
  userId: string,
  capabilities: AtlasCapabilities,
  options?: { conversationId?: string; executionId?: string }
): Promise<Execution> {
  if (options?.executionId) {
    const existing = await getExecution(options.executionId);
    if (existing) return existing;
  }

  return createExecution(
    {
      goal: message,
      type: "immediate",
      context: {
        conversationId: options?.conversationId,
        environment: { capabilities },
      },
    },
    userId,
    { conversationId: options?.conversationId }
  );
}

/**
 * Find the execution that is currently waiting on the given approval.
 * Best-effort: searches recent executions whose state references the approval.
 */
export async function findPendingExecutionForApproval(approvalId: string): Promise<string | null> {
  const row = await prisma.execution.findFirst({
    where: {
      status: { in: ["pending_approval", "executing", "planning"] },
      stateJson: { contains: approvalId },
    },
    orderBy: { updatedAt: "desc" },
  });
  return row?.id ?? null;
}

/**
 * Resume an execution after its approval has been resolved.
 * If the approval failed, the execution is marked failed; otherwise it is
 * completed so the chat can proceed.
 */
export async function resumeExecutionAfterApproval(
  executionId: string,
  _approvalId: string,
  options?: { failed?: boolean }
): Promise<void> {
  const execution = await getExecution(executionId);
  if (!execution) return;

  const finalStatus = options?.failed ? "failed" : "completed";
  if (execution.status === finalStatus) return;

  if (execution.status === "pending_approval" && finalStatus === "completed") {
    await updateExecutionStatus(executionId, "executing");
  }

  await updateExecutionStatus(executionId, finalStatus);
}

/**
 * Convert existing chat response to execution result.
 */
export function chatResponseToExecutionResult(
  response: AtlasChatResponse,
  executionId: string
): Execution["results"][0] {
  return {
    stepId: "chat-response",
    outcome: "success",
    data: response,
    artifacts: [],
    metrics: {
      duration: 0,
      success: true,
    },
    timestamp: new Date(),
  };
}

/**
 * Extract execution metadata from chat response.
 */
export function extractExecutionMetadata(
  response: AtlasChatResponse
): Partial<Execution["metadata"]> {
  return {
    source: "chat",
    priority: response.action ? "high" : "normal",
    tags: response.action ? ["requires-approval"] : [],
  };
}
