import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MarketCard } from '@/components/market-card';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTrendingTokens } from '@/hooks/useTrendingTokens';
import { useOpenMarkets } from '@/hooks/useOpenMarkets';
import { positiveColor, negativeColor } from '@/constants/theme';

type CategoryFilter = 'tokens' | 'markets';

const categoryFilters: { id: CategoryFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'tokens', label: 'Tokens', icon: 'diamond' },
  { id: 'markets', label: 'Markets', icon: 'pulse' },
];

// Format price with appropriate decimals
const formatPrice = (price: number): string => {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
};

// Format market cap
const formatMarketCap = (marketCap?: number): string => {
  if (!marketCap) return '-';
  if (marketCap >= 1_000_000_000_000) return `$${(marketCap / 1_000_000_000_000).toFixed(0)}T`;
  if (marketCap >= 1_000_000_000) return `$${(marketCap / 1_000_000_000).toFixed(0)}B`;
  if (marketCap >= 1_000_000) return `$${(marketCap / 1_000_000).toFixed(0)}M`;
  if (marketCap >= 1_000) return `$${(marketCap / 1_000).toFixed(0)}K`;
  return `$${marketCap.toFixed(0)}`;
};

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [searchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('tokens');

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  // Fetch trending tokens
  const { tokens, isLoading: tokensLoading, error: tokensError } = useTrendingTokens();

  // Fetch prediction markets
  const { markets, isLoading: marketsLoading, error: marketsError } = useOpenMarkets();

  // Filter tokens by search
  const filteredTokens = useMemo(() => {
    if (activeCategory !== 'tokens') return [];
    return tokens.filter((token) => {
      const matchesSearch =
        token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [tokens, searchQuery, activeCategory]);

  // Filter markets by search
  const filteredMarkets = useMemo(() => {
    if (activeCategory !== 'markets') return [];
    return markets.filter((market) => {
      const matchesSearch =
        market.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        market.ticker.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [markets, searchQuery, activeCategory]);

  // Loading and error states based on active category
  const isLoading = activeCategory === 'tokens' ? tokensLoading : marketsLoading;
  const error = activeCategory === 'tokens' ? tokensError : marketsError;

  const handleTokenPress = (token: typeof tokens[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/token-detail',
      params: {
        symbol: token.symbol,
        name: token.name,
        price: token.priceUsd.toString(),
        change: token.change24h.toString(),
        marketCap: token.marketCap?.toString() || '',
        logoUri: token.logoUri || '',
        mint: token.mint || '',
      },
    });
  };

  const handleDeposit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/buy-crypto?currency=usdc&mode=deposit');
  };

  const handleCategorySelect = (category: CategoryFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveCategory(category);
  };

  const handleMarketPress = (market: typeof markets[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/market-detail',
      params: {
        id: market.marketId,
        marketId: market.marketId,
        ticker: market.ticker,
        question: market.question,
        category: market.category,
        yesPrice: market.yesPrice.toString(),
        noPrice: market.noPrice.toString(),
        volume24h: market.volume24h.toString(),
        endDate: market.endDate,
        resolutionSource: market.resolutionSource || '',
        isLive: market.isLive ? 'true' : 'false',
        // Pass outcomes if available
        outcomes: market.outcomes ? JSON.stringify(market.outcomes) : '',
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      {/* Deposit Button */}
      <Pressable
        onPress={handleDeposit}
        style={({ pressed }) => [
          styles.depositButton,
          { backgroundColor: primaryColor },
          pressed && styles.depositButtonPressed,
        ]}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <ThemedText style={styles.depositButtonText}>Deposit / Buy Crypto</ThemedText>
      </Pressable>

      {/* Category Filter Pills - Rounded Pill Container */}
      <View style={[styles.categoryContainer, { backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5' }]}>
        {categoryFilters.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => handleCategorySelect(category.id)}
            style={[
              styles.categoryPill,
              activeCategory === category.id && { backgroundColor: primaryColor },
            ]}
          >
            <Ionicons
              name={category.icon}
              size={16}
              color={activeCategory === category.id ? '#fff' : mutedColor}
            />
            <ThemedText
              style={[
                styles.categoryPillText,
                { color: activeCategory === category.id ? '#fff' : mutedColor },
              ]}
            >
              {category.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Content List */}
      <ScrollView
        style={styles.tokenList}
        contentContainerStyle={styles.tokenListContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
            <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
              Loading {activeCategory === 'tokens' ? 'tokens' : 'markets'}...
            </ThemedText>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={mutedColor} />
            <ThemedText style={[styles.errorText, { color: mutedColor }]}>
              Failed to load {activeCategory}
            </ThemedText>
          </View>
        ) : activeCategory === 'tokens' ? (
          // Tokens List
          filteredTokens.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={mutedColor} />
              <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                No tokens found
              </ThemedText>
            </View>
          ) : (
            <>
              {/* Table Header */}
              <View style={[styles.tableHeader, { borderBottomColor: borderColor }]}>
                <ThemedText style={[styles.tableHeaderText, { color: mutedColor }]}>ASSET</ThemedText>
                <ThemedText style={[styles.tableHeaderText, styles.headerPrice, { color: mutedColor }]}>PRICE</ThemedText>
                <ThemedText style={[styles.tableHeaderText, styles.headerChange, { color: mutedColor }]}>24H</ThemedText>
                <ThemedText style={[styles.tableHeaderText, styles.headerMcap, { color: mutedColor }]}>MCAP</ThemedText>
              </View>
              {filteredTokens.map((token, index) => (
                <Pressable
                  key={token.symbol + index}
                  onPress={() => handleTokenPress(token)}
                  style={({ pressed }) => [
                    styles.tokenRow,
                    { borderBottomColor: borderColor },
                    pressed && styles.tokenRowPressed,
                  ]}
                >
                  {/* Token Icon */}
                  <View style={[styles.tokenIcon, { backgroundColor: cardBg }]}>
                    {token.logoUri ? (
                      <Image source={{ uri: token.logoUri }} style={styles.tokenIconImage} />
                    ) : (
                      <ThemedText style={styles.tokenIconFallback}>
                        {token.symbol.slice(0, 2)}
                      </ThemedText>
                    )}
                  </View>

                  {/* Token Info */}
                  <View style={styles.tokenInfo}>
                    <View style={styles.tokenNameRow}>
                      <ThemedText style={styles.tokenSymbolMain}>{token.symbol}</ThemedText>
                      {token.verified && <Ionicons name="flash" size={10} color="#f59e0b" />}
                    </View>
                  </View>

                  {/* Price */}
                  <ThemedText style={styles.tokenPrice}>
                    {formatPrice(token.priceUsd)}
                  </ThemedText>

                  {/* 24H Change */}
                  <ThemedText
                    style={[
                      styles.tokenChangePercent,
                      { color: token.change24h >= 0 ? positiveColor : negativeColor },
                    ]}
                  >
                    {token.change24h >= 0 ? '↑' : '↓'}{Math.abs(token.change24h).toFixed(2)}%
                  </ThemedText>

                  {/* Market Cap */}
                  <ThemedText style={[styles.tokenMcap, { color: mutedColor }]}>
                    {formatMarketCap(token.marketCap)}
                  </ThemedText>
                </Pressable>
              ))}
            </>
          )
        ) : (
          // Markets List with Card Layout
          filteredMarkets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="pulse-outline" size={48} color={mutedColor} />
              <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                No markets found
              </ThemedText>
            </View>
          ) : (
            <>
              {/* Trending Section Header */}
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>Trending</ThemedText>
                <Ionicons name="chevron-forward" size={18} color={mutedColor} />
              </View>

              {/* Market Cards */}
              {filteredMarkets.map((market, index) => (
                <MarketCard
                  key={market.marketId + index}
                  market={market}
                  onPress={() => handleMarketPress(market)}
                />
              ))}
            </>
          )
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Rounded pill container for tab selector
  categoryContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    borderRadius: 24,
    gap: 4,
  },
  categoryPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  categoryPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tokenList: {
    flex: 1,
  },
  tokenListContent: {
    paddingHorizontal: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    flex: 1,
  },
  headerPrice: {
    width: 85,
    textAlign: 'right',
    flex: 0,
  },
  headerChange: {
    width: 70,
    textAlign: 'right',
    flex: 0,
  },
  headerMcap: {
    width: 55,
    textAlign: 'right',
    flex: 0,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  tokenRowPressed: {
    opacity: 0.7,
  },
  tokenIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tokenIconImage: {
    width: '100%',
    height: '100%',
  },
  tokenIconFallback: {
    fontSize: 12,
    fontWeight: '600',
  },
  tokenInfo: {
    flex: 1,
    minWidth: 0,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tokenSymbolMain: {
    fontSize: 14,
    fontWeight: '600',
  },
  tokenName: {
    fontSize: 11,
    marginTop: 2,
  },
  tokenPrice: {
    width: 85,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '500',
  },
  tokenChangePercent: {
    width: 70,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '500',
  },
  tokenMcap: {
    width: 55,
    textAlign: 'right',
    fontSize: 11,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  // Markets section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  depositButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  depositButtonPressed: {
    opacity: 0.8,
  },
  depositButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
