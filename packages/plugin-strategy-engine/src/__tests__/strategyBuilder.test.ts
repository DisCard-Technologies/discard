/**
 * Strategy Builder E2E Tests
 *
 * Tests the conversational strategy creation flow.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StrategyStore } from '../services/strategyStore.js';
import type { Strategy } from '../types/strategy.js';

// Inline mock implementation to avoid heavy imports
const createMockStore = () => {
  const strategies = new Map<string, Strategy>();
  return {
    create: vi.fn().mockImplementation(async (input) => {
      const strategy: Strategy = {
        strategyId: `strategy_${Date.now()}`,
        userId: input.userId,
        type: input.type,
        name: input.name,
        status: 'pending',
        config: input.config,
        conditions: [],
        executions: [],
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalAmountExecuted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      strategies.set(strategy.strategyId, strategy);
      return strategy;
    }),
    get: vi.fn().mockImplementation(async (id) => strategies.get(id) || null),
  } as unknown as StrategyStore;
};

describe('Strategy Builder E2E Tests', () => {
  let mockStore: StrategyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = createMockStore();
  });

  // Lazy load the builder to avoid memory issues
  const getBuilder = async () => {
    const { StrategyBuilder } = await import('../services/strategyBuilder.js');
    return new StrategyBuilder(mockStore);
  };

  describe('DCA Strategy Creation', () => {
    it('should start session in idle state', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');
      expect(context.state).toBe('idle');
    });

    it('should detect DCA intent from processInput', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      const response = await builder.processInput(context.sessionId, 'Set up DCA for SOL');
      expect(response.complete).toBe(false);
      expect(context.strategyType).toBe('dca');
    });

    it('should create DCA strategy through full flow', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      // Step 1: Start with DCA intent
      let response = await builder.processInput(context.sessionId, 'DCA');
      expect(context.strategyType).toBe('dca');
      expect(response.complete).toBe(false);

      // Step 2: Enter token
      response = await builder.processInput(context.sessionId, 'SOL');
      expect(response.complete).toBe(false);

      // Step 3: Enter amount
      response = await builder.processInput(context.sessionId, '$100');
      expect(response.complete).toBe(false);

      // Step 4: Choose frequency
      response = await builder.processInput(context.sessionId, 'weekly');
      expect(response.complete).toBe(false);

      // Step 5: Choose limit
      response = await builder.processInput(context.sessionId, 'no limit');
      expect(response.complete).toBe(false);

      // Step 6: Confirm
      response = await builder.processInput(context.sessionId, 'confirm');
      expect(response.complete).toBe(true);
      expect(response.strategy?.type).toBe('dca');
    });
  });

  describe('Stop-Loss Strategy Creation', () => {
    it('should detect stop-loss intent', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      await builder.processInput(context.sessionId, 'stop loss');
      expect(context.strategyType).toBe('stop_loss');
    });

    it('should create stop-loss strategy through flow', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      // Start flow
      let response = await builder.processInput(context.sessionId, 'stop loss');

      // Enter token
      response = await builder.processInput(context.sessionId, 'SOL');

      // Enter price
      response = await builder.processInput(context.sessionId, '$100');

      // Choose sell amount
      response = await builder.processInput(context.sessionId, 'all');

      // Navigate to confirm (may need multiple steps)
      let attempts = 0;
      while (!response.complete && attempts < 10) {
        attempts++;
        if (response.options?.find(o => o.value === 'confirm')) {
          response = await builder.processInput(context.sessionId, 'confirm');
        } else if (response.options && response.options.length > 0) {
          response = await builder.processInput(context.sessionId, response.options[0].value);
        } else {
          response = await builder.processInput(context.sessionId, 'confirm');
        }
      }

      expect(response.complete).toBe(true);
      expect(response.strategy?.type).toBe('stop_loss');
    });
  });

  describe('Take-Profit Strategy Creation', () => {
    it('should detect take-profit intent', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      await builder.processInput(context.sessionId, 'take profit');
      expect(context.strategyType).toBe('take_profit');
    });
  });

  describe('Goal Strategy Creation', () => {
    it('should detect goal intent', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      await builder.processInput(context.sessionId, 'help me save $5000');
      expect(context.strategyType).toBe('goal');
    });

    it('should create goal strategy through flow', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      // Start with goal
      let response = await builder.processInput(context.sessionId, 'save $5000');
      expect(context.strategyType).toBe('goal');

      // Set deadline
      response = await builder.processInput(context.sessionId, '6 months');

      // Set contribution
      response = await builder.processInput(context.sessionId, '$200 monthly');

      // Decline yield optimization
      response = await builder.processInput(context.sessionId, 'no');

      // Get to confirm
      let attempts = 0;
      while (!response.complete && attempts < 10) {
        if (response.options?.find(o => o.value === 'confirm')) {
          response = await builder.processInput(context.sessionId, 'confirm');
          break;
        }
        if (response.options && response.options.length > 0) {
          response = await builder.processInput(context.sessionId, response.options[0].value);
        } else {
          response = await builder.processInput(context.sessionId, 'yes');
        }
        attempts++;
      }

      expect(response.complete).toBe(true);
      expect(response.strategy?.type).toBe('goal');
    });
  });

  describe('Session Management', () => {
    it('should cancel on user request', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      // Start a flow
      await builder.processInput(context.sessionId, 'DCA');

      // Cancel mid-flow
      const response = await builder.processInput(context.sessionId, 'cancel');
      expect(response.complete).toBe(true);
      expect(response.message).toContain('cancelled');
    });

    it('should handle unknown input in idle state', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      const response = await builder.processInput(context.sessionId, 'random gibberish');

      expect(response.complete).toBe(false);
      // Should ask what to create
      expect(response.message).toContain('create');
    });
  });

  describe('Input Validation', () => {
    it('should handle invalid amount during DCA flow', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      // Start DCA flow
      await builder.processInput(context.sessionId, 'DCA');
      await builder.processInput(context.sessionId, 'SOL');

      // Enter invalid amount
      const response = await builder.processInput(context.sessionId, 'abc');

      expect(response.complete).toBe(false);
    });

    it('should handle zero amount', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      await builder.processInput(context.sessionId, 'DCA');
      await builder.processInput(context.sessionId, 'SOL');

      const response = await builder.processInput(context.sessionId, '$0');

      expect(response.complete).toBe(false);
    });

    it('should reject negative prices for stop-loss', async () => {
      const builder = await getBuilder();
      const context = builder.startSession('user_123');

      await builder.processInput(context.sessionId, 'stop loss');
      await builder.processInput(context.sessionId, 'SOL');

      const response = await builder.processInput(context.sessionId, '-$50');

      expect(response.complete).toBe(false);
    });
  });
});
