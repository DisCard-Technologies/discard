/**
 * DisCard 2035 - usePrivatePrediction Hook
 *
 * React hook for privacy-preserving prediction market betting.
 * Hides bet amounts, position sizes, and settlement addresses.
 *
 * Features:
 * - Encrypted bet amounts via Arcium MPC
 * - Local position tracking (not on-chain)
 * - Anonymous settlement via stealth addresses
 * - Real-time price updates via WebSocket
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getPnpPredictionService,
  type PrivateBetRequest,
  type PrivateBetQuote,
  type PrivateBetResult,
  type PrivatePosition,
  type SettlementResult,
} from "@/services/pnpPredictionClient";
import type { PredictionMarket } from "@/types/holdings.types";

// ============================================================================
// Types
// ============================================================================

export interface PredictionState {
  /** Current phase */
  phase:
    | "idle"
    | "browsing"
    | "quoting"
    | "quoted"
    | "placing"
    | "placed"
    | "settling"
    | "settled"
    | "failed";
  /** Selected market */
  selectedMarket?: PredictionMarket;
  /** Active quote */
  quote?: PrivateBetQuote;
  /** Bet result */
  betResult?: PrivateBetResult;
  /** Settlement result */
  settlementResult?: SettlementResult;
  /** Error message */
  error?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function usePrivatePrediction(
  userAddress?: string,
  userId?: string
) {
  const [state, setState] = useState<PredictionState>({ phase: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [positions, setPositions] = useState<PrivatePosition[]>([]);
  const [trendingMarkets, setTrendingMarkets] = useState<PredictionMarket[]>([]);

  const pnpService = useRef(getPnpPredictionService());
  const priceUnsubscribes = useRef<Map<string, () => void>>(new Map());

  // ==========================================================================
  // Market Discovery
  // ==========================================================================

  /**
   * Load available markets
   */
  const loadMarkets = useCallback(async (options?: {
    category?: string;
    status?: "open" | "closed" | "resolved";
    limit?: number;
  }) => {
    setIsLoading(true);
    try {
      const [allMarkets, trending] = await Promise.all([
        pnpService.current.getMarkets(options),
        pnpService.current.getTrendingMarkets(5),
      ]);
      setMarkets(allMarkets);
      setTrendingMarkets(trending);
    } catch (error) {
      console.error("[PrivatePrediction] Failed to load markets:", error);
    }
    setIsLoading(false);
  }, []);

  /**
   * Search markets by keyword
   */
  const searchMarkets = useCallback((query: string): PredictionMarket[] => {
    const lowerQuery = query.toLowerCase();
    return markets.filter(
      (m) =>
        m.question.toLowerCase().includes(lowerQuery) ||
        m.category.toLowerCase().includes(lowerQuery) ||
        m.ticker.toLowerCase().includes(lowerQuery)
    );
  }, [markets]);

  /**
   * Select a market to bet on
   */
  const selectMarket = useCallback((market: PredictionMarket) => {
    setState({
      phase: "browsing",
      selectedMarket: market,
    });
  }, []);

  // ==========================================================================
  // Betting
  // ==========================================================================

  /**
   * Get a quote for a private bet
   */
  const getQuote = useCallback(async (
    marketId: string,
    side: "yes" | "no",
    amount: number
  ): Promise<PrivateBetQuote | null> => {
    if (!userAddress) {
      setState({ phase: "failed", error: "Wallet not connected" });
      return null;
    }

    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "quoting" }));

    try {
      const quote = await pnpService.current.getPrivateBetQuote({
        marketId,
        side,
        amount,
        userAddress,
      });

      if (quote) {
        setState({
          phase: "quoted",
          selectedMarket: quote.market,
          quote,
        });
      } else {
        setState({ phase: "failed", error: "Failed to get quote" });
      }

      setIsLoading(false);
      return quote;
    } catch (error) {
      console.error("[PrivatePrediction] Quote failed:", error);
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "Quote failed",
      });
      setIsLoading(false);
      return null;
    }
  }, [userAddress]);

  /**
   * Place a private bet
   */
  const placeBet = useCallback(async (
    quote: PrivateBetQuote,
    userPrivateKey: Uint8Array
  ): Promise<PrivateBetResult | null> => {
    if (!userId) {
      setState({ phase: "failed", error: "User not authenticated" });
      return null;
    }

    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "placing" }));

    try {
      const result = await pnpService.current.placePrivateBet(
        quote,
        userPrivateKey,
        userId
      );

      if (result.success) {
        setState({
          phase: "placed",
          selectedMarket: quote.market,
          quote,
          betResult: result,
        });

        // Refresh positions
        refreshPositions();
      } else {
        setState({
          phase: "failed",
          quote,
          betResult: result,
          error: result.error,
        });
      }

      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[PrivatePrediction] Bet failed:", error);
      setState({
        phase: "failed",
        quote,
        error: error instanceof Error ? error.message : "Bet failed",
      });
      setIsLoading(false);
      return null;
    }
  }, [userId]);

  /**
   * Quick bet - get quote and place in one call
   */
  const quickBet = useCallback(async (
    marketId: string,
    side: "yes" | "no",
    amount: number,
    userPrivateKey: Uint8Array
  ): Promise<PrivateBetResult | null> => {
    if (!userAddress || !userId) {
      setState({ phase: "failed", error: "Not authenticated" });
      return null;
    }

    setIsLoading(true);
    setState({ phase: "placing" });

    try {
      const result = await pnpService.current.quickBet(
        marketId,
        side,
        amount,
        userAddress,
        userPrivateKey,
        userId
      );

      if (result.success) {
        setState({ phase: "placed", betResult: result });
        refreshPositions();
      } else {
        setState({ phase: "failed", betResult: result, error: result.error });
      }

      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[PrivatePrediction] Quick bet failed:", error);
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "Bet failed",
      });
      setIsLoading(false);
      return null;
    }
  }, [userAddress, userId]);

  // ==========================================================================
  // Position Management
  // ==========================================================================

  /**
   * Refresh positions from service
   */
  const refreshPositions = useCallback(() => {
    const updated = pnpService.current.getPositions();
    setPositions(updated);
  }, []);

  /**
   * Refresh position prices
   */
  const refreshPrices = useCallback(async () => {
    await pnpService.current.refreshPositionPrices();
    refreshPositions();
  }, [refreshPositions]);

  /**
   * Cancel a position
   */
  const cancelPosition = useCallback(async (positionId: string) => {
    setIsLoading(true);
    const result = await pnpService.current.cancelPosition(positionId);
    if (result.success) {
      refreshPositions();
    }
    setIsLoading(false);
    return result;
  }, [refreshPositions]);

  // ==========================================================================
  // Settlement
  // ==========================================================================

  /**
   * Settle a position
   */
  const settlePosition = useCallback(async (
    positionId: string
  ): Promise<SettlementResult | null> => {
    if (!userAddress) {
      return null;
    }

    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "settling" }));

    try {
      const result = await pnpService.current.settlePosition(positionId, userAddress);

      setState({
        phase: "settled",
        settlementResult: result,
      });

      refreshPositions();
      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[PrivatePrediction] Settlement failed:", error);
      setIsLoading(false);
      return null;
    }
  }, [userAddress, refreshPositions]);

  /**
   * Settle all eligible positions
   */
  const settleAll = useCallback(async (): Promise<SettlementResult[]> => {
    if (!userAddress) return [];

    setIsLoading(true);
    const results = await pnpService.current.settleAllPositions(userAddress);
    refreshPositions();
    setIsLoading(false);
    return results;
  }, [userAddress, refreshPositions]);

  // ==========================================================================
  // Real-time Updates
  // ==========================================================================

  /**
   * Subscribe to price updates for a market
   */
  const subscribeToMarket = useCallback((
    marketId: string,
    callback: (yesPrice: number, noPrice: number) => void
  ) => {
    // Unsubscribe if already subscribed
    const existing = priceUnsubscribes.current.get(marketId);
    if (existing) {
      existing();
    }

    const unsub = pnpService.current.subscribeToMarket(marketId, callback);
    priceUnsubscribes.current.set(marketId, unsub);

    return unsub;
  }, []);

  /**
   * Unsubscribe from all markets
   */
  const unsubscribeAll = useCallback(() => {
    priceUnsubscribes.current.forEach((unsub) => unsub());
    priceUnsubscribes.current.clear();
  }, []);

  // ==========================================================================
  // Portfolio
  // ==========================================================================

  /**
   * Get portfolio summary
   */
  const getPortfolioSummary = useCallback(() => {
    return pnpService.current.getPortfolioSummary();
  }, []);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  // Load markets on mount
  useEffect(() => {
    loadMarkets({ status: "open" });
  }, [loadMarkets]);

  // Refresh positions periodically
  useEffect(() => {
    const interval = setInterval(refreshPrices, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [refreshPrices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubscribeAll();
    };
  }, [unsubscribeAll]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ phase: "idle" });
    setIsLoading(false);
  }, []);

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Format price as percentage
   */
  const formatPrice = useCallback((price: number): string => {
    return `${(price * 100).toFixed(1)}%`;
  }, []);

  /**
   * Format amount in cents as dollars
   */
  const formatAmount = useCallback((cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  }, []);

  /**
   * Get color for PnL
   */
  const getPnlColor = useCallback((pnl: number): string => {
    if (pnl > 0) return "#10B981"; // Green
    if (pnl < 0) return "#EF4444"; // Red
    return "#6B7280"; // Gray
  }, []);

  return {
    // State
    state,
    isLoading,
    markets,
    positions,
    trendingMarkets,

    // Market Discovery
    loadMarkets,
    searchMarkets,
    selectMarket,

    // Betting
    getQuote,
    placeBet,
    quickBet,

    // Position Management
    refreshPositions,
    refreshPrices,
    cancelPosition,

    // Settlement
    settlePosition,
    settleAll,

    // Real-time
    subscribeToMarket,
    unsubscribeAll,

    // Portfolio
    getPortfolioSummary,

    // Utilities
    reset,
    formatPrice,
    formatAmount,
    getPnlColor,

    // Service status
    isAvailable: pnpService.current.isAvailable(),
  };
}

export default usePrivatePrediction;
