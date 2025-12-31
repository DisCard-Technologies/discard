/**
 * Token Holdings Convex Functions
 *
 * Provides caching and real-time subscriptions for token holdings
 * fetched from Helius DAS API.
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
 * Refresh holdings from Helius DAS API
 */
export const refreshHoldings = action({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    // Helius API key from environment or fallback
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "b7ee72d9-a0e7-4723-b386-48b23d0b3a41";
    const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

    // Fetch from Helius DAS API using getAssetsByOwner
    const response = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "holdings",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: args.walletAddress,
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Helius RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const result = data.result;
    const items = result?.items || [];
    const nativeBalance = result?.nativeBalance;

    // Transform Helius response to our holdings format
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

    // Add native SOL balance
    if (nativeBalance && nativeBalance.lamports > 0) {
      const solBalance = nativeBalance.lamports / 1e9;
      const solPrice = nativeBalance.price_per_sol || 0;
      const solValue = nativeBalance.total_price || (solBalance * solPrice);

      holdings.push({
        mint: "So11111111111111111111111111111111111111112", // Native SOL mint
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        balance: nativeBalance.lamports.toString(),
        balanceFormatted: solBalance,
        valueUsd: solValue,
        priceUsd: solPrice,
        change24h: 0,
        logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
        isRwa: false,
      });
      totalValueUsd += solValue;
    }

    // Process fungible tokens
    for (const item of items) {
      // Skip non-fungible assets (NFTs)
      if (item.interface !== "FungibleToken" && item.interface !== "FungibleAsset") {
        continue;
      }

      const tokenInfo = item.token_info;
      if (!tokenInfo || !tokenInfo.balance) continue;

      const mint = item.id;
      const metadata = item.content?.metadata || {};
      const priceInfo = tokenInfo.price_info || {};

      const decimals = tokenInfo.decimals || 0;
      const rawBalance = tokenInfo.balance || 0;
      const balanceFormatted = rawBalance / Math.pow(10, decimals);
      const priceUsd = priceInfo.price_per_token || 0;
      const valueUsd = priceInfo.total_price || (balanceFormatted * priceUsd);

      const isRwa = RWA_MINTS.has(mint);
      const rwaMetadata = isRwa ? RWA_METADATA[mint] : undefined;

      holdings.push({
        mint,
        symbol: tokenInfo.symbol || metadata.symbol || "???",
        name: metadata.name || tokenInfo.symbol || "Unknown",
        decimals,
        balance: rawBalance.toString(),
        balanceFormatted,
        valueUsd,
        priceUsd,
        change24h: 0, // Helius doesn't provide 24h change
        logoUri: item.content?.links?.image || item.content?.files?.[0]?.uri,
        isRwa,
        rwaMetadata,
      });

      totalValueUsd += valueUsd;
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
