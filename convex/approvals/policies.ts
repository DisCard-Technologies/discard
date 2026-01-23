/**
 * User Policies Module
 *
 * Manages user-defined and default policies for the safety architecture.
 * Also manages approval thresholds and spending context.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Type Validators
// ============================================================================

const policyRuleValidator = v.object({
  type: v.union(
    v.literal("max_transaction_value"),
    v.literal("daily_limit"),
    v.literal("weekly_limit"),
    v.literal("monthly_limit"),
    v.literal("allowed_protocols"),
    v.literal("blocked_actions"),
    v.literal("time_window"),
    v.literal("simulation_required"),
    v.literal("max_slippage")
  ),
  thresholdCents: v.optional(v.number()),
  thresholdBps: v.optional(v.number()),
  protocols: v.optional(v.array(v.string())),
  actions: v.optional(v.array(v.string())),
  timeWindowStart: v.optional(v.string()),
  timeWindowEnd: v.optional(v.string()),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all policies for a user
 */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userPolicies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get enabled policies for a user
 */
export const getEnabledPolicies = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userPolicies")
      .withIndex("by_user_enabled", (q) =>
        q.eq("userId", args.userId).eq("isEnabled", true)
      )
      .collect();
  },
});

/**
 * Get user's spending context
 */
export const getSpendingContext = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get user's Turnkey organization for velocity tracking
    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!turnkeyOrg) {
      return {
        dailySpentCents: 0,
        weeklySpentCents: 0,
        monthlySpentCents: 0,
        lastResetAt: Date.now(),
      };
    }

    // Check if we need to reset daily spending
    const now = Date.now();
    const lastReset = turnkeyOrg.policies.currentSpending.lastResetAt;
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    let daily = turnkeyOrg.policies.currentSpending.daily;
    let weekly = turnkeyOrg.policies.currentSpending.weekly;
    let monthly = turnkeyOrg.policies.currentSpending.monthly;

    // Reset if needed
    if (now - lastReset > dayMs) {
      daily = 0;
    }
    if (now - lastReset > weekMs) {
      weekly = 0;
    }
    if (now - lastReset > monthMs) {
      monthly = 0;
    }

    return {
      dailySpentCents: daily,
      weeklySpentCents: weekly,
      monthlySpentCents: monthly,
      lastResetAt: lastReset,
    };
  },
});

/**
 * Get user's approval thresholds
 */
export const getThresholds = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const thresholds = await ctx.db
      .query("approvalThresholds")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!thresholds) {
      // Return defaults
      return {
        autoApproveMaxCents: 10000, // $100
        manualApproveMaxCents: 1000000, // $10,000
        countdownBaseDurationMs: 5000, // 5 seconds
        countdownPerDollarMs: 100, // 1 sec per $10
        countdownMaxDurationMs: 30000, // 30 seconds
      };
    }

    return thresholds;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Initialize default policies for a new user
 */
export const initializeForUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if user already has policies
    const existing = await ctx.db
      .query("userPolicies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      return { created: 0, message: "User already has policies" };
    }

    // Create default policies
    const defaultPolicies = [
      {
        policyId: `policy-daily-${Date.now()}`,
        policyName: "Personal Daily Limit",
        policyType: "default" as const,
        rule: {
          type: "daily_limit" as const,
          thresholdCents: 200000, // $2,000
        },
        severity: "warning" as const,
        isEnabled: true,
      },
      {
        policyId: `policy-night-${Date.now()}`,
        policyName: "Night Time Warning",
        policyType: "default" as const,
        rule: {
          type: "time_window" as const,
          timeWindowStart: "02:00",
          timeWindowEnd: "06:00",
        },
        severity: "warning" as const,
        isEnabled: true,
      },
    ];

    for (const policy of defaultPolicies) {
      await ctx.db.insert("userPolicies", {
        userId: args.userId,
        ...policy,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { created: defaultPolicies.length, message: "Default policies created" };
  },
});

/**
 * Create a custom policy
 */
