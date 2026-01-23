/**
 * Policy Engine Service
 *
 * Independent, non-LLM policy evaluation component for the safety architecture.
 * Evaluates structured plans against system and user policies to determine
 * approval mode (auto/manual/blocked) and countdown duration.
 *
 * This is Gate 2 in the Intent → Plan → Validate → Execute flow.
 */

import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Types
// ============================================================================

/**
 * Risk level for cost estimation
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Estimated cost for a plan step
 */
export interface EstimatedCost {
  maxSpendCents: number;
  maxSlippageBps: number;
  riskLevel: RiskLevel;
}

/**
 * A single step in a structured plan
 */
export interface StructuredStep {
  stepId: string;
  sequence: number;
  action: string;
  description: string;
  estimatedCost: EstimatedCost;
  expectedOutcome: string;
  dependsOn: string[];
  requiresSoulVerification: boolean;
  requiresUserApproval: boolean;
  simulationRequired: boolean;
  status: "pending" | "approved" | "executing" | "completed" | "failed" | "skipped";
}

/**
 * Structured plan output from Gate 1
 */
export interface StructuredPlan {
  planId: string;
  intentId: string;
  userId: string;
  goalRecap: string;
  steps: StructuredStep[];
  totalMaxSpendCents: number;
  totalEstimatedFeeCents: number;
  overallRiskLevel: RiskLevel;
  expectedOutcome: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Policy rule types
 */
export type PolicyRuleType =
  | "max_transaction_value"
  | "daily_limit"
  | "weekly_limit"
  | "monthly_limit"
  | "allowed_protocols"
  | "blocked_actions"
  | "time_window"
  | "simulation_required"
  | "max_slippage";

/**
 * Policy definition
 */
export interface Policy {
  policyId: string;
  policyName: string;
  policyType: "system" | "default" | "user";
  rule: {
    type: PolicyRuleType;
    thresholdCents?: number;
    thresholdBps?: number;
    protocols?: string[];
    actions?: string[];
    timeWindowStart?: string;
    timeWindowEnd?: string;
  };
  severity: "warning" | "block";
  isEnabled: boolean;
}

/**
 * User's current spending context for velocity checks
 */
export interface SpendingContext {
  dailySpentCents: number;
  weeklySpentCents: number;
  monthlySpentCents: number;
  lastResetAt: number;
}

/**
 * User's approval threshold configuration
 */
export interface ApprovalThresholds {
  autoApproveMaxCents: number;
  manualApproveMaxCents: number;
  countdownBaseDurationMs: number;
  countdownPerDollarMs: number;
  countdownMaxDurationMs: number;
}

/**
 * Policy violation details
 */
export interface PolicyViolation {
  policyId: string;
  policyName: string;
  severity: "warning" | "block";
  message: string;
}

/**
 * Result of policy evaluation
 */
export interface PolicyEvaluationResult {
  approved: boolean;
  approvalMode: "auto" | "manual" | "blocked";
  violations: PolicyViolation[];
  warnings: string[];
  countdownDurationMs?: number;
  evaluatedAt: number;
}

/**
 * Configuration for the policy engine
 */
export interface PolicyEngineConfig {
  enableSystemPolicies: boolean;
  maxPlanExpiryMs: number;
  defaultAutoApproveMaxCents: number;
  defaultManualApproveMaxCents: number;
  defaultCountdownBaseDurationMs: number;
  defaultCountdownPerDollarMs: number;
  defaultCountdownMaxDurationMs: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PolicyEngineConfig = {
  enableSystemPolicies: true,
  maxPlanExpiryMs: 30 * 60 * 1000, // 30 minutes
  defaultAutoApproveMaxCents: 10000, // $100
  defaultManualApproveMaxCents: 1000000, // $10,000
  defaultCountdownBaseDurationMs: 5000, // 5 seconds
  defaultCountdownPerDollarMs: 100, // 1 second per $10
  defaultCountdownMaxDurationMs: 30000, // 30 seconds
};

// ============================================================================
// System Policies (Always Enforced)
// ============================================================================

const SYSTEM_POLICIES: Policy[] = [
  {
    policyId: "system-max-single-transaction",
    policyName: "Maximum Single Transaction",
    policyType: "system",
    rule: {
      type: "max_transaction_value",
      thresholdCents: 1000000, // $10,000
    },
    severity: "block",
    isEnabled: true,
  },
  {
    policyId: "system-daily-limit",
    policyName: "Daily Spending Limit",
    policyType: "system",
    rule: {
      type: "daily_limit",
      thresholdCents: 5000000, // $50,000
    },
    severity: "block",
    isEnabled: true,
  },
  {
    policyId: "system-max-slippage",
    policyName: "Maximum Slippage Protection",
    policyType: "system",
    rule: {
      type: "max_slippage",
      thresholdBps: 500, // 5%
    },
    severity: "block",
    isEnabled: true,
  },
  {
    policyId: "system-simulation-required",
    policyName: "Simulation Required Above Threshold",
    policyType: "system",
    rule: {
      type: "simulation_required",
      thresholdCents: 100000, // $1,000
    },
    severity: "warning",
    isEnabled: true,
  },
];

// ============================================================================
// Policy Engine Implementation
// ============================================================================

/**
 * PolicyEngine - Non-LLM safety evaluation service
 *
 * Evaluates structured plans against a combination of system policies
 * and user-defined policies. Determines the approval mode and generates
 * human-readable warnings for the approval UI.
 */
export class PolicyEngine {
  private config: PolicyEngineConfig;
  private systemPolicies: Policy[];

