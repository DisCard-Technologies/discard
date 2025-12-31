/**
 * Jupiter Ultra API Client
 *
 * Wraps the Jupiter Ultra API for fetching user token holdings.
 *
 * Endpoints:
 * - GET /holdings/{address} - Token balances (~70ms latency)
 * - GET /shield - Token security data (~150ms latency)
 *
 * Base URL: https://ultra-api.jup.ag/v1
 *
 * @see https://dev.jup.ag/docs/ultra
 */

import type {
  JupiterHolding,
  JupiterHoldingsResponse,
  JupiterShieldData,
} from "../types/holdings.types";

const JUPITER_ULTRA_BASE_URL = "https://ultra-api.jup.ag/v1";

export interface JupiterUltraConfig {
  apiKey?: string;
  timeout?: number;
}

interface RawJupiterHolding {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  uiAmount: number;
  usdValue: number;
  price: number;
  priceChange24h?: number;
  logoURI?: string;
}

interface RawHoldingsResponse {
  wallet: string;
  tokens: RawJupiterHolding[];
  totalUsdValue: number;
  timestamp: number;
}

export class JupiterUltraClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: JupiterUltraConfig = {}) {
    this.baseUrl = JUPITER_ULTRA_BASE_URL;
    this.timeout = config.timeout ?? 10000;
    this.headers = {
      "Content-Type": "application/json",
      ...(config.apiKey && { "x-api-key": config.apiKey }),
    };
  }

  /**
   * Fetch user's token holdings
   * Latency: ~70ms
   */
  async getHoldings(walletAddress: string): Promise<JupiterHoldingsResponse> {
    const response = await this.fetch<RawHoldingsResponse>(
      `/holdings/${walletAddress}`
    );
    return this.transformHoldingsResponse(response);
  }

  /**
   * Get token security/shield data
   * Latency: ~150ms
   */
  async getShieldData(mintAddresses: string[]): Promise<JupiterShieldData[]> {
    const params = new URLSearchParams();
    mintAddresses.forEach((mint) => params.append("mints", mint));
    return this.fetch<JupiterShieldData[]>(`/shield?${params.toString()}`);
  }

  /**
   * Get quote for token pair (for price discovery)
   * Latency: ~300ms
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string
  ): Promise<{
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    priceImpactPct: number;
  }> {
    return this.fetch(
      `/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`
    );
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
          `Jupiter Ultra API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Jupiter Ultra API request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private transformHoldingsResponse(
    raw: RawHoldingsResponse
  ): JupiterHoldingsResponse {
    const holdings: JupiterHolding[] = raw.tokens.map((token) => ({
      mint: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance: token.amount,
      balanceFormatted: token.uiAmount,
      valueUsd: token.usdValue,
      priceUsd: token.price,
      change24h: token.priceChange24h ?? 0,
      logoUri: token.logoURI,
    }));

    return {
      holdings,
      totalValueUsd: raw.totalUsdValue,
      lastUpdated: raw.timestamp,
    };
  }
}

// Singleton instance
let jupiterClientInstance: JupiterUltraClient | null = null;

export function getJupiterUltraClient(
  config?: JupiterUltraConfig
): JupiterUltraClient {
  if (!jupiterClientInstance) {
    jupiterClientInstance = new JupiterUltraClient(config);
  }
  return jupiterClientInstance;
}

/**
 * Reset the singleton (useful for testing or config changes)
 */
export function resetJupiterUltraClient(): void {
  jupiterClientInstance = null;
}
