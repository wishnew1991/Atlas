/**
 * Dead Letter Queue Management
 * Handles failed jobs and retry logic
 */

import { Queue, Job } from 'bullmq';
import { QueueType } from './index';

// Dead letter queue name
const DEAD_LETTER_QUEUE = 'dead-letter';

/**
 * Move a failed job to dead letter queue
 */
export async function moveToDeadLetter(
  originalQueue: QueueType,
  jobId: string,
  failureReason: string
): Promise<void> {
  const { getQueue } = await import('./index');
  const originalQueueInstance = getQueue(originalQueue);
  const job = await originalQueueInstance.getJob(jobId);
  
  if (!job) {
    throw new Error(`Job ${jobId} not found in queue ${originalQueue}`);
  }

  const deadLetterQueue = getQueue(DEAD_LETTER_QUEUE as QueueType);
  
  await deadLetterQueue.add(
    `${originalQueue}-${job.name}`,
    {
      originalQueue,
      originalJobId: jobId,
      jobName: job.name,
      jobData: job.data,
      failureReason,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
      timestamp: Date.now(),
    },
    {
      jobId: `${originalQueue}-${jobId}`,
      removeOnComplete: false,
      removeOnFail: false,
    }
  );

  // Remove from original queue
  await job.remove();
}

/**
 * Inspect dead letter queue
 */
export async function inspectDeadLetter(): Promise<Array<{
  id: string;
  originalQueue: QueueType;
  originalJobId: string;
  jobName: string;
  jobData: unknown;
  failureReason: string;
  failedAt: string;
  attempts: number;
  timestamp: number;
}>> {
  const { getQueue } = await import('./index');
  const deadLetterQueue = getQueue(DEAD_LETTER_QUEUE as QueueType);
  
  const jobs = await deadLetterQueue.getFailed();
  
  return jobs.map(job => job.data as {
    id: string;
    originalQueue: QueueType;
    originalJobId: string;
    jobName: string;
    jobData: unknown;
    failureReason: string;
    failedAt: string;
    attempts: number;
    timestamp: number;
  });
}

/**
 * Retry a dead letter job
 */
export async function retryDeadLetterJob(
  deadLetterJobId: string
): Promise<void> {
  const { getQueue, addJob } = await import('./index');
  const deadLetterQueue = getQueue(DEAD_LETTER_QUEUE as QueueType);
  
  const deadLetterJob = await deadLetterQueue.getJob(deadLetterJobId);
  
  if (!deadLetterJob) {
    throw new Error(`Dead letter job ${deadLetterJobId} not found`);
  }

  const jobData = deadLetterJob.data as {
    originalQueue: QueueType;
    originalJobId: string;
    jobName: string;
    jobData: unknown;
  };

  // Re-add to original queue
  await addJob(
    jobData.originalQueue,
    jobData.jobName as any,
    jobData.jobData as Record<string, unknown>,
    {
      jobId: jobData.originalJobId,
      attempts: 0, // Reset attempt count
    }
  );

  // Remove from dead letter queue
  await deadLetterJob.remove();
}

/**
 * Delete a dead letter job
 */
export async function deleteDeadLetterJob(
  deadLetterJobId: string
): Promise<void> {
  const { getQueue } = await import('./index');
  const deadLetterQueue = getQueue(DEAD_LETTER_QUEUE as QueueType);
  
  const job = await deadLetterQueue.getJob(deadLetterJobId);
  
  if (job) {
    await job.remove();
  }
}

/**
 * Clear dead letter queue
 */
export async function clearDeadLetterQueue(): Promise<number> {
  const { getQueue, cleanQueue } = await import('./index');
  const deadLetterQueue = getQueue(DEAD_LETTER_QUEUE as QueueType);
  
  const jobs = await deadLetterQueue.getFailed();
  const count = jobs.length;
  
  await cleanQueue(DEAD_LETTER_QUEUE as QueueType, 0);
  
  return count;
}

/**
 * Get dead letter queue statistics
 */
export async function getDeadLetterStats(): Promise<{
  totalJobs: number;
  byOriginalQueue: Record<QueueType, number>;
  byJobName: Record<string, number>;
  recentFailures: Array<{
    originalQueue: QueueType;
    jobName: string;
    failureReason: string;
    failedAt: string;
  }>;
}> {
  const jobs = await inspectDeadLetter();
  
  const byOriginalQueue: Record<string, number> = {};
  const byJobName: Record<string, number> = {};
  
  jobs.forEach(job => {
    byOriginalQueue[job.originalQueue] = (byOriginalQueue[job.originalQueue] || 0) + 1;
    byJobName[job.jobName] = (byJobName[job.jobName] || 0) + 1;
  });
  
  const recentFailures = jobs
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
    .map(job => ({
      originalQueue: job.originalQueue,
      jobName: job.jobName,
      failureReason: job.failureReason,
      failedAt: job.failedAt,
    }));
  
  return {
    totalJobs: jobs.length,
    byOriginalQueue: byOriginalQueue as Record<QueueType, number>,
    byJobName,
    recentFailures,
  };
}
