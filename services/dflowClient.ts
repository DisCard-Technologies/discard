/**
 * DFlow Prediction Markets API Client
 *
 * Wraps the DFlow API for tokenized Kalshi prediction markets on Solana.
 *
 * Endpoints:
 * - GET /api/v1/markets - List all markets (paginated)
 * - GET /api/v1/market/{market_id} - Single market details
 * - GET /api/v1/market/by-mint/{mint_address} - Market by mint lookup
 * - POST /api/v1/filter_outcome_mints - Filter user's outcome tokens (max 200)
 * - GET /api/v1/events - Fetch events with optional nested markets
 * - GET /api/v1/outcome_mints - Get flat list of all outcome token mints
 *
 * WebSocket: wss://ws.pond.dflow.net - Real-time price updates
 *
 * Base URL: https://api.pond.dflow.net/api/v1
 *
 * @see https://pond.dflow.net/concepts/prediction/prediction-markets
 */

import type {
  PredictionMarket,
  PredictionPosition,
  DFlowOutcomeToken,
} from "@/types/holdings.types";

const DFLOW_API_BASE_URL = "https://api.pond.dflow.net/api/v1";
const DFLOW_WS_URL = "wss://ws.pond.dflow.net";

export interface DFlowConfig {
  apiKey?: string;
  timeout?: number;
}

interface RawMarket {
  id: string;
  ticker: string;
  event_id: string;
  title: string;
  status: string;
  yes_price: number;
  no_price: number;
  volume_24h: number;
  end_date: string;
  category: string;
  resolution_source?: string;
}

interface RawMarketsResponse {
  markets: RawMarket[];
  next_cursor?: string;
  total?: number;
}

interface RawOutcomeToken {
  mint: string;
  market_id: string;
  side: "yes" | "no";
}

interface FilterOutcomeMintsResponse {
  outcome_tokens: RawOutcomeToken[];
}

type WebSocketMessage =
  | { type: "price_update"; market_id: string; yes_price: number; no_price: number }
  | { type: "market_update"; market: RawMarket }
  | { type: "subscribed"; channel: string; market_id: string }
  | { type: "error"; message: string };

type PriceUpdateCallback = (
  marketId: string,
  yesPrice: number,
  noPrice: number
) => void;

export class DFlowClient {
  private baseUrl: string;
  private wsUrl: string;
  private timeout: number;
  private headers: Record<string, string>;
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000;
  private priceCallbacks: Map<string, Set<PriceUpdateCallback>> = new Map();
  private globalPriceCallback: PriceUpdateCallback | null = null;

  constructor(config: DFlowConfig = {}) {
    this.baseUrl = DFLOW_API_BASE_URL;
    this.wsUrl = DFLOW_WS_URL;
    this.timeout = config.timeout ?? 15000;
    this.headers = {
      "Content-Type": "application/json",
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    };
  }

  // ============================================================================
  // REST API Methods
  // ============================================================================

  /**
   * Get all available markets (paginated)
   */
  async getMarkets(
    cursor?: string,
    limit: number = 100
  ): Promise<{ markets: PredictionMarket[]; nextCursor?: string }> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append("cursor", cursor);

    const response = await this.fetch<RawMarketsResponse>(
      `/markets?${params.toString()}`
    );

