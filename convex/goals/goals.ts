/**
 * DisCard 2035 - Goals Mutations & Queries
 *
 * CRUD operations for user savings goals and strategies.
 * Integrates with AI intent system for natural language goal creation.
 */

import { v } from "convex/values";
import { mutation, query, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

type GoalType = "savings" | "accumulate" | "yield" | "custom";
type GoalStatus = "active" | "completed" | "cancelled";

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new goal
 */
export const create = mutation({
  args: {
    title: v.string(),
    type: v.union(
      v.literal("savings"),
      v.literal("accumulate"),
      v.literal("yield"),
      v.literal("custom")
    ),
    targetAmount: v.number(),
    targetToken: v.optional(v.string()),
    currentAmount: v.optional(v.number()),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const goalId = await ctx.db.insert("goals", {
      userId: user._id,
      title: args.title,
      type: args.type,
      targetAmount: args.targetAmount,
      targetToken: args.targetToken,
      currentAmount: args.currentAmount ?? 0,
      deadline: args.deadline,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return goalId;
  },
});

/**
 * Update goal progress
 */
export const updateProgress = mutation({
  args: {
    goalId: v.id("goals"),
    currentAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    // Calculate previous and new progress percentages
    const previousPercentage = goal.targetAmount > 0
      ? Math.floor((goal.currentAmount / goal.targetAmount) * 100)
      : 0;
    const newPercentage = goal.targetAmount > 0
      ? Math.floor((args.currentAmount / goal.targetAmount) * 100)
      : 0;

    // Check if goal is now complete
    const isComplete = args.currentAmount >= goal.targetAmount;

    await ctx.db.patch(args.goalId, {
      currentAmount: args.currentAmount,
      status: isComplete ? "completed" : "active",
      updatedAt: Date.now(),
    });

    // Check for milestone crossings and send notifications
    // Milestones: 25%, 50%, 75%, 90%, 100%
    const milestones = [25, 50, 75, 90, 100];
    let milestoneReached: number | null = null;

    for (const milestone of milestones) {
      if (previousPercentage < milestone && newPercentage >= milestone) {
        milestoneReached = milestone;
        // Don't break - we want the highest milestone reached
      }
    }

    // Send notification if a milestone was crossed
    if (milestoneReached !== null) {
      await ctx.scheduler.runAfter(0, internal.notifications.send.sendGoalMilestone, {
        userId: goal.userId,
        goalId: args.goalId,
        goalTitle: goal.title,
        milestonePercentage: milestoneReached,
        currentAmount: args.currentAmount,
        targetAmount: goal.targetAmount,
        isComplete,
      });
    }

    return { completed: isComplete, milestoneReached };
  },
});

/**
 * Update goal details
 */
export const update = mutation({
  args: {
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    targetAmount: v.optional(v.number()),
    targetToken: v.optional(v.string()),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    const updates: Partial<Doc<"goals">> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;
    if (args.targetAmount !== undefined) updates.targetAmount = args.targetAmount;
    if (args.targetToken !== undefined) updates.targetToken = args.targetToken;
    if (args.deadline !== undefined) updates.deadline = args.deadline;

    await ctx.db.patch(args.goalId, updates);
  },
});

/**
 * Mark goal as completed
 */
export const complete = mutation({
  args: {
    goalId: v.id("goals"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    await ctx.db.patch(args.goalId, {
      status: "completed",
      currentAmount: goal.targetAmount,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Cancel a goal
 */
export const cancel = mutation({
  args: {
    goalId: v.id("goals"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    await ctx.db.patch(args.goalId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a goal
 */
export const remove = mutation({
  args: {
    goalId: v.id("goals"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    await ctx.db.delete(args.goalId);
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all active goals for the current user
 */
export const list = query({
  args: {
    includeCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    let goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter out completed/cancelled unless requested
    if (!args.includeCompleted) {
      goals = goals.filter((g) => g.status === "active");
    }

    // Sort by creation date (newest first)
    return goals.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Get a single goal by ID
 */
export const get = query({
  args: {
    goalId: v.id("goals"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.goalId);
  },
});

// ============================================================================
// Internal Queries (for AI solver)
// ============================================================================

/**
 * Get all goals for a user by userId (internal use for AI context)
 */
export const listByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .collect();

    return goals.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ============================================================================
// Automation & Time-Bound Goals (Safety Architecture Phase 2)
// ============================================================================

/**
 * Enable automation for a goal
 */
export const enableAutomation = mutation({
  args: {
    goalId: v.id("goals"),
    config: v.object({
      triggerType: v.union(
        v.literal("schedule"),
        v.literal("price_target"),
        v.literal("balance_threshold")
      ),
      scheduleInterval: v.optional(v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly")
      )),
      priceTargetUsd: v.optional(v.number()),
      balanceThresholdCents: v.optional(v.number()),
      maxSingleAmountCents: v.optional(v.number()),
      sourceWalletId: v.optional(v.id("wallets")),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    const now = Date.now();

    // Calculate next automated trigger time
    let nextAutomatedAt: number | undefined;
    if (args.config.triggerType === "schedule" && args.config.scheduleInterval) {
      const intervalMs = {
        daily: 24 * 60 * 60 * 1000,
        weekly: 7 * 24 * 60 * 60 * 1000,
        monthly: 30 * 24 * 60 * 60 * 1000,
      };
      nextAutomatedAt = now + intervalMs[args.config.scheduleInterval];
    }

    await ctx.db.patch(args.goalId, {
      automationEnabled: true,
      automationConfig: args.config,
      nextAutomatedAt,
      lastApprovedAt: now,
      nextReapprovalAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
      requiresReapproval: true,
      reapprovalIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      updatedAt: now,
    });

    return { success: true, nextAutomatedAt };
  },
});

/**
 * Disable automation for a goal
 */
export const disableAutomation = mutation({
  args: {
    goalId: v.id("goals"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    await ctx.db.patch(args.goalId, {
      automationEnabled: false,
      nextAutomatedAt: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Reapprove a goal (reset the reapproval timer)
 */
export const reapprove = mutation({
  args: {
    goalId: v.id("goals"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    const now = Date.now();
    const reapprovalInterval = goal.reapprovalIntervalMs ?? 30 * 24 * 60 * 60 * 1000;

    await ctx.db.patch(args.goalId, {
      lastApprovedAt: now,
      nextReapprovalAt: now + reapprovalInterval,
      updatedAt: now,
    });

    return { success: true, nextReapprovalAt: now + reapprovalInterval };
  },
});

/**
 * Set auto-expiry for a goal
 */
export const setAutoExpiry = mutation({
  args: {
    goalId: v.id("goals"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new Error("Goal not found");
    }

    await ctx.db.patch(args.goalId, {
      autoExpireAt: args.expiresAt,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Get goals requiring reapproval
 */
export const listRequiringReapproval = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    const now = Date.now();

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .collect();

    // Filter goals that need reapproval
    return goals.filter(
      (g) =>
        g.requiresReapproval &&
        g.nextReapprovalAt &&
        g.nextReapprovalAt <= now
    );
  },
});

/**
 * Get goals with automation enabled
 */
export const listAutomated = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .collect();

    return goals.filter((g) => g.automationEnabled);
  },
});
