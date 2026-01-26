/**
 * Goal Orchestrator
 *
 * Coordinates sub-agents (DCA, Yield Harvester, Trading Bot) to achieve
 * user goals. Tracks progress, enforces risk limits, and reports status.
 */

import type { Job } from 'bullmq';
import type { Strategy } from '../types/strategy.js';
import type {
  GoalConfig,
  GoalProgress,
  GoalStrategy,
  DCAGoalStrategy,
  YieldHarvesterStrategy,
  HybridStrategy,
} from '../types/goal.js';
import type { StrategyStore } from '../services/strategyStore.js';
import type { ExecutionQueue, ExecutionJobData, ExecutionJobResult } from '../services/executionQueue.js';
import { DCAAgent, getDCAAgent } from './dcaAgent.js';
import { getYieldHarvester, YieldHarvesterAgent } from './yieldHarvester/index.js';
import {
  getGoalProgressTracker,
  GoalProgressTracker,
  type ContributionRecord,
} from '../services/goalProgressTracker.js';

// ============================================================================
// Configuration
// ============================================================================

export interface GoalOrchestratorConfig {
  /** Check progress interval in milliseconds */
  progressCheckIntervalMs: number;
  /** How often to report status to user (ms) */
  statusReportIntervalMs: number;
  /** Maximum daily loss before pausing aggressive strategies */
  maxDailyLossPercentage: number;
  /** Minimum progress rate (% per week) before suggesting adjustments */
  minProgressRatePerWeek: number;
}

const DEFAULT_CONFIG: GoalOrchestratorConfig = {
  progressCheckIntervalMs: 3600000, // 1 hour
  statusReportIntervalMs: 86400000, // 1 day
  maxDailyLossPercentage: 5,
  minProgressRatePerWeek: 1,
};

// ============================================================================
// Types
// ============================================================================

export interface GoalStatus {
  goalId: string;
  status: 'on_track' | 'behind_schedule' | 'ahead_of_schedule' | 'at_risk' | 'completed';
  progress: GoalProgress;
  activeStrategies: Array<{
    type: string;
    status: string;
    contribution: number;
  }>;
  projectedCompletion: Date | null;
  daysRemaining: number | null;
  recommendedActions: string[];
}

export interface OrchestratorState {
  initialized: boolean;
  activeGoals: number;
  totalManagedValueUsd: number;
  lastProgressCheck: number;
  lastStatusReport: number;
}

// ============================================================================
// Goal Orchestrator
// ============================================================================

export class GoalOrchestrator {
  private config: GoalOrchestratorConfig;
  private store: StrategyStore;
  private executionQueue: ExecutionQueue;
  private dcaAgent: DCAAgent;
  private yieldHarvester: YieldHarvesterAgent;
  private progressTracker: GoalProgressTracker;
  private state: OrchestratorState;

  // Progress check intervals
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Callbacks
  private onGoalStatusChange?: (
    strategy: Strategy,
    status: GoalStatus
  ) => Promise<void>;

  private onActionRequired?: (
    strategy: Strategy,
    action: string,
    reason: string
  ) => Promise<void>;

  constructor(
    store: StrategyStore,
    executionQueue: ExecutionQueue,
    config: Partial<GoalOrchestratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
    this.executionQueue = executionQueue;
    this.dcaAgent = getDCAAgent();
    this.yieldHarvester = getYieldHarvester(store);
    this.progressTracker = getGoalProgressTracker(store);
    this.state = {
      initialized: false,
      activeGoals: 0,
      totalManagedValueUsd: 0,
      lastProgressCheck: 0,
      lastStatusReport: 0,
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.state.initialized) return;

    console.log('[GoalOrchestrator] Initializing...');

    // Initialize sub-agents
    await this.yieldHarvester.initialize();
    await this.progressTracker.initialize();

    // Register execution handlers
    this.executionQueue.registerHandler('goal_contribution', this.getContributionHandler());
    this.executionQueue.registerHandler('yield_harvest', this.yieldHarvester.getHarvestHandler());
    this.executionQueue.registerHandler('rebalance', this.yieldHarvester.getRebalanceHandler());
    this.executionQueue.registerHandler('dca_execution', this.dcaAgent.getExecutionHandler());

    // Set up progress tracker callbacks
    this.progressTracker.setOnMilestoneReached(async (strategy, milestone) => {
      console.log(
        `[GoalOrchestrator] Milestone ${milestone.percentage}% reached for ${strategy.strategyId}`
      );
      await this.handleMilestoneReached(strategy, milestone.percentage);
    });

    this.progressTracker.setOnGoalCompleted(async (strategy) => {
      console.log(`[GoalOrchestrator] Goal completed: ${strategy.strategyId}`);
      await this.handleGoalCompleted(strategy);
    });

    // Load and start tracking active goals
    const activeStrategies = await this.store.listActive();
    const goalStrategies = activeStrategies.filter((s) => s.type === 'goal');

    for (const strategy of goalStrategies) {
      await this.startGoalTracking(strategy);
    }

    this.state.initialized = true;
    this.state.activeGoals = goalStrategies.length;

    console.log(
      `[GoalOrchestrator] Initialized with ${goalStrategies.length} active goals`
    );
  }

