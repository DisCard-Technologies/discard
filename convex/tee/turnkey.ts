/**
 * DisCard 2035 - Convex Turnkey Functions
 *
 * Server-side functions for managing Turnkey sub-organizations
 * and TEE-protected wallet operations.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
  internalAction,
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
});

const currentSpendingValidator = v.object({
  daily: v.number(),
  weekly: v.number(),
  monthly: v.number(),
  lastResetAt: v.number(),
});

const policiesValidator = v.object({
  merchantLocking: v.boolean(),
  allowedMerchants: v.optional(v.array(v.string())),
  allowedMccCodes: v.optional(v.array(v.string())),
  blockedMerchants: v.optional(v.array(v.string())),
  blockedMccCodes: v.optional(v.array(v.string())),
  velocityLimits: velocityLimitsValidator,
  currentSpending: currentSpendingValidator,
  requireBiometric: v.boolean(),
  requireStep2FA: v.boolean(),
  allowedIpRanges: v.optional(v.array(v.string())),
  requireFraudClearance: v.boolean(),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get Turnkey sub-organization by user ID
 */
export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get Turnkey sub-organization by wallet address
 */
export const getByWalletAddress = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_wallet_address", (q) => q.eq("walletAddress", args.walletAddress))
      .first();
  },
});

/**
 * Get Turnkey sub-organization by sub-org ID
 */
export const getBySubOrgId = query({
  args: { subOrganizationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_sub_org", (q) => q.eq("subOrganizationId", args.subOrganizationId))
      .first();
  },
});

/**
 * Get current spending for velocity checks
 */
export const getCurrentSpending = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!org) {
      return null;
    }

    return {
      spending: org.policies.currentSpending,
      limits: org.policies.velocityLimits,
    };
  },
});

/**
 * Check if a transaction is within velocity limits
 */
