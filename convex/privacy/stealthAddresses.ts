/**
 * Stealth Addresses - Convex Actions
 *
 * Server-side management for Hush-style stealth addresses:
 * - Record stealth address generation
 * - Track address usage for card funding
 * - Query user's stealth addresses
 */

import { v } from "convex/values";
import { mutation, query, action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ============ ADDRESS RECORDING ============

/**
 * Record a new stealth address
 */
export const recordStealthAddress = mutation({
  args: {
    cardId: v.optional(v.id("cards")),
    stealthAddress: v.string(),
    ephemeralPubKey: v.string(),
    purpose: v.union(
      v.literal("card_funding"),
      v.literal("merchant_payment"),
      v.literal("p2p_transfer")
    ),
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

    // Check for duplicate address
    const existingAddress = await ctx.db
      .query("stealthAddresses")
      .withIndex("by_address", (q) => q.eq("stealthAddress", args.stealthAddress))
      .first();

    if (existingAddress) {
      throw new Error("Stealth address already recorded");
    }

    // Verify card ownership if cardId provided
    if (args.cardId) {
      const card = await ctx.db.get(args.cardId);
      if (!card || card.userId !== user._id) {
        throw new Error("Card not found or access denied");
      }
    }

    // Record stealth address
    const addressId = await ctx.db.insert("stealthAddresses", {
      userId: user._id,
      cardId: args.cardId,
      stealthAddress: args.stealthAddress,
      ephemeralPubKey: args.ephemeralPubKey,
      purpose: args.purpose,
      used: false,
      createdAt: Date.now(),
    });

    return { addressId, stealthAddress: args.stealthAddress };
  },
});

/**
 * Mark stealth address as used
 */
export const markAddressUsed = mutation({
  args: {
    stealthAddress: v.string(),
    txSignature: v.optional(v.string()),
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

    // Find address
    const address = await ctx.db
      .query("stealthAddresses")
      .withIndex("by_address", (q) => q.eq("stealthAddress", args.stealthAddress))
      .first();

    if (!address) {
      throw new Error("Stealth address not found");
    }

    // Verify ownership
    if (address.userId !== user._id) {
      throw new Error("Access denied");
    }

    // Mark as used
    await ctx.db.patch(address._id, {
      used: true,
      usedAt: Date.now(),
      txSignature: args.txSignature,
    });

    return { success: true };
  },
});

// ============ ADDRESS QUERIES ============

/**
 * Get stealth address by address string
 */
export const getByAddress = query({
  args: {
    stealthAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const address = await ctx.db
      .query("stealthAddresses")
      .withIndex("by_address", (q) => q.eq("stealthAddress", args.stealthAddress))
      .first();

    if (!address) return null;

    // Check ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user || address.userId !== user._id) return null;

    return address;
  },
});

/**
 * Get user's stealth addresses
 */
export const getUserAddresses = query({
  args: {
    purpose: v.optional(v.union(
      v.literal("card_funding"),
      v.literal("merchant_payment"),
      v.literal("p2p_transfer")
    )),
    used: v.optional(v.boolean()),
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

    let query = ctx.db
      .query("stealthAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id));

    // Apply filters
    if (args.purpose) {
      query = query.filter((q) => q.eq(q.field("purpose"), args.purpose));
    }

    if (args.used !== undefined) {
      query = query.filter((q) => q.eq(q.field("used"), args.used));
    }

    return await query.order("desc").take(args.limit || 50);
  },
});

/**
 * Get stealth addresses for a specific card
 */
export const getCardAddresses = query({
  args: {
    cardId: v.id("cards"),
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

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) return [];

    return await ctx.db
      .query("stealthAddresses")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .order("desc")
      .take(args.limit || 50);
  },
});

/**
 * Get unused stealth address count for a card
 */
export const getUnusedCount = query({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return 0;

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) return 0;

    const addresses = await ctx.db
      .query("stealthAddresses")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("used"), false))
      .collect();

    return addresses.length;
  },
});

// ============ BATCH OPERATIONS ============

/**
 * Generate and record multiple stealth addresses for a card
 * Note: Actual address generation happens client-side via Hush service
 */
export const recordBatch = mutation({
  args: {
    cardId: v.id("cards"),
    addresses: v.array(v.object({
      stealthAddress: v.string(),
      ephemeralPubKey: v.string(),
    })),
    purpose: v.union(
      v.literal("card_funding"),
      v.literal("merchant_payment"),
      v.literal("p2p_transfer")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      throw new Error("Card not found or access denied");
    }

    const addressIds: Id<"stealthAddresses">[] = [];

    for (const addr of args.addresses) {
      // Check for duplicate
      const existing = await ctx.db
        .query("stealthAddresses")
        .withIndex("by_address", (q) => q.eq("stealthAddress", addr.stealthAddress))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("stealthAddresses", {
          userId: user._id,
          cardId: args.cardId,
          stealthAddress: addr.stealthAddress,
          ephemeralPubKey: addr.ephemeralPubKey,
          purpose: args.purpose,
          used: false,
          createdAt: Date.now(),
        });
        addressIds.push(id);
      }
    }

    return { count: addressIds.length, addressIds };
  },
});

/**
 * Get next unused stealth address for a card
 */
export const getNextUnused = query({
  args: {
    cardId: v.id("cards"),
    purpose: v.optional(v.union(
      v.literal("card_funding"),
      v.literal("merchant_payment"),
      v.literal("p2p_transfer")
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return null;

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) return null;

    let query = ctx.db
      .query("stealthAddresses")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("used"), false));

    if (args.purpose) {
      query = query.filter((q) => q.eq(q.field("purpose"), args.purpose));
    }

    return await query.first();
  },
});

// ============ CLEANUP ============

/**
 * Delete old used stealth addresses (for privacy)
 * Called by cron job
 */
export const cleanupOldAddresses = mutation({
  args: {},
  handler: async (ctx) => {
    // Only delete addresses older than 30 days that have been used
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const oldAddresses = await ctx.db
      .query("stealthAddresses")
      .filter((q) =>
        q.and(
          q.eq(q.field("used"), true),
          q.lt(q.field("createdAt"), cutoff)
        )
      )
      .take(100); // Batch delete

    for (const address of oldAddresses) {
      await ctx.db.delete(address._id);
    }

    return { deleted: oldAddresses.length };
  },
});

// ============ ACTIONS ============

/**
 * Generate stealth address and record it
 * This action coordinates client-side generation with server-side recording
 */
export const generateAndRecord = action({
  args: {
    cardId: v.id("cards"),
    purpose: v.union(
      v.literal("card_funding"),
      v.literal("merchant_payment"),
      v.literal("p2p_transfer")
    ),
    stealthAddress: v.string(),
    ephemeralPubKey: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    stealthAddress?: string;
    error?: string;
  }> => {
    try {
      // Record the generated address
      const result = await ctx.runMutation(
        // @ts-expect-error - api type
        "privacy/stealthAddresses:recordStealthAddress",
        {
          cardId: args.cardId,
          stealthAddress: args.stealthAddress,
          ephemeralPubKey: args.ephemeralPubKey,
          purpose: args.purpose,
        }
      );

      return {
        success: true,
        stealthAddress: result.stealthAddress,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
