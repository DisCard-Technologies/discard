/**
 * RWA Opportunities Hook
 *
 * Provides access to available RWA (Real World Asset) tokens
 * that users can explore and invest in.
 */
import { useState, useMemo, useCallback } from "react";
import {
  RWA_TOKEN_MINTS,
  type RwaTokenInfo,
  type RwaType,
  type UseRwaOpportunitiesReturn,
} from "../types/holdings.types";

interface RwaOpportunity extends RwaTokenInfo {
  mint: string;
}

interface UseRwaOpportunitiesOptions {
  /** Filter by RWA type */
  filterType?: RwaType;
  /** Filter by minimum yield */
  minYield?: number;
  /** Sort by field */
  sortBy?: "yield" | "name" | "issuer";
  /** Sort order */
  sortOrder?: "asc" | "desc";
}

/**
 * Hook for exploring available RWA investment opportunities
 *
 * This hook provides static RWA token info since the available
 * RWA tokens are predefined. In production, this could be enhanced
 * to fetch live APY data from each protocol.
 *
 * @param options - Filter and sort options
 * @returns RWA opportunities and filter controls
 *
 * @example
 * ```tsx
 * const { opportunities, isLoading, filterByType } = useRwaOpportunities();
 * ```
 */
export function useRwaOpportunities(
  options: UseRwaOpportunitiesOptions = {}
): UseRwaOpportunitiesReturn {
  const {
    filterType: initialFilterType,
    minYield: initialMinYield,
    sortBy = "yield",
    sortOrder = "desc",
  } = options;

  const [filterType, setFilterType] = useState<RwaType | undefined>(
    initialFilterType
  );
  const [minYield, setMinYield] = useState<number | undefined>(initialMinYield);

  // Transform RWA_TOKEN_MINTS to opportunities array
  const allOpportunities: RwaOpportunity[] = useMemo(() => {
    return Object.entries(RWA_TOKEN_MINTS).map(([mint, info]) => ({
      mint,
      ...info,
    }));
  }, []);

  // Apply filters
  const filteredOpportunities = useMemo(() => {
    let result = allOpportunities;

    if (filterType) {
      result = result.filter((o) => o.type === filterType);
    }

    if (minYield !== undefined) {
      result = result.filter((o) => (o.expectedYield ?? 0) >= minYield);
    }

    return result;
  }, [allOpportunities, filterType, minYield]);

  // Apply sorting
  const opportunities = useMemo(() => {
    const sorted = [...filteredOpportunities].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "yield":
          comparison = (a.expectedYield ?? 0) - (b.expectedYield ?? 0);
          break;
        case "name":
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case "issuer":
          comparison = a.issuer.localeCompare(b.issuer);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [filteredOpportunities, sortBy, sortOrder]);

  // Get unique types for filter UI
  const availableTypes = useMemo(() => {
    const types = new Set<RwaType>();
    allOpportunities.forEach((o) => types.add(o.type));
    return Array.from(types);
  }, [allOpportunities]);

  // Get unique issuers for filter UI
  const availableIssuers = useMemo(() => {
    const issuers = new Set<string>();
    allOpportunities.forEach((o) => issuers.add(o.issuer));
    return Array.from(issuers);
  }, [allOpportunities]);

  // Refresh function (placeholder - could fetch live APY data)
  const refresh = useCallback(async () => {
    // In production, this would fetch live APY data from each protocol
    // For now, we use static data from RWA_TOKEN_MINTS
    console.log("[useRwaOpportunities] Refresh called - using static data");
  }, []);

  return {
    opportunities,
    isLoading: false, // Static data, no loading
    error: null,
    refresh,
    // Filter controls
    filterType,
    setFilterType,
    minYield,
    setMinYield,
    availableTypes,
    availableIssuers,
  };
}

/**
 * Get RWA opportunities grouped by type
 */
export function useRwaByType(opportunities: RwaOpportunity[]) {
  return useMemo(() => {
    const grouped: Record<RwaType, RwaOpportunity[]> = {} as Record<
      RwaType,
      RwaOpportunity[]
    >;

    opportunities.forEach((opp) => {
      if (!grouped[opp.type]) {
        grouped[opp.type] = [];
      }
      grouped[opp.type].push(opp);
    });

    return grouped;
  }, [opportunities]);
}

/**
 * Get RWA opportunities grouped by issuer
 */
export function useRwaByIssuer(opportunities: RwaOpportunity[]) {
  return useMemo(() => {
    const grouped: Record<string, RwaOpportunity[]> = {};

    opportunities.forEach((opp) => {
      if (!grouped[opp.issuer]) {
        grouped[opp.issuer] = [];
      }
      grouped[opp.issuer].push(opp);
    });

    return grouped;
  }, [opportunities]);
}

/**
 * Get yield statistics for RWA opportunities
 */
export function useRwaYieldStats(opportunities: RwaOpportunity[]) {
  return useMemo(() => {
    const yields = opportunities
      .map((o) => o.expectedYield)
      .filter((y): y is number => y !== undefined);

    if (yields.length === 0) {
      return {
        min: 0,
        max: 0,
        average: 0,
        count: 0,
      };
    }

    return {
      min: Math.min(...yields),
      max: Math.max(...yields),
      average: yields.reduce((a, b) => a + b, 0) / yields.length,
      count: yields.length,
    };
  }, [opportunities]);
}

/**
 * RWA type display names
 */
export const RWA_TYPE_LABELS: Record<RwaType, string> = {
  "yield-bearing-stablecoin": "Yield-Bearing Stablecoin",
  "tokenized-fund": "Tokenized Fund",
  "money-market": "Money Market",
  "money-fund": "Money Fund",
  "treasury-bill": "Treasury Bill",
  lending: "Lending",
  "private-credit": "Private Credit",
};
