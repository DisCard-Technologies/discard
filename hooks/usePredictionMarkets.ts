/**
 * Prediction Markets Hook
 *
 * Fetches user's tokenized Kalshi prediction market positions via DFlow.
 * Supports WebSocket real-time price updates.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getDFlowClient } from "@/services/dflowClient";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  PredictionPosition,
  PredictionMarket,
  UsePredictionMarketsReturn,
} from "@/types/holdings.types";

interface UsePredictionMarketsOptions {
  /** Whether to connect WebSocket for real-time price updates */
  enableRealtime?: boolean;
  /** Whether to auto-refresh periodically */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds (default: 60000 = 1 minute) */
  refreshInterval?: number;
}

/**
 * Hook for fetching user's prediction market positions
 *
 * @param userId - Convex user ID
 * @param walletAddress - User's Solana wallet address
 * @param tokenData - Optional token data for syncing (mints and balances)
 * @param options - Configuration options
 * @returns Prediction market positions, loading states, and refresh function
 *
 * @example
 * ```tsx
 * const { positions, totalValue, totalPnl, isLoading } = usePredictionMarkets(userId, walletAddress);
 * ```
 */
export function usePredictionMarkets(
  userId: Id<"users"> | null | undefined,
  walletAddress: string | null | undefined,
  tokenData?: {
    mints: string[];
    balances: Record<string, number>;
  },
  options: UsePredictionMarketsOptions = {}
): UsePredictionMarketsReturn {
  const {
    enableRealtime = true,
    autoRefresh = false,
    refreshInterval = 60000,
  } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dflowClient = useRef(getDFlowClient());
  const unsubscribes = useRef<Array<() => void>>([]);

  // Subscribe to cached positions from Convex
  const cachedPositions = useQuery(
    api.holdings.dflow.getPositions,
    userId ? { userId } : "skip"
  );

  // Action to sync positions from DFlow
  const syncAction = useAction(api.holdings.dflow.syncPositions);

  // Mutation to update prices in real-time
  const updatePriceMutation = useMutation(
    api.holdings.dflow.updatePositionPrice
  );

  // Refresh function
  const refresh = useCallback(async () => {
    if (!userId || !walletAddress) return;

    setIsRefreshing(true);
    setError(null);

    try {
      // If we have token data, use it; otherwise, we need to fetch it
      // In a real implementation, this would come from the wallet/token hook
      const mints = tokenData?.mints ?? [];
      const balances = tokenData?.balances ?? {};

      if (mints.length > 0) {
        await syncAction({
          userId,
          walletAddress,
          tokenMints: mints,
          tokenBalances: balances,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync positions";
      setError(message);
      console.error("[usePredictionMarkets] Sync error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [userId, walletAddress, tokenData, syncAction]);

  // WebSocket connection for real-time price updates
  useEffect(() => {
    if (!enableRealtime || !cachedPositions?.length) return;

    // Connect WebSocket
    dflowClient.current.connectWebSocket((marketId, yesPrice, noPrice) => {
      // Update price in Convex
      updatePriceMutation({ marketId, yesPrice, noPrice }).catch((err) => {
        console.error("[usePredictionMarkets] Price update error:", err);
      });
    });

    // Subscribe to each market
    cachedPositions.forEach((pos: any) => {
      const unsub = dflowClient.current.subscribeToMarket(pos.marketId);
      unsubscribes.current.push(unsub);
    });

    return () => {
      // Cleanup subscriptions
      unsubscribes.current.forEach((unsub) => unsub());
      unsubscribes.current = [];
      dflowClient.current.disconnect();
    };
  }, [enableRealtime, cachedPositions, updatePriceMutation]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !userId || !walletAddress) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, userId, walletAddress, refresh]);

  // Transform cached data to PredictionPosition[]
  const positions: PredictionPosition[] = useMemo(() => {
    if (!cachedPositions) return [];

    return cachedPositions.map((pos: any) => ({
      marketId: pos.marketId,
      market: {
        marketId: pos.marketId,
        ticker: pos.ticker,
        eventId: "", // Not stored in cache
        question: pos.question,
        status: (pos.marketStatus as "open" | "closed" | "resolved") ?? "open",
        yesPrice: pos.side === "yes" ? pos.currentPrice : 1 - pos.currentPrice,
        noPrice: pos.side === "no" ? pos.currentPrice : 1 - pos.currentPrice,
        volume24h: 0, // Not stored in cache
        endDate: pos.endDate ?? "",
        category: pos.category ?? "",
      },
      side: pos.side,
      mintAddress: pos.mintAddress,
      shares: pos.shares,
      avgPrice: pos.avgPrice,
      currentPrice: pos.currentPrice,
      valueUsd: pos.valueUsd,
      pnl: pos.pnl,
      pnlPercent: pos.pnlPercent,
    }));
  }, [cachedPositions]);

  // Calculate totals
  const totalValue = useMemo(
    () => positions.reduce((sum, p) => sum + p.valueUsd, 0),
    [positions]
  );

  const totalPnl = useMemo(
    () => positions.reduce((sum, p) => sum + p.pnl, 0),
    [positions]
  );

  return {
    positions,
    totalValue,
    totalPnl,
    isLoading: cachedPositions === undefined,
    isRefreshing,
    error,
    refresh,
  };
}

/**
 * Hook for getting portfolio summary for prediction markets
 */
export function usePredictionPortfolioValue(userId: Id<"users"> | null | undefined) {
  const portfolioValue = useQuery(
    api.holdings.dflow.getPortfolioValue,
    userId ? { userId } : "skip"
  );

  return {
    totalValue: portfolioValue?.totalValue ?? 0,
    totalPnl: portfolioValue?.totalPnl ?? 0,
    positionsCount: portfolioValue?.positionsCount ?? 0,
    isLoading: portfolioValue === undefined,
  };
}

/**
 * Group positions by category
 */
export function usePositionsByCategory(positions: PredictionPosition[]) {
  return useMemo(() => {
    const grouped: Record<string, PredictionPosition[]> = {};

    positions.forEach((pos) => {
      const category = pos.market.category || "Other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(pos);
    });

    return grouped;
  }, [positions]);
}

/**
 * Calculate PnL summary
 */
export function usePnlSummary(positions: PredictionPosition[]) {
  return useMemo(() => {
    let totalCost = 0;
    let totalValue = 0;
    let winningPositions = 0;
    let losingPositions = 0;

    positions.forEach((pos) => {
      const cost = pos.shares * pos.avgPrice;
      totalCost += cost;
      totalValue += pos.valueUsd;

      if (pos.pnl > 0) {
        winningPositions++;
      } else if (pos.pnl < 0) {
        losingPositions++;
      }
    });

    const totalPnl = totalValue - totalCost;
    const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    return {
      totalCost,
      totalValue,
      totalPnl,
      totalPnlPercent,
      winningPositions,
      losingPositions,
      positionsCount: positions.length,
    };
  }, [positions]);
}
