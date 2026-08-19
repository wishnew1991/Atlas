/**
 * Execution step handlers — run via the in-process EXECUTION_STEP job queue.
 */

import "server-only";

import { resolveConversationState } from "@/lib/atlas/conversation/state";
import { hydrateFoodSession, getFoodSession, resetOrderKeepAddress } from "@/lib/atlas/mcp/food-session";
import { plan } from "@/lib/atlas/planner/planner";
import { chat, streamChat, type LlmChatOptions } from "@/lib/atlas/llm";
import { getToolsForCapabilities, executeTool } from "@/lib/atlas/tools/registry";
import { estimateMessagesTokens, historyToLlmMessages } from "@/lib/atlas/conversation/history";
import { beginStage, endStage } from "@/lib/atlas/observability/trace";
import { buildFoodSessionContextFromSession, buildSystemPrompt, resolveVoiceContextForUser } from "@/lib/atlas/server/agent/prompts";
import {
  extractAndStoreMemories,
  classifyMemoryIntent,
  retrieveSafetyMemories,
  retrievePreferenceMemories,
} from "@/lib/atlas/server/agent/memory";
import { buildRecommendationContext } from "@/lib/atlas/recommendation/engine";
import { detectDomain } from "@/lib/atlas/intent/detect-domain";
import {
  extractDishQuery,
  isMenuIndexSelection,
  needsAddressList,
  wantsMenuAgain,
} from "@/lib/atlas/mcp/food-resolve";
import { prisma } from "@/lib/atlas/server/prisma";
import {
  buildFollowUpMessages,
  humanizeToolName,
  looksLikeToolPayload,
  parseToolArgs,
  resolveToolCalls,
  sanitizeAssistantText,
  summarizeToolTurn,
} from "@/lib/atlas/server/agent/tools";
import { resolveActiveModel } from "@/lib/atlas/server/agent/reply";
import {
  addExecutionResult,
  getExecution,
  incrementExecutionProgress,
  updateExecutionState,
  updateExecutionStatus,
  updateExecutionSteps,
} from "./manager";
import { getTurnContext, mergeMemoryLines } from "./turn-context";
import type { ExecutionStepJobData } from "@/lib/queue/in-process";
import type { StepOutcome } from "./types";

async function markStep(
  executionId: string,
  stepId: string,
  status: "in_progress" | "completed" | "failed" | "skipped",
  outcome?: StepOutcome,
  data?: unknown
) {
  const execution = await getExecution(executionId);
  if (!execution) return;

  const steps = execution.plan.steps.map((step) => {
    if (step.id !== stepId) return step;
    return {
      ...step,
      status,
      startedAt: status === "in_progress" ? new Date() : step.startedAt,
      completedAt: status === "completed" || status === "failed" || status === "skipped" ? new Date() : step.completedAt,
      result:
        outcome && data !== undefined
          ? {
              outcome,
              data,
              duration: 0,
              retryCount: 0,
            }
          : step.result,
    };
  });
  await updateExecutionSteps(executionId, steps);

  if (outcome) {
    await addExecutionResult(executionId, {
      stepId,
      outcome,
      data: data ?? null,
      artifacts: [],
      metrics: { duration: 0, success: outcome === "success" },
      timestamp: new Date(),
    });
  }
}

