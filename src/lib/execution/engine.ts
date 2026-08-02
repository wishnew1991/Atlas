/**
 * Execution Engine — create, plan, enqueue steps, complete lifecycle.
 */

import "server-only";

import type { AtlasChatHistoryItem, AtlasChatResponse, AtlasPendingAction } from "@/lib/atlas/agent-contract";
import type { AtlasCapabilities } from "@/lib/atlas/server/auth";
import { appendConversationTurn, resolveConversation } from "@/lib/atlas/conversation/persist";
import { resolveConversationState } from "@/lib/atlas/conversation/state";
import { plan as planCapabilities } from "@/lib/atlas/planner/planner";
import {
  beginStage,
  endStage,
  persistTurnTrace,
  startRun,
  type StageEvent,
} from "@/lib/atlas/observability/trace";
import { estimateMessagesTokens } from "@/lib/atlas/conversation/history";
import {
  createExecutionFromChat,
  getExecution,
  updateExecutionPlan,
  updateExecutionState,
  updateExecutionStatus,
} from "./manager";
import { buildDemoExecutionPlan, buildExecutionPlan } from "./plan-builder";
import { clearTurnContext, setTurnContext, type EngineEmit, type TurnContext } from "./turn-context";
import { handleExecutionStepJob } from "./steps";
import { runObserveReflectLearn } from "./reflect";
import { enqueueExecutionStep, ensureExecutionWorkerStarted } from "@/lib/queue/in-process";
import type { Execution } from "./types";

export type ExecutionStreamChunk = {
  text?: string;
  action?: AtlasPendingAction;
  done?: boolean;
  error?: string;
  stage?: StageEvent;
  runId?: string;
  conversationId?: string;
  executionId?: string;
};

const DONE: unique symbol = Symbol("done");

function ensureWorker() {
  ensureExecutionWorkerStarted(async (data) => {
    await handleExecutionStepJob(data);
  });
}

async function runPlanSteps(executionId: string) {
  const execution = await getExecution(executionId);
  if (!execution) throw new Error("Execution missing");

  const completed = new Set(
    execution.plan.steps
      .filter((step) => step.status === "completed" || step.status === "skipped")
      .map((step) => step.id)
  );

  for (let i = 0; i < execution.plan.steps.length; i += 1) {
    const step = execution.plan.steps[i];
    if (completed.has(step.id)) continue;
    if (!step.dependencies.every((dep) => completed.has(dep))) continue;

    const current = await getExecution(executionId);
    if (current?.status === "pending_approval") break;

    await enqueueExecutionStep({
      executionId,
      stepId: step.id,
      stepNumber: i + 1,
      parameters: step.parameters,
      retryCount: 0,
    });

    completed.add(step.id);

    const after = await getExecution(executionId);
    if (after?.status === "pending_approval") break;
  }
}

async function finishLifecycle(executionId: string, ctx: TurnContext, failed = false) {
  const current = await getExecution(executionId);
  if (!current) return;
  if (current.status === "pending_approval") return;

  if (failed) {
    ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "complete") });
    await runObserveReflectLearn(executionId, { failed: true, ctx });
    ctx.emit({ kind: "stage", stage: endStage(ctx.trace, "complete", "failed") });
    return;
  }

  if (current.status === "executing" || current.status === "planning" || current.status === "observing") {
    ctx.emit({ kind: "stage", stage: beginStage(ctx.trace, "complete") });
    await runObserveReflectLearn(executionId, { failed: false, ctx });
    ctx.emit({ kind: "stage", stage: endStage(ctx.trace, "complete") });
  }
}

function createEmitChannel() {
  const queue: Array<EngineEmit | typeof DONE> = [];
  let waiting: ((value: EngineEmit | typeof DONE) => void) | null = null;

  const push = (event: EngineEmit | typeof DONE) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(event);
      return;
    }
    queue.push(event);
  };

  const take = () =>
    new Promise<EngineEmit | typeof DONE>((resolve) => {
      if (queue.length > 0) {
        resolve(queue.shift()!);
        return;
      }
      waiting = resolve;
    });

  return { push, take };
}

/**
 * Stream a chat turn as an Execution.
 */
