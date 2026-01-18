/**
 * Key Images Registry - Convex Actions
 *
 * Prevents double-signing in ring signatures (similar to Monero's key images).
 * A key image is derived from a user's private key and proves ownership without
 * revealing the actual key. Once used, it cannot be reused.
 *
 * This prevents double-spend attacks in ShadowWire private transfers.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";

// ============ KEY IMAGE RECORDING ============

/**
 * Record a new key image usage
 * 
 * @throws Error if key image is already used (double-spend attempt)
 */
export const recordKeyImage = mutation({
  args: {
    keyImageHash: v.string(),
    messageHash: v.string(),
    ringSize: v.number(),
    txSignature: v.optional(v.string()),
    expiryMs: v.optional(v.number()), // Optional expiry for cleanup
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if key image already used (double-spend detection)
    const existingKeyImage = await ctx.db
      .query("keyImages")
      .withIndex("by_key_image", (q) => q.eq("keyImageHash", args.keyImageHash))
      .first();

    if (existingKeyImage) {
      throw new Error(
        `Key image already used (double-spend detected). ` +
        `Original usage at: ${new Date(existingKeyImage.createdAt).toISOString()}`
      );
    }

    // Record key image
    const expiresAt = args.expiryMs ? Date.now() + args.expiryMs : undefined;

    const keyImageId = await ctx.db.insert("keyImages", {
      keyImageHash: args.keyImageHash,
      userId: user._id,
      messageHash: args.messageHash,
      ringSize: args.ringSize,
      txSignature: args.txSignature,
      createdAt: Date.now(),
      expiresAt,
    });

    return { 
      keyImageId,
      recorded: true,
    };
  },
});

/**
 * Check if a key image has been used
 * 
 * @returns True if key image exists in registry (already used)
 */
export const isKeyImageUsed = query({
  args: {
    keyImageHash: v.string(),
  },
  handler: async (ctx, args) => {
    const keyImage = await ctx.db
      .query("keyImages")
      .withIndex("by_key_image", (q) => q.eq("keyImageHash", args.keyImageHash))
      .first();

    return {
      used: keyImage !== null,
      usedAt: keyImage?.createdAt,
      txSignature: keyImage?.txSignature,
    };
  },
});

/**
 * Batch check multiple key images
 * 
 * Efficient for verifying multiple signatures at once
 */
export const checkKeyImagesBatch = query({
  args: {
    keyImageHashes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.keyImageHashes.map(async (hash) => {
        const keyImage = await ctx.db
          .query("keyImages")
          .withIndex("by_key_image", (q) => q.eq("keyImageHash", hash))
          .first();

        return {
          keyImageHash: hash,
          used: keyImage !== null,
          usedAt: keyImage?.createdAt,
        };
      })
    );

    return results;
  },
});

// ============ KEY IMAGE QUERIES ============

/**
 * Get user's key image history
 */
export const getUserKeyImages = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    return await ctx.db
      .query("keyImages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit || 100);
  },
});

/**
 * Get key image usage statistics
 */
export const getKeyImageStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return null;

    const userKeyImages = await ctx.db
      .query("keyImages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const now = Date.now();
    const last24h = userKeyImages.filter(
      (ki) => now - ki.createdAt < 24 * 60 * 60 * 1000
    ).length;

    const last7d = userKeyImages.filter(
      (ki) => now - ki.createdAt < 7 * 24 * 60 * 60 * 1000
    ).length;

    return {
      total: userKeyImages.length,
      last24h,
      last7d,
      averageRingSize: userKeyImages.length > 0
        ? userKeyImages.reduce((sum, ki) => sum + ki.ringSize, 0) / userKeyImages.length
        : 0,
    };
  },
});

// ============ CLEANUP ============

/**
 * Delete expired key images (called by cron)
 * 
 * This prevents the registry from growing infinitely.
 * Only removes key images with explicit expiry set.
 */
export const cleanupExpiredKeyImages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredKeyImages = await ctx.db
      .query("keyImages")
      .filter((q) => 
        q.and(
          q.neq(q.field("expiresAt"), undefined),
          q.lt(q.field("expiresAt"), now)
        )
      )
      .collect();

    for (const keyImage of expiredKeyImages) {
      await ctx.db.delete(keyImage._id);
    }

    return { 
      deleted: expiredKeyImages.length,
      message: `Cleaned up ${expiredKeyImages.length} expired key images`,
    };
  },
});

/**
 * Delete old key images (for manual cleanup or testing)
 * 
 * Removes key images older than specified age.
 */
export const cleanupOldKeyImages = internalMutation({
  args: {
    olderThanMs: v.number(), // Delete key images older than this (in ms)
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanMs;

    const oldKeyImages = await ctx.db
      .query("keyImages")
      .withIndex("by_created")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();

    for (const keyImage of oldKeyImages) {
      await ctx.db.delete(keyImage._id);
    }

    return { 
      deleted: oldKeyImages.length,
      cutoffDate: new Date(cutoff).toISOString(),
    };
  },
});
