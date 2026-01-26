/**
 * Yield Harvester Agent
 *
 * Autonomous agent that manages yield positions, harvests rewards,
 * auto-compounds, and rebalances portfolios for optimal returns.
 */

import type { Job } from 'bullmq';
import type { Strategy } from '../../types/strategy.js';
import type { YieldHarvesterStrategy, YieldPosition, GoalProgress, GoalStrategy } from '../../types/goal.js';
import { isYieldHarvesterStrategy } from '../../types/goal.js';
import type { ExecutionJobData, ExecutionJobResult, ExecutionHandler } from '../../services/executionQueue.js';
import type { StrategyStore } from '../../services/strategyStore.js';
import {
  getProtocolRegistry,
  type ProtocolAdapter,
  type HarvestResult,
  type CompoundResult,
} from './protocols/index.js';
import { getYieldOptimizer, type RebalancePlan, type AllocationPlan } from './yieldOptimizer.js';

// ============================================================================
// Configuration
// ============================================================================

export interface YieldHarvesterConfig {
  /** Minimum USD value to harvest (avoid dust) */
  minHarvestValueUsd: number;
  /** Minimum USD value to compound */
  minCompoundValueUsd: number;
  /** Default harvest frequency in milliseconds */
  defaultHarvestIntervalMs: number;
  /** Default rebalance check frequency in milliseconds */
  defaultRebalanceIntervalMs: number;
  /** Gas/fee buffer as percentage of harvest value */
  feeBufferPercentage: number;
  /** Whether to log detailed operations */
  verboseLogging: boolean;
}

const DEFAULT_CONFIG: YieldHarvesterConfig = {
  minHarvestValueUsd: 5,
  minCompoundValueUsd: 10,
  defaultHarvestIntervalMs: 24 * 60 * 60 * 1000, // Daily
  defaultRebalanceIntervalMs: 7 * 24 * 60 * 60 * 1000, // Weekly
  feeBufferPercentage: 5,
  verboseLogging: false,
};

// ============================================================================
// Types
// ============================================================================

export interface HarvestSummary {
  strategyId: string;
  harvestedPositions: number;
  totalRewardsUsd: number;
  rewards: Array<{
    protocolId: string;
    token: string;
    amount: number;
    valueUsd: number;
  }>;
  compounded: boolean;
  compoundedAmountUsd: number;
  timestamp: number;
}

export interface YieldHarvesterState {
  initialized: boolean;
  activePositions: number;
  totalValueUsd: number;
  pendingRewardsUsd: number;
  lastHarvestAt: number;
  lastRebalanceAt: number;
}

// ============================================================================
// Yield Harvester Agent
// ============================================================================

export class YieldHarvesterAgent {
  private config: YieldHarvesterConfig;
  private store: StrategyStore;
  private state: YieldHarvesterState;

