/**
 * DFlow Prediction Markets Convex Functions
 *
 * Provides caching and sync for user's tokenized Kalshi
 * prediction market positions via DFlow API.
 */
import { v } from "convex/values";
import { query, mutation, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id, Doc } from "../_generated/dataModel";

const DFLOW_API_URL = "https://api.pond.dflow.net/api/v1";

// ============================================================================
// Queries
// ============================================================================

/**
 * Get user's prediction market positions
 */
export const getPositions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("predictionPositions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get positions by wallet address
 */
export const getPositionsByWallet = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("predictionPositions")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
  },
});

/**
 * Get total prediction market portfolio value
 */
export const getPortfolioValue = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("predictionPositions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const totalValue = positions.reduce((sum, p) => sum + p.valueUsd, 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
    const positionsCount = positions.length;

    return {
      totalValue,
      totalPnl,
      positionsCount,
    };
  },
});

// ============================================================================
// Actions (External API calls)
// ============================================================================

/**
 * Sync prediction market positions from DFlow
 *
 * This action:
 * 1. Takes user's token account mints
 * 2. Filters them through DFlow to find outcome tokens
 * 3. Fetches market data for each position
 * 4. Calculates PnL and stores positions
 */
export const syncPositions = action({
  args: {
    userId: v.id("users"),
    walletAddress: v.string(),
    tokenMints: v.array(v.string()), // All SPL token mints in user's wallet
    tokenBalances: v.record(v.string(), v.number()), // mint -> balance mapping
  },
  handler: async (ctx, args) => {
    // Step 1: Filter outcome mints (max 200 per request)
    const chunkedMints = chunkArray(args.tokenMints, 200);
    const allOutcomeTokens: Array<{
      mint: string;
      marketId: string;
      side: "yes" | "no";
    }> = [];

    for (const chunk of chunkedMints) {
      const response = await fetch(`${DFLOW_API_URL}/filter_outcome_mints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mints: chunk }),
      });

      if (!response.ok) {
        console.error(`DFlow filter error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      allOutcomeTokens.push(
        ...(data.outcome_tokens || []).map(
          (t: { mint: string; market_id: string; side: string }) => ({
            mint: t.mint,
            marketId: t.market_id,
            side: t.side as "yes" | "no",
          })
        )
      );
    }

    if (allOutcomeTokens.length === 0) {
      // Clear existing positions if user has none
      await ctx.runMutation(internal.holdings.dflow.clearPositions, {
        userId: args.userId,
      });
      return { positions: [], totalValue: 0, totalPnl: 0 };
    }

    // Step 2: Fetch market data for each unique market
    const uniqueMarketIds = [...new Set(allOutcomeTokens.map((t) => t.marketId))];
    const marketData: Record<
      string,
      {
        question: string;
        ticker: string;
        yesPrice: number;
        noPrice: number;
        status: string;
        endDate: string;
        category: string;
      }
    > = {};

    for (const marketId of uniqueMarketIds) {
      try {
        const response = await fetch(`${DFLOW_API_URL}/market/${marketId}`);
        if (response.ok) {
          const market = await response.json();
          marketData[marketId] = {
            question: market.title,
            ticker: market.ticker,
            yesPrice: market.yes_price,
            noPrice: market.no_price,
            status: market.status,
            endDate: market.end_date,
            category: market.category,
          };
        }
      } catch (error) {
        console.error(`Failed to fetch market ${marketId}:`, error);
      }
    }

    // Step 3: Build positions with PnL calculations
    const positions = allOutcomeTokens
      .map((token) => {
        const market = marketData[token.marketId];
        if (!market) return null;

        const shares = args.tokenBalances[token.mint] || 0;
        if (shares === 0) return null;

        const currentPrice =
          token.side === "yes" ? market.yesPrice : market.noPrice;
        // Assume avg price is half of current (simplified - should track actual buys)
        const avgPrice = 0.5;
        const valueUsd = shares * currentPrice;
        const costBasis = shares * avgPrice;
        const pnl = valueUsd - costBasis;
        const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

        return {
          marketId: token.marketId,
          ticker: market.ticker,
          question: market.question,
          side: token.side,
          mintAddress: token.mint,
          shares,
          avgPrice,
          currentPrice,
          valueUsd,
          pnl,
          pnlPercent,
          marketStatus: market.status,
          endDate: market.endDate,
          category: market.category,
        };
      })
      .filter(Boolean) as Array<{
        marketId: string;
        ticker: string;
        question: string;
        side: "yes" | "no";
        mintAddress: string;
        shares: number;
        avgPrice: number;
        currentPrice: number;
        valueUsd: number;
        pnl: number;
        pnlPercent: number;
        marketStatus: string;
        endDate: string;
        category: string;
      }>;

    // Step 4: Update cache
    await ctx.runMutation(internal.holdings.dflow.updatePositions, {
      userId: args.userId,
      walletAddress: args.walletAddress,
      positions,
    });

    const totalValue = positions.reduce((sum, p) => sum + p.valueUsd, 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

    return { positions, totalValue, totalPnl };
  },
});

/**
 * Update price for a specific position (called from WebSocket updates)
 */
export const updatePositionPrice = mutation({
  args: {
    marketId: v.string(),
    yesPrice: v.number(),
    noPrice: v.number(),
  },
  handler: async (ctx, args) => {
    // Find all positions for this market
    const positions = await ctx.db
      .query("predictionPositions")
      .withIndex("by_market", (q) => q.eq("marketId", args.marketId))
      .collect();

    const now = Date.now();

    for (const position of positions) {
      const currentPrice =
        position.side === "yes" ? args.yesPrice : args.noPrice;
      const valueUsd = position.shares * currentPrice;
      const costBasis = position.shares * position.avgPrice;
      const pnl = valueUsd - costBasis;
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

      await ctx.db.patch(position._id, {
        currentPrice,
        valueUsd,
        pnl,
        pnlPercent,
        updatedAt: now,
      });
    }

    return { updated: positions.length };
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Update positions cache (internal only)
 */
export const updatePositions = internalMutation({
  args: {
    userId: v.id("users"),
    walletAddress: v.string(),
    positions: v.array(
      v.object({
        marketId: v.string(),
        ticker: v.string(),
        question: v.string(),
        side: v.union(v.literal("yes"), v.literal("no")),
        mintAddress: v.string(),
        shares: v.number(),
        avgPrice: v.number(),
        currentPrice: v.number(),
        valueUsd: v.number(),
        pnl: v.number(),
        pnlPercent: v.number(),
        marketStatus: v.optional(v.string()),
        endDate: v.optional(v.string()),
        category: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Clear existing positions for this user
    const existing = await ctx.db
      .query("predictionPositions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const p of existing) {
      await ctx.db.delete(p._id);
    }

    // Insert new positions
    for (const position of args.positions) {
      await ctx.db.insert("predictionPositions", {
        userId: args.userId,
        walletAddress: args.walletAddress,
        marketId: position.marketId,
        ticker: position.ticker,
        question: position.question,
        side: position.side,
        mintAddress: position.mintAddress,
        shares: position.shares,
        avgPrice: position.avgPrice,
        currentPrice: position.currentPrice,
        valueUsd: position.valueUsd,
        pnl: position.pnl,
        pnlPercent: position.pnlPercent,
        marketStatus: position.marketStatus,
        endDate: position.endDate,
        category: position.category,
        updatedAt: now,
      });
    }
  },
});

/**
 * Clear all positions for a user
 */
export const clearPositions = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("predictionPositions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const p of existing) {
      await ctx.db.delete(p._id);
    }

    return { deleted: existing.length };
  },
});

// ============================================================================
// Helpers
// ============================================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
