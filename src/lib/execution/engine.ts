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
import { resolveActiveModel, resolveModelChain, type ModelChain, type ActiveModel } from "@/lib/atlas/server/agent/reply";
import { prisma } from "@/lib/atlas/server/prisma";
import { recordLlmCall } from "@/lib/atlas/observability/llm-log";
import { chat, streamChat, type LlmMessage, type LlmToolCall } from "@/lib/atlas/llm";
import { LlmRequestError } from "@/lib/atlas/llm/errors";
import { executeTool, getToolsForCapabilities, type ToolContext } from "@/lib/atlas/tools/registry";
import { historyToLlmMessages } from "@/lib/atlas/conversation/history";
import { buildSystemPrompt } from "@/lib/atlas/server/agent/prompts";
import {
  buildFollowUpMessages,
  looksLikeToolPayload,
  resolveToolCalls,
  sanitizeAssistantText,
  summarizeToolTurn,
} from "@/lib/atlas/server/agent/tools";
import {
  classifyMemoryIntentHeuristic,
  retrieveMemoriesForTurn,
} from "@/lib/atlas/server/agent/memory";
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

export function clearActiveDomain(userId: string): void {
  _activeDomain.delete(userId);
}

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

// Track the active domain pipeline per user. Once a domain flow starts
// (food, travel, etc.), all follow-up messages route to it until the flow
// completes (step returns to "idle").
const _activeDomain = new Map<string, string>();

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
  let domain = inferDomain(message, history);

  // Lock domain: once a flow starts, keep routing to it until the flow
  // completes (step returns to "idle"). This ensures "5", "yes", "that one"
  // during a food flow stay in the food pipeline.
  const locked = _activeDomain.get(userId);
  if (locked) {
    const { resolveDomainLock } = await import("@/lib/atlas/integrations/routing");
    const state = await resolveDomainLock(userId, locked);
    if (state.isActive) {
      domain = locked;
    } else {
      _activeDomain.delete(userId);
    }
  } else if (domain !== "general") {
    _activeDomain.set(userId, domain);
  }

  // Provider selection: if multiple providers exist for this domain and none
  // is selected, return a provider selection required response. The UI prompts
  // the user to choose; provider selection is application state, not LLM reasoning.
  const { getProvidersForDomain } = await import("@/lib/atlas/flows/registry");
  const { getSelectedProvider } = await import("@/lib/atlas/flows/provider-state");
  const providers = domain !== "general" ? await getProvidersForDomain(domain) : [];

  let selected = getSelectedProvider(domain);

  // If a policy engine decision exists but the legacy in-process state has no
  // selection yet, adopt it so a decisive policy (preference, allowlist, health)
  // can short-circuit the manual provider prompt.
  if (providers.length > 1 && !selected) {
    const capability = DOMAIN_TO_CAPABILITY[domain]?.[0];
    if (capability) {
      const { resolveSelectedProvider } = await import("@/lib/atlas/integrations/selector");
      const { setSelectedProvider } = await import("@/lib/atlas/flows/provider-state");
      const policyProviderId = await resolveSelectedProvider(capability, userId);
      if (policyProviderId && providers.some((p) => p.id === policyProviderId)) {
        setSelectedProvider(domain, policyProviderId);
        selected = policyProviderId;
      }
    }
  }

  if (providers.length > 1 && !selected) {
    // Return a response that the UI can interpret as provider selection required.
    // The reply text is a placeholder; the UI checks for the providerSelectionRequired flag.
    return {
      reply: "",
      mode: "live",
      toolsUsed: [],
      providerSelectionRequired: true,
      providers: providers.map((p) => ({ id: p.id, name: p.name })),
      domain,
    } as AtlasChatResponse;
  }

  // Domain-specific requests: let the LLM handle them with flow guides.
  // Only fall back to demo when no model is configured (checked below).

  const modelChain = await resolveModelChain(domain);
  if (!modelChain) {
    // No model available — use demo fallback for domain-specific requests.
    if (domain !== "general" && _demoFallback) {
      return _demoFallback(message, history, userId, capabilities, options);
    }
    throw new Error("No model configured — cannot run live pipeline.");
  }

  let activeModel = modelChain.primary.model;
  let fallbackIndex = 0;

  const caps = DOMAIN_TO_CAPABILITY[domain] ?? ["web"];
  let toolDefs = await getToolsForCapabilities(caps);

  // Integration readiness gate: when no provider is connected for a non-general
  // domain, exclude the domain's fragile tools so the LLM never attempts (and
  // then retries) a service that cannot be reached.
  const noProvider = domain !== "general" && providers.length === 0;
  if (noProvider) {
    toolDefs = toolDefs.filter((tool) => !tool.name.startsWith("food_"));
  }

  // Load and inject flow guide and intent-aware memory recall.
  const { resolveFlowGuide } = await import("@/lib/atlas/flows/loader");
  const flowGuide = await resolveFlowGuide(domain);

  const memoryRecall = await retrieveMemoriesForTurn(userId, message, domain, {
    history,
    intent: classifyMemoryIntentHeuristic(message),
  });

  let systemPrompt = buildSystemPrompt(memoryRecall.lines, undefined, {
    flowGuide,
    memoryMode: memoryRecall.mode,
  });
  if (noProvider) {
    systemPrompt += `
## Provider not connected
A ${domain} service is not connected right now, so the ${domain} tools are unavailable. Do not call unavailable tools, do not invent ${domain} results, and never claim a ${domain} action was performed. If the user wants a real ${domain} action, say the service isn't connected yet and that it can be connected in Settings.`;
  }
  if (toolDefs.length > 0) {
    const { buildToolRules } = await import("@/lib/atlas/integrations/routing");
    systemPrompt += buildToolRules(toolDefs);
  }
  const baseMessages = historyToLlmMessages(systemPrompt, history, message);

  const toolContext: ToolContext = {
    userId,
    history: history.map((item) => ({ role: item.role, text: item.text })),
  };

  let messages: LlmMessage[] = baseMessages;
  const toolsUsed: string[] = [];
  let lastAction: AtlasPendingAction | undefined;
  const runId = `llm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result;
    const attemptStartedAt = Date.now();
    try {
      result = await chat({
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
      await recordLlmCall({
        runId,
        conversationId: options?.conversationId,
        userId,
        domain,
        modelId: activeModel.id,
        provider: activeModel.provider,
        round,
        tokensIn: result.usage?.promptTokens,
        tokensOut: result.usage?.completionTokens,
        latencyMs: Date.now() - attemptStartedAt,
        success: true,
        toolCalls: result.toolCalls.map((tc) => tc.name),
      });
    } catch (error) {
      await recordLlmCall({
        runId,
        conversationId: options?.conversationId,
        userId,
        domain,
        modelId: activeModel.id,
        provider: activeModel.provider,
        round,
        latencyMs: Date.now() - attemptStartedAt,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      // Primary or current fallback failed — try the next fallback model.
      if (fallbackIndex < modelChain.fallbacks.length) {
        activeModel = modelChain.fallbacks[fallbackIndex].model;
        fallbackIndex++;
        // Retry the same round with the fallback model.
        round--;
        continue;
      }
      throw LlmRequestError.from(error, activeModel.provider);
    }

    const toolCalls = resolveToolCalls(result);
    if (toolCalls.length === 0) {
      // If the model outputs a raw tool payload as text (JSON instead of
      // native tool calls), fall back to the demo responder which handles
      // domains via server-side orchestration.
      if (round === 0 && _demoFallback && (looksLikeReasoning(result.content) || looksLikeToolPayload(result.content))) {
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

    // Readiness gate: when the only tool result awaits the user (e.g. a failed
    // or unavailable connection that surfaced a question), relay it verbatim and
    // stop — do NOT feed it back so the model can retry the same failing tool.
    if (results.length === 1 && results[0].awaitingUser && !results[0].action) {
      return {
        reply: results[0].message || summarizeToolTurn(toolCalls, results),
        mode: "live",
        toolsUsed,
        action: lastAction,
      };
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
  let domain = inferDomain(message, history);

  // Lock domain during active flow.
  const locked = _activeDomain.get(userId);
  if (locked) {
    const { resolveDomainLock } = await import("@/lib/atlas/integrations/routing");
    const state = await resolveDomainLock(userId, locked);
    if (state.isActive) {
      domain = locked;
    } else {
      _activeDomain.delete(userId);
    }
  } else if (domain !== "general") {
    _activeDomain.set(userId, domain);
  }

  // Provider selection: if multiple providers exist for this domain and none
  // is selected, return a provider selection required response.
  const { getProvidersForDomain } = await import("@/lib/atlas/flows/registry");
  const { getSelectedProvider } = await import("@/lib/atlas/flows/provider-state");
  const providers = domain !== "general" ? await getProvidersForDomain(domain) : [];

  let streamSelected = getSelectedProvider(domain);

  if (providers.length > 1 && !streamSelected) {
    const capability = DOMAIN_TO_CAPABILITY[domain]?.[0];
    if (capability) {
      const { resolveSelectedProvider } = await import("@/lib/atlas/integrations/selector");
      const { setSelectedProvider } = await import("@/lib/atlas/flows/provider-state");
      const policyProviderId = await resolveSelectedProvider(capability, userId);
      if (policyProviderId && providers.some((p) => p.id === policyProviderId)) {
        setSelectedProvider(domain, policyProviderId);
        streamSelected = policyProviderId;
      }
    }
  }

  if (providers.length > 1 && !streamSelected) {
    // Yield a chunk that the UI can interpret as provider selection required.
    yield {
      text: "",
      done: true,
      action: undefined,
      providerSelectionRequired: true,
      providers: providers.map((p) => ({ id: p.id, name: p.name })),
      domain,
    } as AtlasStreamChunk;
    return;
  }

  // Domain-specific requests: let the LLM handle them with flow guides.
  // Only fall back to demo when no model is configured (checked below).

  const modelChain = await resolveModelChain(domain);
  if (!modelChain) {
    // No model available — use demo fallback for domain-specific requests.
    if (domain !== "general" && _demoFallback) {
      const fallbackResponse = await _demoFallback(message, history, userId, capabilities, options);
      yield { text: fallbackResponse.reply, done: true, action: fallbackResponse.action };
      return;
    }
    throw new Error("No model configured — cannot run live streaming pipeline.");
  }

  let activeModel = modelChain.primary.model;
  let fallbackIndex = 0;

  const streamCaps = DOMAIN_TO_CAPABILITY[domain] ?? ["web"];
  let streamToolDefs = await getToolsForCapabilities(streamCaps);

  // Integration readiness gate: exclude fragile domain tools when no provider
  // is connected so the LLM never attempts a service that cannot be reached.
  const noProvider = domain !== "general" && providers.length === 0;
  if (noProvider) {
    streamToolDefs = streamToolDefs.filter((tool) => !tool.name.startsWith("food_"));
  }

  // Load and inject flow guide and intent-aware memory recall.
  const { resolveFlowGuide } = await import("@/lib/atlas/flows/loader");
  const flowGuide = await resolveFlowGuide(domain);

  const memoryRecall = await retrieveMemoriesForTurn(userId, message, domain, {
    history,
    intent: classifyMemoryIntentHeuristic(message),
  });

  let systemPrompt = buildSystemPrompt(memoryRecall.lines, undefined, {
    flowGuide,
    memoryMode: memoryRecall.mode,
  });
  if (noProvider) {
    systemPrompt += `
