/**
 * Trigger Condition Types
 *
 * Defines the conditions that can trigger strategy execution,
 * including price triggers, time-based triggers, and balance conditions.
 */

// ============================================================================
// Condition Types
// ============================================================================

/**
 * Types of trigger conditions
 */
export type ConditionType =
  | 'price' // Price-based triggers (above/below threshold)
  | 'time' // Time-based triggers (cron schedule)
  | 'balance' // Balance-based triggers
  | 'percentage_change' // Price change percentage
  | 'custom'; // Custom condition with expression

/**
 * Comparison operators for conditions
 */
export type ComparisonOperator =
  | 'gt' // Greater than
  | 'gte' // Greater than or equal
  | 'lt' // Less than
  | 'lte' // Less than or equal
  | 'eq' // Equal
  | 'neq'; // Not equal

/**
 * Logical operators for combining conditions
 */
export type LogicalOperator = 'and' | 'or';

// ============================================================================
// Condition Configuration Types
// ============================================================================

/**
 * Price-based condition configuration
 */
export interface PriceCondition {
  type: 'price';
  /** Token to monitor price for */
  token: string;
  /** Quote currency (e.g., 'USD', 'USDC') */
  quoteCurrency: string;
  /** Comparison operator */
  operator: ComparisonOperator;
  /** Target price threshold */
  targetPrice: number;
  /** Price source to use */
  priceSource: 'jupiter' | 'pyth' | 'birdeye' | 'coingecko';
  /** Whether to track highest price seen (for trailing) */
  trackPeak?: boolean;
  /** Highest price seen if tracking */
  peakPrice?: number;
}

/**
 * Time-based condition configuration (cron schedule)
 */
export interface TimeCondition {
  type: 'time';
  /** Cron expression (e.g., "0 9 * * 1" for Mondays at 9 AM) */
  cronExpression: string;
  /** Timezone for the cron expression */
  timezone: string;
  /** Human-readable description */
  description?: string;
  /** Next scheduled trigger time (computed) */
  nextTriggerAt?: number;
}

/**
 * Balance-based condition configuration
 */
export interface BalanceCondition {
  type: 'balance';
  /** Token to check balance for */
  token: string;
  /** Comparison operator */
  operator: ComparisonOperator;
  /** Target balance threshold */
  targetBalance: number;
  /** Wallet/account to check (optional, defaults to user's main wallet) */
  walletAddress?: string;
}

/**
 * Percentage change condition (price moved X% from reference)
 */
export interface PercentageChangeCondition {
  type: 'percentage_change';
  /** Token to monitor */
  token: string;
  /** Quote currency */
  quoteCurrency: string;
  /** Reference price to compare against */
  referencePrice: number;
  /** Reference timestamp */
  referenceTimestamp: number;
  /** Direction of change to trigger on */
  direction: 'up' | 'down' | 'either';
  /** Percentage threshold (e.g., 0.10 for 10%) */
  percentageThreshold: number;
}

/**
 * Custom condition with expression
 */
export interface CustomCondition {
  type: 'custom';
  /** Expression to evaluate (safe subset of JavaScript) */
  expression: string;
  /** Variables available in the expression */
  variables: Record<string, ConditionVariable>;
  /** Description of what this condition checks */
  description: string;
}

/**
 * Variable definition for custom conditions
 */
export interface ConditionVariable {
  /** Variable name */
  name: string;
  /** How to fetch the variable's value */
  source: 'price' | 'balance' | 'timestamp' | 'constant';
  /** Source configuration */
  config: {
    token?: string;
    quoteCurrency?: string;
    walletAddress?: string;
    value?: number | string;
  };
}

/**
 * Union type for all condition configurations
 */
export type ConditionConfig =
  | PriceCondition
  | TimeCondition
  | BalanceCondition
  | PercentageChangeCondition
  | CustomCondition;

// ============================================================================
// Trigger Condition Interface
// ============================================================================

/**
 * Full trigger condition with state tracking
 */
