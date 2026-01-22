/**
 * Token Detail Hook
 *
 * Fetches detailed token information from Jupiter Tokens API V2 and Helius DAS.
 * Uses Convex cache for efficiency and provides real-time updates.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export interface TokenDetailData {
  mint: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  // Market data
  marketCap?: number;
  volume24h?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  fdv?: number;
  // Metadata
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  logoUri?: string;
  // Status
  verified?: boolean;
  updatedAt: number;
}

interface UseTokenDetailOptions {
  /** Whether to auto-refresh when cache is stale */
  autoRefresh?: boolean;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

interface UseTokenDetailReturn {
  /** Token detail data */
  data: TokenDetailData | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether data is from cache (stale) */
  isStale: boolean;
  /** Refresh data from API */
  refresh: () => Promise<void>;
  /** Market cap formatted */
  marketCap: string;
  /** Volume 24h formatted */
  volume24h: string;
  /** Circulating supply formatted */
  circulatingSupply: string;
  /** Total supply formatted */
  totalSupply: string;
  /** Social links object */
  socials: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
}

/**
 * Format large numbers for display (e.g., 1.2B, 345M)
 */
function formatLargeNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || value === 0) return "N/A";

  const absValue = Math.abs(value);

  if (absValue >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`;
  } else if (absValue >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  } else if (absValue >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  } else if (absValue >= 1e3) {
    return `$${(value / 1e3).toFixed(2)}K`;
  } else {
    return `$${value.toFixed(2)}`;
  }
}

/**
 * Format supply numbers (no $ prefix)
 */
function formatSupply(value: number | undefined | null): string {
  if (value === undefined || value === null || value === 0) return "N/A";

  const absValue = Math.abs(value);

  if (absValue >= 1e12) {
    return `${(value / 1e12).toFixed(2)}T`;
  } else if (absValue >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  } else if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  } else {
    return value.toLocaleString();
  }
}

/**
 * Hook for fetching detailed token information
 *
 * @param mint - Token mint address
 * @param options - Configuration options
 * @returns Token detail data, loading states, and controls
 *
 * @example
 * ```tsx
 * const { data, marketCap, volume24h, socials, isLoading } = useTokenDetail(token.mint);
 * ```
 */
export function useTokenDetail(
  mint: string | undefined,
  options: UseTokenDetailOptions = {}
): UseTokenDetailReturn {
  const { autoRefresh = true, enabled = true } = options;

  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Subscribe to cached token details from Convex
  const cachedData = useQuery(
    api.explore.tokenDetail.getTokenDetail,
    enabled && mint ? { mint } : "skip"
  );

  // Action to refresh from Jupiter + Helius APIs
  const refreshAction = useAction(api.explore.tokenDetail.refreshTokenDetail);

  // Track if we've attempted initial fetch
  const hasAttemptedFetch = useRef(false);
  const lastMint = useRef<string | undefined>(undefined);

  // Refresh function
  const refresh = useCallback(async () => {
    if (!mint) return;

    setError(null);
    setIsRefreshing(true);

    try {
      await refreshAction({ mint });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch token details";
      setError(message);
      console.error("[useTokenDetail] Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [mint, refreshAction]);

  // Reset fetch attempt tracking when mint changes
  useEffect(() => {
    if (mint !== lastMint.current) {
      hasAttemptedFetch.current = false;
      lastMint.current = mint;
    }
  }, [mint]);

  // Initial fetch if no cache, or auto-refresh when cache is stale
  useEffect(() => {
    if (!enabled || !mint) return;

    // Only attempt initial fetch once per mint
    if (cachedData === null && !hasAttemptedFetch.current) {
      hasAttemptedFetch.current = true;
      refresh();
    } else if (autoRefresh && cachedData?.isStale && !isRefreshing) {
      refresh();
    }
  }, [cachedData, autoRefresh, refresh, enabled, mint, isRefreshing]);

  // Transform cached data
  const data: TokenDetailData | null = useMemo(() => {
    if (!cachedData) return null;

    return {
      mint: cachedData.mint,
      symbol: cachedData.symbol,
      name: cachedData.name,
      priceUsd: cachedData.priceUsd,
      change24h: cachedData.change24h,
      marketCap: cachedData.marketCap ?? undefined,
      volume24h: cachedData.volume24h ?? undefined,
      circulatingSupply: cachedData.circulatingSupply ?? undefined,
      totalSupply: cachedData.totalSupply ?? undefined,
      fdv: cachedData.fdv ?? undefined,
      description: cachedData.description ?? undefined,
      website: cachedData.website ?? undefined,
      twitter: cachedData.twitter ?? undefined,
      telegram: cachedData.telegram ?? undefined,
      discord: cachedData.discord ?? undefined,
      logoUri: cachedData.logoUri ?? undefined,
      verified: cachedData.verified ?? undefined,
      updatedAt: cachedData.updatedAt,
    };
  }, [cachedData]);

  // Format market values
  const marketCap = useMemo(
    () => formatLargeNumber(data?.marketCap),
    [data?.marketCap]
  );

  const volume24h = useMemo(
    () => formatLargeNumber(data?.volume24h),
    [data?.volume24h]
  );

  const circulatingSupply = useMemo(
    () => formatSupply(data?.circulatingSupply),
    [data?.circulatingSupply]
  );

  const totalSupply = useMemo(
    () => formatSupply(data?.totalSupply),
    [data?.totalSupply]
  );

  // Extract social links
  const socials = useMemo(
    () => ({
      website: data?.website,
      twitter: data?.twitter,
      telegram: data?.telegram,
      discord: data?.discord,
    }),
    [data?.website, data?.twitter, data?.telegram, data?.discord]
  );

  return {
    data,
    isLoading: cachedData === undefined || isRefreshing,
    error,
    isStale: cachedData?.isStale ?? false,
    refresh,
    marketCap,
    volume24h,
    circulatingSupply,
    totalSupply,
    socials,
  };
}

export default useTokenDetail;
