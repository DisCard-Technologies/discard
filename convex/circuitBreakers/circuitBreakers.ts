/**
 * Circuit Breakers Module
 *
 * Kill switches for emergency operation control.
 * Allows users and the system to instantly halt operations.
 *
 * Breaker types:
 * - global: Pause ALL operations for a user
 * - action_type: Pause specific action types (fund_card, transfer, etc.)
 * - goal: Pause specific goal's automation
 * - protocol: Pause specific protocol interactions
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ============================================================================
// Type Validators
// ============================================================================

const breakerTypeValidator = v.union(
  v.literal("global"),
  v.literal("action_type"),
  v.literal("goal"),
  v.literal("protocol")
);

const scopeValidator = v.optional(v.object({
  actionType: v.optional(v.string()),
  goalId: v.optional(v.id("goals")),
  protocol: v.optional(v.string()),
}));

// ============================================================================
// Default Breaker Configurations
// ============================================================================

const DEFAULT_BREAKERS = [
  {
    breakerId: "global-kill-switch",
    breakerName: "Global Kill Switch",
    breakerType: "global" as const,
    scope: undefined,
  },
  {
    breakerId: "action-fund-card",
    breakerName: "Fund Card Actions",
    breakerType: "action_type" as const,
    scope: { actionType: "fund_card" },
  },
  {
    breakerId: "action-transfer",
    breakerName: "Transfer Actions",
    breakerType: "action_type" as const,
    scope: { actionType: "transfer" },
  },
  {
    breakerId: "action-swap",
    breakerName: "Swap Actions",
    breakerType: "action_type" as const,
    scope: { actionType: "swap" },
  },
  {
    breakerId: "action-withdraw-defi",
    breakerName: "DeFi Withdrawal Actions",
    breakerType: "action_type" as const,
    scope: { actionType: "withdraw_defi" },
  },
];

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all circuit breakers for a user
 */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get a specific breaker by ID
 */
export const getBreaker = query({
  args: {
    userId: v.id("users"),
    breakerId: v.string(),
  },
  handler: async (ctx, args) => {
    const breakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return breakers.find((b) => b.breakerId === args.breakerId) ?? null;
  },
});

/**
 * Get all tripped breakers for a user
 */
export const getTrippedBreakers = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const breakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return breakers.filter((b) => b.isTripped);
  },
});

/**
 * Check if any breaker would block an action
 */
export const checkBreakers = internalQuery({
  args: {
    userId: v.id("users"),
    actionType: v.string(),
    goalId: v.optional(v.id("goals")),
    protocol: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const breakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const trippedBreakers = breakers.filter((b) => b.isTripped);

    if (trippedBreakers.length === 0) {
      return { blocked: false, trippedBreakers: [] };
    }

    // Check each tripped breaker
    const blockingBreakers: typeof trippedBreakers = [];

    for (const breaker of trippedBreakers) {
      // Global breaker blocks everything
      if (breaker.breakerType === "global") {
        blockingBreakers.push(breaker);
        continue;
      }

      // Action type breaker
      if (
        breaker.breakerType === "action_type" &&
        breaker.scope?.actionType === args.actionType
      ) {
        blockingBreakers.push(breaker);
        continue;
      }

      // Goal breaker
      if (
        breaker.breakerType === "goal" &&
        args.goalId &&
        breaker.scope?.goalId === args.goalId
      ) {
        blockingBreakers.push(breaker);
        continue;
      }

      // Protocol breaker
      if (
        breaker.breakerType === "protocol" &&
        args.protocol &&
        breaker.scope?.protocol === args.protocol
      ) {
        blockingBreakers.push(breaker);
        continue;
      }
    }

    return {
      blocked: blockingBreakers.length > 0,
      trippedBreakers: blockingBreakers.map((b) => ({
        breakerId: b.breakerId,
        breakerName: b.breakerName,
        breakerType: b.breakerType,
        tripReason: b.tripReason,
      })),
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Initialize default breakers for a new user
 */
export const initializeForUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if user already has breakers
    const existing = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      return { created: 0, message: "User already has breakers initialized" };
    }

    // Create default breakers
    for (const breaker of DEFAULT_BREAKERS) {
      await ctx.db.insert("circuitBreakers", {
        userId: args.userId,
        breakerId: breaker.breakerId,
        breakerName: breaker.breakerName,
        breakerType: breaker.breakerType,
        scope: breaker.scope,
        isTripped: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { created: DEFAULT_BREAKERS.length, message: "Default breakers created" };
  },
});

/**
 * Trip (activate) a circuit breaker - emergency stop
 */
export const tripBreaker = mutation({
  args: {
    userId: v.id("users"),
    breakerId: v.string(),
    reason: v.optional(v.string()),
    trippedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const breakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const breaker = breakers.find((b) => b.breakerId === args.breakerId);

    if (!breaker) {
      throw new Error(`Breaker ${args.breakerId} not found`);
    }

    if (breaker.isTripped) {
      return { success: true, message: "Breaker already tripped" };
    }

    const now = Date.now();

    await ctx.db.patch(breaker._id, {
      isTripped: true,
      trippedAt: now,
      trippedBy: args.trippedBy ?? "user",
      tripReason: args.reason ?? "Manual trip by user",
      updatedAt: now,
    });

    // Log to audit via proper hash-chained pipeline
    await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
      userId: args.userId,
      eventType: "breaker_tripped",
      eventData: {
        action: args.breakerId,
        reason: args.reason,
        metadata: { trippedBy: args.trippedBy ?? "user" },
      },
    });

    return { success: true, message: `Breaker ${breaker.breakerName} tripped` };
  },
});

/**
 * Reset (deactivate) a circuit breaker - resume operations
 */
export const resetBreaker = mutation({
  args: {
    userId: v.id("users"),
    breakerId: v.string(),
  },
  handler: async (ctx, args) => {
    const breakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const breaker = breakers.find((b) => b.breakerId === args.breakerId);

    if (!breaker) {
      throw new Error(`Breaker ${args.breakerId} not found`);
    }

    if (!breaker.isTripped) {
      return { success: true, message: "Breaker not tripped" };
    }

    const now = Date.now();

    await ctx.db.patch(breaker._id, {
      isTripped: false,
      trippedAt: undefined,
      trippedBy: undefined,
      tripReason: undefined,
      updatedAt: now,
    });

    // Log to audit via proper hash-chained pipeline
    await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
      userId: args.userId,
      eventType: "breaker_reset",
      eventData: {
        action: args.breakerId,
        metadata: {},
      },
    });

    return { success: true, message: `Breaker ${breaker.breakerName} reset` };
  },
});

