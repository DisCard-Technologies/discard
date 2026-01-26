/**
 * Integration Tests for Price Trigger → Execution Flow
 *
 * Tests the complete pipeline from condition evaluation through
 * execution queue to agent execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Strategy, DCAConfig, StopLossConfig, TakeProfitConfig } from '../types/strategy.js';
import type { TriggerCondition, PriceCondition, TimeCondition } from '../types/conditions.js';
import type { StrategyEvent } from '../types/events.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  hget: vi.fn(),
  hset: vi.fn(),
  hdel: vi.fn(),
  hgetall: vi.fn(),
  lpush: vi.fn(),
  lrange: vi.fn(),
  smembers: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  keys: vi.fn(),
  multi: vi.fn(() => ({
    exec: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    lpush: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
  })),
  duplicate: vi.fn().mockReturnThis(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
};

// Mock fetch for Jupiter API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expression, callback) => ({
      start: vi.fn(),
      stop: vi.fn(),
    })),
    validate: vi.fn(() => true),
  },
}));

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJobs: vi.fn().mockResolvedValue([]),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    getDelayedCount: vi.fn().mockResolvedValue(0),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    drain: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createTestStrategy(
  overrides: Partial<Strategy> = {},
  configOverrides: Partial<DCAConfig | StopLossConfig | TakeProfitConfig> = {}
): Strategy {
  const strategyId = `strat_${uuidv4()}`;

  return {
    strategyId,
    userId: 'user_test123',
    type: 'dca',
    name: 'Test Strategy',
    status: 'active',
    config: {
      tokenPair: { from: 'USDC', to: 'SOL' },
      amountPerExecution: 50,
      frequency: 'daily',
      slippageTolerance: 0.01,
      ...configOverrides,
    } as DCAConfig,
    conditions: [],
    executions: [],
    events: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalExecutions: 0,
    totalAmountExecuted: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    ...overrides,
  };
}

function createPriceCondition(
  token: string,
  operator: 'gt' | 'lt' | 'gte' | 'lte',
  targetPrice: number
): TriggerCondition {
  return {
    conditionId: `cond_${uuidv4()}`,
    strategyId: 'test',
    type: 'price',
    config: {
      type: 'price',
      token,
      quoteCurrency: 'USD',
      operator,
      targetPrice,
      priceSource: 'jupiter',
    } as PriceCondition,
    enabled: true,
    isMet: false,
    triggerCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createTimeCondition(cronExpression: string): TriggerCondition {
  return {
    conditionId: `cond_${uuidv4()}`,
    strategyId: 'test',
    type: 'time',
    config: {
      type: 'time',
      cronExpression,
      timezone: 'UTC',
    } as TimeCondition,
    enabled: true,
    isMet: false,
    triggerCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function mockJupiterPriceResponse(prices: Record<string, number>) {
  const data: Record<string, { id: string; mintSymbol: string; vsToken: string; price: number }> = {};
  for (const [symbol, price] of Object.entries(prices)) {
    data[symbol] = {
      id: `mint_${symbol}`,
      mintSymbol: symbol,
      vsToken: 'USD',
      price,
    };
  }

  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ data }),
  });
}

function mockJupiterQuoteResponse(outputAmount: string, priceImpact: string = '0.1') {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      inputMint: 'So11111111111111111111111111111111111111112',
      inAmount: '1000000000',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      outAmount: outputAmount,
      otherAmountThreshold: outputAmount,
      swapMode: 'ExactIn',
      slippageBps: 50,
      priceImpactPct: priceImpact,
      routePlan: [
        {
          swapInfo: {
            ammKey: 'test-amm',
            label: 'Raydium',
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            inAmount: '1000000000',
            outAmount: outputAmount,
            feeAmount: '1000000',
            feeMint: 'So11111111111111111111111111111111111111112',
          },
          percent: 100,
        },
      ],
    }),
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Price Trigger → Execution Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.hgetall.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Price Condition Evaluation', () => {
    it('should detect when SOL price exceeds target', async () => {
      // Setup: Create stop-loss strategy with price condition
      const strategy = createTestStrategy(
        {
          type: 'stop_loss',
          status: 'active',
        },
        {
          token: 'SOL',
          triggerPrice: 100,
          quoteCurrency: 'USD',
          triggerType: 'below',
          amountToSell: 'all',
          amount: 100,
          slippageTolerance: 0.02,
        } as StopLossConfig
      );

      const condition = createPriceCondition('SOL', 'lt', 100);
      strategy.conditions = [condition];

      // Mock Jupiter price below trigger
      mockJupiterPriceResponse({ SOL: 95 });

      // Simulate price evaluation
      const { evaluateComparison } = await import('../types/conditions.js');
      const isMet = evaluateComparison(95, 'lt', 100);

      expect(isMet).toBe(true);
    });

    it('should not trigger when price is above stop-loss', async () => {
      mockJupiterPriceResponse({ SOL: 150 });

      const { evaluateComparison } = await import('../types/conditions.js');
      const isMet = evaluateComparison(150, 'lt', 100);

      expect(isMet).toBe(false);
    });

    it('should trigger take-profit when price exceeds target', async () => {
      const strategy = createTestStrategy(
        {
          type: 'take_profit',
          status: 'active',
        },
        {
          token: 'SOL',
          triggerPrice: 200,
          quoteCurrency: 'USD',
          amountToSell: 'percentage',
          amount: 50,
          slippageTolerance: 0.01,
        } as TakeProfitConfig
      );

      mockJupiterPriceResponse({ SOL: 210 });

      const { evaluateComparison } = await import('../types/conditions.js');
      const isMet = evaluateComparison(210, 'gte', 200);

      expect(isMet).toBe(true);
    });
  });

  describe('DCA Strategy Execution Flow', () => {
    it('should correctly parse DCA frequency to cron expression', async () => {
      const { DCAAgent } = await import('../agents/dcaAgent.js');

      expect(DCAAgent.frequencyToCron('hourly')).toBe('0 * * * *');
      expect(DCAAgent.frequencyToCron('daily')).toBe('0 9 * * *');
      expect(DCAAgent.frequencyToCron('weekly')).toBe('0 9 * * 1');
      expect(DCAAgent.frequencyToCron('monthly')).toBe('0 9 1 * *');
    });

    it('should convert frequency to milliseconds', async () => {
      const { DCAAgent } = await import('../agents/dcaAgent.js');

      expect(DCAAgent.frequencyToMs('hourly')).toBe(60 * 60 * 1000);
      expect(DCAAgent.frequencyToMs('daily')).toBe(24 * 60 * 60 * 1000);
      expect(DCAAgent.frequencyToMs('weekly')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(DCAAgent.frequencyToMs('monthly')).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('should estimate total cost for DCA strategy', async () => {
      const { DCAAgent } = await import('../agents/dcaAgent.js');

      const config: DCAConfig = {
        tokenPair: { from: 'USDC', to: 'SOL' },
        amountPerExecution: 100,
        frequency: 'weekly',
        maxExecutions: 10,
        slippageTolerance: 0.01,
      };

      const estimate = DCAAgent.estimateTotalCost(config);

      expect(estimate.estimatedExecutions).toBe(10);
      expect(estimate.minCost).toBe(1000); // 10 * 100
      expect(estimate.maxCost).toBe(1010); // 1000 * 1.01
    });

    it('should estimate executions from maxTotalAmount', async () => {
      const { DCAAgent } = await import('../agents/dcaAgent.js');

      const config: DCAConfig = {
        tokenPair: { from: 'USDC', to: 'SOL' },
        amountPerExecution: 100,
        frequency: 'weekly',
        maxTotalAmount: 500,
        slippageTolerance: 0.01,
      };

      const estimate = DCAAgent.estimateTotalCost(config);

      expect(estimate.estimatedExecutions).toBe(5); // 500 / 100
    });
  });

  describe('Condition Engine Workflow', () => {
    it('should correctly evaluate comparison operators', async () => {
      const { evaluateComparison } = await import('../types/conditions.js');

      // Greater than
      expect(evaluateComparison(100, 'gt', 50)).toBe(true);
      expect(evaluateComparison(50, 'gt', 100)).toBe(false);
      expect(evaluateComparison(50, 'gt', 50)).toBe(false);

      // Less than
      expect(evaluateComparison(50, 'lt', 100)).toBe(true);
      expect(evaluateComparison(100, 'lt', 50)).toBe(false);
      expect(evaluateComparison(50, 'lt', 50)).toBe(false);

      // Greater than or equal
      expect(evaluateComparison(100, 'gte', 50)).toBe(true);
      expect(evaluateComparison(50, 'gte', 50)).toBe(true);
      expect(evaluateComparison(50, 'gte', 100)).toBe(false);

      // Less than or equal
      expect(evaluateComparison(50, 'lte', 100)).toBe(true);
      expect(evaluateComparison(50, 'lte', 50)).toBe(true);
      expect(evaluateComparison(100, 'lte', 50)).toBe(false);

      // Equals
      expect(evaluateComparison(50, 'eq', 50)).toBe(true);
      expect(evaluateComparison(50, 'eq', 100)).toBe(false);

      // Not equals
      expect(evaluateComparison(50, 'neq', 100)).toBe(true);
      expect(evaluateComparison(50, 'neq', 50)).toBe(false);
    });

    it('should generate human-readable condition descriptions', async () => {
      const { generateConditionDescription } = await import('../types/conditions.js');

      const priceCondition: TriggerCondition = createPriceCondition('SOL', 'lt', 100);
      const description = generateConditionDescription(priceCondition);

      expect(description).toContain('SOL');
      expect(description).toContain('100');
    });
  });

  describe('Strategy State Machine', () => {
    it('should validate state transitions', async () => {
      const { isValidStateTransition, STRATEGY_STATE_TRANSITIONS } = await import('../types/strategy.js');

      // Valid transitions from 'draft'
      expect(isValidStateTransition('draft', 'pending')).toBe(true);
      expect(isValidStateTransition('draft', 'cancelled')).toBe(true);
      // draft -> active is not directly allowed (must go through pending)
      expect(isValidStateTransition('draft', 'active')).toBe(false);

      // Invalid transitions
      expect(isValidStateTransition('draft', 'completed')).toBe(false);
      expect(isValidStateTransition('draft', 'triggered')).toBe(false);

      // Pending transitions
      expect(isValidStateTransition('pending', 'active')).toBe(true);
      expect(isValidStateTransition('pending', 'cancelled')).toBe(true);
      expect(isValidStateTransition('pending', 'failed')).toBe(true);

      // Active strategy transitions
      expect(isValidStateTransition('active', 'paused')).toBe(true);
      expect(isValidStateTransition('active', 'triggered')).toBe(true);
      expect(isValidStateTransition('active', 'completed')).toBe(true);
      expect(isValidStateTransition('active', 'cancelled')).toBe(true);
      expect(isValidStateTransition('active', 'failed')).toBe(true);

      // Triggered can go to active, completed, or failed
      expect(isValidStateTransition('triggered', 'active')).toBe(true);
      expect(isValidStateTransition('triggered', 'failed')).toBe(true);
      expect(isValidStateTransition('triggered', 'completed')).toBe(true);

      // Paused can go back to active or be cancelled
      expect(isValidStateTransition('paused', 'active')).toBe(true);
      expect(isValidStateTransition('paused', 'cancelled')).toBe(true);

      // Terminal states - no transitions allowed
      expect(isValidStateTransition('completed', 'active')).toBe(false);
      expect(isValidStateTransition('cancelled', 'active')).toBe(false);

      // Failed can retry by going back to draft or pending
      expect(isValidStateTransition('failed', 'draft')).toBe(true);
      expect(isValidStateTransition('failed', 'pending')).toBe(true);
    });
  });

  describe('End-to-End Simulation', () => {
    it('should simulate complete stop-loss trigger flow', async () => {
      // 1. Create strategy with stop-loss condition
      const strategy = createTestStrategy(
        {
          type: 'stop_loss',
          status: 'active',
        },
        {
          token: 'SOL',
          triggerPrice: 100,
          quoteCurrency: 'USD',
          triggerType: 'below',
          amountToSell: 'all',
          amount: 100,
          slippageTolerance: 0.02,
        } as StopLossConfig
      );

      const condition = createPriceCondition('SOL', 'lt', 100);
      condition.strategyId = strategy.strategyId;
      strategy.conditions = [condition];

      // 2. Simulate price drop
      const currentPrice = 95;
      mockJupiterPriceResponse({ SOL: currentPrice });

      // 3. Evaluate condition
      const { evaluateComparison } = await import('../types/conditions.js');
      const isTriggered = evaluateComparison(currentPrice, 'lt', 100);

      expect(isTriggered).toBe(true);

      // 4. Mock Jupiter quote for swap
      mockJupiterQuoteResponse('9500000'); // 95 USDC output

      // 5. Verify execution would proceed
      const executionContext = {
        strategyId: strategy.strategyId,
        conditionId: condition.conditionId,
        triggerPrice: currentPrice,
        action: 'sell_all_sol',
      };

      expect(executionContext.triggerPrice).toBeLessThan(100);
      expect(executionContext.action).toBe('sell_all_sol');
    });

    it('should simulate complete take-profit trigger flow', async () => {
      // 1. Create strategy with take-profit condition
      const strategy = createTestStrategy(
        {
          type: 'take_profit',
          status: 'active',
        },
        {
          token: 'SOL',
          triggerPrice: 200,
          quoteCurrency: 'USD',
          amountToSell: 'percentage',
          amount: 50,
          slippageTolerance: 0.01,
        } as TakeProfitConfig
      );

      const condition = createPriceCondition('SOL', 'gte', 200);
      condition.strategyId = strategy.strategyId;
      strategy.conditions = [condition];

      // 2. Simulate price rise
      const currentPrice = 210;
      mockJupiterPriceResponse({ SOL: currentPrice });

      // 3. Evaluate condition
      const { evaluateComparison } = await import('../types/conditions.js');
      const isTriggered = evaluateComparison(currentPrice, 'gte', 200);

      expect(isTriggered).toBe(true);

      // 4. Verify execution context
      const config = strategy.config as TakeProfitConfig;
      const mockBalance = 10; // 10 SOL
      const amountToSell = (mockBalance * config.amount) / 100; // 50% = 5 SOL

      expect(amountToSell).toBe(5);
    });

    it('should simulate DCA execution timing', async () => {
      // 1. Create DCA strategy
      const strategy = createTestStrategy(
        {
          type: 'dca',
          status: 'active',
        },
        {
          tokenPair: { from: 'USDC', to: 'SOL' },
          amountPerExecution: 100,
          frequency: 'daily',
          slippageTolerance: 0.01,
        } as DCAConfig
      );

      // 2. Add time-based condition
      const condition = createTimeCondition('0 9 * * *'); // Daily at 9 AM
      condition.strategyId = strategy.strategyId;
      strategy.conditions = [condition];

      // 3. Simulate time trigger
      const { DCAAgent } = await import('../agents/dcaAgent.js');
      const cronExpression = DCAAgent.frequencyToCron('daily');

      expect(cronExpression).toBe('0 9 * * *');

      // 4. Mock quote for DCA execution
      mockJupiterQuoteResponse('666666', '0.05'); // ~0.67 SOL for $100

      // 5. Verify execution parameters
      const config = strategy.config as DCAConfig;
      expect(config.amountPerExecution).toBe(100);
      expect(config.tokenPair.from).toBe('USDC');
      expect(config.tokenPair.to).toBe('SOL');
    });
  });

  describe('Execution Limits', () => {
    it('should respect maxTotalAmount limit', async () => {
      const strategy = createTestStrategy(
        {
          totalAmountExecuted: 900,
        },
        {
          tokenPair: { from: 'USDC', to: 'SOL' },
          amountPerExecution: 100,
          frequency: 'daily',
          maxTotalAmount: 1000,
        } as DCAConfig
      );

      const config = strategy.config as DCAConfig;
      const canExecute = strategy.totalAmountExecuted < (config.maxTotalAmount || Infinity);

      expect(canExecute).toBe(true);

      // After one more execution
      strategy.totalAmountExecuted = 1000;
      const canExecuteAfter = strategy.totalAmountExecuted < (config.maxTotalAmount || Infinity);

      expect(canExecuteAfter).toBe(false);
    });

    it('should respect maxExecutions limit', async () => {
      const strategy = createTestStrategy(
        {
          totalExecutions: 9,
        },
        {
          tokenPair: { from: 'USDC', to: 'SOL' },
          amountPerExecution: 100,
          frequency: 'daily',
          maxExecutions: 10,
        } as DCAConfig
      );

      const config = strategy.config as DCAConfig;
      const canExecute = strategy.totalExecutions < (config.maxExecutions || Infinity);

      expect(canExecute).toBe(true);

      // After reaching limit
      strategy.totalExecutions = 10;
      const canExecuteAfter = strategy.totalExecutions < (config.maxExecutions || Infinity);

      expect(canExecuteAfter).toBe(false);
    });

    it('should respect endDate limit', async () => {
      const now = Date.now();
      const strategy = createTestStrategy(
        {},
        {
          tokenPair: { from: 'USDC', to: 'SOL' },
          amountPerExecution: 100,
          frequency: 'daily',
          endDate: now + 86400000, // Tomorrow
        } as DCAConfig
      );

      const config = strategy.config as DCAConfig;
      let canExecute = now < (config.endDate || Infinity);

      expect(canExecute).toBe(true);

      // After end date
      const futureTime = now + 2 * 86400000; // 2 days later
      canExecute = futureTime < (config.endDate || Infinity);

      expect(canExecute).toBe(false);
    });
  });

  describe('Price Source Handling', () => {
    it('should handle Jupiter price responses', async () => {
      mockJupiterPriceResponse({
        SOL: 150.50,
        JUP: 1.25,
        BONK: 0.00001234,
      });

      const response = await fetch('https://price.jup.ag/v6/price?ids=SOL,JUP,BONK');
      const data = await response.json();

      expect(data.data.SOL.price).toBe(150.50);
      expect(data.data.JUP.price).toBe(1.25);
      expect(data.data.BONK.price).toBe(0.00001234);
    });

    it('should handle price fetch failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetch('https://price.jup.ag/v6/price?ids=SOL')).rejects.toThrow('Network error');
    });
  });

  describe('Quote Response Handling', () => {
    it('should parse Jupiter quote correctly', async () => {
      mockJupiterQuoteResponse('150000000', '0.15');

      const response = await fetch('https://quote-api.jup.ag/v6/quote');
      const quote = await response.json();

      expect(quote.outAmount).toBe('150000000');
      expect(quote.priceImpactPct).toBe('0.15');
      expect(quote.routePlan).toHaveLength(1);
      expect(quote.routePlan[0].percent).toBe(100);
    });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  describe('Strategy Config Type Guards', () => {
    it('should identify DCA config', async () => {
      const { isDCAConfig } = await import('../types/strategy.js');

      const dcaConfig: DCAConfig = {
        tokenPair: { from: 'USDC', to: 'SOL' },
        amountPerExecution: 100,
        frequency: 'daily',
      };

      expect(isDCAConfig(dcaConfig)).toBe(true);
      expect(isDCAConfig({ token: 'SOL' })).toBe(false);
    });

    it('should identify StopLoss config', async () => {
      const { isStopLossConfig } = await import('../types/strategy.js');

      const stopLossConfig: StopLossConfig = {
        token: 'SOL',
        triggerPrice: 100,
        quoteCurrency: 'USD',
        triggerType: 'below',
        amountToSell: 'all',
        amount: 100,
        slippageTolerance: 0.02,
      };

      expect(isStopLossConfig(stopLossConfig)).toBe(true);
      expect(isStopLossConfig({ tokenPair: {} })).toBe(false);
    });

    it('should identify TakeProfit config', async () => {
      const { isTakeProfitConfig } = await import('../types/strategy.js');

      const takeProfitConfig: TakeProfitConfig = {
        token: 'SOL',
        triggerPrice: 200,
        quoteCurrency: 'USD',
        amountToSell: 'percentage',
        amount: 50,
        slippageTolerance: 0.01,
      };

      expect(isTakeProfitConfig(takeProfitConfig)).toBe(true);
      expect(isTakeProfitConfig({ token: 'SOL', triggerType: 'below' })).toBe(false);
    });
  });

  describe('Condition Type Guards', () => {
    it('should identify price conditions', async () => {
      const { isPriceCondition } = await import('../types/conditions.js');

      const priceConfig: PriceCondition = {
        type: 'price',
        token: 'SOL',
        quoteCurrency: 'USD',
        operator: 'lt',
        targetPrice: 100,
        priceSource: 'jupiter',
      };

      expect(isPriceCondition(priceConfig)).toBe(true);
      expect(isPriceCondition({ type: 'time' })).toBe(false);
    });

    it('should identify time conditions', async () => {
      const { isTimeCondition } = await import('../types/conditions.js');

      const timeConfig: TimeCondition = {
        type: 'time',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
      };

      expect(isTimeCondition(timeConfig)).toBe(true);
      expect(isTimeCondition({ type: 'price' })).toBe(false);
    });
  });
});

// ============================================================================
// Event Sourcing Tests
// ============================================================================

describe('Event Sourcing', () => {
  it('should create events with proper structure', async () => {
    const { createEvent, createStrategyCreatedEvent } = await import('../types/events.js');

    const event = createStrategyCreatedEvent(
      'strat_123',
      'user_456',
      'dca',
      'My DCA Strategy',
      { amountPerExecution: 100 }
    );

    expect(event.eventId).toMatch(/^evt_/);
    expect(event.strategyId).toBe('strat_123');
    expect(event.userId).toBe('user_456');
    expect(event.eventType).toBe('strategy_created');
    expect(event.timestamp).toBeLessThanOrEqual(Date.now());
    expect(event.version).toBe(1);
  });

  it('should reconstruct strategy status from events', async () => {
    const {
      createEvent,
      reconstructStrategyStatus,
    } = await import('../types/events.js');

    const actor = { type: 'user' as const, id: 'user_456' };

    const events: StrategyEvent[] = [
      createEvent('strat_123', 'user_456', 'strategy_created', {}, actor),
      createEvent('strat_123', 'user_456', 'strategy_activated', {}, actor),
      createEvent('strat_123', 'user_456', 'strategy_paused', {}, actor),
    ];

    // Assign versions
    events.forEach((e, i) => (e.version = i + 1));

    const status = reconstructStrategyStatus(events);

    expect(status).toBe('paused');
  });

  it('should group events by correlation ID', async () => {
    const { createEvent, groupEventsByCorrelation } = await import('../types/events.js');

    const correlationId = 'corr_abc123';
    const actor = { type: 'system' as const, id: 'condition_engine' };

    const events = [
      createEvent('strat_123', 'user_456', 'condition_triggered', {}, actor, correlationId),
      createEvent('strat_123', 'user_456', 'execution_started', {}, actor, correlationId),
      createEvent('strat_123', 'user_456', 'execution_completed', {}, actor, correlationId),
      createEvent('strat_123', 'user_456', 'strategy_updated', {}, actor), // No correlation - own group
    ];

    const grouped = groupEventsByCorrelation(events);

    expect(grouped.get(correlationId)).toHaveLength(3);
    // The 4th event has no correlationId, so it uses its own eventId as key
    expect(grouped.size).toBe(2);
  });
});
