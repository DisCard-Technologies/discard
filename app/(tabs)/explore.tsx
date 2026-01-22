import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, TextInput, Modal } from 'react-native';
import { Image } from 'expo-image';
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

type TabFilter = 'tokens' | 'markets';
type TokenSortOption = 'default' | 'price_asc' | 'price_desc' | 'change_asc' | 'change_desc' | 'mcap_asc' | 'mcap_desc';
type MarketSortOption = 'default' | 'volume_asc' | 'volume_desc' | 'yes_asc' | 'yes_desc';
type TokenCategoryFilter = 'all' | 'stables' | 'stocks' | 'reward' | 'memes';

const tokenSortOptions: { id: TokenSortOption; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'change_desc', label: '24H Change: High to Low' },
  { id: 'change_asc', label: '24H Change: Low to High' },
  { id: 'mcap_desc', label: 'Market Cap: High to Low' },
  { id: 'mcap_asc', label: 'Market Cap: Low to High' },
];

const marketSortOptions: { id: MarketSortOption; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'volume_desc', label: 'Volume: High to Low' },
  { id: 'volume_asc', label: 'Volume: Low to High' },
  { id: 'yes_desc', label: 'Yes Price: High to Low' },
  { id: 'yes_asc', label: 'Yes Price: Low to High' },
];

const tabFilters: { id: TabFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'tokens', label: 'Tokens', icon: 'diamond' },
  { id: 'markets', label: 'Markets', icon: 'pulse' },
];

const tokenCategoryOptions: { id: TokenCategoryFilter; label: string }[] = [
  { id: 'all', label: 'Trending' },
  { id: 'stables', label: 'Stables' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'reward', label: 'Reward-Bearing' },
  { id: 'memes', label: 'Memes' },
];

// Token symbols for each category (case-insensitive matching)
const STABLE_TOKENS = ['USDC', 'USDT', 'PYUSD', 'DAI', 'USDH', 'UXD', 'USDY', 'USDP', 'TUSD', 'FRAX', 'EURC'];
const STOCK_TOKENS = ['AAPL', 'TSLA', 'GOOGL', 'AMZN', 'MSFT', 'NVDA', 'META', 'NFLX', 'AMD', 'COIN', 'MSTR', 'GME', 'AMC'];
const REWARD_TOKENS = ['JLP', 'MSOL', 'BSOL', 'JSOL', 'JITOSOL', 'VSOL', 'LST', 'HSOL', 'COMPASSSOL', 'INF', 'PSOL'];
const MEME_TOKENS = ['BONK', 'WIF', 'POPCAT', 'MEW', 'SAMO', 'MYRO', 'SLERF', 'BOME', 'TREMP', 'TRUMP', 'PNUT', 'GOAT', 'FWOG', 'MOODENG', 'GIGACHAD', 'PENGU', 'AI16Z', 'GRIFFAIN', 'ZEREBRO'];

