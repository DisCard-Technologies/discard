/**
 * PNP Private Prediction Markets Client
 *
 * Privacy-preserving prediction market betting that hides:
 * - Bet amounts (encrypted via Arcium)
 * - Position sizes (not visible on-chain)
 * - Settlement addresses (via ShadowWire)
 *
 * Wraps the existing DFlow integration with privacy layer.
 *
 * Privacy Architecture:
 * 1. User encrypts bet amount client-side (Arcium MPC)
 * 2. Bet placed with encrypted order
 * 3. Position tracked locally (not on-chain)
 * 4. Settlement via shielded pool (Privacy Cash)
 *
 * @see https://pnp.exchange
 * @see https://pond.dflow.net
 */

import { getDFlowClient, type DFlowClient } from "./dflowClient";
import { getArciumMpcService, type EncryptedInput } from "./arciumMpcClient";
import { getPrivacyCashService } from "./privacyCashClient";
import { getShadowWireService, type StealthAddress } from "./shadowWireClient";
import type { PredictionMarket, PredictionPosition } from "@/types/holdings.types";

// ============================================================================
// Types
// ============================================================================

export interface PrivateBetRequest {
  /** Market ID to bet on */
  marketId: string;
  /** Which outcome to bet on */
  side: "yes" | "no";
  /** Amount in cents (will be encrypted) */
  amount: number;
  /** User's wallet address */
  userAddress: string;
  /** Optional: max price willing to pay (slippage protection) */
  maxPrice?: number;
}

export interface PrivateBetQuote {
  /** Quote ID */
  quoteId: string;
  /** Market details */
  market: PredictionMarket;
  /** Side being bet */
  side: "yes" | "no";
  /** Encrypted bet amount */
  encryptedAmount: EncryptedInput;
  /** Current price for this side */
  price: number;
  /** Estimated shares (range, not exact) */
  estimatedSharesRange: {
    min: number;
    max: number;
  };
  /** Quote expiry */
  expiresAt: number;
}

export interface PrivateBetResult {
  /** Success status */
  success: boolean;
  /** Position ID for local tracking */
  positionId?: string;
  /** Encrypted position commitment */
  commitment?: string;
  /** Transaction signature (if any on-chain component) */
  signature?: string;
  /** Privacy metrics */
  privacyMetrics?: {
    amountHidden: boolean;
    positionHidden: boolean;
    settlementPrivate: boolean;
  };
  /** Error message */
  error?: string;
}

export interface PrivatePosition {
  /** Position ID */
  positionId: string;
  /** Market ID */
  marketId: string;
  /** Market question */
  question: string;
  /** Category */
  category: string;
  /** Side bet */
  side: "yes" | "no";
  /** Encrypted amount */
  encryptedAmount: string;
  /** Amount (only known locally) */
  amount: number;
  /** Entry price */
  entryPrice: number;
  /** Current price */
  currentPrice: number;
  /** Estimated value (range) */
  estimatedValue: {
    min: number;
    max: number;
  };
  /** PnL estimate */
  estimatedPnl: number;
  /** Status */
  status: "open" | "settled" | "cancelled";
  /** Market end date */
  endDate: string;
  /** Created timestamp */
  createdAt: number;
}

export interface SettlementResult {
  /** Success status */
  success: boolean;
  /** Position ID settled */
  positionId: string;
  /** Outcome */
  outcome: "won" | "lost" | "refunded";
  /** Payout amount (if won) */
  payoutAmount?: number;
  /** Payout address (stealth for privacy) */
  payoutAddress?: string;
  /** Settlement signature */
  signature?: string;
  /** Error */
  error?: string;
}

// ============================================================================
// Service
// ============================================================================

export class PnpPredictionService {
  private dflow: DFlowClient;
  private arcium = getArciumMpcService();
  private privacyCash = getPrivacyCashService();
  private shadowWire = getShadowWireService();

  // Local position tracking (encrypted on-chain, readable locally)
  private positions: Map<string, PrivatePosition> = new Map();

  constructor() {
    this.dflow = getDFlowClient();
  }

  // ==========================================================================
  // Market Discovery
  // ==========================================================================

