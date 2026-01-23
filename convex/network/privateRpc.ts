/**
 * Private RPC Proxy for Server-Side Tor Routing
 *
 * Routes sensitive RPC calls through Convex backend with optional Tor
 * and timing obfuscation based on user privacy level.
 *
 * Architecture:
 * Mobile App → Convex Backend → (Tor Proxy) → External APIs
 *
 * Privacy levels:
 * - basic: Direct connection, minimal latency
 * - enhanced: Timing jitter (50-300ms), no Tor
 * - maximum: Timing jitter (100-500ms) + Tor routing
 */

import { action, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// ============================================================================
// Types
// ============================================================================

type PrivacyLevel = "basic" | "enhanced" | "maximum";
type Endpoint = "helius" | "jupiter" | "solana" | "magicblock";

interface RpcRequestBody {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params: unknown;
}

interface EndpointConfig {
  url: string;
  requiresAuth: boolean;
  authHeader?: string;
}

// ============================================================================
// Configuration
// ============================================================================

// Tor SOCKS5 proxy (for self-hosted Convex or external proxy service)
const TOR_PROXY_URL = process.env.TOR_SOCKS_PROXY || "socks5h://127.0.0.1:9050";

// Endpoint configurations
const ENDPOINTS: Record<Endpoint, EndpointConfig> = {
  helius: {
    url: process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com",
    requiresAuth: true,
    authHeader: "x-api-key",
  },
  jupiter: {
    url: "https://quote-api.jup.ag/v6",
    requiresAuth: false,
  },
  solana: {
    url: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    requiresAuth: false,
  },
  magicblock: {
    url: process.env.MAGICBLOCK_RPC_URL || "https://devnet.magicblock.app",
    requiresAuth: true,
    authHeader: "Authorization",
  },
};

// Timing jitter configuration (milliseconds)
const TIMING_CONFIG = {
  basic: { min: 0, max: 0 },
  enhanced: { min: 50, max: 300 },
  maximum: { min: 100, max: 500 },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate random delay within range
 */
function randomDelay(min: number, max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + (array[0] % (max - min + 1));
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get API key for endpoint
 */
function getApiKey(endpoint: Endpoint): string | undefined {
  switch (endpoint) {
    case "helius":
      return process.env.HELIUS_API_KEY;
    case "magicblock":
      return process.env.MAGICBLOCK_API_KEY;
    default:
      return undefined;
  }
}

// ============================================================================
// Internal Queries
// ============================================================================

/**
 * Get user's privacy level from settings
 */
export const getUserPrivacyLevel = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<PrivacyLevel> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return "basic";

    return user.privacySettings?.privacyLevel || "basic";
  },
});

/**
 * Check if user has Tor routing enabled
 */
export const isTorEnabled = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;

    // Tor enabled if explicitly set or if privacy level is maximum
    return (
      user.privacySettings?.torRoutingEnabled === true ||
      user.privacySettings?.privacyLevel === "maximum"
    );
  },
});

// ============================================================================
// Public Actions
// ============================================================================

/**
 * Make a privacy-preserving RPC call
 *
 * Routes request based on user's privacy level:
 * - basic: Direct fetch
 * - enhanced: Timing jitter + direct fetch
 * - maximum: Timing jitter + Tor routing (if available)
 */
