/**
 * Condition Engine Service
 *
 * Monitors conditions for active strategies and triggers executions
 * when conditions are met. Supports price, time, balance, and custom conditions.
 */

import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import type { Strategy } from '../types/strategy.js';
import type {
  TriggerCondition,
  ConditionEvaluationResult,
  BatchConditionEvaluationResult,
  PriceCondition,
  TimeCondition,
  BalanceCondition,
  PercentageChangeCondition,
  ScheduledJob,
} from '../types/conditions.js';
import {
  isPriceCondition,
  isTimeCondition,
  isBalanceCondition,
  isPercentageChangeCondition,
  evaluateComparison,
} from '../types/conditions.js';
import type { StrategyStore } from './strategyStore.js';
import { PriceMonitor, getPriceMonitor } from './priceMonitor.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ConditionEngineConfig {
  /** Interval for evaluating price conditions (ms) */
  priceEvaluationIntervalMs: number;
  /** Interval for evaluating balance conditions (ms) */
  balanceEvaluationIntervalMs: number;
  /** Maximum conditions to evaluate per batch */
  maxConditionsPerBatch: number;
  /** Cooldown between triggers for same condition (seconds) */
  defaultCooldownSeconds: number;
  /** Whether to log evaluation results */
  verboseLogging: boolean;
}

const DEFAULT_CONFIG: ConditionEngineConfig = {
  priceEvaluationIntervalMs: 5000, // 5 seconds
  balanceEvaluationIntervalMs: 60000, // 1 minute
  maxConditionsPerBatch: 100,
  defaultCooldownSeconds: 60,
  verboseLogging: false,
};

// ============================================================================
// Condition Engine
// ============================================================================

export class ConditionEngine {
  private config: ConditionEngineConfig;
  private store: StrategyStore;
  private priceMonitor: PriceMonitor;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private jobMetadata: Map<string, ScheduledJob> = new Map();
  private evaluationInterval: ReturnType<typeof setInterval> | null = null;
  private initialized: boolean = false;
  private running: boolean = false;

  // Callbacks
  private onConditionTriggered?: (
    strategy: Strategy,
    condition: TriggerCondition,
    evaluation: ConditionEvaluationResult
  ) => Promise<void>;

  // Metrics
  private metrics = {
    totalEvaluations: 0,
    conditionsTriggered: 0,
    evaluationErrors: 0,
    lastEvaluationAt: 0,
    averageEvaluationTimeMs: 0,
  };

  constructor(
    store: StrategyStore,
    config: Partial<ConditionEngineConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
    this.priceMonitor = getPriceMonitor();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.priceMonitor.initialize();

    // Load active strategies and set up their conditions
    const activeStrategies = await this.store.listActive();
    for (const strategy of activeStrategies) {
      await this.registerStrategyConditions(strategy);
    }

    this.initialized = true;
    console.log(`[ConditionEngine] Initialized with ${activeStrategies.length} active strategies`);
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.initialized) {
      await this.initialize();
    }

    this.running = true;

    // Start main evaluation loop
    this.evaluationInterval = setInterval(
      () => this.evaluateAllConditions(),
      this.config.priceEvaluationIntervalMs
    );

    console.log('[ConditionEngine] Started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;

    // Stop evaluation interval
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    // Stop all scheduled jobs
    for (const job of this.scheduledJobs.values()) {
      job.stop();
    }
    this.scheduledJobs.clear();
    this.jobMetadata.clear();

    console.log('[ConditionEngine] Stopped');
  }

  async shutdown(): Promise<void> {
    await this.stop();
    await this.priceMonitor.shutdown();
    this.initialized = false;
    console.log('[ConditionEngine] Shutdown complete');
  }

  // ==========================================================================
  // Condition Registration
  // ==========================================================================

  /**
   * Register conditions for a strategy
   */
  async registerStrategyConditions(strategy: Strategy): Promise<void> {
    for (const condition of strategy.conditions) {
      await this.registerCondition(strategy, condition);
    }
  }

  /**
   * Register a single condition
   */
  async registerCondition(strategy: Strategy, condition: TriggerCondition): Promise<void> {
    if (!condition.enabled) return;

    const config = condition.config;

    // Set up price subscriptions for price conditions
    if (isPriceCondition(config)) {
      this.priceMonitor.subscribe(
        config.token,
        config.quoteCurrency,
        config.priceSource as 'jupiter' | 'pyth' | 'birdeye',
        strategy.strategyId
      );
    }

    // Set up cron jobs for time conditions
    if (isTimeCondition(config)) {
      this.scheduleTimeCondition(strategy, condition, config);
    }
  }

