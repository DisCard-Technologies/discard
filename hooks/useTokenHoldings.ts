/**
 * Token Holdings Hook
 *
 * Fetches and subscribes to user's token holdings via Jupiter Ultra API.
 * Uses Convex for caching and real-time subscriptions.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  JupiterHolding,
  UseTokenHoldingsReturn,
} from "@/types/holdings.types";

interface UseTokenHoldingsOptions {
  /** Whether to auto-refresh periodically */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds (default: 30000 = 30s) */
  refreshInterval?: number;
  /** Whether to fetch immediately on mount */
  fetchOnMount?: boolean;
}

/**
 * Hook for fetching and managing user's token holdings
 *
 * @param walletAddress - User's Solana wallet address
 * @param options - Configuration options
 * @returns Token holdings data, loading states, and refresh function
 *
 * @example
 * ```tsx
 * const { holdings, totalValue, isLoading, refresh } = useTokenHoldings(walletAddress);
 * ```
 */
export function useTokenHoldings(
  walletAddress: string | null | undefined,
  options: UseTokenHoldingsOptions = {}
): UseTokenHoldingsReturn {
  const {
    autoRefresh = true,
    refreshInterval = 30000,
    fetchOnMount = true,
  } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Subscribe to cached holdings from Convex
  const cachedHoldings = useQuery(
    api.holdings.jupiter.getHoldings,
    walletAddress ? { walletAddress } : "skip"
  );

  // Action to refresh from Jupiter API
  const refreshAction = useAction(api.holdings.jupiter.refreshHoldings);

  // Refresh function
  const refresh = useCallback(async () => {
    if (!walletAddress) return;

    setIsRefreshing(true);
    setError(null);

    try {
      await refreshAction({ walletAddress });
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh holdings";
      setError(message);
      console.error("[useTokenHoldings] Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [walletAddress, refreshAction]);

  // Initial fetch on mount - always refresh to get latest token metadata
  useEffect(() => {
    if (walletAddress && fetchOnMount) {
      refresh();
    }
  }, [walletAddress, fetchOnMount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !walletAddress) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, walletAddress, refresh]);

  // Transform cached data to JupiterHolding[]
  const holdings: JupiterHolding[] = useMemo(() => {
    if (!cachedHoldings) return [];

    return cachedHoldings
      .filter((h) => !h.isRwa) // Exclude RWA tokens (those go to useRwaHoldings)
      .map((h) => ({
        mint: h.mint,
        symbol: h.symbol,
        name: h.name,
        decimals: h.decimals,
        balance: h.balance,
        balanceFormatted: h.balanceFormatted,
        valueUsd: h.valueUsd,
        priceUsd: h.priceUsd,
        change24h: h.change24h,
        logoUri: h.logoUri,
      }));
  }, [cachedHoldings]);

  // Calculate total value
  const totalValue = useMemo(
    () => holdings.reduce((sum, h) => sum + h.valueUsd, 0),
    [holdings]
  );

  return {
    holdings,
    totalValue,
    isLoading: cachedHoldings === undefined,
    isRefreshing,
    error,
    refresh,
    lastUpdated,
  };
}

/**
 * Hook for getting just the portfolio overview (lighter query)
 */
export function usePortfolioValue(walletAddress: string | null | undefined) {
  const portfolioValue = useQuery(
    api.holdings.jupiter.getPortfolioValue,
    walletAddress ? { walletAddress } : "skip"
  );

  return {
    totalValue: portfolioValue?.totalValue ?? 0,
    tokenValue: portfolioValue?.tokenValue ?? 0,
    rwaValue: portfolioValue?.rwaValue ?? 0,
    holdingsCount: portfolioValue?.holdingsCount ?? 0,
    rwaCount: portfolioValue?.rwaCount ?? 0,
    isLoading: portfolioValue === undefined,
  };
}