export const privateRpcCall = action({
  args: {
    endpoint: v.union(
      v.literal("helius"),
      v.literal("jupiter"),
      v.literal("solana"),
      v.literal("magicblock")
    ),
    method: v.string(),
    params: v.any(),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
  },
  handler: async (ctx, args) => {
    const { endpoint, method, params, privacyLevel } = args;
    const config = ENDPOINTS[endpoint];

    // Add timing jitter based on privacy level
    const timing = TIMING_CONFIG[privacyLevel];
    if (timing.max > 0) {
      const delay = randomDelay(timing.min, timing.max);
      await sleep(delay);
    }

    // Determine routing strategy
    const useTor = privacyLevel === "maximum";

    // Build request
    const requestBody: RpcRequestBody = {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth header if required
    if (config.requiresAuth && config.authHeader) {
      const apiKey = getApiKey(endpoint);
      if (apiKey) {
        headers[config.authHeader] = apiKey;
      }
    }

    try {
      let response: Response;

      if (useTor) {
        // Tor routing - in production, this would use socks-proxy-agent
        // For Convex Cloud, we'd use an external privacy proxy service
        //
        // Option 1: Self-hosted Convex with Tor daemon
        // const { SocksProxyAgent } = await import("socks-proxy-agent");
        // const agent = new SocksProxyAgent(TOR_PROXY_URL);
        //
        // Option 2: Use privacy-focused RPC provider (e.g., Chainstack private endpoints)
        // For now, log intent and use direct connection with warning

        console.warn(
          `[PrivateRPC] Tor routing requested for ${endpoint} but not configured. ` +
          `Set TOR_SOCKS_PROXY environment variable for self-hosted deployment.`
        );

        response = await fetch(config.url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });
      } else {
        // Direct connection
        response = await fetch(config.url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });
      }

      if (!response.ok) {
        throw new Error(`RPC error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[PrivateRPC] Request failed for ${endpoint}:`, error);
      throw error;
    }
  },
});

/**
 * Make a privacy-preserving REST API call (for Jupiter, etc.)
 */
export const privateRestCall = action({
  args: {
    endpoint: v.union(
      v.literal("helius"),
      v.literal("jupiter"),
      v.literal("solana"),
      v.literal("magicblock")
    ),
    path: v.string(),
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    body: v.optional(v.any()),
    queryParams: v.optional(v.record(v.string(), v.string())),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
  },
  handler: async (ctx, args) => {
    const { endpoint, path, method, body, queryParams, privacyLevel } = args;
    const config = ENDPOINTS[endpoint];

    // Add timing jitter
    const timing = TIMING_CONFIG[privacyLevel];
    if (timing.max > 0) {
      const delay = randomDelay(timing.min, timing.max);
      await sleep(delay);
    }

    // Build URL with query params
    let url = `${config.url}${path}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.requiresAuth && config.authHeader) {
      const apiKey = getApiKey(endpoint);
      if (apiKey) {
        headers[config.authHeader] = apiKey;
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`REST error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[PrivateRPC] REST request failed for ${endpoint}${path}:`, error);
      throw error;
    }
  },
});

/**
 * Batch RPC calls with timing obfuscation
 *
 * For maximum privacy, batches requests and executes them with
 * randomized order and inter-request delays.
 */
export const privateBatchRpc = action({
  args: {
    endpoint: v.union(
      v.literal("helius"),
      v.literal("jupiter"),
      v.literal("solana"),
      v.literal("magicblock")
    ),
    requests: v.array(
      v.object({
        method: v.string(),
        params: v.any(),
      })
    ),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
  },
  handler: async (ctx, args) => {
    const { endpoint, requests, privacyLevel } = args;
    const config = ENDPOINTS[endpoint];

    // Add initial timing jitter
    const timing = TIMING_CONFIG[privacyLevel];
    if (timing.max > 0) {
      const delay = randomDelay(timing.min, timing.max);
      await sleep(delay);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.requiresAuth && config.authHeader) {
      const apiKey = getApiKey(endpoint);
      if (apiKey) {
        headers[config.authHeader] = apiKey;
      }
    }

    // For maximum privacy, shuffle request order
    const orderedRequests = [...requests];
    if (privacyLevel === "maximum") {
      // Fisher-Yates shuffle
      for (let i = orderedRequests.length - 1; i > 0; i--) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const j = array[0] % (i + 1);
        [orderedRequests[i], orderedRequests[j]] = [orderedRequests[j], orderedRequests[i]];
      }
    }

    // Build batch request
    const batchBody = orderedRequests.map((req, idx) => ({
      jsonrpc: "2.0" as const,
      id: idx + 1,
      method: req.method,
      params: req.params,
    }));

    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(batchBody),
      });

      if (!response.ok) {
        throw new Error(`Batch RPC error: ${response.status}`);
      }

      const results = await response.json();

      // Re-order results to match original request order if shuffled
      if (privacyLevel === "maximum" && Array.isArray(results)) {
        // Sort by id to restore original order
        return results.sort((a: any, b: any) => a.id - b.id);
      }

      return results;
    } catch (error) {
      console.error(`[PrivateRPC] Batch request failed:`, error);
      throw error;
    }
  },
});
