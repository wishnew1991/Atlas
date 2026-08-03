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
import { executeTool, getToolsForCapabilities, type ToolContext } from "@/lib/atlas/tools/registry";
import { historyToLlmMessages } from "@/lib/atlas/conversation/history";
import { buildSystemPrompt } from "@/lib/atlas/server/agent/prompts";
import {
  buildFollowUpMessages,
  resolveToolCalls,
  sanitizeAssistantText,
} from "@/lib/atlas/server/agent/tools";
import { inferDomain } from "@/lib/atlas/domain";
import type { Execution } from "./types";
import type { Capability } from "@/lib/atlas/planner/planner";

const DOMAIN_TO_CAPABILITY: Record<string, Capability[]> = {
  food: ["food"],
  travel: ["travel"],
  shopping: ["shopping"],
  rides: ["rides"],
  appointments: ["calendar"],
  general: ["web"],
};
import {
  createExecution,
  updateExecutionStatus,
  addExecutionResult,
  updateExecutionState,
  getExecution,
} from "./manager";

const MAX_TOOL_ROUNDS = 5;

const REASONING_PATTERNS = /\b(we need to|we should|let me|first.*call|call the tool|tool call|function call|the flow|the rule|according to|we'll assume|let's do|thus we need|make tool|passing.*to|in the spec|the description)\b/i;

function looksLikeReasoning(text: string): boolean {
  if (!text || text.length < 80) return false;
  return REASONING_PATTERNS.test(text);
}

export type GenerateReply = (
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  options?: { conversationId?: string; executionId?: string }
) => Promise<AtlasChatResponse>;

// Module-level reference set by the engine so the live pipeline can fall back
// to the demo responder when the model cannot call tools.
let _demoFallback: GenerateReply | null = null;

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

  // Domain-specific requests (food, travel, etc.) go straight to the server-
  // side tool handler. This avoids relying on the LLM to make tool calls,
  // which many models (e.g. reasoning models) cannot do reliably.
  if (domain !== "general" && _demoFallback) {
    return _demoFallback(message, history, userId, capabilities, options);
  }

  const activeModel = await resolveActiveModel(domain);
  if (!activeModel) {
    throw new Error("No model configured — cannot run live pipeline.");
  }

  const caps = DOMAIN_TO_CAPABILITY[domain] ?? ["web"];
  const toolDefs = await getToolsForCapabilities(caps);

  let systemPrompt = buildSystemPrompt([]);
  if (toolDefs.length > 0) {
    const foodToolNames = toolDefs.filter((t) => t.name.startsWith("food_")).map((t) => t.name).join(", ");
    const otherToolNames = toolDefs.filter((t) => !t.name.startsWith("food_")).map((t) => t.name).join(", ");
    systemPrompt += `\n\n## TOOL CALLING RULES (MANDATORY)\n`;
    if (foodToolNames) {
      systemPrompt += `You have food tools: ${foodToolNames}.\n`;
      systemPrompt += `RULE: When the user mentions ANY food, restaurant, dish, meal, hunger, or ordering food, you MUST call food_set_address or food_find_restaurants FIRST. Do NOT call web_search for food. Do NOT respond with text — call the tool.\n`;
    }
    if (otherToolNames) {
      systemPrompt += `Other tools: ${otherToolNames}\n`;
    }
    systemPrompt += `RULE: Always call the most specific tool for the user's request. Never explain what you would do — just call the tool.`;
  }
  const baseMessages = historyToLlmMessages(systemPrompt, history, message);

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
      // If the model outputs reasoning instead of tool calls on the first
      // round, it likely doesn't support function calling. Fall back to the
      // demo responder which handles domains via server-side orchestration.
      if (round === 0 && _demoFallback && looksLikeReasoning(result.content)) {
        return await _demoFallback(message, history, userId, capabilities, options);
      }
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

  // Domain-specific requests go straight to the server-side tool handler.
  if (domain !== "general" && _demoFallback) {
    const fallbackResponse = await _demoFallback(message, history, userId, capabilities, options);
    yield { text: fallbackResponse.reply, done: true, action: fallbackResponse.action };
    return;
  }

  const activeModel = await resolveActiveModel(domain);
  if (!activeModel) {
    throw new Error("No model configured — cannot run live streaming pipeline.");
  }

  const streamCaps = DOMAIN_TO_CAPABILITY[domain] ?? ["web"];
  const toolDefs = await getToolsForCapabilities(streamCaps);

  let systemPrompt = buildSystemPrompt([]);
  if (toolDefs.length > 0) {
    const foodToolNames = toolDefs.filter((t) => t.name.startsWith("food_")).map((t) => t.name).join(", ");
    const otherToolNames = toolDefs.filter((t) => !t.name.startsWith("food_")).map((t) => t.name).join(", ");
    systemPrompt += `\n\n## TOOL CALLING RULES (MANDATORY)\n`;
    if (foodToolNames) {
      systemPrompt += `You have food tools: ${foodToolNames}.\n`;
      systemPrompt += `RULE: When the user mentions ANY food, restaurant, dish, meal, hunger, or ordering food, you MUST call food_set_address or food_find_restaurants FIRST. Do NOT call web_search for food. Do NOT respond with text — call the tool.\n`;
    }
    if (otherToolNames) {
      systemPrompt += `Other tools: ${otherToolNames}\n`;
    }
    systemPrompt += `RULE: Always call the most specific tool for the user's request. Never explain what you would do — just call the tool.`;
  }
  const baseMessages = historyToLlmMessages(systemPrompt, history, message);

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
    let chunkCount = 0;
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
      chunkCount++;
      if (chunk.type === "token") {
        fullContent += chunk.text;
        yield { text: chunk.text };
      } else if (chunk.type === "tool_call") {
        streamToolCalls.push(chunk.call);
      }
    }
    if (streamToolCalls.length === 0) {
      // If the model produced no tokens at all, it may not support streaming
      // with tools (e.g. some Nemotron models). Retry without tools to get
      // a text response, or fall back to the demo responder.
      if (chunkCount <= 1 && fullContent.length === 0 && round === 0) {
        let fallbackContent = "";
        for await (const chunk of streamChat({
          model: activeModel.id,
          messages,
          temperature: 0.3,
          maxTokens: 2048,
          apiKey: activeModel.apiKey,
          baseUrl: activeModel.baseUrl,
          provider: activeModel.provider,
          signal,
        })) {
          if (chunk.type === "token") {
            fallbackContent += chunk.text;
            yield { text: chunk.text };
          }
        }
        if (fallbackContent.length > 0) {
          yield { done: true };
          return;
        }
      }
      // If the model outputs reasoning instead of tool calls, fall back to
      // the demo responder which handles domains via server-side orchestration.
      if (round === 0 && _demoFallback && looksLikeReasoning(fullContent)) {
        const fallbackResponse = await _demoFallback(message, history, userId, capabilities, options);
        yield { text: fallbackResponse.reply, done: true, action: fallbackResponse.action };
        return;
      }
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
    _demoFallback = generateReply;
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
    _demoFallback = generateReply;
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
