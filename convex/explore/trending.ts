/**
 * Trending Tokens & Open Markets Convex Functions
 *
 * Provides shared caching for explore/discovery data:
 * - Trending tokens from Jupiter Tokens API V2
 * - Open prediction markets from DFlow
 *
 * This data is shared across all users (not user-specific).
 */
import { v } from "convex/values";
import { query, mutation, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const JUPITER_TOKENS_URL = "https://api.jup.ag/tokens";
const DFLOW_API_URL = "https://api.pond.dflow.net/api/v1";

// Cache TTL in milliseconds
const TRENDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MARKETS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// ============================================================================
// Trending Tokens Queries
// ============================================================================

/**
 * Get cached trending tokens
 */
export const getTrendingTokens = query({
  args: {
    category: v.union(
      v.literal("trending"),
      v.literal("top_traded"),
      v.literal("recent")
    ),
    interval: v.string(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("trendingTokens")
      .withIndex("by_category_interval", (q) =>
        q.eq("category", args.category).eq("interval", args.interval)
      )
      .first();

    if (!cached) return null;

    // Check if cache is stale
    const isStale = Date.now() - cached.updatedAt > TRENDING_CACHE_TTL;

    return {
      tokens: cached.tokens,
      category: cached.category,
      interval: cached.interval,
      updatedAt: cached.updatedAt,
      isStale,
    };
  },
});

/**
 * Get all trending categories
 */
export const getAllTrendingCategories = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("trendingTokens").collect();

    return all.map((entry) => ({
      category: entry.category,
      interval: entry.interval,
      tokenCount: entry.tokens.length,
      updatedAt: entry.updatedAt,
      isStale: Date.now() - entry.updatedAt > TRENDING_CACHE_TTL,
    }));
  },
});

// ============================================================================
// Open Markets Queries
// ============================================================================

/**
 * Get cached open prediction markets
 */
export const getOpenMarkets = query({
  args: {
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let markets;

    if (args.category) {
      markets = await ctx.db
        .query("openPredictionMarkets")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      markets = await ctx.db
        .query("openPredictionMarkets")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .collect();
    }

    // Sort by volume and limit
    const sorted = markets.sort((a, b) => b.volume24h - a.volume24h);
    const limited = args.limit ? sorted.slice(0, args.limit) : sorted;

    return limited;
  },
});

/**
 * Get market categories
 */
export const getMarketCategories = query({
  handler: async (ctx) => {
    const markets = await ctx.db.query("openPredictionMarkets").collect();

    const categories = new Set(markets.map((m) => m.category));
    const categoryCounts: Record<string, number> = {};

    for (const market of markets) {
      categoryCounts[market.category] =
        (categoryCounts[market.category] || 0) + 1;
    }

    return Array.from(categories).map((cat) => ({
      category: cat,
      count: categoryCounts[cat],
    }));
  },
});

/**
 * Search markets by question text
 */
export const searchMarkets = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const markets = await ctx.db.query("openPredictionMarkets").collect();

    const queryLower = args.query.toLowerCase();
    return markets.filter(
      (m) =>
        m.question.toLowerCase().includes(queryLower) ||
        m.ticker.toLowerCase().includes(queryLower)
    );
  },
});

// ============================================================================
// Actions (External API calls)
// ============================================================================

/**
 * Refresh trending tokens from Jupiter
 */
