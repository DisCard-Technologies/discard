/**
 * Goal Progress Tracker
 *
 * Tracks progress toward user goals, including contributions,
 * yield earnings, and trading profits across all sub-agents.
 */

import type { Strategy } from '../types/strategy.js';
import type { GoalProgress, GoalProgressSnapshot, GoalConfig } from '../types/goal.js';
import type { StrategyStore } from './strategyStore.js';

// ============================================================================
// Configuration
// ============================================================================

export interface GoalProgressTrackerConfig {
  /** How often to update progress snapshots (ms) */
  snapshotIntervalMs: number;
  /** How many snapshots to keep in history */
  maxSnapshotsPerGoal: number;
  /** Milestone percentages to notify on */
  milestonePercentages: number[];
}

const DEFAULT_CONFIG: GoalProgressTrackerConfig = {
  snapshotIntervalMs: 3600000, // 1 hour
  maxSnapshotsPerGoal: 720, // 30 days of hourly snapshots
  milestonePercentages: [25, 50, 75, 90, 100],
};

// ============================================================================
// Types
// ============================================================================

export interface ContributionRecord {
  timestamp: number;
  type: 'deposit' | 'dca' | 'yield' | 'trading' | 'withdrawal';
  amount: number;
  token: string;
  amountUsd: number;
  source?: string;
  transactionSignature?: string;
}

export interface MilestoneReached {
  percentage: number;
  reachedAt: number;
  currentAmount: number;
  targetAmount: number;
}

export interface ProgressUpdate {
  goalId: string;
  previousProgress: GoalProgress;
  newProgress: GoalProgress;
  delta: {
    amount: number;
    percentage: number;
  };
  milestonesReached: MilestoneReached[];
}

// ============================================================================
// Goal Progress Tracker
// ============================================================================

export class GoalProgressTracker {
  private config: GoalProgressTrackerConfig;
  private store: StrategyStore;
  private contributions: Map<string, ContributionRecord[]> = new Map();
  private reachedMilestones: Map<string, Set<number>> = new Map();
  private snapshotIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  // Callbacks
  private onMilestoneReached?: (
    strategy: Strategy,
    milestone: MilestoneReached
  ) => Promise<void>;

  private onGoalCompleted?: (strategy: Strategy) => Promise<void>;

  private onProgressUpdate?: (update: ProgressUpdate) => Promise<void>;

  constructor(store: StrategyStore, config: Partial<GoalProgressTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    console.log('[GoalProgressTracker] Initializing...');

    // Load active goal strategies and start tracking
    const activeStrategies = await this.store.listActive();
    const goalStrategies = activeStrategies.filter((s) => s.type === 'goal');

    for (const strategy of goalStrategies) {
      await this.startTracking(strategy);
    }

    console.log(
      `[GoalProgressTracker] Initialized, tracking ${goalStrategies.length} goals`
    );
  }

  async shutdown(): Promise<void> {
    console.log('[GoalProgressTracker] Shutting down...');

    // Stop all snapshot intervals
    for (const [goalId, interval] of this.snapshotIntervals) {
      clearInterval(interval);
    }
    this.snapshotIntervals.clear();

    console.log('[GoalProgressTracker] Shutdown complete');
  }

  // ==========================================================================
  // Goal Tracking
  // ==========================================================================

  /**
   * Start tracking a goal strategy
   */
  async startTracking(strategy: Strategy): Promise<void> {
    if (strategy.type !== 'goal') {
      console.warn(`[GoalProgressTracker] Cannot track non-goal strategy: ${strategy.type}`);
      return;
    }

    const goalId = strategy.strategyId;

    // Initialize contribution tracking
    if (!this.contributions.has(goalId)) {
      this.contributions.set(goalId, []);
    }

    // Initialize milestone tracking
    if (!this.reachedMilestones.has(goalId)) {
      const reached = new Set<number>();

      // Check for already-reached milestones
      if (strategy.goalProgress) {
        for (const milestone of this.config.milestonePercentages) {
          if (strategy.goalProgress.progressPercentage >= milestone) {
            reached.add(milestone);
          }
        }
      }

      this.reachedMilestones.set(goalId, reached);
    }

    // Start periodic snapshots
    if (!this.snapshotIntervals.has(goalId)) {
      const interval = setInterval(async () => {
        await this.takeSnapshot(goalId);
      }, this.config.snapshotIntervalMs);

      this.snapshotIntervals.set(goalId, interval);

      // Take initial snapshot
      await this.takeSnapshot(goalId);
    }

    console.log(`[GoalProgressTracker] Started tracking goal: ${goalId}`);
  }

  /**
   * Stop tracking a goal strategy
   */
  stopTracking(goalId: string): void {
    const interval = this.snapshotIntervals.get(goalId);
    if (interval) {
      clearInterval(interval);
      this.snapshotIntervals.delete(goalId);
    }

    console.log(`[GoalProgressTracker] Stopped tracking goal: ${goalId}`);
  }

  // ==========================================================================
  // Contributions
  // ==========================================================================