// Preferred market category order
const MARKET_CATEGORY_ORDER = ['Sports', 'Politics', 'Economics', 'Finance', 'Crypto', 'Tech', 'Entertainment', 'Science', 'Culture'];


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

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('tokens');
  const [tokenSort, setTokenSort] = useState<TokenSortOption>('default');
  const [marketSort, setMarketSort] = useState<MarketSortOption>('default');
  const [tokenCategoryFilter, setTokenCategoryFilter] = useState<TokenCategoryFilter>('all');
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<string>('All');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const inputBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const textColor = useThemeColor({}, 'text');

  // Fetch trending tokens
  const { tokens, isLoading: tokensLoading, error: tokensError } = useTrendingTokens();

  // Fetch prediction markets
  const { markets, isLoading: marketsLoading, error: marketsError, categories: marketCategories } = useOpenMarkets();

  // Build market category filter options with preferred order
  const marketCategoryOptions = useMemo(() => {
    const orderedCategories = MARKET_CATEGORY_ORDER.filter(cat => marketCategories.includes(cat));
    const remainingCategories = marketCategories.filter(cat => !MARKET_CATEGORY_ORDER.includes(cat));
    return ['All', ...orderedCategories, ...remainingCategories];
  }, [marketCategories]);

  // Filter and sort tokens
  const filteredTokens = useMemo(() => {
    if (activeTab !== 'tokens') return [];
    let result = tokens.filter((token) => {
      const matchesSearch =
        token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name.toLowerCase().includes(searchQuery.toLowerCase());

      // Apply category filter
      if (tokenCategoryFilter !== 'all') {
        const symbolUpper = token.symbol.toUpperCase();
        switch (tokenCategoryFilter) {
          case 'stables':
            if (!STABLE_TOKENS.includes(symbolUpper)) return false;
            break;
          case 'stocks':
            if (!STOCK_TOKENS.includes(symbolUpper)) return false;
            break;
          case 'reward':
            if (!REWARD_TOKENS.includes(symbolUpper)) return false;
            break;
          case 'memes':
            if (!MEME_TOKENS.includes(symbolUpper)) return false;
            break;
        }
      }

      return matchesSearch;
    });

    // Apply sorting
    if (tokenSort !== 'default') {
      result = [...result].sort((a, b) => {
        switch (tokenSort) {
          case 'price_asc': return a.priceUsd - b.priceUsd;
          case 'price_desc': return b.priceUsd - a.priceUsd;
          case 'change_asc': return a.change24h - b.change24h;
          case 'change_desc': return b.change24h - a.change24h;
          case 'mcap_asc': return (a.marketCap || 0) - (b.marketCap || 0);
          case 'mcap_desc': return (b.marketCap || 0) - (a.marketCap || 0);
          default: return 0;
        }
      });
    }
    return result;
  }, [tokens, searchQuery, activeTab, tokenSort]);

  // Filter and sort markets
  const filteredMarkets = useMemo(() => {
    if (activeTab !== 'markets') return [];
    let result = markets.filter((market) => {
      const matchesSearch =
        market.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        market.ticker.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = marketCategoryFilter === 'All' || market.category === marketCategoryFilter;
      return matchesSearch && matchesCategory;
    });

    // Apply sorting
    if (marketSort !== 'default') {
      result = [...result].sort((a, b) => {
        switch (marketSort) {
          case 'volume_asc': return a.volume24h - b.volume24h;
          case 'volume_desc': return b.volume24h - a.volume24h;
          case 'yes_asc': return a.yesPrice - b.yesPrice;
          case 'yes_desc': return b.yesPrice - a.yesPrice;
          default: return 0;
        }
      });
    }
    return result;
  }, [markets, searchQuery, activeTab, marketCategoryFilter, marketSort]);

  // Loading and error states based on active tab
  const isLoading = activeTab === 'tokens' ? tokensLoading : marketsLoading;
  const error = activeTab === 'tokens' ? tokensError : marketsError;

  // Get current sort label for button display
  const currentSortLabel = useMemo(() => {
    if (activeTab === 'tokens') {
      return tokenSortOptions.find(o => o.id === tokenSort)?.label || 'Sort';
    }
    return marketSortOptions.find(o => o.id === marketSort)?.label || 'Sort';
  }, [activeTab, tokenSort, marketSort]);

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

  const handleTabSelect = (tab: TabFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleSortSelect = (sortId: TokenSortOption | MarketSortOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeTab === 'tokens') {
      setTokenSort(sortId as TokenSortOption);
    } else {
      setMarketSort(sortId as MarketSortOption);
    }
    setShowSortMenu(false);
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

      {/* Search Bar with Sort Button */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor }]}>
          <Ionicons name="search" size={16} color={mutedColor} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={activeTab === 'tokens' ? 'Search tokens...' : 'Search markets...'}
            placeholderTextColor={mutedColor}
            style={[styles.searchInput, { color: textColor }]}
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
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSortMenu(true);
          }}
          style={[styles.sortButton, { backgroundColor: inputBg, borderColor }]}
        >
          <Ionicons name="swap-vertical" size={18} color={tokenSort !== 'default' || marketSort !== 'default' ? primaryColor : mutedColor} />
        </Pressable>
      </View>

      {/* Tab Filter Pills - Rounded Pill Container */}
      <View style={[styles.tabContainer, { backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5' }]}>
        {tabFilters.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => handleTabSelect(tab.id)}
            style={[
              styles.tabPill,
              activeTab === tab.id && { backgroundColor: primaryColor },
            ]}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.id ? '#fff' : mutedColor}
            />
            <ThemedText
              style={[
                styles.tabPillText,
                { color: activeTab === tab.id ? '#fff' : mutedColor },
              ]}
            >
              {tab.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Category Filters */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
        {activeTab === 'tokens' ? (
          tokenCategoryOptions.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTokenCategoryFilter(cat.id);
              }}
              style={[
                styles.filterPill,
                { backgroundColor: tokenCategoryFilter === cat.id ? `${primaryColor}20` : cardBg },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterPillText,
                  { color: tokenCategoryFilter === cat.id ? primaryColor : mutedColor },
                ]}
              >
                {cat.label}
              </ThemedText>
            </Pressable>
          ))
        ) : (
          marketCategoryOptions.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMarketCategoryFilter(cat);
              }}
              style={[
                styles.filterPill,
                { backgroundColor: marketCategoryFilter === cat ? `${primaryColor}20` : cardBg },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterPillText,
                  { color: marketCategoryFilter === cat ? primaryColor : mutedColor },
                ]}
              >
                {cat}
              </ThemedText>
            </Pressable>
          ))
        )}
        </ScrollView>
      </View>

      {/* Sort Menu Modal */}
      <Modal
        visible={showSortMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortMenu(false)}>
          <View style={[styles.sortMenu, { backgroundColor: isDark ? '#2c2c2e' : '#fff' }]}>
            <View style={styles.sortMenuHeader}>
              <ThemedText style={styles.sortMenuTitle}>Sort By</ThemedText>
              <Pressable onPress={() => setShowSortMenu(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </Pressable>
            </View>
            {(activeTab === 'tokens' ? tokenSortOptions : marketSortOptions).map((option) => {
              const isSelected = activeTab === 'tokens' ? tokenSort === option.id : marketSort === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => handleSortSelect(option.id)}
                  style={[styles.sortMenuItem, isSelected && { backgroundColor: `${primaryColor}15` }]}
                >
                  <ThemedText style={[styles.sortMenuItemText, isSelected && { color: primaryColor }]}>
                    {option.label}
                  </ThemedText>
                  {isSelected && <Ionicons name="checkmark" size={20} color={primaryColor} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

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
              Loading {activeTab === 'tokens' ? 'tokens' : 'markets'}...
            </ThemedText>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={mutedColor} />
            <ThemedText style={[styles.errorText, { color: mutedColor }]}>
              Failed to load {activeCategory}
            </ThemedText>
          </View>
        ) : activeTab === 'tokens' ? (
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
                      <Image
                        source={token.logoUri}
                        style={styles.tokenIconImage}
                        contentFit="cover"
                        transition={150}
                      />
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
  // Search row with search bar and sort button
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  sortButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Rounded pill container for tab selector
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    borderRadius: 24,
    gap: 4,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  tabPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Filter container and scroll for categories
  filterContainer: {
    marginBottom: 8,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Sort menu modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sortMenu: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  sortMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  sortMenuTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sortMenuItemText: {
    fontSize: 16,
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
});