  /**
   * Unregister conditions for a strategy
   */
  async unregisterStrategyConditions(strategyId: string): Promise<void> {
    // Unsubscribe from price feeds
    this.priceMonitor.unsubscribe(strategyId);

    // Stop scheduled jobs for this strategy
    for (const [jobId, metadata] of this.jobMetadata) {
      if (metadata.strategyId === strategyId) {
        const job = this.scheduledJobs.get(jobId);
        if (job) {
          job.stop();
          this.scheduledJobs.delete(jobId);
        }
        this.jobMetadata.delete(jobId);
      }
    }
  }

  // ==========================================================================
  // Condition Evaluation
  // ==========================================================================

  /**
   * Evaluate all conditions for active strategies
   */
  async evaluateAllConditions(): Promise<BatchConditionEvaluationResult> {
    const startTime = Date.now();
    const results = new Map<string, ConditionEvaluationResult>();
    const newlyMet: string[] = [];
    const noLongerMet: string[] = [];
    const errors: Array<{ conditionId: string; error: string }> = [];

    try {
      // Get all active strategies
      const strategies = await this.store.listActive();

      // Collect all price conditions to batch fetch
      const priceConditions: Array<{
        strategy: Strategy;
        condition: TriggerCondition;
        config: PriceCondition;
      }> = [];

      const balanceConditions: Array<{
        strategy: Strategy;
        condition: TriggerCondition;
        config: BalanceCondition;
      }> = [];

      const percentageConditions: Array<{
        strategy: Strategy;
        condition: TriggerCondition;
        config: PercentageChangeCondition;
      }> = [];

      // Categorize conditions
      for (const strategy of strategies) {
        for (const condition of strategy.conditions) {
          if (!condition.enabled || condition.inCooldown) continue;

          const config = condition.config;

          if (isPriceCondition(config)) {
            priceConditions.push({ strategy, condition, config });
          } else if (isBalanceCondition(config)) {
            balanceConditions.push({ strategy, condition, config });
          } else if (isPercentageChangeCondition(config)) {
            percentageConditions.push({ strategy, condition, config });
          }
        }
      }

      // Batch fetch prices
      const tokens = [...new Set(priceConditions.map((p) => p.config.token))];
      const prices = await this.priceMonitor.getPrices(tokens);

      // Evaluate price conditions
      for (const { strategy, condition, config } of priceConditions) {
        try {
          const result = this.evaluatePriceCondition(condition, config, prices);
          results.set(condition.conditionId, result);

          if (result.isMet && !condition.isMet) {
            newlyMet.push(condition.conditionId);
            await this.handleConditionTriggered(strategy, condition, result);
          } else if (!result.isMet && condition.isMet) {
            noLongerMet.push(condition.conditionId);
          }

          // Update condition state
          await this.updateConditionState(strategy.strategyId, condition.conditionId, result);
        } catch (error) {
          errors.push({
            conditionId: condition.conditionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Evaluate percentage change conditions
      for (const { strategy, condition, config } of percentageConditions) {
        try {
          const result = await this.evaluatePercentageChangeCondition(condition, config, prices);
          results.set(condition.conditionId, result);

          if (result.isMet && !condition.isMet) {
            newlyMet.push(condition.conditionId);
            await this.handleConditionTriggered(strategy, condition, result);
          }

          await this.updateConditionState(strategy.strategyId, condition.conditionId, result);
        } catch (error) {
          errors.push({
            conditionId: condition.conditionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update metrics
      const evaluationTime = Date.now() - startTime;
      this.metrics.totalEvaluations++;
      this.metrics.lastEvaluationAt = startTime;
      this.metrics.conditionsTriggered += newlyMet.length;
      this.metrics.evaluationErrors += errors.length;
      this.metrics.averageEvaluationTimeMs =
        (this.metrics.averageEvaluationTimeMs * (this.metrics.totalEvaluations - 1) + evaluationTime) /
        this.metrics.totalEvaluations;

      if (this.config.verboseLogging) {
        console.log(
          `[ConditionEngine] Evaluated ${results.size} conditions in ${evaluationTime}ms. ` +
            `Triggered: ${newlyMet.length}, Errors: ${errors.length}`
        );
      }
    } catch (error) {
      console.error('[ConditionEngine] Evaluation error:', error);
      this.metrics.evaluationErrors++;
    }

    return {
      evaluatedAt: startTime,
      results,
      newlyMet,
      noLongerMet,
      errors,
    };
  }

  /**
   * Evaluate a single price condition
   */
  private evaluatePriceCondition(
    condition: TriggerCondition,
    config: PriceCondition,
    prices: Map<string, { price: number }>
  ): ConditionEvaluationResult {
    const priceData = prices.get(config.token);

    if (!priceData) {
      return {
        conditionId: condition.conditionId,
        isMet: false,
        observedValue: null,
        targetValue: config.targetPrice,
        evaluatedAt: Date.now(),
        error: `Price not available for ${config.token}`,
      };
    }

    const currentPrice = priceData.price;
    const isMet = evaluateComparison(currentPrice, config.operator, config.targetPrice);

    return {
      conditionId: condition.conditionId,
      isMet,
      observedValue: currentPrice,
      targetValue: config.targetPrice,
      evaluatedAt: Date.now(),
      context: {
        token: config.token,
        operator: config.operator,
      },
    };
  }

  /**
   * Evaluate a percentage change condition
   */
  private async evaluatePercentageChangeCondition(
    condition: TriggerCondition,
    config: PercentageChangeCondition,
    prices: Map<string, { price: number }>
  ): Promise<ConditionEvaluationResult> {
    const priceData = prices.get(config.token);

    if (!priceData) {
      return {
        conditionId: condition.conditionId,
        isMet: false,
        observedValue: null,
        targetValue: config.percentageThreshold,
        evaluatedAt: Date.now(),
        error: `Price not available for ${config.token}`,
      };
    }

    const currentPrice = priceData.price;
    const percentageChange = (currentPrice - config.referencePrice) / config.referencePrice;
    const absoluteChange = Math.abs(percentageChange);

    let isMet = false;
    switch (config.direction) {
      case 'up':
        isMet = percentageChange >= config.percentageThreshold;
        break;
      case 'down':
        isMet = percentageChange <= -config.percentageThreshold;
        break;
      case 'either':
        isMet = absoluteChange >= config.percentageThreshold;
        break;
    }

    return {
      conditionId: condition.conditionId,
      isMet,
      observedValue: percentageChange,
      targetValue: config.percentageThreshold,
      evaluatedAt: Date.now(),
      context: {
        token: config.token,
        currentPrice,
        referencePrice: config.referencePrice,
        direction: config.direction,
      },
    };
  }

  // ==========================================================================
  // Time-Based Conditions
  // ==========================================================================

  /**
   * Schedule a time-based condition
   */
  private scheduleTimeCondition(
    strategy: Strategy,
    condition: TriggerCondition,
    config: TimeCondition
  ): void {
    const jobId = `job_${condition.conditionId}`;

    // Stop existing job if any
    const existingJob = this.scheduledJobs.get(jobId);
    if (existingJob) {
      existingJob.stop();
    }

    // Validate cron expression
    if (!cron.validate(config.cronExpression)) {
      console.error(`[ConditionEngine] Invalid cron expression: ${config.cronExpression}`);
      return;
    }

    // Create scheduled task
    const task = cron.schedule(
      config.cronExpression,
      async () => {
        if (!this.running) return;

        const result: ConditionEvaluationResult = {
          conditionId: condition.conditionId,
          isMet: true,
          observedValue: Date.now(),
          targetValue: config.cronExpression,
          evaluatedAt: Date.now(),
        };

        await this.handleConditionTriggered(strategy, condition, result);

        // Update job metadata
        const metadata = this.jobMetadata.get(jobId);
        if (metadata) {
          metadata.lastRunAt = Date.now();
          metadata.runCount++;
        }
      },
      {
        timezone: config.timezone || 'UTC',
      }
    );

    this.scheduledJobs.set(jobId, task);
    this.jobMetadata.set(jobId, {
      jobId,
      conditionId: condition.conditionId,
      strategyId: strategy.strategyId,
      cronExpression: config.cronExpression,
      timezone: config.timezone || 'UTC',
      nextRunAt: this.getNextCronRun(config.cronExpression),
      active: true,
      runCount: 0,
    });

    console.log(
      `[ConditionEngine] Scheduled time condition ${condition.conditionId}: ${config.cronExpression}`
    );
  }

  /**
   * Get the next run time for a cron expression
   */
  private getNextCronRun(cronExpression: string): number {
    // Simple approximation - in production, use a proper cron parser
    return Date.now() + 60000; // Next minute as placeholder
  }

  // ==========================================================================
  // Trigger Handling
  // ==========================================================================

  /**
   * Handle a condition being triggered
   */
  private async handleConditionTriggered(
    strategy: Strategy,
    condition: TriggerCondition,
    evaluation: ConditionEvaluationResult
  ): Promise<void> {
    console.log(
      `[ConditionEngine] Condition triggered: ${condition.conditionId} for strategy ${strategy.strategyId}`
    );

    // Update condition trigger count and cooldown
    condition.triggerCount++;
    condition.lastTriggeredAt = Date.now();

    if (condition.cooldownSeconds) {
      condition.inCooldown = true;
      setTimeout(() => {
        condition.inCooldown = false;
      }, condition.cooldownSeconds * 1000);
    }

    // Mark strategy as triggered
    try {
      await this.store.markTriggered(strategy.strategyId);
    } catch (error) {
      console.error(`[ConditionEngine] Failed to mark strategy as triggered:`, error);
    }

    // Call external callback if set
    if (this.onConditionTriggered) {
      try {
        await this.onConditionTriggered(strategy, condition, evaluation);
      } catch (error) {
        console.error(`[ConditionEngine] Trigger callback error:`, error);
      }
    }
  }

  /**
   * Update condition state in the store
   */
  private async updateConditionState(
    strategyId: string,
    conditionId: string,
    result: ConditionEvaluationResult
  ): Promise<void> {
    // Get current strategy
    const strategy = await this.store.get(strategyId);
    if (!strategy) return;

    // Find and update the condition
    const condition = strategy.conditions.find((c) => c.conditionId === conditionId);
    if (condition) {
      condition.isMet = result.isMet;
      condition.lastCheckedAt = result.evaluatedAt;
      condition.lastObservedValue = result.observedValue ?? undefined;
      condition.updatedAt = Date.now();
    }
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  /**
   * Set callback for when a condition is triggered
   */
  setOnConditionTriggered(
    callback: (
      strategy: Strategy,
      condition: TriggerCondition,
      evaluation: ConditionEvaluationResult
    ) => Promise<void>
  ): void {
    this.onConditionTriggered = callback;
  }

  // ==========================================================================
  // Strategy Lifecycle Hooks
  // ==========================================================================

  /**
   * Called when a strategy is activated
   */
  async onStrategyActivated(strategy: Strategy): Promise<void> {
    await this.registerStrategyConditions(strategy);
  }

  /**
   * Called when a strategy is paused
   */
  async onStrategyPaused(strategyId: string): Promise<void> {
    await this.unregisterStrategyConditions(strategyId);
  }

  /**
   * Called when a strategy is cancelled or completed
   */
  async onStrategyRemoved(strategyId: string): Promise<void> {
    await this.unregisterStrategyConditions(strategyId);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get engine metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get scheduled jobs
   */
  getScheduledJobs(): ScheduledJob[] {
    return Array.from(this.jobMetadata.values());
  }

  /**
   * Check if engine is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Force evaluate a specific strategy's conditions
   */
  async evaluateStrategy(strategyId: string): Promise<ConditionEvaluationResult[]> {
    const strategy = await this.store.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    const results: ConditionEvaluationResult[] = [];
    const tokens = strategy.conditions
      .filter((c) => isPriceCondition(c.config))
      .map((c) => (c.config as PriceCondition).token);

    const prices = await this.priceMonitor.getPrices([...new Set(tokens)]);

    for (const condition of strategy.conditions) {
      if (!condition.enabled) continue;

      const config = condition.config;

      if (isPriceCondition(config)) {
        const result = this.evaluatePriceCondition(condition, config, prices);
        results.push(result);

        if (result.isMet && !condition.isMet) {
          await this.handleConditionTriggered(strategy, condition, result);
        }
      } else if (isPercentageChangeCondition(config)) {
        const result = await this.evaluatePercentageChangeCondition(condition, config, prices);
        results.push(result);

        if (result.isMet && !condition.isMet) {
          await this.handleConditionTriggered(strategy, condition, result);
        }
      }
    }

    return results;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let conditionEngineInstance: ConditionEngine | null = null;

export function getConditionEngine(
  store: StrategyStore,
  config?: Partial<ConditionEngineConfig>
): ConditionEngine {
  if (!conditionEngineInstance) {
    conditionEngineInstance = new ConditionEngine(store, config);
  }
  return conditionEngineInstance;
}

export function resetConditionEngine(): void {
  if (conditionEngineInstance) {
    conditionEngineInstance.shutdown();
    conditionEngineInstance = null;
  }
}
