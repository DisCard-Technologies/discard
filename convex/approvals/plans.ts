/**
 * Execution Plans Module
 *
 * Manages structured execution plans created from intents.
 * This is Gate 1 output storage and management.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Type Validators
// ============================================================================

const estimatedCostValidator = v.object({
  maxSpendCents: v.number(),
  maxSlippageBps: v.number(),
  riskLevel: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("critical")
  ),
});

const stepValidator = v.object({
  stepId: v.string(),
  sequence: v.number(),
  action: v.string(),
  description: v.string(),
  estimatedCost: estimatedCostValidator,
  expectedOutcome: v.string(),
  dependsOn: v.array(v.string()),
  requiresSoulVerification: v.boolean(),
  requiresUserApproval: v.boolean(),
  simulationRequired: v.boolean(),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("executing"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("skipped")
  ),
});

const policyResultValidator = v.object({
  approved: v.boolean(),
  violations: v.array(v.object({
    policyId: v.string(),
    policyName: v.string(),
    severity: v.union(v.literal("warning"), v.literal("block")),
    message: v.string(),
  })),
  evaluatedAt: v.number(),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get a plan by ID
 */
export const getPlan = internalQuery({
  args: { planId: v.id("executionPlans") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.planId);
  },
});

/**
 * Get plan by external plan ID
 */
export const getByPlanId = query({
  args: { planId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("executionPlans")
      .withIndex("by_plan_id", (q) => q.eq("planId", args.planId))
      .first();
  },
});

/**
 * Get plan by intent ID
 */
export const getByIntentId = query({
  args: { intentId: v.id("intents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("executionPlans")
      .withIndex("by_intent", (q) => q.eq("intentId", args.intentId))
      .first();
  },
});

/**
 * Get plans for a user
 */
export const listByUser = query({
  args: {
    userId: v.id("users"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.status) {
      return await ctx.db
        .query("executionPlans")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", args.userId).eq("status", args.status as any)
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("executionPlans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new execution plan (internal version for safety flow)
 */
export const createPlan = internalMutation({
  args: {
    intentId: v.id("intents"),
    userId: v.id("users"),
    planId: v.string(),
    goalRecap: v.string(),
    steps: v.array(stepValidator),
    totalMaxSpendCents: v.number(),
    totalEstimatedFeeCents: v.number(),
    overallRiskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const id = await ctx.db.insert("executionPlans", {
      intentId: args.intentId,
      userId: args.userId,
      planId: args.planId,
      goalRecap: args.goalRecap,
      steps: args.steps,
      totalMaxSpendCents: args.totalMaxSpendCents,
      totalEstimatedFeeCents: args.totalEstimatedFeeCents,
      overallRiskLevel: args.overallRiskLevel,
      status: "draft",
      approvalMode: "manual", // Will be set by policy engine
      createdAt: now,
      expiresAt: args.expiresAt,
    });

    return { planId: id };
  },
});

/**
 * Update plan status
 */
export const updatePlanStatus = internalMutation({
  args: {
    planId: v.id("executionPlans"),
    status: v.union(
      v.literal("draft"),
      v.literal("policy_review"),
      v.literal("policy_rejected"),
      v.literal("awaiting_approval"),
      v.literal("approved"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    approvedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: any = { status: args.status };

    if (args.approvedAt) {
      updates.approvedAt = args.approvedAt;
    }

    if (args.completedAt) {
      updates.completedAt = args.completedAt;
    }

    await ctx.db.patch(args.planId, updates);
  },
});

/**
 * Set policy evaluation result (internal)
 */
export const setPolicyResult = internalMutation({
  args: {
    planId: v.id("executionPlans"),
    policyResult: policyResultValidator,
    approvalMode: v.union(v.literal("auto"), v.literal("manual"), v.literal("blocked")),
    autoApproveCountdownMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const status = args.approvalMode === "blocked" ? "policy_rejected" : "awaiting_approval";

    await ctx.db.patch(args.planId, {
      policyResult: args.policyResult,
      approvalMode: args.approvalMode,
      autoApproveCountdownMs: args.autoApproveCountdownMs,
      status,
    });
  },
});

/**
 * Update step status
 */
export const updateStepStatus = mutation({
  args: {
    planId: v.id("executionPlans"),
    stepId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);

    if (!plan) {
      throw new Error("Plan not found");
    }

    const updatedSteps = plan.steps.map((step) => {
      if (step.stepId === args.stepId) {
        return { ...step, status: args.status };
      }
      return step;
    });

    await ctx.db.patch(args.planId, { steps: updatedSteps });
  },
});

/**
 * Clean up expired plans
 */
export const cleanupExpiredPlans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find plans in non-terminal states that have expired
    const allPlans = await ctx.db.query("executionPlans").collect();

    const expiredPlans = allPlans.filter(
      (plan) =>
        plan.expiresAt < now &&
        !["completed", "failed", "cancelled", "policy_rejected"].includes(plan.status)
    );

    for (const plan of expiredPlans) {
      await ctx.db.patch(plan._id, { status: "cancelled" });
    }

    console.log(`[Plans] Expired ${expiredPlans.length} plans`);
    return { expiredCount: expiredPlans.length };
  },
});
