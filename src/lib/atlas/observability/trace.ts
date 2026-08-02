import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";

export type ExecutionStageId =
  | "understanding"
  | "planning"
  | "memory"
  | "routing"
  | "loading_tools"
  | "reasoning"
  | "tool_execution"
  | "approval"
  | "composing"
  | "complete"
  | "error";

export const STAGE_LABELS: Record<ExecutionStageId, string> = {
  understanding: "Understanding request…",
  planning: "Planning next steps…",
  memory: "Checking preferences…",
  routing: "Choosing model & route…",
  loading_tools: "Loading connected tools…",
  reasoning: "Thinking…",
  tool_execution: "Running tools…",
  approval: "Preparing approval…",
  composing: "Composing reply…",
  complete: "Done",
  error: "Something went wrong",
};

export interface StageEvent {
  stage: ExecutionStageId;
  label: string;
  status: "started" | "completed" | "failed";
  detail?: string;
  durationMs?: number;
}

export interface StageRecord {
  stage: ExecutionStageId;
  label: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  detail?: string;
  status: "started" | "completed" | "failed";
}

export interface RunTrace {
  runId: string;
  conversationId?: string;
  userId?: string;
  domain?: string;
  modelId?: string;
  startedAt: number;
  stages: StageRecord[];
  toolsUsed: string[];
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
}

function createRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function startRun(partial?: Partial<Pick<RunTrace, "conversationId" | "userId">>): RunTrace {
  return {
    runId: createRunId(),
    conversationId: partial?.conversationId,
    userId: partial?.userId,
    startedAt: Date.now(),
    stages: [],
    toolsUsed: [],
  };
}

export function beginStage(trace: RunTrace, stage: ExecutionStageId, detail?: string): StageEvent {
  const label = detail ? `${STAGE_LABELS[stage]} ${detail}`.trim() : STAGE_LABELS[stage];
  const record: StageRecord = {
    stage,
    label,
    startedAt: Date.now(),
    status: "started",
    detail,
  };
  trace.stages.push(record);
  logStructured("stage.start", {
    runId: trace.runId,
    stage,
    detail,
  });
  return { stage, label, status: "started", detail };
}

export function endStage(
  trace: RunTrace,
  stage: ExecutionStageId,
  status: "completed" | "failed" = "completed",
  detail?: string
): StageEvent {
  for (let i = trace.stages.length - 1; i >= 0; i -= 1) {
    const record = trace.stages[i];
    if (record.stage === stage && record.status === "started") {
      record.endedAt = Date.now();
      record.durationMs = record.endedAt - record.startedAt;
      record.status = status;
      if (detail) record.detail = detail;
      logStructured("stage.end", {
        runId: trace.runId,
        stage,
        status,
        durationMs: record.durationMs,
        detail: detail ?? record.detail,
      });
      return {
        stage,
        label: record.label,
        status,
        detail: detail ?? record.detail,
        durationMs: record.durationMs,
      };
    }
  }

  const label = STAGE_LABELS[stage];
  return { stage, label, status, detail };
}

export function logStructured(event: string, fields: Record<string, unknown>) {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
  console.info(`[atlas] ${event}${payload ? ` ${payload}` : ""}`);
}

export async function persistTurnTrace(trace: RunTrace, success = true): Promise<void> {
  const totalMs = Date.now() - trace.startedAt;
  try {
    await prisma.turnTrace.upsert({
      where: { runId: trace.runId },
      create: {
        runId: trace.runId,
        conversationId: trace.conversationId,
        userId: trace.userId === "atlas-demo-user" ? null : trace.userId,
        domain: trace.domain,
        modelId: trace.modelId,
        stages: JSON.stringify(trace.stages),
        toolsUsed: JSON.stringify(trace.toolsUsed),
        tokensIn: trace.tokensIn,
        tokensOut: trace.tokensOut,
        success,
        error: trace.error,
        totalMs,
      },
      update: {
        stages: JSON.stringify(trace.stages),
        toolsUsed: JSON.stringify(trace.toolsUsed),
        tokensIn: trace.tokensIn,
        tokensOut: trace.tokensOut,
        success,
        error: trace.error,
        totalMs,
        domain: trace.domain,
        modelId: trace.modelId,
        conversationId: trace.conversationId,
      },
    });
  } catch (error) {
    logStructured("trace.persist_failed", {
      runId: trace.runId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  logStructured("turn.complete", {
    runId: trace.runId,
    success,
    totalMs,
    tools: trace.toolsUsed.join(","),
    model: trace.modelId,
    domain: trace.domain,
  });
}