export const refreshTrendingTokens = action({
  args: {
    category: v.union(
      v.literal("trending"),
      v.literal("top_traded"),
      v.literal("recent")
    ),
    interval: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const interval = args.interval || "24h";

    let endpoint: string;
    switch (args.category) {
      case "trending":
        endpoint = `/v2/toptrending/${interval}?limit=50`;
        break;
      case "top_traded":
        endpoint = `/v2/toptraded/${interval}?limit=50`;
        break;
      case "recent":
        endpoint = `/v2/recent?limit=30`;
        break;
    }

    const response = await fetch(`${JUPITER_TOKENS_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        // Add API key if available
        // "x-api-key": process.env.JUPITER_API_KEY || "",
      },
    });

    if (!response.ok) {
      throw new Error(`Jupiter Tokens API error: ${response.status}`);
    }

    const data = await response.json();
    const rawTokens = data.tokens || data.mints || data.data || [];

    const tokens = rawTokens.map(
      (token: {
        address: string;
        symbol: string;
        name: string;
        price?: number;
        dailyChange?: number;
        volume24h?: number;
        logoURI?: string;
        verified?: boolean;
        organicScore?: number;
        tags?: string[];
      }) => ({
        mint: token.address,
        symbol: token.symbol,
        name: token.name,
        priceUsd: token.price ?? 0,
        change24h: token.dailyChange ?? 0,
        volume24h: token.volume24h ?? 0,
        logoUri: token.logoURI,
        verified: token.verified ?? token.tags?.includes("verified") ?? false,
        organicScore: token.organicScore,
      })
    );

    // Update cache
    await ctx.runMutation(internal.explore.trending.updateTrendingCache, {
      category: args.category,
      interval,
      tokens,
    });

    return { tokens, category: args.category, interval };
  },
});

/**
 * Refresh open markets from DFlow
 */
export const refreshOpenMarkets = action({
  handler: async (ctx) => {
    const response = await fetch(`${DFLOW_API_URL}/markets?limit=100`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`DFlow API error: ${response.status}`);
    }

    const data = await response.json();
    const rawMarkets = data.markets || [];

    // Filter to open markets only
    const openMarkets = rawMarkets
      .filter((m: { status: string }) => m.status === "open")
      .map(
        (market: {
          id: string;
          ticker: string;
          event_id: string;
          title: string;
          status: string;
          yes_price: number;
          no_price: number;
          volume_24h: number;
          end_date: string;
          category: string;
          resolution_source?: string;
        }) => ({
          marketId: market.id,
          ticker: market.ticker,
          eventId: market.event_id,
          question: market.title,
          status: market.status as "open" | "closed" | "resolved",
          yesPrice: market.yes_price,
          noPrice: market.no_price,
          volume24h: market.volume_24h,
          endDate: market.end_date,
          category: market.category,
          resolutionSource: market.resolution_source,
        })
      );

    // Update cache
    await ctx.runMutation(internal.explore.trending.updateMarketsCache, {
      markets: openMarkets,
    });

    return { markets: openMarkets, count: openMarkets.length };
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Update trending tokens cache
 */
export const updateTrendingCache = internalMutation({
  args: {
    category: v.union(
      v.literal("trending"),
      v.literal("top_traded"),
      v.literal("recent")
    ),
    interval: v.string(),
    tokens: v.array(
      v.object({
        mint: v.string(),
        symbol: v.string(),
        name: v.string(),
        priceUsd: v.number(),
        change24h: v.number(),
        volume24h: v.number(),
        logoUri: v.optional(v.string()),
        verified: v.boolean(),
        organicScore: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Find existing cache entry
    const existing = await ctx.db
      .query("trendingTokens")
      .withIndex("by_category_interval", (q) =>
        q.eq("category", args.category).eq("interval", args.interval)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tokens: args.tokens,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("trendingTokens", {
        category: args.category,
        interval: args.interval,
        tokens: args.tokens,
        updatedAt: now,
      });
    }
  },
});

/**
 * Update open markets cache
 */
export const updateMarketsCache = internalMutation({
  args: {
    markets: v.array(
      v.object({
        marketId: v.string(),
        ticker: v.string(),
        eventId: v.string(),
        question: v.string(),
        status: v.union(
          v.literal("open"),
          v.literal("closed"),
          v.literal("resolved")
        ),
        yesPrice: v.number(),
        noPrice: v.number(),
        volume24h: v.number(),
        endDate: v.string(),
        category: v.string(),
        resolutionSource: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Clear all existing open markets
    const existing = await ctx.db.query("openPredictionMarkets").collect();
    for (const m of existing) {
      await ctx.db.delete(m._id);
    }

    // Insert new markets
    for (const market of args.markets) {
      await ctx.db.insert("openPredictionMarkets", {
        marketId: market.marketId,
        ticker: market.ticker,
        eventId: market.eventId,
        question: market.question,
        status: market.status,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        volume24h: market.volume24h,
        endDate: market.endDate,
        category: market.category,
        resolutionSource: market.resolutionSource,
        updatedAt: now,
      });
    }
  },
});

/**
 * Clear all explore caches
 */
export const clearAllCaches = mutation({
  handler: async (ctx) => {
    const trending = await ctx.db.query("trendingTokens").collect();
    for (const t of trending) {
      await ctx.db.delete(t._id);
    }

    const markets = await ctx.db.query("openPredictionMarkets").collect();
    for (const m of markets) {
      await ctx.db.delete(m._id);
    }

    return {
      trendingDeleted: trending.length,
      marketsDeleted: markets.length,
    };
  },
});
