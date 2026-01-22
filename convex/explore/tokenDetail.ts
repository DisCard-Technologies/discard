/**
 * Token Detail Convex Functions
 *
 * Provides cached token details from Jupiter Tokens API V2 and Helius DAS.
 * Data is cached per token (by mint address) to reduce API calls.
 */
import { v } from "convex/values";
import { query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

// API endpoints
const JUPITER_TOKENS_URL = "https://api.jup.ag/tokens";
const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com";

// Cache TTL: 5 minutes
const TOKEN_DETAIL_CACHE_TTL = 5 * 60 * 1000;

// ============================================================================
// Image Proxy Helper
// ============================================================================

/**
 * Proxy token images through wsrv.nl for reliability
 */
function toProxiedImageUrl(url: string | undefined): string | undefined {
  if (!url) return url;

  // Handle ipfs:// protocol URLs first
  if (url.startsWith("ipfs://")) {
    const cid = url.replace("ipfs://", "");
    url = `https://ipfs.io/ipfs/${cid}`;
  }

  // Proxy through wsrv.nl
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=128&h=128&fit=cover&default=1`;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get cached token details by mint address
 */
export const getTokenDetail = query({
  args: { mint: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("tokenDetails")
      .withIndex("by_mint", (q) => q.eq("mint", args.mint))
      .first();

    if (!cached) return null;

    // Check if cache is stale
    const isStale = Date.now() - cached.updatedAt > TOKEN_DETAIL_CACHE_TTL;

    return {
      ...cached,
      isStale,
    };
  },
});

/**
 * Get multiple token details by mint addresses
 */
export const getTokenDetails = query({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args) => {
    const results: Record<
      string,
      | {
          mint: string;
          symbol: string;
          name: string;
          priceUsd: number;
          change24h: number;
          marketCap?: number;
          volume24h?: number;
          circulatingSupply?: number;
          totalSupply?: number;
          fdv?: number;
          description?: string;
          website?: string;
          twitter?: string;
          telegram?: string;
          discord?: string;
          logoUri?: string;
          verified?: boolean;
          updatedAt: number;
          isStale: boolean;
        }
      | null
    > = {};

    for (const mint of args.mints) {
      const cached = await ctx.db
        .query("tokenDetails")
        .withIndex("by_mint", (q) => q.eq("mint", mint))
        .first();

      if (cached) {
        const isStale = Date.now() - cached.updatedAt > TOKEN_DETAIL_CACHE_TTL;
        results[mint] = {
          mint: cached.mint,
          symbol: cached.symbol,
          name: cached.name,
          priceUsd: cached.priceUsd,
          change24h: cached.change24h,
          marketCap: cached.marketCap ?? undefined,
          volume24h: cached.volume24h ?? undefined,
          circulatingSupply: cached.circulatingSupply ?? undefined,
          totalSupply: cached.totalSupply ?? undefined,
          fdv: cached.fdv ?? undefined,
          description: cached.description ?? undefined,
          website: cached.website ?? undefined,
          twitter: cached.twitter ?? undefined,
          telegram: cached.telegram ?? undefined,
          discord: cached.discord ?? undefined,
          logoUri: cached.logoUri ?? undefined,
          verified: cached.verified ?? undefined,
          updatedAt: cached.updatedAt,
          isStale,
        };
      } else {
        results[mint] = null;
      }
    }

    return results;
  },
});

// ============================================================================
// Actions (External API calls)
// ============================================================================

interface HeliusDasAsset {
  id: string;
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
    };
    links?: {
      image?: string;
      external_url?: string;
    };
    files?: Array<{
      uri?: string;
      cdn_uri?: string;
    }>;
    json_uri?: string;
  };
  token_info?: {
    supply?: number;
    decimals?: number;
  };
}

interface HeliusMetadataJson {
  description?: string;
  external_url?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  // Some tokens use different formats
  links?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    homepage?: string;
  };
  socials?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
}

/**
 * Fetch token metadata from Helius DAS API (Metaplex metadata)
 */
async function fetchHeliusMetadata(mint: string): Promise<{
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  logoUri?: string;
}> {
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
  if (!HELIUS_API_KEY) {
    console.warn("[Helius DAS] API key not configured");
    return {};
  }

  try {
    const rpcUrl = `${HELIUS_RPC_URL}/?api-key=${HELIUS_API_KEY}`;

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-asset",
        method: "getAsset",
        params: { id: mint },
      }),
    });

    if (!response.ok) {
      console.error(`[Helius DAS] API error: ${response.status}`);
      return {};
    }

    const data = await response.json();
    const asset: HeliusDasAsset = data.result;

    if (!asset) return {};

    // Get image URL
    const logoUri =
      asset.content?.links?.image ||
      asset.content?.files?.[0]?.cdn_uri ||
      asset.content?.files?.[0]?.uri;

    // Get description from metadata
    let description = asset.content?.metadata?.description;
    let website = asset.content?.links?.external_url;
    let twitter: string | undefined;
    let telegram: string | undefined;
    let discord: string | undefined;

    // Try to fetch extended metadata from json_uri if available
    if (asset.content?.json_uri) {
      try {
        const metadataResponse = await fetch(asset.content.json_uri, {
          signal: AbortSignal.timeout(5000),
        });
        if (metadataResponse.ok) {
          const metadata: HeliusMetadataJson = await metadataResponse.json();

          // Get description
          if (!description && metadata.description) {
            description = metadata.description;
          }

          // Get social links - check multiple formats
          website =
            website ||
            metadata.website ||
            metadata.external_url ||
            metadata.links?.website ||
            metadata.links?.homepage ||
            metadata.socials?.website;

          twitter =
            metadata.twitter ||
            metadata.links?.twitter ||
            metadata.socials?.twitter;

          telegram =
            metadata.telegram ||
            metadata.links?.telegram ||
            metadata.socials?.telegram;

          discord =
            metadata.discord ||
            metadata.links?.discord ||
            metadata.socials?.discord;
        }
      } catch (err) {
        // json_uri fetch failed, continue with what we have
        console.log(`[Helius DAS] Could not fetch json_uri for ${mint}`);
      }
    }

    return {
      description,
      website,
      twitter,
      telegram,
      discord,
      logoUri: toProxiedImageUrl(logoUri),
    };
  } catch (error) {
    console.error("[Helius DAS] Failed to fetch metadata:", error);
    return {};
  }
}

/**
 * Refresh token details from Jupiter + Helius
 */
export const refreshTokenDetail = action({
  args: { mint: v.string() },
  handler: async (ctx, args) => {
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    if (!JUPITER_API_KEY) {
      throw new Error("JUPITER_API_KEY environment variable not set");
    }

    // Fetch from Jupiter Tokens API V2 search endpoint
    const jupiterResponse = await fetch(
      `${JUPITER_TOKENS_URL}/v2/search?query=${args.mint}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": JUPITER_API_KEY,
        },
      }
    );

    if (!jupiterResponse.ok) {
      const errorText = await jupiterResponse.text().catch(() => "");
      console.error(
        `[Jupiter] Token detail API error: ${jupiterResponse.status} - ${errorText}`
      );
      throw new Error(`Jupiter API error: ${jupiterResponse.status}`);
    }

    const jupiterData = await jupiterResponse.json();

    // Jupiter v2 search returns array of results - find exact mint match
    const jupiterToken = Array.isArray(jupiterData)
      ? jupiterData.find((t: { id: string }) => t.id === args.mint)
      : null;

    if (!jupiterToken) {
      console.warn(`[Jupiter] No data found for mint ${args.mint}`);
    }

    // Fetch metadata from Helius DAS (for description if Jupiter doesn't have socials)
    const heliusMetadata = await fetchHeliusMetadata(args.mint);

    // Calculate 24h volume from stats24h
    const volume24h = jupiterToken?.stats24h
      ? (jupiterToken.stats24h.buyVolume ?? 0) + (jupiterToken.stats24h.sellVolume ?? 0)
      : undefined;

    // Combine data - Jupiter has socials directly in response
    const tokenDetail = {
      mint: args.mint,
      symbol: jupiterToken?.symbol || "UNKNOWN",
      name: jupiterToken?.name || "Unknown Token",
      priceUsd: jupiterToken?.usdPrice ?? 0,
      change24h: jupiterToken?.stats24h?.priceChange ?? 0,
      // Market data from Jupiter
      marketCap: jupiterToken?.mcap ?? jupiterToken?.fdv,
      volume24h: volume24h,
      circulatingSupply: jupiterToken?.circSupply,
      totalSupply: jupiterToken?.totalSupply,
      fdv: jupiterToken?.fdv,
      // Socials - prefer Jupiter, fallback to Helius
      description: heliusMetadata.description,
      website: jupiterToken?.website || heliusMetadata.website,
      twitter: jupiterToken?.twitter || heliusMetadata.twitter,
      telegram: jupiterToken?.telegram || heliusMetadata.telegram,
      discord: heliusMetadata.discord, // Jupiter doesn't have discord
      logoUri: toProxiedImageUrl(jupiterToken?.icon) || heliusMetadata.logoUri,
      // Verification status
      verified: jupiterToken?.isVerified ?? false,
    };

    // Update cache
    await ctx.runMutation(internal.explore.tokenDetail.updateTokenDetailCache, {
      tokenDetail,
    });

    console.log(`[TokenDetail] Refreshed data for ${tokenDetail.symbol} (${args.mint}) - mcap: ${tokenDetail.marketCap}, vol: ${tokenDetail.volume24h}`);

    return tokenDetail;
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Update token detail cache
 */
export const updateTokenDetailCache = internalMutation({
  args: {
    tokenDetail: v.object({
      mint: v.string(),
      symbol: v.string(),
      name: v.string(),
      priceUsd: v.number(),
      change24h: v.number(),
      marketCap: v.optional(v.number()),
      volume24h: v.optional(v.number()),
      circulatingSupply: v.optional(v.number()),
      totalSupply: v.optional(v.number()),
      fdv: v.optional(v.number()),
      description: v.optional(v.string()),
      website: v.optional(v.string()),
      twitter: v.optional(v.string()),
      telegram: v.optional(v.string()),
      discord: v.optional(v.string()),
      logoUri: v.optional(v.string()),
      verified: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const { tokenDetail } = args;
    const now = Date.now();

    // Find existing cache entry
    const existing = await ctx.db
      .query("tokenDetails")
      .withIndex("by_mint", (q) => q.eq("mint", tokenDetail.mint))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...tokenDetail,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("tokenDetails", {
        ...tokenDetail,
        updatedAt: now,
      });
    }
  },
});

/**
 * Clear token detail cache for a specific mint
 */
export const clearTokenDetailCache = internalMutation({
  args: { mint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tokenDetails")
      .withIndex("by_mint", (q) => q.eq("mint", args.mint))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