/**
 * Create a custom circuit breaker
 */
export const createBreaker = mutation({
  args: {
    userId: v.id("users"),
    breakerName: v.string(),
    breakerType: breakerTypeValidator,
    scope: scopeValidator,
    autoResetAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const breakerId = `custom-${now}-${Math.random().toString(36).substr(2, 6)}`;

    const id = await ctx.db.insert("circuitBreakers", {
      userId: args.userId,
      breakerId,
      breakerName: args.breakerName,
      breakerType: args.breakerType,
      scope: args.scope,
      isTripped: false,
      autoResetAfterMs: args.autoResetAfterMs,
      createdAt: now,
      updatedAt: now,
    });

    return { breakerId, id };
  },
});

/**
 * Delete a custom circuit breaker
 */
export const deleteBreaker = mutation({
  args: {
    userId: v.id("users"),
    breakerId: v.string(),
  },
  handler: async (ctx, args) => {
    // Don't allow deleting default breakers
    const isDefault = DEFAULT_BREAKERS.some((b) => b.breakerId === args.breakerId);
    if (isDefault) {
      throw new Error("Cannot delete default breakers");
    }

    const breakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const breaker = breakers.find((b) => b.breakerId === args.breakerId);

    if (!breaker) {
      throw new Error(`Breaker ${args.breakerId} not found`);
    }

    await ctx.db.delete(breaker._id);

    return { success: true, message: "Breaker deleted" };
  },
});

/**
 * Trip the global kill switch - emergency stop all operations
 */
export const emergencyStop = mutation({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const breakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const globalBreaker = breakers.find((b) => b.breakerType === "global");

    if (!globalBreaker) {
      throw new Error("Global breaker not found. Initialize breakers first.");
    }

    if (globalBreaker.isTripped) {
      return { success: true, message: "Emergency stop already active" };
    }

    const now = Date.now();

    await ctx.db.patch(globalBreaker._id, {
      isTripped: true,
      trippedAt: now,
      trippedBy: "emergency",
      tripReason: args.reason ?? "Emergency stop activated",
      updatedAt: now,
    });

    return {
      success: true,
      message: "EMERGENCY STOP ACTIVATED - All operations paused",
    };
  },
});

/**
 * Process auto-reset for breakers with auto-reset configured
 */
export const processAutoResets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find all tripped breakers with auto-reset
    const allBreakers = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_tripped", (q) => q.eq("isTripped", true))
      .collect();

    const toReset = allBreakers.filter(
      (b) =>
        b.autoResetAfterMs &&
        b.trippedAt &&
        now - b.trippedAt >= b.autoResetAfterMs
    );

    for (const breaker of toReset) {
      await ctx.db.patch(breaker._id, {
        isTripped: false,
        trippedAt: undefined,
        trippedBy: undefined,
        tripReason: undefined,
        updatedAt: now,
      });
    }

    return { resetCount: toReset.length };
  },
});
