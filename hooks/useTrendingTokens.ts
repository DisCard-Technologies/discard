/**
 * Trending Tokens Hook
 *
 * Fetches trending/top traded tokens from Jupiter Tokens API V2.
 * Uses shared Convex cache for efficiency.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  TrendingToken,
  TrendingCategory,
  TrendingInterval,
  UseTrendingTokensReturn,
} from "@/types/holdings.types";

interface UseTrendingTokensOptions {
  /** Initial category to fetch */
  initialCategory?: TrendingCategory;
  /** Initial interval to fetch */
  initialInterval?: TrendingInterval;
  /** Whether to auto-refresh when cache is stale */
  autoRefresh?: boolean;
}

/**
 * Hook for fetching trending tokens for explore/discovery
 *
 * @param options - Configuration options
 * @returns Trending tokens data, loading states, and controls
 *
 * @example
 * ```tsx
 * const { tokens, category, interval, setCategory, setInterval } = useTrendingTokens();
 * ```
 */
export function useTrendingTokens(
  options: UseTrendingTokensOptions = {}
): UseTrendingTokensReturn {
  const {
    initialCategory = "trending",
    initialInterval = "24h",
    autoRefresh = true,
  } = options;

  const [category, setCategory] = useState<TrendingCategory>(initialCategory);
  const [interval, setIntervalState] = useState<TrendingInterval>(initialInterval);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to cached trending tokens from Convex
  const cachedData = useQuery(api.explore.trending.getTrendingTokens, {
    category,
    interval,
  });

  // Action to refresh from Jupiter API
  const refreshAction = useAction(api.explore.trending.refreshTrendingTokens);

  // Refresh function
  const refresh = useCallback(async () => {
    setError(null);
    try {
      await refreshAction({ category, interval });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch trending tokens";
      setError(message);
      console.error("[useTrendingTokens] Refresh error:", err);
    }
  }, [category, interval, refreshAction]);

  // Track if we've attempted initial fetch
  const hasAttemptedFetch = React.useRef(false);

  // Initial fetch if no cache, or auto-refresh when cache is stale
  useEffect(() => {
    // Only attempt initial fetch once per category/interval combination
    if (cachedData === null && !hasAttemptedFetch.current) {
      hasAttemptedFetch.current = true;
      refresh();
    } else if (autoRefresh && cachedData?.isStale) {
      refresh();
    }
  }, [cachedData, autoRefresh, refresh]);

  // Reset fetch attempt tracking when category/interval changes
  useEffect(() => {
    hasAttemptedFetch.current = false;
  }, [category, interval]);

  // Transform cached data
  const tokens: TrendingToken[] = useMemo(() => {
    return cachedData?.tokens ?? [];
  }, [cachedData]);

  // Set interval with type safety
  const setInterval = useCallback((newInterval: TrendingInterval) => {
    setIntervalState(newInterval);
  }, []);

  return {
    tokens,
    category,
    interval,
    isLoading: cachedData === undefined,
    error,
    setCategory,
    setInterval,
    refresh,
  };
}

/**
 * Hook for getting all trending categories status
 */
export function useTrendingCategoriesStatus() {
  const categories = useQuery(api.explore.trending.getAllTrendingCategories);

  return {
    categories: categories ?? [],
    isLoading: categories === undefined,
  };
}

/**
 * Hook for verified tokens only
 */
export function useVerifiedTokens() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get cached trending data for "trending" category
  const cachedData = useQuery(api.explore.trending.getTrendingTokens, {
    category: "trending",
    interval: "24h",
  });

  // Filter to verified only
  useEffect(() => {
    if (cachedData?.tokens) {
      setTokens(cachedData.tokens.filter((t) => t.verified));
      setIsLoading(false);
    }
  }, [cachedData]);

  return { tokens, isLoading, error };
}

/**
 * Search trending tokens by symbol or name
 */
export function useSearchTrendingTokens(
  tokens: TrendingToken[],
  searchQuery: string
) {
  return useMemo(() => {
    if (!searchQuery.trim()) return tokens;

    const query = searchQuery.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.mint.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);
}

/**
 * Sort trending tokens
 */
export function useSortedTrendingTokens(
  tokens: TrendingToken[],
  sortBy: "volume" | "change" | "price" | "name" = "volume",
  sortOrder: "asc" | "desc" = "desc"
) {
  return useMemo(() => {
    const sorted = [...tokens].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "volume":
          comparison = a.volume24h - b.volume24h;
          break;
        case "change":
          comparison = a.change24h - b.change24h;
          break;
        case "price":
          comparison = a.priceUsd - b.priceUsd;
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [tokens, sortBy, sortOrder]);
}
