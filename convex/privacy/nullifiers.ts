/**
 * Nullifiers - Convex Actions
 *
 * Nullifier registry for ZK proof replay protection.
 * Ensures each proof can only be used once.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ============ NULLIFIER MANAGEMENT ============

/**
 * Mark a nullifier as used
 */
export const markUsed = mutation({
  args: {
    nullifier: v.string(),
    proofType: v.string(),
    expiresAt: v.number(),
    proofHash: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if nullifier already exists
    const existing = await ctx.db
      .query("nullifiers")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();

    if (existing) {
      throw new Error("Nullifier already used - replay attack detected");
    }

    // Get user if authenticated
    const identity = await ctx.auth.getUserIdentity();
    let userId = undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      userId = user?._id;
    }

    // Insert nullifier record
    const nullifierId = await ctx.db.insert("nullifiers", {
      nullifier: args.nullifier,
      proofType: args.proofType,
      proofHash: args.proofHash,
      usedAt: Date.now(),
      usedBy: userId,
      context: args.context,
      expiresAt: args.expiresAt,
      status: "active",
    });

    return { nullifierId, success: true };
  },
});

/**
 * Check if a nullifier has been used
 */
export const isUsed = query({
  args: {
    nullifier: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("nullifiers")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();

    return {
      used: record !== null,
      status: record?.status,
      usedAt: record?.usedAt,
    };
  },
});

/**
 * Check multiple nullifiers at once
 */
export const checkBatch = query({
  args: {
    nullifiers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results: Record<string, { used: boolean; status?: string }> = {};

    for (const nullifier of args.nullifiers) {
      const record = await ctx.db
        .query("nullifiers")
        .withIndex("by_nullifier", (q) => q.eq("nullifier", nullifier))
        .first();

      results[nullifier] = {
        used: record !== null,
        status: record?.status,
      };
    }

    return results;
  },
});

/**
 * Get nullifiers by proof type
 */
export const getByProofType = query({
  args: {
    proofType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("nullifiers")
      .withIndex("by_proof_type", (q) => q.eq("proofType", args.proofType))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.collect();
  },
});

/**
 * Get nullifiers for current user
 */
export const getForUser = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    let query = ctx.db
      .query("nullifiers")
      .withIndex("by_user", (q) => q.eq("usedBy", user._id))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.collect();
  },
});

// ============ CLEANUP ============

/**
 * Mark expired nullifiers (can be cleaned up)
 */
export const markExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find active nullifiers that have expired
    const expiredNullifiers = await ctx.db
      .query("nullifiers")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    let count = 0;
    for (const record of expiredNullifiers) {
      await ctx.db.patch(record._id, { status: "expired" });
      count++;
    }

    return { expiredCount: count };
  },
});

/**
 * Delete expired nullifiers older than a threshold
 */
export const cleanupExpired = mutation({
  args: {
    olderThanMs: v.optional(v.number()), // Default: 30 days
  },
  handler: async (ctx, args) => {
    const threshold = Date.now() - (args.olderThanMs ?? 30 * 24 * 60 * 60 * 1000);

    const oldExpired = await ctx.db
      .query("nullifiers")
      .withIndex("by_status", (q) => q.eq("status", "expired"))
      .filter((q) => q.lt(q.field("expiresAt"), threshold))
      .collect();

    let count = 0;
    for (const record of oldExpired) {
      await ctx.db.delete(record._id);
      count++;
    }

    return { deletedCount: count };
  },
});

/**
 * Get nullifier statistics
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const allNullifiers = await ctx.db
      .query("nullifiers")
      .collect();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const stats = {
      total: allNullifiers.length,
      active: 0,
      expired: 0,
      last24h: 0,
      byProofType: {} as Record<string, number>,
    };

    for (const record of allNullifiers) {
      if (record.status === "active") stats.active++;
      else if (record.status === "expired") stats.expired++;

      if (record.usedAt >= oneDayAgo) stats.last24h++;

      stats.byProofType[record.proofType] =
        (stats.byProofType[record.proofType] || 0) + 1;
    }

    return stats;
  },
});
