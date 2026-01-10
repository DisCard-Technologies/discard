/**
 * DeFi Positions Convex Functions
 * Manages DeFi positions for yield-based card funding
 */
import { v } from "convex/values";
import { query, mutation, internalQuery } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

// List all DeFi positions for a user
export const listPositions = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    if (!args.userId) {
      return [];
    }

    const positions = await ctx.db
      .query("defi")
      .withIndex("by_user", (q) => q.eq("userId", args.userId!))
      .collect();

    return positions.filter((p) => !p.closedAt);
  },
});

// Get a specific DeFi position
export const get = query({
  args: {
    positionId: v.id("defi"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.positionId);
  },
});

// Sync DeFi positions from external protocols
export const syncPositions = mutation({
  args: {
    userId: v.id("users"),
    walletId: v.id("wallets"),
  },
  handler: async (ctx, args) => {
    // In production, this would call DeFi protocol APIs
    // For now, just update sync status on existing positions
    const positions = await ctx.db
      .query("defi")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId))
      .collect();

    const now = Date.now();
    for (const position of positions) {
      await ctx.db.patch(position._id, {
        syncStatus: "synced",
        lastSyncedAt: now,
      });
    }

    return { synced: positions.length };
  },
});

// Get total available funds across all DeFi positions
export const getAvailableFunding = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("defi")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const activePositions = positions.filter((p) => !p.closedAt);

    const totalAvailable = activePositions.reduce(
      (sum, p) => sum + p.availableForFunding,
      0
    );

    const totalValue = activePositions.reduce(
      (sum, p) => sum + p.totalValueUsd,
      0
    );

    const totalEarned = activePositions.reduce(
      (sum, p) => sum + p.earnedValueUsd,
      0
    );

    return {
      totalAvailable,
      totalValue,
      totalEarned,
      positionCount: activePositions.length,
    };
  },
});

/**
 * List DeFi positions by user ID (internal - for solver context)
 */
export const listByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Doc<"defi">[]> => {
    const positions = await ctx.db
      .query("defi")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return positions.filter((p) => !p.closedAt);
  },
});

