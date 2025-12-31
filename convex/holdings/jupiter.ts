/**
 * Jupiter Holdings Convex Functions
 *
 * Provides caching and real-time subscriptions for token holdings
 * fetched from Jupiter Ultra API.
 */
import { v } from "convex/values";
import { query, mutation, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

// Known RWA token mints for classification
const RWA_MINTS = new Set([
  "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", // USDY
  "CXLBjMMcwkc17GfJtBos6rQCo1ypeH6eDbB82Kby4MRm", // OUSG
  "43m2ewFV5nDepieFjT9EmAQnc1HRtAF247RBpLGFem5F", // BUIDL
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // BENJI
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // VBILL
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // TBILL
  "Mapuuts5DjNrLM7mhCRiEbDyNtPwfQWKr3xmyLMM8fVp", // syrupUSDC
  "ApoL1k7GWhhmE8AvCXeFHVGrw3aKNc5SpJbT3V9UpGNu", // ACRED
]);

const RWA_METADATA: Record<string, { issuer: string; type: string; expectedYield?: number }> = {
  A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6: { issuer: "Ondo", type: "yield-bearing-stablecoin", expectedYield: 5.0 },
  CXLBjMMcwkc17GfJtBos6rQCo1ypeH6eDbB82Kby4MRm: { issuer: "Ondo", type: "tokenized-fund", expectedYield: 4.5 },
  "43m2ewFV5nDepieFjT9EmAQnc1HRtAF247RBpLGFem5F": { issuer: "BlackRock", type: "money-market", expectedYield: 4.8 },
  Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr: { issuer: "Franklin Templeton", type: "money-fund", expectedYield: 4.5 },
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": { issuer: "VanEck", type: "treasury-bill", expectedYield: 4.3 },
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": { issuer: "OpenEden", type: "treasury-bill", expectedYield: 4.5 },
  Mapuuts5DjNrLM7mhCRiEbDyNtPwfQWKr3xmyLMM8fVp: { issuer: "Maple", type: "lending", expectedYield: 8.0 },
  ApoL1k7GWhhmE8AvCXeFHVGrw3aKNc5SpJbT3V9UpGNu: { issuer: "Apollo", type: "private-credit", expectedYield: 9.5 },
};

// ============================================================================
// Queries
// ============================================================================

/**
 * Get cached holdings for a wallet address
 */
export const getHoldings = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
  },
});

/**
 * Get RWA holdings only
 */
export const getRwaHoldings = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet_rwa", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("isRwa", true)
      )
      .collect();
  },
});

/**
 * Get total portfolio value for a wallet
 */
export const getPortfolioValue = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const holdings = await ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const totalValue = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
    const rwaValue = holdings
      .filter((h) => h.isRwa)
      .reduce((sum, h) => sum + h.valueUsd, 0);
    const tokenValue = totalValue - rwaValue;

    return {
      totalValue,
      tokenValue,
      rwaValue,
      holdingsCount: holdings.length,
      rwaCount: holdings.filter((h) => h.isRwa).length,
    };
  },
});

// ============================================================================
// Actions (External API calls)
// ============================================================================

/**
 * Refresh holdings from Jupiter Ultra API
 */
export const refreshHoldings = action({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const JUPITER_ULTRA_URL = "https://ultra-api.jup.ag/v1";

    // Fetch from Jupiter Ultra API
    const response = await fetch(
      `${JUPITER_ULTRA_URL}/holdings/${args.walletAddress}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform and classify holdings
    const holdings = (data.tokens || []).map((token: {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      amount: string;
      uiAmount: number;
      usdValue: number;
      price: number;
      priceChange24h?: number;
      logoURI?: string;
    }) => {
      const isRwa = RWA_MINTS.has(token.address);
      const rwaMetadata = isRwa ? RWA_METADATA[token.address] : undefined;

      return {
        mint: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        balance: token.amount,
        balanceFormatted: token.uiAmount,
        valueUsd: token.usdValue,
        priceUsd: token.price,
        change24h: token.priceChange24h ?? 0,
        logoUri: token.logoURI,
        isRwa,
        rwaMetadata,
      };
    });

    // Update cache via mutation
    await ctx.runMutation(internal.holdings.jupiter.updateCache, {
      walletAddress: args.walletAddress,
      holdings,
      totalValueUsd: data.totalUsdValue ?? 0,
    });

    return {
      holdings,
      totalValueUsd: data.totalUsdValue ?? 0,
      lastUpdated: Date.now(),
    };
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Update the holdings cache (internal only)
 */
export const updateCache = internalMutation({
  args: {
    walletAddress: v.string(),
    holdings: v.array(
      v.object({
        mint: v.string(),
        symbol: v.string(),
        name: v.string(),
        decimals: v.number(),
        balance: v.string(),
        balanceFormatted: v.number(),
        valueUsd: v.number(),
        priceUsd: v.number(),
        change24h: v.number(),
        logoUri: v.optional(v.string()),
        isRwa: v.optional(v.boolean()),
        rwaMetadata: v.optional(
          v.object({
            issuer: v.string(),
            type: v.string(),
            expectedYield: v.optional(v.number()),
          })
        ),
      })
    ),
    totalValueUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Clear old holdings for this wallet
    const existing = await ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    for (const h of existing) {
      await ctx.db.delete(h._id);
    }

    // Insert new holdings
    for (const holding of args.holdings) {
      await ctx.db.insert("tokenHoldings", {
        walletAddress: args.walletAddress,
        mint: holding.mint,
        symbol: holding.symbol,
        name: holding.name,
        decimals: holding.decimals,
        balance: holding.balance,
        balanceFormatted: holding.balanceFormatted,
        valueUsd: holding.valueUsd,
        priceUsd: holding.priceUsd,
        change24h: holding.change24h,
        logoUri: holding.logoUri,
        isRwa: holding.isRwa,
        rwaMetadata: holding.rwaMetadata,
        updatedAt: now,
      });
    }
  },
});

/**
 * Clear holdings cache for a wallet
 */
export const clearCache = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    for (const h of existing) {
      await ctx.db.delete(h._id);
    }

    return { deleted: existing.length };
  },
});