export const checkVelocityLimits = query({
  args: {
    userId: v.id("users"),
    amount: v.number(), // Amount in cents
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!org) {
      return { allowed: false, reason: "No TEE organization found" };
    }

    const { velocityLimits, currentSpending } = org.policies;

    // Check per-transaction limit
    if (args.amount > velocityLimits.perTransaction) {
      return {
        allowed: false,
        reason: `Amount exceeds per-transaction limit of ${velocityLimits.perTransaction / 100}`,
      };
    }

    // Check daily limit
    if (currentSpending.daily + args.amount > velocityLimits.daily) {
      return {
        allowed: false,
        reason: `Amount would exceed daily limit of ${velocityLimits.daily / 100}`,
      };
    }

    // Check weekly limit
    if (currentSpending.weekly + args.amount > velocityLimits.weekly) {
      return {
        allowed: false,
        reason: `Amount would exceed weekly limit of ${velocityLimits.weekly / 100}`,
      };
    }

    // Check monthly limit
    if (currentSpending.monthly + args.amount > velocityLimits.monthly) {
      return {
        allowed: false,
        reason: `Amount would exceed monthly limit of ${velocityLimits.monthly / 100}`,
      };
    }

    return { allowed: true };
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

export const getByIdInternal = internalQuery({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new Turnkey sub-organization record
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    didDocumentId: v.optional(v.id("didDocuments")),
    subOrganizationId: v.string(),
    rootUserId: v.string(),
    serviceUserId: v.string(),
    walletId: v.string(),
    walletAddress: v.string(),
    walletPublicKey: v.string(),
    ethereumAddress: v.optional(v.string()), // Ethereum address for MoonPay
    policies: v.optional(policiesValidator),
  },
  handler: async (ctx, args) => {
    // Check if user already has a sub-organization
    const existing = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      throw new Error("User already has a Turnkey sub-organization");
    }

    const now = Date.now();

    // Default policies
    const defaultPolicies = {
      merchantLocking: false,
      velocityLimits: {
        perTransaction: 100000, // $1,000
        daily: 500000, // $5,000
        weekly: 2000000, // $20,000
        monthly: 5000000, // $50,000
      },
      currentSpending: {
        daily: 0,
        weekly: 0,
        monthly: 0,
        lastResetAt: now,
      },
      requireBiometric: true,
      requireStep2FA: false,
      requireFraudClearance: true,
    };

    const id = await ctx.db.insert("turnkeyOrganizations", {
      userId: args.userId,
      didDocumentId: args.didDocumentId,
      subOrganizationId: args.subOrganizationId,
      rootUserId: args.rootUserId,
      serviceUserId: args.serviceUserId,
      walletId: args.walletId,
      walletAddress: args.walletAddress,
      walletPublicKey: args.walletPublicKey,
      ethereumAddress: args.ethereumAddress,
      policies: args.policies ?? defaultPolicies,
      status: "creating",
      totalTransactionsCount: 0,
      totalTransactionsVolume: 0,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Activate a Turnkey sub-organization
 */
export const activate = mutation({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update policies for a sub-organization
 */
export const updatePolicies = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    policies: policiesValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      policies: args.policies,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update velocity limits
 */
export const updateVelocityLimits = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    velocityLimits: velocityLimitsValidator,
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    await ctx.db.patch(args.id, {
      policies: {
        ...org.policies,
        velocityLimits: args.velocityLimits,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Record spending for velocity tracking
 */
export const recordSpending = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    amount: v.number(), // Amount in cents
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    const now = Date.now();
    const { currentSpending, velocityLimits } = org.policies;

    // Reset counters if needed
    const lastReset = new Date(currentSpending.lastResetAt);
    const nowDate = new Date(now);

    let daily = currentSpending.daily;
    let weekly = currentSpending.weekly;
    let monthly = currentSpending.monthly;
    let lastResetAt = currentSpending.lastResetAt;

    // Reset daily if new day
    if (nowDate.toDateString() !== lastReset.toDateString()) {
      daily = 0;
    }

    // Reset weekly if new week (Sunday)
    const lastWeekStart = getWeekStart(lastReset);
    const nowWeekStart = getWeekStart(nowDate);
    if (lastWeekStart.getTime() !== nowWeekStart.getTime()) {
      weekly = 0;
    }

    // Reset monthly if new month
    if (
      nowDate.getMonth() !== lastReset.getMonth() ||
      nowDate.getFullYear() !== lastReset.getFullYear()
    ) {
      monthly = 0;
      lastResetAt = now;
    }

    // Add current spending
    daily += args.amount;
    weekly += args.amount;
    monthly += args.amount;

    await ctx.db.patch(args.id, {
      policies: {
        ...org.policies,
        currentSpending: {
          daily,
          weekly,
          monthly,
          lastResetAt,
        },
      },
      lastActivityAt: now,
      totalTransactionsCount: org.totalTransactionsCount + 1,
      totalTransactionsVolume: org.totalTransactionsVolume + args.amount,
      updatedAt: now,
    });
  },
});

/**
 * Update merchant restrictions
 */
export const updateMerchantRestrictions = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    merchantLocking: v.boolean(),
    allowedMerchants: v.optional(v.array(v.string())),
    allowedMccCodes: v.optional(v.array(v.string())),
    blockedMerchants: v.optional(v.array(v.string())),
    blockedMccCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    await ctx.db.patch(args.id, {
      policies: {
        ...org.policies,
        merchantLocking: args.merchantLocking,
        allowedMerchants: args.allowedMerchants,
        allowedMccCodes: args.allowedMccCodes,
        blockedMerchants: args.blockedMerchants,
        blockedMccCodes: args.blockedMccCodes,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Freeze a sub-organization (security)
 */
export const freeze = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "frozen",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Suspend a sub-organization (temporary)
 */
export const suspend = mutation({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "suspended",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Reactivate a suspended/frozen sub-organization
 */
export const reactivate = mutation({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    if (org.status === "creating") {
      throw new Error("Organization still being created");
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Link a DID document to the sub-organization
 */
export const linkDID = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    didDocumentId: v.id("didDocuments"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      didDocumentId: args.didDocumentId,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

export const resetDailySpending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const orgs = await ctx.db.query("turnkeyOrganizations").collect();

    for (const org of orgs) {
      await ctx.db.patch(org._id, {
        policies: {
          ...org.policies,
          currentSpending: {
            ...org.policies.currentSpending,
            daily: 0,
          },
        },
        updatedAt: now,
      });
    }
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}
