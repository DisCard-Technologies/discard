/**
 * Helius DAS API Client
 *
 * Wraps the Helius DAS API for fetching user token holdings.
 * Note: Primary API calls go through Convex actions, this client
 * is for potential direct usage.
 *
 * @see https://www.helius.dev/docs/das/get-tokens
 */

import type {
  JupiterHolding,
  JupiterHoldingsResponse,
} from "../types/holdings.types";

// Known RWA token mints for classification
const RWA_MINTS = new Set([
  "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", // USDY
  "CXLBjMMcwkc17GfJtBos6rQCo1ypeH6eDbB82Kby4MRm", // OUSG
  "43m2ewFV5nDepieFjT9EmAQnc1HRtAF247RBpLGFem5F", // BUIDL
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // BENJI
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // VBILL
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // TBILL
  "Mapuuts5DjNrLM7mhCRiEbDyNtPwfQWKr3xmyLMM8fVp", // syrupUSDC
  "ApoL1k7GWhhmE8AvCXeFHVGrw3aKNc5SpJbT3V9UpGNu", // ACRED
]);

export interface HeliusClientConfig {
  apiKey: string;
  timeout?: number;
}

interface HeliusAsset {
  id: string;
  interface: string;
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
    };
    links?: {
      image?: string;
    };
    files?: Array<{ uri?: string }>;
  };
  token_info?: {
    symbol?: string;
    balance?: number;
    decimals?: number;
    price_info?: {
      price_per_token?: number;
      total_price?: number;
    };
  };
}

interface HeliusNativeBalance {
  lamports: number;
  price_per_sol?: number;
  total_price?: number;
}

interface HeliusAssetsByOwnerResponse {
  result: {
    items: HeliusAsset[];
    nativeBalance?: HeliusNativeBalance;
  };
  error?: {
    message?: string;
    code?: number;
  };
}

export class HeliusClient {
  private rpcUrl: string;
  private timeout: number;

  constructor(config: HeliusClientConfig) {
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${config.apiKey}`;
    this.timeout = config.timeout ?? 15000;
  }

  /**
   * Fetch user's token holdings using DAS getAssetsByOwner
   */
  async getHoldings(walletAddress: string): Promise<JupiterHoldingsResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "holdings",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: walletAddress,
            page: 1,
            limit: 1000,
            displayOptions: {
              showFungible: true,
              showNativeBalance: true,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }

      const data: HeliusAssetsByOwnerResponse = await response.json();

      if (data.error) {
        throw new Error(
          `Helius RPC error: ${data.error.message || JSON.stringify(data.error)}`
        );
      }

      return this.transformResponse(data.result);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Helius API request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private transformResponse(result: {
    items: HeliusAsset[];
    nativeBalance?: HeliusNativeBalance;
  }): JupiterHoldingsResponse {
    const holdings: JupiterHolding[] = [];
    let totalValueUsd = 0;

    // Add native SOL balance
    if (result.nativeBalance && result.nativeBalance.lamports > 0) {
      const solBalance = result.nativeBalance.lamports / 1e9;
      const solPrice = result.nativeBalance.price_per_sol || 0;
      const solValue =
        result.nativeBalance.total_price || solBalance * solPrice;

      holdings.push({
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        balance: result.nativeBalance.lamports.toString(),
        balanceFormatted: solBalance,
        valueUsd: solValue,
        priceUsd: solPrice,
        change24h: 0,
        logoUri:
          "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
        isRwa: false,
      });
      totalValueUsd += solValue;
    }

    // Process fungible tokens
    for (const item of result.items) {
      if (
        item.interface !== "FungibleToken" &&
        item.interface !== "FungibleAsset"
      ) {
        continue;
      }

      const tokenInfo = item.token_info;
      if (!tokenInfo || !tokenInfo.balance) continue;

      const mint = item.id;
      const metadata = item.content?.metadata || {};
      const priceInfo = tokenInfo.price_info || {};

      const decimals = tokenInfo.decimals || 0;
      const rawBalance = tokenInfo.balance || 0;
      const balanceFormatted = rawBalance / Math.pow(10, decimals);
      const priceUsd = priceInfo.price_per_token || 0;
      const valueUsd = priceInfo.total_price || balanceFormatted * priceUsd;

      holdings.push({
        mint,
        symbol: tokenInfo.symbol || metadata.symbol || "???",
        name: metadata.name || tokenInfo.symbol || "Unknown",
        decimals,
        balance: rawBalance.toString(),
        balanceFormatted,
        valueUsd,
        priceUsd,
        change24h: 0,
        logoUri: item.content?.links?.image || item.content?.files?.[0]?.uri,
        isRwa: RWA_MINTS.has(mint),
      });

      totalValueUsd += valueUsd;
    }

    return {
      holdings,
      totalValueUsd,
      lastUpdated: Date.now(),
    };
  }
}

// Singleton instance
let heliusClientInstance: HeliusClient | null = null;

export function getHeliusClient(config?: HeliusClientConfig): HeliusClient {
  if (!heliusClientInstance && config) {
    heliusClientInstance = new HeliusClient(config);
  }
  if (!heliusClientInstance) {
    throw new Error("HeliusClient not initialized. Provide config on first call.");
  }
  return heliusClientInstance;
}

/**
 * Reset the singleton (useful for testing or config changes)
 */
export function resetHeliusClient(): void {
  heliusClientInstance = null;
}

// Re-export with old names for backwards compatibility
export { HeliusClient as JupiterUltraClient };
export { getHeliusClient as getJupiterUltraClient };
export type { HeliusClientConfig as JupiterUltraConfig };
