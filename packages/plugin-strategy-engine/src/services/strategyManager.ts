/**
 * Strategy Manager
 *
 * Handles strategy management operations: list, pause, resume, cancel, and status.
 * Provides user-friendly summaries and controls for active strategies.
 */

import type { Strategy, StrategyStatus } from '../types/strategy.js';
import type { GoalConfig, GoalProgress } from '../types/goal.js';
import type { StrategyStore } from './strategyStore.js';
import type { ConditionEngine } from './conditionEngine.js';
import type { ExecutionQueue } from './executionQueue.js';

// ============================================================================
// Types
// ============================================================================

export interface StrategyDisplaySummary {
  strategyId: string;
  name: string;
  type: string;
  status: StrategyStatus;
  createdAt: number;
  lastExecutedAt?: number;
  nextExecutionAt?: number;
  totalExecutions: number;
  totalAmountExecuted: number;
  successRate: number;
  details: Record<string, unknown>;
}

export interface StrategyListResponse {
  total: number;
  active: number;
  paused: number;
  completed: number;
  strategies: StrategyDisplaySummary[];
}

export interface StrategyStatusResponse {
  strategy: StrategyDisplaySummary;
  recentExecutions: Array<{
    timestamp: number;
    success: boolean;
    amount?: number;
    error?: string;
  }>;
  conditions: Array<{
    type: string;
    config: Record<string, unknown>;
    isMet: boolean;
    lastChecked?: number;
  }>;
  goalProgress?: GoalProgress;
}

export interface StrategyActionResult {
  success: boolean;
  message: string;
  strategy?: Strategy;
  error?: string;
}

// ============================================================================
// Strategy Manager
// ============================================================================

export class StrategyManager {
  private store: StrategyStore;
  private conditionEngine?: ConditionEngine;
  private executionQueue?: ExecutionQueue;

  constructor(
    store: StrategyStore,
    conditionEngine?: ConditionEngine,
    executionQueue?: ExecutionQueue
  ) {
    this.store = store;
    this.conditionEngine = conditionEngine;
    this.executionQueue = executionQueue;
  }

  // ==========================================================================
  // List Strategies
  // ==========================================================================

