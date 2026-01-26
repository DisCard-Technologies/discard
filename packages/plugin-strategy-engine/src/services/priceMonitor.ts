/**
 * Price Monitor Service
 *
 * Monitors token prices from Jupiter, Pyth, and other sources.
 * Supports both polling and WebSocket streaming modes.
 */

import type {
  PriceData,
  PriceSubscription,
} from '../types/conditions.js';

// ============================================================================
// Configuration
// ============================================================================

export interface PriceMonitorConfig {
  /** Jupiter Price API URL */
  jupiterApiUrl: string;
  /** Pyth Hermes API URL */
  pythApiUrl: string;
  /** Birdeye API URL */
  birdeyeApiUrl?: string;
  /** Birdeye API Key */
  birdeyeApiKey?: string;
  /** Default polling interval in milliseconds */
  defaultPollingIntervalMs: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Maximum concurrent price fetches */
  maxConcurrentFetches: number;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
}

const DEFAULT_CONFIG: PriceMonitorConfig = {
  jupiterApiUrl: process.env.JUPITER_API_URL || 'https://price.jup.ag/v6',
  pythApiUrl: process.env.PYTH_PRICE_FEED_URL || 'https://hermes.pyth.network',
  birdeyeApiUrl: process.env.BIRDEYE_API_URL || 'https://public-api.birdeye.so',
  birdeyeApiKey: process.env.BIRDEYE_API_KEY,
  defaultPollingIntervalMs: 5000, // 5 seconds
  cacheTtlMs: 2000, // 2 seconds cache
  maxConcurrentFetches: 10,
  requestTimeoutMs: 10000,
};

// ============================================================================
// Token Mappings
// ============================================================================

/** Common token mint addresses on Solana */
const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  MSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  JITOSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
};

/** Pyth price feed IDs for common tokens */
const PYTH_PRICE_FEEDS: Record<string, string> = {
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  USDT: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  JUP: '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  BONK: '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
};

// ============================================================================
// Price Cache
// ============================================================================

interface CachedPrice {
  data: PriceData;
  fetchedAt: number;
}

// ============================================================================
// API Response Types
// ============================================================================

interface JupiterPriceResponse {
  data: Record<string, { id: string; mintSymbol: string; vsToken: string; price: number }>;
}

interface PythPriceFeedResponse {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
  };
}

interface BirdeyePriceResponse {
  success: boolean;
  data: {
    value: number;
    priceChange24h?: number;
  };
}

// ============================================================================
// Price Monitor Service
// ============================================================================

export class PriceMonitor {
  private config: PriceMonitorConfig;
  private priceCache: Map<string, CachedPrice> = new Map();
  private subscriptions: Map<string, PriceSubscription> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private initialized: boolean = false;

  constructor(config: Partial<PriceMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[PriceMonitor] Initialized');
  }

  async shutdown(): Promise<void> {
    // Stop all polling intervals
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
    this.subscriptions.clear();
    this.priceCache.clear();
    this.initialized = false;
    console.log('[PriceMonitor] Shutdown complete');
  }

  // ==========================================================================
  // Price Fetching
  // ==========================================================================

  /**
   * Get current price for a token
   */
  async getPrice(
    token: string,
    quoteCurrency: string = 'USD',
    source: 'jupiter' | 'pyth' | 'birdeye' | 'coingecko' = 'jupiter'
  ): Promise<PriceData> {
    const cacheKey = `${token}:${quoteCurrency}:${source}`;

    // Check cache first
    const cached = this.priceCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.config.cacheTtlMs) {
      return cached.data;
    }

    // Fetch fresh price
    let priceData: PriceData;

    switch (source) {
      case 'jupiter':
        priceData = await this.fetchJupiterPrice(token, quoteCurrency);
        break;
      case 'pyth':
        priceData = await this.fetchPythPrice(token, quoteCurrency);
        break;
      case 'birdeye':
        priceData = await this.fetchBirdeyePrice(token, quoteCurrency);
        break;
      default:
        priceData = await this.fetchJupiterPrice(token, quoteCurrency);
    }

    // Cache the result
    this.priceCache.set(cacheKey, {
      data: priceData,
      fetchedAt: Date.now(),
    });

