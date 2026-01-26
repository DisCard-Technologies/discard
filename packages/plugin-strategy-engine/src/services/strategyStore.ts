/**
 * Strategy Store - Persistent Strategy Storage
 *
 * Provides CRUD operations for strategies with Redis backend,
 * event sourcing for audit trail, and state machine enforcement.
 */

import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import type {
  Strategy,
  StrategyStatus,
  StrategySummary,
  CreateStrategyInput,
  UpdateStrategyInput,
  StrategyFilter,
  StrategySort,
  StrategyPagination,
  StrategyQueryResult,
  StrategyExecution,
} from '../types/strategy.js';
import {
  STRATEGY_STATE_TRANSITIONS,
  isValidStateTransition,
} from '../types/strategy.js';
import type { StrategyEvent, EventQueryOptions, EventQueryResult } from '../types/events.js';
import {
  createStrategyCreatedEvent,
  createStatusChangeEvent,
  createExecutionEvent,
  createErrorEvent,
} from '../types/events.js';
import type { GoalProgress } from '../types/goal.js';

// ============================================================================
// Configuration
// ============================================================================

export interface StrategyStoreConfig {
  /** Redis connection URL */
  redisUrl: string;
  /** Key prefix for strategy data */
  keyPrefix: string;
  /** Whether to encrypt strategy data */
  encryptionEnabled: boolean;
  /** Encryption key (if enabled) */
  encryptionKey?: string;
  /** Event retention period in days */
  eventRetentionDays: number;
  /** Maximum events per strategy */
  maxEventsPerStrategy: number;
}

const DEFAULT_CONFIG: StrategyStoreConfig = {
  redisUrl: 'redis://localhost:6379',
  keyPrefix: 'discard:strategy',
  encryptionEnabled: false,
  eventRetentionDays: 90,
  maxEventsPerStrategy: 1000,
};

// ============================================================================
// Redis Keys
// ============================================================================

const KEYS = {
  strategy: (prefix: string, id: string) => `${prefix}:strategy:${id}`,
  userStrategies: (prefix: string, userId: string) => `${prefix}:user:${userId}:strategies`,
  activeStrategies: (prefix: string) => `${prefix}:active`,
  strategyEvents: (prefix: string, strategyId: string) => `${prefix}:events:${strategyId}`,
  allEvents: (prefix: string) => `${prefix}:events:all`,
  byType: (prefix: string, type: string) => `${prefix}:type:${type}`,
  byStatus: (prefix: string, status: string) => `${prefix}:status:${status}`,
};

// ============================================================================
// Strategy Store Class
// ============================================================================

export class StrategyStore {
  private redis: Redis;
  private config: StrategyStoreConfig;
  private initialized: boolean = false;

