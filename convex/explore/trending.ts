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
// Kalshi public API (no auth required for market data)
const KALSHI_API_URL = "https://api.elections.kalshi.com/trade-api/v2";
// Helius DAS API for Metaplex token metadata
const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com";

// Cache TTL in milliseconds
const TRENDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MARKETS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// ============================================================================
// Helius DAS Helper (Metaplex Token Metadata)
// ============================================================================

interface HeliusDasAsset {
  id: string;
  content?: {
    links?: {
      image?: string;
    };
    files?: Array<{
      uri?: string;
      cdn_uri?: string;
    }>;
  };
}

/**
 * Fetch token images from Helius DAS API (reads from Metaplex Token Metadata Program)
 * This is the canonical/primary source for all token logos on Solana.
 * Returns a map of mint address to image URL
 */
async function fetchTokenImagesFromHelius(
  mints: string[]
): Promise<Map<string, string>> {
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
  if (!HELIUS_API_KEY || mints.length === 0) {
    return new Map();
  }

  try {
    const rpcUrl = `${HELIUS_RPC_URL}/?api-key=${HELIUS_API_KEY}`;

    // Helius getAssetBatch supports up to 1000 assets per request
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-token-metadata",
        method: "getAssetBatch",
        params: { ids: mints },
      }),
    });

    if (!response.ok) {
      console.error(`[Helius DAS] API error: ${response.status}`);
      return new Map();
    }

    const data = await response.json();
    const assets: HeliusDasAsset[] = data.result || [];

    const imageMap = new Map<string, string>();

    for (const asset of assets) {
      if (!asset?.id) continue;

      // Try to get image URL from Metaplex metadata (in priority order)
      const imageUrl =
        asset.content?.links?.image ||
        asset.content?.files?.[0]?.cdn_uri ||
        asset.content?.files?.[0]?.uri;

      if (imageUrl) {
        imageMap.set(asset.id, imageUrl);
      }
    }

    console.log(`[Helius DAS] Fetched images for ${imageMap.size}/${mints.length} tokens`);
    return imageMap;
  } catch (error) {
    console.error("[Helius DAS] Failed to fetch token metadata:", error);
    return new Map();
  }
}

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

    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    if (!JUPITER_API_KEY) {
      throw new Error("JUPITER_API_KEY environment variable not set");
    }

    const response = await fetch(`${JUPITER_TOKENS_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": JUPITER_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Jupiter Tokens API error: ${response.status} - ${errorText}`);
    }

    // Jupiter Tokens API V2 returns an array directly, not wrapped in an object
    const rawTokens = await response.json();

    // Validate it's an array
    if (!Array.isArray(rawTokens)) {
      console.error("[Jupiter Tokens V2] Unexpected response format:", typeof rawTokens);
      throw new Error("Jupiter Tokens API returned unexpected format");
    }

    const tokens = rawTokens.map(
      (token: {
        id: string; // mint address
        symbol: string;
        name: string;
        icon?: string;
        usdPrice?: number;
        mcap?: number; // Jupiter API uses "mcap" not "marketCap"
        fdv?: number; // fully diluted valuation (fallback for mcap)
        isVerified?: boolean;
        organicScore?: number;
        tags?: string[];
        stats24h?: {
          priceChange?: number;
          buyVolume?: number;
          sellVolume?: number;
        };
      }) => ({
        mint: token.id,
        symbol: token.symbol,
        name: token.name,
        priceUsd: token.usdPrice ?? 0,
        change24h: token.stats24h?.priceChange ?? 0,
        volume24h: (token.stats24h?.buyVolume ?? 0) + (token.stats24h?.sellVolume ?? 0),
        marketCap: token.mcap ?? token.fdv,
        logoUri: undefined as string | undefined, // Will be populated from Helius DAS
        verified: token.isVerified ?? token.tags?.includes("verified") ?? false,
        organicScore: token.organicScore,
      })
    );

    // Fetch ALL token images from Helius DAS (Metaplex Token Metadata Program)
    // This is the canonical source for token logos on Solana
    const heliusImages = await fetchTokenImagesFromHelius(
      tokens.map((t) => t.mint)
    );

    // Apply Helius images to tokens
    for (const token of tokens) {
      if (heliusImages.has(token.mint)) {
        token.logoUri = heliusImages.get(token.mint);
      }
    }

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
 * Refresh open markets from Kalshi
 * Fetches events (not parlays) for cleaner questions and categories
 * Kalshi public API - no auth required for market data
 */
