/**
 * useFeeEstimate Hook
 *
 * React hook for dynamic fee estimation in transfer flows.
 * Automatically fetches and caches fee estimates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  estimateTransferFees,
  quickEstimateFees,
  getSolPriceUsd,
  type TransferFees,
} from '@/lib/fees/estimateFees';

export interface UseFeeEstimateOptions {
  amountUsd?: number;
  includeAtaRent?: boolean;
  refreshInterval?: number; // ms, default 30 seconds
  enabled?: boolean; // Whether to fetch fees
}

export interface UseFeeEstimateResult {
  fees: TransferFees;
  isLoading: boolean;
  error: string | null;
  solPriceUsd: number;
  refresh: () => Promise<void>;
}

const DEFAULT_REFRESH_INTERVAL = 30000; // 30 seconds

export function useFeeEstimate(
  options: UseFeeEstimateOptions = {}
): UseFeeEstimateResult {
  const {
    amountUsd = 0,
    includeAtaRent = false,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
    enabled = true,
  } = options;

  // State
  const [fees, setFees] = useState<TransferFees>(() =>
    quickEstimateFees(amountUsd, 150, includeAtaRent)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solPriceUsd, setSolPriceUsd] = useState(150);

  // Ref to track if component is mounted
  const mountedRef = useRef(true);

  // Fetch fees
  const fetchFees = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get SOL price first
      const price = await getSolPriceUsd();
      if (!mountedRef.current) return;
      setSolPriceUsd(price);

      // Estimate fees
      const estimated = await estimateTransferFees({
        amountUsd,
        includeAtaRent,
        solPriceUsd: price,
      });

      if (!mountedRef.current) return;
      setFees(estimated);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[useFeeEstimate] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to estimate fees');

      // Fall back to quick estimate
      setFees(quickEstimateFees(amountUsd, solPriceUsd, includeAtaRent));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [amountUsd, includeAtaRent, enabled, solPriceUsd]);

  // Initial fetch
  useEffect(() => {
    fetchFees();
  }, [fetchFees]);

  // Periodic refresh
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const interval = setInterval(fetchFees, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchFees, enabled, refreshInterval]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Update fees when amount changes (use quick estimate for responsiveness)
  useEffect(() => {
    setFees((prev) => ({
      ...prev,
      totalCostUsd: amountUsd + prev.totalFeesUsd,
    }));
  }, [amountUsd]);

  return {
    fees,
    isLoading,
    error,
    solPriceUsd,
    refresh: fetchFees,
  };
}