  /**
   * List all strategies for a user with summaries
   */
  async listStrategies(
    userId: string,
    filter?: {
      type?: string;
      status?: StrategyStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<StrategyListResponse> {
    const result = await this.store.listByUser(userId);
    const allStrategies = result.strategies;

    // Apply filters
    let filtered = allStrategies;

    if (filter?.type) {
      filtered = filtered.filter((s) => s.type === filter.type);
    }

    if (filter?.status) {
      filtered = filtered.filter((s) => s.status === filter.status);
    }

    // Count by status
    const active = allStrategies.filter((s) => s.status === 'active').length;
    const paused = allStrategies.filter((s) => s.status === 'paused').length;
    const completed = allStrategies.filter(
      (s) => s.status === 'completed' || s.status === 'cancelled'
    ).length;

    // Apply pagination
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 20;
    const paginated = filtered.slice(offset, offset + limit);

    // Create summaries
    const strategies = paginated.map((s) => this.createSummary(s));

    return {
      total: allStrategies.length,
      active,
      paused,
      completed,
      strategies,
    };
  }

  /**
   * List only active strategies
   */
  async listActiveStrategies(userId: string): Promise<StrategyDisplaySummary[]> {
    const response = await this.listStrategies(userId, { status: 'active' });
    return response.strategies;
  }

  /**
   * Format strategy list as user-friendly text
   */
  formatStrategyList(response: StrategyListResponse): string {
    if (response.total === 0) {
      return "You don't have any strategies yet. Would you like to create one?";
    }

    let output = `📊 Your Strategies (${response.active} active, ${response.paused} paused)\n\n`;

    for (const strategy of response.strategies) {
      const statusEmoji = this.getStatusEmoji(strategy.status);
      const typeEmoji = this.getTypeEmoji(strategy.type);

      output += `${statusEmoji} ${typeEmoji} **${strategy.name}**\n`;
      output += `   Status: ${this.capitalizeFirst(strategy.status)}`;

      if (strategy.totalExecutions > 0) {
        output += ` | Executions: ${strategy.totalExecutions}`;
      }

      if (strategy.details.progressPercentage !== undefined) {
        output += ` | Progress: ${(strategy.details.progressPercentage as number).toFixed(1)}%`;
      }

      output += `\n   ID: \`${strategy.strategyId}\`\n\n`;
    }

    return output.trim();
  }

  // ==========================================================================
  // Get Strategy Status
  // ==========================================================================

  /**
   * Get detailed status for a specific strategy
   */
  async getStrategyStatus(strategyId: string): Promise<StrategyStatusResponse | null> {
    const strategy = await this.store.get(strategyId);
    if (!strategy) {
      return null;
    }

    const summary = this.createSummary(strategy);

    // Get recent executions
    const recentExecutions = strategy.executions
      .slice(-10)
      .reverse()
      .map((e) => ({
        timestamp: e.startedAt,
        success: e.success,
        amount: e.amountExecuted,
        error: e.error,
      }));

    // Get conditions
    const conditions = strategy.conditions.map((c) => ({
      type: c.type,
      config: c.config as unknown as Record<string, unknown>,
      isMet: c.isMet,
      lastChecked: c.lastCheckedAt,
    }));

    // Get goal progress if applicable
    const goalProgress = strategy.type === 'goal' ? strategy.goalProgress : undefined;

    return {
      strategy: summary,
      recentExecutions,
      conditions,
      goalProgress,
    };
  }

  /**
   * Format strategy status as user-friendly text
   */
  formatStrategyStatus(response: StrategyStatusResponse): string {
    const { strategy, recentExecutions, goalProgress } = response;

    let output = `${this.getTypeEmoji(strategy.type)} **${strategy.name}**\n\n`;

    // Basic info
    output += `**Status:** ${this.getStatusEmoji(strategy.status)} ${this.capitalizeFirst(strategy.status)}\n`;
    output += `**Created:** ${new Date(strategy.createdAt).toLocaleDateString()}\n`;

    if (strategy.lastExecutedAt) {
      output += `**Last Executed:** ${this.formatRelativeTime(strategy.lastExecutedAt)}\n`;
    }

    // Stats
    if (strategy.totalExecutions > 0) {
      output += `\n**Execution Stats:**\n`;
      output += `• Total: ${strategy.totalExecutions}\n`;
      output += `• Success Rate: ${(strategy.successRate * 100).toFixed(1)}%\n`;

      if (strategy.totalAmountExecuted > 0) {
        output += `• Total Amount: $${strategy.totalAmountExecuted.toLocaleString()}\n`;
      }
    }

    // Goal progress
    if (goalProgress) {
      output += `\n**Goal Progress:**\n`;
      output += `• Target: $${goalProgress.targetAmount.toLocaleString()}\n`;
      output += `• Current: $${goalProgress.currentAmount.toLocaleString()} (${goalProgress.progressPercentage.toFixed(1)}%)\n`;

      if (goalProgress.daysRemaining !== null) {
        output += `• Days Remaining: ${goalProgress.daysRemaining}\n`;
      }

      output += `• On Track: ${goalProgress.onTrack ? '✅ Yes' : '⚠️ No'}\n`;

      if (goalProgress.contributions) {
        output += `\n**Contributions Breakdown:**\n`;
        if (goalProgress.contributions.dca > 0) {
          output += `• DCA: $${goalProgress.contributions.dca.toLocaleString()}\n`;
        }
        if (goalProgress.contributions.yieldEarned > 0) {
          output += `• Yield: $${goalProgress.contributions.yieldEarned.toLocaleString()}\n`;
        }
        if (goalProgress.contributions.manualDeposits > 0) {
          output += `• Deposits: $${goalProgress.contributions.manualDeposits.toLocaleString()}\n`;
        }
      }
    }

    // Recent executions
    if (recentExecutions.length > 0) {
      output += `\n**Recent Activity:**\n`;
      for (const exec of recentExecutions.slice(0, 5)) {
        const icon = exec.success ? '✅' : '❌';
        const time = this.formatRelativeTime(exec.timestamp);
        output += `• ${icon} ${time}`;
        if (exec.amount) {
          output += ` - $${exec.amount.toLocaleString()}`;
        }
        if (exec.error) {
          output += ` - ${exec.error}`;
        }
        output += '\n';
      }
    }

    return output.trim();
  }

  // ==========================================================================
  // Strategy Actions
  // ==========================================================================

  /**
   * Pause a strategy
   */
  async pauseStrategy(strategyId: string, userId: string): Promise<StrategyActionResult> {
    const strategy = await this.store.get(strategyId);

    if (!strategy) {
      return {
        success: false,
        message: 'Strategy not found.',
        error: 'NOT_FOUND',
      };
    }

    if (strategy.userId !== userId) {
      return {
        success: false,
        message: 'You do not have permission to modify this strategy.',
        error: 'UNAUTHORIZED',
      };
    }

    if (strategy.status !== 'active') {
      return {
        success: false,
        message: `Strategy is ${strategy.status}, not active. Only active strategies can be paused.`,
        error: 'INVALID_STATE',
      };
    }

    try {
      const updated = await this.store.pause(strategyId);

      // Stop condition monitoring
      // TODO: Add stopMonitoring method to ConditionEngine
      // if (this.conditionEngine) {
      //   this.conditionEngine.stopMonitoring(strategyId);
      // }

      return {
        success: true,
        message: `Strategy "${strategy.name}" has been paused. It will not execute until resumed.`,
        strategy: updated,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to pause strategy.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resume a paused strategy
   */
  async resumeStrategy(strategyId: string, userId: string): Promise<StrategyActionResult> {
    const strategy = await this.store.get(strategyId);

    if (!strategy) {
      return {
        success: false,
        message: 'Strategy not found.',
        error: 'NOT_FOUND',
      };
    }

    if (strategy.userId !== userId) {
      return {
        success: false,
        message: 'You do not have permission to modify this strategy.',
        error: 'UNAUTHORIZED',
      };
    }

    if (strategy.status !== 'paused') {
      return {
        success: false,
        message: `Strategy is ${strategy.status}, not paused. Only paused strategies can be resumed.`,
        error: 'INVALID_STATE',
      };
    }

    try {
      const updated = await this.store.activate(strategyId);

      // Restart condition monitoring
      if (this.conditionEngine && updated.conditions.length > 0) {
        for (const condition of updated.conditions) {
          await this.conditionEngine.registerCondition(updated, condition);
        }
      }

      return {
        success: true,
        message: `Strategy "${strategy.name}" has been resumed and is now active.`,
        strategy: updated,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to resume strategy.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cancel a strategy
   */
  async cancelStrategy(
    strategyId: string,
    userId: string,
    reason?: string
  ): Promise<StrategyActionResult> {
    const strategy = await this.store.get(strategyId);

    if (!strategy) {
      return {
        success: false,
        message: 'Strategy not found.',
        error: 'NOT_FOUND',
      };
    }

    if (strategy.userId !== userId) {
      return {
        success: false,
        message: 'You do not have permission to modify this strategy.',
        error: 'UNAUTHORIZED',
      };
    }

    if (strategy.status === 'completed' || strategy.status === 'cancelled') {
      return {
        success: false,
        message: `Strategy is already ${strategy.status}.`,
        error: 'INVALID_STATE',
      };
    }

    try {
      const updated = await this.store.cancel(strategyId, reason);

      // Stop condition monitoring
      // TODO: Add stopMonitoring method to ConditionEngine
      // if (this.conditionEngine) {
      //   this.conditionEngine.stopMonitoring(strategyId);
      // }

      // Remove scheduled jobs
      if (this.executionQueue) {
        await this.executionQueue.cancelStrategyJobs(strategyId);
      }

      return {
        success: true,
        message: `Strategy "${strategy.name}" has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
        strategy: updated,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to cancel strategy.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete a strategy (only cancelled/completed)
   */
  async deleteStrategy(strategyId: string, userId: string): Promise<StrategyActionResult> {
    const strategy = await this.store.get(strategyId);

    if (!strategy) {
      return {
        success: false,
        message: 'Strategy not found.',
        error: 'NOT_FOUND',
      };
    }

    if (strategy.userId !== userId) {
      return {
        success: false,
        message: 'You do not have permission to delete this strategy.',
        error: 'UNAUTHORIZED',
      };
    }

    if (strategy.status === 'active' || strategy.status === 'paused') {
      return {
        success: false,
        message: 'Cannot delete an active or paused strategy. Please cancel it first.',
        error: 'INVALID_STATE',
      };
    }

    try {
      await this.store.delete(strategyId);

      return {
        success: true,
        message: `Strategy "${strategy.name}" has been deleted.`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete strategy.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private createSummary(strategy: Strategy): StrategyDisplaySummary {
    const successfulExecutions = strategy.executions.filter((e) => e.success).length;
    const successRate =
      strategy.totalExecutions > 0 ? successfulExecutions / strategy.totalExecutions : 1;

    const lastExecution =
      strategy.executions.length > 0
        ? strategy.executions[strategy.executions.length - 1]
        : null;

    // Build type-specific details
    const details: Record<string, unknown> = {};

    switch (strategy.type) {
      case 'dca': {
        const config = strategy.config as { amountPerExecution?: number; frequency?: string; tokenPair?: { to?: string } };
        details.amountPerExecution = config.amountPerExecution;
        details.frequency = config.frequency;
        details.targetToken = config.tokenPair?.to;
        break;
      }
      case 'stop_loss':
      case 'take_profit': {
        const config = strategy.config as { token?: string; triggerPrice?: number };
        details.token = config.token;
        details.triggerPrice = config.triggerPrice;
        break;
      }
      case 'goal': {
        const config = strategy.config as GoalConfig;
        details.targetAmount = config.targetAmount;
        details.deadline = config.deadline;
        if (strategy.goalProgress) {
          details.currentAmount = strategy.goalProgress.currentAmount;
          details.progressPercentage = strategy.goalProgress.progressPercentage;
        }
        break;
      }
    }

    return {
      strategyId: strategy.strategyId,
      name: strategy.name,
      type: strategy.type,
      status: strategy.status,
      createdAt: strategy.createdAt,
      lastExecutedAt: lastExecution?.completedAt,
      totalExecutions: strategy.totalExecutions,
      totalAmountExecuted: strategy.totalAmountExecuted,
      successRate,
      details,
    };
  }

  private getStatusEmoji(status: StrategyStatus): string {
    switch (status) {
      case 'active':
        return '🟢';
      case 'paused':
        return '⏸️';
      case 'triggered':
        return '⚡';
      case 'completed':
        return '✅';
      case 'cancelled':
        return '❌';
      case 'failed':
        return '🔴';
      default:
        return '⚪';
    }
  }

  private getTypeEmoji(type: string): string {
    switch (type) {
      case 'dca':
        return '📈';
      case 'stop_loss':
        return '🛑';
      case 'take_profit':
        return '🎯';
      case 'goal':
        return '🎯';
      default:
        return '📋';
    }
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
  }

  private formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }
}

// ============================================================================
// Singleton
// ============================================================================

let managerInstance: StrategyManager | null = null;

export function getStrategyManager(
  store: StrategyStore,
  conditionEngine?: ConditionEngine,
  executionQueue?: ExecutionQueue
): StrategyManager {
  if (!managerInstance) {
    managerInstance = new StrategyManager(store, conditionEngine, executionQueue);
  }
  return managerInstance;
}

export function resetStrategyManager(): void {
  managerInstance = null;
}
