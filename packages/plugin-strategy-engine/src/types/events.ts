/**
 * Strategy Event Types - Event Sourcing
 *
 * Defines events for audit trail and state reconstruction.
 * All state changes are recorded as events for full traceability.
 */

import type { StrategyStatus, StrategyConfig, StrategyExecution } from './strategy.js';
import type { TriggerCondition, ConditionEvaluationResult } from './conditions.js';
import type { GoalProgress, HarvestResult, RebalanceAction } from './goal.js';

// ============================================================================
// Event Types
// ============================================================================

/**
 * All possible strategy event types
 */
export type StrategyEventType =
  // Lifecycle events
  | 'strategy_created'
  | 'strategy_activated'
  | 'strategy_paused'
  | 'strategy_resumed'
  | 'strategy_cancelled'
  | 'strategy_completed'
  | 'strategy_failed'
  // Configuration events
  | 'strategy_updated'
  | 'condition_added'
  | 'condition_removed'
  | 'condition_updated'
  // Execution events
  | 'condition_evaluated'
  | 'condition_triggered'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  // Goal-specific events
  | 'goal_progress_updated'
  | 'goal_milestone_reached'
  | 'yield_harvested'
  | 'yield_compounded'
  | 'position_opened'
  | 'position_closed'
  | 'rebalance_executed'
  // System events
  | 'error_occurred'
  | 'warning_issued'
  | 'notification_sent';

// ============================================================================
// Event Payload Types
// ============================================================================

/**
 * Payload for strategy_created event
 */
export interface StrategyCreatedPayload {
  userId: string;
  type: string;
  name: string;
  config: StrategyConfig;
}

/**
 * Payload for status change events
 */
export interface StatusChangePayload {
  previousStatus: StrategyStatus;
  newStatus: StrategyStatus;
  reason?: string;
  triggeredBy?: 'user' | 'system' | 'condition';
}

/**
 * Payload for strategy_updated event
 */
export interface StrategyUpdatedPayload {
  changes: {
    field: string;
    previousValue: unknown;
    newValue: unknown;
  }[];
}

/**
 * Payload for condition events
 */
export interface ConditionPayload {
  conditionId: string;
  conditionType: string;
  details?: Record<string, unknown>;
}

/**
 * Payload for condition_evaluated event
 */
export interface ConditionEvaluatedPayload {
  conditionId: string;
  result: ConditionEvaluationResult;
}

/**
 * Payload for condition_triggered event
 */
export interface ConditionTriggeredPayload {
  conditionId: string;
  observedValue: number | string;
  targetValue: number | string;
  executionScheduled: boolean;
}

/**
 * Payload for execution events
 */
export interface ExecutionPayload {
  executionId: string;
  execution?: StrategyExecution;
  error?: string;
}

/**
 * Payload for goal_progress_updated event
 */
export interface GoalProgressPayload {
  previousProgress: number;
  newProgress: number;
  currentAmount: number;
  targetAmount: number;
  projectedCompletion?: number;
}

/**
 * Payload for goal_milestone_reached event
 */
export interface GoalMilestonePayload {
  milestone: number; // Percentage (e.g., 25, 50, 75, 100)
  currentAmount: number;
  targetAmount: number;
}

/**
 * Payload for yield_harvested event
 */
export interface YieldHarvestedPayload {
  result: HarvestResult;
  totalYieldToDate: number;
}

/**
 * Payload for position events
 */
export interface PositionPayload {
  positionId: string;
  protocolId: string;
  productId: string;
  amount: number;
  token: string;
  apy?: number;
}

/**
 * Payload for rebalance_executed event
 */
export interface RebalancePayload {
  actions: RebalanceAction[];
  previousAllocations: Record<string, number>;
  newAllocations: Record<string, number>;
  transactionSignatures: string[];
}

/**
 * Payload for error events
 */
export interface ErrorPayload {
  errorCode: string;
  errorMessage: string;
  context?: Record<string, unknown>;
  recoverable: boolean;
}

/**
 * Payload for warning events
 */
