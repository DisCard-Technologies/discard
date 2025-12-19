/**
 * Sync DeFi Positions
 *
 * Updates DeFi position balances and yield data.
 * Runs every 15 minutes.
 */
import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Main cron handler
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    // Get all positions that need syncing
    const positions = await ctx.db
      .query("defi")
      .filter((q) =>
        q.and(
          q.neq(q.field("syncStatus"), "syncing"),
          q.eq(q.field("closedAt"), undefined)
        )
      )
      .collect();

    if (positions.length === 0) {
      return;
    }

    console.log(`Syncing ${positions.length} DeFi positions`);

    // Mark positions as syncing
    for (const position of positions) {
      await ctx.db.patch(position._id, {
        syncStatus: "syncing",
      });
    }

    // Schedule actual sync for each position
    for (const position of positions) {
      await ctx.scheduler.runAfter(0, internal.crons.syncDefi.syncPosition, {
        positionId: position._id,
      });
    }
  },
});

/**
 * Sync a single position
 */
export const syncPosition = internalAction({
  args: {
    positionId: v.id("defi"),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      const position = await ctx.runQuery(internal.crons.syncDefi.getPosition, {
        positionId: args.positionId,
      });

      if (!position) {
        return;
      }

      // Fetch updated data from protocol
      // This would call the actual DeFi protocol APIs
      const updatedData = await fetchProtocolData(position);

      // Update position in database
      await ctx.runMutation(internal.crons.syncDefi.updatePosition, {
        positionId: args.positionId,
        totalValueUsd: updatedData.totalValueUsd,
        earnedValueUsd: updatedData.earnedValueUsd,
        availableForFunding: updatedData.availableForFunding,
        currentYieldApy: updatedData.currentYieldApy,
        estimatedDailyYield: updatedData.estimatedDailyYield,
        healthFactor: updatedData.healthFactor,
      });

      console.log(`Synced position ${args.positionId}: $${(updatedData.totalValueUsd / 100).toFixed(2)}`);

    } catch (error) {
      console.error(`Failed to sync position ${args.positionId}:`, error);

      await ctx.runMutation(internal.crons.syncDefi.markSyncError, {
        positionId: args.positionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

/**
 * Get position by ID
 */
export const getPosition = internalQuery({
  args: {
    positionId: v.id("defi"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.positionId);
  },
});

/**
 * Update position data
 */
export const updatePosition = internalMutation({
  args: {
    positionId: v.id("defi"),
    totalValueUsd: v.number(),
    earnedValueUsd: v.number(),
    availableForFunding: v.number(),
    currentYieldApy: v.number(),
    estimatedDailyYield: v.number(),
    healthFactor: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.positionId, {
      totalValueUsd: args.totalValueUsd,
      earnedValueUsd: args.earnedValueUsd,
      availableForFunding: args.availableForFunding,
      currentYieldApy: args.currentYieldApy,
      estimatedDailyYield: args.estimatedDailyYield,
      healthFactor: args.healthFactor,
      syncStatus: "synced",
      syncError: undefined,
      lastSyncedAt: Date.now(),
    });
  },
});

/**
 * Mark sync error
 */
export const markSyncError = internalMutation({
  args: {
    positionId: v.id("defi"),
    error: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.positionId, {
      syncStatus: "error",
      syncError: args.error,
      lastSyncedAt: Date.now(),
    });
  },
});

/**
 * Fetch data from DeFi protocol
 * This is a placeholder - actual implementation would call protocol APIs
 */
async function fetchProtocolData(position: any): Promise<{
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  healthFactor?: number;
}> {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Return simulated data
  // In production, this would call:
  // - Aave: The Graph subgraph or aave-js SDK
  // - Compound: Compound.js SDK
  // - Uniswap: Uniswap SDK for LP positions

  const baseValue = position.depositedValueUsd;
  const yieldEarned = Math.floor(baseValue * 0.001); // 0.1% simulated yield

  return {
    totalValueUsd: baseValue + yieldEarned,
    earnedValueUsd: yieldEarned,
    availableForFunding: Math.floor((baseValue + yieldEarned) * 0.8), // 80% available
    currentYieldApy: 500, // 5% APY in basis points
    estimatedDailyYield: Math.floor(baseValue * 0.0000137), // ~5% APY daily
    healthFactor: position.positionType === "lending" ? 1.8 : undefined,
  };
}
