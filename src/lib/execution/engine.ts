/**
 * Execution Engine
 * Bridges the existing chat system with the new execution model.
 * Resolves a live model and runs the LLM + tool loop when available;
 * falls back to the supplied demo fallback when no model is configured.
 */

import "server-only";

import type {
  AtlasChatHistoryItem,
  AtlasChatResponse,
  AtlasPendingAction,
} from "@/lib/atlas/agent-contract";
import type { AtlasCapabilities } from "@/lib/atlas/server/auth";
import type { AtlasStreamChunk } from "@/lib/atlas/server/agent/reply";
import { resolveActiveModel } from "@/lib/atlas/server/agent/reply";
import { prisma } from "@/lib/atlas/server/prisma";
import { chat, streamChat, type LlmMessage } from "@/lib/atlas/llm";
import { executeTool, getToolSchemas, type ToolContext } from "@/lib/atlas/tools/registry";
import { historyToLlmMessages } from "@/lib/atlas/conversation/history";
import { buildSystemPrompt } from "@/lib/atlas/server/agent/prompts";
import {
  buildFollowUpMessages,
  resolveToolCalls,
  sanitizeAssistantText,
} from "@/lib/atlas/server/agent/tools";
import { inferDomain } from "@/lib/atlas/domain";
import type { Execution } from "./types";
import {
  createExecution,
  updateExecutionStatus,
  addExecutionResult,
  updateExecutionState,
  getExecution,
} from "./manager";

const MAX_TOOL_ROUNDS = 5;

export type GenerateReply = (
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  options?: { conversationId?: string; executionId?: string }
) => Promise<AtlasChatResponse>;

// ---------------------------------------------------------------------------
// Live pipeline — runs when a model is configured
// ---------------------------------------------------------------------------

async function liveGenerateReply(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  options?: { conversationId?: string; executionId?: string }
): Promise<AtlasChatResponse> {
  const domain = inferDomain(message, history);
  const activeModel = await resolveActiveModel(domain);
  if (!activeModel) {
    throw new Error("No model configured — cannot run live pipeline.");
  }

  const systemPrompt = buildSystemPrompt([]);
  const baseMessages = historyToLlmMessages(systemPrompt, history, message);

  const toolDefs = await getToolSchemas();

  const toolContext: ToolContext = {
    userId,
    history: history.map((item) => ({ role: item.role, text: item.text })),
  };

  let messages: LlmMessage[] = baseMessages;
  const toolsUsed: string[] = [];
  let lastAction: AtlasPendingAction | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await chat({
      model: activeModel.id,
      messages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      toolChoice: "auto",
      temperature: 0.3,
      maxTokens: 2048,
      apiKey: activeModel.apiKey,
      baseUrl: activeModel.baseUrl,
      provider: activeModel.provider,
    });

    const toolCalls = resolveToolCalls(result);
    if (toolCalls.length === 0) {
      const reply = sanitizeAssistantText(result.content);
      return {
        reply: reply || "I wasn't sure how to help with that. Could you rephrase?",
        mode: "live",
        toolsUsed,
        action: lastAction,
      };
    }

    const results = [];
    for (const call of toolCalls) {
      const parsed = JSON.parse(call.arguments || "{}");
      const execResult = await executeTool(call.name, parsed, toolContext);
      results.push(execResult);
      toolsUsed.push(call.name);
      if (execResult.action) {
        lastAction = execResult.action;
      }
    }

    messages = buildFollowUpMessages(messages, result.content, toolCalls, results);
  }

  const lastMsg = messages[messages.length - 1];
  const finalContent =
    lastMsg?.role === "assistant" && typeof lastMsg.content === "string"
      ? sanitizeAssistantText(lastMsg.content)
      : "";

  return {
    reply: finalContent || "I've looked into that but ran out of steps. Let me know how to proceed.",
    mode: "live",
    toolsUsed,
    action: lastAction,
  };
}

async function* liveStreamGenerateReply(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  signal?: AbortSignal,
  options?: { conversationId?: string; executionId?: string }
): AsyncGenerator<AtlasStreamChunk> {
  const domain = inferDomain(message, history);
  const activeModel = await resolveActiveModel(domain);
  if (!activeModel) {
    throw new Error("No model configured — cannot run live streaming pipeline.");
  }

  const systemPrompt = buildSystemPrompt([]);
  const baseMessages = historyToLlmMessages(systemPrompt, history, message);

  const toolDefs = await getToolSchemas();

  const toolContext: ToolContext = {
    userId,
    history: history.map((item) => ({ role: item.role, text: item.text })),
  };

  let messages: LlmMessage[] = baseMessages;
  const toolsUsed: string[] = [];
  let lastAction: AtlasPendingAction | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let fullContent = "";
    const streamToolCalls: { id: string; name: string; arguments: string }[] = [];

    for await (const chunk of streamChat({
      model: activeModel.id,
      messages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      toolChoice: "auto",
      temperature: 0.3,
      maxTokens: 2048,
      apiKey: activeModel.apiKey,
      baseUrl: activeModel.baseUrl,
      provider: activeModel.provider,
      signal,
    })) {
      if (chunk.type === "token") {
        fullContent += chunk.text;
        yield { text: chunk.text };
      } else if (chunk.type === "tool_call") {
        streamToolCalls.push(chunk.call);
      }
    }

    if (streamToolCalls.length === 0) {
      yield { done: true, action: lastAction };
      return;
    }

    const results = [];
    for (const call of streamToolCalls) {
      const parsed = JSON.parse(call.arguments || "{}");
      const execResult = await executeTool(call.name, parsed, toolContext);
      results.push(execResult);
      toolsUsed.push(call.name);
      if (execResult.action) {
        lastAction = execResult.action;
      }
    }

    messages = buildFollowUpMessages(messages, fullContent, streamToolCalls, results);
  }

  yield { done: true, action: lastAction };
}

// ---------------------------------------------------------------------------
// Public engine API — wraps live pipeline + execution lifecycle
// ---------------------------------------------------------------------------

/**
 * Run a chat execution through the execution engine.
 * Checks for a live model first; if available, runs the LLM + tool loop.
 * Otherwise falls back to the supplied generateReply (typically demoResponse).
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
    const nonStreamDomain = inferDomain(message, history);
    const hasModel = await resolveActiveModel(nonStreamDomain).catch(() => null);
    if (hasModel) {
      response = await liveGenerateReply(message, history, userId, capabilities, options);
    } else {
      response = await generateReply(message, history, userId, capabilities, options);
    }
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
 * Checks for a live model first; if available, streams LLM tokens and executes
 * tools in a loop. Otherwise falls back to the supplied generateReply.
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
    const streamDomain = inferDomain(message, history);
    const hasModel = await resolveActiveModel(streamDomain).catch(() => null);
    const execId = execution.id;

    if (hasModel) {
      for await (const chunk of liveStreamGenerateReply(
        message,
        history,
        userId,
        capabilities,
        signal,
        { ...options, executionId: execId }
      )) {
        yield { ...chunk, executionId: execId };

        if (chunk.action) {
          pendingAction = chunk.action;
        }
        if (chunk.done) {
          completed = true;
        }
      }
    } else {
      const fallbackResponse = await generateReply(message, history, userId, capabilities, {
        ...options,
        executionId: execId,
      });
      yield {
        text: fallbackResponse.reply,
        action: fallbackResponse.action,
        done: true,
        executionId: execId,
      };
      if (fallbackResponse.action) {
        pendingAction = fallbackResponse.action;
      }
      completed = true;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
