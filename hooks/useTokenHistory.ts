/**
 * Token History Hook
 *
 * Provides historical price data for token charts with proper period mapping.
 * Uses Convex real-time subscriptions for automatic updates.
 */

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
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

export default useTokenHistory;