  async shutdown(): Promise<void> {
    console.log('[GoalOrchestrator] Shutting down...');

    // Stop all check intervals
    for (const [goalId, interval] of this.checkIntervals) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();

    await this.yieldHarvester.shutdown();
    await this.progressTracker.shutdown();

    this.state.initialized = false;
    console.log('[GoalOrchestrator] Shutdown complete');
  }

  // ==========================================================================
  // Goal Management
  // ==========================================================================

  /**
   * Start tracking and executing a goal
   */
  async startGoalTracking(strategy: Strategy): Promise<void> {
    if (strategy.type !== 'goal') {
      throw new Error('Strategy is not a goal type');
    }

    const goalId = strategy.strategyId;
    const config = strategy.config as GoalConfig;

    console.log(`[GoalOrchestrator] Starting goal: ${goalId}`);

    // Start progress tracking
    await this.progressTracker.startTracking(strategy);

    // Schedule sub-strategies based on goal configuration
    await this.scheduleGoalStrategies(strategy);

    // Start periodic progress checks
    const interval = setInterval(async () => {
      await this.checkGoalProgress(goalId);
    }, this.config.progressCheckIntervalMs);

    this.checkIntervals.set(goalId, interval);

    this.state.activeGoals++;
  }

  /**
   * Stop tracking a goal
   */
  async stopGoalTracking(goalId: string): Promise<void> {
    console.log(`[GoalOrchestrator] Stopping goal: ${goalId}`);

    // Stop progress check interval
    const interval = this.checkIntervals.get(goalId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(goalId);
    }

    // Stop progress tracker
    this.progressTracker.stopTracking(goalId);

    // Cancel any scheduled executions
    await this.executionQueue.cancelStrategyJobs(goalId);

    this.state.activeGoals = Math.max(0, this.state.activeGoals - 1);
  }

  // ==========================================================================
  // Strategy Scheduling
  // ==========================================================================

  /**
   * Schedule sub-strategies for a goal
   */
  private async scheduleGoalStrategies(strategy: Strategy): Promise<void> {
    const config = strategy.config as GoalConfig;
    const achievementStrategy = config.achievementStrategy;

    if (!achievementStrategy) {
      console.warn(`[GoalOrchestrator] No achievement strategy for ${strategy.strategyId}`);
      return;
    }

    switch (achievementStrategy.type) {
      case 'dca':
        await this.scheduleDCAStrategy(strategy, achievementStrategy);
        break;

      case 'yield_harvester':
        await this.scheduleYieldHarvesterStrategy(strategy, achievementStrategy);
        break;

      case 'hybrid':
        await this.scheduleHybridStrategy(strategy, achievementStrategy);
        break;

      case 'trading_bot':
        // Trading bot scheduled separately (deferred to post-launch)
        console.log(
          `[GoalOrchestrator] Trading bot strategy not yet implemented for ${strategy.strategyId}`
        );
        break;
    }
  }

  private async scheduleDCAStrategy(
    strategy: Strategy,
    dcaStrategy: DCAGoalStrategy
  ): Promise<void> {
    const cronExpression = DCAAgent.frequencyToCron(dcaStrategy.dcaConfig.frequency);

    await this.executionQueue.scheduleRecurring(
      'dca_execution',
      strategy.strategyId,
      strategy.userId,
      {
        config: dcaStrategy.dcaConfig,
        goalId: strategy.strategyId,
      },
      {
        cron: cronExpression,
        limit: dcaStrategy.dcaConfig.maxExecutions,
      }
    );

    console.log(
      `[GoalOrchestrator] Scheduled DCA for ${strategy.strategyId}: ${cronExpression}`
    );
  }

