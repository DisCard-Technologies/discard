/**
 * Strategy Engine gRPC Server
 *
 * Exposes strategy management operations via gRPC for integration
 * with Brain Orchestrator and other services.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { StrategyStore } from '../services/strategyStore.js';
import type {
  Strategy,
  StrategyType,
  StrategyStatus,
  CreateStrategyInput,
  UpdateStrategyInput,
  StrategyFilter,
  StrategySort,
} from '../types/strategy.js';
import type { TriggerCondition } from '../types/conditions.js';
import type { StrategyEvent, EventQueryOptions } from '../types/events.js';

// Get directory for proto file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Type Definitions for gRPC
// ============================================================================

interface GrpcStrategy {
  strategy_id: string;
  user_id: string;
  type: number;
  name: string;
  description: string;
  status: number;
  config_json: string;
  conditions: GrpcTriggerCondition[];
  created_at: string;
  updated_at: string;
  activated_at?: string;
  last_triggered_at?: string;
  last_executed_at?: string;
  completed_at?: string;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  total_amount_executed: number;
  total_fee_paid: number;
  goal_progress?: GrpcGoalProgress;
  metadata: Record<string, string>;
  tags: string[];
}

interface GrpcTriggerCondition {
  condition_id: string;
  strategy_id: string;
  type: number;
  config_json: string;
  enabled: boolean;
  is_met: boolean;
  last_checked_at?: string;
  last_observed_value?: string;
  trigger_count: number;
  last_triggered_at?: string;
  cooldown_seconds: number;
  in_cooldown: boolean;
  priority: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface GrpcGoalProgress {
  goal_id: string;
  target_amount: number;
  current_amount: number;
  progress_percentage: number;
  projected_completion_date?: string;
  on_track: boolean;
  days_remaining?: number;
  contributions: {
    dca: number;
    yield_earned: number;
    trading_pnl: number;
    price_appreciation: number;
    manual_deposits: number;
  };
  history: Array<{
    timestamp: string;
    amount: number;
    progress_percentage: number;
    note?: string;
  }>;
  last_updated_at: string;
}

interface GrpcStrategySummary {
  strategy_id: string;
  user_id: string;
  type: number;
  name: string;
  status: number;
  total_executions: number;
  last_executed_at?: string;
  created_at: string;
}

// ============================================================================
// Type Mappings
// ============================================================================

const STRATEGY_TYPE_MAP: Record<StrategyType, number> = {
  dca: 1,
  stop_loss: 2,
  take_profit: 3,
  goal: 4,
  custom: 5,
};

const STRATEGY_TYPE_REVERSE: Record<number, StrategyType> = {
  1: 'dca',
  2: 'stop_loss',
  3: 'take_profit',
  4: 'goal',
  5: 'custom',
};

const STRATEGY_STATUS_MAP: Record<StrategyStatus, number> = {
  draft: 1,
  pending: 2,
  active: 3,
  paused: 4,
  triggered: 5,
  completed: 6,
  cancelled: 7,
  failed: 8,
};

const CONDITION_TYPE_MAP: Record<string, number> = {
  price: 1,
  time: 2,
  balance: 3,
  percentage_change: 4,
  custom: 5,
};

// ============================================================================
// Server Configuration
// ============================================================================

export interface StrategyEngineServerConfig {
  port: number;
  host: string;
  enableTls: boolean;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
}

const DEFAULT_CONFIG: StrategyEngineServerConfig = {
  port: 50053,
  host: '0.0.0.0',
  enableTls: false,
};

// ============================================================================
// Server Metrics
// ============================================================================

interface ServerMetrics {
  totalStrategiesCreated: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  conditionsEvaluated: number;
  conditionsTriggered: number;
  totalExecutionTimeMs: number;
  executionCount: number;
}

// ============================================================================
// Strategy Engine gRPC Server
// ============================================================================

export class StrategyEngineServer {
  private server: grpc.Server;
  private config: StrategyEngineServerConfig;
  private store: StrategyStore;
  private startTime: number = Date.now();
  private metrics: ServerMetrics = {
    totalStrategiesCreated: 0,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    conditionsEvaluated: 0,
    conditionsTriggered: 0,
    totalExecutionTimeMs: 0,
    executionCount: 0,
  };

  constructor(store: StrategyStore, config: Partial<StrategyEngineServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
    this.server = new grpc.Server();
  }

  async start(): Promise<void> {
    // Load proto file
    const protoPath = join(__dirname, 'proto', 'strategy_engine.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: Number,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    const strategyService = (protoDescriptor.discard as any).strategy.StrategyEngineService;

    // Add service implementation
    this.server.addService(strategyService.service, {
      createStrategy: this.handleCreateStrategy.bind(this),
      getStrategy: this.handleGetStrategy.bind(this),
      updateStrategy: this.handleUpdateStrategy.bind(this),
      deleteStrategy: this.handleDeleteStrategy.bind(this),
      activateStrategy: this.handleActivateStrategy.bind(this),
      pauseStrategy: this.handlePauseStrategy.bind(this),
      resumeStrategy: this.handleResumeStrategy.bind(this),
      cancelStrategy: this.handleCancelStrategy.bind(this),
      listStrategies: this.handleListStrategies.bind(this),
      listActiveStrategies: this.handleListActiveStrategies.bind(this),
      getStrategyStatus: this.handleGetStrategyStatus.bind(this),
      getGoalProgress: this.handleGetGoalProgress.bind(this),
      getStrategyEvents: this.handleGetStrategyEvents.bind(this),
      streamStrategyEvents: this.handleStreamStrategyEvents.bind(this),
      healthCheck: this.handleHealthCheck.bind(this),
      getAttestation: this.handleGetAttestation.bind(this),
    });

    // Create credentials
    const credentials = this.config.enableTls
      ? grpc.ServerCredentials.createSsl(
          this.config.tlsCa ? Buffer.from(this.config.tlsCa) : null,
          this.config.tlsKey && this.config.tlsCert
            ? [{ private_key: Buffer.from(this.config.tlsKey), cert_chain: Buffer.from(this.config.tlsCert) }]
            : [],
          false
        )
      : grpc.ServerCredentials.createInsecure();

    // Bind and start
    return new Promise((resolve, reject) => {
      const address = `${this.config.host}:${this.config.port}`;
      this.server.bindAsync(address, credentials, (error, port) => {
        if (error) {
          console.error('[StrategyEngineServer] Failed to bind:', error);
          reject(error);
          return;
        }
        console.log(`[StrategyEngineServer] Listening on ${address}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        console.log('[StrategyEngineServer] Stopped');
        resolve();
      });
    });
  }

  // ==========================================================================
  // Handler Implementations
  // ==========================================================================

  private async handleCreateStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const request = call.request;

      const input: CreateStrategyInput = {
        userId: request.user_id,
        type: STRATEGY_TYPE_REVERSE[request.type] || 'custom',
        name: request.name,
        description: request.description,
        config: JSON.parse(request.config_json || '{}'),
        conditions: request.conditions?.map(this.grpcConditionToCondition) || [],
        metadata: request.metadata,
        tags: request.tags,
        activateImmediately: request.activate_immediately,
      };

      const strategy = await this.store.create(input);
      this.metrics.totalStrategiesCreated++;

      callback(null, {
        success: true,
        strategy: this.strategyToGrpc(strategy),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleGetStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategy = await this.store.get(call.request.strategy_id);

      if (!strategy) {
        callback(null, {
          success: false,
          error: 'Strategy not found',
        });
        return;
      }

      callback(null, {
        success: true,
        strategy: this.strategyToGrpc(strategy),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleUpdateStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const request = call.request;

      const updates: UpdateStrategyInput = {};
      if (request.name) updates.name = request.name;
      if (request.description) updates.description = request.description;
      if (request.config_json) updates.config = JSON.parse(request.config_json);
      if (request.conditions) updates.conditions = request.conditions.map(this.grpcConditionToCondition);
      if (request.metadata) updates.metadata = request.metadata;
      if (request.tags) updates.tags = request.tags;

      const strategy = await this.store.update(request.strategy_id, updates);

      callback(null, {
        success: true,
        strategy: this.strategyToGrpc(strategy),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleDeleteStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      await this.store.delete(call.request.strategy_id);
      callback(null, { success: true });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleActivateStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategy = await this.store.activate(call.request.strategy_id);
      callback(null, {
        success: true,
        strategy: this.strategyToGrpc(strategy),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handlePauseStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategy = await this.store.pause(call.request.strategy_id);
      callback(null, {
        success: true,
        strategy: this.strategyToGrpc(strategy),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleResumeStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategy = await this.store.resume(call.request.strategy_id);
      callback(null, {
        success: true,
        strategy: this.strategyToGrpc(strategy),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleCancelStrategy(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategy = await this.store.cancel(call.request.strategy_id, call.request.reason);
      callback(null, {
        success: true,
        strategy: this.strategyToGrpc(strategy),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleListStrategies(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const request = call.request;

      const filter: StrategyFilter = {};
      if (request.types?.length) {
        filter.type = request.types.map((t: number) => STRATEGY_TYPE_REVERSE[t]);
      }
      if (request.statuses?.length) {
        filter.status = request.statuses.map((s: number) => this.statusFromNumber(s));
      }
      if (request.tags?.length) {
        filter.tags = request.tags;
      }
      if (request.created_after) {
        filter.createdAfter = parseInt(request.created_after);
      }
      if (request.created_before) {
        filter.createdBefore = parseInt(request.created_before);
      }

      const sort: StrategySort | undefined = request.sort_field
        ? {
            field: request.sort_field as 'createdAt' | 'updatedAt' | 'name' | 'totalExecutions',
            direction: (request.sort_direction || 'desc') as 'asc' | 'desc',
          }
        : undefined;

      const result = await this.store.listByUser(
        request.user_id,
        { offset: request.offset || 0, limit: request.limit || 50 },
        filter,
        sort
      );

      callback(null, {
        success: true,
        strategies: result.strategies.map(this.strategyToSummaryGrpc),
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        has_more: result.hasMore,
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleListActiveStrategies(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategies = await this.store.listActive();
      callback(null, {
        success: true,
        strategies: strategies.map(this.strategyToGrpc.bind(this)),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleGetStrategyStatus(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategy = await this.store.get(call.request.strategy_id);

      if (!strategy) {
        callback(null, {
          success: false,
          error: 'Strategy not found',
        });
        return;
      }

      const pendingConditions = strategy.conditions.filter((c) => !c.isMet).length;
      const metConditions = strategy.conditions.filter((c) => c.isMet).length;

      callback(null, {
        success: true,
        summary: this.strategyToSummaryGrpc(strategy),
        status: STRATEGY_STATUS_MAP[strategy.status],
        pending_conditions: pendingConditions,
        met_conditions: metConditions,
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleGetGoalProgress(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const strategy = await this.store.get(call.request.strategy_id);

      if (!strategy) {
        callback(null, {
          success: false,
          error: 'Strategy not found',
        });
        return;
      }

      if (!strategy.goalProgress) {
        callback(null, {
          success: false,
          error: 'Strategy is not a goal type',
        });
        return;
      }

      callback(null, {
        success: true,
        progress: this.goalProgressToGrpc(strategy.goalProgress),
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleGetStrategyEvents(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const request = call.request;

      const options: EventQueryOptions = {
        strategyId: request.strategy_id,
        eventTypes: request.event_types,
        after: request.after ? parseInt(request.after) : undefined,
        before: request.before ? parseInt(request.before) : undefined,
        offset: request.offset,
        limit: request.limit,
        order: request.order as 'asc' | 'desc',
      };

      const result = await this.store.getEvents(request.strategy_id, options);

      callback(null, {
        success: true,
        events: result.events.map(this.eventToGrpc),
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        has_more: result.hasMore,
      });
    } catch (error) {
      callback(null, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private handleStreamStrategyEvents(call: grpc.ServerWritableStream<any, any>): void {
    // Note: Full streaming implementation would require event subscription system
    // For now, just end the stream
    call.end();
  }

  private handleHealthCheck(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): void {
    const avgExecutionTime =
      this.metrics.executionCount > 0
        ? this.metrics.totalExecutionTimeMs / this.metrics.executionCount
        : 0;

    callback(null, {
      healthy: true,
      version: '1.0.0',
      uptime_ms: String(Date.now() - this.startTime),
      active_strategies: 0, // Would need to query store
      pending_conditions: 0,
      metrics: {
        total_strategies_created: String(this.metrics.totalStrategiesCreated),
        total_executions: String(this.metrics.totalExecutions),
        successful_executions: String(this.metrics.successfulExecutions),
        failed_executions: String(this.metrics.failedExecutions),
        conditions_evaluated: String(this.metrics.conditionsEvaluated),
        conditions_triggered: String(this.metrics.conditionsTriggered),
        average_execution_time_ms: avgExecutionTime,
      },
    });
  }

  private handleGetAttestation(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): void {
    // TEE attestation would be generated here in production
    callback(null, {
      attestation_quote: 'mock-attestation-quote',
      mrenclave: 'mock-mrenclave',
      mrsigner: 'mock-mrsigner',
      timestamp: String(Date.now()),
    });
  }

  // ==========================================================================
  // Conversion Helpers
  // ==========================================================================

  private strategyToGrpc(strategy: Strategy): GrpcStrategy {
    return {
      strategy_id: strategy.strategyId,
      user_id: strategy.userId,
      type: STRATEGY_TYPE_MAP[strategy.type] || 5,
      name: strategy.name,
      description: strategy.description || '',
      status: STRATEGY_STATUS_MAP[strategy.status],
      config_json: JSON.stringify(strategy.config),
      conditions: strategy.conditions.map(this.conditionToGrpc),
      created_at: String(strategy.createdAt),
      updated_at: String(strategy.updatedAt),
      activated_at: strategy.activatedAt ? String(strategy.activatedAt) : undefined,
      last_triggered_at: strategy.lastTriggeredAt ? String(strategy.lastTriggeredAt) : undefined,
      last_executed_at: strategy.lastExecutedAt ? String(strategy.lastExecutedAt) : undefined,
      completed_at: strategy.completedAt ? String(strategy.completedAt) : undefined,
      total_executions: strategy.totalExecutions,
      successful_executions: strategy.successfulExecutions,
      failed_executions: strategy.failedExecutions,
      total_amount_executed: strategy.totalAmountExecuted,
      total_fee_paid: strategy.totalFeePaid,
      goal_progress: strategy.goalProgress ? this.goalProgressToGrpc(strategy.goalProgress) : undefined,
      metadata: (strategy.metadata as Record<string, string>) || {},
      tags: strategy.tags || [],
    };
  }

  private strategyToSummaryGrpc(strategy: Strategy): GrpcStrategySummary {
    return {
      strategy_id: strategy.strategyId,
      user_id: strategy.userId,
      type: STRATEGY_TYPE_MAP[strategy.type] || 5,
      name: strategy.name,
      status: STRATEGY_STATUS_MAP[strategy.status],
      total_executions: strategy.totalExecutions,
      last_executed_at: strategy.lastExecutedAt ? String(strategy.lastExecutedAt) : undefined,
      created_at: String(strategy.createdAt),
    };
  }

  private conditionToGrpc(condition: TriggerCondition): GrpcTriggerCondition {
    return {
      condition_id: condition.conditionId,
      strategy_id: condition.strategyId,
      type: CONDITION_TYPE_MAP[condition.type] || 5,
      config_json: JSON.stringify(condition.config),
      enabled: condition.enabled,
      is_met: condition.isMet,
      last_checked_at: condition.lastCheckedAt ? String(condition.lastCheckedAt) : undefined,
      last_observed_value: condition.lastObservedValue?.toString(),
      trigger_count: condition.triggerCount,
      last_triggered_at: condition.lastTriggeredAt ? String(condition.lastTriggeredAt) : undefined,
      cooldown_seconds: condition.cooldownSeconds || 0,
      in_cooldown: condition.inCooldown,
      priority: condition.priority,
      description: condition.description,
      created_at: String(condition.createdAt),
      updated_at: String(condition.updatedAt),
    };
  }

  private grpcConditionToCondition(grpc: any): TriggerCondition {
    const conditionTypeReverse: Record<number, string> = {
      1: 'price',
      2: 'time',
      3: 'balance',
      4: 'percentage_change',
      5: 'custom',
    };

    return {
      conditionId: grpc.condition_id,
      strategyId: grpc.strategy_id,
      type: (conditionTypeReverse[grpc.type] || 'custom') as any,
      config: JSON.parse(grpc.config_json || '{}'),
      enabled: grpc.enabled ?? true,
      isMet: grpc.is_met ?? false,
      lastCheckedAt: grpc.last_checked_at ? parseInt(grpc.last_checked_at) : undefined,
      lastObservedValue: grpc.last_observed_value,
      triggerCount: grpc.trigger_count || 0,
      lastTriggeredAt: grpc.last_triggered_at ? parseInt(grpc.last_triggered_at) : undefined,
      cooldownSeconds: grpc.cooldown_seconds,
      inCooldown: grpc.in_cooldown ?? false,
      priority: grpc.priority || 0,
      description: grpc.description,
      createdAt: parseInt(grpc.created_at) || Date.now(),
      updatedAt: parseInt(grpc.updated_at) || Date.now(),
    };
  }

  private goalProgressToGrpc(progress: any): GrpcGoalProgress {
    return {
      goal_id: progress.goalId,
      target_amount: progress.targetAmount,
      current_amount: progress.currentAmount,
      progress_percentage: progress.progressPercentage,
      projected_completion_date: progress.projectedCompletionDate
        ? String(progress.projectedCompletionDate)
        : undefined,
      on_track: progress.onTrack,
      days_remaining: progress.daysRemaining,
      contributions: progress.contributions,
      history: progress.history.map((h: any) => ({
        timestamp: String(h.timestamp),
        amount: h.amount,
        progress_percentage: h.progressPercentage,
        note: h.note,
      })),
      last_updated_at: String(progress.lastUpdatedAt),
    };
  }

  private eventToGrpc(event: StrategyEvent): any {
    return {
      event_id: event.eventId,
      strategy_id: event.strategyId,
      user_id: event.userId,
      event_type: event.eventType,
      payload_json: JSON.stringify(event.payload),
      timestamp: String(event.timestamp),
      version: event.version,
      correlation_id: event.correlationId,
      actor: event.actor,
    };
  }

  private statusFromNumber(num: number): StrategyStatus {
    const statusReverse: Record<number, StrategyStatus> = {
      1: 'draft',
      2: 'pending',
      3: 'active',
      4: 'paused',
      5: 'triggered',
      6: 'completed',
      7: 'cancelled',
      8: 'failed',
    };
    return statusReverse[num] || 'draft';
  }

  // Metrics update methods
  recordExecution(success: boolean, timeMs: number): void {
    this.metrics.totalExecutions++;
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }
    this.metrics.totalExecutionTimeMs += timeMs;
    this.metrics.executionCount++;
  }

  recordConditionEvaluation(triggered: boolean): void {
    this.metrics.conditionsEvaluated++;
    if (triggered) {
      this.metrics.conditionsTriggered++;
    }
  }
}
