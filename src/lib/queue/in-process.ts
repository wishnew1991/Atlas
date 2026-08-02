/**
 * In-process job runner for EXECUTION_STEP jobs only.
 * No Redis required — Atlas uses this until Execution Engine is solid.
 */

export type InProcessJobHandler<T> = (data: T, meta: { attemptsMade: number; jobId: string }) => Promise<void>;

type QueuedJob<T> = {
  id: string;
  data: T;
  attemptsMade: number;
  maxAttempts: number;
  runAt: number;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 2;
const BASE_DELAY_MS = 400;

class InProcessQueue<T extends Record<string, unknown>> {
  private pending: QueuedJob<T>[] = [];
  private active = 0;
  private handler: InProcessJobHandler<T> | null = null;
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(handler: InProcessJobHandler<T>) {
    this.handler = handler;
    this.started = true;
    this.pump();
  }

  isStarted() {
    return this.started && Boolean(this.handler);
  }

  enqueue(
    data: T,
    options?: { delayMs?: number; jobId?: string }
  ): Promise<{ jobId: string }> {
    const id = options?.jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return new Promise<{ jobId: string }>((resolve, reject) => {
      this.pending.push({
        id,
        data,
        attemptsMade: 0,
        maxAttempts: MAX_ATTEMPTS,
        runAt: Date.now() + (options?.delayMs ?? 0),
        resolve: () => resolve({ jobId: id }),
        reject,
      });
      this.pump();
    });
  }

  private pump() {
    if (!this.handler) return;

    while (this.active < CONCURRENCY) {
      const now = Date.now();
      const index = this.pending.findIndex((job) => job.runAt <= now);
      if (index < 0) {
        this.scheduleNext();
        return;
      }

      const [job] = this.pending.splice(index, 1);
      if (!job) return;

      this.active += 1;
      void this.run(job);
    }
  }

  private scheduleNext() {
    if (this.timer || this.pending.length === 0) return;
    const nextAt = Math.min(...this.pending.map((job) => job.runAt));
    const delay = Math.max(10, nextAt - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pump();
    }, delay);
  }

  private async run(job: QueuedJob<T>) {
    try {
      await this.handler!(job.data, { attemptsMade: job.attemptsMade, jobId: job.id });
      job.resolve();
    } catch (error) {
      job.attemptsMade += 1;
      if (job.attemptsMade < job.maxAttempts) {
        const delay = BASE_DELAY_MS * 2 ** (job.attemptsMade - 1);
        job.runAt = Date.now() + delay;
        this.pending.push(job);
      } else {
        console.error(`[in-process] job ${job.id} failed permanently`, error);
        job.reject(error);
      }
    } finally {
      this.active -= 1;
      this.pump();
    }
  }
}

export type ExecutionStepJobData = {
  executionId: string;
  stepId: string;
  stepNumber: number;
  parameters: Record<string, unknown>;
  retryCount: number;
};

const executionQueue = new InProcessQueue<ExecutionStepJobData>();

export function ensureExecutionWorkerStarted(
  handler: InProcessJobHandler<ExecutionStepJobData>
): void {
  if (!executionQueue.isStarted()) {
    executionQueue.start(handler);
  }
}

export async function enqueueExecutionStep(
  data: ExecutionStepJobData,
  options?: { delayMs?: number; jobId?: string }
): Promise<{ jobId: string }> {
  return executionQueue.enqueue(data, options);
}