  constructor(config?: Partial<PolicyEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.systemPolicies = this.config.enableSystemPolicies ? SYSTEM_POLICIES : [];
  }

  /**
   * Evaluate a structured plan against all applicable policies
   */
  async evaluatePlan(
    plan: StructuredPlan,
    userPolicies: Policy[],
    spendingContext: SpendingContext,
    thresholds?: Partial<ApprovalThresholds>
  ): Promise<PolicyEvaluationResult> {
    const violations: PolicyViolation[] = [];
    const warnings: string[] = [];

    // Merge user thresholds with defaults
    const approvalThresholds: ApprovalThresholds = {
      autoApproveMaxCents: thresholds?.autoApproveMaxCents ?? this.config.defaultAutoApproveMaxCents,
      manualApproveMaxCents: thresholds?.manualApproveMaxCents ?? this.config.defaultManualApproveMaxCents,
      countdownBaseDurationMs: thresholds?.countdownBaseDurationMs ?? this.config.defaultCountdownBaseDurationMs,
      countdownPerDollarMs: thresholds?.countdownPerDollarMs ?? this.config.defaultCountdownPerDollarMs,
      countdownMaxDurationMs: thresholds?.countdownMaxDurationMs ?? this.config.defaultCountdownMaxDurationMs,
    };

    // Combine system and user policies
    const allPolicies = [...this.systemPolicies, ...userPolicies.filter((p) => p.isEnabled)];

    // Evaluate each policy
    for (const policy of allPolicies) {
      const violation = this.evaluatePolicy(policy, plan, spendingContext);
      if (violation) {
        violations.push(violation);
        if (violation.severity === "warning") {
          warnings.push(violation.message);
        }
      }
    }

    // Determine if plan is blocked
    const hasBlockingViolation = violations.some((v) => v.severity === "block");

    if (hasBlockingViolation) {
      return {
        approved: false,
        approvalMode: "blocked",
        violations,
        warnings,
        evaluatedAt: Date.now(),
      };
    }

    // Determine approval mode based on amount
    const totalSpend = plan.totalMaxSpendCents;
    let approvalMode: "auto" | "manual";
    let countdownDurationMs: number | undefined;

    if (totalSpend <= approvalThresholds.autoApproveMaxCents) {
      // Auto-approve with countdown
      approvalMode = "auto";
      countdownDurationMs = this.calculateCountdownDuration(totalSpend, approvalThresholds);
    } else if (totalSpend <= approvalThresholds.manualApproveMaxCents) {
      // Requires manual approval
      approvalMode = "manual";
    } else {
      // Above manual threshold - block
      violations.push({
        policyId: "threshold-exceeded",
        policyName: "Manual Approval Threshold Exceeded",
        severity: "block",
        message: `Transaction of $${(totalSpend / 100).toFixed(2)} exceeds your maximum manual approval threshold of $${(approvalThresholds.manualApproveMaxCents / 100).toFixed(2)}`,
      });
      return {
        approved: false,
        approvalMode: "blocked",
        violations,
        warnings,
        evaluatedAt: Date.now(),
      };
    }

    // Check for high-risk actions that require manual approval
    if (this.hasHighRiskAction(plan)) {
      approvalMode = "manual";
      warnings.push("This plan contains high-risk operations that require manual approval.");
    }

    // Check overall risk level
    if (plan.overallRiskLevel === "critical") {
      approvalMode = "manual";
      warnings.push("This plan has a critical risk level and requires manual approval.");
    }

    return {
      approved: true,
      approvalMode,
      violations,
      warnings,
      countdownDurationMs,
      evaluatedAt: Date.now(),
    };
  }