export async function* streamChatExecution(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  demoFallback: (message: string, userId: string) => Promise<AtlasChatResponse>,
  signal?: AbortSignal,
  options?: { conversationId?: string }
): AsyncGenerator<ExecutionStreamChunk> {
  ensureWorker();

  const conversation = await resolveConversation(userId, options?.conversationId);
  const trace = startRun({ conversationId: conversation.id, userId });
  const { push, take } = createEmitChannel();

  const execution = await createExecutionFromChat(
    {
      conversationId: conversation.id,
      message,
      history,
      userId,
      capabilities: [],
    },
    { runId: trace.runId }
  );

  yield { runId: trace.runId, conversationId: conversation.id, executionId: execution.id };

  const ctx: TurnContext = {
    executionId: execution.id,
    userId,
    message,
    history,
    capabilities,
    conversationId: conversation.id,
    conversationSummary: conversation.summary,
    domain: "shopping",
    preferenceDomain: "general",
    planned: null,
    activeModel: null,
    tools: [],
    memories: [],
    safetyMemories: [],
    preferenceMemories: [],
    memoryMode: "none",
    memoryIntent: null,
    recommendation: null,
    toolCalls: [],
    toolResults: [],
    reply: "",
    trace,
    emit: (event) => push(event),
    signal,
  };
  setTurnContext(execution.id, ctx);

  const runPromise = (async () => {
    try {
      if (!capabilities.liveLlm) {
        const demo = await demoFallback(message, userId);
        const demoPlan = buildDemoExecutionPlan(message);
        await updateExecutionPlan(execution.id, demoPlan);
        await updateExecutionState(execution.id, {
          variables: { demo: true, demoReply: demo.reply },
        });
        await updateExecutionStatus(execution.id, "executing");
        await enqueueExecutionStep({
          executionId: execution.id,
          stepId: "compose_reply",
          stepNumber: 1,
          parameters: { demo: true },
          retryCount: 0,
        });
        ctx.action = demo.action;
        await finishLifecycle(execution.id, ctx);
        return;
      }

      const state = await resolveConversationState(message, history);
      // Capabilities are planned from conversation state; memory intent is classified
      // later as its own pipeline step (single entry point for preference loading).
      const advisory = await planCapabilities(message, history, state);
      const domain =
        state.domain ||
        (advisory.capabilities[0] && advisory.capabilities[0] !== "none"
          ? advisory.capabilities[0]
          : "shopping");
      ctx.domain = domain;

      const execPlan = buildExecutionPlan({
        goal: message,
        planned: advisory,
        domain,
      });
      await updateExecutionPlan(execution.id, execPlan);
      await updateExecutionState(execution.id, {
        variables: { domain },
      });
      await updateExecutionStatus(execution.id, "executing");

      try {
        await runPlanSteps(execution.id);
        await finishLifecycle(execution.id, ctx, false);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "unknown";
        if (errMsg === "NO_MODEL") {
          const demo = await demoFallback(message, userId);
          ctx.reply = demo.reply;
          ctx.action = demo.action;
          push({ kind: "token", text: demo.reply });
          await finishLifecycle(execution.id, ctx, false);
          await persistTurnTrace(trace, true);
          return;
        }
        throw error;
      }

      if (ctx.reply) {
        ctx.trace.tokensOut = estimateMessagesTokens([{ role: "assistant", content: ctx.reply }]);
        await appendConversationTurn({
          conversationId: conversation.id,
          userMessage: message,
          assistantReply: ctx.reply,
          history,
          previousSummary: conversation.summary,
          meta: {
            runId: trace.runId,
            executionId: execution.id,
            toolsUsed: ctx.trace.toolsUsed,
          },
        });
        await persistTurnTrace(trace, !trace.error);
      } else {
        await persistTurnTrace(trace, true);
      }
    } catch (error) {
      console.error("[streamChatExecution] error", error);
      const errMsg = error instanceof Error ? error.message : "unknown";
      trace.error = errMsg;
      push({ kind: "stage", stage: beginStage(trace, "error") });
      push({ kind: "stage", stage: endStage(trace, "error", "failed", errMsg) });
      await finishLifecycle(execution.id, ctx, true);
      await persistTurnTrace(trace, false);
      const demo = await demoFallback(message, userId);
      ctx.reply = demo.reply;
      ctx.action = demo.action;
      push({ kind: "token", text: demo.reply });
    } finally {
      push(DONE);
    }
  })();

  while (true) {
    const event = await take();
    if (event === DONE) break;
    if (event.kind === "stage") {
      yield {
        stage: event.stage,
        runId: trace.runId,
        conversationId: conversation.id,
        executionId: execution.id,
      };
    } else if (event.kind === "token") {
      yield {
        text: event.text,
        runId: trace.runId,
        conversationId: conversation.id,
        executionId: execution.id,
      };
    }
  }

  await runPromise;

  yield {
    action: ctx.action,
    done: true,
    conversationId: conversation.id,
    runId: trace.runId,
    executionId: execution.id,
  };

  clearTurnContext(execution.id);
}

/**
 * Non-streaming chat execution.
 */
