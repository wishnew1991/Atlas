/**
 * Observe → Reflect → Learn pipeline for completed (or failed) executions.
 * Deterministic core; optional LLM memory extraction when a model is available.
 */

import "server-only";

import { memoryService } from "@/lib/atlas/memory/service";
import { extractAndStoreMemories } from "@/lib/atlas/server/agent/memory";
import {
  appendExecutionEvent,
  addExecutionResult,
  getExecution,
  updateExecutionState,
  updateExecutionStatus,
} from "./manager";
import { getTurnContext, type TurnContext } from "./turn-context";
import type { Execution, ExecutionResult } from "./types";

export type Observation = {
  executionId: string;
  goal: string;
  domain: string;
  success: boolean;
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  toolsUsed: string[];
  toolSuccessCount: number;
  toolFailureCount: number;
  hadApproval: boolean;
  pendingApproval: boolean;
  durationMs: number;
  replyLength: number;
  outcomeSummary: string;
};

export type Reflection = {
  lessons: string[];
  preferenceHints: string[];
  planNotes: string[];
  confidence: number;
  source: "heuristic" | "mixed";
};

export type LearningUpdate = {
  memoriesStored: number;
  preferenceHints: string[];
  lessons: string[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function summarizeOutcome(execution: Execution, success: boolean, toolsUsed: string[]): string {
  const failed = execution.plan.steps.filter((step) => step.status === "failed").map((s) => s.id);
  if (!success || failed.length > 0) {
    return failed.length
      ? `Execution finished with failures in: ${failed.join(", ")}.`
      : "Execution failed before completing the plan.";
  }
  if (toolsUsed.length > 0) {
    return `Completed with tools: ${toolsUsed.join(", ")}.`;
  }
  return "Completed with a composed reply and no tool failures.";
}

function preferenceHintsFromTurn(ctx: TurnContext | undefined, observation: Observation): string[] {
  const hints: string[] = [];
  if (!ctx) return hints;

  const msg = ctx.message.toLowerCase();
  // Lightweight preference signals — durable facts only.
  if (/\b(vegetarian|vegan|halal|jain)\b/.test(msg)) {
    const match = msg.match(/\b(vegetarian|vegan|halal|jain)\b/);
    if (match) hints.push(`Dietary preference: ${match[1]}`);
  }
  if (/\bless spicy|not spicy|mild\b/.test(msg)) {
    hints.push("Prefers mild / less spicy food");
  }
  if (/\bextra spicy|very spicy\b/.test(msg)) {
    hints.push("Prefers spicy food");
  }
  if (/\bbudget|cheap|under\s*₹?\s*\d+/.test(msg)) {
    hints.push("Often asks with a budget constraint");
  }
  if (observation.domain && observation.domain !== "none") {
    hints.push(`Recent focus domain: ${observation.domain}`);
  }
  return hints.slice(0, 4);
}

export function observeExecution(
  execution: Execution,
  ctx?: TurnContext | null,
  options?: { failed?: boolean }
): Observation {
  const completedSteps = execution.plan.steps
    .filter((step) => step.status === "completed")
    .map((step) => step.id);
  const failedSteps = execution.plan.steps
    .filter((step) => step.status === "failed")
    .map((step) => step.id);
  const skippedSteps = execution.plan.steps
    .filter((step) => step.status === "skipped")
    .map((step) => step.id);

  const toolsUsed = Array.from(
    new Set([
      ...(ctx?.trace.toolsUsed ?? []),
      ...execution.results
        .map((result) => {
          const data = result.data;
          if (data && typeof data === "object" && "name" in data && typeof (data as { name: unknown }).name === "string") {
            return (data as { name: string }).name;
          }
          return null;
        })
        .filter((name): name is string => Boolean(name)),
    ])
  );

  const toolResults = ctx?.toolResults ?? [];
  const toolFailureCount = toolResults.filter((result) =>
    /\bfail|error|unavailable|not available\b/i.test(result.message)
  ).length;
  const toolSuccessCount = Math.max(0, toolResults.length - toolFailureCount);

  const success =
    !options?.failed &&
    failedSteps.length === 0 &&
    execution.status !== "failed" &&
    (Boolean(ctx?.reply?.trim()) || completedSteps.length > 0);

  const durationMs = Math.max(0, Date.now() - execution.createdAt.getTime());
  const domain = ctx?.domain || (typeof execution.state.variables.domain === "string"
    ? execution.state.variables.domain
    : "unknown");

  return {
    executionId: execution.id,
    goal: execution.goal,
    domain,
    success,
    completedSteps,
    failedSteps,
    skippedSteps,
    toolsUsed,
    toolSuccessCount,
    toolFailureCount,
    hadApproval: execution.state.approvals.some((entry) => entry.status === "granted"),
    pendingApproval: execution.status === "pending_approval",
    durationMs,
    replyLength: ctx?.reply?.trim().length ?? 0,
    outcomeSummary: summarizeOutcome(execution, success, toolsUsed),
  };
}

export function reflectOnOutcome(
  execution: Execution,
  observation: Observation,
  ctx?: TurnContext | null
): Reflection {
  const lessons: string[] = [];
  const planNotes: string[] = [];

  if (observation.success) {
    lessons.push("Plan completed without step failures.");
  } else if (observation.failedSteps.length > 0) {
    lessons.push(`Failed steps need attention: ${observation.failedSteps.join(", ")}.`);
    planNotes.push("Retry failed capabilities or add a fallback path for those steps.");
  } else {
    lessons.push("Execution ended without a successful completion signal.");
  }

  if (observation.toolFailureCount > 0) {
    lessons.push(`${observation.toolFailureCount} tool call(s) failed during the turn.`);
    planNotes.push("Prefer alternate tools or ask the user when tool errors repeat.");
  }

  if (observation.toolsUsed.length > 0 && observation.toolFailureCount === 0) {
    lessons.push(`Tools ${observation.toolsUsed.join(", ")} succeeded for this goal shape.`);
  }

  if (observation.hadApproval) {
    lessons.push("User granted approval mid-flow; keep spend/booking gates.");
  }

  if (observation.replyLength === 0 && observation.success === false) {
    planNotes.push("Ensure compose_reply always produces a user-visible answer on failure.");
  }

  if (observation.durationMs > 45_000) {
    planNotes.push("Turn was slow; consider tighter tool selection or fewer sequential steps.");
  }

  const preferenceHints = preferenceHintsFromTurn(ctx ?? undefined, observation);

  // Carry prior plan notes forward when present (continuous improvement signal).
  const priorNotes = asStringArray(execution.state.variables.planNotes);
  for (const note of priorNotes.slice(0, 2)) {
    if (!planNotes.includes(note)) planNotes.push(note);
  }

  const confidence = observation.success
    ? observation.toolFailureCount > 0
      ? 0.55
      : 0.8
    : 0.35;

  return {
    lessons: lessons.slice(0, 6),
    preferenceHints,
    planNotes: planNotes.slice(0, 6),
    confidence,
    source: "heuristic",
  };
}

async function storeLearningMemories(
  userId: string,
  reflection: Reflection,
  observation: Observation
): Promise<number> {
  if (!userId || userId === "atlas-demo-user") return 0;

  let stored = 0;
  const texts = [
    ...reflection.preferenceHints,
    ...reflection.lessons
      .filter((lesson) => lesson.includes("Tools ") && lesson.includes("succeeded"))
      .map((lesson) => `Execution pattern (${observation.domain}): ${lesson}`),
  ];

  for (const text of texts.slice(0, 5)) {
    const clean = text.trim();
    if (!clean) continue;
    try {
      await memoryService.rememberPlain(userId, clean, {
        kind: "user",
        type: clean.toLowerCase().includes("preference") || clean.toLowerCase().includes("prefers")
          ? "preference"
          : "habit",
        importance: 0.55,
        confidence: reflection.confidence,
      });
      stored += 1;
    } catch {
      /* best-effort */
    }
  }

  return stored;
}

export async function learnFromReflection(input: {
  execution: Execution;
  observation: Observation;
  reflection: Reflection;
  ctx?: TurnContext | null;
}): Promise<LearningUpdate> {
  const { execution, observation, reflection, ctx } = input;
  const userId = ctx?.userId || execution.userId;

  let memoriesStored = await storeLearningMemories(userId, reflection, observation);

  // Conversation-turn fact extraction (existing agent path) — part of learn, not a side effect.
  if (ctx?.activeModel && ctx.reply.trim() && userId && userId !== "atlas-demo-user") {
    try {
      await extractAndStoreMemories(userId, ctx.message, ctx.reply, ctx.activeModel);
      memoriesStored += 1; // signal that extraction ran; exact count is internal to extractor
    } catch {
      /* best-effort */
    }
  }

  await updateExecutionState(execution.id, {
    variables: {
      ...execution.state.variables,
      domain: observation.domain,
      observation,
      reflection,
      learning: {
        memoriesStored,
        preferenceHints: reflection.preferenceHints,
        lessons: reflection.lessons,
        learnedAt: new Date().toISOString(),
      },
      planNotes: reflection.planNotes,
      lastOutcomeSummary: observation.outcomeSummary,
    },
  });

  return {
    memoriesStored,
    preferenceHints: reflection.preferenceHints,
    lessons: reflection.lessons,
  };
}

/**
 * Drive observing → reflecting → completed (or learn-on-failure) with durable events.
 */
export async function runObserveReflectLearn(
  executionId: string,
  options?: { failed?: boolean; ctx?: TurnContext | null }
): Promise<{ observation: Observation; reflection: Reflection; learning: LearningUpdate } | null> {
  const ctx = options?.ctx ?? getTurnContext(executionId) ?? null;
  let execution = await getExecution(executionId);
  if (!execution) return null;
  if (execution.status === "pending_approval") return null;

  const failed = Boolean(options?.failed);

  if (failed) {
    if (execution.status !== "failed" && execution.status !== "cancelled") {
      try {
        await updateExecutionStatus(executionId, "failed", { force: true });
      } catch {
        /* ignore */
      }
      execution = (await getExecution(executionId)) ?? execution;
    }
  } else if (execution.status === "planning") {
    await updateExecutionStatus(executionId, "executing");
    await updateExecutionStatus(executionId, "observing");
    execution = (await getExecution(executionId)) ?? execution;
  } else if (execution.status === "executing") {
    await updateExecutionStatus(executionId, "observing");
    execution = (await getExecution(executionId)) ?? execution;
  } else if (execution.status !== "observing" && execution.status !== "reflecting") {
    // Already terminal or unexpected — still allow learning if completed stub was skipped.
    if (execution.status === "completed" || execution.status === "cancelled") {
      return null;
    }
  }

  const observation = observeExecution(execution, ctx, { failed });
  await appendExecutionEvent(executionId, "observed", {
    success: observation.success,
    domain: observation.domain,
    toolsUsed: observation.toolsUsed,
    failedSteps: observation.failedSteps,
    outcomeSummary: observation.outcomeSummary,
    durationMs: observation.durationMs,
  });

  if (!failed && execution.status === "observing") {
    await updateExecutionStatus(executionId, "reflecting");
    execution = (await getExecution(executionId)) ?? execution;
  }

  const reflection = reflectOnOutcome(execution, observation, ctx);
  await appendExecutionEvent(executionId, "reflected", {
    lessons: reflection.lessons,
    preferenceHints: reflection.preferenceHints,
    planNotes: reflection.planNotes,
    confidence: reflection.confidence,
    source: reflection.source,
  });

  const learning = await learnFromReflection({ execution, observation, reflection, ctx });
  await appendExecutionEvent(executionId, "learned", {
    memoriesStored: learning.memoriesStored,
    preferenceHints: learning.preferenceHints,
    lessons: learning.lessons,
  });

  // Attach a lifecycle result row for API consumers.
  const lifecycleResult: ExecutionResult = {
    stepId: failed ? "lifecycle_failed" : "lifecycle_complete",
    outcome: observation.success ? "success" : "failure",
    data: { observation, reflection, learning },
    artifacts: [],
    metrics: {
      duration: observation.durationMs,
      success: observation.success,
    },
    timestamp: new Date(),
  };
  await addExecutionResult(executionId, lifecycleResult);

  if (!failed) {
    const latest = await getExecution(executionId);
    if (latest && (latest.status === "reflecting" || latest.status === "observing")) {
      await updateExecutionStatus(executionId, "completed");
    }
  }

  return { observation, reflection, learning };
}