    return priceData;
  }

  /**
   * Get prices for multiple tokens
   */
  async getPrices(
    tokens: string[],
    quoteCurrency: string = 'USD',
    source: 'jupiter' | 'pyth' | 'birdeye' = 'jupiter'
  ): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();

    // Batch fetch from Jupiter (supports multiple tokens in one request)
    if (source === 'jupiter') {
      const batchResults = await this.fetchJupiterPricesBatch(tokens, quoteCurrency);
      for (const [token, price] of batchResults) {
        results.set(token, price);
      }
      return results;
    }

    // For other sources, fetch individually with concurrency limit
    const chunks = this.chunkArray(tokens, this.config.maxConcurrentFetches);

    for (const chunk of chunks) {
      const promises = chunk.map(async (token) => {
        try {
          const price = await this.getPrice(token, quoteCurrency, source);
          return { token, price };
        } catch (error) {
          console.error(`[PriceMonitor] Failed to fetch price for ${token}:`, error);
          return null;
        }
      });

      const chunkResults = await Promise.all(promises);
      for (const result of chunkResults) {
        if (result) {
          results.set(result.token, result.price);
        }
      }
    }

    return results;
  }

  // ==========================================================================
  // Jupiter Price Fetching
  // ==========================================================================

  private async fetchJupiterPrice(token: string, quoteCurrency: string): Promise<PriceData> {
    const mint = TOKEN_MINTS[token.toUpperCase()] || token;
    const url = `${this.config.jupiterApiUrl}/price?ids=${mint}`;

    const response = await this.fetchWithTimeout(url);
    const data = await response.json() as JupiterPriceResponse;

    if (!data.data || !data.data[mint]) {
      throw new Error(`Jupiter price not found for ${token}`);
    }

    const priceInfo = data.data[mint];

    return {
      token: token.toUpperCase(),
      quoteCurrency,
      price: priceInfo.price,
      source: 'jupiter',
      timestamp: Date.now(),
    };
  }

  private async fetchJupiterPricesBatch(
    tokens: string[],
    quoteCurrency: string
  ): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();

    // Map tokens to mints
    const mints = tokens.map((t) => TOKEN_MINTS[t.toUpperCase()] || t);
    const mintToToken = new Map<string, string>();
    tokens.forEach((t, i) => mintToToken.set(mints[i], t.toUpperCase()));

    const url = `${this.config.jupiterApiUrl}/price?ids=${mints.join(',')}`;

    try {
      const response = await this.fetchWithTimeout(url);
      const data = await response.json() as JupiterPriceResponse;

      if (data.data) {
        for (const [mint, priceInfo] of Object.entries(data.data)) {
          const token = mintToToken.get(mint);
          if (token && priceInfo) {
            results.set(token, {
              token,
              quoteCurrency,
              price: priceInfo.price,
              source: 'jupiter',
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (error) {
      console.error('[PriceMonitor] Jupiter batch fetch failed:', error);
    }

    return results;
  }

  // ==========================================================================
  // Pyth Price Fetching
  // ==========================================================================

  private async fetchPythPrice(token: string, quoteCurrency: string): Promise<PriceData> {
    const feedId = PYTH_PRICE_FEEDS[token.toUpperCase()];
    if (!feedId) {
      throw new Error(`Pyth price feed not found for ${token}`);
    }

    const url = `${this.config.pythApiUrl}/api/latest_price_feeds?ids[]=${feedId}`;

    const response = await this.fetchWithTimeout(url);
    const data = await response.json() as PythPriceFeedResponse[];

    if (!data || !data[0] || !data[0].price) {
      throw new Error(`Pyth price not found for ${token}`);
    }

    const priceInfo = data[0].price;
    const price = parseFloat(priceInfo.price) * Math.pow(10, priceInfo.expo);

    return {
      token: token.toUpperCase(),
      quoteCurrency,
      price,
      source: 'pyth',
      confidence: parseFloat(priceInfo.conf) * Math.pow(10, priceInfo.expo),
      timestamp: Date.now(),
    };
  }

  // ==========================================================================
  // Birdeye Price Fetching
  // ==========================================================================

  private async fetchBirdeyePrice(token: string, quoteCurrency: string): Promise<PriceData> {
    if (!this.config.birdeyeApiKey) {
      throw new Error('Birdeye API key not configured');
    }

    const mint = TOKEN_MINTS[token.toUpperCase()] || token;
    const url = `${this.config.birdeyeApiUrl}/defi/price?address=${mint}`;

    const response = await this.fetchWithTimeout(url, {
      headers: {
        'X-API-KEY': this.config.birdeyeApiKey,
      },
    });

    const data = await response.json() as BirdeyePriceResponse;

    if (!data.success || !data.data) {
      throw new Error(`Birdeye price not found for ${token}`);
    }

    return {
      token: token.toUpperCase(),
      quoteCurrency,
      price: data.data.value,
      source: 'birdeye',
      timestamp: Date.now(),
      change24h: data.data.priceChange24h,
    };
  }

  // ==========================================================================
  // Price Subscriptions
  // ==========================================================================

  /**
   * Subscribe to price updates for a token
   */
  subscribe(
    token: string,
    quoteCurrency: string,
    source: 'jupiter' | 'pyth' | 'birdeye' = 'jupiter',
    strategyId: string,
    onPriceUpdate?: (price: PriceData) => void,
    pollingIntervalMs?: number
  ): string {
    const subscriptionKey = `${token}:${quoteCurrency}:${source}`;
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get or create subscription
    let subscription = this.subscriptions.get(subscriptionKey);

    if (!subscription) {
      subscription = {
        subscriptionId: subscriptionKey,
        token: token.toUpperCase(),
        quoteCurrency,
        source,
        strategyIds: [],
        active: true,
      };
      this.subscriptions.set(subscriptionKey, subscription);

      // Start polling for this subscription
      this.startPolling(subscriptionKey, pollingIntervalMs);
    }

    // Add strategy to subscription
    if (!subscription.strategyIds.includes(strategyId)) {
      subscription.strategyIds.push(strategyId);
    }

    // Store callback if provided
    if (onPriceUpdate) {
      subscription.onPriceUpdate = onPriceUpdate;
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe a strategy from price updates
   */
  unsubscribe(strategyId: string): void {
    for (const [key, subscription] of this.subscriptions) {
      const index = subscription.strategyIds.indexOf(strategyId);
      if (index !== -1) {
        subscription.strategyIds.splice(index, 1);

        // If no more strategies are subscribed, stop polling
        if (subscription.strategyIds.length === 0) {
          this.stopPolling(key);
          this.subscriptions.delete(key);
        }
      }
    }
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): PriceSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  // ==========================================================================
  // Polling
  // ==========================================================================

  private startPolling(subscriptionKey: string, intervalMs?: number): void {
    if (this.pollingIntervals.has(subscriptionKey)) {
      return; // Already polling
    }

    const interval = intervalMs || this.config.defaultPollingIntervalMs;

    const pollFn = async () => {
      const subscription = this.subscriptions.get(subscriptionKey);
      if (!subscription || !subscription.active) {
        this.stopPolling(subscriptionKey);
        return;
      }

      try {
        const price = await this.getPrice(
          subscription.token,
          subscription.quoteCurrency,
          subscription.source as 'jupiter' | 'pyth' | 'birdeye'
        );

        subscription.lastPrice = price;

        // Call callback if provided
        if (subscription.onPriceUpdate) {
          subscription.onPriceUpdate(price);
        }
      } catch (error) {
        console.error(`[PriceMonitor] Polling error for ${subscriptionKey}:`, error);
      }
    };

    // Initial fetch
    pollFn();

    // Start interval
    const intervalId = setInterval(pollFn, interval);
    this.pollingIntervals.set(subscriptionKey, intervalId);

    console.log(`[PriceMonitor] Started polling ${subscriptionKey} every ${interval}ms`);
  }

  private stopPolling(subscriptionKey: string): void {
    const intervalId = this.pollingIntervals.get(subscriptionKey);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(subscriptionKey);
      console.log(`[PriceMonitor] Stopped polling ${subscriptionKey}`);
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get token mint address
   */
  getTokenMint(symbol: string): string | undefined {
    return TOKEN_MINTS[symbol.toUpperCase()];
  }

  /**
   * Check if a token is supported
   */
  isTokenSupported(symbol: string): boolean {
    return symbol.toUpperCase() in TOKEN_MINTS;
  }

  /**
   * Get supported tokens
   */
  getSupportedTokens(): string[] {
    return Object.keys(TOKEN_MINTS);
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.priceCache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; tokens: string[] } {
    return {
      size: this.priceCache.size,
      tokens: Array.from(this.priceCache.keys()),
    };
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let priceMonitorInstance: PriceMonitor | null = null;

export function getPriceMonitor(config?: Partial<PriceMonitorConfig>): PriceMonitor {
  if (!priceMonitorInstance) {
    priceMonitorInstance = new PriceMonitor(config);
  }
  return priceMonitorInstance;
}

export function resetPriceMonitor(): void {
  if (priceMonitorInstance) {
    priceMonitorInstance.shutdown();
    priceMonitorInstance = null;
  }
}
