/**
 * Birdeye API Integration
 *
 * Provides historical OHLCV price data for Solana tokens.
 * Used for performance calculations in token detail screen.
 */
import { v } from "convex/values";
import { query, action, internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const BIRDEYE_API_URL = "https://public-api.birdeye.so";

// Cache TTL: 1 hour for OHLCV data (to respect 60 RPM rate limit)
const OHLCV_CACHE_TTL = 60 * 60 * 1000;

// Time periods and their configurations
const PERIOD_CONFIG = {
  "1D": { type: "15m", seconds: 24 * 60 * 60 },
  "1W": { type: "1H", seconds: 7 * 24 * 60 * 60 },
  "1M": { type: "4H", seconds: 30 * 24 * 60 * 60 },
  "3M": { type: "1D", seconds: 90 * 24 * 60 * 60 },
  "1Y": { type: "1D", seconds: 365 * 24 * 60 * 60 },
  "ALL": { type: "1W", seconds: 3 * 365 * 24 * 60 * 60 }, // 3 years max
} as const;

type PeriodKey = keyof typeof PERIOD_CONFIG;

// ============================================================================
// Queries
// ============================================================================

/**
 * Get cached OHLCV data for a token
 */
export const getTokenOHLCV = query({
  args: {
    mint: v.string(),
    period: v.union(
      v.literal("1D"),
      v.literal("1W"),
      v.literal("1M"),
      v.literal("3M"),
      v.literal("1Y"),
      v.literal("ALL")
    ),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("tokenOHLCV")
      .withIndex("by_mint_period", (q) =>
        q.eq("mint", args.mint).eq("period", args.period)
      )
      .first();

    if (!cached) return null;

    const isStale = Date.now() - cached.updatedAt > OHLCV_CACHE_TTL;

    return {
      mint: cached.mint,
      period: cached.period,
      data: cached.data,
      updatedAt: cached.updatedAt,
      isStale,
    };
  },
});

/**
 * Get performance data for a token (calculated from OHLCV)
 */
export const getTokenPerformance = query({
  args: { mint: v.string() },
  handler: async (ctx, args) => {
    const periods: PeriodKey[] = ["1D", "1M", "1Y", "ALL"];
    const performance: Array<{
      period: string;
      change: number | null;
      percentChange: number | null;
    }> = [];

    for (const period of periods) {
      const cached = await ctx.db
        .query("tokenOHLCV")
        .withIndex("by_mint_period", (q) =>
          q.eq("mint", args.mint).eq("period", period)
        )
        .first();

      if (cached && cached.data.length > 0) {
        const firstPrice = cached.data[0].c;
        const lastPrice = cached.data[cached.data.length - 1].c;
        const change = lastPrice - firstPrice;
        const percentChange = firstPrice > 0 ? (change / firstPrice) * 100 : null;

        performance.push({
          period: period === "ALL" ? "All Time" : period === "1D" ? "1 Day" : period === "1M" ? "1 Month" : "1 Year",
          change,
          percentChange,
        });
      } else {
        performance.push({
          period: period === "ALL" ? "All Time" : period === "1D" ? "1 Day" : period === "1M" ? "1 Month" : "1 Year",
          change: null,
          percentChange: null,
        });
      }
    }

    return performance;
  },
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Fetch OHLCV data from Birdeye API (internal)
 */
export const fetchTokenOHLCVInternal = internalAction({
  args: {
    mint: v.string(),
    period: v.union(
      v.literal("1D"),
      v.literal("1W"),
      v.literal("1M"),
      v.literal("3M"),
      v.literal("1Y"),
      v.literal("ALL")
    ),
  },
  handler: async (ctx, args) => {
    const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
    if (!BIRDEYE_API_KEY) {
      console.warn("[Birdeye] API key not configured");
      return { success: false, error: "API key not configured" };
    }

    const config = PERIOD_CONFIG[args.period];
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - config.seconds;

    try {
      const url = new URL(`${BIRDEYE_API_URL}/defi/ohlcv`);
      url.searchParams.set("address", args.mint);
      url.searchParams.set("type", config.type);
      url.searchParams.set("time_from", timeFrom.toString());
      url.searchParams.set("time_to", now.toString());

      const response = await fetch(url.toString(), {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
          "x-chain": "solana",
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`[Birdeye] API error: ${response.status} - ${errorText}`);
        return { success: false, error: `API error: ${response.status}` };
      }

      const result = await response.json();

      if (!result.success || !result.data?.items) {
        console.warn(`[Birdeye] No data for ${args.mint} period ${args.period}`);
        return { success: false, error: "No data available" };
      }

      // Transform to simplified format
      const ohlcvData = result.data.items.map((item: {
        o: number;
        h: number;
        l: number;
        c: number;
        v: number;
        unixTime: number;
      }) => ({
        o: item.o,
        h: item.h,
        l: item.l,
        c: item.c,
        v: item.v,
        t: item.unixTime,
      }));

      // Cache the data
      await ctx.runMutation(internal.explore.birdeye.updateOHLCVCache, {
        mint: args.mint,
        period: args.period,
        data: ohlcvData,
      });

      console.log(`[Birdeye] Fetched ${ohlcvData.length} candles for ${args.mint} (${args.period})`);

      return { success: true, count: ohlcvData.length };
    } catch (error) {
      console.error("[Birdeye] Fetch error:", error);
      return { success: false, error: "Network error" };
    }
  },
});

/**
 * Fetch performance data for all periods
 */
export const fetchTokenPerformance = action({
  args: { mint: v.string() },
  handler: async (ctx, args) => {
    console.log(`[Birdeye] fetchTokenPerformance called for ${args.mint}`);
    const periods: PeriodKey[] = ["1D", "1M", "1Y", "ALL"];
    const results: Record<string, boolean> = {};

    for (const period of periods) {
      console.log(`[Birdeye] Fetching ${period} for ${args.mint}`);
      const result = await ctx.runAction(internal.explore.birdeye.fetchTokenOHLCVInternal, {
        mint: args.mint,
        period,
      });
      console.log(`[Birdeye] ${period} result:`, result);
      results[period] = result.success;
    }

    console.log(`[Birdeye] All results:`, results);
    return results;
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Update OHLCV cache
 */
export const updateOHLCVCache = internalMutation({
  args: {
    mint: v.string(),
    period: v.string(),
    data: v.array(
      v.object({
        o: v.number(),
        h: v.number(),
        l: v.number(),
        c: v.number(),
        v: v.number(),
        t: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tokenOHLCV")
      .withIndex("by_mint_period", (q) =>
        q.eq("mint", args.mint).eq("period", args.period)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        data: args.data,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("tokenOHLCV", {
        mint: args.mint,
        period: args.period,
        data: args.data,
        updatedAt: now,
      });
    }
  },
});