export interface WarningPayload {
  warningCode: string;
  warningMessage: string;
  context?: Record<string, unknown>;
}

/**
 * Payload for notification events
 */
export interface NotificationPayload {
  notificationType: string;
  channel: 'push' | 'email' | 'sms' | 'in_app';
  content: {
    title: string;
    body: string;
  };
  delivered: boolean;
}

/**
 * Union type for all event payloads
 */
export type StrategyEventPayload =
  | StrategyCreatedPayload
  | StatusChangePayload
  | StrategyUpdatedPayload
  | ConditionPayload
  | ConditionEvaluatedPayload
  | ConditionTriggeredPayload
  | ExecutionPayload
  | GoalProgressPayload
  | GoalMilestonePayload
  | YieldHarvestedPayload
  | PositionPayload
  | RebalancePayload
  | ErrorPayload
  | WarningPayload
  | NotificationPayload
  | Record<string, unknown>;

// ============================================================================
// Main Event Interface
// ============================================================================

/**
 * Strategy event for audit trail and event sourcing
 */
export interface StrategyEvent {
  /** Unique event ID */
  eventId: string;
  /** Strategy this event belongs to */
  strategyId: string;
  /** User who owns the strategy */
  userId: string;
  /** Type of event */
  eventType: StrategyEventType;
  /** Event payload with type-specific data */
  payload: StrategyEventPayload;
  /** Event timestamp */
  timestamp: number;
  /** Event version (for schema evolution) */
  version: number;
  /** Correlation ID for related events */
  correlationId?: string;
  /** Actor who caused the event */
  actor: {
    type: 'user' | 'system' | 'agent';
    id: string;
    name?: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Event Store Types
// ============================================================================

/**
 * Query options for retrieving events
 */
export interface EventQueryOptions {
  /** Filter by strategy ID */
  strategyId?: string;
  /** Filter by user ID */
  userId?: string;
  /** Filter by event types */
  eventTypes?: StrategyEventType[];
  /** Events after this timestamp */
  after?: number;
  /** Events before this timestamp */
  before?: number;
  /** Filter by correlation ID */
  correlationId?: string;
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
  /** Sort order */
  order?: 'asc' | 'desc';
}

/**
 * Result of an event query
 */
export interface EventQueryResult {
  events: StrategyEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Event stream subscription
 */
export interface EventSubscription {
  /** Subscription ID */
  subscriptionId: string;
  /** Filter criteria */
  filter: EventQueryOptions;
  /** Callback for new events */
  onEvent: (event: StrategyEvent) => void;
  /** Whether subscription is active */
  active: boolean;
}

// ============================================================================
// Event Factory Functions
// ============================================================================

/**
 * Creates a new strategy event
 */
export function createEvent(
  strategyId: string,
  userId: string,
  eventType: StrategyEventType,
  payload: StrategyEventPayload,
  actor: StrategyEvent['actor'],
  correlationId?: string
): StrategyEvent {
  return {
    eventId: generateEventId(),
    strategyId,
    userId,
    eventType,
    payload,
    timestamp: Date.now(),
    version: 1,
    correlationId,
    actor,
  };
}

/**
 * Creates a strategy_created event
 */
export function createStrategyCreatedEvent(
  strategyId: string,
  userId: string,
  payload: StrategyCreatedPayload
): StrategyEvent {
  return createEvent(strategyId, userId, 'strategy_created', payload, {
    type: 'user',
    id: userId,
  });
}

/**
 * Creates a status change event
 */
export function createStatusChangeEvent(
  strategyId: string,
  userId: string,
  previousStatus: StrategyStatus,
  newStatus: StrategyStatus,
  triggeredBy: 'user' | 'system' | 'condition',
  reason?: string
): StrategyEvent {
  const eventType = statusToEventType(newStatus);
  return createEvent(
    strategyId,
    userId,
    eventType,
    { previousStatus, newStatus, reason, triggeredBy },
    { type: triggeredBy === 'user' ? 'user' : 'system', id: triggeredBy === 'user' ? userId : 'system' }
  );
}

/**
 * Creates an execution event
 */
export function createExecutionEvent(
  strategyId: string,
  userId: string,
  eventType: 'execution_started' | 'execution_completed' | 'execution_failed',
  execution: StrategyExecution,
  correlationId?: string
): StrategyEvent {
  return createEvent(
    strategyId,
    userId,
    eventType,
    {
      executionId: execution.executionId,
      execution,
      error: execution.error,
    },
    { type: 'system', id: 'strategy-engine' },
    correlationId
  );
}

/**
 * Creates a goal progress event
 */
export function createGoalProgressEvent(
  strategyId: string,
  userId: string,
  previousProgress: number,
  newProgress: number,
  currentAmount: number,
  targetAmount: number,
  projectedCompletion?: number
): StrategyEvent {
  return createEvent(
    strategyId,
    userId,
    'goal_progress_updated',
    { previousProgress, newProgress, currentAmount, targetAmount, projectedCompletion },
    { type: 'system', id: 'goal-tracker' }
  );
}

/**
 * Creates a milestone reached event
 */
export function createMilestoneEvent(
  strategyId: string,
  userId: string,
  milestone: number,
  currentAmount: number,
  targetAmount: number
): StrategyEvent {
  return createEvent(
    strategyId,
    userId,
    'goal_milestone_reached',
    { milestone, currentAmount, targetAmount },
    { type: 'system', id: 'goal-tracker' }
  );
}

/**
 * Creates an error event
 */
export function createErrorEvent(
  strategyId: string,
  userId: string,
  errorCode: string,
  errorMessage: string,
  recoverable: boolean,
  context?: Record<string, unknown>
): StrategyEvent {
  return createEvent(
    strategyId,
    userId,
    'error_occurred',
    { errorCode, errorMessage, recoverable, context },
    { type: 'system', id: 'strategy-engine' }
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Maps strategy status to corresponding event type
 */
function statusToEventType(status: StrategyStatus): StrategyEventType {
  const mapping: Record<StrategyStatus, StrategyEventType> = {
    draft: 'strategy_created',
    pending: 'strategy_created',
    active: 'strategy_activated',
    paused: 'strategy_paused',
    triggered: 'condition_triggered',
    completed: 'strategy_completed',
    cancelled: 'strategy_cancelled',
    failed: 'strategy_failed',
  };
  return mapping[status];
}

/**
 * Generates a unique event ID
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `evt_${timestamp}_${random}`;
}

/**
 * Groups events by correlation ID
 */
export function groupEventsByCorrelation(events: StrategyEvent[]): Map<string, StrategyEvent[]> {
  const groups = new Map<string, StrategyEvent[]>();

  for (const event of events) {
    const key = event.correlationId || event.eventId;
    const existing = groups.get(key) || [];
    existing.push(event);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Gets the latest event of a specific type for a strategy
 */
export function getLatestEventOfType(
  events: StrategyEvent[],
  eventType: StrategyEventType
): StrategyEvent | undefined {
  return events
    .filter(e => e.eventType === eventType)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

/**
 * Reconstructs strategy state from events (event sourcing)
 */
export function reconstructStrategyStatus(events: StrategyEvent[]): StrategyStatus {
  const statusEvents = events
    .filter(e =>
      ['strategy_created', 'strategy_activated', 'strategy_paused', 'strategy_cancelled', 'strategy_completed', 'strategy_failed'].includes(
        e.eventType
      )
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (statusEvents.length === 0) {
    return 'draft';
  }

  const lastEvent = statusEvents[statusEvents.length - 1];

  switch (lastEvent.eventType) {
    case 'strategy_created':
      return 'draft';
    case 'strategy_activated':
      return 'active';
    case 'strategy_paused':
      return 'paused';
    case 'strategy_cancelled':
      return 'cancelled';
    case 'strategy_completed':
      return 'completed';
    case 'strategy_failed':
      return 'failed';
    default:
      return 'draft';
  }
}
