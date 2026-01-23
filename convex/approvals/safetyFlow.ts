/**
 * Safety Flow Integration
 *
 * Integrates the four gates of the safety architecture:
 * Gate 1: Structured Plan Generation
 * Gate 2: Policy Engine Evaluation
 * Gate 3: Approval Flow (User/Auto)
 * Gate 4: Execution
 *
 * This module provides the main entry point for processing intents
 * through the safety pipeline.
 */

import { v } from "convex/values";
import { action, mutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

type RiskLevel = "low" | "medium" | "high" | "critical";

interface StructuredStep {
  stepId: string;
  sequence: number;
  action: string;
  description: string;
  estimatedCost: {
    maxSpendCents: number;
    maxSlippageBps: number;
    riskLevel: RiskLevel;
  };
  expectedOutcome: string;
  dependsOn: string[];
  requiresSoulVerification: boolean;
  requiresUserApproval: boolean;
  simulationRequired: boolean;
  status: "pending" | "approved" | "executing" | "completed" | "failed" | "skipped";
}

interface ParsedIntent {
  action: string;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  amount?: number;
  currency?: string;
  metadata?: any;
}

// ============================================================================
// Safety Flow Entry Point
// ============================================================================

/**
 * Process an intent through the full safety flow
 *
 * This is the main entry point that orchestrates:
 * 1. Circuit breaker check
 * 2. Structured plan creation
 * 3. Policy evaluation
 * 4. Approval creation with countdown/manual
 *
 * Returns the approval ID for the frontend to track.
 */
export const processIntentSafely = action({
  args: {
    intentId: v.id("intents"),
    userId: v.id("users"),
    parsedIntent: v.object({
      action: v.string(),
      sourceType: v.optional(v.string()),
      sourceId: v.optional(v.string()),
      targetType: v.optional(v.string()),
      targetId: v.optional(v.string()),
      amount: v.optional(v.number()),
      currency: v.optional(v.string()),
      metadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    planId?: Id<"executionPlans">;
    approvalId?: Id<"approvalQueue">;
    blocked?: boolean;
    blockReason?: string;
    approvalMode?: "auto" | "manual";
    countdownDurationMs?: number;
  }> => {
    console.log(`[SafetyFlow] Processing intent ${args.intentId} for user ${args.userId}`);

    // ========== Gate 0: Circuit Breaker Check ==========
    const breakerCheck = await ctx.runQuery(
      internal.circuitBreakers.circuitBreakers.checkBreakers,
      {
        userId: args.userId,
        actionType: args.parsedIntent.action,
      }
    );

    if (breakerCheck.blocked) {
      console.log(`[SafetyFlow] Blocked by circuit breaker`);
      return {
        success: false,
        blocked: true,
        blockReason: `Operation blocked by circuit breaker: ${breakerCheck.trippedBreakers.map((b: any) => b.breakerName).join(", ")}`,
      };
    }

    // ========== Gate 1: Create Structured Plan ==========
    const structuredPlan = createStructuredPlan(args.parsedIntent, args.userId, args.intentId);

    // Save the plan to database
    const planResult = await ctx.runMutation(internal.approvals.plans.createPlan, {
      intentId: args.intentId,
      userId: args.userId,
      planId: structuredPlan.planId,
      goalRecap: structuredPlan.goalRecap,
      steps: structuredPlan.steps,
      totalMaxSpendCents: structuredPlan.totalMaxSpendCents,
      totalEstimatedFeeCents: structuredPlan.totalEstimatedFeeCents,
      overallRiskLevel: structuredPlan.overallRiskLevel,
      expiresAt: structuredPlan.expiresAt,
    });

    console.log(`[SafetyFlow] Created plan ${planResult.planId}`);

    // ========== Gate 2: Policy Evaluation ==========
    // Get user policies
    const userPolicies = await ctx.runQuery(
      internal.approvals.policies.getEnabledPolicies,
      { userId: args.userId }
    );

    // Get spending context
    const spendingContext = await ctx.runQuery(
      internal.approvals.policies.getSpendingContext,
      { userId: args.userId }
    );

    // Get user thresholds
    const thresholds = await ctx.runQuery(
      internal.approvals.policies.getThresholds,
      { userId: args.userId }
    );

    // Evaluate policies
    const policyResult = evaluatePolicies(
      structuredPlan,
      userPolicies || [],
      spendingContext || { dailySpentCents: 0, weeklySpentCents: 0, monthlySpentCents: 0, lastResetAt: Date.now() },
      thresholds
    );

    // Update plan with policy result
    await ctx.runMutation(internal.approvals.plans.setPolicyResult, {
      planId: planResult.planId,
      policyResult: {
        approved: policyResult.approved,
        violations: policyResult.violations,
        evaluatedAt: policyResult.evaluatedAt,
      },
      approvalMode: policyResult.approvalMode,
      autoApproveCountdownMs: policyResult.countdownDurationMs,
    });

    // Check if blocked by policy
    if (policyResult.approvalMode === "blocked") {
      console.log(`[SafetyFlow] Blocked by policy`);

      // Log to audit
      await ctx.runMutation(internal.audit.auditLog.logEvent, {
        userId: args.userId,
        eventType: "policy_evaluated",
        intentId: args.intentId,
        planId: planResult.planId,
        eventData: {
          action: args.parsedIntent.action,
          amountCents: args.parsedIntent.amount,
          violations: policyResult.violations.map((v) => v.message),
        },
      });

      return {
        success: false,
        planId: planResult.planId,
        blocked: true,
        blockReason: policyResult.violations.find((v) => v.severity === "block")?.message ||
          "Blocked by policy",
      };
    }

    // ========== Gate 3: Create Approval ==========
    // Build preview for UI
    const preview = buildPreview(structuredPlan, policyResult.warnings);

    // Create approval entry
    const approvalResult = await ctx.runMutation(
      internal.approvals.approvals.createApproval,
      {
        userId: args.userId,
        planId: planResult.planId,
        intentId: args.intentId,
        preview,
        approvalMode: policyResult.approvalMode as "auto" | "manual",
        countdownDurationMs: policyResult.countdownDurationMs,
      }
    );

    console.log(`[SafetyFlow] Created approval ${approvalResult.approvalId} with mode ${policyResult.approvalMode}`);

    // Log to audit
    await ctx.runMutation(internal.audit.auditLog.logEvent, {
      userId: args.userId,
      eventType: policyResult.approvalMode === "auto" ? "countdown_started" : "approval_requested",
      intentId: args.intentId,
      planId: planResult.planId,
      approvalId: approvalResult.approvalId,
      eventData: {
        action: args.parsedIntent.action,
        amountCents: args.parsedIntent.amount,
      },
    });

    return {
      success: true,
      planId: planResult.planId,
      approvalId: approvalResult.approvalId,
      approvalMode: policyResult.approvalMode as "auto" | "manual",
      countdownDurationMs: policyResult.countdownDurationMs,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a structured plan from a parsed intent (Gate 1)
 */
function createStructuredPlan(
  intent: ParsedIntent,
  userId: string,
  intentId: string
): {
  planId: string;
  goalRecap: string;
  steps: StructuredStep[];
  totalMaxSpendCents: number;
  totalEstimatedFeeCents: number;
  overallRiskLevel: RiskLevel;
  expiresAt: number;
} {
  const planId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();
  const expiresAt = now + 30 * 60 * 1000; // 30 minutes

  const amount = intent.amount ?? 0;

  // Calculate risk level based on action and amount
  const riskLevel = calculateRiskLevel(intent.action, amount);

  // Build step(s)
  const steps: StructuredStep[] = [
    {
      stepId: `step-${Date.now()}-1`,
      sequence: 0,
      action: intent.action,
      description: buildActionDescription(intent),
      estimatedCost: {
        maxSpendCents: amount,
        maxSlippageBps: intent.action === "swap" ? 50 : 0,
        riskLevel,
      },
      expectedOutcome: buildExpectedOutcome(intent),
      dependsOn: [],
      requiresSoulVerification: requiresSoulVerification(intent.action),
      requiresUserApproval: riskLevel === "high" || riskLevel === "critical",
      simulationRequired: amount >= 100000, // $1,000+
      status: "pending",
    },
  ];

  // Estimate fees
  const totalEstimatedFeeCents = estimateFees(intent.action, amount);

  return {
    planId,
    goalRecap: buildGoalRecap(intent),
    steps,
    totalMaxSpendCents: amount,
    totalEstimatedFeeCents,
    overallRiskLevel: riskLevel,
    expiresAt,
  };
}

/**
 * Evaluate policies against a plan (Gate 2)
 */
function evaluatePolicies(
  plan: {
    totalMaxSpendCents: number;
    steps: StructuredStep[];
    overallRiskLevel: RiskLevel;
  },
  userPolicies: any[],
  spendingContext: {
    dailySpentCents: number;
    weeklySpentCents: number;
    monthlySpentCents: number;
    lastResetAt: number;
  },
  thresholds?: {
    autoApproveMaxCents?: number;
    manualApproveMaxCents?: number;
    countdownBaseDurationMs?: number;
    countdownPerDollarMs?: number;
    countdownMaxDurationMs?: number;
  }
): {
  approved: boolean;
  approvalMode: "auto" | "manual" | "blocked";
  violations: Array<{
    policyId: string;
    policyName: string;
    severity: "warning" | "block";
    message: string;
  }>;
  warnings: string[];
  countdownDurationMs?: number;
  evaluatedAt: number;
} {
  const violations: Array<{
    policyId: string;
    policyName: string;
    severity: "warning" | "block";
    message: string;
  }> = [];
  const warnings: string[] = [];

  // Default thresholds
  const autoApproveMax = thresholds?.autoApproveMaxCents ?? 10000; // $100
  const manualApproveMax = thresholds?.manualApproveMaxCents ?? 1000000; // $10,000
  const countdownBase = thresholds?.countdownBaseDurationMs ?? 5000;
  const countdownPerDollar = thresholds?.countdownPerDollarMs ?? 100;
  const countdownMax = thresholds?.countdownMaxDurationMs ?? 30000;

  const totalSpend = plan.totalMaxSpendCents;

  // System policy: Max single transaction ($10,000)
  if (totalSpend > 1000000) {
    violations.push({
      policyId: "system-max-single",
      policyName: "Maximum Single Transaction",
      severity: "block",
      message: `Transaction of $${(totalSpend / 100).toFixed(2)} exceeds maximum of $10,000`,
    });
  }

  // System policy: Daily limit ($50,000)
  const projectedDaily = spendingContext.dailySpentCents + totalSpend;
  if (projectedDaily > 5000000) {
    violations.push({
      policyId: "system-daily-limit",
      policyName: "Daily Spending Limit",
      severity: "block",
      message: `Would exceed daily limit of $50,000`,
    });
  }

  // Check for blocking violations
  const hasBlocker = violations.some((v) => v.severity === "block");
  if (hasBlocker) {
    return {
      approved: false,
      approvalMode: "blocked",
      violations,
      warnings: violations.filter((v) => v.severity === "warning").map((v) => v.message),
      evaluatedAt: Date.now(),
    };
  }

  // Determine approval mode based on amount
  let approvalMode: "auto" | "manual";
  let countdownDurationMs: number | undefined;

  if (totalSpend <= autoApproveMax) {
    approvalMode = "auto";
    // Calculate countdown: base + (dollars/10) * perDollar, max at cap
    const dollars = totalSpend / 100;
    const additional = Math.floor(dollars / 10) * (countdownPerDollar * 10);
    countdownDurationMs = Math.min(countdownBase + additional, countdownMax);
  } else if (totalSpend <= manualApproveMax) {
    approvalMode = "manual";
  } else {
    // Above manual threshold
    violations.push({
      policyId: "threshold-exceeded",
      policyName: "Approval Threshold Exceeded",
      severity: "block",
      message: `Transaction of $${(totalSpend / 100).toFixed(2)} exceeds maximum approval threshold`,
    });
    return {
      approved: false,
      approvalMode: "blocked",
      violations,
      warnings,
      evaluatedAt: Date.now(),
    };
  }

  // Force manual approval for high-risk plans
  if (plan.overallRiskLevel === "critical" || plan.overallRiskLevel === "high") {
    approvalMode = "manual";
    warnings.push("This transaction requires manual approval due to risk level.");
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
 * Build preview object for approval UI
 */
function buildPreview(
  plan: {
    goalRecap: string;
    steps: StructuredStep[];
    totalMaxSpendCents: number;
    totalEstimatedFeeCents: number;
  },
  warnings: string[]
): {
  goalRecap: string;
  stepsPreview: Array<{ description: string; estimatedCostUsd: string; riskLevel: string }>;
  totalMaxSpendUsd: string;
  estimatedFeesUsd: string;
  expectedOutcome: string;
  warnings: string[];
} {
  return {
    goalRecap: plan.goalRecap,
    stepsPreview: plan.steps.map((step) => ({
      description: step.description,
      estimatedCostUsd: `$${(step.estimatedCost.maxSpendCents / 100).toFixed(2)}`,
      riskLevel: step.estimatedCost.riskLevel,
    })),
    totalMaxSpendUsd: `$${(plan.totalMaxSpendCents / 100).toFixed(2)}`,
    estimatedFeesUsd: `$${(plan.totalEstimatedFeeCents / 100).toFixed(2)}`,
    expectedOutcome: plan.steps[plan.steps.length - 1]?.expectedOutcome || "Transaction will be executed",
    warnings,
  };
}

/**
 * Calculate risk level based on action and amount
 */
function calculateRiskLevel(action: string, amountCents: number): RiskLevel {
  const highRiskActions = ["withdraw_defi", "transfer"];
  const mediumRiskActions = ["swap", "fund_card"];

  if (amountCents >= 500000) return "critical"; // $5,000+

  if (highRiskActions.includes(action)) {
    if (amountCents >= 100000) return "high"; // $1,000+
    return "medium";
  }

  if (mediumRiskActions.includes(action)) {
    if (amountCents >= 100000) return "medium"; // $1,000+
    return "low";
  }

  return "low";
}

/**
 * Check if action requires Soul verification
 */
function requiresSoulVerification(action: string): boolean {
  const soulRequiredActions = ["transfer", "withdraw_defi", "fund_card", "swap"];
  return soulRequiredActions.includes(action);
}

/**
 * Estimate transaction fees
 */
function estimateFees(action: string, amountCents: number): number {
  // Network fee estimate
  let fees = 5; // ~$0.05 base

  // Platform fee for transfers
  if (action === "transfer" || action === "fund_card") {
    fees += Math.ceil(amountCents * 0.003); // 0.3%
  }

  // Swap fee
  if (action === "swap") {
    fees += Math.ceil(amountCents * 0.0025); // 0.25%
  }

  return fees;
}

/**
 * Build human-readable goal recap
 */
function buildGoalRecap(intent: ParsedIntent): string {
  const amount = intent.amount ? `$${(intent.amount / 100).toFixed(2)}` : "";

  switch (intent.action) {
    case "fund_card":
      return `Fund your card with ${amount}`;
    case "transfer":
      return `Send ${amount} to ${intent.targetId || "recipient"}`;
    case "swap":
      return `Swap ${amount} ${intent.currency || ""}`;
    case "create_card":
      return "Create a new virtual card";
    case "freeze_card":
      return "Freeze your card";
    case "withdraw_defi":
      return `Withdraw ${amount} from DeFi`;
    default:
      return `Execute ${intent.action}${amount ? ` for ${amount}` : ""}`;
  }
}

/**
 * Build action description
 */
function buildActionDescription(intent: ParsedIntent): string {
  const amount = intent.amount ? `$${(intent.amount / 100).toFixed(2)}` : "";

  switch (intent.action) {
    case "fund_card":
      return `Add ${amount} to card`;
    case "transfer":
      return `Transfer ${amount}`;
    case "swap":
      return `Swap ${amount} ${intent.currency || ""}`;
    case "create_card":
      return "Create virtual card";
    case "freeze_card":
      return "Freeze card";
    case "withdraw_defi":
      return `Withdraw ${amount} from DeFi`;
    default:
      return `Execute ${intent.action}`;
  }
}

/**
 * Build expected outcome
 */
function buildExpectedOutcome(intent: ParsedIntent): string {
  const amount = intent.amount ? `$${(intent.amount / 100).toFixed(2)}` : "";

  switch (intent.action) {
    case "fund_card":
      return `Your card will be funded with ${amount}`;
    case "transfer":
      return `${amount} will be sent to the recipient`;
    case "swap":
      return "Tokens will be swapped at market rate";
    case "create_card":
      return "New card will be created";
    case "freeze_card":
      return "Card will be frozen";
    case "withdraw_defi":
      return `${amount} will be withdrawn`;
    default:
      return "Operation will be completed";
  }
}
