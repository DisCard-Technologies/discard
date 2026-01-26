/**
 * Validation Tests
 *
 * Unit tests for strategy validation utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCreateStrategyInput,
  validateDCAConfig,
  validateStopLossConfig,
  validateTakeProfitConfig,
  validateGoalConfig,
  formatValidationErrors,
  isValidTokenSymbol,
  isValidCronExpression,
} from '../utils/validation.js';
import type { CreateStrategyInput, DCAConfig, StopLossConfig, TakeProfitConfig } from '../types/strategy.js';
import type { GoalConfig } from '../types/goal.js';

// ============================================================================
// CreateStrategyInput Validation Tests
// ============================================================================

describe('validateCreateStrategyInput', () => {
  const validDCAInput: CreateStrategyInput = {
    userId: 'user123',
    type: 'dca',
    name: 'My SOL DCA',
    config: {
      tokenPair: { from: 'USDC', to: 'SOL' },
      amountPerExecution: 50,
      frequency: 'weekly',
      slippageTolerance: 0.01,
    } as DCAConfig,
  };

  it('should pass for valid input', () => {
    const result = validateCreateStrategyInput(validDCAInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when userId is missing', () => {
    const input = { ...validDCAInput, userId: '' };
    const result = validateCreateStrategyInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'userId')).toBe(true);
  });

  it('should fail when name is missing', () => {
    const input = { ...validDCAInput, name: '' };
    const result = validateCreateStrategyInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('should fail when name is too long', () => {
    const input = { ...validDCAInput, name: 'A'.repeat(101) };
    const result = validateCreateStrategyInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MAX_LENGTH')).toBe(true);
  });

  it('should fail when type is missing', () => {
    const input = { ...validDCAInput, type: undefined as any };
    const result = validateCreateStrategyInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'type')).toBe(true);
  });

  it('should fail when config is missing', () => {
    const input = { ...validDCAInput, config: undefined as any };
    const result = validateCreateStrategyInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'config')).toBe(true);
  });
});

// ============================================================================
// DCA Config Validation Tests
// ============================================================================

describe('validateDCAConfig', () => {
  const validConfig: DCAConfig = {
    tokenPair: { from: 'USDC', to: 'SOL' },
    amountPerExecution: 50,
    frequency: 'weekly',
    slippageTolerance: 0.01,
  };

  it('should pass for valid config', () => {
    const result = validateDCAConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when source token is missing', () => {
    const config = { ...validConfig, tokenPair: { from: '', to: 'SOL' } };
    const result = validateDCAConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'tokenPair.from')).toBe(true);
  });

  it('should fail when target token is missing', () => {
    const config = { ...validConfig, tokenPair: { from: 'USDC', to: '' } };
    const result = validateDCAConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'tokenPair.to')).toBe(true);
  });

  it('should fail when source and target are the same', () => {
    const config = { ...validConfig, tokenPair: { from: 'SOL', to: 'SOL' } };
    const result = validateDCAConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'tokenPair')).toBe(true);
  });

  it('should fail when amount is zero or negative', () => {
    const configZero = { ...validConfig, amountPerExecution: 0 };
    const configNegative = { ...validConfig, amountPerExecution: -10 };

    expect(validateDCAConfig(configZero).valid).toBe(false);
    expect(validateDCAConfig(configNegative).valid).toBe(false);
  });

  it('should warn for very small amounts', () => {
    const config = { ...validConfig, amountPerExecution: 0.5 };
    const result = validateDCAConfig(config);
    expect(result.warnings.some((w) => w.field === 'amountPerExecution')).toBe(true);
  });

  it('should fail for invalid frequency', () => {
    const config = { ...validConfig, frequency: 'yearly' as any };
    const result = validateDCAConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail for slippage out of range', () => {
    const configHigh = { ...validConfig, slippageTolerance: 0.6 };
    const configNegative = { ...validConfig, slippageTolerance: -0.01 };

    expect(validateDCAConfig(configHigh).valid).toBe(false);
    expect(validateDCAConfig(configNegative).valid).toBe(false);
  });

  it('should warn for high slippage', () => {
    const config = { ...validConfig, slippageTolerance: 0.1 };
    const result = validateDCAConfig(config);
    expect(result.warnings.some((w) => w.field === 'slippageTolerance')).toBe(true);
  });

  it('should fail for past end date', () => {
    const config = { ...validConfig, endDate: Date.now() - 1000 };
    const result = validateDCAConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'endDate')).toBe(true);
  });

  it('should fail for invalid max values', () => {
    const configMaxAmount = { ...validConfig, maxTotalAmount: -100 };
    const configMaxExec = { ...validConfig, maxExecutions: 0 };

    expect(validateDCAConfig(configMaxAmount).valid).toBe(false);
    expect(validateDCAConfig(configMaxExec).valid).toBe(false);
  });
});

// ============================================================================
// Stop-Loss Config Validation Tests
// ============================================================================

describe('validateStopLossConfig', () => {
  const validConfig: StopLossConfig = {
    token: 'SOL',
    triggerPrice: 100,
    quoteCurrency: 'USD',
    triggerType: 'below',
    amountToSell: 'all',
    amount: 100,
    slippageTolerance: 0.02,
  };

  it('should pass for valid config', () => {
    const result = validateStopLossConfig(validConfig);
    expect(result.valid).toBe(true);
  });

  it('should fail when token is missing', () => {
    const config = { ...validConfig, token: '' };
    const result = validateStopLossConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail when trigger price is zero or negative', () => {
    const configZero = { ...validConfig, triggerPrice: 0 };
    const configNegative = { ...validConfig, triggerPrice: -10 };

    expect(validateStopLossConfig(configZero).valid).toBe(false);
    expect(validateStopLossConfig(configNegative).valid).toBe(false);
  });

  it('should fail when quote currency is missing', () => {
    const config = { ...validConfig, quoteCurrency: '' };
    const result = validateStopLossConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail when amountToSell is missing', () => {
    const config = { ...validConfig, amountToSell: '' as any };
    const result = validateStopLossConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail for invalid percentage', () => {
    const configZero = { ...validConfig, amountToSell: 'percentage' as const, amount: 0 };
    const configOver100 = { ...validConfig, amountToSell: 'percentage' as const, amount: 101 };

    expect(validateStopLossConfig(configZero).valid).toBe(false);
    expect(validateStopLossConfig(configOver100).valid).toBe(false);
  });

  it('should fail for invalid trailing percentage', () => {
    const config = {
      ...validConfig,
      trailing: { enabled: true, trailPercentage: 0.6 },
    };
    const result = validateStopLossConfig(config);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// Take-Profit Config Validation Tests
// ============================================================================

describe('validateTakeProfitConfig', () => {
  const validConfig: TakeProfitConfig = {
    token: 'SOL',
    triggerPrice: 200,
    quoteCurrency: 'USD',
    amountToSell: 'percentage',
    amount: 50,
    slippageTolerance: 0.01,
  };

  it('should pass for valid config', () => {
    const result = validateTakeProfitConfig(validConfig);
    expect(result.valid).toBe(true);
  });

  it('should fail when token is missing', () => {
    const config = { ...validConfig, token: '' };
    const result = validateTakeProfitConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail when trigger price is invalid', () => {
    const configZero = { ...validConfig, triggerPrice: 0 };
    expect(validateTakeProfitConfig(configZero).valid).toBe(false);
  });

  it('should fail for scaled levels with total > 100%', () => {
    const config: TakeProfitConfig = {
      ...validConfig,
      scaled: {
        enabled: true,
        levels: [
          { price: 150, sellPercentage: 50 },
          { price: 200, sellPercentage: 60 },
        ],
      },
    };
    const result = validateTakeProfitConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'scaled.levels')).toBe(true);
  });

  it('should fail for scaled levels with invalid prices', () => {
    const config: TakeProfitConfig = {
      ...validConfig,
      scaled: {
        enabled: true,
        levels: [{ price: 0, sellPercentage: 50 }],
      },
    };
    const result = validateTakeProfitConfig(config);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// Goal Config Validation Tests
// ============================================================================

describe('validateGoalConfig', () => {
  const validConfig: GoalConfig = {
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

  it('should pass for valid config', () => {
    const result = validateGoalConfig(validConfig);
    expect(result.valid).toBe(true);
  });

  it('should fail when goalType is missing', () => {
    const config = { ...validConfig, goalType: undefined as any };
    const result = validateGoalConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail when targetAmount is invalid', () => {
    const configZero = { ...validConfig, targetAmount: 0 };
    const configNegative = { ...validConfig, targetAmount: -1000 };

    expect(validateGoalConfig(configZero).valid).toBe(false);
    expect(validateGoalConfig(configNegative).valid).toBe(false);
  });

  it('should fail when targetToken is missing', () => {
    const config = { ...validConfig, targetToken: '' };
    const result = validateGoalConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail when riskTolerance is missing', () => {
    const config = { ...validConfig, riskTolerance: undefined as any };
    const result = validateGoalConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail when achievementStrategy is missing', () => {
    const config = { ...validConfig, achievementStrategy: undefined as any };
    const result = validateGoalConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail for past deadline', () => {
    const config = { ...validConfig, deadline: Date.now() - 1000 };
    const result = validateGoalConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should fail for invalid contribution amount', () => {
    const config = {
      ...validConfig,
      contribution: {
        amount: -100,
        frequency: 'monthly' as const,
        sourceToken: 'USDC',
      },
    };
    const result = validateGoalConfig(config);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('formatValidationErrors', () => {
  it('should return empty string for no errors', () => {
    expect(formatValidationErrors([])).toBe('');
  });

  it('should format single error', () => {
    const errors = [{ field: 'name', message: 'Required', code: 'REQUIRED' }];
    const result = formatValidationErrors(errors);
    expect(result).toBe('- name: Required');
  });

  it('should format multiple errors', () => {
    const errors = [
      { field: 'name', message: 'Required', code: 'REQUIRED' },
      { field: 'amount', message: 'Must be positive', code: 'INVALID' },
    ];
    const result = formatValidationErrors(errors);
    expect(result).toContain('- name: Required');
    expect(result).toContain('- amount: Must be positive');
  });
});

describe('isValidTokenSymbol', () => {
  it('should accept valid symbols', () => {
    expect(isValidTokenSymbol('SOL')).toBe(true);
    expect(isValidTokenSymbol('USDC')).toBe(true);
    expect(isValidTokenSymbol('JUP')).toBe(true);
    expect(isValidTokenSymbol('BONK')).toBe(true);
  });

  it('should reject invalid symbols', () => {
    expect(isValidTokenSymbol('A')).toBe(false); // Too short
    expect(isValidTokenSymbol('VERYLONGTOKEN')).toBe(false); // Too long
    expect(isValidTokenSymbol('sol-usd')).toBe(false); // Contains hyphen
    expect(isValidTokenSymbol('sol usd')).toBe(false); // Contains space
  });
});

describe('isValidCronExpression', () => {
  it('should accept valid cron expressions', () => {
    expect(isValidCronExpression('0 9 * * 1')).toBe(true); // Every Monday at 9am
    expect(isValidCronExpression('0 0 * * *')).toBe(true); // Every day at midnight
    expect(isValidCronExpression('*/15 * * * *')).toBe(true); // Every 15 minutes
    expect(isValidCronExpression('0 0 1 * *')).toBe(true); // First of month
  });

  it('should reject invalid cron expressions', () => {
    expect(isValidCronExpression('invalid')).toBe(false);
    expect(isValidCronExpression('0 9')).toBe(false); // Too few fields
    expect(isValidCronExpression('')).toBe(false);
  });
});
