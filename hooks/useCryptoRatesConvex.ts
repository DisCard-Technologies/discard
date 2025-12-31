/**
 * Convex-based Crypto Rates Hook
 *
 * Replaces WebSocket-based rate updates with Convex real-time subscriptions.
 * Provides automatic reconnection, caching, and rate comparison utilities.
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

// Type definitions (replacing @discard/shared imports)
export interface CryptoRate {
  symbol: string;
  name: string;
  usdPrice: string;
  change24h: number;
  volume24h: number;
  marketCap: number;
  timestamp: string;
  source: string;
}

export interface ConnectionState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastUpdate: Date | null;
  error: string | null;
}

interface UseCryptoRatesOptions {
  symbols?: string[];
  enabled?: boolean;
}

interface UseCryptoRatesReturn {
  // State
  rates: CryptoRate[];
  connectionState: ConnectionState;
  isLoading: boolean;

  // Utilities
  getRateBySymbol: (symbol: string) => CryptoRate | null;
  getLatestRates: () => CryptoRate[];
  isSymbolSupported: (symbol: string) => boolean;
  convertToUsd: (amount: number, symbol: string) => number | null;
  convertFromUsd: (usdAmount: number, symbol: string) => number | null;
  getPercentChange: (symbol: string) => number | null;
}

const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'XRP'];

export function useCryptoRates(
  options: UseCryptoRatesOptions = {}
): UseCryptoRatesReturn {
  const { symbols = DEFAULT_SYMBOLS, enabled = true } = options;

  // Convex real-time subscription for crypto rates
  const ratesData = useQuery(
    api.wallets.rates.list,
    enabled ? { symbols } : 'skip'
  );

  // Determine connection state based on Convex query status
  const connectionState: ConnectionState = useMemo(() => {
    if (!enabled) {
      return {
        isConnected: false,
        connectionStatus: 'disconnected',
        lastUpdate: null,
        error: null,
      };
    }

    if (ratesData === undefined) {
      return {
        isConnected: false,
        connectionStatus: 'connecting',
        lastUpdate: null,
        error: null,
      };
    }

    return {
      isConnected: true,
      connectionStatus: 'connected',
      lastUpdate: new Date(),
      error: null,
    };
  }, [enabled, ratesData]);

  // Transform rates data
  const rates: CryptoRate[] = useMemo(() => {
    if (!ratesData) return [];
    return ratesData.map((rate) => ({
      symbol: rate.symbol,
      name: rate.name || rate.symbol,
      usdPrice: rate.usdPrice.toString(),
      change24h: rate.change24h || 0,
      volume24h: rate.volume24h || 0,
      marketCap: rate.marketCap || 0,
      timestamp: rate.updatedAt
        ? new Date(rate.updatedAt).toISOString()
        : new Date().toISOString(),
      source: rate.source || 'convex',
    }));
  }, [ratesData]);

  // Utility functions
  const getRateBySymbol = useCallback(
    (symbol: string): CryptoRate | null => {
      return rates.find((rate) => rate.symbol.toUpperCase() === symbol.toUpperCase()) || null;
    },
    [rates]
  );

  const getLatestRates = useCallback((): CryptoRate[] => {
    return [...rates];
  }, [rates]);

  const isSymbolSupported = useCallback(
    (symbol: string): boolean => {
      return symbols.map((s) => s.toUpperCase()).includes(symbol.toUpperCase());
    },
    [symbols]
  );

  const convertToUsd = useCallback(
    (amount: number, symbol: string): number | null => {
      const rate = getRateBySymbol(symbol);
      if (!rate) return null;
      return amount * parseFloat(rate.usdPrice);
    },
    [getRateBySymbol]
  );

  const convertFromUsd = useCallback(
    (usdAmount: number, symbol: string): number | null => {
      const rate = getRateBySymbol(symbol);
      if (!rate) return null;
      const price = parseFloat(rate.usdPrice);
      if (price === 0) return null;
      return usdAmount / price;
    },
    [getRateBySymbol]
  );

  const getPercentChange = useCallback(
    (symbol: string): number | null => {
      const rate = getRateBySymbol(symbol);
      if (!rate) return null;
      return rate.change24h;
    },
    [getRateBySymbol]
  );

  return {
    rates,
    connectionState,
    isLoading: ratesData === undefined,
    getRateBySymbol,
    getLatestRates,
    isSymbolSupported,
    convertToUsd,
    convertFromUsd,
    getPercentChange,
  };
}

/**
 * Hook for historical rate data
 */
export function useHistoricalRates(
  symbol: string,
  timeframe: '1h' | '24h' | '7d' | '30d' = '24h'
) {
  const historicalData = useQuery(api.wallets.rates.historical, {
    symbol,
    timeframe,
  });

  return {
    data: historicalData?.dataPoints || [],
    summary: historicalData
      ? {
          high: historicalData.high,
          low: historicalData.low,
          open: historicalData.open,
          close: historicalData.close,
          change: historicalData.changePercent,
        }
      : null,
    isLoading: historicalData === undefined,
  };
}

/**
 * Hook for rate comparison across exchanges
 */
export function useRateComparison(symbol: string) {
  const comparisonData = useQuery(api.wallets.rates.compare, { symbol });

  return {
    exchanges: comparisonData?.exchanges || [],
    bestBuy: comparisonData?.bestBuy || null,
    bestSell: comparisonData?.bestSell || null,
    spread: comparisonData?.averageSpread || 0,
    isLoading: comparisonData === undefined,
  };
}

export default useCryptoRates;
