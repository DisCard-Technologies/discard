/**
 * Category Tokens Hook
 *
 * Fetches tokens by category from external APIs:
 * - LSTs (Reward-Bearing): Jupiter Tag API
 * - Stables: CoinGecko stablecoins category
 * - Memes: CoinGecko Solana meme coins category
 * - Stocks: Jupiter search for xStock tokens
 * - RWA: CoinGecko real-world-assets category
 */
import { useState, useEffect, useCallback } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { TrendingToken } from '@/types/holdings.types';

export type TokenCategoryFilter = 'all' | 'stables' | 'stocks' | 'reward' | 'memes' | 'rwa';

interface UseCategoryTokensReturn {
  tokens: TrendingToken[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCategoryTokens(category: TokenCategoryFilter): UseCategoryTokensReturn {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTokensByTag = useAction(api.explore.trending.getTokensByTag);
  const getTokensByCategory = useAction(api.explore.trending.getTokensByCategory);
  const searchTokens = useAction(api.explore.trending.searchTokens);

  const fetchCategoryTokens = useCallback(async () => {
    if (category === 'all') {
      setTokens([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let result: TrendingToken[] = [];

      switch (category) {
        case 'reward':
          // Use Jupiter LST tag API
          result = await getTokensByTag({ tag: 'lst' });
          break;
        case 'stables':
          // Use CoinGecko stablecoins category
          result = await getTokensByCategory({ category: 'stablecoins' });
          break;
        case 'memes':
          // Use CoinGecko Solana meme coins category
          result = await getTokensByCategory({ category: 'solana-meme-coins' });
          break;
        case 'stocks':
          // Use Jupiter search for xStocks
          result = await searchTokens({ query: 'xStock' });
          break;
        case 'rwa':
          // Use CoinGecko real-world-assets category
          result = await getTokensByCategory({ category: 'real-world-assets' });
          break;
      }

      setTokens(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch category tokens');
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [category, getTokensByTag, getTokensByCategory, searchTokens]);

  useEffect(() => {
    fetchCategoryTokens();
  }, [fetchCategoryTokens]);

  return { tokens, isLoading, error, refresh: fetchCategoryTokens };
}
