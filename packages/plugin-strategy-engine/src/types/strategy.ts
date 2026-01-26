/**
 * Strategy Engine Core Types
 *
 * Defines the data structures and state machines for strategic commitments
 * that persist beyond single transactions.
 */

import type { GoalConfig, GoalProgress } from './goal.js';
import type { TriggerCondition } from './conditions.js';
import type { StrategyEvent } from './events.js';

// ============================================================================
// Strategy Types
// ============================================================================

/**
 * Types of strategies supported by the engine
 */
export type StrategyType =
  | 'dca' // Dollar-cost averaging
  | 'stop_loss' // Sell when price drops below threshold
  | 'take_profit' // Sell when price rises above threshold
  | 'goal' // Autonomous goal achievement (save, accumulate, grow)
  | 'custom'; // User-defined custom strategy

/**
 * Strategy lifecycle states
 */
export type StrategyStatus =
  | 'draft' // User is configuring
  | 'pending' // Awaiting approval/verification
  | 'active' // Running, monitoring conditions
  | 'paused' // User paused, not monitoring
  | 'triggered' // Condition met, executing action
  | 'completed' // Goal reached or strategy finished
  | 'cancelled' // User cancelled
  | 'failed'; // Execution failed

/**
 * Valid state transitions for the strategy state machine
 */
export const STRATEGY_STATE_TRANSITIONS: Record<StrategyStatus, StrategyStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['active', 'cancelled', 'failed'],
  active: ['paused', 'triggered', 'completed', 'cancelled', 'failed'],
  paused: ['active', 'cancelled'],
  triggered: ['active', 'completed', 'failed'],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
  failed: ['draft', 'pending'], // Can retry from failed
};

// ============================================================================
// Strategy Configuration Types
// ============================================================================

/**
 * DCA (Dollar-Cost Averaging) Configuration
 */
export interface DCAConfig {
  /** Token pair for the swap (e.g., USDC -> SOL) */
  tokenPair: {
    from: string;
    to: string;
  };
  /** Amount to spend per execution in the 'from' token */
  amountPerExecution: number;
  /** How often to execute */
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  /** Optional: Stop after reaching this total amount spent */
  maxTotalAmount?: number;
  /** Optional: Stop after this many executions */
  maxExecutions?: number;
  /** Optional: Stop on this date (Unix timestamp) */
  endDate?: number;
  /** Slippage tolerance as a decimal (e.g., 0.01 = 1%) */
  slippageTolerance: number;
  /** Preferred DEX for execution */
  preferredDex?: 'jupiter' | 'raydium' | 'orca';
}

/**
 * Stop-Loss Configuration
 */
export interface StopLossConfig {
  /** Token to monitor and potentially sell */
  token: string;
  /** Price threshold that triggers the stop-loss */
  triggerPrice: number;
  /** Quote currency for the price (e.g., 'USD', 'USDC') */
  quoteCurrency: string;
  /** Direction of trigger */
  triggerType: 'below' | 'above';
  /** How much to sell when triggered */
  amountToSell: 'all' | 'percentage' | 'fixed';
  /** Amount value (100 for all, percentage value, or fixed token amount) */
  amount: number;
  /** Slippage tolerance */
  slippageTolerance: number;
  /** Minimum price to accept (limit order style) */
  minimumPrice?: number;
  /** Whether to use trailing stop-loss */
  trailing?: {
    enabled: boolean;
    /** Percentage below peak to trigger (e.g., 0.10 = 10%) */
    trailPercentage: number;
  };
}

/**
 * Take-Profit Configuration
 */
export interface TakeProfitConfig {
  /** Token to monitor and potentially sell */
  token: string;
  /** Price threshold that triggers take-profit */
  triggerPrice: number;
  /** Quote currency for the price */
  quoteCurrency: string;
  /** How much to sell when triggered */
  amountToSell: 'all' | 'percentage' | 'fixed';
  /** Amount value */
  amount: number;
  /** Slippage tolerance */
  slippageTolerance: number;
  /** Whether to use scaled take-profit (multiple levels) */
  scaled?: {
    enabled: boolean;
    /** Array of price levels and percentages to sell at each */
    levels: Array<{
      price: number;
      sellPercentage: number;
    }>;
  };
}

/**
 * Union type for all strategy configurations
 */
export type StrategyConfig = DCAConfig | StopLossConfig | TakeProfitConfig | GoalConfig;

// ============================================================================
// Strategy Execution Types
// ============================================================================

/**
 * Result of a single strategy execution
 */