## Provider not connected
A ${domain} service is not connected right now, so the ${domain} tools are unavailable. Do not call unavailable tools, do not invent ${domain} results, and never claim a ${domain} action was performed. If the user wants a real ${domain} action, say the service isn't connected yet and that it can be connected in Settings.`;
  }
  if (streamToolDefs.length > 0) {
    const { buildToolRules } = await import("@/lib/atlas/integrations/routing");
    systemPrompt += buildToolRules(streamToolDefs);
  }
  const baseMessages = historyToLlmMessages(systemPrompt, history, message);

  const toolContext: ToolContext = {
    userId,
    history: history.map((item) => ({ role: item.role, text: item.text })),
  };
  let messages: LlmMessage[] = baseMessages;
  const toolsUsed: string[] = [];
  let lastAction: AtlasPendingAction | undefined;
  const runId = `llm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let fullContent = "";
    const streamToolCalls: LlmToolCall[] = [];
    let chunkCount = 0;
    let suppressed = false;
    let streamError: Error | null = null;
    let streamUsage: { promptTokens?: number; completionTokens?: number } | undefined;
    const attemptStartedAt = Date.now();
    try {
      for await (const chunk of streamChat({
        model: activeModel.id,
        messages,
        tools: streamToolDefs.length > 0 ? streamToolDefs : undefined,
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
          // Suppress tool payload tokens — if the model is emitting raw JSON
          // tool calls as text, do not stream those tokens to the client.
          if (!suppressed && !looksLikeToolPayload(fullContent)) {
            yield { text: chunk.text };
          } else {
            suppressed = true;
          }
        } else if (chunk.type === "tool_call") {
          streamToolCalls.push(chunk.call);
        } else if (chunk.type === "done" && chunk.usage) {
          streamUsage = chunk.usage;
        }
      }
    } catch (error) {
      streamError = error instanceof Error ? error : new Error(String(error));
    }

    await recordLlmCall({
      runId,
      conversationId: options?.conversationId,
      userId,
      domain,
      modelId: activeModel.id,
      provider: activeModel.provider,
      round,
      tokensIn: streamUsage?.promptTokens,
      tokensOut: streamUsage?.completionTokens,
      latencyMs: Date.now() - attemptStartedAt,
      success: streamError === null,
      error: streamError ? streamError.message : undefined,
      toolCalls: streamToolCalls.map((tc) => tc.name),
    });

    // If the current model failed and we have fallbacks, try the next one.
    if (streamError) {
      if (fallbackIndex < modelChain.fallbacks.length) {
        activeModel = modelChain.fallbacks[fallbackIndex].model;
        fallbackIndex++;
        round--;
        continue;
      }
      throw LlmRequestError.from(streamError, activeModel.provider);
    }
    if (streamToolCalls.length === 0) {
      // If the model produced no tokens at all, it may not support streaming
      // with tools (e.g. some Nemotron models). Retry without tools to get
      // a text response, or fall back to the demo responder.
      if (chunkCount <= 1 && fullContent.length === 0 && round === 0) {
        let fallbackContent = "";
        let retryUsage: { promptTokens?: number; completionTokens?: number } | undefined;
        const retryStartedAt = Date.now();
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
          } else if (chunk.type === "done" && chunk.usage) {
            retryUsage = chunk.usage;
          }
        }
        await recordLlmCall({
          runId,
          conversationId: options?.conversationId,
          userId,
          domain,
          modelId: activeModel.id,
          provider: activeModel.provider,
          round,
          tokensIn: retryUsage?.promptTokens,
          tokensOut: retryUsage?.completionTokens,
          latencyMs: Date.now() - retryStartedAt,
          success: true,
        });
        if (fallbackContent.length > 0) {
          yield { done: true };
          return;
        }
      }
      // If the model outputs reasoning or a raw tool payload instead of tool
      // calls, fall back to the demo responder which handles domains via
      // server-side orchestration.
      if (round === 0 && _demoFallback && (looksLikeReasoning(fullContent) || looksLikeToolPayload(fullContent))) {
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

    // Readiness gate: when the only tool result awaits the user (e.g. a failed
    // or unavailable connection that surfaced a question), relay it verbatim and
    // stop — do NOT feed it back so the model can retry the same failing tool.
    if (results.length === 1 && results[0].awaitingUser && !results[0].action) {
      yield {
        text: results[0].message || summarizeToolTurn(streamToolCalls, results),
        done: true,
        action: lastAction,
      };
      return;
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
