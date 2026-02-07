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
      const rates = await fetchExternalRates(args.symbols);

      // Batch update all rates in a single mutation
      if (rates.length > 0) {
        await ctx.runMutation(internal.crons.syncRates.batchUpsertRates, {
          rates,
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
 * Batch upsert all crypto rates in a single mutation
 */
export const batchUpsertRates = internalMutation({
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
  handler: async (ctx, args): Promise<void> => {
    for (const rate of args.rates) {
      const existing = await ctx.db
        .query("cryptoRates")
        .withIndex("by_symbol", (q) => q.eq("symbol", rate.symbol))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: rate.name,
          usdPrice: rate.usdPrice,
          change24h: rate.change24h,
          volume24h: rate.volume24h,
          marketCap: rate.marketCap,
          source: rate.source,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("cryptoRates", {
          symbol: rate.symbol,
          name: rate.name,
          usdPrice: rate.usdPrice,
          change24h: rate.change24h,
          volume24h: rate.volume24h,
          marketCap: rate.marketCap,
          source: rate.source,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  },
});

// CoinGecko API configuration
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY; // Optional for higher rate limits

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

/**
 * Fetch rates from CoinGecko API
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
  try {
    // Convert symbols to CoinGecko IDs
    const ids = symbols
      .map(s => SYMBOL_TO_COINGECKO_ID[s])
      .filter(Boolean)
      .join(",");

    if (!ids) {
      console.warn("[CryptoRates] No valid symbols to fetch");
      return [];
    }

    // Build request URL
    const params = new URLSearchParams({
      ids,
      vs_currencies: "usd",
      include_24hr_change: "true",
      include_24hr_vol: "true",
      include_market_cap: "true",
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    // Add API key if available for higher rate limits
    if (COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
    }

    const response = await fetch(`${COINGECKO_API_URL}/simple/price?${params}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    // Map CoinGecko response to our format
    const results: Array<{
      symbol: string;
      name: string;
      usdPrice: number;
      change24h: number;
      volume24h: number;
      marketCap: number;
      source: string;
    }> = [];

    for (const symbol of symbols) {
      const geckoId = SYMBOL_TO_COINGECKO_ID[symbol];
      if (!geckoId || !data[geckoId]) continue;

      const coinData = data[geckoId];

      results.push({
        symbol,
        name: getTokenName(symbol),
        usdPrice: coinData.usd ?? 0,
        change24h: coinData.usd_24h_change ?? 0,
        volume24h: coinData.usd_24h_vol ?? 0,
        marketCap: coinData.usd_market_cap ?? 0,
        source: "coingecko",
      });
    }

    console.log(`[CryptoRates] Fetched ${results.length} rates from CoinGecko`);
    return results;

  } catch (error) {
    console.error("[CryptoRates] CoinGecko fetch failed, using fallback:", error);

    // Fallback to last known rates with staleness flag
    return fetchFallbackRates(symbols);
  }
}

/**
 * Fallback rates when API is unavailable
 * These are emergency fallback values - should trigger alerts in production
 */
function fetchFallbackRates(symbols: string[]): Array<{
  symbol: string;
  name: string;
  usdPrice: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  source: string;
}> {
  console.warn("[CryptoRates] Using fallback rates - API unavailable");

  const fallbackPrices: Record<string, number> = {
    BTC: 45000,
    ETH: 2400,
    USDT: 1.00,
    USDC: 1.00,
    SOL: 100,
    XRP: 0.60,
    MATIC: 0.80,
    ARB: 1.20,
    OP: 2.50,
    AVAX: 35,
  };

  return symbols.map(symbol => ({
    symbol,
    name: getTokenName(symbol),
    usdPrice: fallbackPrices[symbol] ?? 0,
    change24h: 0,
    volume24h: 0,
    marketCap: 0,
    source: "fallback_stale", // Mark as stale for monitoring
  }));
}

/**
 * Get human-readable token name
 */
function getTokenName(symbol: string): string {
  const names: Record<string, string> = {
    BTC: "Bitcoin",
    ETH: "Ethereum",
    USDT: "Tether",
    USDC: "USD Coin",
    SOL: "Solana",
    XRP: "Ripple",
    MATIC: "Polygon",
    ARB: "Arbitrum",
    OP: "Optimism",
    AVAX: "Avalanche",
  };
  return names[symbol] || symbol;
}

// ============ FX RATES ============

// Supported fiat currencies
const SUPPORTED_FIAT = ["EUR", "GBP", "CHF", "JPY", "AUD", "CAD"];

// ExchangeRate API configuration (free tier available)
const EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";

/**
 * FX rate sync cron - runs every 5 minutes
 */
export const runFxSync = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    await ctx.scheduler.runAfter(0, internal.crons.syncRates.fetchFxRates, {
      currencies: SUPPORTED_FIAT,
    });
  },
});

/**
 * Fetch FX rates from external API
 */
export const fetchFxRates = internalAction({
  args: {
    currencies: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      console.log(`[FxRates] Fetching rates for ${args.currencies.length} currencies`);

      // Fetch rates from ExchangeRate API
      const rates = await fetchExternalFxRates(args.currencies);

      // Batch update all FX rates in a single mutation
      if (rates.length > 0) {
        await ctx.runMutation(internal.crons.syncRates.batchUpsertFxRates, {
          rates,
        });
      }

      console.log(`[FxRates] Updated ${rates.length} FX rates`);

    } catch (error) {
      console.error("[FxRates] Failed to fetch FX rates:", error);
    }
  },
});

/**
 * Upsert an FX rate record
 */
export const upsertFxRate = internalMutation({
  args: {
    currency: v.string(),
    rate: v.number(),
    source: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Check if rate already exists
    const existing = await ctx.db
      .query("fxRates")
      .withIndex("by_currency", (q) => q.eq("currency", args.currency))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rate: args.rate,
        source: args.source,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("fxRates", {
        currency: args.currency,
        rate: args.rate,
        source: args.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Batch upsert all FX rates in a single mutation
 */
export const batchUpsertFxRates = internalMutation({
  args: {
    rates: v.array(
      v.object({
        currency: v.string(),
        rate: v.number(),
        source: v.string(),
      })
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    for (const rate of args.rates) {
      const existing = await ctx.db
        .query("fxRates")
        .withIndex("by_currency", (q) => q.eq("currency", rate.currency))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          rate: rate.rate,
          source: rate.source,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("fxRates", {
          currency: rate.currency,
          rate: rate.rate,
          source: rate.source,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  },
});

/**
 * Fetch FX rates from ExchangeRate API
 */
async function fetchExternalFxRates(currencies: string[]): Promise<Array<{
  currency: string;
  rate: number;
  source: string;
}>> {
  try {
    const response = await fetch(EXCHANGE_RATE_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`ExchangeRate API error: ${response.status}`);
    }

    const data = await response.json();
    const rates = data.rates;

    if (!rates) {
      throw new Error("No rates in response");
    }

    const results: Array<{
      currency: string;
      rate: number;
      source: string;
    }> = [];

    for (const currency of currencies) {
      // API returns rates relative to USD base
      // So EUR: 0.92 means 1 USD = 0.92 EUR
      // We want: 1 EUR = X USD (inverse)
      const apiRate = rates[currency];

      if (apiRate) {
        results.push({
          currency,
          rate: 1 / apiRate, // Invert: 1 EUR = 1/0.92 USD = 1.087 USD
          source: "exchangerate-api",
        });
      }
    }

    console.log(`[FxRates] Fetched ${results.length} rates from ExchangeRate API`);
    return results;

  } catch (error) {
    console.error("[FxRates] ExchangeRate API failed, using fallback:", error);

    // Fallback rates (should trigger alerts)
    return fetchFallbackFxRates(currencies);
  }
}

/**
 * Fallback FX rates when API is unavailable
 */
function fetchFallbackFxRates(currencies: string[]): Array<{
  currency: string;
  rate: number;
  source: string;
}> {
  console.warn("[FxRates] Using fallback FX rates - API unavailable");

  const fallbackRates: Record<string, number> = {
    EUR: 1.08,
    GBP: 1.26,
    CHF: 1.12,
    JPY: 0.0067,
    AUD: 0.65,
    CAD: 0.74,
  };

  return currencies.map(currency => ({
    currency,
    rate: fallbackRates[currency] ?? 1,
    source: "fallback_stale",
  }));
}
