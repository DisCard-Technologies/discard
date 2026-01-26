/**
 * Condition Tests
 *
 * Unit tests for trigger conditions and evaluation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateComparison,
  describeComparison,
  generateConditionDescription,
  isPriceCondition,
  isTimeCondition,
  isBalanceCondition,
  isPercentageChangeCondition,
  isCustomCondition,
  type ComparisonOperator,
  type TriggerCondition,
  type PriceCondition,
  type TimeCondition,
  type BalanceCondition,
  type PercentageChangeCondition,
  type CustomCondition,
} from '../types/conditions.js';

// ============================================================================
// Comparison Evaluation Tests
// ============================================================================

describe('evaluateComparison', () => {
  describe('greater than (gt)', () => {
    it('should return true when value > target', () => {
      expect(evaluateComparison(10, 'gt', 5)).toBe(true);
      expect(evaluateComparison(100.5, 'gt', 100)).toBe(true);
    });

    it('should return false when value <= target', () => {
      expect(evaluateComparison(5, 'gt', 10)).toBe(false);
      expect(evaluateComparison(10, 'gt', 10)).toBe(false);
    });
  });

  describe('greater than or equal (gte)', () => {
    it('should return true when value >= target', () => {
      expect(evaluateComparison(10, 'gte', 5)).toBe(true);
      expect(evaluateComparison(10, 'gte', 10)).toBe(true);
    });

    it('should return false when value < target', () => {
      expect(evaluateComparison(5, 'gte', 10)).toBe(false);
    });
  });

  describe('less than (lt)', () => {
    it('should return true when value < target', () => {
      expect(evaluateComparison(5, 'lt', 10)).toBe(true);
      expect(evaluateComparison(99.9, 'lt', 100)).toBe(true);
    });

    it('should return false when value >= target', () => {
      expect(evaluateComparison(10, 'lt', 5)).toBe(false);
      expect(evaluateComparison(10, 'lt', 10)).toBe(false);
    });
  });

  describe('less than or equal (lte)', () => {
    it('should return true when value <= target', () => {
      expect(evaluateComparison(5, 'lte', 10)).toBe(true);
      expect(evaluateComparison(10, 'lte', 10)).toBe(true);
    });

    it('should return false when value > target', () => {
      expect(evaluateComparison(10, 'lte', 5)).toBe(false);
    });
  });

  describe('equal (eq)', () => {
    it('should return true when value === target', () => {
      expect(evaluateComparison(10, 'eq', 10)).toBe(true);
      expect(evaluateComparison(0, 'eq', 0)).toBe(true);
    });

    it('should return false when value !== target', () => {
      expect(evaluateComparison(10, 'eq', 11)).toBe(false);
      expect(evaluateComparison(10.1, 'eq', 10)).toBe(false);
    });
  });

  describe('not equal (neq)', () => {
    it('should return true when value !== target', () => {
      expect(evaluateComparison(10, 'neq', 11)).toBe(true);
      expect(evaluateComparison(0, 'neq', 1)).toBe(true);
    });

    it('should return false when value === target', () => {
      expect(evaluateComparison(10, 'neq', 10)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle negative numbers', () => {
      expect(evaluateComparison(-5, 'gt', -10)).toBe(true);
      expect(evaluateComparison(-10, 'lt', -5)).toBe(true);
    });

    it('should handle zero', () => {
      expect(evaluateComparison(0, 'eq', 0)).toBe(true);
      expect(evaluateComparison(0, 'gte', 0)).toBe(true);
      expect(evaluateComparison(0, 'lte', 0)).toBe(true);
    });

    it('should handle decimal precision', () => {
      expect(evaluateComparison(0.1 + 0.2, 'eq', 0.3)).toBe(false); // Floating point issue
      expect(evaluateComparison(0.3, 'gt', 0.29999999999999)).toBe(true);
    });
  });
});

// ============================================================================
// Comparison Description Tests
// ============================================================================

describe('describeComparison', () => {
  it('should describe all operators', () => {
    const operators: ComparisonOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];

    for (const op of operators) {
      const description = describeComparison(op);
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it('should return human-readable descriptions', () => {
    expect(describeComparison('gt')).toBe('greater than');
    expect(describeComparison('gte')).toBe('greater than or equal to');
    expect(describeComparison('lt')).toBe('less than');
    expect(describeComparison('lte')).toBe('less than or equal to');
    expect(describeComparison('eq')).toBe('equal to');
    expect(describeComparison('neq')).toBe('not equal to');
  });
});

// ============================================================================
// Condition Description Generation Tests
// ============================================================================

describe('generateConditionDescription', () => {
  const baseCondition: Omit<TriggerCondition, 'config'> = {
    conditionId: 'cond_123',
    strategyId: 'strat_456',
    type: 'price',
    enabled: true,
    isMet: false,
    triggerCount: 0,
    inCooldown: false,
    priority: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should describe price conditions', () => {
    const condition: TriggerCondition = {
      ...baseCondition,
      type: 'price',
      config: {
        type: 'price',
        token: 'SOL',
        quoteCurrency: 'USD',
        operator: 'lt',
        targetPrice: 100,
        priceSource: 'jupiter',
      } as PriceCondition,
    };

    const description = generateConditionDescription(condition);
    expect(description).toContain('SOL');
    expect(description).toContain('100');
    expect(description).toContain('less than');
  });

  it('should describe time conditions', () => {
    const condition: TriggerCondition = {
      ...baseCondition,
      type: 'time',
      config: {
        type: 'time',
        cronExpression: '0 9 * * 1',
        timezone: 'America/New_York',
        description: 'Every Monday at 9 AM',
      } as TimeCondition,
    };

    const description = generateConditionDescription(condition);
    expect(description).toBe('Every Monday at 9 AM');
  });

  it('should describe balance conditions', () => {
    const condition: TriggerCondition = {
      ...baseCondition,
      type: 'balance',
      config: {
        type: 'balance',
        token: 'USDC',
        operator: 'gte',
        targetBalance: 1000,
      } as BalanceCondition,
    };

    const description = generateConditionDescription(condition);
    expect(description).toContain('USDC');
    expect(description).toContain('1000');
    expect(description).toContain('balance');
  });

  it('should describe percentage change conditions', () => {
    const condition: TriggerCondition = {
      ...baseCondition,
      type: 'percentage_change',
      config: {
        type: 'percentage_change',
        token: 'SOL',
        quoteCurrency: 'USD',
        referencePrice: 100,
        referenceTimestamp: Date.now(),
        direction: 'up',
        percentageThreshold: 0.1,
      } as PercentageChangeCondition,
    };

    const description = generateConditionDescription(condition);
    expect(description).toContain('SOL');
    expect(description).toContain('10%');
    expect(description).toContain('increases');
  });

  it('should describe custom conditions', () => {
    const condition: TriggerCondition = {
      ...baseCondition,
      type: 'custom',
      config: {
        type: 'custom',
        expression: 'price > 100 && balance > 500',
        variables: {},
        description: 'Price above $100 and balance above 500',
      } as CustomCondition,
    };

    const description = generateConditionDescription(condition);
    expect(description).toBe('Price above $100 and balance above 500');
  });
});

// ============================================================================
// Condition Type Guard Tests
// ============================================================================

describe('Condition Type Guards', () => {
  const priceConfig: PriceCondition = {
    type: 'price',
    token: 'SOL',
    quoteCurrency: 'USD',
    operator: 'lt',
    targetPrice: 100,
    priceSource: 'jupiter',
  };

  const timeConfig: TimeCondition = {
    type: 'time',
    cronExpression: '0 9 * * 1',
    timezone: 'America/New_York',
  };

  const balanceConfig: BalanceCondition = {
    type: 'balance',
    token: 'USDC',
    operator: 'gte',
    targetBalance: 1000,
  };

  const percentageConfig: PercentageChangeCondition = {
    type: 'percentage_change',
    token: 'SOL',
    quoteCurrency: 'USD',
    referencePrice: 100,
    referenceTimestamp: Date.now(),
    direction: 'up',
    percentageThreshold: 0.1,
  };

  const customConfig: CustomCondition = {
    type: 'custom',
    expression: 'true',
    variables: {},
    description: 'Always true',
  };

  describe('isPriceCondition', () => {
    it('should return true for price conditions', () => {
      expect(isPriceCondition(priceConfig)).toBe(true);
    });

    it('should return false for other conditions', () => {
      expect(isPriceCondition(timeConfig)).toBe(false);
      expect(isPriceCondition(balanceConfig)).toBe(false);
      expect(isPriceCondition(percentageConfig)).toBe(false);
      expect(isPriceCondition(customConfig)).toBe(false);
    });
  });

  describe('isTimeCondition', () => {
    it('should return true for time conditions', () => {
      expect(isTimeCondition(timeConfig)).toBe(true);
    });

    it('should return false for other conditions', () => {
      expect(isTimeCondition(priceConfig)).toBe(false);
      expect(isTimeCondition(balanceConfig)).toBe(false);
    });
  });

  describe('isBalanceCondition', () => {
    it('should return true for balance conditions', () => {
      expect(isBalanceCondition(balanceConfig)).toBe(true);
    });

    it('should return false for other conditions', () => {
      expect(isBalanceCondition(priceConfig)).toBe(false);
      expect(isBalanceCondition(timeConfig)).toBe(false);
    });
  });

  describe('isPercentageChangeCondition', () => {
    it('should return true for percentage change conditions', () => {
      expect(isPercentageChangeCondition(percentageConfig)).toBe(true);
    });

    it('should return false for other conditions', () => {
      expect(isPercentageChangeCondition(priceConfig)).toBe(false);
      expect(isPercentageChangeCondition(balanceConfig)).toBe(false);
    });
  });

  describe('isCustomCondition', () => {
    it('should return true for custom conditions', () => {
      expect(isCustomCondition(customConfig)).toBe(true);
    });

    it('should return false for other conditions', () => {
      expect(isCustomCondition(priceConfig)).toBe(false);
      expect(isCustomCondition(timeConfig)).toBe(false);
    });
  });
});

// ============================================================================
// Trigger Condition Structure Tests
// ============================================================================

describe('TriggerCondition Structure', () => {
  it('should have all required fields', () => {
    const condition: TriggerCondition = {
      conditionId: 'cond_123',
      strategyId: 'strat_456',
      type: 'price',
      config: {
        type: 'price',
        token: 'SOL',
        quoteCurrency: 'USD',
        operator: 'lt',
        targetPrice: 100,
        priceSource: 'jupiter',
      },
      enabled: true,
      isMet: false,
      triggerCount: 0,
      inCooldown: false,
      priority: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(condition.conditionId).toBeDefined();
    expect(condition.strategyId).toBeDefined();
    expect(condition.type).toBeDefined();
    expect(condition.config).toBeDefined();
    expect(typeof condition.enabled).toBe('boolean');
    expect(typeof condition.isMet).toBe('boolean');
    expect(typeof condition.triggerCount).toBe('number');
    expect(typeof condition.inCooldown).toBe('boolean');
    expect(typeof condition.priority).toBe('number');
    expect(typeof condition.createdAt).toBe('number');
    expect(typeof condition.updatedAt).toBe('number');
  });

  it('should support cooldown configuration', () => {
    const condition: TriggerCondition = {
      conditionId: 'cond_123',
      strategyId: 'strat_456',
      type: 'price',
      config: {
        type: 'price',
        token: 'SOL',
        quoteCurrency: 'USD',
        operator: 'lt',
        targetPrice: 100,
        priceSource: 'jupiter',
      },
      enabled: true,
      isMet: false,
      triggerCount: 5,
      lastTriggeredAt: Date.now() - 60000,
      cooldownSeconds: 300, // 5 minute cooldown
      inCooldown: true,
      priority: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(condition.cooldownSeconds).toBe(300);
    expect(condition.inCooldown).toBe(true);
    expect(condition.lastTriggeredAt).toBeDefined();
  });
});
