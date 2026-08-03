/**
 * Job Scheduler
 * Handles scheduled and recurring jobs
 */

import { addDelayedJob, addJob, QueueType, JobType } from './index';
import type {
  PollingCheckJob,
  MemoryCleanupJob,
  ApprovalExpiryJob,
  TriggerEvaluationJob,
} from './index';

/**
 * Schedule a recurring polling job
 */
export async function schedulePollingJob(
  capabilityId: string,
  endpoint: string,
  condition: string,
  interval: number
): Promise<void> {
  const job: PollingCheckJob = {
    capabilityId,
    endpoint,
    condition,
    interval,
  };

  await addJob(QueueType.POLLING, JobType.POLLING_CHECK, job);
  
  // Schedule next poll
  await addDelayedJob(
    QueueType.POLLING,
    JobType.POLLING_CHECK,
    job,
    interval * 1000 // Convert to milliseconds
  );
}

/**
 * Schedule memory cleanup job
 */
export async function scheduleMemoryCleanup(
  userId: string,
  memoryType?: string,
  olderThanHours: number = 24
): Promise<void> {
  const job: MemoryCleanupJob = {
    userId,
    memoryType,
    olderThan: new Date(Date.now() - olderThanHours * 60 * 60 * 1000),
  };

  await addJob(QueueType.CLEANUP, JobType.MEMORY_CLEANUP, job);
}

/**
 * Schedule approval expiry check
 */
export async function scheduleApprovalExpiry(
  approvalId: string,
  userId: string,
  expiresAt: Date
): Promise<void> {
  const delay = expiresAt.getTime() - Date.now();
  
  if (delay > 0) {
    const job: ApprovalExpiryJob = {
      approvalId,
      userId,
    };

    await addDelayedJob(
      QueueType.EXECUTION,
      JobType.APPROVAL_EXPIRY,
      job,
      delay
    );
  }
}

/**
 * Schedule trigger evaluation
 */
export async function scheduleTriggerEvaluation(
  triggerId: string,
  userId: string,
  triggerType: string,
  scheduleTime?: Date
): Promise<void> {
  const job: TriggerEvaluationJob = {
    triggerId,
    userId,
    triggerType,
  };

  if (scheduleTime && scheduleTime > new Date()) {
    const delay = scheduleTime.getTime() - Date.now();
    await addDelayedJob(
      QueueType.SCHEDULED,
      JobType.TRIGGER_EVALUATION,
      job,
      delay
    );
  } else {
    await addJob(QueueType.SCHEDULED, JobType.TRIGGER_EVALUATION, job);
  }
}

/**
 * Schedule recurring trigger evaluation
 */
export async function scheduleRecurringTriggerEvaluation(
  triggerId: string,
  userId: string,
  triggerType: string,
  interval: number
): Promise<void> {
  const job: TriggerEvaluationJob = {
    triggerId,
    userId,
    triggerType,
  };

  // Add initial job
  await addJob(QueueType.SCHEDULED, JobType.TRIGGER_EVALUATION, job);
  
  // Schedule recurring job
  await addDelayedJob(
    QueueType.SCHEDULED,
    JobType.TRIGGER_EVALUATION,
    job,
    interval * 1000
  );
}

/**
 * Cancel scheduled job
 */
export async function cancelScheduledJob(
  type: QueueType,
  jobId: string
): Promise<boolean> {
  const { removeJob } = await import('./index');
  return removeJob(type, jobId);
}

/**
 * Get scheduled jobs for a user
 */
export async function getScheduledJobsForUser(
  userId: string
): Promise<Array<{ type: QueueType; jobId: string; data: unknown }>> {
  // TODO: Implement retrieval of scheduled jobs by user
  // This requires querying the queue for jobs with specific user data
  return [];
}
