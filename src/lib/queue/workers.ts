/**
 * Execution workers — EXECUTION_STEP only via in-process runner.
 * BullMQ/Redis workers are not started in this phase.
 */

import { handleExecutionStepJob } from "@/lib/execution/steps";
import {
  ensureExecutionWorkerStarted,
  enqueueExecutionStep,
  type ExecutionStepJobData,
} from "@/lib/queue/in-process";

export function startExecutionWorkers(): void {
  ensureExecutionWorkerStarted(async (data: ExecutionStepJobData) => {
    await handleExecutionStepJob(data);
  });
}

export { enqueueExecutionStep, handleExecutionStepJob };
