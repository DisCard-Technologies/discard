/**
 * Crypto Rates Convex Functions
 * Real-time cryptocurrency price data
 */
import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// List all crypto rates
export const list = query({
  args: {
    symbols: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (args.symbols && args.symbols.length > 0) {
      // Get specific symbols
      const rates = await Promise.all(
        args.symbols.map((symbol) =>
          ctx.db
            .query("cryptoRates")
            .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
            .first()
        )
      );
      return rates.filter(Boolean);
    }

    // Get all rates, sorted by market cap
    const rates = await ctx.db.query("cryptoRates").collect();
    return rates.sort((a, b) => b.marketCap - a.marketCap);
  },
});

// Time period to milliseconds mapping
const PERIOD_MS: Record<string, number> = {
  "1H": 60 * 60 * 1000,           // 1 hour
  "1D": 24 * 60 * 60 * 1000,      // 1 day
  "1W": 7 * 24 * 60 * 60 * 1000,  // 1 week
  "1M": 30 * 24 * 60 * 60 * 1000, // 30 days
  "1Y": 365 * 24 * 60 * 60 * 1000, // 1 year
  "ALL": 10 * 365 * 24 * 60 * 60 * 1000, // 10 years (effectively all)
};

// Get historical price data for a symbol
export const historical = query({
  args: {
    symbol: v.string(),
    period: v.optional(v.union(
      v.literal("1H"),
      v.literal("1D"),
      v.literal("1W"),
      v.literal("1M"),
      v.literal("1Y"),
      v.literal("ALL")
    )),
    days: v.optional(v.number()), // Legacy support
  },
  handler: async (ctx, args) => {
    const rate = await ctx.db
      .query("cryptoRates")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .first();

    if (!rate) {
      return null;
    }

    // Calculate time range
    const now = Date.now();
    const periodMs = args.period ? PERIOD_MS[args.period] : (args.days ?? 30) * 24 * 60 * 60 * 1000;
    const startTime = now - periodMs;

    // Query historical data from priceHistory table
    const historicalData = await ctx.db
      .query("priceHistory")
      .withIndex("by_entity_time", (q) =>
        q.eq("entityType", "crypto").eq("entityId", args.symbol)
      )
      .filter((q) => q.gte(q.field("timestamp"), startTime))
      .collect();

    // Sort by timestamp and map to expected format
    const sortedData = historicalData
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((point) => ({
        timestamp: point.timestamp,
        price: point.value,
        volume: point.volume,
      }));

    // If we have real data, return it
    if (sortedData.length > 0) {
      // Ensure last point reflects current price
      const history = [...sortedData];
      if (history.length > 0) {
        history[history.length - 1] = {
          ...history[history.length - 1],
          price: rate.usdPrice,
        };
      }

      return {
        symbol: args.symbol,
        name: rate.name,
        currentPrice: rate.usdPrice,
        history,
      };
    }

    // Fallback to generated data if no historical data yet
    // This ensures charts work before first sync completes
    const days = args.days ?? (args.period ? Math.ceil(periodMs / (24 * 60 * 60 * 1000)) : 30);
    const dayMs = 24 * 60 * 60 * 1000;

    const history = [];
    let price = rate.usdPrice;

    for (let i = days; i >= 0; i--) {
      const variance = 1 + (Math.random() - 0.5) * 0.1;
      price = price * variance;

      history.push({
        timestamp: now - i * dayMs,
        price: Math.max(0.01, price),
        volume: rate.volume24h * (0.8 + Math.random() * 0.4),
      });
    }

    if (history.length > 0) {
      history[history.length - 1].price = rate.usdPrice;
    }

    return {
      symbol: args.symbol,
      name: rate.name,
      currentPrice: rate.usdPrice,
      history,
      _fallback: true, // Indicator that this is fallback data
    };
  },
});

// Compare prices between multiple symbols
export const compare = query({
  args: {
    symbol: v.string(),
  },
  handler: async (ctx, args) => {
    const rate = await ctx.db
      .query("cryptoRates")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .first();

    if (!rate) {
      return null;
    }

    // Get top coins for comparison
    const allRates = await ctx.db.query("cryptoRates").collect();
    const topRates = allRates
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 10);

    return {
      symbol: args.symbol,
      rate,
      comparison: topRates.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        price: r.usdPrice,
        change24h: r.change24h,
        marketCap: r.marketCap,
        relativeTo: r.usdPrice / rate.usdPrice,
      })),
    };
  },
});

// Update crypto rates (called by cron job)
export const updateRates = mutation({
  args: {
    rates: v.array(
      v.object({
        symbol: v.string(),
        name: v.string(),
        usdPrice: v.number(),
        change24h: v.number(),
        volume24h: v.number(),
        marketCap: v.number(),
        source: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const rate of args.rates) {
      const existing = await ctx.db
        .query("cryptoRates")
        .withIndex("by_symbol", (q) => q.eq("symbol", rate.symbol))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...rate,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("cryptoRates", {
          ...rate,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return { updated: args.rates.length };
  },
});

