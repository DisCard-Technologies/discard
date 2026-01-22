/**
 * Token History Hook
 *
 * Provides historical price data for token charts with proper period mapping.
 * Uses Convex real-time subscriptions for automatic updates.
 */

import React, { useMemo } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';

// UI time period type (matches token-detail-screen.tsx)
export type TimePeriod = 'H' | 'D' | 'W' | 'M' | 'Y' | 'Max';

// API period type
type APIPeriod = '1H' | '1D' | '1W' | '1M' | '1Y' | 'ALL';

// Map UI periods to API periods
const PERIOD_MAP: Record<TimePeriod, APIPeriod> = {
  'H': '1H',
  'D': '1D',
  'W': '1W',
  'M': '1M',
  'Y': '1Y',
  'Max': 'ALL',
};

export interface PricePoint {
  timestamp: number;
  price: number;
  volume?: number;
}

export interface TokenHistoryData {
  symbol: string;
  name: string;
  currentPrice: number;
  history: PricePoint[];
  isFallback?: boolean;
}

interface UseTokenHistoryOptions {
  enabled?: boolean;
}

interface UseTokenHistoryReturn {
  data: TokenHistoryData | null;
  prices: number[];
  isLoading: boolean;
  error: string | null;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
}

/**
 * Hook for fetching token price history for charts
 *
 * @param symbol - Token symbol (e.g., "BTC", "ETH")
 * @param period - Time period for history ('H', 'D', 'W', 'M', 'Y', 'Max')
 * @param options - Additional options
 */
export function useTokenHistory(
  symbol: string,
  period: TimePeriod = 'D',
  options: UseTokenHistoryOptions = {}
): UseTokenHistoryReturn {
  const { enabled = true } = options;

  // Map UI period to API period
  const apiPeriod = PERIOD_MAP[period];

  // Query historical data
  const historyData = useQuery(
    api.wallets.rates.historical,
    enabled && symbol ? { symbol, period: apiPeriod } : 'skip'
  );

  // Process the data
  const processedData = useMemo(() => {
    if (!historyData) {
      return {
        data: null,
        prices: [],
        priceChange: 0,
        priceChangePercent: 0,
        high: 0,
        low: 0,
      };
    }

    const data = historyData as any;
    const history: PricePoint[] = (data.history || []).map((h: any) => ({
      timestamp: h.timestamp,
      price: h.price,
      volume: h.volume,
    }));

    const prices = history.map((h) => h.price);

    // Calculate statistics
    const firstPrice = prices[0] || 0;
    const lastPrice = prices[prices.length - 1] || data.currentPrice || 0;
    const priceChange = lastPrice - firstPrice;
    const priceChangePercent = firstPrice > 0 ? ((priceChange / firstPrice) * 100) : 0;
    const high = prices.length > 0 ? Math.max(...prices) : 0;
    const low = prices.length > 0 ? Math.min(...prices) : 0;

    return {
      data: {
        symbol: data.symbol,
        name: data.name,
        currentPrice: data.currentPrice,
        history,
        isFallback: data._fallback,
      },
      prices,
      priceChange,
      priceChangePercent,
      high,
      low,
    };
  }, [historyData]);

  return {
    ...processedData,
    isLoading: historyData === undefined,
    error: null,
  };
}

/**
 * Hook for fetching market (prediction) history
 *
 * @param marketId - Market ID
 * @param period - Time period for history
 */
export function useMarketHistory(
  marketId: string,
  period: TimePeriod = 'D',
  options: UseTokenHistoryOptions = {}
): UseTokenHistoryReturn {
  const { enabled = true } = options;

  // For now, markets don't have historical data in the backend
  // This is a placeholder for when market history is implemented
  // The market detail screen already has useMemo generating mock data

  return {
    data: null,
    prices: [],
    isLoading: false,
    error: null,
    priceChange: 0,
    priceChangePercent: 0,
    high: 0,
    low: 0,
  };
}

/**
 * Performance period configuration
 */