export const refreshOpenMarkets = action({
  handler: async (ctx) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      // Fetch events from Kalshi public API (cleaner than raw markets)
      const response = await fetch(
        `${KALSHI_API_URL}/events?status=open&limit=100&with_nested_markets=true`,
        {
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`[Kalshi] API error: ${response.status} - ${errorText}`);
        return { markets: [], count: 0, error: `Kalshi API returned ${response.status}` };
      }

      const data = await response.json();
      const rawEvents = data.events || [];

      // Map category identifiers to human-readable names
      const categoryMap: Record<string, string> = {
        'politics': 'Politics',
        'economics': 'Economics',
        'financials': 'Finance',
        'crypto': 'Crypto',
        'climate': 'Climate',
        'science': 'Science',
        'tech': 'Tech',
        'entertainment': 'Entertainment',
        'sports': 'Sports',
        'culture': 'Culture',
        'world': 'World',
        'health': 'Health',
      };

      // Transform Kalshi events to our format
      const openMarkets = rawEvents.flatMap(
        (event: {
          event_ticker: string;
          series_ticker: string;
          title: string;
          subtitle?: string;
          category: string;
          markets?: Array<{
            ticker: string;
            title?: string;
            subtitle?: string;
            status: string;
            yes_bid: number;
            yes_ask: number;
            no_bid: number;
            no_ask: number;
            last_price: number;
            volume: number;
            volume_24h?: number;
            open_interest: number;
            close_time: string;
            expiration_time?: string;
          }>;
          strike_date?: string;
          mutually_exclusive?: boolean;
        }) => {
          // Get category - use the event's category field
          const rawCategory = event.category?.toLowerCase() || 'general';
          const category = categoryMap[rawCategory] ||
            rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);

          // If event has nested markets, create entries for each
          if (event.markets && event.markets.length > 0) {
            return event.markets
              .filter(m => m.status === 'open' || m.status === 'active')
              .map(market => {
                // Calculate mid prices (convert from cents to decimal 0-1)
                const yesPrice = market.yes_bid && market.yes_ask
                  ? ((market.yes_bid + market.yes_ask) / 2) / 100
                  : (market.last_price || 50) / 100;
                const noPrice = 1 - yesPrice;

                // Build question from event title + market subtitle if available
                let question = event.title;
                if (market.subtitle) {
                  question = `${event.title}: ${market.subtitle}`;
                } else if (market.title && market.title !== event.title) {
                  question = market.title;
                }

                return {
                  marketId: market.ticker,
                  ticker: market.ticker,
                  eventId: event.event_ticker,
                  question,
                  status: "open" as const,
                  yesPrice,
                  noPrice,
                  volume24h: market.volume_24h || market.volume || 0,
                  endDate: market.close_time || market.expiration_time || event.strike_date || "",
                  category,
                  resolutionSource: "Kalshi",
                };
              });
          }

          // Fallback: create single entry from event info
          return [{
            marketId: event.event_ticker,
            ticker: event.event_ticker,
            eventId: event.event_ticker,
            question: event.title + (event.subtitle ? `: ${event.subtitle}` : ""),
            status: "open" as const,
            yesPrice: 0.5,
            noPrice: 0.5,
            volume24h: 0,
            endDate: event.strike_date || "",
            category,
            resolutionSource: "Kalshi",
          }];
        }
      );

      // Sort by volume and take top 100
      const sortedMarkets = openMarkets
        .sort((a: { volume24h: number }, b: { volume24h: number }) => b.volume24h - a.volume24h)
        .slice(0, 100);

      // Update cache
      await ctx.runMutation(internal.explore.trending.updateMarketsCache, {
        markets: sortedMarkets,
      });

      console.log(`[Kalshi] Fetched ${sortedMarkets.length} markets from events`);
      return { markets: sortedMarkets, count: sortedMarkets.length };
    } catch (error) {
      console.error("[Kalshi] API error:", error);
      return { markets: [], count: 0, error: "Kalshi API unreachable" };
    }
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
        marketCap: v.optional(v.number()),
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

// ============================================================================
// Token Price API (Jupiter Price V3)
// ============================================================================

const JUPITER_PRICE_API = "https://api.jup.ag/price/v3";

/**
 * Fetch token prices from Jupiter Price API V3
 * This keeps the API key server-side
 */
export const getTokenPrices = action({
  args: {
    mints: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    if (!JUPITER_API_KEY) {
      console.warn("[Jupiter] API key not configured, returning default prices");
      return args.mints.reduce(
        (acc, mint) => ({ ...acc, [mint]: { price: 1.0, change24h: 0 } }),
        {} as Record<string, { price: number; change24h: number }>
      );
    }

    try {
      const ids = args.mints.join(",");
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`, {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": JUPITER_API_KEY,
        },
      });

      if (!response.ok) {
        console.error(`[Jupiter] Price API error: ${response.status}`);
        return args.mints.reduce(
          (acc, mint) => ({ ...acc, [mint]: { price: 1.0, change24h: 0 } }),
          {} as Record<string, { price: number; change24h: number }>
        );
      }

      const data = await response.json();
      const prices: Record<string, { price: number; change24h: number }> = {};

      for (const mint of args.mints) {
        const tokenData = data[mint];
        if (tokenData) {
          prices[mint] = {
            price: tokenData.usdPrice ?? 1.0,
            change24h: tokenData.priceChange24h ?? 0,
          };
        } else {
          prices[mint] = { price: 1.0, change24h: 0 };
        }
      }

      return prices;
    } catch (error) {
      console.error("[Jupiter] Price fetch error:", error);
      return args.mints.reduce(
        (acc, mint) => ({ ...acc, [mint]: { price: 1.0, change24h: 0 } }),
        {} as Record<string, { price: number; change24h: number }>
      );
    }
  },
});
