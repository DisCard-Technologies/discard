import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native';
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
import { useRwaTokens, formatTvl, formatApy } from '@/hooks/useRwaTokens';
import { positiveColor, negativeColor } from '@/constants/theme';

type CategoryFilter = 'tokens' | 'markets' | 'rwa';

const categoryFilters: { id: CategoryFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'tokens', label: 'Tokens', icon: 'diamond-outline' },
  { id: 'markets', label: 'Markets', icon: 'stats-chart-outline' },
  { id: 'rwa', label: 'RWA', icon: 'business-outline' },
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

  // Fetch RWA tokens
  const { tokens: rwaTokens, isLoading: rwaLoading, error: rwaError, totalTvl } = useRwaTokens();

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

  // Filter RWA tokens by search
  const filteredRwaTokens = useMemo(() => {
    if (activeCategory !== 'rwa') return [];
    return rwaTokens.filter((token) => {
      const matchesSearch =
        token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.issuer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [rwaTokens, searchQuery, activeCategory]);

  // Loading and error states based on active category
  const isLoading = activeCategory === 'tokens' ? tokensLoading : activeCategory === 'markets' ? marketsLoading : activeCategory === 'rwa' ? rwaLoading : false;
  const error = activeCategory === 'tokens' ? tokensError : activeCategory === 'markets' ? marketsError : activeCategory === 'rwa' ? rwaError : null;

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
          // RWA Tokens List
          filteredRwaTokens.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={48} color={mutedColor} />
              <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                No RWA tokens found
              </ThemedText>
            </View>
          ) : (
            <>
              {/* Total TVL Banner */}
              <View style={[styles.rwaTvlBanner, { backgroundColor: `${primaryColor}15`, borderColor: `${primaryColor}30` }]}>
                <View style={styles.rwaTvlContent}>
                  <ThemedText style={[styles.rwaTvlLabel, { color: mutedColor }]}>Total TVL</ThemedText>
                  <ThemedText style={[styles.rwaTvlValue, { color: primaryColor }]}>{formatTvl(totalTvl)}</ThemedText>
                </View>
                <View style={[styles.rwaTvlBadge, { backgroundColor: `${positiveColor}20` }]}>
                  <Ionicons name="shield-checkmark" size={14} color={positiveColor} />
                  <ThemedText style={[styles.rwaTvlBadgeText, { color: positiveColor }]}>Verified Assets</ThemedText>
                </View>
              </View>

              {/* Table Header */}
              <View style={[styles.tableHeader, { borderBottomColor: borderColor }]}>
                <ThemedText style={[styles.tableHeaderText, { color: mutedColor }]}>ASSET</ThemedText>
                <ThemedText style={[styles.tableHeaderText, styles.headerApy, { color: mutedColor }]}>APY</ThemedText>
                <ThemedText style={[styles.tableHeaderText, styles.headerTvl, { color: mutedColor }]}>TVL</ThemedText>
              </View>

              {/* RWA Token List */}
              {filteredRwaTokens.map((token, index) => (
                <Pressable
                  key={token.mint + index}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/token-detail',
                      params: {
                        symbol: token.symbol,
                        name: token.name,
                        price: token.priceUsd.toString(),
                        change: token.change24h.toString(),
                        marketCap: token.tvl.toString(),
                        logoUri: token.logoUri || '',
                        mint: token.mint,
                      },
                    });
                  }}
                  style={({ pressed }) => [
                    styles.rwaTokenRow,
                    { borderBottomColor: borderColor },
                    pressed && styles.tokenRowPressed,
                  ]}
                >
                  {/* Token Icon */}
                  <View style={[styles.rwaTokenIcon, { backgroundColor: cardBg }]}>
                    <ThemedText style={styles.rwaTokenIconText}>
                      {token.symbol.slice(0, 2)}
                    </ThemedText>
                  </View>

                  {/* Token Info */}
                  <View style={styles.rwaTokenInfo}>
                    <View style={styles.rwaTokenNameRow}>
                      <ThemedText style={styles.rwaTokenSymbol}>{token.symbol}</ThemedText>
                      {token.verified && <Ionicons name="checkmark-circle" size={12} color={positiveColor} />}
                    </View>
                    <ThemedText style={[styles.rwaTokenIssuer, { color: mutedColor }]} numberOfLines={1}>
                      {token.issuer}
                    </ThemedText>
                  </View>

                  {/* APY */}
                  <View style={styles.rwaApyContainer}>
                    <ThemedText style={[styles.rwaApyValue, { color: positiveColor }]}>
                      {formatApy(token.apy)}
                    </ThemedText>
                    <ThemedText style={[styles.rwaApyLabel, { color: mutedColor }]}>APY</ThemedText>
                  </View>

                  {/* TVL */}
                  <ThemedText style={[styles.rwaTvl, { color: mutedColor }]}>
                    {formatTvl(token.tvl)}
                  </ThemedText>
                </Pressable>
              ))}

              {/* Info Footer */}
              <View style={[styles.rwaInfoFooter, { borderColor }]}>
                <Ionicons name="information-circle-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.rwaInfoText, { color: mutedColor }]}>
                  Tokenized Real World Assets backed by US Treasuries, money market funds, and real estate
                </ThemedText>
              </View>
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
  // RWA Shop styles
  rwaContainer: {
    paddingTop: 8,
  },
  privacyBanner: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 20,
  },
  privacyBannerContent: {
    flex: 1,
  },
  privacyBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  privacyBannerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  rwaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    gap: 14,
  },
  rwaIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rwaCardContent: {
    flex: 1,
  },
  rwaCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  rwaCardSubtitle: {
    fontSize: 13,
  },
  // RWA Token list styles
  rwaTvlBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  rwaTvlContent: {
    gap: 2,
  },
  rwaTvlLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  rwaTvlValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  rwaTvlBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  rwaTvlBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerApy: {
    width: 60,
    textAlign: 'right',
    flex: 0,
  },
  headerTvl: {
    width: 70,
    textAlign: 'right',
    flex: 0,
  },
  rwaTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rwaTokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rwaTokenIconText: {
    fontSize: 14,
    fontWeight: '700',
  },
  rwaTokenInfo: {
    flex: 1,
    minWidth: 0,
  },
  rwaTokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rwaTokenSymbol: {
    fontSize: 15,
    fontWeight: '600',
  },
  rwaTokenIssuer: {
    fontSize: 12,
    marginTop: 2,
  },
  rwaApyContainer: {
    alignItems: 'flex-end',
    width: 60,
  },
  rwaApyValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  rwaApyLabel: {
    fontSize: 10,
  },
  rwaTvl: {
    width: 70,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '500',
  },
  rwaInfoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  rwaInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});