export interface StrategyExecution {
  /** Unique execution ID */
  executionId: string;
  /** Parent strategy ID */
  strategyId: string;
  /** When the execution started */
  startedAt: number;
  /** When the execution completed */
  completedAt?: number;
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Transaction signature if on-chain action occurred */
  transactionSignature?: string;
  /** Amount executed (in base token) */
  amountExecuted?: number;
  /** Price at execution time */
  executionPrice?: number;
  /** Fees paid */
  feesPaid?: number;
  /** Slippage experienced */
  actualSlippage?: number;
  /** Condition that triggered this execution */
  triggeredBy?: string;
}

// ============================================================================
// Main Strategy Interface
// ============================================================================

/**
 * Core Strategy entity representing a persistent strategic commitment
 */
export interface Strategy {
  /** Unique strategy identifier */
  strategyId: string;
  /** User who owns this strategy */
  userId: string;
  /** Type of strategy */
  type: StrategyType;
  /** User-friendly name (e.g., "My SOL DCA") */
  name: string;
  /** Optional description */
  description?: string;
  /** Current status in the lifecycle */
  status: StrategyStatus;

  /** Configuration specific to the strategy type */
  config: StrategyConfig;

  /** Conditions that trigger strategy execution */
  conditions: TriggerCondition[];

  /** History of all executions */
  executions: StrategyExecution[];

  /** Event history for audit trail */
  events: StrategyEvent[];

  /** Goal progress (only for goal-type strategies) */
  goalProgress?: GoalProgress;

  // Timestamps
  createdAt: number;
  updatedAt: number;
  activatedAt?: number;
  lastTriggeredAt?: number;
  lastExecutedAt?: number;
  completedAt?: number;
  pausedAt?: number;
  cancelledAt?: number;

  // Aggregated statistics
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalAmountExecuted: number;
  totalFeePaid: number;

  // Metadata
  metadata?: Record<string, unknown>;
  tags?: string[];
}

// ============================================================================
// Strategy Creation Input Types
// ============================================================================

/**
 * Input for creating a new strategy
 */
export interface CreateStrategyInput {
  userId: string;
  type: StrategyType;
  name: string;
  description?: string;
  config: StrategyConfig;
  conditions?: TriggerCondition[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  /** If true, activate immediately after creation */
  activateImmediately?: boolean;
}

/**
 * Input for updating a strategy
 */
export interface UpdateStrategyInput {
  name?: string;
  description?: string;
  config?: Partial<StrategyConfig>;
  conditions?: TriggerCondition[];
  metadata?: Record<string, unknown>;
  tags?: string[];
}

// ============================================================================
// Strategy Query Types
// ============================================================================

/**
 * Filters for querying strategies
 */
export interface StrategyFilter {
  userId?: string;
  type?: StrategyType | StrategyType[];
  status?: StrategyStatus | StrategyStatus[];
  tags?: string[];
  createdAfter?: number;
  createdBefore?: number;
}

/**
 * Sort options for strategy queries
 */
export interface StrategySort {
  field: 'createdAt' | 'updatedAt' | 'name' | 'totalExecutions';
  direction: 'asc' | 'desc';
}

/**
 * Pagination options
 */
export interface StrategyPagination {
  offset: number;
  limit: number;
}

/**
 * Result of a paginated strategy query
 */
export interface StrategyQueryResult {
  strategies: Strategy[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Summary view of a strategy (for lists)
 */
export interface StrategySummary {
  strategyId: string;
  userId: string;
  type: StrategyType;
  name: string;
  status: StrategyStatus;
  totalExecutions: number;
  lastExecutedAt?: number;
  createdAt: number;
}

/**
 * Type guard to check if config is DCA
 */
export function isDCAConfig(config: StrategyConfig): config is DCAConfig {
  return 'tokenPair' in config && 'frequency' in config;
}

/**
 * Type guard to check if config is StopLoss
 */
export function isStopLossConfig(config: StrategyConfig): config is StopLossConfig {
  return 'triggerPrice' in config && 'triggerType' in config && !('scaled' in config);
}

/**
 * Type guard to check if config is TakeProfit
 */
export function isTakeProfitConfig(config: StrategyConfig): config is TakeProfitConfig {
  return 'triggerPrice' in config && ('scaled' in config || !('triggerType' in config));
}

/**
 * Type guard to check if config is Goal
 */
export function isGoalConfig(config: StrategyConfig): config is GoalConfig {
  return 'goalType' in config && 'achievementStrategy' in config;
}

/**
 * Validates that a state transition is allowed
 */
export function isValidStateTransition(from: StrategyStatus, to: StrategyStatus): boolean {
  return STRATEGY_STATE_TRANSITIONS[from].includes(to);
}