export const createPolicy = mutation({
  args: {
    userId: v.id("users"),
    policyName: v.string(),
    rule: policyRuleValidator,
    severity: v.union(v.literal("warning"), v.literal("block")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const policyId = `policy-${now}-${Math.random().toString(36).substr(2, 6)}`;

    const id = await ctx.db.insert("userPolicies", {
      userId: args.userId,
      policyId,
      policyName: args.policyName,
      policyType: "user",
      rule: args.rule,
      severity: args.severity,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    });

    return { policyId, id };
  },
});

/**
 * Update a policy
 */
export const updatePolicy = mutation({
  args: {
    userId: v.id("users"),
    policyId: v.string(),
    policyName: v.optional(v.string()),
    rule: v.optional(policyRuleValidator),
    severity: v.optional(v.union(v.literal("warning"), v.literal("block"))),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const policies = await ctx.db
      .query("userPolicies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const policy = policies.find((p) => p.policyId === args.policyId);

    if (!policy) {
      throw new Error(`Policy ${args.policyId} not found`);
    }

    // Don't allow modifying system policies
    if (policy.policyType === "system") {
      throw new Error("Cannot modify system policies");
    }

    const updates: any = { updatedAt: Date.now() };

    if (args.policyName !== undefined) updates.policyName = args.policyName;
    if (args.rule !== undefined) updates.rule = args.rule;
    if (args.severity !== undefined) updates.severity = args.severity;
    if (args.isEnabled !== undefined) updates.isEnabled = args.isEnabled;

    await ctx.db.patch(policy._id, updates);

    return { success: true };
  },
});

/**
 * Delete a custom policy
 */
export const deletePolicy = mutation({
  args: {
    userId: v.id("users"),
    policyId: v.string(),
  },
  handler: async (ctx, args) => {
    const policies = await ctx.db
      .query("userPolicies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const policy = policies.find((p) => p.policyId === args.policyId);

    if (!policy) {
      throw new Error(`Policy ${args.policyId} not found`);
    }

    // Don't allow deleting system or default policies
    if (policy.policyType !== "user") {
      throw new Error("Can only delete user-created policies");
    }

    await ctx.db.delete(policy._id);

    return { success: true };
  },
});

/**
 * Initialize approval thresholds for a user
 */
export const initializeThresholds = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Check if user already has thresholds
    const existing = await ctx.db
      .query("approvalThresholds")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      return { created: false, message: "User already has thresholds" };
    }

    const now = Date.now();

    await ctx.db.insert("approvalThresholds", {
      userId: args.userId,
      autoApproveMaxCents: 10000, // $100
      manualApproveMaxCents: 1000000, // $10,000
      countdownBaseDurationMs: 5000,
      countdownPerDollarMs: 100,
      countdownMaxDurationMs: 30000,
      createdAt: now,
      updatedAt: now,
    });

    return { created: true, message: "Thresholds created" };
  },
});

/**
 * Update approval thresholds
 */
export const updateThresholds = mutation({
  args: {
    userId: v.id("users"),
    autoApproveMaxCents: v.optional(v.number()),
    manualApproveMaxCents: v.optional(v.number()),
    countdownBaseDurationMs: v.optional(v.number()),
    countdownPerDollarMs: v.optional(v.number()),
    countdownMaxDurationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("approvalThresholds")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const updates: any = { updatedAt: Date.now() };

    if (args.autoApproveMaxCents !== undefined) {
      updates.autoApproveMaxCents = args.autoApproveMaxCents;
    }
    if (args.manualApproveMaxCents !== undefined) {
      updates.manualApproveMaxCents = args.manualApproveMaxCents;
    }
    if (args.countdownBaseDurationMs !== undefined) {
      updates.countdownBaseDurationMs = args.countdownBaseDurationMs;
    }
    if (args.countdownPerDollarMs !== undefined) {
      updates.countdownPerDollarMs = args.countdownPerDollarMs;
    }
    if (args.countdownMaxDurationMs !== undefined) {
      updates.countdownMaxDurationMs = args.countdownMaxDurationMs;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updates);
    } else {
      await ctx.db.insert("approvalThresholds", {
        userId: args.userId,
        autoApproveMaxCents: args.autoApproveMaxCents ?? 10000,
        manualApproveMaxCents: args.manualApproveMaxCents ?? 1000000,
        countdownBaseDurationMs: args.countdownBaseDurationMs ?? 5000,
        countdownPerDollarMs: args.countdownPerDollarMs ?? 100,
        countdownMaxDurationMs: args.countdownMaxDurationMs ?? 30000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Record a transaction for spending tracking
 */
export const recordSpending = internalMutation({
  args: {
    userId: v.id("users"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!turnkeyOrg) {
      console.log("[Policies] No Turnkey org found for user, skipping spending record");
      return;
    }

    const now = Date.now();
    const currentSpending = turnkeyOrg.policies.currentSpending;

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        currentSpending: {
          daily: currentSpending.daily + args.amountCents,
          weekly: currentSpending.weekly + args.amountCents,
          monthly: currentSpending.monthly + args.amountCents,
          lastResetAt: currentSpending.lastResetAt,
        },
      },
      lastActivityAt: now,
      totalTransactionsCount: turnkeyOrg.totalTransactionsCount + 1,
      totalTransactionsVolume: turnkeyOrg.totalTransactionsVolume + args.amountCents,
      updatedAt: now,
    });
  },
});
