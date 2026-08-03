/**
 * Background Job Queue System
 * Built with BullMQ for reliable job processing
 */

import { Queue, Worker, Job, QueueOptions } from 'bullmq';
import Redis from 'ioredis';

// Queue types
export enum QueueType {
  EXECUTION = 'execution',
  NOTIFICATION = 'notification',
  CLEANUP = 'cleanup',
  POLLING = 'polling',
  SCHEDULED = 'scheduled'
}

// Job types
export enum JobType {
  EXECUTION_STEP = 'execution-step',
  POLLING_CHECK = 'polling-check',
  NOTIFICATION_SEND = 'notification-send',
  MEMORY_CLEANUP = 'memory-cleanup',
  APPROVAL_EXPIRY = 'approval-expiry',
  TRIGGER_EVALUATION = 'trigger-evaluation'
}

// Queue configuration
const queueOptions: QueueOptions = {
  connection: process.env.REDIS_URL 
    ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new Redis({ maxRetriesPerRequest: null }), // In-memory for development
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 3600 * 24, // Remove jobs older than 24 hours
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs
    },
  },
};

// Queue instances
const queues = new Map<QueueType, Queue>();

/**
 * Get or create a queue instance
 */
export function getQueue(type: QueueType): Queue {
  if (!queues.has(type)) {
    const queue = new Queue(type, queueOptions);
    queues.set(type, queue);
  }
  return queues.get(type)!;
}

/**
 * Job data interfaces
 */
export interface ExecutionStepJob {
  executionId: string;
  stepId: string;
  stepNumber: number;
  parameters: Record<string, unknown>;
  retryCount: number;
}

export interface PollingCheckJob {
  capabilityId: string;
  endpoint: string;
  condition: string;
  interval: number;
}

export interface NotificationSendJob {
  userId: string;
  type: 'push' | 'email' | 'in-app';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface MemoryCleanupJob {
  userId: string;
  memoryType?: string;
  olderThan: Date;
}

export interface ApprovalExpiryJob {
  approvalId: string;
  userId: string;
}

export interface TriggerEvaluationJob {
  triggerId: string;
  userId: string;
  triggerType: string;
}

/**
 * Add a job to a queue
 */
export async function addJob<T extends Record<string, unknown>>(
  type: QueueType,
  jobType: JobType,
  data: T,
  options?: {
    delay?: number;
    priority?: number;
    jobId?: string;
  }
): Promise<Job<T>> {
  const queue = getQueue(type);
  return queue.add(jobType, data, {
    ...options,
    priority: options?.priority || 0,
  });
}

/**
 * Add a delayed job
 */
export async function addDelayedJob<T extends Record<string, unknown>>(
  type: QueueType,
  jobType: JobType,
  data: T,
  delay: number
): Promise<Job<T>> {
  return addJob(type, jobType, data, { delay });
}

/**
 * Get job status
 */
export async function getJobStatus(
  type: QueueType,
  jobId: string
): Promise<{
  id: string;
  name: string;
  progress: number;
  data: unknown;
  failedReason: string | null;
  processedOn: number | null;
  finishedOn: number | null;
} | null> {
  const queue = getQueue(type);
  const job = await queue.getJob(jobId);
  
  if (!job) return null;
  
  const state = await job.getState();
  const progress = job.progress;
  
  return {
    id: job.id,
    name: job.name,
    progress: typeof progress === 'number' ? progress : 0,
    data: job.data,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };
}

/**
 * Remove a job
 */
export async function removeJob(type: QueueType, jobId: string): Promise<boolean> {
  const queue = getQueue(type);
  const job = await queue.getJob(jobId);
  
  if (!job) return false;
  
  await job.remove();
  return true;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(type: QueueType): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue(type);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  
  return { waiting, active, completed, failed, delayed };
}

/**
 * Clean up old jobs
 */
export async function cleanQueue(
  type: QueueType,
  grace: number = 5000
): Promise<void> {
  const queue = getQueue(type);
  await queue.clean(grace, 'completed');
  await queue.clean(grace, 'failed');
}

/**
 * Close all queue connections
 */
export async function closeQueues(): Promise<void> {
  await Promise.all(
    Array.from(queues.values()).map(queue => queue.close())
  );
  queues.clear();
}
