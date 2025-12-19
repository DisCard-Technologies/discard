/**
 * Sync Crypto Rates
 *
 * Fetches latest cryptocurrency prices from external APIs.
 * Runs every 1 minute for real-time price updates.
 */
import { v } from "convex/values";
import { internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Supported crypto symbols
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

/**
 * Main cron handler - runs every minute
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    // Schedule the actual rate fetch (action for external API calls)
    await ctx.scheduler.runAfter(0, internal.crons.syncRates.fetchRates, {
      symbols: SUPPORTED_SYMBOLS,
    });
  },
});

/**
 * Fetch rates from external API
 */
export const fetchRates = internalAction({
  args: {
    symbols: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      console.log(`Fetching rates for ${args.symbols.length} symbols`);

      // Fetch rates from external API
      // In production, use CoinGecko, CoinMarketCap, or similar
      const rates = await fetchExternalRates(args.symbols);

      // Update rates in database
      for (const rate of rates) {
        await ctx.runMutation(internal.crons.syncRates.upsertRate, {
          symbol: rate.symbol,
          name: rate.name,
          usdPrice: rate.usdPrice,
          change24h: rate.change24h,
          volume24h: rate.volume24h,
          marketCap: rate.marketCap,
          source: rate.source,
        });
      }

      console.log(`Updated ${rates.length} crypto rates`);

    } catch (error) {
      console.error("Failed to fetch crypto rates:", error);
    }
  },
});

/**
 * Upsert a rate record
 */
export const upsertRate = internalMutation({
  args: {
    symbol: v.string(),
    name: v.string(),
    usdPrice: v.number(),
    change24h: v.number(),
    volume24h: v.number(),
    marketCap: v.number(),
    source: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Check if rate already exists
    const existing = await ctx.db
      .query("cryptoRates")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .first();

    if (existing) {
      // Update existing rate
      await ctx.db.patch(existing._id, {
        name: args.name,
        usdPrice: args.usdPrice,
        change24h: args.change24h,
        volume24h: args.volume24h,
        marketCap: args.marketCap,
        source: args.source,
        updatedAt: Date.now(),
      });
    } else {
      // Insert new rate
      await ctx.db.insert("cryptoRates", {
        symbol: args.symbol,
        name: args.name,
        usdPrice: args.usdPrice,
        change24h: args.change24h,
        volume24h: args.volume24h,
        marketCap: args.marketCap,
        source: args.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Fetch rates from external API
 * This is a placeholder - actual implementation would call real APIs
 */
async function fetchExternalRates(symbols: string[]): Promise<Array<{
  symbol: string;
  name: string;
  usdPrice: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  source: string;
}>> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  // In production, this would call:
  // - CoinGecko: /api/v3/simple/price
  // - CoinMarketCap: /v1/cryptocurrency/quotes/latest
  // - Binance: /api/v3/ticker/24hr

  // Base prices (simulated - would come from real API)
  const basePrices: Record<string, { name: string; price: number; marketCap: number }> = {
    BTC: { name: "Bitcoin", price: 43250.00, marketCap: 847000000000 },
    ETH: { name: "Ethereum", price: 2280.00, marketCap: 274000000000 },
    USDT: { name: "Tether", price: 1.00, marketCap: 91000000000 },
    USDC: { name: "USD Coin", price: 1.00, marketCap: 24000000000 },
    SOL: { name: "Solana", price: 98.50, marketCap: 42000000000 },
    XRP: { name: "Ripple", price: 0.62, marketCap: 33000000000 },
    MATIC: { name: "Polygon", price: 0.85, marketCap: 7900000000 },
    ARB: { name: "Arbitrum", price: 1.15, marketCap: 3800000000 },
    OP: { name: "Optimism", price: 2.45, marketCap: 2600000000 },
    AVAX: { name: "Avalanche", price: 35.80, marketCap: 13200000000 },
  };

  return symbols.map((symbol) => {
    const base = basePrices[symbol] || { name: symbol, price: 0, marketCap: 0 };

    // Add small random variation to simulate real market movement
    const variation = (Math.random() - 0.5) * 0.02; // +/- 1%
    const price = base.price * (1 + variation);

    return {
      symbol,
      name: base.name,
      usdPrice: Math.round(price * 100) / 100,
      change24h: Math.round((Math.random() - 0.5) * 10 * 100) / 100, // +/- 5%
      volume24h: Math.round(base.marketCap * 0.05), // 5% of market cap
      marketCap: base.marketCap,
      source: "simulated",
    };
  });
}
