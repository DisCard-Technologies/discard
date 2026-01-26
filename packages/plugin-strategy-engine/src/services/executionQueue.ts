/**
 * Execution Queue Service
 *
 * Manages the execution of triggered strategies using BullMQ.
 * Handles job scheduling, retries, and execution flow.
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import type { Strategy, StrategyExecution } from '../types/strategy.js';
import type { TriggerCondition, ConditionEvaluationResult } from '../types/conditions.js';
import type { StrategyStore } from './strategyStore.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ExecutionQueueConfig {
  /** Redis connection for BullMQ */
  redisConnection: Redis;
  /** Queue name prefix */
  queuePrefix: string;
  /** Maximum concurrent executions */
  maxConcurrency: number;
  /** Default job timeout in milliseconds */
  defaultTimeoutMs: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
  /** Whether to remove completed jobs */
  removeOnComplete: boolean;
  /** How long to keep failed jobs (seconds) */
  failedJobRetentionSeconds: number;
}

const DEFAULT_CONFIG: Partial<ExecutionQueueConfig> = {
  queuePrefix: 'discard:strategy',
  maxConcurrency: 5,
  defaultTimeoutMs: 60000, // 1 minute
  maxRetries: 3,
  retryDelayMs: 5000,
  removeOnComplete: true,
  failedJobRetentionSeconds: 86400, // 24 hours
};

// ============================================================================
// Job Types
// ============================================================================

export type ExecutionJobType =
  | 'dca_execution'
  | 'stop_loss_execution'
  | 'take_profit_execution'
  | 'goal_contribution'
  | 'yield_harvest'
  | 'rebalance'
  | 'custom_execution';

export interface ExecutionJobData {
  jobId: string;
  jobType: ExecutionJobType;
  strategyId: string;
  userId: string;
  conditionId?: string;
  evaluation?: ConditionEvaluationResult;
  params: Record<string, unknown>;
  createdAt: number;
  scheduledAt?: number;
}

export interface ExecutionJobResult {
  success: boolean;
  execution?: StrategyExecution;
  error?: string;
  transactionSignature?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Execution Handlers
// ============================================================================

export type ExecutionHandler = (
  job: Job<ExecutionJobData>,
  strategy: Strategy
) => Promise<ExecutionJobResult>;

// ============================================================================
// Execution Queue Service
// ============================================================================

export class ExecutionQueue {
  private config: ExecutionQueueConfig;
  private store: StrategyStore;
  private queue: Queue<ExecutionJobData, ExecutionJobResult>;
  private worker: Worker<ExecutionJobData, ExecutionJobResult> | null = null;
  private queueEvents: QueueEvents | null = null;
  private handlers: Map<ExecutionJobType, ExecutionHandler> = new Map();
  private initialized: boolean = false;
  private running: boolean = false;

  // Callbacks
  private onExecutionComplete?: (
    strategyId: string,
    execution: StrategyExecution
  ) => Promise<void>;
  private onExecutionFailed?: (
    strategyId: string,
    error: string,
    jobData: ExecutionJobData
  ) => Promise<void>;

  // Metrics
  private metrics = {
    totalJobsQueued: 0,
    totalJobsCompleted: 0,
    totalJobsFailed: 0,
    averageExecutionTimeMs: 0,
    activeJobs: 0,
  };

  constructor(
    store: StrategyStore,
    redis: Redis,
    config: Partial<ExecutionQueueConfig> = {}
  ) {
    this.store = store;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      redisConnection: redis,
    } as ExecutionQueueConfig;

    // Initialize queue
    this.queue = new Queue<ExecutionJobData, ExecutionJobResult>(
      `${this.config.queuePrefix}:executions`,
      {
        connection: redis,
        defaultJobOptions: {
          attempts: this.config.maxRetries,
          backoff: {
            type: 'exponential',
            delay: this.config.retryDelayMs,
          },
          removeOnComplete: this.config.removeOnComplete,
          removeOnFail: {
            age: this.config.failedJobRetentionSeconds,
          },
        },
      }
    );
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Set up queue events
    this.queueEvents = new QueueEvents(`${this.config.queuePrefix}:executions`, {
      connection: this.config.redisConnection.duplicate(),
    });

    this.queueEvents.on('completed', async ({ jobId, returnvalue }) => {
      const result = (typeof returnvalue === 'string'
        ? JSON.parse(returnvalue)
        : returnvalue) as ExecutionJobResult;
      if (result.execution) {
        const job = await this.queue.getJob(jobId);
        if (job) {
          await this.handleJobCompleted(job.data, result);
        }
      }
    });

    this.queueEvents.on('failed', async ({ jobId, failedReason }) => {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await this.handleJobFailed(job.data, failedReason);
      }
    });

