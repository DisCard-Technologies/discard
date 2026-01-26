/**
 * Goal Types - Autonomous Goal Agents
 *
 * Defines configurations for autonomous agents that actively work
 * toward user goals through yield harvesting, trading, and compounding.
 */

import type { DCAConfig } from './strategy.js';

// ============================================================================
// Goal Configuration Types
// ============================================================================

/**
 * Types of goals users can set
 */
export type GoalType =
  | 'save' // Save a target amount
  | 'accumulate' // Accumulate a specific token
  | 'grow' // Grow portfolio value
  | 'income'; // Generate passive income

/**
 * Risk tolerance levels for goal achievement strategies
 */
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

/**
 * Main Goal Configuration
 */
export interface GoalConfig {
  /** Type of goal */
  goalType: GoalType;
  /** Target amount to achieve */
  targetAmount: number;
  /** Token to measure target in (e.g., 'USDC', 'SOL') */
  targetToken: string;
  /** Optional deadline (Unix timestamp) */
  deadline?: number;
  /** User's risk tolerance */
  riskTolerance: RiskTolerance;
  /** Autonomous agent mandate - how to achieve the goal */
  achievementStrategy: GoalStrategy;
  /** Optional: Regular contribution schedule */
  contribution?: {
    amount: number;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    sourceToken: string;
  };
  /** Notifications preferences */
  notifications?: {
    onMilestone: boolean;
    milestonePercentages: number[];
    onRebalance: boolean;
    onYieldHarvest: boolean;
    dailySummary: boolean;
  };
}

// ============================================================================
// Goal Achievement Strategies (Autonomous Agents)
// ============================================================================

/**
 * Union type for all goal achievement strategies
 */
export type GoalStrategy =
  | DCAGoalStrategy
  | YieldHarvesterStrategy
  | TradingBotStrategy
  | HybridStrategy;

/**
 * DCA Strategy - simplest autonomous goal agent
 * Steady accumulation through dollar-cost averaging
 */
export interface DCAGoalStrategy {
  type: 'dca';
  /** DCA configuration for regular purchases */
  dcaConfig: DCAConfig;
}

/**
 * Yield Harvester Strategy - deploys funds to DeFi protocols
 * Auto-compounds and rebalances for optimal returns
 */
export interface YieldHarvesterStrategy {
  type: 'yield_harvester';
  /** Allowed yield protocols */
  protocols: YieldProtocol[];
  /** Minimum APY threshold - only deploy if APY > this */
  minAPY: number;
  /** Maximum exposure to single protocol (diversification) */
  maxProtocolExposure: number;
  /** Whether to reinvest yields automatically */
  autoCompound: boolean;
  /** How often to check and harvest yields */
  harvestFrequency: 'daily' | 'weekly';
  /** Rebalance if allocation drifts more than this percentage */
  rebalanceThreshold: number;
  /** Whether to include LP positions (higher risk/reward) */
  includeLiquidityPools: boolean;
  /** Maximum IL (impermanent loss) tolerance for LP positions */
  maxImpermanentLoss?: number;
}

/**
 * Trading Bot Strategy - active trading to grow portfolio
 */
export interface TradingBotStrategy {
  type: 'trading_bot';
  /** Trading style/approach */
  tradingStyle: 'momentum' | 'mean_reversion' | 'grid' | 'arbitrage';
  /** Trading pairs to operate on */
  tradingPairs: string[];
  /** Stop trading if portfolio drops more than this percentage */
  maxDrawdown: number;
  /** Lock in gains when profit reaches this percentage */
  takeProfitThreshold: number;
  /** Maximum number of trades per day */
  maxTradesPerDay: number;
  /** Whether to use external trading signals */
  useSignals: boolean;
  /** Trusted signal providers (if useSignals is true) */
  signalProviders?: string[];
  /** Position sizing as percentage of available funds */
  positionSizePercent: number;
  /** Stop-loss per trade */
  stopLossPercent: number;
}

