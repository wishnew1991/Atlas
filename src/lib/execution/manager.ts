/**
 * Execution Manager — Prisma-backed lifecycle + status state machine.
 */

import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import type {
  Execution,
  ExecutionPlan,
  ExecutionRequest,
  ExecutionResponse,
  ExecutionResult,
  ExecutionState,
  ExecutionStatus,
  ChatToExecutionContext,
  ChatExecution,
} from "./types";
import {
  deserializeMetadata,
  deserializePlan,
  deserializeResults,
  deserializeState,
  rowToExecution,
  serializeMetadata,
  serializePlan,
  serializeResults,
  serializeState,
} from "./serialize";

const ALLOWED_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  planning: ["executing", "pending_approval", "failed", "cancelled"],
  pending_approval: ["executing", "cancelled", "failed"],
  executing: ["observing", "pending_approval", "completed", "failed", "blocked", "cancelled"],
  observing: ["reflecting", "completed", "failed", "cancelled"],
  reflecting: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
  blocked: ["executing", "pending_approval", "cancelled", "failed"],
};

function dbUserId(userId: string): string | null {
  return userId === "atlas-demo-user" ? null : userId;
}

function assertTransition(from: ExecutionStatus, to: ExecutionStatus) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid execution status transition: ${from} → ${to}`);
  }
}

export async function createExecution(
  request: ExecutionRequest,
  userId: string,
  extras?: { conversationId?: string; runId?: string }
): Promise<Execution> {
  const emptyPlan: ExecutionPlan = {
    steps: [],
    dependencies: { nodes: new Map(), edges: [] },
    resources: [],
  };
  const state: ExecutionState = {
    variables: {},
    context: request.context ?? { environment: {} },
    approvals: [],
    progress: { currentStep: 0, totalSteps: 0, percentage: 0 },
  };

  const row = await prisma.execution.create({
    data: {
      userId: dbUserId(userId),
      goal: request.goal,
      type: request.type || "immediate",
      status: "planning",
      planJson: serializePlan(emptyPlan),
      stateJson: serializeState(state),
      resultsJson: serializeResults([]),
      metadataJson: serializeMetadata({
        source: "chat",
        priority: "normal",
        tags: [],
      }),
      conversationId: extras?.conversationId ?? request.context?.conversationId ?? null,
      runId: extras?.runId ?? null,
    },
  });

  await appendExecutionEvent(row.id, "created", { goal: request.goal });
  return rowToExecution(row);
}

export async function createExecutionFromChat(
  context: ChatToExecutionContext,
  extras?: { runId?: string }
): Promise<Execution> {
  return createExecution(
    {
      goal: context.message,
      type: "immediate",
      context: {
        conversationId: context.conversationId,
        environment: { capabilities: context.capabilities },
      },
    },
    context.userId,
    { conversationId: context.conversationId, runId: extras?.runId }
  );
}

export async function getExecution(executionId: string): Promise<Execution | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  return row ? rowToExecution(row) : null;
}

export async function updateExecutionStatus(
  executionId: string,
  status: ExecutionStatus,
  options?: { force?: boolean }
): Promise<Execution | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) return null;

  const current = row.status as ExecutionStatus;
  if (current !== status) {
    if (!options?.force) {
      assertTransition(current, status);
    }
  }

  const updated = await prisma.execution.update({
    where: { id: executionId },
    data: {
      status,
      completedAt:
        status === "completed" || status === "failed" || status === "cancelled"
          ? new Date()
          : row.completedAt,
    },
  });

  await appendExecutionEvent(executionId, "status", { from: current, to: status });
  return rowToExecution(updated);
}

export async function updateExecutionPlan(
  executionId: string,
  plan: ExecutionPlan
): Promise<Execution | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) return null;

  const state = deserializeState(row.stateJson);
  state.progress.totalSteps = plan.steps.length;
  state.progress.percentage =
    state.progress.totalSteps > 0
      ? (state.progress.currentStep / state.progress.totalSteps) * 100
      : 0;

  const updated = await prisma.execution.update({
    where: { id: executionId },
    data: {
      planJson: serializePlan(plan),
      stateJson: serializeState(state),
    },
  });

  await appendExecutionEvent(executionId, "plan_updated", { steps: plan.steps.length });
  return rowToExecution(updated);
}

export async function addExecutionResult(
  executionId: string,
  result: ExecutionResult
): Promise<Execution | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) return null;

  const results = deserializeResults(row.resultsJson);
  results.push(result);

  const updated = await prisma.execution.update({
    where: { id: executionId },
    data: { resultsJson: serializeResults(results) },
  });

  await appendExecutionEvent(executionId, "result", { stepId: result.stepId, outcome: result.outcome });
  return rowToExecution(updated);
}

export async function updateExecutionState(
  executionId: string,
  patch: Partial<ExecutionState>
): Promise<Execution | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) return null;

  const state = { ...deserializeState(row.stateJson), ...patch };
  if (patch.variables) {
    state.variables = { ...deserializeState(row.stateJson).variables, ...patch.variables };
  }
  if (patch.context) {
    state.context = { ...deserializeState(row.stateJson).context, ...patch.context };
  }
  if (patch.approvals) {
    state.approvals = patch.approvals;
  }
  if (patch.progress) {
    state.progress = { ...deserializeState(row.stateJson).progress, ...patch.progress };
  }

  const updated = await prisma.execution.update({
    where: { id: executionId },
    data: { stateJson: serializeState(state) },
  });

  return rowToExecution(updated);
}

export async function updateExecutionSteps(
  executionId: string,
  steps: ExecutionPlan["steps"]
): Promise<Execution | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) return null;
  const plan = deserializePlan(row.planJson);
  plan.steps = steps;
  const nodes = new Map(steps.map((step) => [step.id, step]));
  plan.dependencies = { nodes, edges: plan.dependencies.edges };
  return updateExecutionPlan(executionId, plan);
}

export async function incrementExecutionProgress(executionId: string): Promise<Execution | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) return null;
  const state = deserializeState(row.stateJson);
  state.progress.currentStep += 1;
  state.progress.percentage =
    state.progress.totalSteps > 0
      ? (state.progress.currentStep / state.progress.totalSteps) * 100
      : 0;
  return updateExecutionState(executionId, { progress: state.progress });
}

export async function cancelExecution(executionId: string): Promise<Execution | null> {
  return updateExecutionStatus(executionId, "cancelled");
}

export async function getUserExecutions(userId: string, limit = 50): Promise<Execution[]> {
  const rows = await prisma.execution.findMany({
    where: { userId: dbUserId(userId) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(rowToExecution);
}

export async function listExecutionsByConversation(
  conversationId: string,
  limit = 50
): Promise<Execution[]> {
  const rows = await prisma.execution.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(rowToExecution);
}

export async function appendExecutionEvent(
  executionId: string,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.executionEvent.create({
      data: {
        executionId,
        type,
        payload: JSON.stringify(payload),
      },
    });
  } catch {
    /* event logging is best-effort */
  }
}

export function executionToChatExecution(execution: Execution): ChatExecution {
  return {
    id: execution.id,
    userId: execution.userId,
    goal: execution.goal,
    status: execution.status,
    currentStep: execution.plan.steps[execution.state.progress.currentStep]?.description,
    result:
      execution.results.length > 0
        ? JSON.stringify(execution.results[execution.results.length - 1].data)
        : undefined,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
  };
}

export function getExecutionResponse(execution: Execution): ExecutionResponse {
  const response: ExecutionResponse = {
    executionId: execution.id,
    status: execution.status,
    plan: execution.plan,
  };

  if (execution.status === "planning") {
    response.message = "Planning execution...";
  } else if (execution.status === "pending_approval") {
    response.approvalRequired = true;
    response.approvalId = execution.state.approvals.find((a) => a.status === "pending")?.id;
    response.message = "Approval required for execution";
  } else if (execution.status === "executing") {
    response.message = "Executing plan...";
  } else if (execution.status === "completed") {
    response.result = execution.results[execution.results.length - 1];
    response.message = "Execution completed successfully";
  } else if (execution.status === "failed") {
    response.error = "Execution failed";
    response.message = "Execution encountered an error";
  }

  return response;
}

/** Public snapshot for APIs (no secrets). */
export function toPublicExecution(execution: Execution) {
  const observation = execution.state.variables.observation;
  const reflection = execution.state.variables.reflection;
  const learning = execution.state.variables.learning;

  return {
    id: execution.id,
    goal: execution.goal,
    type: execution.type,
    status: execution.status,
    progress: execution.state.progress,
    steps: execution.plan.steps.map((step) => ({
      id: step.id,
      description: step.description,
      status: step.status,
      capability: step.capability.name,
    })),
    approvals: execution.state.approvals,
    results: execution.results.map((result) => ({
      stepId: result.stepId,
      outcome: result.outcome,
      timestamp: result.timestamp,
    })),
    learning:
      observation || reflection || learning
        ? {
            outcomeSummary:
              typeof observation === "object" &&
              observation &&
              "outcomeSummary" in observation &&
              typeof (observation as { outcomeSummary?: unknown }).outcomeSummary === "string"
                ? (observation as { outcomeSummary: string }).outcomeSummary
                : undefined,
            lessons:
              typeof reflection === "object" &&
              reflection &&
              "lessons" in reflection &&
              Array.isArray((reflection as { lessons?: unknown }).lessons)
                ? (reflection as { lessons: string[] }).lessons
                : [],
            preferenceHints:
              typeof reflection === "object" &&
              reflection &&
              "preferenceHints" in reflection &&
              Array.isArray((reflection as { preferenceHints?: unknown }).preferenceHints)
                ? (reflection as { preferenceHints: string[] }).preferenceHints
                : [],
            planNotes:
              typeof reflection === "object" &&
              reflection &&
              "planNotes" in reflection &&
              Array.isArray((reflection as { planNotes?: unknown }).planNotes)
                ? (reflection as { planNotes: string[] }).planNotes
                : [],
          }
        : undefined,
    conversationId: execution.state.context.conversationId,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    completedAt: execution.completedAt,
  };
}

// Re-export helpers used by engine
export { deserializePlan, deserializeState, deserializeResults, deserializeMetadata };