  /**
   * Record a contribution toward a goal
   */
  async recordContribution(
    goalId: string,
    contribution: Omit<ContributionRecord, 'timestamp'>
  ): Promise<ProgressUpdate | null> {
    const strategy = await this.store.get(goalId);
    if (!strategy || strategy.type !== 'goal') {
      console.error(`[GoalProgressTracker] Goal not found: ${goalId}`);
      return null;
    }

    const record: ContributionRecord = {
      ...contribution,
      timestamp: Date.now(),
    };

    // Add to contribution history
    const contributions = this.contributions.get(goalId) || [];
    contributions.push(record);
    this.contributions.set(goalId, contributions);

    // Update goal progress
    const previousProgress = strategy.goalProgress || this.createInitialProgress(strategy);
    const newProgress = this.calculateProgress(strategy, contributions);

    // Check for new milestones
    const milestonesReached = await this.checkMilestones(
      strategy,
      previousProgress.progressPercentage,
      newProgress.progressPercentage
    );

    // Update store
    await this.store.updateGoalProgress(goalId, newProgress);

    const update: ProgressUpdate = {
      goalId,
      previousProgress,
      newProgress,
      delta: {
        amount: newProgress.currentAmount - previousProgress.currentAmount,
        percentage: newProgress.progressPercentage - previousProgress.progressPercentage,
      },
      milestonesReached,
    };

    // Notify listeners
    if (this.onProgressUpdate) {
      await this.onProgressUpdate(update);
    }

    // Check if goal is complete
    if (newProgress.progressPercentage >= 100 && previousProgress.progressPercentage < 100) {
      await this.handleGoalCompleted(strategy);
    }

    console.log(
      `[GoalProgressTracker] Contribution recorded for ${goalId}: ` +
        `+$${contribution.amountUsd.toFixed(2)} (${newProgress.progressPercentage.toFixed(1)}%)`
    );

    return update;
  }

  // ==========================================================================
  // Progress Calculation
  // ==========================================================================