  private async scheduleYieldHarvesterStrategy(
    strategy: Strategy,
    yieldStrategy: YieldHarvesterStrategy
  ): Promise<void> {
    // Schedule periodic harvesting
    const harvestIntervalMs =
      yieldStrategy.harvestFrequency === 'daily'
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

    await this.executionQueue.scheduleRecurring(
      'yield_harvest',
      strategy.strategyId,
      strategy.userId,
      {
        config: yieldStrategy,
        goalId: strategy.strategyId,
      },
      {
        every: harvestIntervalMs,
      }
    );

    // Schedule periodic rebalancing if threshold is set
    if (yieldStrategy.rebalanceThreshold > 0) {
      const rebalanceIntervalMs = 7 * 24 * 60 * 60 * 1000; // Weekly

      await this.executionQueue.scheduleRecurring(
        'rebalance',
        strategy.strategyId,
        strategy.userId,
        {
          config: yieldStrategy,
          goalId: strategy.strategyId,
        },
        {
          every: rebalanceIntervalMs,
        }
      );
    }

    console.log(
      `[GoalOrchestrator] Scheduled yield harvester for ${strategy.strategyId}`
    );
  }

  private async scheduleHybridStrategy(
    strategy: Strategy,
    hybridStrategy: HybridStrategy
  ): Promise<void> {
    // Schedule each component strategy
    if (hybridStrategy.allocation.dca) {
      await this.scheduleDCAStrategy(strategy, {
        type: 'dca',
        dcaConfig: hybridStrategy.allocation.dca.config,
      });
    }

    if (hybridStrategy.allocation.yieldHarvester) {
      await this.scheduleYieldHarvesterStrategy(
        strategy,
        { type: 'yield_harvester', ...hybridStrategy.allocation.yieldHarvester.config }
      );
    }

    console.log(
      `[GoalOrchestrator] Scheduled hybrid strategy for ${strategy.strategyId}`
    );
  }

  // ==========================================================================
  // Progress Monitoring
  // ==========================================================================

  /**
   * Check progress for a goal
   */
  private async checkGoalProgress(goalId: string): Promise<void> {
    const strategy = await this.store.get(goalId);
    if (!strategy || strategy.status !== 'active') {
      this.stopGoalTracking(goalId);
      return;
    }

    const status = await this.getGoalStatus(goalId);

    // Check if action is required
    if (status.status === 'at_risk' || status.status === 'behind_schedule') {
      if (this.onActionRequired) {
        await this.onActionRequired(
          strategy,
          'review_goal',
          `Goal is ${status.status}: ${status.recommendedActions[0] || 'Review strategy'}`
        );
      }
    }

    // Notify status change
    if (this.onGoalStatusChange) {
      await this.onGoalStatusChange(strategy, status);
    }

    this.state.lastProgressCheck = Date.now();
  }

