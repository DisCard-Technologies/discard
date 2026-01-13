/**
 * Jupiter Ultra API Client
 *
 * Full-featured client for Jupiter Ultra Swap API including:
 * - Token holdings and balances (~70ms latency)
 * - Token security/shield data (~150ms latency)
 * - Order creation with best-price routing (~300ms latency)
 * - Transaction execution via Jupiter's proprietary engine (~700ms-2s)
 * - Token search functionality (~15ms latency)
 *
 * Base URL: https://api.jup.ag/ultra/v1
 *
 * @see https://dev.jup.ag/docs/ultra
 */

import type {
  JupiterHolding,
  JupiterHoldingsResponse,
  JupiterShieldData,
} from "@/types/holdings.types";

const JUPITER_ULTRA_BASE_URL = "https://api.jup.ag/ultra/v1";

export interface JupiterUltraConfig {
  apiKey?: string;
  timeout?: number;
}

// ============================================================================
// Swap Types
// ============================================================================

export interface UltraOrderRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker: string;
  referralAccount?: string;
  referralFee?: number;
}

export interface UltraOrderResponse {
  requestId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  feeMint?: string;
  feeBps?: number;
  transaction: string;
  expiresAt?: number;
}

export interface UltraExecuteResponse {
  status: "Success" | "Failed";
  signature?: string;
  errorCode?: string;
  error?: string;
  inputAmount?: string;
  outputAmount?: string;
}

export interface TokenSearchResult {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  verified: boolean;
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

  // ==========================================================================
  // Swap Execution
  // ==========================================================================

  /**
   * Get a swap order with quote and transaction
   * Latency: ~300ms
   *
   * @param request - Order parameters
   * @returns Order with base64 encoded transaction to sign
   */
  async getOrder(request: UltraOrderRequest): Promise<UltraOrderResponse> {
    const params = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      taker: request.taker,
    });

    if (request.referralAccount) {
      params.append("referralAccount", request.referralAccount);
    }
    if (request.referralFee) {
      params.append("referralFee", request.referralFee.toString());
    }

    return this.fetch<UltraOrderResponse>(`/order?${params.toString()}`);
  }

  /**
   * Execute a signed swap transaction
   * Latency: ~700ms (Iris) to ~2s (JupiterZ)
   *
   * Jupiter handles transaction landing, priority fees, and retries
   *
   * @param signedTransaction - Base64 encoded signed transaction
   * @param requestId - Request ID from getOrder response
   * @returns Execution result with signature
   */
  async executeOrder(
    signedTransaction: string,
    requestId: string
  ): Promise<UltraExecuteResponse> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        signedTransaction,
        requestId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        status: "Failed",
        error: `Execute failed: ${response.status} - ${errorText}`,
      };
    }

    return response.json();
  }

  /**
   * Search for tokens by symbol, name, or mint address
   * Latency: ~15ms
   */
  async searchTokens(query: string): Promise<TokenSearchResult[]> {
    try {
      const response = await this.fetch<{ tokens: TokenSearchResult[] }>(
        `/search?query=${encodeURIComponent(query)}`
      );
      return response.tokens || [];
    } catch {
      return [];
    }
  }

  /**
   * Get available routing engines
   */
  async getRouters(): Promise<string[]> {
    try {
      const response = await this.fetch<{ routers: string[] }>("/routers");
      return response.routers || [];
    } catch {
      return [];
    }
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