  /**
   * Evaluate a single policy against the plan
   */
  private evaluatePolicy(
    policy: Policy,
    plan: StructuredPlan,
    spendingContext: SpendingContext
  ): PolicyViolation | null {
    switch (policy.rule.type) {
      case "max_transaction_value":
        return this.evaluateMaxTransactionValue(policy, plan);

      case "daily_limit":
        return this.evaluateDailyLimit(policy, plan, spendingContext);

      case "weekly_limit":
        return this.evaluateWeeklyLimit(policy, plan, spendingContext);

      case "monthly_limit":
        return this.evaluateMonthlyLimit(policy, plan, spendingContext);

      case "allowed_protocols":
        return this.evaluateAllowedProtocols(policy, plan);

      case "blocked_actions":
        return this.evaluateBlockedActions(policy, plan);

      case "time_window":
        return this.evaluateTimeWindow(policy);

      case "simulation_required":
        return this.evaluateSimulationRequired(policy, plan);

      case "max_slippage":
        return this.evaluateMaxSlippage(policy, plan);

      default:
        return null;
    }
  }

  /**
   * Check if any single step exceeds max transaction value
   */
  private evaluateMaxTransactionValue(policy: Policy, plan: StructuredPlan): PolicyViolation | null {
    const threshold = policy.rule.thresholdCents;
    if (!threshold) return null;

    for (const step of plan.steps) {
      if (step.estimatedCost.maxSpendCents > threshold) {
        return {
          policyId: policy.policyId,
          policyName: policy.policyName,
          severity: policy.severity,
          message: `Step "${step.description}" exceeds maximum transaction value of $${(threshold / 100).toFixed(2)} (estimated: $${(step.estimatedCost.maxSpendCents / 100).toFixed(2)})`,
        };
      }
    }
    return null;
  }

  /**
   * Check if plan would exceed daily spending limit
   */
  private evaluateDailyLimit(
    policy: Policy,
    plan: StructuredPlan,
    context: SpendingContext
  ): PolicyViolation | null {
    const threshold = policy.rule.thresholdCents;
    if (!threshold) return null;

    const projectedSpend = context.dailySpentCents + plan.totalMaxSpendCents;
    if (projectedSpend > threshold) {
      return {
        policyId: policy.policyId,
        policyName: policy.policyName,
        severity: policy.severity,
        message: `This transaction would exceed your daily limit of $${(threshold / 100).toFixed(2)} (current: $${(context.dailySpentCents / 100).toFixed(2)}, requested: $${(plan.totalMaxSpendCents / 100).toFixed(2)})`,
      };
    }
    return null;
  }

  /**
   * Check if plan would exceed weekly spending limit
   */
  private evaluateWeeklyLimit(
    policy: Policy,
    plan: StructuredPlan,
    context: SpendingContext
  ): PolicyViolation | null {
    const threshold = policy.rule.thresholdCents;
    if (!threshold) return null;

    const projectedSpend = context.weeklySpentCents + plan.totalMaxSpendCents;
    if (projectedSpend > threshold) {
      return {
        policyId: policy.policyId,
        policyName: policy.policyName,
        severity: policy.severity,
        message: `This transaction would exceed your weekly limit of $${(threshold / 100).toFixed(2)} (current: $${(context.weeklySpentCents / 100).toFixed(2)}, requested: $${(plan.totalMaxSpendCents / 100).toFixed(2)})`,
      };
    }
    return null;
  }