/**
 * Hybrid Strategy - combines multiple strategies with allocation
 */
export interface HybridStrategy {
  type: 'hybrid';
  /** Allocation across different strategies */
  allocation: {
    dca?: {
      percentage: number;
      config: DCAConfig;
    };
    yieldHarvester?: {
      percentage: number;
      config: Omit<YieldHarvesterStrategy, 'type'>;
    };
    tradingBot?: {
      percentage: number;
      config: Omit<TradingBotStrategy, 'type'>;
    };
    reserve?: {
      percentage: number;
      token: string;
    };
  };
  /** How often to rebalance between strategies */
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
}

// ============================================================================
// Yield Protocol Types
// ============================================================================

/**
 * Types of yield-generating products
 */
export type YieldProductType = 'staking' | 'liquid_staking' | 'lending' | 'lp' | 'vault';

/**
 * Configuration for a yield protocol
 */
export interface YieldProtocol {
  /** Protocol identifier */
  protocolId: string;
  /** Human-readable protocol name */
  protocolName: string;
  /** Type of yield product */
  productType: YieldProductType;
  /** Maximum allocation percentage to this protocol */
  maxAllocation: number;
  /** Whether this protocol is enabled for use */
  enabled: boolean;
  /** Minimum deposit amount */
  minDeposit?: number;
  /** Chain the protocol operates on */
  chain: 'solana' | 'ethereum' | 'arbitrum';
}

/**
 * Supported yield protocols registry
 */
export const SUPPORTED_YIELD_PROTOCOLS: YieldProtocol[] = [
  {
    protocolId: 'marinade',
    protocolName: 'Marinade Finance',
    productType: 'liquid_staking',
    maxAllocation: 100,
    enabled: true,
    chain: 'solana',
  },
  {
    protocolId: 'kamino',
    protocolName: 'Kamino Finance',
    productType: 'lending',
    maxAllocation: 100,
    enabled: true,
    chain: 'solana',
  },
  {
    protocolId: 'drift',
    protocolName: 'Drift Protocol',
    productType: 'vault',
    maxAllocation: 50,
    enabled: true,
    chain: 'solana',
  },
  {
    protocolId: 'jupiter-perps',
    protocolName: 'Jupiter Perps',
    productType: 'lp',
    maxAllocation: 30,
    enabled: true,
    chain: 'solana',
  },
  {
    protocolId: 'raydium',
    protocolName: 'Raydium',
    productType: 'lp',
    maxAllocation: 30,
    enabled: true,
    chain: 'solana',
  },
  {
    protocolId: 'jito',
    protocolName: 'Jito',
    productType: 'liquid_staking',
    maxAllocation: 100,
    enabled: true,
    chain: 'solana',
  },
];

// ============================================================================
// Goal Progress Tracking
// ============================================================================

/**
 * Tracks progress toward a goal
 */
export interface GoalProgress {
  /** Goal ID this progress belongs to */
  goalId: string;
  /** Target amount */
  targetAmount: number;
  /** Current amount achieved */
  currentAmount: number;
  /** Progress as a percentage (0-100) */
  progressPercentage: number;
  /** Estimated completion date based on current rate */
  projectedCompletionDate: number | null;
  /** Whether goal is on track to meet deadline */
  onTrack: boolean;
  /** Days remaining until deadline */
  daysRemaining: number | null;
  /** Breakdown of how progress was achieved */
  contributions: {
    /** Amount from DCA purchases */
    dca: number;
    /** Amount from yield earnings */
    yieldEarned: number;
    /** Amount from trading profits/losses */
    tradingPnL: number;
    /** Amount from price appreciation */
    priceAppreciation: number;
    /** Manual deposits */
    manualDeposits: number;
  };
  /** Historical progress snapshots */
  history: GoalProgressSnapshot[];
  /** Last updated timestamp */
  lastUpdatedAt: number;
}

/**
 * Point-in-time snapshot of goal progress
 */