  /**
   * Get comprehensive status for a goal
   */
  async getGoalStatus(goalId: string): Promise<GoalStatus> {
    const strategy = await this.store.get(goalId);
    if (!strategy || strategy.type !== 'goal') {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const config = strategy.config as GoalConfig;
    const defaultDaysRemaining = config.deadline
      ? Math.max(0, Math.ceil((config.deadline - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

    const progress: GoalProgress = strategy.goalProgress || {
      goalId,
      targetAmount: config.targetAmount,
      currentAmount: 0,
      progressPercentage: 0,
      projectedCompletionDate: null,
      onTrack: true,
      daysRemaining: defaultDaysRemaining,
      contributions: {
        dca: 0,
        yieldEarned: 0,
        tradingPnL: 0,
        priceAppreciation: 0,
        manualDeposits: 0,
      },
      history: [],
      lastUpdatedAt: Date.now(),
    };

    // Determine status
    let status: GoalStatus['status'] = 'on_track';
    const recommendedActions: string[] = [];

    if (progress.progressPercentage >= 100) {
      status = 'completed';
    } else if (config.deadline) {
      const now = Date.now();
      const deadline = config.deadline;
      const totalDuration = deadline - (strategy.createdAt || now);
      const elapsed = now - (strategy.createdAt || now);
      const expectedProgress = (elapsed / totalDuration) * 100;

      if (progress.progressPercentage >= expectedProgress + 10) {
        status = 'ahead_of_schedule';
      } else if (progress.progressPercentage < expectedProgress - 20) {
        status = 'at_risk';
        recommendedActions.push('Consider increasing contribution amount');
        recommendedActions.push('Review and optimize yield strategies');
      } else if (progress.progressPercentage < expectedProgress - 5) {
        status = 'behind_schedule';
        recommendedActions.push('Slightly increase contributions to stay on track');
      }
    }

    // Calculate days remaining
    let daysRemaining: number | null = null;
    if (config.deadline) {
      daysRemaining = Math.max(0, Math.ceil((config.deadline - Date.now()) / (24 * 60 * 60 * 1000)));
    }

    // Get active sub-strategies
    const activeStrategies = this.getActiveSubStrategies(config.achievementStrategy, progress);

    return {
      goalId,
      status,
      progress,
      activeStrategies,
      projectedCompletion: progress.projectedCompletionDate
        ? new Date(progress.projectedCompletionDate)
        : null,
      daysRemaining,
      recommendedActions,
    };
  }

  private getActiveSubStrategies(
    strategy: GoalStrategy | undefined,
    progress: GoalProgress
  ): Array<{ type: string; status: string; contribution: number }> {
    if (!strategy) return [];

    const strategies: Array<{ type: string; status: string; contribution: number }> = [];
    const contributions = progress.contributions;

    switch (strategy.type) {
      case 'dca':
        strategies.push({
          type: 'DCA',
          status: 'active',
          contribution: contributions.dca,
        });
        break;

      case 'yield_harvester':
        strategies.push({
          type: 'Yield Harvesting',
          status: 'active',
          contribution: contributions.yieldEarned,
        });
        break;

      case 'trading_bot':
        strategies.push({
          type: 'Trading Bot',
          status: 'paused',
          contribution: contributions.tradingPnL,
        });
        break;

      case 'hybrid':
        if (strategy.allocation.dca) {
          strategies.push({
            type: 'DCA',
            status: 'active',
            contribution: contributions.dca,
          });
        }
        if (strategy.allocation.yieldHarvester) {
          strategies.push({
            type: 'Yield Harvesting',
            status: 'active',
            contribution: contributions.yieldEarned,
          });
        }
        if (strategy.allocation.tradingBot) {
          strategies.push({
            type: 'Trading Bot',
            status: 'paused',
            contribution: contributions.tradingPnL,
          });
        }
        break;
    }

    return strategies;
  }

  // ==========================================================================
  // Contribution Handler
  // ==========================================================================

  /**
   * Get handler for goal contribution jobs
   */
  private getContributionHandler() {
    return async (
      job: Job<ExecutionJobData>,
      strategy: Strategy
    ): Promise<ExecutionJobResult> => {
      const { type, amount, token, amountUsd, source, transactionSignature } =
        job.data.params as {
          type: ContributionRecord['type'];
          amount: number;
          token: string;
          amountUsd: number;
          source?: string;
          transactionSignature?: string;
        };

      const update = await this.progressTracker.recordContribution(
        strategy.strategyId,
        {
          type,
          amount,
          token,
          amountUsd,
          source,
          transactionSignature,
        }
      );

      if (!update) {
        return {
          success: false,
          error: 'Failed to record contribution',
        };
      }

      return {
        success: true,
        metadata: {
          previousProgress: update.previousProgress.progressPercentage,
          newProgress: update.newProgress.progressPercentage,
          milestonesReached: update.milestonesReached.map((m) => m.percentage),
        },
      };
    };
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  private async handleMilestoneReached(
    strategy: Strategy,
    percentage: number
  ): Promise<void> {
    // Could send notifications, adjust strategies, etc.
    console.log(
      `[GoalOrchestrator] Milestone ${percentage}% reached for goal ${strategy.strategyId}`
    );
  }

  private async handleGoalCompleted(strategy: Strategy): Promise<void> {
    // Stop tracking
    await this.stopGoalTracking(strategy.strategyId);

    // Notify
    if (this.onGoalStatusChange) {
      const status = await this.getGoalStatus(strategy.strategyId);
      await this.onGoalStatusChange(strategy, status);
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  getState(): OrchestratorState {
    return { ...this.state };
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  setOnGoalStatusChange(
    callback: (strategy: Strategy, status: GoalStatus) => Promise<void>
  ): void {
    this.onGoalStatusChange = callback;
  }

  setOnActionRequired(
    callback: (strategy: Strategy, action: string, reason: string) => Promise<void>
  ): void {
    this.onActionRequired = callback;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let orchestratorInstance: GoalOrchestrator | null = null;

export function getGoalOrchestrator(
  store: StrategyStore,
  executionQueue: ExecutionQueue,
  config?: Partial<GoalOrchestratorConfig>
): GoalOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new GoalOrchestrator(store, executionQueue, config);
  }
  return orchestratorInstance;
}

export function resetGoalOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.shutdown();
    orchestratorInstance = null;
  }
}
