/**
 * Jupiter Tokens API V2 Client
 *
 * Wraps the Jupiter Tokens API V2 for fetching trending/discovery token data.
 *
 * Endpoints:
 * - GET /v2/toptrending/{interval} - Trending tokens (5m, 1h, 6h, 24h)
 * - GET /v2/toptraded/{interval} - Top traded tokens
 * - GET /v2/toporganicscore/{interval} - Top organic score tokens
 * - GET /v2/recent - Recently created tokens
 * - GET /v2/tag?query=verified - Verified tokens only
 * - GET /v2/search?query={term} - Search tokens
 *
 * Base URL: https://api.jup.ag/tokens
 * Requires: x-api-key header
 *
 * @see https://dev.jup.ag/docs/tokens/v2/token-information
 */

import type {
  TrendingToken,
  TrendingCategory,
  TrendingInterval,
  TrendingTokensResponse,
} from "@/types/holdings.types";

const JUPITER_TOKENS_BASE_URL = "https://api.jup.ag/tokens";

export interface JupiterTokensConfig {
  apiKey?: string;
  timeout?: number;
}

interface RawTokenData {
  address: string;
  symbol: string;
  name: string;
  decimals?: number;
  price?: number;
  dailyChange?: number;
  volume24h?: number;
  logoURI?: string;
  verified?: boolean;
  organicScore?: number;
  tags?: string[];
}

interface RawTokensResponse {
  tokens?: RawTokenData[];
  mints?: RawTokenData[];
  data?: RawTokenData[];
}

export class JupiterTokensClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: JupiterTokensConfig = {}) {
    this.baseUrl = JUPITER_TOKENS_BASE_URL;
    this.timeout = config.timeout ?? 15000;
    this.headers = {
      "Content-Type": "application/json",
      ...(config.apiKey && { "x-api-key": config.apiKey }),
    };
  }

  /**
   * Get trending tokens by interval
   * @param interval - Time interval (5m, 1h, 6h, 24h)
   * @param limit - Number of tokens to return (default 50, max 100)
   */
  async getTrendingTokens(
    interval: TrendingInterval = "24h",
    limit: number = 50
  ): Promise<TrendingTokensResponse> {
    const response = await this.fetch<RawTokensResponse>(
      `/v2/toptrending/${interval}?limit=${limit}`
    );
    return this.transformResponse(response, "trending", interval);
  }

  /**
   * Get top traded tokens by interval
   * @param interval - Time interval (5m, 1h, 6h, 24h)
   * @param limit - Number of tokens to return (default 50, max 100)
   */
  async getTopTradedTokens(
    interval: TrendingInterval = "24h",
    limit: number = 50
  ): Promise<TrendingTokensResponse> {
    const response = await this.fetch<RawTokensResponse>(
      `/v2/toptraded/${interval}?limit=${limit}`
    );
    return this.transformResponse(response, "top_traded", interval);
  }

  /**
   * Get tokens with top organic score
   * @param interval - Time interval (5m, 1h, 6h, 24h)
   * @param limit - Number of tokens to return (default 50, max 100)
   */
  async getTopOrganicScoreTokens(
    interval: TrendingInterval = "24h",
    limit: number = 50
  ): Promise<TrendingTokensResponse> {
    const response = await this.fetch<RawTokensResponse>(
      `/v2/toporganicscore/${interval}?limit=${limit}`
    );
    return this.transformResponse(response, "trending", interval);
  }

  /**
   * Get recently created tokens
   * @param limit - Number of tokens to return (default 30)
   */
  async getRecentTokens(limit: number = 30): Promise<TrendingTokensResponse> {
    const response = await this.fetch<RawTokensResponse>(
      `/v2/recent?limit=${limit}`
    );
    return this.transformResponse(response, "recent", "24h");
  }

  /**
   * Get verified tokens only
   */
  async getVerifiedTokens(): Promise<TrendingTokensResponse> {
    const response = await this.fetch<RawTokensResponse>(
      `/v2/tag?query=verified`
    );
    return this.transformResponse(response, "trending", "24h");
  }

  /**
   * Get liquid staking tokens (LSTs)
   */
  async getLstTokens(): Promise<TrendingTokensResponse> {
    const response = await this.fetch<RawTokensResponse>(`/v2/tag?query=lst`);
    return this.transformResponse(response, "trending", "24h");
  }

  /**
   * Search tokens by symbol, name, or mint address
   * @param query - Search term (comma-separated for multiple, max 100)
   */
  async searchTokens(query: string): Promise<TrendingTokensResponse> {
    const response = await this.fetch<RawTokensResponse>(
      `/v2/search?query=${encodeURIComponent(query)}`
    );
    return this.transformResponse(response, "trending", "24h");
  }

  /**
   * Get token info by mint addresses
   * @param mints - Array of mint addresses (max 100)
   */
  async getTokensByMints(mints: string[]): Promise<TrendingTokensResponse> {
    const query = mints.slice(0, 100).join(",");
    const response = await this.fetch<RawTokensResponse>(
      `/v2/search?query=${encodeURIComponent(query)}`
    );
    return this.transformResponse(response, "trending", "24h");
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...this.headers, ...options?.headers },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Jupiter Tokens API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Jupiter Tokens API request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private transformResponse(
    raw: RawTokensResponse,
    category: TrendingCategory,
    interval: TrendingInterval
  ): TrendingTokensResponse {
    // API may return tokens in different fields
    const rawTokens = raw.tokens ?? raw.mints ?? raw.data ?? [];

    const tokens: TrendingToken[] = rawTokens.map((token) => ({
      mint: token.address,
      symbol: token.symbol,
      name: token.name,
      priceUsd: token.price ?? 0,
      change24h: token.dailyChange ?? 0,
      volume24h: token.volume24h ?? 0,
      logoUri: token.logoURI,
      verified: token.verified ?? token.tags?.includes("verified") ?? false,
      organicScore: token.organicScore,
    }));

    return {
      tokens,
      category,
      interval,
      updatedAt: Date.now(),
    };
  }
}

// Singleton instance
let jupiterTokensClientInstance: JupiterTokensClient | null = null;

export function getJupiterTokensClient(
  config?: JupiterTokensConfig
): JupiterTokensClient {
  if (!jupiterTokensClientInstance) {
    jupiterTokensClientInstance = new JupiterTokensClient(config);
  }
  return jupiterTokensClientInstance;
}

/**
 * Reset the singleton (useful for testing or config changes)
 */
export function resetJupiterTokensClient(): void {
  jupiterTokensClientInstance = null;
}