    return {
      markets: response.markets.map(this.transformMarket),
      nextCursor: response.next_cursor,
    };
  }

  /**
   * Get all markets (handles pagination automatically)
   */
  async getAllMarkets(maxMarkets: number = 500): Promise<PredictionMarket[]> {
    const allMarkets: PredictionMarket[] = [];
    let cursor: string | undefined;

    while (allMarkets.length < maxMarkets) {
      const { markets, nextCursor } = await this.getMarkets(cursor, 100);
      allMarkets.push(...markets);

      if (!nextCursor) break;
      cursor = nextCursor;
    }

    return allMarkets.slice(0, maxMarkets);
  }

  /**
   * Get single market by ID
   */
  async getMarket(marketId: string): Promise<PredictionMarket> {
    const response = await this.fetch<RawMarket>(`/market/${marketId}`);
    return this.transformMarket(response);
  }

  /**
   * Get market by mint address (yes or no mint)
   */
  async getMarketByMint(mintAddress: string): Promise<PredictionMarket | null> {
    try {
      const response = await this.fetch<RawMarket>(
        `/market/by-mint/${mintAddress}`
      );
      return this.transformMarket(response);
    } catch {
      return null;
    }
  }

  /**
   * Filter user's token addresses to find prediction market positions
   * @param tokenAddresses - Array of SPL token mints from user's wallet (max 200)
   */
  async filterOutcomeMints(
    tokenAddresses: string[]
  ): Promise<DFlowOutcomeToken[]> {
    if (tokenAddresses.length > 200) {
      throw new Error("Maximum 200 token addresses per request");
    }

    const response = await this.fetch<FilterOutcomeMintsResponse>(
      "/filter_outcome_mints",
      {
        method: "POST",
        body: JSON.stringify({ mints: tokenAddresses }),
      }
    );

    return response.outcome_tokens.map((token) => ({
      mint: token.mint,
      marketId: token.market_id,
      side: token.side,
      balance: 0, // Will be filled in by caller with actual balance
    }));
  }

  /**
   * Get markets by category
   */
  async getMarketsByCategory(category: string): Promise<PredictionMarket[]> {
    const { markets } = await this.getMarkets(undefined, 100);
    return markets.filter(
      (m) => m.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get open markets only
   */
  async getOpenMarkets(): Promise<PredictionMarket[]> {
    const { markets } = await this.getMarkets(undefined, 100);
    return markets.filter((m) => m.status === "open");
  }

  // ============================================================================
  // WebSocket Methods
  // ============================================================================

  /**
   * Connect to WebSocket for real-time price updates
   */
  connectWebSocket(onMessage?: PriceUpdateCallback): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    if (onMessage) {
      this.globalPriceCallback = onMessage;
    }

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log("[DFlow] WebSocket connected");
        this.reconnectAttempts = 0;

        // Re-subscribe to all markets we were tracking
        this.priceCallbacks.forEach((_, marketId) => {
          this.sendSubscription(marketId);
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error("[DFlow] Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[DFlow] WebSocket error:", error);
      };

      this.ws.onclose = () => {
        console.log("[DFlow] WebSocket closed");
        this.attemptReconnect();
      };
    } catch (error) {
      console.error("[DFlow] Failed to create WebSocket:", error);
    }
  }

  /**
   * Subscribe to price updates for a specific market
   */
  subscribeToMarket(
    marketId: string,
    callback?: PriceUpdateCallback
  ): () => void {
    if (!this.priceCallbacks.has(marketId)) {
      this.priceCallbacks.set(marketId, new Set());
    }

    if (callback) {
      this.priceCallbacks.get(marketId)!.add(callback);
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscription(marketId);
    }

    // Return unsubscribe function
    return () => {
      if (callback) {
        this.priceCallbacks.get(marketId)?.delete(callback);
      }
      if (this.priceCallbacks.get(marketId)?.size === 0) {
        this.priceCallbacks.delete(marketId);
        this.sendUnsubscription(marketId);
      }
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.globalPriceCallback = null;
    this.priceCallbacks.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

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
          `DFlow API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("DFlow API request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private transformMarket(raw: RawMarket): PredictionMarket {
    return {
      marketId: raw.id,
      ticker: raw.ticker,
      eventId: raw.event_id,
      question: raw.title,
      status: raw.status as "open" | "closed" | "resolved",
      yesPrice: raw.yes_price,
      noPrice: raw.no_price,
      volume24h: raw.volume_24h,
      endDate: raw.end_date,
      category: raw.category,
      resolutionSource: raw.resolution_source,
    };
  }

  private handleWebSocketMessage(data: WebSocketMessage): void {
    switch (data.type) {
      case "price_update":
        // Call global callback
        if (this.globalPriceCallback) {
          this.globalPriceCallback(data.market_id, data.yes_price, data.no_price);
        }
        // Call market-specific callbacks
        const callbacks = this.priceCallbacks.get(data.market_id);
        if (callbacks) {
          callbacks.forEach((cb) =>
            cb(data.market_id, data.yes_price, data.no_price)
          );
        }
        break;
      case "subscribed":
        console.log(`[DFlow] Subscribed to ${data.channel}:${data.market_id}`);
        break;
      case "error":
        console.error(`[DFlow] WebSocket error: ${data.message}`);
        break;
    }
  }

  private sendSubscription(marketId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "subscribe",
          channel: "prices",
          market_id: marketId,
        })
      );
    }
  }

  private sendUnsubscription(marketId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "unsubscribe",
          channel: "prices",
          market_id: marketId,
        })
      );
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[DFlow] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[DFlow] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }
}

// Singleton instance
let dflowClientInstance: DFlowClient | null = null;

export function getDFlowClient(config?: DFlowConfig): DFlowClient {
  if (!dflowClientInstance) {
    dflowClientInstance = new DFlowClient(config);
  }
  return dflowClientInstance;
}

/**
 * Reset the singleton (useful for testing or config changes)
 */
export function resetDFlowClient(): void {
  if (dflowClientInstance) {
    dflowClientInstance.disconnect();
  }
  dflowClientInstance = null;
}