  constructor(config: Partial<StrategyStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.redis.ping();
      this.initialized = true;
      console.log('[StrategyStore] Connected to Redis');
    } catch (error) {
      console.error('[StrategyStore] Failed to connect to Redis:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    await this.redis.quit();
    this.initialized = false;
    console.log('[StrategyStore] Disconnected from Redis');
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Creates a new strategy
   */
  async create(input: CreateStrategyInput): Promise<Strategy> {
    const strategyId = `strat_${uuidv4()}`;
    const now = Date.now();

    const strategy: Strategy = {
      strategyId,
      userId: input.userId,
      type: input.type,
      name: input.name,
      description: input.description,
      status: 'draft',
      config: input.config,
      conditions: input.conditions || [],
      executions: [],
      events: [],
      createdAt: now,
      updatedAt: now,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalAmountExecuted: 0,
      totalFeePaid: 0,
      metadata: input.metadata,
      tags: input.tags,
    };

    // Initialize goal progress if this is a goal strategy
    if (input.type === 'goal' && 'goalType' in input.config) {
      strategy.goalProgress = {
        goalId: strategyId,
        targetAmount: input.config.targetAmount,
        currentAmount: 0,
        progressPercentage: 0,
        projectedCompletionDate: null,
        onTrack: true,
        daysRemaining: input.config.deadline
          ? Math.ceil((input.config.deadline - now) / (1000 * 60 * 60 * 24))
          : null,
        contributions: {
          dca: 0,
          yieldEarned: 0,
          tradingPnL: 0,
          priceAppreciation: 0,
          manualDeposits: 0,
        },
        history: [],
        lastUpdatedAt: now,
      };
    }

    // Store strategy
    await this.saveStrategy(strategy);

    // Record creation event
    const event = createStrategyCreatedEvent(strategyId, input.userId, {
      userId: input.userId,
      type: input.type,
      name: input.name,
      config: input.config,
    });
    await this.appendEvent(strategyId, event);

    // Add to indexes
    await this.addToIndexes(strategy);

    // Activate immediately if requested
    if (input.activateImmediately) {
      return this.activate(strategyId);
    }

    return strategy;
  }

  /**
   * Gets a strategy by ID
   */
  async get(strategyId: string): Promise<Strategy | null> {
    const key = KEYS.strategy(this.config.keyPrefix, strategyId);
    const data = await this.redis.get(key);

    if (!data) return null;

    return JSON.parse(data) as Strategy;
  }

  /**
   * Updates a strategy's configuration
   */
  async update(strategyId: string, updates: UpdateStrategyInput): Promise<Strategy> {
    const strategy = await this.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    // Only allow updates in certain states
    if (!['draft', 'paused'].includes(strategy.status)) {
      throw new Error(`Cannot update strategy in ${strategy.status} state`);
    }

    const updatedStrategy: Strategy = {
      ...strategy,
      ...updates,
      config: updates.config ? { ...strategy.config, ...updates.config } : strategy.config,
      updatedAt: Date.now(),
    };

    await this.saveStrategy(updatedStrategy);

    return updatedStrategy;
  }

  /**
   * Lists strategies by user
   */
  async listByUser(
    userId: string,
    pagination?: StrategyPagination,
    filter?: Omit<StrategyFilter, 'userId'>,
    sort?: StrategySort
  ): Promise<StrategyQueryResult> {
    const key = KEYS.userStrategies(this.config.keyPrefix, userId);
    const strategyIds = await this.redis.smembers(key);

    let strategies: Strategy[] = [];
    for (const id of strategyIds) {
      const strategy = await this.get(id);
      if (strategy) {
        strategies.push(strategy);
      }
    }

    // Apply filters
    if (filter) {
      strategies = this.applyFilters(strategies, { ...filter, userId });
    }

    // Apply sort
    if (sort) {
      strategies = this.applySorting(strategies, sort);
    }

    const total = strategies.length;
    const offset = pagination?.offset || 0;
    const limit = pagination?.limit || 50;

    const paginatedStrategies = strategies.slice(offset, offset + limit);

    return {
      strategies: paginatedStrategies,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Lists all active strategies (for condition engine)
   */
  async listActive(): Promise<Strategy[]> {
    const key = KEYS.activeStrategies(this.config.keyPrefix);
    const strategyIds = await this.redis.smembers(key);

    const strategies: Strategy[] = [];
    for (const id of strategyIds) {
      const strategy = await this.get(id);
      if (strategy && strategy.status === 'active') {
        strategies.push(strategy);
      }
    }

    return strategies;
  }

  /**
   * Deletes a strategy (soft delete - marks as cancelled)
   */
  async delete(strategyId: string): Promise<void> {
    const strategy = await this.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    // Cancel the strategy instead of hard deleting
    await this.cancel(strategyId, 'deleted');

    // Note: We keep the data for audit purposes
    // In production, you might want a cleanup job for old cancelled strategies
  }

  // ==========================================================================
  // State Transitions
  // ==========================================================================

  /**
   * Activates a strategy
   */
  async activate(strategyId: string): Promise<Strategy> {
    return this.transitionState(strategyId, 'active', 'user');
  }

  /**
   * Pauses a strategy
   */
  async pause(strategyId: string): Promise<Strategy> {
    return this.transitionState(strategyId, 'paused', 'user');
  }

  /**
   * Resumes a paused strategy
   */
  async resume(strategyId: string): Promise<Strategy> {
    return this.transitionState(strategyId, 'active', 'user');
  }

  /**
   * Cancels a strategy
   */
  async cancel(strategyId: string, reason?: string): Promise<Strategy> {
    return this.transitionState(strategyId, 'cancelled', 'user', reason);
  }

  /**
   * Marks a strategy as triggered (condition met)
   */
  async markTriggered(strategyId: string): Promise<Strategy> {
    return this.transitionState(strategyId, 'triggered', 'condition');
  }

  /**
   * Marks a strategy as completed
   */
  async markCompleted(strategyId: string): Promise<Strategy> {
    return this.transitionState(strategyId, 'completed', 'system');
  }

  /**
   * Complete a strategy (alias for markCompleted with optional reason)
   */
  async complete(strategyId: string, reason?: string): Promise<Strategy> {
    return this.transitionState(strategyId, 'completed', 'system', reason);
  }

  /**
   * Marks a strategy as failed
   */
  async markFailed(strategyId: string, error: string): Promise<Strategy> {
    const strategy = await this.transitionState(strategyId, 'failed', 'system', error);

    // Record error event
    const errorEvent = createErrorEvent(
      strategyId,
      strategy.userId,
      'STRATEGY_FAILED',
      error,
      true // recoverable
    );
    await this.appendEvent(strategyId, errorEvent);

    return strategy;
  }

  /**
   * Internal state transition handler
   */
  private async transitionState(
    strategyId: string,
    newStatus: StrategyStatus,
    triggeredBy: 'user' | 'system' | 'condition',
    reason?: string
  ): Promise<Strategy> {
    const strategy = await this.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    const previousStatus = strategy.status;

    // Validate transition
    if (!isValidStateTransition(previousStatus, newStatus)) {
      throw new Error(
        `Invalid state transition: ${previousStatus} -> ${newStatus}. ` +
          `Allowed transitions: ${STRATEGY_STATE_TRANSITIONS[previousStatus].join(', ')}`
      );
    }

    const now = Date.now();
    const updatedStrategy: Strategy = {
      ...strategy,
      status: newStatus,
      updatedAt: now,
    };

    // Set status-specific timestamps
    switch (newStatus) {
      case 'active':
        if (!updatedStrategy.activatedAt) {
          updatedStrategy.activatedAt = now;
        }
        break;
      case 'paused':
        updatedStrategy.pausedAt = now;
        break;
      case 'triggered':
        updatedStrategy.lastTriggeredAt = now;
        break;
      case 'completed':
        updatedStrategy.completedAt = now;
        break;
      case 'cancelled':
        updatedStrategy.cancelledAt = now;
        break;
    }

    // Save updated strategy
    await this.saveStrategy(updatedStrategy);

    // Update indexes
    await this.updateIndexes(strategy, updatedStrategy);

    // Record status change event
    const event = createStatusChangeEvent(
      strategyId,
      strategy.userId,
      previousStatus,
      newStatus,
      triggeredBy,
      reason
    );
    await this.appendEvent(strategyId, event);

    return updatedStrategy;
  }

  // ==========================================================================
  // Execution Recording
  // ==========================================================================

  /**
   * Records a strategy execution
   */
  async recordExecution(strategyId: string, execution: StrategyExecution): Promise<Strategy> {
    const strategy = await this.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    const now = Date.now();

    // Update strategy with execution
    const updatedStrategy: Strategy = {
      ...strategy,
      executions: [...strategy.executions, execution],
      totalExecutions: strategy.totalExecutions + 1,
      successfulExecutions: execution.success
        ? strategy.successfulExecutions + 1
        : strategy.successfulExecutions,
      failedExecutions: execution.success
        ? strategy.failedExecutions
        : strategy.failedExecutions + 1,
      totalAmountExecuted: strategy.totalAmountExecuted + (execution.amountExecuted || 0),
      totalFeePaid: strategy.totalFeePaid + (execution.feesPaid || 0),
      lastExecutedAt: now,
      updatedAt: now,
    };

    // If strategy was in triggered state, return to active
    if (updatedStrategy.status === 'triggered') {
      updatedStrategy.status = 'active';
    }

    await this.saveStrategy(updatedStrategy);

    // Record execution event
    const eventType = execution.success ? 'execution_completed' : 'execution_failed';
    const event = createExecutionEvent(strategyId, strategy.userId, eventType, execution);
    await this.appendEvent(strategyId, event);

    return updatedStrategy;
  }

  // ==========================================================================
  // Goal Progress
  // ==========================================================================

  /**
   * Updates goal progress for a strategy
   */
  async updateGoalProgress(strategyId: string, progress: Partial<GoalProgress>): Promise<Strategy> {
    const strategy = await this.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    if (strategy.type !== 'goal' || !strategy.goalProgress) {
      throw new Error(`Strategy ${strategyId} is not a goal strategy`);
    }

    const previousProgress = strategy.goalProgress.progressPercentage;

    const updatedProgress: GoalProgress = {
      ...strategy.goalProgress,
      ...progress,
      lastUpdatedAt: Date.now(),
    };

    // Calculate progress percentage
    updatedProgress.progressPercentage =
      (updatedProgress.currentAmount / updatedProgress.targetAmount) * 100;

    // Check if goal is completed
    const isCompleted = updatedProgress.progressPercentage >= 100;

    const updatedStrategy: Strategy = {
      ...strategy,
      goalProgress: updatedProgress,
      updatedAt: Date.now(),
    };

    await this.saveStrategy(updatedStrategy);

    // Check for milestone achievements
    const milestones = [25, 50, 75, 100];
    for (const milestone of milestones) {
      if (previousProgress < milestone && updatedProgress.progressPercentage >= milestone) {
        // Milestone reached - you would trigger notifications here
        console.log(`[StrategyStore] Strategy ${strategyId} reached ${milestone}% milestone`);
      }
    }

    // Auto-complete goal if 100% reached
    if (isCompleted && strategy.status === 'active') {
      return this.markCompleted(strategyId);
    }

    return updatedStrategy;
  }

  // ==========================================================================
  // Event Log
  // ==========================================================================

  /**
   * Gets events for a strategy
   */
  async getEvents(strategyId: string, options?: EventQueryOptions): Promise<EventQueryResult> {
    const key = KEYS.strategyEvents(this.config.keyPrefix, strategyId);

    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const order = options?.order || 'desc';

    // Get events from Redis sorted set
    const eventIds =
      order === 'desc'
        ? await this.redis.zrevrange(key, offset, offset + limit - 1)
        : await this.redis.zrange(key, offset, offset + limit - 1);

    const events: StrategyEvent[] = [];
    for (const eventId of eventIds) {
      const eventKey = `${this.config.keyPrefix}:event:${eventId}`;
      const eventData = await this.redis.get(eventKey);
      if (eventData) {
        const event = JSON.parse(eventData) as StrategyEvent;

        // Apply filters
        if (options?.eventTypes && !options.eventTypes.includes(event.eventType)) {
          continue;
        }
        if (options?.after && event.timestamp <= options.after) {
          continue;
        }
        if (options?.before && event.timestamp >= options.before) {
          continue;
        }

        events.push(event);
      }
    }

    const total = await this.redis.zcard(key);

    return {
      events,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Appends an event to a strategy's event log
   */
  async appendEvent(strategyId: string, event: StrategyEvent): Promise<void> {
    const eventKey = `${this.config.keyPrefix}:event:${event.eventId}`;
    const strategyEventsKey = KEYS.strategyEvents(this.config.keyPrefix, strategyId);
    const allEventsKey = KEYS.allEvents(this.config.keyPrefix);

    // Store event
    await this.redis.set(eventKey, JSON.stringify(event));

    // Add to strategy's event sorted set (score = timestamp)
    await this.redis.zadd(strategyEventsKey, event.timestamp, event.eventId);

    // Add to global events sorted set
    await this.redis.zadd(allEventsKey, event.timestamp, event.eventId);

    // Trim old events if exceeding max
    const count = await this.redis.zcard(strategyEventsKey);
    if (count > this.config.maxEventsPerStrategy) {
      const toRemove = count - this.config.maxEventsPerStrategy;
      const oldEvents = await this.redis.zrange(strategyEventsKey, 0, toRemove - 1);

      for (const eventId of oldEvents) {
        await this.redis.del(`${this.config.keyPrefix}:event:${eventId}`);
      }
      await this.redis.zremrangebyrank(strategyEventsKey, 0, toRemove - 1);
    }
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private async saveStrategy(strategy: Strategy): Promise<void> {
    const key = KEYS.strategy(this.config.keyPrefix, strategy.strategyId);
    await this.redis.set(key, JSON.stringify(strategy));
  }

  private async addToIndexes(strategy: Strategy): Promise<void> {
    const { keyPrefix } = this.config;

    // Add to user's strategies set
    await this.redis.sadd(KEYS.userStrategies(keyPrefix, strategy.userId), strategy.strategyId);

    // Add to type index
    await this.redis.sadd(KEYS.byType(keyPrefix, strategy.type), strategy.strategyId);

    // Add to status index
    await this.redis.sadd(KEYS.byStatus(keyPrefix, strategy.status), strategy.strategyId);

    // Add to active set if active
    if (strategy.status === 'active') {
      await this.redis.sadd(KEYS.activeStrategies(keyPrefix), strategy.strategyId);
    }
  }

  private async updateIndexes(oldStrategy: Strategy, newStrategy: Strategy): Promise<void> {
    const { keyPrefix } = this.config;

    // Update status index if changed
    if (oldStrategy.status !== newStrategy.status) {
      await this.redis.srem(KEYS.byStatus(keyPrefix, oldStrategy.status), newStrategy.strategyId);
      await this.redis.sadd(KEYS.byStatus(keyPrefix, newStrategy.status), newStrategy.strategyId);

      // Update active set
      if (oldStrategy.status === 'active') {
        await this.redis.srem(KEYS.activeStrategies(keyPrefix), newStrategy.strategyId);
      }
      if (newStrategy.status === 'active') {
        await this.redis.sadd(KEYS.activeStrategies(keyPrefix), newStrategy.strategyId);
      }
    }
  }

  private applyFilters(strategies: Strategy[], filter: StrategyFilter): Strategy[] {
    return strategies.filter((s) => {
      if (filter.userId && s.userId !== filter.userId) return false;

      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(s.type)) return false;
      }

      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(s.status)) return false;
      }

      if (filter.tags && filter.tags.length > 0) {
        if (!s.tags || !filter.tags.some((t) => s.tags?.includes(t))) return false;
      }

      if (filter.createdAfter && s.createdAt < filter.createdAfter) return false;
      if (filter.createdBefore && s.createdAt > filter.createdBefore) return false;

      return true;
    });
  }

  private applySorting(strategies: Strategy[], sort: StrategySort): Strategy[] {
    return [...strategies].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sort.field) {
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'updatedAt':
          aVal = a.updatedAt;
          bVal = b.updatedAt;
          break;
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'totalExecutions':
          aVal = a.totalExecutions;
          bVal = b.totalExecutions;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Gets strategy summary (lightweight view)
   */
  async getSummary(strategyId: string): Promise<StrategySummary | null> {
    const strategy = await this.get(strategyId);
    if (!strategy) return null;

    return {
      strategyId: strategy.strategyId,
      userId: strategy.userId,
      type: strategy.type,
      name: strategy.name,
      status: strategy.status,
      totalExecutions: strategy.totalExecutions,
      lastExecutedAt: strategy.lastExecutedAt,
      createdAt: strategy.createdAt,
    };
  }

  /**
   * Checks if a strategy exists
   */
  async exists(strategyId: string): Promise<boolean> {
    const key = KEYS.strategy(this.config.keyPrefix, strategyId);
    return (await this.redis.exists(key)) === 1;
  }

  /**
   * Gets count of strategies by status
   */
  async countByStatus(userId?: string): Promise<Record<StrategyStatus, number>> {
    const counts: Record<StrategyStatus, number> = {
      draft: 0,
      pending: 0,
      active: 0,
      paused: 0,
      triggered: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
    };

    if (userId) {
      const { strategies } = await this.listByUser(userId);
      for (const strategy of strategies) {
        counts[strategy.status]++;
      }
    } else {
      for (const status of Object.keys(counts) as StrategyStatus[]) {
        const key = KEYS.byStatus(this.config.keyPrefix, status);
        counts[status] = await this.redis.scard(key);
      }
    }

    return counts;
  }

  /**
   * Gets the Redis client for advanced operations
   */
  getRedisClient(): Redis {
    return this.redis;
  }
}

// ============================================================================
// Export singleton factory
// ============================================================================

let storeInstance: StrategyStore | null = null;

export function getStrategyStore(config?: Partial<StrategyStoreConfig>): StrategyStore {
  if (!storeInstance) {
    storeInstance = new StrategyStore(config);
  }
  return storeInstance;
}

export function resetStrategyStore(): void {
  if (storeInstance) {
    storeInstance.shutdown();
    storeInstance = null;
  }
}
