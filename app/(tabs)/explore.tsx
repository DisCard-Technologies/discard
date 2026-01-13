import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, TextInput, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTrendingTokens } from '@/hooks/useTrendingTokens';
import { useOpenMarkets } from '@/hooks/useOpenMarkets';
import { positiveColor, negativeColor } from '@/constants/theme';

type CategoryFilter = 'tokens' | 'markets' | 'rwa';

const categoryFilters: { id: CategoryFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'tokens', label: 'Tokens', icon: 'diamond-outline' },
  { id: 'markets', label: 'Markets', icon: 'stats-chart-outline' },
  { id: 'rwa', label: 'RWA', icon: 'business-outline' },
];

// Format price with appropriate decimals
const formatPrice = (price: number): string => {
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('tokens');

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const inputBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');

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
  const isLoading = activeCategory === 'tokens' ? tokensLoading : activeCategory === 'markets' ? marketsLoading : false;
  const error = activeCategory === 'tokens' ? tokensError : activeCategory === 'markets' ? marketsError : null;

  const handleTokenPress = (token: typeof tokens[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/token-detail',
      params: {
        symbol: token.symbol,
        name: token.name,
        price: token.priceUsd.toString(),
        change: token.change24h.toString(),
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
        marketId: market.marketId,
        ticker: market.ticker,
        question: market.question,
        yesPrice: market.yesPrice.toString(),
        noPrice: market.noPrice.toString(),
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

      {/* Header with Search */}
      <View style={styles.header}>
        <View style={[styles.searchContainer, { backgroundColor: inputBg }]}>
          <Ionicons name="search" size={18} color={mutedColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Search tokens..."
            placeholderTextColor={mutedColor}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={mutedColor} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.sortButton, { backgroundColor: inputBg }]}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        >
          <Ionicons name="filter" size={18} color={mutedColor} />
        </Pressable>
      </View>

      {/* Category Filter Pills */}
      <View style={styles.categoryFilters}>
        {categoryFilters.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => handleCategorySelect(category.id)}
            style={[
              styles.categoryPill,
              { borderColor },
              activeCategory === category.id && { backgroundColor: primaryColor, borderColor: primaryColor },
            ]}
          >
            <Ionicons
              name={category.icon}
              size={14}
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
              Loading {activeCategory === 'tokens' ? 'tokens' : activeCategory === 'markets' ? 'markets' : 'assets'}...
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
            filteredTokens.map((token, index) => (
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
                  <ThemedText style={styles.tokenName}>{token.name}</ThemedText>
                  <View style={styles.tokenMeta}>
                    <ThemedText style={[styles.tokenPrice, { color: mutedColor }]}>
                      {formatPrice(token.priceUsd)}
                    </ThemedText>
                  </View>
                </View>

                {/* Price Change */}
                <View style={styles.tokenChange}>
                  <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
                  <ThemedText
                    style={[
                      styles.tokenChangePercent,
                      { color: token.change24h >= 0 ? positiveColor : negativeColor },
                    ]}
                  >
                    {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                  </ThemedText>
                </View>
              </Pressable>
            ))
          )
        ) : activeCategory === 'markets' ? (
          // Markets List
          filteredMarkets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="stats-chart-outline" size={48} color={mutedColor} />
              <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                No markets found
              </ThemedText>
            </View>
          ) : (
            filteredMarkets.map((market, index) => (
              <Pressable
                key={market.marketId + index}
                onPress={() => handleMarketPress(market)}
                style={({ pressed }) => [
                  styles.marketRow,
                  { borderBottomColor: borderColor },
                  pressed && styles.tokenRowPressed,
                ]}
              >
                {/* Market Icon */}
                <View style={[styles.marketIcon, { backgroundColor: `${primaryColor}20` }]}>
                  <Ionicons name="stats-chart" size={20} color={primaryColor} />
                </View>

                {/* Market Info */}
                <View style={styles.marketInfo}>
                  <ThemedText style={styles.marketQuestion} numberOfLines={2}>
                    {market.question}
                  </ThemedText>
                  <View style={styles.marketMeta}>
                    <ThemedText style={[styles.marketTicker, { color: mutedColor }]}>
                      {market.ticker}
                    </ThemedText>
                    <ThemedText style={[styles.marketCategory, { color: mutedColor }]}>
                      • {market.category}
                    </ThemedText>
                  </View>
                </View>

                {/* Market Prices */}
                <View style={styles.marketPrices}>
                  <View style={styles.marketPriceRow}>
                    <ThemedText style={[styles.marketPriceLabel, { color: positiveColor }]}>Yes</ThemedText>
                    <ThemedText style={[styles.marketPriceValue, { color: positiveColor }]}>
                      {(market.yesPrice * 100).toFixed(0)}¢
                    </ThemedText>
                  </View>
                  <View style={styles.marketPriceRow}>
                    <ThemedText style={[styles.marketPriceLabel, { color: negativeColor }]}>No</ThemedText>
                    <ThemedText style={[styles.marketPriceValue, { color: negativeColor }]}>
                      {(market.noPrice * 100).toFixed(0)}¢
                    </ThemedText>
                  </View>
                </View>
              </Pressable>
            ))
          )
        ) : (
          // RWA Coming Soon
          <View style={styles.comingSoonContainer}>
            <View style={[styles.comingSoonIcon, { backgroundColor: `${primaryColor}20` }]}>
              <Ionicons name="business-outline" size={48} color={primaryColor} />
            </View>
            <ThemedText style={styles.comingSoonTitle}>Real World Assets</ThemedText>
            <ThemedText style={[styles.comingSoonText, { color: mutedColor }]}>
              Tokenized treasuries, money market funds, and yield-bearing stablecoins coming soon.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  sortButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryFilters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  categoryPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tokenList: {
    flex: 1,
  },
  tokenListContent: {
    paddingHorizontal: 16,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  tokenRowPressed: {
    opacity: 0.7,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tokenIconImage: {
    width: '100%',
    height: '100%',
  },
  tokenIconFallback: {
    fontSize: 14,
    fontWeight: '600',
  },
  tokenInfo: {
    flex: 1,
  },
  tokenName: {
    fontSize: 15,
    fontWeight: '600',
  },
  tokenMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  tokenPrice: {
    fontSize: 13,
  },
  tokenChange: {
    alignItems: 'flex-end',
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: '600',
  },
  tokenChangePercent: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
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
  // Market rows
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  marketIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketInfo: {
    flex: 1,
  },
  marketQuestion: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  marketMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  marketTicker: {
    fontSize: 12,
    fontWeight: '600',
  },
  marketCategory: {
    fontSize: 12,
  },
  marketPrices: {
    alignItems: 'flex-end',
    gap: 2,
  },
  marketPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  marketPriceLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  marketPriceValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Coming soon
  comingSoonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  comingSoonIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  comingSoonText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