  /**
   * Check if plan would exceed monthly spending limit
   */
  private evaluateMonthlyLimit(
    policy: Policy,
    plan: StructuredPlan,
    context: SpendingContext
  ): PolicyViolation | null {
    const threshold = policy.rule.thresholdCents;
    if (!threshold) return null;

    const projectedSpend = context.monthlySpentCents + plan.totalMaxSpendCents;
    if (projectedSpend > threshold) {
      return {
        policyId: policy.policyId,
        policyName: policy.policyName,
        severity: policy.severity,
        message: `This transaction would exceed your monthly limit of $${(threshold / 100).toFixed(2)} (current: $${(context.monthlySpentCents / 100).toFixed(2)}, requested: $${(plan.totalMaxSpendCents / 100).toFixed(2)})`,
      };
    }
    return null;
  }

  /**
   * Check if all protocols used are in the allowed list
   */
  private evaluateAllowedProtocols(policy: Policy, plan: StructuredPlan): PolicyViolation | null {
    const allowedProtocols = policy.rule.protocols;
    if (!allowedProtocols || allowedProtocols.length === 0) return null;

    // Extract protocols from plan steps (assuming action contains protocol info)
    const usedProtocols = new Set<string>();
    for (const step of plan.steps) {
      // Check step metadata for protocol
      const metadata = step as { protocol?: string };
      if (metadata.protocol) {
        usedProtocols.add(metadata.protocol.toLowerCase());
      }
    }

    const disallowedProtocols = Array.from(usedProtocols).filter(
      (p) => !allowedProtocols.map((a) => a.toLowerCase()).includes(p)
    );

    if (disallowedProtocols.length > 0) {
      return {
        policyId: policy.policyId,
        policyName: policy.policyName,
        severity: policy.severity,
        message: `This plan uses protocols not in your allowed list: ${disallowedProtocols.join(", ")}`,
      };
    }
    return null;
  }

  /**
   * Check if plan contains blocked actions
   */
  private evaluateBlockedActions(policy: Policy, plan: StructuredPlan): PolicyViolation | null {
    const blockedActions = policy.rule.actions;
    if (!blockedActions || blockedActions.length === 0) return null;

    const blockedActionsLower = blockedActions.map((a) => a.toLowerCase());

    for (const step of plan.steps) {
      if (blockedActionsLower.includes(step.action.toLowerCase())) {
        return {
          policyId: policy.policyId,
          policyName: policy.policyName,
          severity: policy.severity,
          message: `Action "${step.action}" is blocked by your policy "${policy.policyName}"`,
        };
      }
    }
    return null;
  }

  /**
   * Check if current time is within allowed time window
   */
  private evaluateTimeWindow(policy: Policy): PolicyViolation | null {
    const { timeWindowStart, timeWindowEnd } = policy.rule;
    if (!timeWindowStart || !timeWindowEnd) return null;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = timeWindowStart.split(":").map(Number);
    const [endHour, endMinute] = timeWindowEnd.split(":").map(Number);
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    // Check if current time is within the blocked window
    let inBlockedWindow: boolean;
    if (startTime <= endTime) {
      // Normal range (e.g., 02:00 to 06:00)
      inBlockedWindow = currentTime >= startTime && currentTime <= endTime;
    } else {
      // Overnight range (e.g., 22:00 to 06:00)
      inBlockedWindow = currentTime >= startTime || currentTime <= endTime;
    }

    if (inBlockedWindow) {
      return {
        policyId: policy.policyId,
        policyName: policy.policyName,
        severity: policy.severity,
        message: `Operations are restricted during ${timeWindowStart} - ${timeWindowEnd}`,
      };
    }
    return null;
  }

  /**
   * Check if high-value transactions have simulation enabled
   */
  private evaluateSimulationRequired(policy: Policy, plan: StructuredPlan): PolicyViolation | null {
    const threshold = policy.rule.thresholdCents;
    if (!threshold) return null;

    if (plan.totalMaxSpendCents > threshold) {
      // Check if all steps requiring simulation have it enabled
      const stepsNeedingSimulation = plan.steps.filter(
        (s) => s.estimatedCost.maxSpendCents > threshold / plan.steps.length
      );
      const stepsWithoutSimulation = stepsNeedingSimulation.filter((s) => !s.simulationRequired);

      if (stepsWithoutSimulation.length > 0) {
        return {
          policyId: policy.policyId,
          policyName: policy.policyName,
          severity: policy.severity,
          message: `High-value transactions above $${(threshold / 100).toFixed(2)} should be simulated first. Enable simulation for safer execution.`,
        };
      }
    }
    return null;
  }