export interface TriggerCondition {
  /** Unique condition ID */
  conditionId: string;
  /** Strategy this condition belongs to */
  strategyId: string;
  /** Type of condition */
  type: ConditionType;
  /** Condition-specific configuration */
  config: ConditionConfig;
  /** Whether this condition is currently active */
  enabled: boolean;
  /** Whether the condition is currently met */
  isMet: boolean;
  /** Last time this condition was evaluated */
  lastCheckedAt?: number;
  /** Last value observed during check */
  lastObservedValue?: number | string;
  /** Number of times this condition has been triggered */
  triggerCount: number;
  /** Last time this condition triggered an execution */
  lastTriggeredAt?: number;
  /** Cooldown period between triggers (in seconds) */
  cooldownSeconds?: number;
  /** Whether currently in cooldown */
  inCooldown: boolean;
  /** Priority for evaluation order (lower = higher priority) */
  priority: number;
  /** Description for UI */
  description?: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

// ============================================================================
// Condition Group (for complex conditions)
// ============================================================================

/**
 * Group of conditions combined with logical operators
 */
export interface ConditionGroup {
  /** Group ID */
  groupId: string;
  /** Logical operator to combine conditions */
  operator: LogicalOperator;
  /** Conditions in this group */
  conditions: TriggerCondition[];
  /** Nested groups for complex logic */
  nestedGroups?: ConditionGroup[];
  /** Whether the entire group is met */
  isMet: boolean;
}

// ============================================================================
// Condition Evaluation Types
// ============================================================================

/**
 * Result of evaluating a single condition
 */
export interface ConditionEvaluationResult {
  /** Condition ID */
  conditionId: string;
  /** Whether condition is met */
  isMet: boolean;
  /** Value observed during evaluation */
  observedValue: number | string | null;
  /** Target value the condition compares against */
  targetValue: number | string;
  /** Evaluation timestamp */
  evaluatedAt: number;
  /** Error if evaluation failed */
  error?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Batch evaluation result for multiple conditions
 */
export interface BatchConditionEvaluationResult {
  /** Timestamp of batch evaluation */
  evaluatedAt: number;
  /** Results by condition ID */
  results: Map<string, ConditionEvaluationResult>;
  /** Conditions that are newly met (weren't met before) */
  newlyMet: string[];
  /** Conditions that are no longer met */
  noLongerMet: string[];
  /** Errors encountered */
  errors: Array<{ conditionId: string; error: string }>;
}

// ============================================================================
// Price Feed Types
// ============================================================================

/**
 * Price data from a feed
 */
export interface PriceData {
  /** Token symbol */
  token: string;
  /** Quote currency */
  quoteCurrency: string;
  /** Current price */
  price: number;
  /** Price source */
  source: string;
  /** Confidence interval (for Pyth) */
  confidence?: number;
  /** Timestamp of price data */
  timestamp: number;
  /** 24h change percentage */
  change24h?: number;
  /** 24h high */
  high24h?: number;
  /** 24h low */
  low24h?: number;
}

/**
 * Price subscription for real-time monitoring
 */
export interface PriceSubscription {
  /** Subscription ID */
  subscriptionId: string;
  /** Token being monitored */
  token: string;
  /** Quote currency */
  quoteCurrency: string;
  /** Price source */
  source: string;
  /** Strategy IDs subscribed to this price */
  strategyIds: string[];
  /** Last price received */
  lastPrice?: PriceData;
  /** Callback for price updates */
  onPriceUpdate?: (price: PriceData) => void;
  /** Whether subscription is active */
  active: boolean;
}

// ============================================================================
// Cron Schedule Types
// ============================================================================

/**
 * Scheduled job for time-based conditions
 */
export interface ScheduledJob {
  /** Job ID */
  jobId: string;
  /** Condition ID this job is for */
  conditionId: string;
  /** Strategy ID */
  strategyId: string;
  /** Cron expression */
  cronExpression: string;
  /** Timezone */
  timezone: string;
  /** Next run time */
  nextRunAt: number;
  /** Last run time */
  lastRunAt?: number;
  /** Whether job is active */
  active: boolean;
  /** Number of times job has run */
  runCount: number;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isPriceCondition(config: ConditionConfig): config is PriceCondition {
  return config.type === 'price';
}

export function isTimeCondition(config: ConditionConfig): config is TimeCondition {
  return config.type === 'time';
}

export function isBalanceCondition(config: ConditionConfig): config is BalanceCondition {
  return config.type === 'balance';
}

export function isPercentageChangeCondition(config: ConditionConfig): config is PercentageChangeCondition {
  return config.type === 'percentage_change';
}

export function isCustomCondition(config: ConditionConfig): config is CustomCondition {
  return config.type === 'custom';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Evaluates a comparison between two values
 */
export function evaluateComparison(
  value: number,
  operator: ComparisonOperator,
  target: number
): boolean {
  switch (operator) {
    case 'gt':
      return value > target;
    case 'gte':
      return value >= target;
    case 'lt':
      return value < target;
    case 'lte':
      return value <= target;
    case 'eq':
      return value === target;
    case 'neq':
      return value !== target;
    default:
      return false;
  }
}

/**
 * Describes a comparison in human-readable form
 */
export function describeComparison(operator: ComparisonOperator): string {
  const descriptions: Record<ComparisonOperator, string> = {
    gt: 'greater than',
    gte: 'greater than or equal to',
    lt: 'less than',
    lte: 'less than or equal to',
    eq: 'equal to',
    neq: 'not equal to',
  };
  return descriptions[operator];
}

/**
 * Generates a human-readable description of a condition
 */
export function generateConditionDescription(condition: TriggerCondition): string {
  const config = condition.config;

  switch (config.type) {
    case 'price': {
      const op = describeComparison(config.operator);
      return `${config.token} price ${op} $${config.targetPrice} ${config.quoteCurrency}`;
    }
    case 'time': {
      return config.description || `Scheduled: ${config.cronExpression}`;
    }
    case 'balance': {
      const op = describeComparison(config.operator);
      return `${config.token} balance ${op} ${config.targetBalance}`;
    }
    case 'percentage_change': {
      const dir = config.direction === 'up' ? 'increases' : config.direction === 'down' ? 'decreases' : 'changes';
      return `${config.token} price ${dir} by ${config.percentageThreshold * 100}%`;
    }
    case 'custom': {
      return config.description;
    }
    default:
      return 'Unknown condition';
  }
}