  /**
   * Calculate current progress for a goal
   */
  calculateProgress(strategy: Strategy, contributions: ContributionRecord[]): GoalProgress {
    const config = strategy.config as GoalConfig;
    const targetAmount = config.targetAmount;

    // Sum up contributions by type
    let depositTotal = 0;
    let dcaTotal = 0;
    let yieldTotal = 0;
    let tradingTotal = 0;
    let withdrawalTotal = 0;

    for (const c of contributions) {
      switch (c.type) {
        case 'deposit':
          depositTotal += c.amountUsd;
          break;
        case 'dca':
          dcaTotal += c.amountUsd;
          break;
        case 'yield':
          yieldTotal += c.amountUsd;
          break;
        case 'trading':
          tradingTotal += c.amountUsd;
          break;
        case 'withdrawal':
          withdrawalTotal += c.amountUsd;
          break;
      }
    }

    const currentAmount = depositTotal + dcaTotal + yieldTotal + tradingTotal - withdrawalTotal;
    const progressPercentage = Math.min((currentAmount / targetAmount) * 100, 100);

    // Estimate projected completion date
    let projectedCompletionDate: Date | null = null;
    if (currentAmount > 0 && progressPercentage < 100) {
      const recentContributions = contributions
        .filter((c) => c.type !== 'withdrawal')
        .filter((c) => c.timestamp > Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

      if (recentContributions.length > 0) {
        const recentTotal = recentContributions.reduce((sum, c) => sum + c.amountUsd, 0);
        const daysElapsed = (Date.now() - recentContributions[0].timestamp) / (24 * 60 * 60 * 1000);
        const dailyRate = recentTotal / Math.max(daysElapsed, 1);

        if (dailyRate > 0) {
          const remainingAmount = targetAmount - currentAmount;
          const daysToCompletion = remainingAmount / dailyRate;
          projectedCompletionDate = new Date(Date.now() + daysToCompletion * 24 * 60 * 60 * 1000);
        }
      }
    } else if (progressPercentage >= 100) {
      projectedCompletionDate = new Date();
    }

    // Get existing history
    const existingProgress = strategy.goalProgress;
    const history = existingProgress?.history || [];

    // Calculate days remaining if deadline exists
    let daysRemaining: number | null = null;
    let onTrack = true;

    if (config.deadline) {
      daysRemaining = Math.max(0, Math.ceil((config.deadline - Date.now()) / (24 * 60 * 60 * 1000)));

      // Check if on track based on expected progress
      const totalDuration = config.deadline - (strategy.createdAt || Date.now());
      const elapsed = Date.now() - (strategy.createdAt || Date.now());
      const expectedProgress = (elapsed / totalDuration) * 100;
      onTrack = progressPercentage >= expectedProgress - 10;
    }

    return {
      goalId: strategy.strategyId,
      targetAmount,
      currentAmount,
      progressPercentage,
      projectedCompletionDate: projectedCompletionDate?.getTime() || null,
      onTrack,
      daysRemaining,
      contributions: {
        dca: dcaTotal,
        yieldEarned: yieldTotal,
        tradingPnL: tradingTotal,
        priceAppreciation: 0, // Would need price tracking
        manualDeposits: depositTotal,
      },
      history,
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * Create initial progress for a new goal
   */
  private createInitialProgress(strategy: Strategy): GoalProgress {
    const config = strategy.config as GoalConfig;

    let daysRemaining: number | null = null;
    if (config.deadline) {
      daysRemaining = Math.max(0, Math.ceil((config.deadline - Date.now()) / (24 * 60 * 60 * 1000)));
    }

    return {
      goalId: strategy.strategyId,
      targetAmount: config.targetAmount,
      currentAmount: 0,
      progressPercentage: 0,
      projectedCompletionDate: null,
      onTrack: true,
      daysRemaining,
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
  }

  // ==========================================================================
  // Snapshots
  // ==========================================================================

  /**
   * Take a progress snapshot
   */
  private async takeSnapshot(goalId: string): Promise<void> {
    const strategy = await this.store.get(goalId);
    if (!strategy || !strategy.goalProgress) return;

    const snapshot: GoalProgressSnapshot = {
      timestamp: Date.now(),
      amount: strategy.goalProgress.currentAmount,
      progressPercentage: strategy.goalProgress.progressPercentage,
    };

    // Add to history
    const history = [...(strategy.goalProgress.history || []), snapshot];

    // Trim history if needed
    if (history.length > this.config.maxSnapshotsPerGoal) {
      history.splice(0, history.length - this.config.maxSnapshotsPerGoal);
    }

    // Update store
    await this.store.updateGoalProgress(goalId, { history });
  }

  // ==========================================================================
  // Milestones
  // ==========================================================================

  /**
   * Check and handle milestone achievements
   */
  private async checkMilestones(
    strategy: Strategy,
    previousPercentage: number,
    newPercentage: number
  ): Promise<MilestoneReached[]> {
    const reached: MilestoneReached[] = [];
    const goalId = strategy.strategyId;
    const reachedSet = this.reachedMilestones.get(goalId) || new Set();

    for (const milestone of this.config.milestonePercentages) {
      // Check if we just crossed this milestone
      if (previousPercentage < milestone && newPercentage >= milestone) {
        if (!reachedSet.has(milestone)) {
          reachedSet.add(milestone);

          const milestoneData: MilestoneReached = {
            percentage: milestone,
            reachedAt: Date.now(),
            currentAmount: strategy.goalProgress?.currentAmount || 0,
            targetAmount: (strategy.config as GoalConfig).targetAmount,
          };

          reached.push(milestoneData);

          // Notify callback
          if (this.onMilestoneReached) {
            await this.onMilestoneReached(strategy, milestoneData);
          }

          console.log(
            `[GoalProgressTracker] Milestone reached for ${goalId}: ${milestone}%`
          );
        }
      }
    }

    this.reachedMilestones.set(goalId, reachedSet);
    return reached;
  }

  /**
   * Handle goal completion
   */
  private async handleGoalCompleted(strategy: Strategy): Promise<void> {
    console.log(`[GoalProgressTracker] Goal completed: ${strategy.strategyId}`);

    // Update strategy status
    await this.store.complete(strategy.strategyId, 'Goal target reached');

    // Stop tracking
    this.stopTracking(strategy.strategyId);

    // Notify callback
    if (this.onGoalCompleted) {
      await this.onGoalCompleted(strategy);
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get contribution history for a goal
   */
  getContributions(goalId: string): ContributionRecord[] {
    return [...(this.contributions.get(goalId) || [])];
  }

  /**
   * Get reached milestones for a goal
   */
  getReachedMilestones(goalId: string): number[] {
    return [...(this.reachedMilestones.get(goalId) || [])];
  }

  /**
   * Get progress summary for a goal
   */
  async getProgressSummary(goalId: string): Promise<{
    progress: GoalProgress | null;
    contributions: ContributionRecord[];
    milestones: number[];
    isTracking: boolean;
  }> {
    const strategy = await this.store.get(goalId);

    return {
      progress: strategy?.goalProgress || null,
      contributions: this.getContributions(goalId),
      milestones: this.getReachedMilestones(goalId),
      isTracking: this.snapshotIntervals.has(goalId),
    };
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  setOnMilestoneReached(
    callback: (strategy: Strategy, milestone: MilestoneReached) => Promise<void>
  ): void {
    this.onMilestoneReached = callback;
  }

  setOnGoalCompleted(callback: (strategy: Strategy) => Promise<void>): void {
    this.onGoalCompleted = callback;
  }

  setOnProgressUpdate(callback: (update: ProgressUpdate) => Promise<void>): void {
    this.onProgressUpdate = callback;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let trackerInstance: GoalProgressTracker | null = null;

export function getGoalProgressTracker(
  store: StrategyStore,
  config?: Partial<GoalProgressTrackerConfig>
): GoalProgressTracker {
  if (!trackerInstance) {
    trackerInstance = new GoalProgressTracker(store, config);
  }
  return trackerInstance;
}

export function resetGoalProgressTracker(): void {
  if (trackerInstance) {
    trackerInstance.shutdown();
    trackerInstance = null;
  }
}