export interface PerformanceItem {
  period: string;
  value: string | null;
  percent: number;
  change: number;
}

type BirdeyePeriod = '1D' | '1M' | '1Y' | 'ALL';

/**
 * Hook for calculating token performance across multiple time periods
 * Uses Birdeye OHLCV data for accurate historical performance
 *
 * @param mint - Token mint address
 * @param currentPrice - Current token price (for fallback)
 * @param options - Hook options
 */
export function useTokenPerformance(
  mint: string | undefined,
  currentPrice: number,
  options: UseTokenHistoryOptions = {}
): {
  performance: PerformanceItem[];
  isLoading: boolean;
} {
  const { enabled = true } = options;

  // Fetch cached OHLCV data for each period from Birdeye
  const dayData = useQuery(
    api.explore.birdeye.getTokenOHLCV,
    enabled && mint ? { mint, period: '1D' as const } : 'skip'
  );
  const monthData = useQuery(
    api.explore.birdeye.getTokenOHLCV,
    enabled && mint ? { mint, period: '1M' as const } : 'skip'
  );
  const yearData = useQuery(
    api.explore.birdeye.getTokenOHLCV,
    enabled && mint ? { mint, period: '1Y' as const } : 'skip'
  );
  const allData = useQuery(
    api.explore.birdeye.getTokenOHLCV,
    enabled && mint ? { mint, period: 'ALL' as const } : 'skip'
  );

  // Action to fetch fresh data from Birdeye
  const fetchPerformance = useAction(api.explore.birdeye.fetchTokenPerformance);

  // Track if we've attempted initial fetch
  const hasAttemptedFetch = React.useRef(false);

  // Fetch data if not cached
  React.useEffect(() => {
    if (!enabled || !mint || hasAttemptedFetch.current) return;

    // Only fetch if data is missing (not just stale) to respect rate limits
    // Stale data is still shown - refresh happens on next visit after TTL
    const needsFetch =
      dayData === null ||
      monthData === null ||
      yearData === null ||
      allData === null;

    if (needsFetch) {
      hasAttemptedFetch.current = true;
      fetchPerformance({ mint }).catch((err) => {
        console.error('[useTokenPerformance] Fetch error:', err);
      });
    }
  }, [enabled, mint, dayData, monthData, yearData, allData, fetchPerformance]);

  // Reset fetch tracking when mint changes
  React.useEffect(() => {
    hasAttemptedFetch.current = false;
  }, [mint]);

  const performance = useMemo(() => {
    const calculateChange = (
      data: { data: Array<{ c: number }> } | null | undefined
    ): { value: string | null; percent: number; change: number } => {
      if (!data?.data || data.data.length === 0) {
        return { value: null, percent: 50, change: 0 };
      }

      const firstPrice = data.data[0].c;
      const lastPrice = data.data[data.data.length - 1].c || currentPrice;

      if (firstPrice === 0) {
        return { value: null, percent: 50, change: 0 };
      }

      const change = ((lastPrice - firstPrice) / firstPrice) * 100;
      const isPositive = change >= 0;

      return {
        value: `${isPositive ? '+' : ''}${change.toFixed(2)}%`,
        // Normalize percent to 0-100 scale for progress bar
        percent: Math.min(100, Math.max(0, 50 + (change / 2))),
        change,
      };
    };

    const items: PerformanceItem[] = [
      {
        period: '1 Day',
        ...calculateChange(dayData),
      },
      {
        period: '1 Month',
        ...calculateChange(monthData),
      },
      {
        period: '1 Year',
        ...calculateChange(yearData),
      },
      {
        period: 'All Time',
        ...calculateChange(allData),
      },
    ];

    return items;
  }, [dayData, monthData, yearData, allData, currentPrice]);

  const isLoading =
    dayData === undefined ||
    monthData === undefined ||
    yearData === undefined ||
    allData === undefined;

  return {
    performance,
    isLoading,
  };
}

export default useTokenHistory;
