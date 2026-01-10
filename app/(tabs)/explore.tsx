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
import { positiveColor, negativeColor } from '@/constants/theme';

type ChainFilter = 'all' | 'solana' | 'ethereum' | 'polygon' | 'binance';

const chainFilters: { id: ChainFilter; label: string; icon?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'solana', label: 'Solana' },
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'binance', label: 'BNB' },
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
  const [activeChain, setActiveChain] = useState<ChainFilter>('all');

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const inputBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');

  // Fetch trending tokens
  const { tokens, isLoading, error } = useTrendingTokens();

  // Filter tokens by search and chain
  const filteredTokens = useMemo(() => {
    return tokens.filter((token) => {
      const matchesSearch =
        token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name.toLowerCase().includes(searchQuery.toLowerCase());
      // For now, show all tokens regardless of chain since our data is Solana-based
      const matchesChain = activeChain === 'all' || activeChain === 'solana';
      return matchesSearch && matchesChain;
    });
  }, [tokens, searchQuery, activeChain]);

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

  const handleChainSelect = (chain: ChainFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveChain(chain);
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

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

      {/* Chain Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chainFilters}
      >
        {chainFilters.map((chain) => (
          <Pressable
            key={chain.id}
            onPress={() => handleChainSelect(chain.id)}
            style={[
              styles.chainPill,
              { borderColor },
              activeChain === chain.id && { backgroundColor: primaryColor, borderColor: primaryColor },
            ]}
          >
            <ThemedText
              style={[
                styles.chainPillText,
                { color: activeChain === chain.id ? '#fff' : mutedColor },
              ]}
            >
              {chain.label}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      {/* Token List */}
      <ScrollView
        style={styles.tokenList}
        contentContainerStyle={styles.tokenListContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
            <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
              Loading tokens...
            </ThemedText>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={mutedColor} />
            <ThemedText style={[styles.errorText, { color: mutedColor }]}>
              Failed to load tokens
            </ThemedText>
          </View>
        ) : filteredTokens.length === 0 ? (
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
        )}
      </ScrollView>

      {/* Deposit Button */}
      <View style={[styles.depositButtonContainer, { paddingBottom: insets.bottom + 80 }]}>
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
      </View>
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
  chainFilters: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  chainPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chainPillText: {
    fontSize: 13,
    fontWeight: '500',
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
  depositButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  depositButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
