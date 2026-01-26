/**
 * Strategy Engine Types - Public Exports
 */

// Strategy types
export {
  // Core types
  type StrategyType,
  type StrategyStatus,
  type Strategy,
  type StrategySummary,
  STRATEGY_STATE_TRANSITIONS,

  // Configuration types
  type StrategyConfig,
  type DCAConfig,
  type StopLossConfig,
  type TakeProfitConfig,

  // Execution types
  type StrategyExecution,

  // Input/Query types
  type CreateStrategyInput,
  type UpdateStrategyInput,
  type StrategyFilter,
  type StrategySort,
  type StrategyPagination,
  type StrategyQueryResult,

  // Type guards
  isDCAConfig,
  isStopLossConfig,
  isTakeProfitConfig,
  isGoalConfig,
  isValidStateTransition,
} from './strategy.js';

// Goal types
export {
  // Core goal types
  type GoalType,
  type RiskTolerance,
  type GoalConfig,
  type GoalProgress,
  type GoalProgressSnapshot,

  // Strategy types
  type GoalStrategy,
  type DCAGoalStrategy,
  type YieldHarvesterStrategy,
  type TradingBotStrategy,
  type HybridStrategy,

  // Yield types
  type YieldProductType,
  type YieldProtocol,
  type YieldPosition,
  type YieldOpportunity,
  type HarvestResult,
  type AllocationDrift,
  type RebalanceAction,
  SUPPORTED_YIELD_PROTOCOLS,

  // Type guards
  isDCAGoalStrategy,
  isYieldHarvesterStrategy,
  isTradingBotStrategy,
  isHybridStrategy,
} from './goal.js';

// Condition types
export {
  // Core types
  type ConditionType,
  type ComparisonOperator,
  type LogicalOperator,
  type TriggerCondition,
  type ConditionGroup,

  // Configuration types
  type ConditionConfig,
  type PriceCondition,
  type TimeCondition,
  type BalanceCondition,
  type PercentageChangeCondition,
  type CustomCondition,
  type ConditionVariable,

  // Evaluation types
  type ConditionEvaluationResult,
  type BatchConditionEvaluationResult,

  // Price feed types
  type PriceData,
  type PriceSubscription,

  // Schedule types
  type ScheduledJob,

  // Type guards
  isPriceCondition,
  isTimeCondition,
  isBalanceCondition,
  isPercentageChangeCondition,
  isCustomCondition,

  // Utility functions
  evaluateComparison,
  describeComparison,
  generateConditionDescription,
} from './conditions.js';

// Event types
export {
  // Core types
  type StrategyEventType,
  type StrategyEvent,
  type StrategyEventPayload,

  // Payload types
  type StrategyCreatedPayload,
  type StatusChangePayload,
  type StrategyUpdatedPayload,
  type ConditionPayload,
  type ConditionEvaluatedPayload,
  type ConditionTriggeredPayload,
  type ExecutionPayload,
  type GoalProgressPayload,
  type GoalMilestonePayload,
  type YieldHarvestedPayload,
  type PositionPayload,
  type RebalancePayload,
  type ErrorPayload,
  type WarningPayload,
  type NotificationPayload,

  // Query types
  type EventQueryOptions,
  type EventQueryResult,
  type EventSubscription,

  // Factory functions
  createEvent,
  createStrategyCreatedEvent,
  createStatusChangeEvent,
  createExecutionEvent,
  createGoalProgressEvent,
  createMilestoneEvent,
  createErrorEvent,

  // Utility functions
  groupEventsByCorrelation,
  getLatestEventOfType,
  reconstructStrategyStatus,
} from './events.js';
