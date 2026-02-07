/**
 * Token Holdings Hook
 *
 * Fetches and subscribes to user's token holdings via Jupiter Ultra API.
 * Uses Convex for caching and real-time subscriptions.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  JupiterHolding,
  UseTokenHoldingsReturn,
} from "@/types/holdings.types";
import {
  acquireRefreshLock,
  releaseRefreshLock,
} from "./useHoldingsRefreshLock";
import { useSmartRefresh, useStaleness, useRefreshOnEvent } from "./useRefreshStrategy";

interface UseTokenHoldingsOptions {
  /** Whether to auto-refresh periodically */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds (default: 60000 = 60s) */
  refreshInterval?: number;
  /** Whether to fetch immediately on mount */
  fetchOnMount?: boolean;
  /** Whether to refresh on app foreground. Default: true */
  refreshOnForeground?: boolean;
  /** Whether to refresh on transaction events. Default: true */
  refreshOnEvents?: boolean;
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
    refreshInterval = 60000, // 60s to avoid race conditions
    fetchOnMount = true,
    refreshOnForeground = true,
    refreshOnEvents = true,
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

  // Refresh function with shared lock to prevent concurrent calls across hooks
  const refresh = useCallback(async () => {
    if (!walletAddress) return;

    // Use shared lock to prevent concurrent refreshes from any hook
    if (!acquireRefreshLock(walletAddress)) {
      console.log("[useTokenHoldings] Refresh already in progress, skipping");
      return;
    }

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
      releaseRefreshLock(walletAddress);
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

  // Smart refresh: foreground + event-driven
  useSmartRefresh({
    refresh,
    enabled: !!walletAddress && (refreshOnForeground || refreshOnEvents),
    minBackgroundTime: 10000, // Refresh if backgrounded 10s+
  });

  // Aggressive polling after deposit: refresh every 5s for up to 2 minutes
  const aggressivePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aggressivePollingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRefreshOnEvent({
    events: ['deposit_completed'],
    onEvent: () => {
      if (!walletAddress) return;

      // Clear any existing aggressive polling
      if (aggressivePollingRef.current) clearInterval(aggressivePollingRef.current);
      if (aggressivePollingTimeout.current) clearTimeout(aggressivePollingTimeout.current);

      console.log('[useTokenHoldings] Deposit event - starting aggressive 5s polling');

      // Poll every 5 seconds
      aggressivePollingRef.current = setInterval(() => {
        refresh();
      }, 5000);

      // Stop after 2 minutes
      aggressivePollingTimeout.current = setTimeout(() => {
        if (aggressivePollingRef.current) {
          clearInterval(aggressivePollingRef.current);
          aggressivePollingRef.current = null;
          console.log('[useTokenHoldings] Aggressive polling stopped after 2 minutes');
        }
      }, 2 * 60 * 1000);
    },
    enabled: !!walletAddress && refreshOnEvents,
  });

  // Cleanup aggressive polling on unmount
  useEffect(() => {
    return () => {
      if (aggressivePollingRef.current) clearInterval(aggressivePollingRef.current);
      if (aggressivePollingTimeout.current) clearTimeout(aggressivePollingTimeout.current);
    };
  }, []);

  // Track data staleness
  const staleness = useStaleness({
    lastUpdated,
    staleAfter: 5 * 60 * 1000, // 5 minutes
  });

  // Transform cached data to JupiterHolding[]
  const holdings: JupiterHolding[] = useMemo(() => {
    if (!cachedHoldings) return [];

    return cachedHoldings
      .filter((h: any) => !h.isRwa) // Exclude RWA tokens (those go to useRwaHoldings)
      .map((h: any) => ({
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
    // Staleness info for UI hints
    isStale: staleness.isStale,
    ageText: staleness.ageText,
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
