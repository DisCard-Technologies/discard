/**
 * DisCard 2035 - Transfer Hook Policy Management
 *
 * Convex functions for managing Token-2022 transfer hook policies.
 * Syncs card policies between Convex and on-chain program.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Validators
// ============================================================================

const velocityLimitsValidator = v.object({
  perTransaction: v.number(),
  daily: v.number(),
  weekly: v.number(),
  monthly: v.number(),
  maxDailyTransactions: v.number(),
  maxWeeklyTransactions: v.number(),
  maxMonthlyTransactions: v.number(),
});

const cardPolicyValidator = v.object({
  requireBiometric: v.boolean(),
  require2faAbove: v.optional(v.number()),
  allowInternational: v.boolean(),
  allowOnline: v.boolean(),
  allowAtm: v.boolean(),
  allowContactless: v.boolean(),
  contactlessLimit: v.number(),
  allowedCountries: v.optional(v.array(v.string())),
  blockedCountries: v.optional(v.array(v.string())),
});

const syncStatusValidator = v.union(
  v.literal("synced"),
  v.literal("pending"),
  v.literal("syncing"),
  v.literal("error")
);

// ============================================================================
// Queries
// ============================================================================

/**
 * Get policy configuration for a card
 */
export const getCardPolicy = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    // Get card
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      return null;
    }

    // Get associated Turnkey org for policy
    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      return {
        cardId: args.cardId,
        policy: null,
        velocityLimits: null,
        syncStatus: "pending" as const,
      };
    }

    return {
      cardId: args.cardId,
      policy: turnkeyOrg.policies,
      velocityLimits: turnkeyOrg.policies.velocityLimits,
      currentSpending: turnkeyOrg.policies.currentSpending,
      syncStatus: "synced" as const,
    };
  },
});

/**
 * Get all cards with pending policy sync
 */
export const getPendingSync = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // In production, maintain a sync queue table
    // For now, return cards that might need sync
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return cards.map((card) => ({
      cardId: card._id,
      cardContext: card.cardContext,
      lastUpdated: card.updatedAt,
    }));
  },
});

/**
 * Get velocity usage for a card
 */
export const getVelocityUsage = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      return null;
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      return null;
    }

    const { velocityLimits, currentSpending } = turnkeyOrg.policies;

    return {
      limits: velocityLimits,
      current: currentSpending,
      remaining: {
        daily: velocityLimits.daily - currentSpending.daily,
        weekly: velocityLimits.weekly - currentSpending.weekly,
        monthly: velocityLimits.monthly - currentSpending.monthly,
      },
      percentUsed: {
        daily: (currentSpending.daily / velocityLimits.daily) * 100,
        weekly: (currentSpending.weekly / velocityLimits.weekly) * 100,
        monthly: (currentSpending.monthly / velocityLimits.monthly) * 100,
      },
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Update velocity limits for a card
 */
export const updateVelocityLimits = mutation({
  args: {
    cardId: v.id("cards"),
    limits: velocityLimitsValidator,
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const now = Date.now();

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        velocityLimits: args.limits,
      },
      updatedAt: now,
    });

    // Update card limits to match
    await ctx.db.patch(args.cardId, {
      spendingLimit: args.limits.perTransaction,
      dailyLimit: args.limits.daily,
      monthlyLimit: args.limits.monthly,
      updatedAt: now,
    });

    return { success: true, syncStatus: "pending" };
  },
});

/**
 * Update card policy settings
 */
export const updateCardPolicy = mutation({
  args: {
    cardId: v.id("cards"),
    policy: cardPolicyValidator,
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const now = Date.now();

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        requireBiometric: args.policy.requireBiometric,
        requireStep2FA: args.policy.require2faAbove !== undefined,
      },
      updatedAt: now,
    });

    return { success: true, syncStatus: "pending" };
  },
});

/**
 * Record a transaction for velocity tracking
 */
