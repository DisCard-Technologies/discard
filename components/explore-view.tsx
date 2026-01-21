import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, TextInput, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTrendingTokens } from '@/hooks/useTrendingTokens';
import { useOpenMarkets } from '@/hooks/useOpenMarkets';
import { useRwaOpportunities, RWA_TYPE_LABELS } from '@/hooks/useRwaOpportunities';
import type { TrendingToken, PredictionMarket, RwaType } from '@/types/holdings.types';

type CategoryType = 'tokens' | 'markets' | 'rwa';

// Helper to format volume
const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(1)}B`;
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
};

// Helper to format market cap
const formatMarketCap = (marketCap?: number): string => {
  if (!marketCap) return '-';
  if (marketCap >= 1_000_000_000_000) return `$${(marketCap / 1_000_000_000_000).toFixed(0)}T`;
  if (marketCap >= 1_000_000_000) return `$${(marketCap / 1_000_000_000).toFixed(0)}B`;
  if (marketCap >= 1_000_000) return `$${(marketCap / 1_000_000).toFixed(0)}M`;
  if (marketCap >= 1_000) return `$${(marketCap / 1_000).toFixed(0)}K`;
  return `$${marketCap.toFixed(0)}`;
};

// Helper to format price
const formatPrice = (price: number): string => {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
};

// Helper to calculate time remaining from end date
const getTimeRemaining = (endDate: string): string => {
  const end = new Date(endDate);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 'Ended';
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 30) return `${Math.floor(days / 30)}mo`;
  return `${days}d`;
};

// Map RWA types to display-friendly short labels
const getRwaTypeShort = (type: RwaType): string => {
  const shortMap: Record<RwaType, string> = {
    'yield-bearing-stablecoin': 'STABLE',
    'tokenized-fund': 'FUND',
    'money-market': 'MM',
    'money-fund': 'FUND',
    'treasury-bill': 'TBILL',
    'lending': 'LEND',
    'private-credit': 'CREDIT',
  };
  return shortMap[type] || type.toUpperCase();
};

export function ExploreView() {
  const [category, setCategory] = useState<CategoryType>('tokens');
  const [searchQuery, setSearchQuery] = useState('');
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<string>('All');
  const [rwaCategoryFilter, setRwaCategoryFilter] = useState<string>('All');

  // Real data hooks
  const { tokens, isLoading: tokensLoading, error: tokensError } = useTrendingTokens();
  const { markets, isLoading: marketsLoading, categories: marketCategories, error: marketsError } = useOpenMarkets();
  const { opportunities: rwaOpportunities, isLoading: rwaLoading, availableTypes, error: rwaError } = useRwaOpportunities();

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const inputBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');

  // Build category filters from API data
  const categoryFilters = useMemo(() => {
    return ['All', ...marketCategories];
  }, [marketCategories]);

  const rwaTypeFilters = useMemo(() => {
    return ['All', ...availableTypes.map(t => RWA_TYPE_LABELS[t] || t)];
  }, [availableTypes]);

  const categories = [
    { id: 'tokens' as CategoryType, label: 'Tokens', icon: 'layers' as const, count: tokens.length },
    { id: 'markets' as CategoryType, label: 'Markets', icon: 'bar-chart' as const, count: markets.length },
    { id: 'rwa' as CategoryType, label: 'RWA', icon: 'business' as const, count: rwaOpportunities.length },
  ];

  // Filter tokens by search
  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;
    const query = searchQuery.toLowerCase();
    return tokens.filter(
      (t) => t.symbol.toLowerCase().includes(query) || t.name.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  // Filter markets by search and category
  const filteredMarkets = useMemo(() => {
    let result = markets;
    if (marketCategoryFilter !== 'All') {
      result = result.filter((m) => m.category === marketCategoryFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (m) => m.question.toLowerCase().includes(query) || m.category.toLowerCase().includes(query)
      );
    }
    return result;
  }, [markets, searchQuery, marketCategoryFilter]);

  // Filter RWA by search and type
  const filteredRWA = useMemo(() => {
    let result = rwaOpportunities;
    if (rwaCategoryFilter !== 'All') {
      const typeKey = Object.entries(RWA_TYPE_LABELS).find(([_, label]) => label === rwaCategoryFilter)?.[0];
      if (typeKey) {
        result = result.filter((r) => r.type === typeKey);
      }
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (r) => r.symbol.toLowerCase().includes(query) || r.issuer.toLowerCase().includes(query)
      );
    }
    return result;
  }, [rwaOpportunities, searchQuery, rwaCategoryFilter]);

  const getTypeColor = (type: RwaType) => {
    switch (type) {
      case 'yield-bearing-stablecoin': return '#10b981';
      case 'tokenized-fund': return '#3b82f6';
      case 'money-market': return '#8b5cf6';
      case 'money-fund': return '#3b82f6';
      case 'treasury-bill': return '#f59e0b';
      case 'lending': return '#ec4899';
      case 'private-credit': return '#6366f1';
      default: return mutedColor;
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor }]}>
        <Ionicons name="search" size={16} color={mutedColor} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search tokens, markets, assets..."
          placeholderTextColor={mutedColor}
          style={[styles.searchInput, { color: textColor }]}
        />
      </View>

      {/* Category Pills */}
      <View style={styles.categoryRow}>
        {categories.map((cat) => {
          const isActive = category === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => setCategory(cat.id)}
              style={[
                styles.categoryPill,
                { borderColor: isActive ? `${primaryColor}50` : 'transparent' },
                isActive && { backgroundColor: `${primaryColor}20` },
              ]}
            >
              <Ionicons name={cat.icon} size={14} color={isActive ? primaryColor : mutedColor} />
              <ThemedText style={[styles.categoryLabel, { color: isActive ? primaryColor : mutedColor }]}>
                {cat.label}
              </ThemedText>
              <ThemedText style={[styles.categoryCount, { color: isActive ? primaryColor : mutedColor }]}>
                {cat.count}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tokens List */}
        {category === 'tokens' && (
          <>
            {/* Header Row */}
            <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
              <ThemedText style={[styles.headerText, { color: mutedColor }]}>ASSET</ThemedText>
              <ThemedText style={[styles.headerText, styles.headerPrice, { color: mutedColor }]}>PRICE</ThemedText>
              <ThemedText style={[styles.headerText, styles.headerChange, { color: mutedColor }]}>24H</ThemedText>
              <ThemedText style={[styles.headerText, styles.headerMcap, { color: mutedColor }]}>MCAP</ThemedText>
            </View>

            {tokensLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>Loading tokens...</ThemedText>
              </View>
            ) : tokensError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#ef4444" />
                <ThemedText style={styles.errorText}>{tokensError}</ThemedText>
              </View>
            ) : filteredTokens.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="layers-outline" size={32} color={mutedColor} />
                <ThemedText style={[styles.emptyText, { color: mutedColor }]}>No tokens found</ThemedText>
              </View>
            ) : (
              filteredTokens.map((token) => (
                <Pressable
                  key={token.mint}
                  onPress={() => router.push({
                    pathname: '/token-detail',
                    params: {
                      id: token.mint,
                      symbol: token.symbol,
                      name: token.name,
                      price: token.priceUsd.toString(),
                      change24h: token.change24h.toString(),
                      volume24h: token.volume24h.toString(),
                      marketCap: token.marketCap?.toString() || '',
                      logoUri: token.logoUri || '',
                    },
                  })}
                  style={({ pressed }) => [styles.tokenRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.tokenInfo}>
                    <View style={[styles.tokenIcon, { backgroundColor: inputBg }]}>
                      {token.logoUri ? (
                        <Image source={{ uri: token.logoUri }} style={styles.tokenIconImage} />
                      ) : (
                        <ThemedText style={styles.tokenIconText}>{token.symbol.slice(0, 2)}</ThemedText>
                      )}
                    </View>
                    <View style={styles.tokenDetails}>
                      <View style={styles.tokenNameRow}>
                        <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
                        {token.verified && <Ionicons name="flash" size={10} color="#f59e0b" />}
                      </View>
                    </View>
                  </View>
                  <ThemedText style={styles.tokenPrice}>
                    {formatPrice(token.priceUsd)}
                  </ThemedText>
                  <ThemedText style={[styles.changeText, { color: token.change24h >= 0 ? '#10b981' : '#ef4444' }]}>
                    {token.change24h >= 0 ? '↑' : '↓'}{Math.abs(token.change24h).toFixed(2)}%
                  </ThemedText>
                  <ThemedText style={[styles.mcapText, { color: mutedColor }]}>
                    {formatMarketCap(token.marketCap)}
                  </ThemedText>
                </Pressable>
              ))
            )}

            {/* AI Suggestion Card - only show if we have tokens */}
            {filteredTokens.length > 0 && (
              <ThemedView style={[styles.suggestionCard, { borderColor: `${primaryColor}30` }]} lightColor="#f4f4f5" darkColor="#1c1c1e">
                <View style={styles.suggestionHeader}>
                  <Ionicons name="flash" size={16} color={primaryColor} />
                  <ThemedText style={[styles.suggestionLabel, { color: primaryColor }]}>AI Suggestion</ThemedText>
                </View>
                <ThemedText style={[styles.suggestionText, { color: mutedColor }]}>
                  "Buy $100 of SOL" - Based on momentum and your portfolio allocation
                </ThemedText>
              </ThemedView>
            )}
          </>
        )}

        {/* Markets List */}
        {category === 'markets' && (
          <>
            {/* Category Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                {categoryFilters.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setMarketCategoryFilter(cat)}
                    style={[styles.filterPill, cat === marketCategoryFilter && { backgroundColor: `${primaryColor}20` }]}
                  >
                    <ThemedText style={[styles.filterText, { color: cat === marketCategoryFilter ? primaryColor : mutedColor }]}>
                      {cat}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {marketsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>Loading markets...</ThemedText>
              </View>
            ) : marketsError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#ef4444" />
                <ThemedText style={styles.errorText}>{marketsError}</ThemedText>
              </View>
            ) : filteredMarkets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="bar-chart-outline" size={32} color={mutedColor} />
                <ThemedText style={[styles.emptyText, { color: mutedColor }]}>No markets found</ThemedText>
              </View>
            ) : (
              filteredMarkets.map((market) => (
                <Pressable
                  key={market.marketId}
                  onPress={() => router.push({
                    pathname: '/market-detail',
                    params: {
                      id: market.marketId,
                      question: market.question,
                      category: market.category,
                      yesPrice: market.yesPrice.toString(),
                      noPrice: market.noPrice.toString(),
                      volume24h: market.volume24h.toString(),
                      endDate: market.endDate,
                      ticker: market.ticker,
                      resolutionSource: market.resolutionSource || '',
                      isLive: market.isLive ? 'true' : 'false',
                      outcomes: market.outcomes ? JSON.stringify(market.outcomes) : '',
                    },
                  })}
                  style={({ pressed }) => [styles.marketCard, { backgroundColor: cardBg }, pressed && styles.rowPressed]}
                >
                  <View style={styles.marketHeader}>
                    <View style={styles.marketQuestion}>
                      <ThemedText style={styles.marketText}>{market.question}</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={mutedColor} />
                  </View>

                  <View style={styles.marketMeta}>
                    <View style={[styles.categoryBadge, { backgroundColor: inputBg }]}>
                      <ThemedText style={[styles.categoryBadgeText, { color: mutedColor }]}>{market.category}</ThemedText>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="time" size={12} color={mutedColor} />
                      <ThemedText style={[styles.metaText, { color: mutedColor }]}>{getTimeRemaining(market.endDate)}</ThemedText>
                    </View>
                    <View style={styles.metaItem}>
                      <ThemedText style={[styles.metaText, { color: mutedColor }]}>{market.ticker}</ThemedText>
                    </View>
                  </View>

                  <View style={styles.marketPrices}>
                    <View style={[styles.priceBadge, { backgroundColor: `${primaryColor}20` }]}>
                      <ThemedText style={[styles.priceLabel, { color: primaryColor }]}>YES {(market.yesPrice * 100).toFixed(0)}¢</ThemedText>
                    </View>
                    <View style={[styles.priceBadge, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
                      <ThemedText style={[styles.priceLabel, { color: '#ef4444' }]}>NO {(market.noPrice * 100).toFixed(0)}¢</ThemedText>
                    </View>
                    <ThemedText style={[styles.volumeText, { color: mutedColor }]}>Vol: {formatVolume(market.volume24h)}</ThemedText>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {/* RWA List */}
        {category === 'rwa' && (
          <>
            {/* Type Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                {rwaTypeFilters.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setRwaCategoryFilter(type)}
                    style={[styles.filterPill, type === rwaCategoryFilter && { backgroundColor: `${primaryColor}20` }]}
                  >
                    <ThemedText style={[styles.filterText, { color: type === rwaCategoryFilter ? primaryColor : mutedColor }]}>
                      {type}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Header Row */}
            <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
              <ThemedText style={[styles.headerText, { color: mutedColor }]}>ASSET</ThemedText>
              <ThemedText style={[styles.headerText, styles.headerYield, { color: mutedColor }]}>YIELD</ThemedText>
              <ThemedText style={[styles.headerText, styles.headerMin, { color: mutedColor }]}>MIN</ThemedText>
            </View>

            {rwaLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>Loading RWA assets...</ThemedText>
              </View>
            ) : rwaError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#ef4444" />
                <ThemedText style={styles.errorText}>{rwaError}</ThemedText>
              </View>
            ) : filteredRWA.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="business-outline" size={32} color={mutedColor} />
                <ThemedText style={[styles.emptyText, { color: mutedColor }]}>No RWA assets found</ThemedText>
              </View>
            ) : (
              filteredRWA.map((asset) => (
                <Pressable
                  key={asset.mint}
                  onPress={() => router.push({
                    pathname: '/asset-detail',
                    params: {
                      id: asset.mint,
                      symbol: asset.symbol,
                      issuer: asset.issuer,
                      type: asset.type,
                      yield: asset.expectedYield?.toString() || '',
                      minInvestment: asset.minInvestment?.toString() || '',
                      description: asset.description || '',
                    },
                  })}
                  style={({ pressed }) => [styles.rwaRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.rwaInfo}>
                    <ThemedText style={styles.rwaName}>{asset.symbol}</ThemedText>
                    <ThemedText style={[styles.rwaIssuer, { color: mutedColor }]}>{asset.issuer}</ThemedText>
                    <View style={[styles.typeBadge, { backgroundColor: `${getTypeColor(asset.type)}20` }]}>
                      <ThemedText style={[styles.typeText, { color: getTypeColor(asset.type) }]}>
                        {getRwaTypeShort(asset.type)}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={[styles.rwaYield, { color: asset.expectedYield ? primaryColor : mutedColor }]}>
                    {asset.expectedYield ? `${asset.expectedYield}%` : '-'}
                  </ThemedText>
                  <ThemedText style={[styles.rwaMin, { color: mutedColor }]}>
                    {asset.minInvestment ? `$${(asset.minInvestment / 1000).toFixed(0)}K` : '-'}
                  </ThemedText>
                </Pressable>
              ))
            )}
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  categoryCount: {
    fontSize: 10,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 9,
    letterSpacing: 1,
    flex: 1,
  },
  headerPrice: {
    width: 90,
    textAlign: 'right',
    flex: 0,
  },
  headerChange: {
    width: 72,
    textAlign: 'right',
    flex: 0,
  },
  headerMcap: {
    width: 60,
    textAlign: 'right',
    flex: 0,
  },
  headerYield: {
    width: 50,
    textAlign: 'right',
    flex: 0,
  },
  headerMin: {
    width: 60,
    textAlign: 'right',
    flex: 0,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  tokenInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tokenIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tokenIconImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenName: {
    fontSize: 10,
    marginTop: 2,
  },
  tokenDetails: {
    flex: 1,
    minWidth: 0,
  },
  tokenPrice: {
    width: 90,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '500',
  },
  changeText: {
    width: 72,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '500',
  },
  mcapText: {
    width: 60,
    textAlign: 'right',
    fontSize: 12,
  },
  suggestionCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  suggestionText: {
    fontSize: 12,
    lineHeight: 18,
  },
  filterScroll: {
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  filterText: {
    fontSize: 10,
  },
  marketCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  marketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  marketQuestion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 8,
  },
  trendingIcon: {
    marginRight: 4,
    marginTop: 2,
  },
  marketText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    flex: 1,
  },
  marketMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 10,
  },
  marketPrices: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  volumeText: {
    fontSize: 10,
    marginLeft: 'auto',
  },
  rwaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  rwaInfo: {
    flex: 1,
  },
  rwaName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  rwaIssuer: {
    fontSize: 10,
    marginBottom: 4,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 8,
    fontWeight: '600',
  },
  rwaPrice: {
    width: 80,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '500',
  },
  rwaYield: {
    width: 50,
    textAlign: 'right',
    fontSize: 12,
  },
  rwaMin: {
    width: 60,
    textAlign: 'right',
    fontSize: 10,
  },
  bottomPadding: {
    height: 24,
  },
});