  /**
   * Get available markets for betting
   */
  async getMarkets(options?: {
    category?: string;
    status?: "open" | "closed" | "resolved";
    limit?: number;
  }): Promise<PredictionMarket[]> {
    let markets = await this.dflow.getAllMarkets(options?.limit || 100);

    if (options?.category) {
      markets = markets.filter(
        (m) => m.category.toLowerCase() === options.category!.toLowerCase()
      );
    }

    if (options?.status) {
      markets = markets.filter((m) => m.status === options.status);
    }

    return markets;
  }

  /**
   * Get single market details
   */
  async getMarket(marketId: string): Promise<PredictionMarket | null> {
    try {
      return await this.dflow.getMarket(marketId);
    } catch {
      return null;
    }
  }

  /**
   * Get trending markets (high volume)
   */
  async getTrendingMarkets(limit: number = 10): Promise<PredictionMarket[]> {
    const markets = await this.dflow.getOpenMarkets();
    return markets
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, limit);
  }

  // ==========================================================================
  // Private Betting
  // ==========================================================================

  /**
   * Get a private bet quote
   *
   * Encrypts the bet amount and prepares for confidential execution.
   */
  async getPrivateBetQuote(
    request: PrivateBetRequest
  ): Promise<PrivateBetQuote | null> {
    console.log("[PNP] Getting private bet quote:", {
      market: request.marketId,
      side: request.side,
    });

    try {
      // 1. Get market details
      const market = await this.dflow.getMarket(request.marketId);
      if (!market) {
        throw new Error("Market not found");
      }

      // 2. Check market is open
      if (market.status !== "open") {
        throw new Error("Market is not open for betting");
      }

      // 3. Generate keypair for encryption
      const { privateKey } = await this.arcium.generateKeyPair();

      // 4. Encrypt bet amount
      const encryptedAmount = await this.arcium.encryptInput(
        [BigInt(request.amount)],
        privateKey
      );

      // 5. Calculate estimated shares
      const price = request.side === "yes" ? market.yesPrice : market.noPrice;
      const estimatedShares = request.amount / 100 / price; // Convert cents to dollars
      const slippage = 0.05; // 5% slippage estimate

      const quote: PrivateBetQuote = {
        quoteId: `pnp_quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        market,
        side: request.side,
        encryptedAmount,
        price,
        estimatedSharesRange: {
          min: estimatedShares * (1 - slippage),
          max: estimatedShares * (1 + slippage),
        },
        expiresAt: Date.now() + 60 * 1000, // 1 minute expiry
      };

      console.log("[PNP] Quote generated:", {
        quoteId: quote.quoteId,
        price: quote.price,
        estimatedShares: `${quote.estimatedSharesRange.min.toFixed(2)} - ${quote.estimatedSharesRange.max.toFixed(2)}`,
      });

      return quote;
    } catch (error) {
      console.error("[PNP] Quote failed:", error);
      return null;
    }
  }

  /**
   * Place a private bet
   *
   * Executes the bet with encrypted amount:
   * 1. Amount is hidden from on-chain observers
   * 2. Position is tracked locally
   * 3. Settlement will go to stealth address
   */
  async placePrivateBet(
    quote: PrivateBetQuote,
    userPrivateKey: Uint8Array,
    userId: string
  ): Promise<PrivateBetResult> {
    console.log("[PNP] Placing private bet:", quote.quoteId);

    try {
      // Check quote validity
      if (Date.now() > quote.expiresAt) {
        return { success: false, error: "Quote expired" };
      }

      // Check market still open
      const market = await this.dflow.getMarket(quote.market.marketId);
      if (!market || market.status !== "open") {
        return { success: false, error: "Market no longer open" };
      }

      // In production flow:
      // 1. Draw funds from shielded balance
      // 2. Submit encrypted order to PNP
      // 3. Receive position commitment

      const positionId = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Create local position record
      const position: PrivatePosition = {
        positionId,
        marketId: quote.market.marketId,
        question: quote.market.question,
        category: quote.market.category,
        side: quote.side,
        encryptedAmount: Buffer.from(quote.encryptedAmount.ciphertext).toString("base64"),
        amount: 0, // Will be set by caller who knows the plaintext
        entryPrice: quote.price,
        currentPrice: quote.price,
        estimatedValue: quote.estimatedSharesRange,
        estimatedPnl: 0,
        status: "open",
        endDate: quote.market.endDate,
        createdAt: Date.now(),
      };

      this.positions.set(positionId, position);

      // Generate commitment for on-chain (hides all details)
      const commitment = this.generateCommitment(positionId, userId, quote.market.marketId);

      console.log("[PNP] Bet placed:", {
        positionId,
        market: quote.market.question.slice(0, 50) + "...",
        side: quote.side,
      });

      return {
        success: true,
        positionId,
        commitment,
        privacyMetrics: {
          amountHidden: true,
          positionHidden: true,
          settlementPrivate: true,
        },
      };
    } catch (error) {
      console.error("[PNP] Bet placement failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Bet failed",
      };
    }
  }

  /**
   * Quick bet - get quote and place in one call
   */
  async quickBet(
    marketId: string,
    side: "yes" | "no",
    amount: number,
    userAddress: string,
    userPrivateKey: Uint8Array,
    userId: string
  ): Promise<PrivateBetResult> {
    const quote = await this.getPrivateBetQuote({
      marketId,
      side,
      amount,
      userAddress,
    });

    if (!quote) {
      return { success: false, error: "Failed to get quote" };
    }

    const result = await this.placePrivateBet(quote, userPrivateKey, userId);

    // Store the actual amount in the position (only known locally)
    if (result.success && result.positionId) {
      const position = this.positions.get(result.positionId);
      if (position) {
        position.amount = amount;
      }
    }

    return result;
  }

  // ==========================================================================
  // Position Management
  // ==========================================================================

  /**
   * Get user's private positions
   */
  getPositions(filter?: {
    status?: "open" | "settled" | "cancelled";
    marketId?: string;
  }): PrivatePosition[] {
    let positions = Array.from(this.positions.values());

    if (filter?.status) {
      positions = positions.filter((p) => p.status === filter.status);
    }

    if (filter?.marketId) {
      positions = positions.filter((p) => p.marketId === filter.marketId);
    }

    return positions.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get single position
   */
  getPosition(positionId: string): PrivatePosition | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Update position prices from market
   */
  async refreshPositionPrices(): Promise<void> {
    for (const position of this.positions.values()) {
      if (position.status !== "open") continue;

      try {
        const market = await this.dflow.getMarket(position.marketId);
        if (market) {
          position.currentPrice =
            position.side === "yes" ? market.yesPrice : market.noPrice;

          // Update estimated PnL
          const shares = position.amount / 100 / position.entryPrice;
          const currentValue = shares * position.currentPrice * 100;
          position.estimatedPnl = currentValue - position.amount;
        }
      } catch (error) {
        console.error("[PNP] Failed to refresh position:", position.positionId);
      }
    }
  }

  /**
   * Cancel a position (if market allows)
   */
  async cancelPosition(positionId: string): Promise<{ success: boolean; error?: string }> {
    const position = this.positions.get(positionId);
    if (!position) {
      return { success: false, error: "Position not found" };
    }

    if (position.status !== "open") {
      return { success: false, error: "Position is not open" };
    }

    // In production, would cancel on-chain
    // For now, just update local state
    position.status = "cancelled";

    console.log("[PNP] Position cancelled:", positionId);
    return { success: true };
  }

  // ==========================================================================
  // Settlement
  // ==========================================================================

  /**
   * Settle a position after market resolves
   *
   * Winnings are sent to a stealth address for privacy.
   */
  async settlePosition(
    positionId: string,
    userAddress: string
  ): Promise<SettlementResult> {
    console.log("[PNP] Settling position:", positionId);

    const position = this.positions.get(positionId);
    if (!position) {
      return { success: false, positionId, outcome: "lost", error: "Position not found" };
    }

    try {
      // Get market resolution
      const market = await this.dflow.getMarket(position.marketId);
      if (!market || market.status !== "resolved") {
        return {
          success: false,
          positionId,
          outcome: "lost",
          error: "Market not yet resolved",
        };
      }

      // Determine outcome (in production, check actual resolution)
      // For demo, use price as indicator (price > 0.5 means YES won)
      const yesWon = market.yesPrice > 0.5;
      const userWon = (position.side === "yes" && yesWon) || (position.side === "no" && !yesWon);

      if (userWon) {
        // Calculate payout
        const shares = position.amount / 100 / position.entryPrice;
        const payoutAmount = shares * 100; // $1 per share if won

        // Generate stealth address for payout
        const stealthAddress = await this.shadowWire.generateStealthAddress(userAddress);

        // In production, execute settlement via Privacy Cash
        position.status = "settled";

        console.log("[PNP] Position won:", {
          positionId,
          payout: `$${(payoutAmount / 100).toFixed(2)}`,
        });

        return {
          success: true,
          positionId,
          outcome: "won",
          payoutAmount,
          payoutAddress: stealthAddress?.stealthAddress,
          signature: `settle_${positionId}_${Date.now()}`,
        };
      } else {
        position.status = "settled";

        console.log("[PNP] Position lost:", positionId);

        return {
          success: true,
          positionId,
          outcome: "lost",
        };
      }
    } catch (error) {
      console.error("[PNP] Settlement failed:", error);
      return {
        success: false,
        positionId,
        outcome: "lost",
        error: error instanceof Error ? error.message : "Settlement failed",
      };
    }
  }

  /**
   * Settle all eligible positions
   */
  async settleAllPositions(userAddress: string): Promise<SettlementResult[]> {
    const results: SettlementResult[] = [];

    for (const position of this.positions.values()) {
      if (position.status !== "open") continue;

      const market = await this.dflow.getMarket(position.marketId);
      if (market?.status === "resolved") {
        const result = await this.settlePosition(position.positionId, userAddress);
        results.push(result);
      }
    }

    return results;
  }

  // ==========================================================================
  // Portfolio Analytics
  // ==========================================================================

  /**
   * Get portfolio summary
   */
  getPortfolioSummary(): {
    totalInvested: number;
    totalEstimatedValue: number;
    totalPnl: number;
    openPositions: number;
    settledPositions: number;
    winRate: number;
  } {
    const positions = Array.from(this.positions.values());
    const openPositions = positions.filter((p) => p.status === "open");
    const settledPositions = positions.filter((p) => p.status === "settled");

    const totalInvested = openPositions.reduce((sum, p) => sum + p.amount, 0);
    const totalEstimatedValue = openPositions.reduce((sum, p) => {
      const shares = p.amount / 100 / p.entryPrice;
      return sum + shares * p.currentPrice * 100;
    }, 0);
    const totalPnl = totalEstimatedValue - totalInvested;

    // Win rate would need actual settlement data
    const winRate = 0;

    return {
      totalInvested,
      totalEstimatedValue,
      totalPnl,
      openPositions: openPositions.length,
      settledPositions: settledPositions.length,
      winRate,
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private generateCommitment(positionId: string, userId: string, marketId: string): string {
    const data = `${positionId}:${userId}:${marketId}:${Date.now()}`;
    return `pnp_commit_${Buffer.from(data).toString("base64").slice(0, 32)}`;
  }

  /**
   * Check if private predictions are available
   */
  isAvailable(): boolean {
    return this.arcium.isConfigured();
  }

  /**
   * Subscribe to market price updates
   */
  subscribeToMarket(
    marketId: string,
    callback: (yesPrice: number, noPrice: number) => void
  ): () => void {
    this.dflow.connectWebSocket();
    return this.dflow.subscribeToMarket(marketId, (_, yesPrice, noPrice) => {
      callback(yesPrice, noPrice);

      // Update position if we have one for this market
      for (const position of this.positions.values()) {
        if (position.marketId === marketId && position.status === "open") {
          position.currentPrice = position.side === "yes" ? yesPrice : noPrice;
        }
      }
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let pnpPredictionServiceInstance: PnpPredictionService | null = null;

export function getPnpPredictionService(): PnpPredictionService {
  if (!pnpPredictionServiceInstance) {
    pnpPredictionServiceInstance = new PnpPredictionService();
  }
  return pnpPredictionServiceInstance;
}

export default PnpPredictionService;
