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
    const JUPITER_ULTRA_URL = "https://api.jup.ag/ultra/v1";
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

    if (!JUPITER_API_KEY) {
      throw new Error("JUPITER_API_KEY environment variable not set");
    }

    // Fetch from Jupiter Ultra API
    const response = await fetch(
      `${JUPITER_ULTRA_URL}/holdings/${args.walletAddress}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": JUPITER_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Jupiter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Jupiter Ultra returns tokens as object keyed by mint address:
    // { "amount": "sol_lamports", "uiAmount": 1.5, "tokens": { "mint1": [...], "mint2": [...] } }
    const holdings: Array<{
      mint: string;
      symbol: string;
      name: string;
      decimals: number;
      balance: string;
      balanceFormatted: number;
      valueUsd: number;
      priceUsd: number;
      change24h: number;
      logoUri?: string;
      isRwa?: boolean;
      rwaMetadata?: { issuer: string; type: string; expectedYield?: number };
    }> = [];

    let totalValueUsd = 0;

    // Add native SOL balance if present
    if (data.uiAmount && data.uiAmount > 0) {
      const solPrice = 0; // Jupiter doesn't include SOL price in holdings response
      holdings.push({
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        balance: data.amount || "0",
        balanceFormatted: data.uiAmount,
        valueUsd: 0, // Would need price feed
        priceUsd: solPrice,
        change24h: 0,
        logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
        isRwa: false,
      });
    }

    // Iterate over token holdings (object keyed by mint)
    const tokensObj = data.tokens || {};
    for (const [mint, accounts] of Object.entries(tokensObj)) {
      // Each mint can have multiple token accounts (array)
      const tokenAccounts = accounts as Array<{
        account: string;
        amount: string;
        uiAmount: number;
        uiAmountString: string;
        decimals: number;
        isFrozen?: boolean;
      }>;

      if (!tokenAccounts || tokenAccounts.length === 0) continue;

      // Sum up balances across all accounts for this mint
      let totalBalance = BigInt(0);
      let totalUiAmount = 0;
      let decimals = 0;

      for (const acc of tokenAccounts) {
        totalBalance += BigInt(acc.amount || "0");
        totalUiAmount += acc.uiAmount || 0;
        decimals = acc.decimals || 0;
      }

      const isRwa = RWA_MINTS.has(mint);
      const rwaMetadata = isRwa ? RWA_METADATA[mint] : undefined;

      holdings.push({
        mint,
        symbol: mint.slice(0, 4).toUpperCase(), // Placeholder - would need token list
        name: mint.slice(0, 8), // Placeholder
        decimals,
        balance: totalBalance.toString(),
        balanceFormatted: totalUiAmount,
        valueUsd: 0, // Jupiter holdings doesn't include prices
        priceUsd: 0,
        change24h: 0,
        isRwa,
        rwaMetadata,
      });
    }

    // Update cache via mutation
    await ctx.runMutation(internal.holdings.jupiter.updateCache, {
      walletAddress: args.walletAddress,
      holdings,
      totalValueUsd,
    });

    return {
      holdings,
      totalValueUsd,
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