export async function handleExecutionStepJob(data: ExecutionStepJobData): Promise<void> {
  const { executionId, stepId } = data;
  const ctx = getTurnContext(executionId);
  if (!ctx) {
    throw new Error(`No turn context for execution ${executionId}`);
  }

  const started = Date.now();
  await markStep(executionId, stepId, "in_progress");

  try {
    switch (stepId) {
      case "understand": {
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "understanding") });
        await hydrateFoodSession(ctx.userId);

        // Stale pending_payment after cancel/fail blocks a fresh order — clear it.
        const foodSession = getFoodSession(ctx.userId);
        if (foodSession.step === "pending_payment" && foodSession.approvalId) {
          const approval = await prisma.approval.findUnique({
            where: { id: foodSession.approvalId },
            select: { status: true },
          });
          if (!approval || approval.status === "failed" || approval.status === "completed") {
            resetOrderKeepAddress(ctx.userId);
          }
        }

        const state = await resolveConversationState(ctx.message, ctx.history);
        ctx.domain = state.domain;
        ctx.trace.domain = state.domain;
        ctx.planned = await plan(ctx.message, ctx.history, state, ctx.memoryIntent);
        ctx.emit({
          kind: "stage",
          stage: endStage(
            ctx.trace,
            "understanding",
            "completed",
            state.isContinuation ? "continuation" : state.reason
          ),
        });
        break;
      }
      case "classify_intent": {
        // Single entry point for memory-intent decisions this turn.
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "intent") });
        let classifyModel = ctx.activeModel;
        if (!classifyModel) {
          try {
            classifyModel = await resolveActiveModel(
              ctx.domain as "food" | "travel" | "shopping" | "rides" | "appointments"
            );
          } catch {
            classifyModel = null;
          }
        }
        const intent = await classifyMemoryIntent({
          message: ctx.message,
          history: ctx.history,
          domainHint: ctx.domain,
          model: classifyModel,
        });
        ctx.memoryIntent = intent;

        if (intent.kind === "ambiguous" || intent.needsClarification) {
          ctx.memoryMode = "clarify";
        } else if (intent.kind === "conversational") {
          ctx.memoryMode = "none";
        } else if (intent.kind === "execution") {
          ctx.memoryMode = "safety";
        } else {
          ctx.memoryMode = "recommendation";
        }

        await updateExecutionState(executionId, {
          variables: {
            memoryIntent: intent.kind,
            memoryIntentConfidence: intent.confidence,
            memoryIntentSource: intent.source,
          },
        });

        ctx.emit({
          kind: "stage",
          stage: endStage(
            ctx.trace,
            "intent",
            "completed",
            `${intent.kind} (${intent.source}, ${intent.confidence.toFixed(2)})`
          ),
        });
        break;
      }
      case "detect_domain": {
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "domain") });
        const detected = await detectDomain({
          message: ctx.message,
          history: ctx.history,
          memoryIntent: ctx.memoryIntent,
          conversationDomainHint: ctx.domain,
        });
        ctx.domain = detected.actionDomain;
        ctx.preferenceDomain = detected.preferenceDomain;
        ctx.trace.domain = detected.actionDomain;

        if (ctx.memoryIntent) {
          ctx.memoryIntent = {
            ...ctx.memoryIntent,
            domain: detected.preferenceDomain,
          };
        }

        // Re-plan capabilities now that intent + domain are known.
        const state = await resolveConversationState(ctx.message, ctx.history);
        ctx.planned = await plan(ctx.message, ctx.history, state, ctx.memoryIntent);

        await updateExecutionState(executionId, {
          variables: {
            domain: detected.actionDomain,
            preferenceDomain: detected.preferenceDomain,
            domainReason: detected.reason,
          },
        });

        ctx.emit({
          kind: "stage",
          stage: endStage(
            ctx.trace,
            "domain",
            "completed",
            `${detected.actionDomain}/${detected.preferenceDomain}`
          ),
        });
        break;
      }
      case "retrieve_safety_memory": {
        const intent = ctx.memoryIntent;
        const preferenceDomain = ctx.preferenceDomain || intent?.domain || "general";
        const shouldLoad =
          intent?.kind === "execution" ||
          intent?.kind === "hybrid" ||
          // Food/travel/rides recommendations still need hard constraints (allergies, visa, etc.).
          (intent?.kind === "recommendation" &&
            (preferenceDomain === "food" ||
              preferenceDomain === "travel" ||
              preferenceDomain === "rides"));
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "safety_memory") });
        if (!shouldLoad) {
          ctx.safetyMemories = [];
          mergeMemoryLines(ctx);
          ctx.emit({
            kind: "stage",
            stage: endStage(ctx.trace, "safety_memory", "completed", "skipped"),
          });
          await markStep(executionId, stepId, "skipped", "success", {
            reason: intent?.kind ?? "none",
          });
          await incrementExecutionProgress(executionId);
          return;
        }
        ctx.safetyMemories = await retrieveSafetyMemories(
          ctx.userId,
          ctx.message,
          preferenceDomain
        );
        mergeMemoryLines(ctx);
        if (ctx.memoryMode !== "recommendation") {
          ctx.memoryMode = ctx.safetyMemories.length ? "safety" : "none";
        }
        ctx.emit({
          kind: "stage",
          stage: endStage(
            ctx.trace,
            "safety_memory",
            "completed",
            `${ctx.safetyMemories.length} constraints`
          ),
        });
        break;
      }
      case "retrieve_preference_memory": {
        const intent = ctx.memoryIntent;
        const preferenceDomain = ctx.preferenceDomain || intent?.domain || "general";
        const shouldLoad = intent?.kind === "recommendation" || intent?.kind === "hybrid";
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "preference_memory") });
        if (!shouldLoad) {
          ctx.preferenceMemories = [];
          mergeMemoryLines(ctx);
          ctx.emit({
            kind: "stage",
            stage: endStage(ctx.trace, "preference_memory", "completed", "skipped"),
          });
          await markStep(executionId, stepId, "skipped", "success", {
            reason: intent?.kind ?? "none",
          });
          await incrementExecutionProgress(executionId);
          return;
        }
        ctx.preferenceMemories = await retrievePreferenceMemories(
          ctx.userId,
          ctx.message,
          preferenceDomain
        );
        ctx.memoryMode = "recommendation";
        mergeMemoryLines(ctx);
        ctx.emit({
          kind: "stage",
          stage: endStage(
            ctx.trace,
            "preference_memory",
            "completed",
            `${preferenceDomain}:${ctx.preferenceMemories.length}`
          ),
        });
        break;
      }
      case "build_recommendation": {
        const intentKind = ctx.memoryIntent?.kind;
        const shouldBuild = intentKind === "recommendation" || intentKind === "hybrid";
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "recommendation") });
        if (!shouldBuild) {
          ctx.emit({
            kind: "stage",
            stage: endStage(ctx.trace, "recommendation", "completed", "skipped"),
          });
          await markStep(executionId, stepId, "skipped", "success", { reason: intentKind ?? "none" });
          await incrementExecutionProgress(executionId);
          return;
        }

        const domain =
          (ctx.preferenceDomain as
            | "food"
            | "travel"
            | "shopping"
            | "entertainment"
            | "rides"
            | "general") ||
          ctx.memoryIntent?.domain ||
          "general";
        const recommendation = await buildRecommendationContext({
          userId: ctx.userId,
          message: ctx.message,
          domain,
          history: ctx.history,
          conversationSummary: ctx.conversationSummary,
          preferenceLines: ctx.preferenceMemories,
          safetyLines: ctx.safetyMemories,
        });
        ctx.recommendation = recommendation;
        ctx.memoryMode = "recommendation";
        mergeMemoryLines(ctx);
        ctx.emit({
          kind: "stage",
          stage: endStage(
            ctx.trace,
            "recommendation",
            "completed",
            `explore=${recommendation.explorationWeight.toFixed(2)}`
          ),
        });
        break;
      }
      case "select_tools": {
        if (!ctx.planned) throw new Error("Plan missing before select_tools");
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "routing") });
        ctx.activeModel = await resolveActiveModel(ctx.domain as "food" | "travel" | "shopping" | "rides" | "appointments");
        ctx.emit({
          kind: "stage",
          stage: endStage(ctx.trace, "routing", "completed", ctx.activeModel?.id),
        });
        if (!ctx.activeModel) {
          throw new Error("NO_MODEL");
        }
        ctx.trace.modelId = ctx.activeModel.id;
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "loading_tools") });
        let capabilities = ctx.planned.capabilities;
        const { wantsLiveRecommendationTools } = await import("@/lib/atlas/intent/memory-intent");
        if (
          ctx.memoryIntent &&
          wantsLiveRecommendationTools(ctx.memoryIntent) &&
          !capabilities.includes("web")
        ) {
          capabilities = [...capabilities.filter((c) => c !== "none"), "web"];
          ctx.planned = { ...ctx.planned, capabilities };
        }
        ctx.tools = await getToolsForCapabilities(capabilities);
        ctx.emit({
          kind: "stage",
          stage: endStage(ctx.trace, "loading_tools", "completed", `${ctx.tools.length} tools`),
        });
        break;
      }
      case "invoke_tools": {
        if (!ctx.activeModel || !ctx.planned) throw new Error("Model/plan missing before invoke_tools");
        const sessionCtx =
          ctx.domain === "food" || ctx.planned.capabilities.includes("food")
            ? buildFoodSessionContextFromSession(getFoodSession(ctx.userId))
            : undefined;
        const systemPrompt = buildSystemPrompt(ctx.memories, sessionCtx, {
          memoryMode: ctx.memoryMode,
          recommendationBriefing: ctx.recommendation?.briefing,
          voiceContext: await resolveVoiceContextForUser(ctx.userId),
        });
        const llmMessages = historyToLlmMessages(
          systemPrompt,
          ctx.history,
          ctx.message,
          ctx.conversationSummary
        );
        ctx.trace.tokensIn = estimateMessagesTokens(llmMessages);
        const useTools = ctx.tools.length > 0;
        const chatOptions: LlmChatOptions = {
          model: ctx.activeModel.id,
          provider: ctx.activeModel.provider,
          apiKey: ctx.activeModel.apiKey,
          baseUrl: ctx.activeModel.baseUrl,
          messages: llmMessages,
          tools: useTools ? ctx.tools : undefined,
          toolChoice: useTools ? "auto" : "none",
          temperature: 0.4,
        };

        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "reasoning") });
        const first = await chat(chatOptions);
        let toolCalls = resolveToolCalls(first).map((call) => ({
          id: call.id || `call_${call.name}`,
          name: call.name,
          arguments: call.arguments,
        }));

        // Nemotron sometimes skips tools — force the food flow when intent is clear.
        const foodTurn =
          ctx.domain === "food" || ctx.planned.capabilities.includes("food");
        if (toolCalls.length === 0 && foodTurn) {
          const session = getFoodSession(ctx.userId);
          const dish = extractDishQuery(ctx.message);

          if (isMenuIndexSelection(ctx.message)) {
            toolCalls = [
              {
                id: `call_food_update_cart_${Date.now()}`,
                name: "food_update_cart",
                arguments: JSON.stringify({ instruction: ctx.message }),
              },
            ];
          } else if (wantsMenuAgain(ctx.message)) {
            toolCalls = [
              {
                id: `call_food_browse_menu_${Date.now()}`,
                name: "food_browse_menu",
                arguments: JSON.stringify({ page: 1 }),
              },
            ];
          } else if (dish && session.address) {
            toolCalls = [
              {
                id: `call_food_find_restaurants_${Date.now()}`,
                name: "food_find_restaurants",
                arguments: JSON.stringify({ dish }),
              },
            ];
          } else if (needsAddressList(ctx.message, Boolean(session.address))) {
            // List Swiggy addresses instead of asking the user to type one.
            // If a dish was named, find-restaurants stores it then lists addresses.
            toolCalls = dish
              ? [
                  {
                    id: `call_food_find_restaurants_${Date.now()}`,
                    name: "food_find_restaurants",
                    arguments: JSON.stringify({ dish }),
                  },
                ]
              : [
                  {
                    id: `call_food_set_address_${Date.now()}`,
                    name: "food_set_address",
                    arguments: JSON.stringify({}),
                  },
                ];
          }
        }

        ctx.toolCalls = toolCalls;
        ctx.emit({
          kind: "stage",
          stage: endStage(
            ctx.trace,
            "reasoning",
            "completed",
            toolCalls.length ? `${toolCalls.length} tool call(s)` : "direct reply"
          ),
        });

        if (toolCalls.length === 0) {
          const cleaned = looksLikeToolPayload(first.content)
            ? ""
            : sanitizeAssistantText(first.content);
          ctx.reply = cleaned || "I'm ready to help.";
          await updateExecutionState(executionId, {
            variables: { directReply: true, firstContent: first.content },
          });
          break;
        }

        const toolLabel = toolCalls.map((call) => humanizeToolName(call.name)).join(", ");
        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "tool_execution", toolLabel) });
        ctx.toolResults = [];
        for (const call of toolCalls) {
          ctx.emit({
            kind: "stage",
            stage: {
              stage: "tool_execution",
              label: `Running ${humanizeToolName(call.name)}…`,
              status: "started",
              detail: call.name,
            },
          });
          const result = await executeTool(call.name, parseToolArgs(call.arguments), {
            userId: ctx.userId,
            history: ctx.history,
            domain: ctx.domain as "food" | "travel" | "shopping" | "rides" | "appointments",
          });
          ctx.toolResults.push(result);
        }
        ctx.emit({ kind: "stage", stage: endStage(ctx.trace, "tool_execution", "completed") });
        ctx.action = ctx.toolResults.find((result) => result.action)?.action;
        ctx.trace.toolsUsed = toolCalls.map((call) => call.name);

        if (ctx.action) {
          ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "approval", ctx.action.title) });
          ctx.emit({
            kind: "stage",
            stage: endStage(ctx.trace, "approval", "completed", ctx.action.title),
          });
        }

        await updateExecutionState(executionId, {
          variables: {
            firstContent: first.content,
            chatOptionsMessages: chatOptions.messages,
            hasTools: true,
          },
        });
        break;
      }
      case "compose_reply": {
        const execution = await getExecution(executionId);
        const vars = execution?.state.variables ?? {};
        if (vars.demo) {
          ctx.reply =
            typeof vars.demoReply === "string"
              ? vars.demoReply
              : "I'm ready to help.";
          ctx.emit({ kind: "token", text: ctx.reply });
          break;
        }

        if (vars.directReply || ctx.toolCalls.length === 0) {
          if (!ctx.reply) {
            ctx.reply = "I'm ready to help.";
          }
          ctx.emit({ kind: "token", text: ctx.reply });
          break;
        }

        if (!ctx.activeModel) throw new Error("Model missing before compose_reply");

        if (ctx.toolResults.length === 1 && ctx.toolResults[0].awaitingUser && !ctx.action) {
          ctx.reply = ctx.toolResults[0].message || summarizeToolTurn(ctx.toolCalls, ctx.toolResults);
          ctx.emit({ kind: "token", text: ctx.reply });
          break;
        }

        ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "composing") });
        const firstContent = typeof vars.firstContent === "string" ? vars.firstContent : "";
        const baseMessages = Array.isArray(vars.chatOptionsMessages)
          ? (vars.chatOptionsMessages as LlmChatOptions["messages"])
          : [];
        const followUp = buildFollowUpMessages(baseMessages, firstContent, ctx.toolCalls, ctx.toolResults);
        const finalOptions: LlmChatOptions = {
          model: ctx.activeModel.id,
          provider: ctx.activeModel.provider,
          apiKey: ctx.activeModel.apiKey,
          baseUrl: ctx.activeModel.baseUrl,
          messages: followUp,
          tools: undefined,
          toolChoice: "none",
          temperature: 0.4,
          stream: true,
          signal: ctx.signal,
        };

        let reply = "";
        let emitted = 0;
        let suppressed = false;
        let junked = false;
        for await (const chunk of streamChat(finalOptions)) {
          if (chunk.type !== "token") continue;
          reply += chunk.text;
          if (suppressed || junked) continue;
          if (reply.includes("<unk>") || /<\/?x\d+>/.test(reply) || reply.includes("<|")) {
            junked = true;
            emitted = 0;
            continue;
          }
          if (reply.trimStart().startsWith("{")) {
            if (looksLikeToolPayload(reply)) {
              suppressed = true;
              emitted = 0;
            }
            continue;
          }
          if (reply.length > emitted) {
            ctx.emit({ kind: "token", text: reply.slice(emitted) });
            emitted = reply.length;
          }
        }

        if (suppressed || looksLikeToolPayload(reply)) {
          const fallback = summarizeToolTurn(ctx.toolCalls, ctx.toolResults);
          ctx.reply = fallback;
          ctx.emit({ kind: "token", text: fallback });
        } else {
          const cleaned = sanitizeAssistantText(reply);
          if (!cleaned) {
            ctx.reply = summarizeToolTurn(ctx.toolCalls, ctx.toolResults) || "I'm ready to help.";
            ctx.emit({ kind: "token", text: ctx.reply });
          } else {
            ctx.reply = cleaned;
            if (junked || emitted === 0) {
              ctx.emit({ kind: "token", text: cleaned });
            } else if (cleaned.length > emitted) {
              ctx.emit({ kind: "token", text: cleaned.slice(emitted) });
            }
          }
        }

        ctx.emit({ kind: "stage", stage: endStage(ctx.trace, "composing", "completed") });
        break;
      }
      case "request_approval": {
        if (ctx.action) {
          await updateExecutionState(executionId, {
            approvals: [
              {
                id: ctx.action.id,
                type: ctx.action.domain,
                status: "pending",
                requiredFor: "request_approval",
              },
            ],
            variables: {
              pendingActionId: ctx.action.id,
              pendingActionTitle: ctx.action.title,
              pendingActionDomain: ctx.action.domain,
            },
          });
          await updateExecutionStatus(executionId, "pending_approval");
        } else {
          await markStep(executionId, stepId, "skipped", "success", { skipped: true });
          await incrementExecutionProgress(executionId);
          return;
        }
        break;
      }
      case "fulfill_approval": {
        const execution = await getExecution(executionId);
        if (!execution) throw new Error("Execution missing for fulfill_approval");

        const granted = execution.state.approvals.find((entry) => entry.status === "granted");
        const pendingActionId =
          granted?.id ||
          (typeof execution.state.variables.pendingActionId === "string"
            ? execution.state.variables.pendingActionId
            : null);

        if (!pendingActionId) {
          await markStep(executionId, stepId, "skipped", "success", {
            skipped: true,
            reason: "no_approval",
          });
          await incrementExecutionProgress(executionId);
          return;
        }

        const approval = await prisma.approval.findUnique({ where: { id: pendingActionId } });
        const approvalStatus = approval?.status ?? (granted ? "completed" : "unknown");

        if (approvalStatus === "pending" || approvalStatus === "pending_payment") {
          // Still waiting on the user — park again and keep this step pending for a later resume.
          await updateExecutionState(executionId, {
            variables: {
              fulfillment: {
                approvalId: pendingActionId,
                status: approvalStatus,
                waiting: true,
              },
            },
          });
          const steps = execution.plan.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  status: "pending" as const,
                  startedAt: undefined,
                  completedAt: undefined,
                  result: undefined,
                }
              : step
          );
          await updateExecutionSteps(executionId, steps);
          await updateExecutionStatus(executionId, "pending_approval");
          return;
        }

        if (
          approvalStatus === "failed" ||
          approvalStatus === "cancelled" ||
          approvalStatus === "canceled" ||
          approvalStatus === "denied"
        ) {
          await updateExecutionState(executionId, {
            variables: {
              fulfillment: {
                approvalId: pendingActionId,
                status: approvalStatus,
                reference: approval?.reference ?? null,
              },
            },
          });
          await markStep(executionId, stepId, "failed", "failure", {
            approvalId: pendingActionId,
            status: approvalStatus,
          });
          try {
            await updateExecutionStatus(executionId, "failed", { force: true });
          } catch {
            /* ignore */
          }
          return;
        }

        await updateExecutionState(executionId, {
          variables: {
            fulfillment: {
              approvalId: pendingActionId,
              status: approvalStatus,
              reference: approval?.reference ?? null,
              completedAt: approval?.completedAt
                ? new Date(approval.completedAt).toISOString()
                : new Date().toISOString(),
            },
          },
        });
        if (!ctx.reply) {
          ctx.reply = approval?.reference
            ? `Approved action completed (ref ${approval.reference}).`
            : "Approved action completed.";
        }
        break;
      }
      default:
        throw new Error(`Unknown step ${stepId}`);
    }

    await markStep(executionId, stepId, "completed", "success", { ok: true, durationMs: Date.now() - started });
    await incrementExecutionProgress(executionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "step failed";
    if (message === "NO_MODEL") {
      await markStep(executionId, stepId, "failed", "failure", { error: message });
      throw error;
    }
    await markStep(executionId, stepId, "failed", "failure", { error: message });
    throw error;
  }
}

export async function finalizeExecutionMemories(executionId: string) {
  const ctx = getTurnContext(executionId);
  if (!ctx?.activeModel || !ctx.reply) return;
  void extractAndStoreMemories(ctx.userId, ctx.message, ctx.reply, ctx.activeModel);
}
