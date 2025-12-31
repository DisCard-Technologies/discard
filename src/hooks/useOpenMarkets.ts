/**
 * Open Markets Hook
 *
 * Fetches open prediction markets from DFlow/Kalshi.
 * Uses shared Convex cache for efficiency.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type {
  PredictionMarket,
  UseOpenMarketsReturn,
} from "../types/holdings.types";

interface UseOpenMarketsOptions {
  /** Filter by category */
  category?: string;
  /** Limit number of results */
  limit?: number;
  /** Whether to auto-refresh when cache is stale */
  autoRefresh?: boolean;
}

/**
 * Hook for fetching open prediction markets for explore/discovery
 *
 * @param options - Configuration options
 * @returns Open markets data, loading states, and controls
 *
 * @example
 * ```tsx
 * const { markets, categories, selectedCategory, setCategory } = useOpenMarkets();
 * ```
 */
export function useOpenMarkets(
  options: UseOpenMarketsOptions = {}
): UseOpenMarketsReturn {
  const { category: initialCategory, limit, autoRefresh = true } = options;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    initialCategory ?? null
  );
  const [error, setError] = useState<string | null>(null);

  // Subscribe to cached open markets from Convex
  const cachedMarkets = useQuery(api.explore.trending.getOpenMarkets, {
    category: selectedCategory ?? undefined,
    limit,
  });

  // Get market categories
  const cachedCategories = useQuery(api.explore.trending.getMarketCategories);

  // Action to refresh from DFlow API
  const refreshAction = useAction(api.explore.trending.refreshOpenMarkets);

  // Refresh function
  const refresh = useCallback(async () => {
    setError(null);
    try {
      await refreshAction();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch markets";
      setError(message);
      console.error("[useOpenMarkets] Refresh error:", err);
    }
  }, [refreshAction]);

  // Track if we've attempted initial fetch
  const hasAttemptedFetch = React.useRef(false);

  // Auto-refresh when cache is empty (no markets)
  useEffect(() => {
    // cachedMarkets is undefined while loading, empty array when no data
    if (autoRefresh && cachedMarkets !== undefined && cachedMarkets.length === 0 && !hasAttemptedFetch.current) {
      hasAttemptedFetch.current = true;
      refresh();
    }
  }, [autoRefresh, cachedMarkets, refresh]);

  // Transform cached data to PredictionMarket[]
  const markets: PredictionMarket[] = useMemo(() => {
    if (!cachedMarkets) return [];

    return cachedMarkets.map((m) => ({
      marketId: m.marketId,
      ticker: m.ticker,
      eventId: m.eventId,
      question: m.question,
      status: m.status,
      yesPrice: m.yesPrice,
      noPrice: m.noPrice,
      volume24h: m.volume24h,
      endDate: m.endDate,
      category: m.category,
      resolutionSource: m.resolutionSource,
    }));
  }, [cachedMarkets]);

  // Extract category names
  const categories: string[] = useMemo(() => {
    return cachedCategories?.map((c) => c.category) ?? [];
  }, [cachedCategories]);

  // Set category with null for "all"
  const setCategory = useCallback((category: string | null) => {
    setSelectedCategory(category);
  }, []);

  return {
    markets,
    isLoading: cachedMarkets === undefined,
    error,
    categories,
    selectedCategory,
    setCategory,
    refresh,
  };
}

/**
 * Search markets by question text
 */
export function useSearchMarkets(searchQuery: string) {
  const searchResults = useQuery(
    api.explore.trending.searchMarkets,
    searchQuery.trim() ? { query: searchQuery } : "skip"
  );

  return {
    results: searchResults ?? [],
    isLoading: searchQuery.trim() ? searchResults === undefined : false,
  };
}

/**
 * Get markets grouped by category
 */
export function useMarketsByCategory(markets: PredictionMarket[]) {
  return useMemo(() => {
    const grouped: Record<string, PredictionMarket[]> = {};

    markets.forEach((market) => {
      const category = market.category || "Other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(market);
    });

    return grouped;
  }, [markets]);
}

/**
 * Sort markets by different criteria
 */
export function useSortedMarkets(
  markets: PredictionMarket[],
  sortBy: "volume" | "endDate" | "yesPrice" | "question" = "volume",
  sortOrder: "asc" | "desc" = "desc"
) {
  return useMemo(() => {
    const sorted = [...markets].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "volume":
          comparison = a.volume24h - b.volume24h;
          break;
        case "endDate":
          comparison =
            new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          break;
        case "yesPrice":
          comparison = a.yesPrice - b.yesPrice;
          break;
        case "question":
          comparison = a.question.localeCompare(b.question);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [markets, sortBy, sortOrder]);
}

/**
 * Get markets ending soon
 */
export function useMarketsEndingSoon(
  markets: PredictionMarket[],
  withinDays: number = 7
) {
  return useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    return markets
      .filter((m) => {
        const endDate = new Date(m.endDate);
        return endDate <= cutoff && endDate > now;
      })
      .sort((a, b) => {
        return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
      });
  }, [markets, withinDays]);
}

/**
 * Get markets with high volume
 */
export function useHighVolumeMarkets(
  markets: PredictionMarket[],
  minVolume: number = 10000
) {
  return useMemo(() => {
    return markets
      .filter((m) => m.volume24h >= minVolume)
      .sort((a, b) => b.volume24h - a.volume24h);
  }, [markets, minVolume]);
}

/**
 * Calculate market statistics
 */
export function useMarketStats(markets: PredictionMarket[]) {
  return useMemo(() => {
    const totalVolume = markets.reduce((sum, m) => sum + m.volume24h, 0);
    const averageVolume =
      markets.length > 0 ? totalVolume / markets.length : 0;

    const categoryCount: Record<string, number> = {};
    markets.forEach((m) => {
      categoryCount[m.category] = (categoryCount[m.category] || 0) + 1;
    });

    const topCategory = Object.entries(categoryCount).sort(
      (a, b) => b[1] - a[1]
    )[0];

    return {
      totalMarkets: markets.length,
      totalVolume,
      averageVolume,
      categoryCount,
      topCategory: topCategory?.[0] ?? null,
    };
  }, [markets]);
}
