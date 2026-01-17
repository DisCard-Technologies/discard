/**
 * Nullifier Registry (Convex Backend)
 * 
 * Persistent storage for ZK proof nullifiers to prevent replay attacks.
 * Nullifiers are stored with expiry for automatic cleanup.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// Mutations
// ============================================================================

/**
 * Mark a nullifier as used
 */
export const markNullifierUsed = mutation({
  args: {
    nullifier: v.string(),
    proofType: v.string(),
    expiresAt: v.number(),
    proofHash: v.optional(v.string()),
    context: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { nullifier, proofType, expiresAt, proofHash, context, userId } = args;
    
    // Check if nullifier already exists
    const existing = await ctx.db
      .query("nullifiers")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", nullifier))
      .first();
    
    if (existing) {
      console.warn(`[Nullifiers] Nullifier already exists: ${nullifier.slice(0, 16)}...`);
      return { success: false, reason: "already_exists", replayDetected: true };
    }
    
    // Insert nullifier
    await ctx.db.insert("nullifiers", {
      nullifier,
      proofType,
      proofHash,
      usedAt: Date.now(),
      usedBy: userId,
      context,
      expiresAt,
      status: "active",
    });
    
    console.log(`[Nullifiers] Marked as used: ${nullifier.slice(0, 16)}... (expires: ${new Date(expiresAt).toISOString()})`);
    
    return { success: true };
  },
});

/**
 * Clean up expired nullifiers
 * 
 * Should be called periodically (e.g., via cron)
 */
export const cleanupExpiredNullifiers = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    // Find all expired nullifiers (with reasonable batch limit)
    const expired = await ctx.db
      .query("nullifiers")
      .withIndex("by_expires")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(1000); // Process up to 1000 at a time
    
    // Mark them as expired (soft delete for audit trail)
    let cleaned = 0;
    for (const record of expired) {
      await ctx.db.patch(record._id, {
        status: "expired",
      });
      cleaned++;
    }
    
    if (cleaned > 0) {
      console.log(`[Nullifiers] Marked ${cleaned} nullifiers as expired`);
    }
    
    return { cleaned };
  },
});

/**
 * Clear all nullifiers (testing only - dangerous!)
 */
export const clearAllNullifiers = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("nullifiers").collect();
    
    let cleared = 0;
    for (const record of all) {
      await ctx.db.delete(record._id);
      cleared++;
    }
    
    console.log(`[Nullifiers] Cleared ${cleared} nullifiers (testing mode)`);
    
    return { cleared };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Check if a nullifier has been used
 */
export const isNullifierUsed = query({
  args: {
    nullifier: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("nullifiers")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();
    
    // Check if exists and not expired
    if (!record) return false;
    
    return record.status === "active";
  },
});

/**
 * Get nullifier registry statistics
 */
export const getNullifierStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("nullifiers").collect();
    const now = Date.now();
    
    const active = all.filter(n => n.status === "active");
    const expired = all.filter(n => n.status === "expired");
    const aboutToExpire = active.filter(n => n.expiresAt > now && n.expiresAt < now + 60 * 60 * 1000); // 1 hour
    
    const expiries = active.map(n => n.expiresAt);
    
    // Count by proof type
    const byType: Record<string, number> = {};
    for (const nullifier of active) {
      byType[nullifier.proofType] = (byType[nullifier.proofType] || 0) + 1;
    }
    
    return {
      totalNullifiers: all.length,
      activeNullifiers: active.length,
      expiredNullifiers: expired.length,
      aboutToExpireNullifiers: aboutToExpire.length,
      oldestExpiry: expiries.length > 0 ? Math.min(...expiries) : null,
      newestExpiry: expiries.length > 0 ? Math.max(...expiries) : null,
      byProofType: byType,
    };
  },
});

/**
 * Get nullifiers by proof type (for analytics)
 */
export const getNullifiersByType = query({
  args: {
    proofType: v.string(),
  },
  handler: async (ctx, args) => {
    const nullifiers = await ctx.db
      .query("nullifiers")
      .filter((q) => q.eq(q.field("proofType"), args.proofType))
      .collect();
    
    return nullifiers.map(n => ({
      nullifier: n.nullifier.slice(0, 16) + '...', // Truncate for privacy
      usedAt: n.usedAt,
      expiresAt: n.expiresAt,
      context: n.context,
    }));
  },
});

/**
 * Get recent nullifier activity (for monitoring)
 */
export const getRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const recent = await ctx.db
      .query("nullifiers")
      .order("desc")
      .take(limit);
    
    return recent.map(n => ({
      nullifier: n.nullifier.slice(0, 16) + '...', // Truncate for privacy
      proofType: n.proofType,
      usedAt: n.usedAt,
      expiresAt: n.expiresAt,
      status: n.status,
      isExpired: n.status === "expired",
      context: n.context,
    }));
  },
});

/**
 * Get nullifiers for a specific user (for debugging/support)
 */
export const getUserNullifiers = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const nullifiers = await ctx.db
      .query("nullifiers")
      .withIndex("by_user", (q) => q.eq("usedBy", args.userId))
      .collect();
    
    return nullifiers.map(n => ({
      nullifier: n.nullifier.slice(0, 16) + '...', // Truncate for privacy
      proofType: n.proofType,
      usedAt: n.usedAt,
      expiresAt: n.expiresAt,
      status: n.status,
      context: n.context,
    }));
  },
});
