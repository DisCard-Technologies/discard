import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Image, Keyboard, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ExploreView } from '@/components/explore-view';
import { CommandBar } from '@/components/command-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth, useCurrentUserId } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { useRwaHoldings } from '@/hooks/useRwaHoldings';
import { usePredictionMarkets } from '@/hooks/usePredictionMarkets';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ModeType = 'holdings' | 'explore';
type TabType = 'tokens' | 'assets' | 'predictions';

interface Token {
  symbol: string;
  name: string;
  balance: string;
  value: number;
  change: number;
  icon: string;
  price: number;
  isAmbientManaged?: boolean;
}

interface Asset {
  name: string;
  type: 'nft' | 'rwa' | 'depin';
  value: number;
  change: number;
  image: string;
}

interface Prediction {
  question: string;
  position: 'yes' | 'no';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  expiresIn: string;
  market: string;
}

// Mock data removed - now using real data from hooks

const assetTypeFilters = ['All', 'NFTs', 'RWA', 'DePIN'];

export default function HoldingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  // Real data from hooks
  const { user } = useAuth();
  const userId = useCurrentUserId();
  const walletAddress = user?.solanaAddress || null;

  const {
    holdings: tokenHoldings,
    totalValue: tokenTotal,
    isLoading: tokensLoadingRaw
  } = useTokenHoldings(walletAddress);

  const {
    rwaTokens,
    isLoading: rwaLoadingRaw
  } = useRwaHoldings(walletAddress);

  const {
    positions: predictionPositions,
    isLoading: predictionsLoadingRaw
  } = usePredictionMarkets(userId, walletAddress);

  // Only show loading if we have a wallet address - otherwise show empty state
  const tokensLoading = walletAddress ? tokensLoadingRaw : false;
  const rwaLoading = walletAddress ? rwaLoadingRaw : false;
  const predictionsLoading = (userId && walletAddress) ? predictionsLoadingRaw : false;

  // Transform real data to match UI expected format
  const tokens = useMemo((): Token[] => {
    if (!tokenHoldings || tokenHoldings.length === 0) {
      return [];
    }
    return tokenHoldings.map(h => ({
      symbol: h.symbol,
      name: h.name,
      balance: h.balanceFormatted.toLocaleString(),
      value: h.valueUsd,
      change: h.change24h || 0,
      icon: h.symbol.charAt(0),
      price: h.priceUsd,
      isAmbientManaged: false,
    }));
  }, [tokenHoldings]);

  const assets = useMemo((): Asset[] => {
    if (!rwaTokens || rwaTokens.length === 0) {
      return [];
    }
    return rwaTokens.map(h => ({
      name: h.name,
      type: 'rwa' as const,
      value: h.valueUsd,
      change: h.change24h || 0,
      image: h.logoUri || '',
    }));
  }, [rwaTokens]);

  const predictions = useMemo((): Prediction[] => {
    if (!predictionPositions || predictionPositions.length === 0) {
      return [];
    }
    return predictionPositions.map(p => {
      const endDate = p.market.endDate;
      const expiresIn = endDate
        ? `${Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d`
        : 'N/A';
      return {
        question: p.market.question,
        position: p.side,
        shares: p.shares,
        avgPrice: p.avgPrice,
        currentPrice: p.currentPrice,
        expiresIn,
        market: p.market.category || 'Kalshi',
      };
    });
  }, [predictionPositions]);

  const isLoading = tokensLoading || rwaLoading || predictionsLoading;

  const [mode, setMode] = useState<ModeType>('holdings');
  const [activeTab, setActiveTab] = useState<TabType>('tokens');
  const [selectedAssetFilter, setSelectedAssetFilter] = useState('All');

  // Command bar state
  const backdropOpacity = useSharedValue(0);

  const handleCommandBarFocusChange = (focused: boolean) => {
    backdropOpacity.value = withTiming(focused ? 1 : 0, { duration: 200 });
  };

  const handleBackdropPress = () => {
    Keyboard.dismiss();
    backdropOpacity.value = withTiming(0, { duration: 200 });
  };

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? 'auto' : 'none',
  }));

  const handleSendMessage = (message: string) => {
    Alert.alert('Command', `You said: "${message}"`);
  };

  const handleCamera = () => {
    Alert.alert('Camera', 'Camera/scan coming soon');
  };

  const handleMic = () => {
    // Voice input feedback handled by CommandBar
  };

  const handleBuyToken = (token: Token) => {
    Alert.alert('Buy Token', `Buy more ${token.symbol} (${token.name})\nCurrent price: $${token.price.toLocaleString()}`);
  };

  const handleSellToken = (token: Token) => {
    Alert.alert('Sell Token', `Sell ${token.symbol} (${token.name})\nBalance: ${token.balance}\nCurrent price: $${token.price.toLocaleString()}`);
  };

  const totalTokens = tokens.reduce((acc: number, t: Token) => acc + t.value, 0);
  const totalAssets = assets.reduce((acc: number, a: Asset) => acc + a.value, 0);
  const totalPredictions = predictions.reduce((acc: number, p: Prediction) => acc + p.shares * p.currentPrice, 0);
  const totalValue = totalTokens + totalAssets + totalPredictions;

  const getTypeColor = (type: Asset['type']) => {
    switch (type) {
      case 'nft': return '#a855f7';
      case 'rwa': return '#10b981';
      case 'depin': return '#f59e0b';
      default: return mutedColor;
    }
  };

  const filteredAssets = selectedAssetFilter === 'All'
    ? assets
    : assets.filter(a => {
        if (selectedAssetFilter === 'NFTs') return a.type === 'nft';
        if (selectedAssetFilter === 'RWA') return a.type === 'rwa';
        if (selectedAssetFilter === 'DePIN') return a.type === 'depin';
        return true;
      });

  const tabs = [
    { id: 'tokens' as TabType, label: 'Tokens', icon: 'layers' as const, value: totalTokens },
    { id: 'assets' as TabType, label: 'Assets', icon: 'locate' as const, value: totalAssets },
    { id: 'predictions' as TabType, label: 'Markets', icon: 'bar-chart' as const, value: totalPredictions },
  ];

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>{mode === 'holdings' ? 'Holdings' : 'Explore'}</ThemedText>
            <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
              {mode === 'holdings' ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} total value` : 'Discover new opportunities'}
            </ThemedText>
          </View>
          {mode === 'holdings' && (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push('/sell-crypto?currency=eth')}
                style={[styles.withdrawButton, { backgroundColor: cardBg }]}
              >
                <Ionicons name="arrow-down" size={14} color="#ef4444" />
              </Pressable>
              <Pressable
                onPress={() => router.push('/buy-crypto?currency=eth')}
                style={[styles.depositButton, { backgroundColor: '#22c55e' }]}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <ThemedText style={[styles.depositButtonText, { color: '#fff' }]}>Deposit</ThemedText>
              </Pressable>
            </View>
          )}
        </View>

        {/* Mode Toggle */}
        <View style={[styles.modeToggle, { backgroundColor: `${borderColor}` }]}>
          <Pressable
            onPress={() => setMode('holdings')}
            style={[
              styles.modeButton,
              mode === 'holdings' && { backgroundColor: cardBg },
            ]}
          >
            <Ionicons name="layers" size={16} color={mode === 'holdings' ? textColor : mutedColor} />
            <ThemedText style={[styles.modeButtonText, { color: mode === 'holdings' ? textColor : mutedColor }]}>
              My Holdings
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setMode('explore')}
            style={[
              styles.modeButton,
              mode === 'explore' && { backgroundColor: cardBg },
            ]}
          >
            <Ionicons name="compass" size={16} color={mode === 'explore' ? textColor : mutedColor} />
            <ThemedText style={[styles.modeButtonText, { color: mode === 'explore' ? textColor : mutedColor }]}>
              Explore
            </ThemedText>
          </Pressable>
        </View>

        {mode === 'explore' ? (
          <ExploreView />
        ) : (
          <>
            {/* Tab Selector */}
            <View style={styles.tabSelector}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id)}
                    style={[
                      styles.tabButton,
                      { backgroundColor: isActive ? `${primaryColor}10` : `${borderColor}` },
                      isActive && { borderColor: `${primaryColor}30`, borderWidth: 1 },
                    ]}
                  >
                    <View style={styles.tabButtonInner}>
                      <Ionicons name={tab.icon} size={14} color={isActive ? primaryColor : mutedColor} />
                      <ThemedText style={[styles.tabLabel, { color: isActive ? textColor : mutedColor }]}>
                        {tab.label}
                      </ThemedText>
                    </View>
                    <ThemedText style={[styles.tabValue, { color: isActive ? primaryColor : mutedColor }]}>
                      ${tab.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {/* Content */}
            <View style={styles.content}>
              {/* Tokens Tab */}
              {activeTab === 'tokens' && (
                <>
                  {tokensLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator size="large" color={primaryColor} />
                      <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                        Loading tokens...
                      </ThemedText>
                    </View>
                  ) : tokens.length === 0 ? (
                    <View style={styles.emptyState}>
                      <View style={[styles.emptyStateIcon, { backgroundColor: `${primaryColor}10` }]}>
                        <Ionicons name="layers-outline" size={32} color={primaryColor} />
                      </View>
                      <ThemedText style={styles.emptyStateTitle}>No tokens yet</ThemedText>
                      <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                        {walletAddress ? 'Your token holdings will appear here' : 'Connect your wallet to see holdings'}
                      </ThemedText>
                    </View>
                  ) : (
                    tokens.map((token) => (
                      <ThemedView
                        key={token.symbol}
                        style={styles.tokenCard}
                        lightColor="#f4f4f5"
                        darkColor="#1c1c1e"
                      >
                        <View style={styles.tokenLeft}>
                          <View style={[styles.tokenIcon, { backgroundColor: `${borderColor}` }]}>
                            <ThemedText style={styles.tokenIconText}>{token.icon}</ThemedText>
                          </View>
                          <View>
                            <View style={styles.tokenNameRow}>
                              <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
                              {token.isAmbientManaged && (
                                <View style={[styles.autoBadge, { backgroundColor: `${primaryColor}15` }]}>
                                  <Ionicons name="flash" size={10} color={primaryColor} />
                                  <ThemedText style={[styles.autoBadgeText, { color: primaryColor }]}>AUTO</ThemedText>
                                </View>
                              )}
                            </View>
                            <ThemedText style={[styles.tokenBalance, { color: mutedColor }]}>
                              {token.balance} {token.symbol}
                            </ThemedText>
                          </View>
                        </View>

                        <View style={styles.tokenRight}>
                          <View style={styles.actionButtons}>
                            <Pressable
                              onPress={() => handleBuyToken(token)}
                              style={[styles.actionButton, { backgroundColor: `${primaryColor}15` }]}
                            >
                              <Ionicons name="add" size={16} color={primaryColor} />
                            </Pressable>
                            <Pressable
                              onPress={() => handleSellToken(token)}
                              style={[styles.actionButton, { backgroundColor: 'rgba(239,68,68,0.15)' }]}
                            >
                              <Ionicons name="remove" size={16} color="#ef4444" />
                            </Pressable>
                          </View>

                          <View style={styles.tokenValue}>
                            <ThemedText style={styles.tokenValueText}>${token.value.toLocaleString()}</ThemedText>
                            <View style={[styles.changeRow, { justifyContent: 'flex-end' }]}>
                              <Ionicons
                                name={token.change >= 0 ? 'trending-up' : 'trending-down'}
                                size={12}
                                color={token.change >= 0 ? primaryColor : '#ef4444'}
                              />
                              <ThemedText style={[styles.changeText, { color: token.change >= 0 ? primaryColor : '#ef4444' }]}>
                                {Math.abs(token.change)}%
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      </ThemedView>
                    ))
                  )}
                </>
              )}

              {/* Assets Tab */}
              {activeTab === 'assets' && (
                <>
                  {/* Asset Type Filter */}
                  <View style={styles.filterRow}>
                    {assetTypeFilters.map((filter) => (
                      <Pressable
                        key={filter}
                        onPress={() => setSelectedAssetFilter(filter)}
                        style={[
                          styles.filterPill,
                          selectedAssetFilter === filter && { backgroundColor: `${primaryColor}20` },
                        ]}
                      >
                        <ThemedText style={[styles.filterText, { color: selectedAssetFilter === filter ? primaryColor : mutedColor }]}>
                          {filter}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>

                  {rwaLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator size="large" color={primaryColor} />
                      <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                        Loading assets...
                      </ThemedText>
                    </View>
                  ) : filteredAssets.length === 0 ? (
                    <View style={styles.emptyState}>
                      <View style={[styles.emptyStateIcon, { backgroundColor: `${primaryColor}10` }]}>
                        <Ionicons name="locate-outline" size={32} color={primaryColor} />
                      </View>
                      <ThemedText style={styles.emptyStateTitle}>No assets yet</ThemedText>
                      <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                        {walletAddress ? 'Your RWA and NFT holdings will appear here' : 'Connect your wallet to see assets'}
                      </ThemedText>
                    </View>
                  ) : (
                    filteredAssets.map((asset, idx) => (
                      <ThemedView
                        key={idx}
                        style={styles.assetCard}
                        lightColor="#f4f4f5"
                        darkColor="#1c1c1e"
                      >
                        <View style={styles.assetLeft}>
                          <View style={styles.assetImage}>
                            <View style={[styles.assetImagePlaceholder, { backgroundColor: getTypeColor(asset.type) }]}>
                              <ThemedText style={styles.assetImageText}>{asset.name.charAt(0)}</ThemedText>
                            </View>
                          </View>
                          <View>
                            <ThemedText style={styles.assetName}>{asset.name}</ThemedText>
                            <View style={[styles.typeBadge, { backgroundColor: `${getTypeColor(asset.type)}20` }]}>
                              <ThemedText style={[styles.typeBadgeText, { color: getTypeColor(asset.type) }]}>
                                {asset.type.toUpperCase()}
                              </ThemedText>
                            </View>
                          </View>
                        </View>

                        <View style={styles.assetRight}>
                          <ThemedText style={styles.assetValue}>${asset.value.toLocaleString()}</ThemedText>
                          <View style={styles.changeRow}>
                            <Ionicons
                              name={asset.change >= 0 ? 'arrow-up' : 'arrow-down'}
                              size={12}
                              color={asset.change >= 0 ? primaryColor : '#ef4444'}
                            />
                            <ThemedText style={[styles.changeText, { color: asset.change >= 0 ? primaryColor : '#ef4444' }]}>
                              {Math.abs(asset.change)}%
                            </ThemedText>
                          </View>
                        </View>
                      </ThemedView>
                    ))
                  )}
                </>
              )}

              {/* Predictions Tab */}
              {activeTab === 'predictions' && (
                <>
                  {predictionsLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator size="large" color={primaryColor} />
                      <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                        Loading positions...
                      </ThemedText>
                    </View>
                  ) : predictions.length === 0 ? (
                    <View style={styles.emptyState}>
                      <View style={[styles.emptyStateIcon, { backgroundColor: `${primaryColor}10` }]}>
                        <Ionicons name="bar-chart-outline" size={32} color={primaryColor} />
                      </View>
                      <ThemedText style={styles.emptyStateTitle}>No positions yet</ThemedText>
                      <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                        {walletAddress ? 'Your prediction market positions will appear here' : 'Connect your wallet to see positions'}
                      </ThemedText>
                    </View>
                  ) : (
                    <>
                      {/* Stats Row */}
                      <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}20` }]}>
                          <ThemedText style={[styles.statLabel, { color: mutedColor }]}>UNREALIZED P&L</ThemedText>
                          <View style={styles.statValueRow}>
                            <Ionicons name={totalPredictions >= 0 ? "arrow-up" : "arrow-down"} size={14} color={totalPredictions >= 0 ? primaryColor : '#ef4444'} />
                            <ThemedText style={[styles.statValue, { color: totalPredictions >= 0 ? primaryColor : '#ef4444' }]}>
                              {totalPredictions >= 0 ? '+' : ''}${totalPredictions.toFixed(2)}
                            </ThemedText>
                          </View>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: `${borderColor}` }]}>
                          <ThemedText style={[styles.statLabel, { color: mutedColor }]}>OPEN POSITIONS</ThemedText>
                          <ThemedText style={styles.statValue}>{predictions.length}</ThemedText>
                        </View>
                      </View>

                      {predictions.map((pred, idx) => {
                        const pnl = (pred.currentPrice - pred.avgPrice) * pred.shares;
                        const pnlPercent = ((pred.currentPrice - pred.avgPrice) / pred.avgPrice) * 100;
                        return (
                          <ThemedView
                            key={idx}
                            style={styles.predictionCard}
                            lightColor="#f4f4f5"
                            darkColor="#1c1c1e"
                          >
                            <View style={styles.predictionHeader}>
                              <View style={styles.predictionQuestion}>
                                <ThemedText style={styles.predictionText}>{pred.question}</ThemedText>
                                <View style={styles.predictionMeta}>
                                  <View style={[
                                    styles.positionBadge,
                                    { backgroundColor: pred.position === 'yes' ? `${primaryColor}20` : 'rgba(239,68,68,0.2)' }
                                  ]}>
                                    <ThemedText style={[
                                      styles.positionText,
                                      { color: pred.position === 'yes' ? primaryColor : '#ef4444' }
                                    ]}>
                                      {pred.position.toUpperCase()}
                                    </ThemedText>
                                  </View>
                                  <ThemedText style={[styles.marketText, { color: mutedColor }]}>{pred.market}</ThemedText>
                                </View>
                              </View>
                              <View style={styles.expiresRow}>
                                <Ionicons name="time" size={12} color={mutedColor} />
                                <ThemedText style={[styles.expiresText, { color: mutedColor }]}>{pred.expiresIn}</ThemedText>
                              </View>
                            </View>

                            <View style={[styles.predictionFooter, { borderTopColor: borderColor }]}>
                              <View style={styles.predictionStats}>
                                <View style={styles.predictionStat}>
                                  <ThemedText style={[styles.predictionStatLabel, { color: mutedColor }]}>SHARES</ThemedText>
                                  <ThemedText style={styles.predictionStatValue}>{pred.shares}</ThemedText>
                                </View>
                                <View style={styles.predictionStat}>
                                  <ThemedText style={[styles.predictionStatLabel, { color: mutedColor }]}>AVG</ThemedText>
                                  <ThemedText style={styles.predictionStatValue}>${pred.avgPrice.toFixed(2)}</ThemedText>
                                </View>
                                <View style={styles.predictionStat}>
                                  <ThemedText style={[styles.predictionStatLabel, { color: mutedColor }]}>CURRENT</ThemedText>
                                  <ThemedText style={styles.predictionStatValue}>${pred.currentPrice.toFixed(2)}</ThemedText>
                                </View>
                              </View>
                              <View style={styles.pnlContainer}>
                                <ThemedText style={[styles.pnlValue, { color: pnl >= 0 ? primaryColor : '#ef4444' }]}>
                                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                </ThemedText>
                                <ThemedText style={[styles.pnlPercent, { color: pnl >= 0 ? primaryColor : '#ef4444' }]}>
                                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                                </ThemedText>
                              </View>
                            </View>
                          </ThemedView>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Backdrop Overlay */}
      <AnimatedPressable
        style={[styles.backdrop, backdropAnimatedStyle]}
        onPress={handleBackdropPress}
      />

      {/* Command Bar - Sticky above keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.stickyCommandBar}>
        <CommandBar
          onSend={handleSendMessage}
          onCamera={handleCamera}
          onMic={handleMic}
          onFocusChange={handleCommandBarFocusChange}
        />
        <View style={{ height: insets.bottom }} />
      </KeyboardStickyView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10,
  },
  stickyCommandBar: {
    zIndex: 20,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingTop: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  withdrawButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  depositButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Mode Toggle
  modeToggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Tab Selector
  tabSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  tabButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabValue: {
    fontSize: 10,
  },
  // Content
  content: {
    gap: 10,
  },
  // Token Card
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconText: {
    fontSize: 18,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: '500',
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  autoBadgeText: {
    fontSize: 8,
    fontWeight: '600',
  },
  tokenBalance: {
    fontSize: 12,
    marginTop: 2,
  },
  tokenRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenValue: {
    alignItems: 'flex-end',
  },
  tokenValueText: {
    fontSize: 14,
    fontWeight: '500',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 12,
  },
  // Filter
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  filterText: {
    fontSize: 12,
  },
  // Asset Card
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  assetImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
  },
  assetImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetImageText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  assetName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '600',
  },
  assetRight: {
    alignItems: 'flex-end',
  },
  assetValue: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: 1,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Prediction Card
  predictionCard: {
    padding: 16,
    borderRadius: 14,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  predictionQuestion: {
    flex: 1,
    paddingRight: 12,
  },
  predictionText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 8,
  },
  predictionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  positionText: {
    fontSize: 9,
    fontWeight: '700',
  },
  marketText: {
    fontSize: 10,
  },
  expiresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiresText: {
    fontSize: 10,
  },
  predictionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
  },
  predictionStats: {
    flexDirection: 'row',
    gap: 20,
  },
  predictionStat: {},
  predictionStatLabel: {
    fontSize: 8,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  predictionStatValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  pnlContainer: {
    alignItems: 'flex-end',
  },
  pnlValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  pnlPercent: {
    fontSize: 10,
  },
  // Empty state styles
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