export async function runChatExecution(
  message: string,
  history: AtlasChatHistoryItem[],
  userId: string,
  capabilities: AtlasCapabilities,
  demoFallback: (message: string, userId: string) => Promise<AtlasChatResponse>,
  options?: { conversationId?: string }
): Promise<AtlasChatResponse & { conversationId?: string; runId?: string; executionId?: string }> {
  let reply = "";
  let action: AtlasPendingAction | undefined;
  let conversationId: string | undefined;
  let runId: string | undefined;
  let executionId: string | undefined;

  for await (const chunk of streamChatExecution(
    message,
    history,
    userId,
    capabilities,
    demoFallback,
    undefined,
    options
  )) {
    if (chunk.text) reply += chunk.text;
    if (chunk.action) action = chunk.action;
    if (chunk.conversationId) conversationId = chunk.conversationId;
    if (chunk.runId) runId = chunk.runId;
    if (chunk.executionId) executionId = chunk.executionId;
  }

  return {
    reply: reply || "I'm ready to help.",
    mode: "live",
    toolsUsed: [],
    action,
    conversationId,
    runId,
    executionId,
  };
}

/**
 * Resume an execution after user approval — continue remaining plan steps, then learn.
 */
export async function resumeExecutionAfterApproval(
  executionId: string,
  approvalId: string,
  options?: { failed?: boolean }
): Promise<void> {
  ensureWorker();

  const execution = await getExecution(executionId);
  if (!execution) return;
  if (execution.status !== "pending_approval" && execution.status !== "executing") return;

  const approvals = execution.state.approvals.map((entry) =>
    entry.id === approvalId
      ? {
          ...entry,
          status: options?.failed ? ("denied" as const) : ("granted" as const),
        }
      : entry
  );
  await updateExecutionState(executionId, {
    approvals,
    variables: {
      resumedApprovalId: approvalId,
      resumedAt: new Date().toISOString(),
      resumeFailed: Boolean(options?.failed),
    },
  });

  if (options?.failed) {
    const ctx = buildResumeContext(execution);
    setTurnContext(executionId, ctx);
    try {
      await updateExecutionStatus(executionId, "failed", { force: true });
      await runObserveReflectLearn(executionId, { failed: true, ctx });
    } finally {
      clearTurnContext(executionId);
    }
    return;
  }

  if (execution.status === "pending_approval") {
    await updateExecutionStatus(executionId, "executing");
  }

  const latest = (await getExecution(executionId)) ?? execution;
  const ctx = buildResumeContext(latest);
  setTurnContext(executionId, ctx);

  try {
    await runPlanSteps(executionId);
    const after = await getExecution(executionId);
    if (after?.status === "pending_approval") {
      // e.g. still awaiting UPI — leave paused without learning yet.
      return;
    }
    if (after?.status === "failed") {
      await runObserveReflectLearn(executionId, { failed: true, ctx });
      return;
    }
    await runObserveReflectLearn(executionId, { failed: false, ctx });
  } finally {
    clearTurnContext(executionId);
  }
}

function buildResumeContext(execution: Execution): TurnContext {
  const domain =
    typeof execution.state.variables.domain === "string"
      ? execution.state.variables.domain
      : typeof execution.state.variables.pendingActionDomain === "string"
        ? execution.state.variables.pendingActionDomain
        : "shopping";
  const conversationId = execution.state.context.conversationId || "";
  const userId = execution.userId || "atlas-demo-user";

  return {
    executionId: execution.id,
    userId,
    message: execution.goal,
    history: [],
    capabilities: {
      liveLlm: false,
      authenticated: userId !== "atlas-demo-user",
      persistence: userId !== "atlas-demo-user",
      approvals: userId !== "atlas-demo-user",
      memory: userId !== "atlas-demo-user",
    },
    conversationId,
    conversationSummary: "",
    domain,
    preferenceDomain: domain === "appointments" ? "general" : domain,
    planned: null,
    activeModel: null,
    tools: [],
    memories: [],
    safetyMemories: [],
    preferenceMemories: [],
    memoryMode: "none",
    memoryIntent: null,
    recommendation: null,
    toolCalls: [],
    toolResults: [],
    reply: "",
    trace: startRun({ conversationId, userId }),
    emit: () => {
      /* resume has no live SSE channel */
    },
  };
}

export async function findPendingExecutionForApproval(approvalId: string): Promise<string | null> {
  const { prisma } = await import("@/lib/atlas/server/prisma");
  const rows = await prisma.execution.findMany({
    where: { status: { in: ["pending_approval", "executing"] } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  for (const row of rows) {
    try {
      const state = JSON.parse(row.stateJson) as {
        approvals?: Array<{ id: string }>;
        variables?: { pendingActionId?: string };
      };
      if (
        state.approvals?.some((entry) => entry.id === approvalId) ||
        state.variables?.pendingActionId === approvalId
      ) {
        return row.id;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}