export const recordTransaction = mutation({
  args: {
    cardId: v.id("cards"),
    amount: v.number(),
    merchantId: v.optional(v.string()),
    mccCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const now = Date.now();
    const { currentSpending } = turnkeyOrg.policies;

    // Check if reset is needed (simplified - in production use proper date math)
    const lastReset = currentSpending.lastResetAt;
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    let newSpending = { ...currentSpending };

    // Reset if needed
    if (now - lastReset >= dayMs) {
      newSpending.daily = 0;
    }
    if (now - lastReset >= weekMs) {
      newSpending.weekly = 0;
    }
    if (now - lastReset >= monthMs) {
      newSpending.monthly = 0;
      newSpending.lastResetAt = now;
    }

    // Add transaction
    newSpending.daily += args.amount;
    newSpending.weekly += args.amount;
    newSpending.monthly += args.amount;

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        currentSpending: newSpending,
      },
      totalTransactionsCount: turnkeyOrg.totalTransactionsCount + 1,
      totalTransactionsVolume: turnkeyOrg.totalTransactionsVolume + args.amount,
      lastActivityAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Reset velocity counters
 */
export const resetVelocity = mutation({
  args: {
    cardId: v.id("cards"),
    resetType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("all")
    ),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const now = Date.now();
    let newSpending = { ...turnkeyOrg.policies.currentSpending };

    switch (args.resetType) {
      case "daily":
        newSpending.daily = 0;
        break;
      case "weekly":
        newSpending.weekly = 0;
        break;
      case "monthly":
        newSpending.monthly = 0;
        break;
      case "all":
        newSpending = { daily: 0, weekly: 0, monthly: 0, lastResetAt: now };
        break;
    }

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        currentSpending: newSpending,
      },
      updatedAt: now,
    });

    return { success: true };
  },
});

// ============================================================================
// Velocity Limit Presets
// ============================================================================

/**
 * Get velocity limit presets
 */
export const getVelocityPresets = query({
  args: {},
  handler: async () => {
    return {
      conservative: {
        perTransaction: 50000,
        daily: 100000,
        weekly: 250000,
        monthly: 500000,
        maxDailyTransactions: 10,
        maxWeeklyTransactions: 30,
        maxMonthlyTransactions: 100,
      },
      standard: {
        perTransaction: 250000,
        daily: 500000,
        weekly: 1500000,
        monthly: 5000000,
        maxDailyTransactions: 25,
        maxWeeklyTransactions: 100,
        maxMonthlyTransactions: 300,
      },
      premium: {
        perTransaction: 1000000,
        daily: 2500000,
        weekly: 10000000,
        monthly: 25000000,
        maxDailyTransactions: 50,
        maxWeeklyTransactions: 200,
        maxMonthlyTransactions: 500,
      },
      institutional: {
        perTransaction: 10000000,
        daily: 50000000,
        weekly: 200000000,
        monthly: 500000000,
        maxDailyTransactions: 500,
        maxWeeklyTransactions: 2000,
        maxMonthlyTransactions: 10000,
      },
    };
  },
});

/**
 * Apply a velocity preset to a card
 */
export const applyVelocityPreset = mutation({
  args: {
    cardId: v.id("cards"),
    preset: v.union(
      v.literal("conservative"),
      v.literal("standard"),
      v.literal("premium"),
      v.literal("institutional")
    ),
  },
  handler: async (ctx, args) => {
    const presets = {
      conservative: {
        perTransaction: 50000,
        daily: 100000,
        weekly: 250000,
        monthly: 500000,
        maxDailyTransactions: 10,
        maxWeeklyTransactions: 30,
        maxMonthlyTransactions: 100,
      },
      standard: {
        perTransaction: 250000,
        daily: 500000,
        weekly: 1500000,
        monthly: 5000000,
        maxDailyTransactions: 25,
        maxWeeklyTransactions: 100,
        maxMonthlyTransactions: 300,
      },
      premium: {
        perTransaction: 1000000,
        daily: 2500000,
        weekly: 10000000,
        monthly: 25000000,
        maxDailyTransactions: 50,
        maxWeeklyTransactions: 200,
        maxMonthlyTransactions: 500,
      },
      institutional: {
        perTransaction: 10000000,
        daily: 50000000,
        weekly: 200000000,
        monthly: 500000000,
        maxDailyTransactions: 500,
        maxWeeklyTransactions: 2000,
        maxMonthlyTransactions: 10000,
      },
    };

    const limits = presets[args.preset];

    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const now = Date.now();

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        velocityLimits: limits,
      },
      updatedAt: now,
    });

    await ctx.db.patch(args.cardId, {
      spendingLimit: limits.perTransaction,
      dailyLimit: limits.daily,
      monthlyLimit: limits.monthly,
      updatedAt: now,
    });

    return { success: true, preset: args.preset, limits };
  },
});
