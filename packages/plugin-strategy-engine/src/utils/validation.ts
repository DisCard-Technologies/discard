/**
 * Strategy Validation Utilities
 *
 * Validation functions for strategy configurations and inputs.
 */

import type {
  Strategy,
  StrategyConfig,
  DCAConfig,
  StopLossConfig,
  TakeProfitConfig,
  CreateStrategyInput,
} from '../types/strategy.js';
import type { GoalConfig } from '../types/goal.js';
import type { TriggerCondition, ConditionConfig } from '../types/conditions.js';

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

// ============================================================================
// Strategy Validation
// ============================================================================

/**
 * Validates a CreateStrategyInput
 */
export function validateCreateStrategyInput(input: CreateStrategyInput): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required fields
  if (!input.userId?.trim()) {
    errors.push({
      field: 'userId',
      message: 'User ID is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!input.name?.trim()) {
    errors.push({
      field: 'name',
      message: 'Strategy name is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (input.name.length > 100) {
    errors.push({
      field: 'name',
      message: 'Strategy name must be 100 characters or less',
      code: 'MAX_LENGTH',
    });
  }

  if (!input.type) {
    errors.push({
      field: 'type',
      message: 'Strategy type is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!input.config) {
    errors.push({
      field: 'config',
      message: 'Strategy configuration is required',
      code: 'REQUIRED_FIELD',
    });
  } else {
    // Validate config based on type
    const configValidation = validateStrategyConfig(input.type, input.config);
    errors.push(...configValidation.errors);
    warnings.push(...configValidation.warnings);
  }

  // Validate conditions if provided
  if (input.conditions) {
    for (let i = 0; i < input.conditions.length; i++) {
      const conditionValidation = validateCondition(input.conditions[i]);
      conditionValidation.errors.forEach((e) => {
        errors.push({
          ...e,
          field: `conditions[${i}].${e.field}`,
        });
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates strategy configuration based on type
 */
export function validateStrategyConfig(
  type: string,
  config: StrategyConfig
): ValidationResult {
  switch (type) {
    case 'dca':
      return validateDCAConfig(config as DCAConfig);
    case 'stop_loss':
      return validateStopLossConfig(config as StopLossConfig);
    case 'take_profit':
      return validateTakeProfitConfig(config as TakeProfitConfig);
    case 'goal':
      return validateGoalConfig(config as GoalConfig);
    default:
      return { valid: true, errors: [], warnings: [] };
  }
}

// ============================================================================
// DCA Validation
// ============================================================================

export function validateDCAConfig(config: DCAConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Token pair
  if (!config.tokenPair?.from) {
    errors.push({
      field: 'tokenPair.from',
      message: 'Source token is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!config.tokenPair?.to) {
    errors.push({
      field: 'tokenPair.to',
      message: 'Target token is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (config.tokenPair?.from === config.tokenPair?.to) {
    errors.push({
      field: 'tokenPair',
      message: 'Source and target tokens must be different',
      code: 'INVALID_VALUE',
    });
  }

  // Amount
  if (config.amountPerExecution === undefined || config.amountPerExecution === null) {
    errors.push({
      field: 'amountPerExecution',
      message: 'Amount per execution is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (config.amountPerExecution <= 0) {
    errors.push({
      field: 'amountPerExecution',
      message: 'Amount must be greater than 0',
      code: 'INVALID_VALUE',
    });
  } else if (config.amountPerExecution < 1) {
    warnings.push({
      field: 'amountPerExecution',
      message: 'Very small amounts may result in high relative fees',
      code: 'LOW_VALUE',
    });
  }

  // Frequency
  if (!config.frequency) {
    errors.push({
      field: 'frequency',
      message: 'Frequency is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!['hourly', 'daily', 'weekly', 'monthly'].includes(config.frequency)) {
    errors.push({
      field: 'frequency',
      message: 'Invalid frequency. Must be hourly, daily, weekly, or monthly',
      code: 'INVALID_VALUE',
    });
  }

  // Slippage
  if (config.slippageTolerance !== undefined) {
    if (config.slippageTolerance < 0 || config.slippageTolerance > 0.5) {
      errors.push({
        field: 'slippageTolerance',
        message: 'Slippage tolerance must be between 0 and 50%',
        code: 'OUT_OF_RANGE',
      });
    } else if (config.slippageTolerance > 0.05) {
      warnings.push({
        field: 'slippageTolerance',
        message: 'High slippage tolerance may result in unfavorable trades',
        code: 'HIGH_VALUE',
      });
    }
  }

  // End conditions
  if (config.maxTotalAmount !== undefined && config.maxTotalAmount <= 0) {
    errors.push({
      field: 'maxTotalAmount',
      message: 'Max total amount must be greater than 0',
      code: 'INVALID_VALUE',
    });
  }

  if (config.maxExecutions !== undefined && config.maxExecutions <= 0) {
    errors.push({
      field: 'maxExecutions',
      message: 'Max executions must be greater than 0',
      code: 'INVALID_VALUE',
    });
  }

  if (config.endDate !== undefined && config.endDate <= Date.now()) {
    errors.push({
      field: 'endDate',
      message: 'End date must be in the future',
      code: 'INVALID_VALUE',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Stop-Loss Validation
// ============================================================================

export function validateStopLossConfig(config: StopLossConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!config.token) {
    errors.push({
      field: 'token',
      message: 'Token is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (config.triggerPrice === undefined || config.triggerPrice === null) {
    errors.push({
      field: 'triggerPrice',
      message: 'Trigger price is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (config.triggerPrice <= 0) {
    errors.push({
      field: 'triggerPrice',
      message: 'Trigger price must be greater than 0',
      code: 'INVALID_VALUE',
    });
  }

  if (!config.quoteCurrency) {
    errors.push({
      field: 'quoteCurrency',
      message: 'Quote currency is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!config.amountToSell) {
    errors.push({
      field: 'amountToSell',
      message: 'Amount to sell is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (config.amountToSell === 'percentage' && (config.amount <= 0 || config.amount > 100)) {
    errors.push({
      field: 'amount',
      message: 'Percentage must be between 0 and 100',
      code: 'OUT_OF_RANGE',
    });
  }

  if (config.amountToSell === 'fixed' && config.amount <= 0) {
    errors.push({
      field: 'amount',
      message: 'Fixed amount must be greater than 0',
      code: 'INVALID_VALUE',
    });
  }

  // Slippage
  if (config.slippageTolerance !== undefined) {
    if (config.slippageTolerance < 0 || config.slippageTolerance > 0.5) {
      errors.push({
        field: 'slippageTolerance',
        message: 'Slippage tolerance must be between 0 and 50%',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Trailing stop-loss validation
  if (config.trailing?.enabled) {
    if (
      config.trailing.trailPercentage <= 0 ||
      config.trailing.trailPercentage > 0.5
    ) {
      errors.push({
        field: 'trailing.trailPercentage',
        message: 'Trail percentage must be between 0 and 50%',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Take-Profit Validation
// ============================================================================

export function validateTakeProfitConfig(config: TakeProfitConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!config.token) {
    errors.push({
      field: 'token',
      message: 'Token is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (config.triggerPrice === undefined || config.triggerPrice === null) {
    errors.push({
      field: 'triggerPrice',
      message: 'Trigger price is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (config.triggerPrice <= 0) {
    errors.push({
      field: 'triggerPrice',
      message: 'Trigger price must be greater than 0',
      code: 'INVALID_VALUE',
    });
  }

  if (!config.quoteCurrency) {
    errors.push({
      field: 'quoteCurrency',
      message: 'Quote currency is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!config.amountToSell) {
    errors.push({
      field: 'amountToSell',
      message: 'Amount to sell is required',
      code: 'REQUIRED_FIELD',
    });
  }

  // Scaled take-profit validation
  if (config.scaled?.enabled && config.scaled.levels) {
    let totalPercentage = 0;
    for (let i = 0; i < config.scaled.levels.length; i++) {
      const level = config.scaled.levels[i];
      if (level.price <= 0) {
        errors.push({
          field: `scaled.levels[${i}].price`,
          message: 'Price must be greater than 0',
          code: 'INVALID_VALUE',
        });
      }
      if (level.sellPercentage <= 0 || level.sellPercentage > 100) {
        errors.push({
          field: `scaled.levels[${i}].sellPercentage`,
          message: 'Sell percentage must be between 0 and 100',
          code: 'OUT_OF_RANGE',
        });
      }
      totalPercentage += level.sellPercentage;
    }

    if (totalPercentage > 100) {
      errors.push({
        field: 'scaled.levels',
        message: 'Total sell percentage across levels cannot exceed 100%',
        code: 'INVALID_VALUE',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Goal Validation
// ============================================================================

export function validateGoalConfig(config: GoalConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!config.goalType) {
    errors.push({
      field: 'goalType',
      message: 'Goal type is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (config.targetAmount === undefined || config.targetAmount === null) {
    errors.push({
      field: 'targetAmount',
      message: 'Target amount is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (config.targetAmount <= 0) {
    errors.push({
      field: 'targetAmount',
      message: 'Target amount must be greater than 0',
      code: 'INVALID_VALUE',
    });
  }

  if (!config.targetToken) {
    errors.push({
      field: 'targetToken',
      message: 'Target token is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!config.riskTolerance) {
    errors.push({
      field: 'riskTolerance',
      message: 'Risk tolerance is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!config.achievementStrategy) {
    errors.push({
      field: 'achievementStrategy',
      message: 'Achievement strategy is required',
      code: 'REQUIRED_FIELD',
    });
  }

  // Deadline validation
  if (config.deadline !== undefined && config.deadline <= Date.now()) {
    errors.push({
      field: 'deadline',
      message: 'Deadline must be in the future',
      code: 'INVALID_VALUE',
    });
  }

  // Contribution validation
  if (config.contribution) {
    if (config.contribution.amount <= 0) {
      errors.push({
        field: 'contribution.amount',
        message: 'Contribution amount must be greater than 0',
        code: 'INVALID_VALUE',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Condition Validation
// ============================================================================

export function validateCondition(condition: TriggerCondition): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!condition.type) {
    errors.push({
      field: 'type',
      message: 'Condition type is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!condition.config) {
    errors.push({
      field: 'config',
      message: 'Condition configuration is required',
      code: 'REQUIRED_FIELD',
    });
  }

  // Validate cooldown
  if (condition.cooldownSeconds !== undefined && condition.cooldownSeconds < 0) {
    errors.push({
      field: 'cooldownSeconds',
      message: 'Cooldown cannot be negative',
      code: 'INVALID_VALUE',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats validation errors as a user-friendly message
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  return errors.map((e) => `- ${e.field}: ${e.message}`).join('\n');
}

/**
 * Checks if a value is a valid token symbol
 */
export function isValidTokenSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{2,10}$/.test(symbol.toUpperCase());
}

/**
 * Checks if a value is a valid cron expression
 */
export function isValidCronExpression(cron: string): boolean {
  // Basic cron validation (5 or 6 fields)
  const parts = cron.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}
