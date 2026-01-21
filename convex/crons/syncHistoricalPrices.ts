/**
 * Sync Historical Crypto Prices
 *
 * Fetches historical price data from CoinGecko for chart displays.
 * Runs every 15 minutes to keep recent data fresh.
 */
import { v } from "convex/values";
import { internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Supported crypto symbols (same as syncRates)
const SUPPORTED_SYMBOLS = [
  "BTC",
  "ETH",
  "USDT",
  "USDC",
  "SOL",
  "XRP",
  "MATIC",
  "ARB",
  "OP",
  "AVAX",
];

// Symbol to CoinGecko ID mapping
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  SOL: "solana",
  XRP: "ripple",
  MATIC: "matic-network",
  ARB: "arbitrum",
  OP: "optimism",
  AVAX: "avalanche-2",
};

// CoinGecko API configuration
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

/**
 * Main cron handler - runs every 15 minutes
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    // Schedule the actual fetch (action for external API calls)
    await ctx.scheduler.runAfter(0, internal.crons.syncHistoricalPrices.fetchHistoricalPrices, {
      symbols: SUPPORTED_SYMBOLS,
    });
  },
});

/**
 * Fetch historical prices from CoinGecko market_chart endpoint
 */
export const fetchHistoricalPrices = internalAction({
  args: {
    symbols: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    console.log(`[HistoricalPrices] Fetching historical data for ${args.symbols.length} symbols`);

    // Process symbols sequentially to avoid rate limits
    for (const symbol of args.symbols) {
      try {
        const geckoId = SYMBOL_TO_COINGECKO_ID[symbol];
        if (!geckoId) continue;

        // Fetch 7 days of hourly data
        const data = await fetchMarketChart(geckoId, 7);

        if (data && data.prices) {
          // Store hourly data points
          for (const [timestamp, price] of data.prices) {
            await ctx.runMutation(internal.crons.syncHistoricalPrices.upsertPricePoint, {
              entityType: "crypto",
              entityId: symbol,
              timestamp,
              value: price,
              volume: findVolumeAtTimestamp(data.total_volumes, timestamp),
              granularity: "1h",
              source: "coingecko",
            });
          }
        }

        // Small delay between symbols to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[HistoricalPrices] Failed to fetch ${symbol}:`, error);
      }
    }

    console.log(`[HistoricalPrices] Completed historical data sync`);
  },
});

/**
 * Fetch market chart data from CoinGecko
 */
async function fetchMarketChart(
  geckoId: string,
  days: number
): Promise<{
  prices: [number, number][];
  total_volumes: [number, number][];
} | null> {
  try {
    const params = new URLSearchParams({
      vs_currency: "usd",
      days: days.toString(),
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
    }

    const response = await fetch(
      `${COINGECKO_API_URL}/coins/${geckoId}/market_chart?${params}`,
      { method: "GET", headers }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[HistoricalPrices] CoinGecko fetch failed for ${geckoId}:`, error);
    return null;
  }
}

/**
 * Find volume at a specific timestamp
 */
function findVolumeAtTimestamp(
  volumes: [number, number][] | undefined,
  timestamp: number
): number | undefined {
  if (!volumes) return undefined;
  const match = volumes.find(([t]) => Math.abs(t - timestamp) < 3600000); // Within 1 hour
  return match ? match[1] : undefined;
}

/**
 * Upsert a price history point
 */
export const upsertPricePoint = internalMutation({
  args: {
    entityType: v.union(v.literal("crypto"), v.literal("market")),
    entityId: v.string(),
    timestamp: v.number(),
    value: v.number(),
    volume: v.optional(v.number()),
    granularity: v.union(v.literal("1h"), v.literal("1d")),
    source: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Check if point already exists for this entity at this timestamp
    const existing = await ctx.db
      .query("priceHistory")
      .withIndex("by_entity_time", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId).eq("timestamp", args.timestamp)
      )
      .first();

    if (existing) {
      // Update if value changed significantly (>0.1% change)
      const pctChange = Math.abs((args.value - existing.value) / existing.value);
      if (pctChange > 0.001) {
        await ctx.db.patch(existing._id, {
          value: args.value,
          volume: args.volume,
          source: args.source,
        });
      }
    } else {
      // Insert new point
      await ctx.db.insert("priceHistory", {
        entityType: args.entityType,
        entityId: args.entityId,
        timestamp: args.timestamp,
        value: args.value,
        volume: args.volume,
        granularity: args.granularity,
        source: args.source,
      });
    }
  },
});

/**
 * Clean up old historical data (keep last 90 days of hourly, unlimited daily)
 */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days ago

    // Get old hourly data
    const oldHourlyData = await ctx.db
      .query("priceHistory")
      .withIndex("by_entity_granularity")
      .filter((q) =>
        q.and(
          q.eq(q.field("granularity"), "1h"),
          q.lt(q.field("timestamp"), cutoff)
        )
      )
      .take(1000); // Batch delete

    for (const record of oldHourlyData) {
      await ctx.db.delete(record._id);
    }

    if (oldHourlyData.length > 0) {
      console.log(`[HistoricalPrices] Cleaned up ${oldHourlyData.length} old hourly records`);
    }
  },
});

/**
 * Manually trigger historical sync (for initial population)
 */
export const triggerSync = internalMutation({
  args: {
    symbols: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<void> => {
    const symbols = args.symbols ?? SUPPORTED_SYMBOLS;
    await ctx.scheduler.runAfter(0, internal.crons.syncHistoricalPrices.fetchHistoricalPrices, {
      symbols,
    });
  },
});