    this.initialized = true;
    console.log('[ExecutionQueue] Initialized');
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.initialized) {
      await this.initialize();
    }

    // Create worker
    this.worker = new Worker<ExecutionJobData, ExecutionJobResult>(
      `${this.config.queuePrefix}:executions`,
      async (job) => this.processJob(job),
      {
        connection: this.config.redisConnection.duplicate(),
        concurrency: this.config.maxConcurrency,
      }
    );

    this.worker.on('active', () => {
      this.metrics.activeJobs++;
    });

    this.worker.on('completed', () => {
      this.metrics.activeJobs--;
      this.metrics.totalJobsCompleted++;
    });

    this.worker.on('failed', () => {
      this.metrics.activeJobs--;
      this.metrics.totalJobsFailed++;
    });

    this.running = true;
    console.log('[ExecutionQueue] Worker started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    this.running = false;
    console.log('[ExecutionQueue] Worker stopped');
  }

  async shutdown(): Promise<void> {
    await this.stop();

    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
    }

    await this.queue.close();
    this.initialized = false;
    console.log('[ExecutionQueue] Shutdown complete');
  }

  // ==========================================================================
  // Job Processing
  // ==========================================================================

  /**
   * Process a job
   */
  private async processJob(job: Job<ExecutionJobData>): Promise<ExecutionJobResult> {
    const startTime = Date.now();
    const { strategyId, jobType } = job.data;

    console.log(`[ExecutionQueue] Processing job ${job.id}: ${jobType} for strategy ${strategyId}`);

    try {
      // Get strategy
      const strategy = await this.store.get(strategyId);
      if (!strategy) {
        throw new Error(`Strategy not found: ${strategyId}`);
      }

      // Check strategy is still active or triggered
      if (!['active', 'triggered'].includes(strategy.status)) {
        console.log(`[ExecutionQueue] Strategy ${strategyId} is ${strategy.status}, skipping execution`);
        return { success: false, error: `Strategy is ${strategy.status}` };
      }

      // Get handler
      const handler = this.handlers.get(jobType);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${jobType}`);
      }

      // Execute handler
      const result = await handler(job, strategy);

      // Update metrics
      const executionTime = Date.now() - startTime;
      this.updateAverageExecutionTime(executionTime);

      console.log(
        `[ExecutionQueue] Job ${job.id} completed in ${executionTime}ms: ${result.success ? 'success' : 'failed'}`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ExecutionQueue] Job ${job.id} error:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle completed job
   */
  private async handleJobCompleted(
    jobData: ExecutionJobData,
    result: ExecutionJobResult
  ): Promise<void> {
    if (!result.execution) return;

    try {
      // Record execution in store
      await this.store.recordExecution(jobData.strategyId, result.execution);

      // Call callback
      if (this.onExecutionComplete) {
        await this.onExecutionComplete(jobData.strategyId, result.execution);
      }
    } catch (error) {
      console.error('[ExecutionQueue] Error handling completed job:', error);
    }
  }

  /**
   * Handle failed job
   */
  private async handleJobFailed(
    jobData: ExecutionJobData,
    error: string
  ): Promise<void> {
    try {
      // Create failed execution record
      const execution: StrategyExecution = {
        executionId: `exec_${uuidv4()}`,
        strategyId: jobData.strategyId,
        startedAt: jobData.createdAt,
        completedAt: Date.now(),
        success: false,
        error,
        triggeredBy: jobData.conditionId,
      };

      await this.store.recordExecution(jobData.strategyId, execution);

      // Call callback
      if (this.onExecutionFailed) {
        await this.onExecutionFailed(jobData.strategyId, error, jobData);
      }
    } catch (err) {
      console.error('[ExecutionQueue] Error handling failed job:', err);
    }
  }

  // ==========================================================================
  // Job Enqueueing
  // ==========================================================================

  /**
   * Enqueue an execution job
   */
  async enqueue(
    jobType: ExecutionJobType,
    strategyId: string,
    userId: string,
    params: Record<string, unknown>,
    options: {
      conditionId?: string;
      evaluation?: ConditionEvaluationResult;
      delay?: number;
      priority?: number;
    } = {}
  ): Promise<string> {
    const jobId = `job_${uuidv4()}`;

    const jobData: ExecutionJobData = {
      jobId,
      jobType,
      strategyId,
      userId,
      conditionId: options.conditionId,
      evaluation: options.evaluation,
      params,
      createdAt: Date.now(),
      scheduledAt: options.delay ? Date.now() + options.delay : undefined,
    };

    await this.queue.add(jobType, jobData, {
      jobId,
      delay: options.delay,
      priority: options.priority,
    });

    this.metrics.totalJobsQueued++;

    console.log(`[ExecutionQueue] Enqueued job ${jobId}: ${jobType} for strategy ${strategyId}`);

    return jobId;
  }

  /**
   * Enqueue a DCA execution
   */
  async enqueueDCAExecution(
    strategy: Strategy,
    condition?: TriggerCondition,
    evaluation?: ConditionEvaluationResult
  ): Promise<string> {
    return this.enqueue('dca_execution', strategy.strategyId, strategy.userId, {
      config: strategy.config,
    }, {
      conditionId: condition?.conditionId,
      evaluation,
    });
  }

  /**
   * Enqueue a stop-loss execution
   */
  async enqueueStopLossExecution(
    strategy: Strategy,
    condition: TriggerCondition,
    evaluation: ConditionEvaluationResult
  ): Promise<string> {
    return this.enqueue('stop_loss_execution', strategy.strategyId, strategy.userId, {
      config: strategy.config,
      triggerPrice: evaluation.observedValue,
    }, {
      conditionId: condition.conditionId,
      evaluation,
      priority: 1, // High priority for stop-loss
    });
  }

  /**
   * Enqueue a take-profit execution
   */
  async enqueueTakeProfitExecution(
    strategy: Strategy,
    condition: TriggerCondition,
    evaluation: ConditionEvaluationResult
  ): Promise<string> {
    return this.enqueue('take_profit_execution', strategy.strategyId, strategy.userId, {
      config: strategy.config,
      triggerPrice: evaluation.observedValue,
    }, {
      conditionId: condition.conditionId,
      evaluation,
      priority: 2,
    });
  }

  /**
   * Schedule a recurring job (for DCA)
   */
  async scheduleRecurring(
    jobType: ExecutionJobType,
    strategyId: string,
    userId: string,
    params: Record<string, unknown>,
    repeatPattern: {
      every?: number; // milliseconds
      cron?: string;
      limit?: number;
    }
  ): Promise<string> {
    const jobId = `recurring_${uuidv4()}`;

    const jobData: ExecutionJobData = {
      jobId,
      jobType,
      strategyId,
      userId,
      params,
      createdAt: Date.now(),
    };

    await this.queue.add(jobType, jobData, {
      jobId,
      repeat: {
        every: repeatPattern.every,
        pattern: repeatPattern.cron,
        limit: repeatPattern.limit,
      },
    });

    console.log(`[ExecutionQueue] Scheduled recurring job ${jobId}: ${jobType}`);

    return jobId;
  }

  /**
   * Remove a recurring job
   */
  async removeRecurringJob(jobId: string): Promise<void> {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const job = repeatableJobs.find((j) => j.id === jobId || j.key.includes(jobId));

    if (job) {
      await this.queue.removeRepeatableByKey(job.key);
      console.log(`[ExecutionQueue] Removed recurring job ${jobId}`);
    }
  }

  // ==========================================================================
  // Handler Registration
  // ==========================================================================

  /**
   * Register an execution handler
   */
  registerHandler(jobType: ExecutionJobType, handler: ExecutionHandler): void {
    this.handlers.set(jobType, handler);
    console.log(`[ExecutionQueue] Registered handler for ${jobType}`);
  }

  /**
   * Unregister an execution handler
   */
  unregisterHandler(jobType: ExecutionJobType): void {
    this.handlers.delete(jobType);
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  setOnExecutionComplete(
    callback: (strategyId: string, execution: StrategyExecution) => Promise<void>
  ): void {
    this.onExecutionComplete = callback;
  }

  setOnExecutionFailed(
    callback: (strategyId: string, error: string, jobData: ExecutionJobData) => Promise<void>
  ): void {
    this.onExecutionFailed = callback;
  }

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get jobs for a strategy
   */
  async getStrategyJobs(strategyId: string): Promise<Job<ExecutionJobData>[]> {
    const jobs = await this.queue.getJobs(['waiting', 'active', 'delayed']);
    return jobs.filter((job) => job.data.strategyId === strategyId);
  }

  /**
   * Cancel all jobs for a strategy
   */
  async cancelStrategyJobs(strategyId: string): Promise<number> {
    const jobs = await this.getStrategyJobs(strategyId);
    let cancelled = 0;

    for (const job of jobs) {
      try {
        await job.remove();
        cancelled++;
      } catch (error) {
        console.error(`[ExecutionQueue] Failed to cancel job ${job.id}:`, error);
      }
    }

    // Also remove recurring jobs
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id?.includes(strategyId)) {
        await this.queue.removeRepeatableByKey(job.key);
        cancelled++;
      }
    }

    console.log(`[ExecutionQueue] Cancelled ${cancelled} jobs for strategy ${strategyId}`);
    return cancelled;
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    console.log('[ExecutionQueue] Queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    console.log('[ExecutionQueue] Queue resumed');
  }

  /**
   * Drain the queue (remove all waiting jobs)
   */
  async drain(): Promise<void> {
    await this.queue.drain();
    console.log('[ExecutionQueue] Queue drained');
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  getMetrics() {
    return { ...this.metrics };
  }

  private updateAverageExecutionTime(timeMs: number): void {
    const count = this.metrics.totalJobsCompleted + this.metrics.totalJobsFailed;
    this.metrics.averageExecutionTimeMs =
      (this.metrics.averageExecutionTimeMs * (count - 1) + timeMs) / count;
  }

  isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let executionQueueInstance: ExecutionQueue | null = null;

export function getExecutionQueue(
  store: StrategyStore,
  redis: Redis,
  config?: Partial<ExecutionQueueConfig>
): ExecutionQueue {
  if (!executionQueueInstance) {
    executionQueueInstance = new ExecutionQueue(store, redis, config);
  }
  return executionQueueInstance;
}

export function resetExecutionQueue(): void {
  if (executionQueueInstance) {
    executionQueueInstance.shutdown();
    executionQueueInstance = null;
  }
}