  constructor(store: StrategyStore, config: Partial<YieldHarvesterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
    this.state = {
      initialized: false,
      activePositions: 0,
      totalValueUsd: 0,
      pendingRewardsUsd: 0,
      lastHarvestAt: 0,
      lastRebalanceAt: 0,
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.state.initialized) return;

    console.log('[YieldHarvester] Initializing...');

    // Initialize protocol registry
    const registry = getProtocolRegistry();
    await registry.initialize();

    this.state.initialized = true;
    console.log('[YieldHarvester] Initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log('[YieldHarvester] Shutting down...');
    this.state.initialized = false;
  }

  // ==========================================================================
  // Execution Handlers
  // ==========================================================================

  /**
   * Get handler for yield harvesting jobs
   */
  getHarvestHandler(): ExecutionHandler {
    return async (job: Job<ExecutionJobData>, strategy: Strategy): Promise<ExecutionJobResult> => {
      return this.executeHarvest(job, strategy);
    };
  }

  /**
   * Get handler for rebalancing jobs
   */
  getRebalanceHandler(): ExecutionHandler {
    return async (job: Job<ExecutionJobData>, strategy: Strategy): Promise<ExecutionJobResult> => {
      return this.executeRebalance(job, strategy);
    };
  }

  // ==========================================================================
  // Harvest Execution
  // ==========================================================================

  /**
   * Execute harvest for a strategy
   */
  async executeHarvest(
    job: Job<ExecutionJobData>,
    strategy: Strategy
  ): Promise<ExecutionJobResult> {
    const startTime = Date.now();
    const goalStrategy = strategy.config as unknown as GoalStrategy | undefined;

    try {
      if (!goalStrategy || !isYieldHarvesterStrategy(goalStrategy)) {
        return {
          success: false,
          error: 'Invalid strategy config for yield harvester',
        };
      }
      const strategyConfig = goalStrategy;

      const walletAddress = job.data.params.walletAddress as string;
      if (!walletAddress) {
        return {
          success: false,
          error: 'Wallet address not provided',
        };
      }

      // Get all positions across enabled protocols
      const registry = getProtocolRegistry();
      const positions = await registry.getAllPositions(walletAddress);

      if (positions.length === 0) {
        return {
          success: true,
          metadata: {
            message: 'No positions to harvest',
            harvestedPositions: 0,
          },
        };
      }

      // Harvest each position
      const harvestResults: Array<{
        position: YieldPosition;
        result: HarvestResult;
      }> = [];

      for (const position of positions) {
        const adapter = registry.get(position.protocolId);
        if (!adapter) continue;

        // Check harvestable rewards
        const harvestable = await adapter.getHarvestableRewards(position.positionId);

        if (harvestable.totalValueUsd < this.config.minHarvestValueUsd) {
          if (this.config.verboseLogging) {
            console.log(
              `[YieldHarvester] Skipping ${position.protocolId}: ` +
                `$${harvestable.totalValueUsd.toFixed(2)} < $${this.config.minHarvestValueUsd} minimum`
            );
          }
          continue;
        }

        // Execute harvest
        const result = await adapter.harvest(position.positionId, walletAddress);
        harvestResults.push({ position, result });

        if (result.success && this.config.verboseLogging) {
          console.log(
            `[YieldHarvester] Harvested ${position.protocolId}: $${result.totalValueUsd.toFixed(2)}`
          );
        }
      }

      // Calculate totals
      const successfulHarvests = harvestResults.filter((r) => r.result.success);
      const totalRewardsUsd = successfulHarvests.reduce(
        (sum, r) => sum + r.result.totalValueUsd,
        0
      );

      // Auto-compound if enabled and worth it
      let compoundedAmountUsd = 0;
      if (strategyConfig.autoCompound && totalRewardsUsd >= this.config.minCompoundValueUsd) {
        const compoundResults = await this.compoundRewards(
          successfulHarvests.map((r) => r.position),
          walletAddress
        );
        compoundedAmountUsd = compoundResults.reduce(
          (sum, r) => sum + (r.success ? r.amountCompounded : 0),
          0
        );
      }

      // Update state
      this.state.lastHarvestAt = Date.now();
      this.state.pendingRewardsUsd = 0;

      const summary: HarvestSummary = {
        strategyId: strategy.strategyId,
        harvestedPositions: successfulHarvests.length,
        totalRewardsUsd,
        rewards: successfulHarvests.flatMap((r) =>
          r.result.rewards.map((reward) => ({
            protocolId: r.position.protocolId,
            token: reward.token,
            amount: reward.amount,
            valueUsd: reward.amount, // Would need price conversion
          }))
        ),
        compounded: compoundedAmountUsd > 0,
        compoundedAmountUsd,
        timestamp: Date.now(),
      };

      return {
        success: true,
        execution: {
          executionId: `harvest_${job.data.jobId}`,
          strategyId: strategy.strategyId,
          startedAt: startTime,
          completedAt: Date.now(),
          success: true,
          amountExecuted: totalRewardsUsd,
        },
        metadata: summary as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error('[YieldHarvester] Harvest failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution: {
          executionId: `harvest_${job.data.jobId}`,
          strategyId: strategy.strategyId,
          startedAt: startTime,
          completedAt: Date.now(),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  // ==========================================================================
  // Compounding
  // ==========================================================================

  /**
   * Compound rewards for positions
   */
  private async compoundRewards(
    positions: YieldPosition[],
    walletAddress: string
  ): Promise<CompoundResult[]> {
    const registry = getProtocolRegistry();
    const results: CompoundResult[] = [];

    for (const position of positions) {
      const adapter = registry.get(position.protocolId);
      if (!adapter) continue;

      try {
        const result = await adapter.compound(position.positionId, walletAddress);
        results.push(result);

        if (result.success && this.config.verboseLogging) {
          console.log(
            `[YieldHarvester] Compounded ${position.protocolId}: $${result.amountCompounded.toFixed(2)}`
          );
        }
      } catch (error) {
        console.error(
          `[YieldHarvester] Failed to compound ${position.protocolId}:`,
          error
        );
        results.push({
          success: false,
          amountCompounded: 0,
          newPositionValue: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  // ==========================================================================
  // Rebalancing
  // ==========================================================================

  /**
   * Execute rebalancing for a strategy
   */
  async executeRebalance(
    job: Job<ExecutionJobData>,
    strategy: Strategy
  ): Promise<ExecutionJobResult> {
    const startTime = Date.now();
    const goalStrategy = strategy.config as unknown as GoalStrategy | undefined;

    if (!goalStrategy || !isYieldHarvesterStrategy(goalStrategy)) {
      return {
        success: false,
        error: 'Invalid strategy config for yield harvester rebalance',
      };
    }
    const strategyConfig = goalStrategy;

    try {
      const walletAddress = job.data.params.walletAddress as string;

      // Get current positions
      const registry = getProtocolRegistry();
      const positions = await registry.getAllPositions(walletAddress);

      // Calculate current total value
      const totalValueUsd = positions.reduce((sum, p) => sum + p.currentValue, 0);

      if (totalValueUsd === 0) {
        return {
          success: true,
          metadata: {
            message: 'No positions to rebalance',
          },
        };
      }

      // Get optimizer recommendations
      const optimizer = getYieldOptimizer({
        maxProtocolExposure: strategyConfig.maxProtocolExposure,
        rebalanceThreshold: strategyConfig.rebalanceThreshold,
        minAPY: strategyConfig.minAPY,
      });

      // Create optimal allocation plan
      const availableTokens = [...new Set(positions.map((p) => p.depositToken))];
      const allocationPlan = await optimizer.createAllocationPlan(
        'moderate', // Would come from goal config
        availableTokens,
        totalValueUsd
      );

      // Create rebalance plan
      const rebalancePlan = await optimizer.createRebalancePlan(
        positions,
        allocationPlan.targets,
        totalValueUsd
      );

      if (!rebalancePlan.shouldRebalance) {
        return {
          success: true,
          metadata: {
            message: rebalancePlan.reason,
            shouldRebalance: false,
          },
        };
      }

      // Execute rebalance actions
      let actionsExecuted = 0;
      let totalMovedUsd = 0;

      for (const action of rebalancePlan.actions) {
        try {
          if (action.type === 'withdraw') {
            const fromAdapter = registry.get(action.fromProtocol!);
            if (fromAdapter) {
              const result = await fromAdapter.withdraw(
                `${action.fromProtocol}:${action.fromProductId}:${walletAddress}`,
                action.amount,
                walletAddress
              );
              if (result.success) {
                actionsExecuted++;
                totalMovedUsd += action.amountUsd;
              }
            }
          } else if (action.type === 'deposit') {
            const toAdapter = registry.get(action.toProtocol);
            if (toAdapter) {
              const result = await toAdapter.deposit(
                action.amount,
                action.token,
                walletAddress,
                action.toProductId
              );
              if (result.success) {
                actionsExecuted++;
                totalMovedUsd += action.amountUsd;
              }
            }
          }
        } catch (error) {
          console.error(
            `[YieldHarvester] Rebalance action failed:`,
            action,
            error
          );
        }
      }

      // Update state
      this.state.lastRebalanceAt = Date.now();

      return {
        success: true,
        execution: {
          executionId: `rebalance_${job.data.jobId}`,
          strategyId: strategy.strategyId,
          startedAt: startTime,
          completedAt: Date.now(),
          success: true,
          amountExecuted: totalMovedUsd,
        },
        metadata: {
          actionsPlanned: rebalancePlan.actions.length,
          actionsExecuted,
          totalMovedUsd,
          expectedAPYImprovement: rebalancePlan.expectedAPYImprovement,
        },
      };
    } catch (error) {
      console.error('[YieldHarvester] Rebalance failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Deployment
  // ==========================================================================

  /**
   * Deploy funds to yield protocols based on strategy
   */
  async deployFunds(
    strategy: Strategy,
    amountUsd: number,
    token: string,
    walletAddress: string
  ): Promise<{
    success: boolean;
    positionsCreated: number;
    totalDeployedUsd: number;
    positions: Array<{ protocolId: string; productId: string; amountUsd: number }>;
    error?: string;
  }> {
    const goalStrategy = strategy.config as unknown as GoalStrategy | undefined;

    if (!goalStrategy || !isYieldHarvesterStrategy(goalStrategy)) {
      return {
        success: false,
        positionsCreated: 0,
        totalDeployedUsd: 0,
        positions: [],
        error: 'Invalid strategy config for deploying funds',
      };
    }
    const strategyConfig = goalStrategy;

    try {
      // Get optimal allocation
      const optimizer = getYieldOptimizer({
        maxProtocolExposure: strategyConfig.maxProtocolExposure,
        minAPY: strategyConfig.minAPY,
      });

      const allocationPlan = await optimizer.createAllocationPlan(
        'moderate', // Would come from goal
        [token],
        amountUsd
      );

      if (allocationPlan.targets.length === 0) {
        return {
          success: false,
          positionsCreated: 0,
          totalDeployedUsd: 0,
          positions: [],
          error: 'No suitable yield opportunities found',
        };
      }

      // Deploy to each target
      const registry = getProtocolRegistry();
      const deployedPositions: Array<{
        protocolId: string;
        productId: string;
        amountUsd: number;
      }> = [];
      let totalDeployedUsd = 0;

      for (const target of allocationPlan.targets) {
        const adapter = registry.get(target.protocolId);
        if (!adapter) continue;

        const deployAmount = (target.targetPercentage / 100) * amountUsd;
        const tokenAmount = deployAmount / 150; // Would use actual price

        const result = await adapter.deposit(
          tokenAmount,
          target.token,
          walletAddress,
          target.productId
        );

        if (result.success) {
          deployedPositions.push({
            protocolId: target.protocolId,
            productId: target.productId,
            amountUsd: deployAmount,
          });
          totalDeployedUsd += deployAmount;
        }
      }

      return {
        success: deployedPositions.length > 0,
        positionsCreated: deployedPositions.length,
        totalDeployedUsd,
        positions: deployedPositions,
      };
    } catch (error) {
      return {
        success: false,
        positionsCreated: 0,
        totalDeployedUsd: 0,
        positions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): YieldHarvesterState {
    return { ...this.state };
  }

  /**
   * Get positions summary for a wallet
   */
  async getPositionsSummary(walletAddress: string): Promise<{
    positions: YieldPosition[];
    totalValueUsd: number;
    weightedAPY: number;
    pendingRewardsUsd: number;
  }> {
    const registry = getProtocolRegistry();
    const positions = await registry.getAllPositions(walletAddress);

    const totalValueUsd = positions.reduce((sum, p) => sum + p.currentValue, 0);

    const weightedAPY =
      totalValueUsd > 0
        ? positions.reduce((sum, p) => sum + (p.currentAPY * p.currentValue) / totalValueUsd, 0)
        : 0;

    const pendingRewardsUsd = positions.reduce(
      (sum, p) => sum + (p.pendingYield || 0),
      0
    );

    return {
      positions,
      totalValueUsd,
      weightedAPY,
      pendingRewardsUsd,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let harvesterInstance: YieldHarvesterAgent | null = null;

export function getYieldHarvester(
  store: StrategyStore,
  config?: Partial<YieldHarvesterConfig>
): YieldHarvesterAgent {
  if (!harvesterInstance) {
    harvesterInstance = new YieldHarvesterAgent(store, config);
  }
  return harvesterInstance;
}

export function resetYieldHarvester(): void {
  if (harvesterInstance) {
    harvesterInstance.shutdown();
    harvesterInstance = null;
  }
}

// Re-exports
export * from './protocols/index.js';
export * from './yieldOptimizer.js';