  /**
   * Check if slippage is within acceptable bounds
   */
  private evaluateMaxSlippage(policy: Policy, plan: StructuredPlan): PolicyViolation | null {
    const threshold = policy.rule.thresholdBps;
    if (!threshold) return null;

    for (const step of plan.steps) {
      if (step.estimatedCost.maxSlippageBps > threshold) {
        return {
          policyId: policy.policyId,
          policyName: policy.policyName,
          severity: policy.severity,
          message: `Step "${step.description}" has slippage of ${(step.estimatedCost.maxSlippageBps / 100).toFixed(2)}% which exceeds your maximum of ${(threshold / 100).toFixed(2)}%`,
        };
      }
    }
    return null;
  }

  /**
   * Check if plan contains high-risk actions
   */
  private hasHighRiskAction(plan: StructuredPlan): boolean {
    const highRiskActions = [
      "withdraw_defi",
      "transfer", // External transfers
      "swap", // Large swaps
    ];

    // Check if plan has high-risk actions with significant amounts
    for (const step of plan.steps) {
      if (highRiskActions.includes(step.action) && step.estimatedCost.riskLevel === "high") {
        return true;
      }
    }

    // Check for multiple high-risk steps
    const highRiskSteps = plan.steps.filter((s) => s.estimatedCost.riskLevel === "high");
    if (highRiskSteps.length >= 2) {
      return true;
    }

    return false;
  }

  /**
   * Calculate countdown duration based on transaction amount
   *
   * Formula: base + (amount_in_dollars / 10) * per_dollar, capped at max
   */
  private calculateCountdownDuration(amountCents: number, thresholds: ApprovalThresholds): number {
    const amountDollars = amountCents / 100;
    const additionalMs = Math.floor(amountDollars / 10) * thresholds.countdownPerDollarMs;
    const totalMs = thresholds.countdownBaseDurationMs + additionalMs;

    return Math.min(totalMs, thresholds.countdownMaxDurationMs);
  }

  /**
   * Create default user policies for a new user
   */
  createDefaultPolicies(userId: string): Policy[] {
    return [
      {
        policyId: uuidv4(),
        policyName: "Personal Daily Limit",
        policyType: "default",
        rule: {
          type: "daily_limit",
          thresholdCents: 200000, // $2,000
        },
        severity: "warning",
        isEnabled: true,
      },
      {
        policyId: uuidv4(),
        policyName: "Night Time Warning",
        policyType: "default",
        rule: {
          type: "time_window",
          timeWindowStart: "02:00",
          timeWindowEnd: "06:00",
        },
        severity: "warning",
        isEnabled: true,
      },
    ];
  }

  /**
   * Create default approval thresholds for a new user
   */
  createDefaultThresholds(): ApprovalThresholds {
    return {
      autoApproveMaxCents: this.config.defaultAutoApproveMaxCents,
      manualApproveMaxCents: this.config.defaultManualApproveMaxCents,
      countdownBaseDurationMs: this.config.defaultCountdownBaseDurationMs,
      countdownPerDollarMs: this.config.defaultCountdownPerDollarMs,
      countdownMaxDurationMs: this.config.defaultCountdownMaxDurationMs,
    };
  }

  /**
   * Get current system policies (read-only)
   */
  getSystemPolicies(): readonly Policy[] {
    return this.systemPolicies;
  }

  /**
   * Validate a user policy before saving
   */
  validatePolicy(policy: Partial<Policy>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!policy.policyName || policy.policyName.length < 1) {
      errors.push("Policy name is required");
    }

    if (!policy.rule?.type) {
      errors.push("Policy rule type is required");
    }

    if (policy.rule?.type === "max_transaction_value" && !policy.rule.thresholdCents) {
      errors.push("Threshold amount is required for max_transaction_value policy");
    }

    if (policy.rule?.type === "max_slippage" && !policy.rule.thresholdBps) {
      errors.push("Threshold basis points is required for max_slippage policy");
    }

    if (policy.rule?.type === "time_window") {
      if (!policy.rule.timeWindowStart || !policy.rule.timeWindowEnd) {
        errors.push("Start and end times are required for time_window policy");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton-friendly factory
export function createPolicyEngine(config?: Partial<PolicyEngineConfig>): PolicyEngine {
  return new PolicyEngine(config);
}