export interface GoalProgressSnapshot {
  /** Timestamp of the snapshot */
  timestamp: number;
  /** Amount at this point */
  amount: number;
  /** Progress percentage at this point */
  progressPercentage: number;
  /** Note or reason for snapshot */
  note?: string;
}

// ============================================================================
// Yield Position Types
// ============================================================================

/**
 * Represents a deployed yield position
 */
export interface YieldPosition {
  /** Unique position ID */
  positionId: string;
  /** Strategy ID this position belongs to */
  strategyId: string;
  /** Protocol the funds are deployed to */
  protocolId: string;
  /** Product/pool within the protocol */
  productId: string;
  /** Amount deposited (in deposit token) */
  depositAmount: number;
  /** Current value (may differ due to yields) */
  currentValue: number;
  /** Token deposited */
  depositToken: string;
  /** Receipt/LP token received */
  receiptToken?: string;
  /** Current APY */
  currentAPY: number;
  /** Total yield earned */
  totalYieldEarned: number;
  /** Total yield harvested */
  totalYieldHarvested: number;
  /** Pending unharvested yield */
  pendingYield: number;
  /** Position opened timestamp */
  openedAt: number;
  /** Last harvest timestamp */
  lastHarvestAt?: number;
  /** Position status */
  status: 'active' | 'withdrawing' | 'closed';
}

/**
 * Yield opportunity discovered by the harvester
 */
export interface YieldOpportunity {
  /** Protocol offering the yield */
  protocolId: string;
  /** Specific product/pool */
  productId: string;
  /** Product name */
  productName: string;
  /** Current APY */
  currentAPY: number;
  /** 7-day average APY */
  avgAPY7d: number;
  /** 30-day average APY */
  avgAPY30d: number;
  /** Token(s) to deposit */
  depositTokens: string[];
  /** Total value locked */
  tvl: number;
  /** Risk score (1-10, higher = riskier) */
  riskScore: number;
  /** Whether this opportunity is recommended */
  recommended: boolean;
  /** Reason for recommendation/non-recommendation */
  reason?: string;
}

/**
 * Result of harvesting yields
 */
export interface HarvestResult {
  /** Position that was harvested */
  positionId: string;
  /** Amount harvested */
  amountHarvested: number;
  /** Token harvested */
  harvestToken: string;
  /** Whether it was compounded */
  compounded: boolean;
  /** New position value after compound */
  newPositionValue?: number;
  /** Transaction signature */
  transactionSignature: string;
  /** Timestamp of harvest */
  harvestedAt: number;
}

/**
 * Allocation drift analysis
 */
export interface AllocationDrift {
  /** Current allocations by protocol */
  currentAllocations: Map<string, number>;
  /** Target allocations by protocol */
  targetAllocations: Map<string, number>;
  /** Maximum drift observed */
  maxDrift: number;
  /** Whether rebalance is recommended */
  rebalanceRecommended: boolean;
  /** Suggested rebalance actions */
  suggestedActions: RebalanceAction[];
}

/**
 * Action to rebalance allocations
 */
export interface RebalanceAction {
  /** Action type */
  action: 'withdraw' | 'deposit';
  /** Protocol to act on */
  protocolId: string;
  /** Amount to withdraw/deposit */
  amount: number;
  /** Token involved */
  token: string;
  /** Reason for this action */
  reason: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDCAGoalStrategy(strategy: GoalStrategy): strategy is DCAGoalStrategy {
  return strategy.type === 'dca';
}

export function isYieldHarvesterStrategy(strategy: GoalStrategy): strategy is YieldHarvesterStrategy {
  return strategy.type === 'yield_harvester';
}

export function isTradingBotStrategy(strategy: GoalStrategy): strategy is TradingBotStrategy {
  return strategy.type === 'trading_bot';
}

export function isHybridStrategy(strategy: GoalStrategy): strategy is HybridStrategy {
  return strategy.type === 'hybrid';
}
