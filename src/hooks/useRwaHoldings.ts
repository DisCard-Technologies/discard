/**
 * RWA Holdings Hook
 *
 * Filters token holdings to show only Real World Asset tokens.
 * RWA tokens are identified by their mint addresses.
 */
import { useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  RWA_TOKEN_MINTS,
  getRwaInfo,
  type RwaToken,
  type UseRwaHoldingsReturn,
} from "../types/holdings.types";

/**
 * Hook for fetching user's RWA (Real World Asset) token holdings
 *
 * @param walletAddress - User's Solana wallet address
 * @returns RWA token holdings data, loading states, and refresh function
 *
 * @example
 * ```tsx
 * const { rwaTokens, totalValue, isLoading } = useRwaHoldings(walletAddress);
 * ```
 */
export function useRwaHoldings(
  walletAddress: string | null | undefined
): UseRwaHoldingsReturn {
  // Subscribe to RWA-only holdings from Convex
  const cachedHoldings = useQuery(
    api.holdings.jupiter.getRwaHoldings,
    walletAddress ? { walletAddress } : "skip"
  );

  // Action to refresh from Jupiter API (same as token holdings)
  const refreshAction = useAction(api.holdings.jupiter.refreshHoldings);

  // Transform cached data to RwaToken[]
  const rwaTokens: RwaToken[] = useMemo(() => {
    if (!cachedHoldings) return [];

    return cachedHoldings.map((h) => {
      const rwaInfo = h.rwaMetadata || getRwaInfo(h.mint);

      return {
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
        issuer: rwaInfo?.issuer ?? "Unknown",
        underlyingAsset: rwaInfo?.type ?? "unknown",
        rwaType: (rwaInfo?.type ?? "unknown") as RwaToken["rwaType"],
        yield: rwaInfo?.expectedYield,
      };
    });
  }, [cachedHoldings]);

  // Calculate total value
  const totalValue = useMemo(
    () => rwaTokens.reduce((sum, t) => sum + t.valueUsd, 0),
    [rwaTokens]
  );

  // Refresh function
  const refresh = async () => {
    if (!walletAddress) return;
    await refreshAction({ walletAddress });
  };

  return {
    rwaTokens,
    totalValue,
    isLoading: cachedHoldings === undefined,
    isRefreshing: false, // Inherits from useTokenHoldings
    error: null,
    refresh,
  };
}

/**
 * Get available RWA token types for display
 */
export function useRwaTokenTypes() {
  return useMemo(() => {
    const types = new Set<string>();
    Object.values(RWA_TOKEN_MINTS).forEach((info) => {
      types.add(info.type);
    });
    return Array.from(types);
  }, []);
}

/**
 * Get RWA tokens grouped by issuer
 */
export function useRwaByIssuer(rwaTokens: RwaToken[]) {
  return useMemo(() => {
    const grouped: Record<string, RwaToken[]> = {};

    rwaTokens.forEach((token) => {
      if (!grouped[token.issuer]) {
        grouped[token.issuer] = [];
      }
      grouped[token.issuer].push(token);
    });

    return grouped;
  }, [rwaTokens]);
}

/**
 * Calculate total yield from RWA holdings
 */
export function useRwaYieldSummary(rwaTokens: RwaToken[]) {
  return useMemo(() => {
    let totalValue = 0;
    let weightedYield = 0;

    rwaTokens.forEach((token) => {
      totalValue += token.valueUsd;
      if (token.yield) {
        weightedYield += token.valueUsd * token.yield;
      }
    });

    const averageYield = totalValue > 0 ? weightedYield / totalValue : 0;
    const estimatedAnnualYield = (totalValue * averageYield) / 100;

    return {
      totalValue,
      averageYield,
      estimatedAnnualYield,
      tokenCount: rwaTokens.length,
    };
  }, [rwaTokens]);
}
