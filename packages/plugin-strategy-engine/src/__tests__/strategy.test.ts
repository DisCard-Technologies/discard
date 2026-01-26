/**
 * Strategy Type Tests
 *
 * Unit tests for strategy types, state transitions, and type guards.
 */

import { describe, it, expect } from 'vitest';
import {
  STRATEGY_STATE_TRANSITIONS,
  isValidStateTransition,
  isDCAConfig,
  isStopLossConfig,
  isTakeProfitConfig,
  isGoalConfig,
  type StrategyStatus,
  type DCAConfig,
  type StopLossConfig,
  type TakeProfitConfig,
} from '../types/strategy.js';
import type { GoalConfig } from '../types/goal.js';

// ============================================================================
// State Transition Tests
// ============================================================================

describe('Strategy State Transitions', () => {
  describe('STRATEGY_STATE_TRANSITIONS', () => {
    it('should define transitions for all states', () => {
      const allStates: StrategyStatus[] = [
        'draft',
        'pending',
        'active',
        'paused',
        'triggered',
        'completed',
        'cancelled',
        'failed',
      ];

      for (const state of allStates) {
        expect(STRATEGY_STATE_TRANSITIONS[state]).toBeDefined();
        expect(Array.isArray(STRATEGY_STATE_TRANSITIONS[state])).toBe(true);
      }
    });

    it('should not allow transitions from terminal states', () => {
      expect(STRATEGY_STATE_TRANSITIONS.completed).toEqual([]);
      expect(STRATEGY_STATE_TRANSITIONS.cancelled).toEqual([]);
    });

    it('should allow failed to retry (draft or pending)', () => {
      expect(STRATEGY_STATE_TRANSITIONS.failed).toContain('draft');
      expect(STRATEGY_STATE_TRANSITIONS.failed).toContain('pending');
    });
  });

  describe('isValidStateTransition', () => {
    it('should allow draft -> pending', () => {
      expect(isValidStateTransition('draft', 'pending')).toBe(true);
    });

    it('should allow draft -> cancelled', () => {
      expect(isValidStateTransition('draft', 'cancelled')).toBe(true);
    });

    it('should allow pending -> active', () => {
      expect(isValidStateTransition('pending', 'active')).toBe(true);
    });

    it('should allow active -> paused', () => {
      expect(isValidStateTransition('active', 'paused')).toBe(true);
    });

    it('should allow active -> triggered', () => {
      expect(isValidStateTransition('active', 'triggered')).toBe(true);
    });

    it('should allow active -> completed', () => {
      expect(isValidStateTransition('active', 'completed')).toBe(true);
    });

    it('should allow paused -> active (resume)', () => {
      expect(isValidStateTransition('paused', 'active')).toBe(true);
    });

    it('should allow triggered -> active (after execution)', () => {
      expect(isValidStateTransition('triggered', 'active')).toBe(true);
    });

    it('should not allow completed -> any', () => {
      expect(isValidStateTransition('completed', 'active')).toBe(false);
      expect(isValidStateTransition('completed', 'draft')).toBe(false);
      expect(isValidStateTransition('completed', 'paused')).toBe(false);
    });

    it('should not allow cancelled -> any', () => {
      expect(isValidStateTransition('cancelled', 'active')).toBe(false);
      expect(isValidStateTransition('cancelled', 'draft')).toBe(false);
    });

    it('should not allow invalid transitions', () => {
      expect(isValidStateTransition('draft', 'triggered')).toBe(false);
      expect(isValidStateTransition('draft', 'completed')).toBe(false);
      expect(isValidStateTransition('paused', 'triggered')).toBe(false);
    });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Strategy Config Type Guards', () => {
  const dcaConfig: DCAConfig = {
    tokenPair: { from: 'USDC', to: 'SOL' },
    amountPerExecution: 50,
    frequency: 'weekly',
    slippageTolerance: 0.01,
  };

  const stopLossConfig: StopLossConfig = {
    token: 'SOL',
    triggerPrice: 100,
    quoteCurrency: 'USD',
    triggerType: 'below',
    amountToSell: 'all',
    amount: 100,
    slippageTolerance: 0.02,
  };

  const takeProfitConfig: TakeProfitConfig = {
    token: 'SOL',
    triggerPrice: 200,
    quoteCurrency: 'USD',
    amountToSell: 'percentage',
    amount: 50,
    slippageTolerance: 0.01,
  };

  const goalConfig: GoalConfig = {
    goalType: 'save',
    targetAmount: 5000,
    targetToken: 'USDC',
    riskTolerance: 'moderate',
    achievementStrategy: {
      type: 'dca',
      dcaConfig: dcaConfig,
    },
  };

  describe('isDCAConfig', () => {
    it('should return true for DCA config', () => {
      expect(isDCAConfig(dcaConfig)).toBe(true);
    });

    it('should return false for other configs', () => {
      expect(isDCAConfig(stopLossConfig)).toBe(false);
      expect(isDCAConfig(takeProfitConfig)).toBe(false);
      expect(isDCAConfig(goalConfig)).toBe(false);
    });
  });

  describe('isStopLossConfig', () => {
    it('should return true for stop-loss config', () => {
      expect(isStopLossConfig(stopLossConfig)).toBe(true);
    });

    it('should return false for other configs', () => {
      expect(isStopLossConfig(dcaConfig)).toBe(false);
      expect(isStopLossConfig(goalConfig)).toBe(false);
    });
  });

  describe('isTakeProfitConfig', () => {
    it('should return true for take-profit config', () => {
      expect(isTakeProfitConfig(takeProfitConfig)).toBe(true);
    });

    it('should return false for other configs', () => {
      expect(isTakeProfitConfig(dcaConfig)).toBe(false);
      expect(isTakeProfitConfig(stopLossConfig)).toBe(false);
    });
  });

  describe('isGoalConfig', () => {
    it('should return true for goal config', () => {
      expect(isGoalConfig(goalConfig)).toBe(true);
    });

    it('should return false for other configs', () => {
      expect(isGoalConfig(dcaConfig)).toBe(false);
      expect(isGoalConfig(stopLossConfig)).toBe(false);
      expect(isGoalConfig(takeProfitConfig)).toBe(false);
    });
  });
});

// ============================================================================
// DCA Config Validation Tests
// ============================================================================

describe('DCA Config Structure', () => {
  it('should have required fields', () => {
    const config: DCAConfig = {
      tokenPair: { from: 'USDC', to: 'SOL' },
      amountPerExecution: 50,
      frequency: 'weekly',
      slippageTolerance: 0.01,
    };

    expect(config.tokenPair).toBeDefined();
    expect(config.tokenPair.from).toBe('USDC');
    expect(config.tokenPair.to).toBe('SOL');
    expect(config.amountPerExecution).toBe(50);
    expect(config.frequency).toBe('weekly');
  });

  it('should support optional end conditions', () => {
    const config: DCAConfig = {
      tokenPair: { from: 'USDC', to: 'SOL' },
      amountPerExecution: 50,
      frequency: 'weekly',
      slippageTolerance: 0.01,
      maxTotalAmount: 1000,
      maxExecutions: 20,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    expect(config.maxTotalAmount).toBe(1000);
    expect(config.maxExecutions).toBe(20);
    expect(config.endDate).toBeGreaterThan(Date.now());
  });

  it('should support all frequency values', () => {
    const frequencies: DCAConfig['frequency'][] = ['hourly', 'daily', 'weekly', 'monthly'];

    for (const frequency of frequencies) {
      const config: DCAConfig = {
        tokenPair: { from: 'USDC', to: 'SOL' },
        amountPerExecution: 50,
        frequency,
        slippageTolerance: 0.01,
      };
      expect(config.frequency).toBe(frequency);
    }
  });
});

// ============================================================================
// Stop-Loss Config Tests
// ============================================================================

describe('Stop-Loss Config Structure', () => {
  it('should have required fields', () => {
    const config: StopLossConfig = {
      token: 'SOL',
      triggerPrice: 100,
      quoteCurrency: 'USD',
      triggerType: 'below',
      amountToSell: 'all',
      amount: 100,
      slippageTolerance: 0.02,
    };

    expect(config.token).toBe('SOL');
    expect(config.triggerPrice).toBe(100);
    expect(config.triggerType).toBe('below');
  });

  it('should support trailing stop-loss', () => {
    const config: StopLossConfig = {
      token: 'SOL',
      triggerPrice: 100,
      quoteCurrency: 'USD',
      triggerType: 'below',
      amountToSell: 'all',
      amount: 100,
      slippageTolerance: 0.02,
      trailing: {
        enabled: true,
        trailPercentage: 0.1,
      },
    };

    expect(config.trailing?.enabled).toBe(true);
    expect(config.trailing?.trailPercentage).toBe(0.1);
  });

  it('should support different amount types', () => {
    const allConfig: StopLossConfig = {
      token: 'SOL',
      triggerPrice: 100,
      quoteCurrency: 'USD',
      triggerType: 'below',
      amountToSell: 'all',
      amount: 100,
      slippageTolerance: 0.02,
    };

    const percentageConfig: StopLossConfig = {
      ...allConfig,
      amountToSell: 'percentage',
      amount: 50,
    };

    const fixedConfig: StopLossConfig = {
      ...allConfig,
      amountToSell: 'fixed',
      amount: 10,
    };

    expect(allConfig.amountToSell).toBe('all');
    expect(percentageConfig.amountToSell).toBe('percentage');
    expect(fixedConfig.amountToSell).toBe('fixed');
  });
});

// ============================================================================
// Take-Profit Config Tests
// ============================================================================

describe('Take-Profit Config Structure', () => {
  it('should have required fields', () => {
    const config: TakeProfitConfig = {
      token: 'SOL',
      triggerPrice: 200,
      quoteCurrency: 'USD',
      amountToSell: 'percentage',
      amount: 50,
      slippageTolerance: 0.01,
    };

    expect(config.token).toBe('SOL');
    expect(config.triggerPrice).toBe(200);
    expect(config.amountToSell).toBe('percentage');
    expect(config.amount).toBe(50);
  });

  it('should support scaled take-profit levels', () => {
    const config: TakeProfitConfig = {
      token: 'SOL',
      triggerPrice: 200,
      quoteCurrency: 'USD',
      amountToSell: 'percentage',
      amount: 50,
      slippageTolerance: 0.01,
      scaled: {
        enabled: true,
        levels: [
          { price: 150, sellPercentage: 25 },
          { price: 200, sellPercentage: 25 },
          { price: 250, sellPercentage: 50 },
        ],
      },
    };

    expect(config.scaled?.enabled).toBe(true);
    expect(config.scaled?.levels).toHaveLength(3);

    const totalPercentage = config.scaled!.levels.reduce((sum, l) => sum + l.sellPercentage, 0);
    expect(totalPercentage).toBe(100);
  });
});

// ============================================================================
// Goal Config Tests
// ============================================================================

describe('Goal Config Structure', () => {
  it('should have required fields', () => {
    const config: GoalConfig = {
      goalType: 'save',
      targetAmount: 5000,
      targetToken: 'USDC',
      riskTolerance: 'moderate',
      achievementStrategy: {
        type: 'dca',
        dcaConfig: {
          tokenPair: { from: 'USDC', to: 'SOL' },
          amountPerExecution: 200,
          frequency: 'monthly',
          slippageTolerance: 0.01,
        },
      },
    };

    expect(config.goalType).toBe('save');
    expect(config.targetAmount).toBe(5000);
    expect(config.riskTolerance).toBe('moderate');
  });

  it('should support all goal types', () => {
    const goalTypes: GoalConfig['goalType'][] = ['save', 'accumulate', 'grow', 'income'];

    for (const goalType of goalTypes) {
      const config: GoalConfig = {
        goalType,
        targetAmount: 1000,
        targetToken: 'USDC',
        riskTolerance: 'conservative',
        achievementStrategy: {
          type: 'dca',
          dcaConfig: {
            tokenPair: { from: 'USDC', to: 'SOL' },
            amountPerExecution: 100,
            frequency: 'weekly',
            slippageTolerance: 0.01,
          },
        },
      };
      expect(config.goalType).toBe(goalType);
    }
  });

  it('should support yield harvester strategy', () => {
    const config: GoalConfig = {
      goalType: 'grow',
      targetAmount: 10000,
      targetToken: 'USDC',
      riskTolerance: 'aggressive',
      achievementStrategy: {
        type: 'yield_harvester',
        protocols: [
          {
            protocolId: 'marinade',
            protocolName: 'Marinade Finance',
            productType: 'liquid_staking',
            maxAllocation: 50,
            enabled: true,
            chain: 'solana',
          },
        ],
        minAPY: 5,
        maxProtocolExposure: 50,
        autoCompound: true,
        harvestFrequency: 'weekly',
        rebalanceThreshold: 0.1,
        includeLiquidityPools: false,
      },
    };

    expect(config.achievementStrategy.type).toBe('yield_harvester');
  });

  it('should support hybrid strategy', () => {
    const config: GoalConfig = {
      goalType: 'save',
      targetAmount: 5000,
      targetToken: 'USDC',
      riskTolerance: 'moderate',
      achievementStrategy: {
        type: 'hybrid',
        allocation: {
          dca: {
            percentage: 50,
            config: {
              tokenPair: { from: 'USDC', to: 'SOL' },
              amountPerExecution: 100,
              frequency: 'weekly',
              slippageTolerance: 0.01,
            },
          },
          reserve: {
            percentage: 50,
            token: 'USDC',
          },
        },
        rebalanceFrequency: 'monthly',
      },
    };

    expect(config.achievementStrategy.type).toBe('hybrid');
  });
});
