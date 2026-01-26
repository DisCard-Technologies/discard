import { useState, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, Pressable, Image, Dimensions, Linking, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTokenHistory, useTokenPerformance, TimePeriod } from '@/hooks/useTokenHistory';
import { useTokenDetail } from '@/hooks/useTokenDetail';
import { primaryColor, positiveColor, negativeColor, Fonts } from '@/constants/theme';

// Extracted components
import { ScreenHeader } from '@/components/ui/layout/ScreenHeader';
import { TimePeriodSelector } from '@/components/ui/layout/TimePeriodSelector';
import { PriceChart, createChartPath, createAreaPath, generateFallbackChartData, useChartPath } from '@/components/charts';
import { TokenIcon } from '@/components/tokens/TokenIcon';
import { TokenHeroSection } from '@/components/tokens/TokenHeroSection';
import { TokenActions, type TokenAction } from '@/components/tokens/TokenActions';
import { TokenStats, type TokenStat } from '@/components/tokens/TokenStats';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 48;
const CHART_HEIGHT = 200;
const FULLSCREEN_CHART_WIDTH = SCREEN_WIDTH - 32;
const FULLSCREEN_CHART_HEIGHT = SCREEN_HEIGHT * 0.45;

// Drawer configuration
const DRAWER_CLOSED_HEIGHT = 380;
const DRAWER_OPEN_HEIGHT = SCREEN_HEIGHT * 0.88;
const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 1 };

export type TransactionType = 'send' | 'receive' | 'swap' | 'deposit' | 'withdrawal';

export interface RecentTransaction {
  id: string;
  type: TransactionType;
  address: string;
  tokenAmount: string;
  fiatValue: string;
  fee?: string;
  time?: string;
}

interface TokenDetailProps {
  token: {
    symbol: string;
    name: string;
    icon?: string;
    price: number;
    change24h: number;
    marketCap?: string;
    volume24h?: string;
    supply?: string;
    totalSupply?: string;
    rank?: number;
    mint?: string;
    logoUri?: string;
    network?: string;
    about?: string;
  };
  owned?: {
    balance: string;
    value: number;
    avgCost?: number;
    pnl?: number;
    pnlPercent?: number;
    allocation?: number;
    paidFees?: number;
    return24h?: number;
    isAmbientManaged?: boolean;
  };
  recentTransactions?: RecentTransaction[];
  onBack: () => void;
  onBuy?: () => void;
  onSell?: () => void;
  onSend?: () => void;
  onReceive?: () => void;
  onSwap?: () => void;
  onSetGoal?: () => void;
  onTransactionPress?: (transaction: RecentTransaction) => void;
}

// Chart path generation now imported from @/components/charts


export function TokenDetailScreen({
  token,
  owned,
  recentTransactions = [],
  onBack,
  onBuy,
  onSend,
  onReceive,
  onSwap,
  onTransactionPress,
}: TokenDetailProps) {
  const insets = useSafeAreaInsets();
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isTxExpanded, setIsTxExpanded] = useState(false);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('D');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Fetch historical price data
  const { prices: historyPrices, isLoading: isHistoryLoading } = useTokenHistory(
    token.symbol,
    selectedPeriod
  );

  // Fetch detailed token data (market cap, volume, socials)
  const {
    data: tokenDetailData,
    marketCap: detailMarketCap,
    volume24h: detailVolume24h,
    circulatingSupply: detailCirculatingSupply,
    totalSupply: detailTotalSupply,
    socials,
    isLoading: isDetailLoading,
  } = useTokenDetail(token.mint);

  // Fetch performance data (calculated from Birdeye OHLCV)
  const { performance: performanceData, isLoading: isPerformanceLoading } = useTokenPerformance(
    token.mint,
    token.price
  );

  // Use historical data if available, otherwise generate fallback
  const chartData = useMemo(() => {
    if (historyPrices.length > 0) {
      return historyPrices;
    }
    return generateFallbackChartData(token.price);
  }, [historyPrices, token.price]);

  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const drawerBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // Drawer animation
  const drawerTranslateY = useSharedValue(0);
  const startDragY = useSharedValue(0);
  const maxTranslate = -(DRAWER_OPEN_HEIGHT - DRAWER_CLOSED_HEIGHT);

  // Transaction stack animation
  const txHeight = useSharedValue(80);

  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  };

  const formatLargeNumber = (value?: string | number): string => {
    if (!value) return 'N/A';
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : value;
    if (isNaN(num)) return typeof value === 'string' ? value : 'N/A';
    if (num >= 1_000_000_000_000) return `$${(num / 1_000_000_000_000).toFixed(1)}T`;
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatSupply = (value?: string): string => {
    if (!value) return 'N/A';
    return value;
  };

  const getTransactionIcon = (type: TransactionType): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'send': return 'arrow-up';
      case 'receive': return 'arrow-down';
      case 'swap': return 'swap-horizontal';
      case 'deposit': return 'arrow-down';
      case 'withdrawal': return 'arrow-up';
      default: return 'ellipsis-horizontal';
    }
  };

  const isPositive = token.change24h >= 0;
  const changeColor = isPositive ? positiveColor : negativeColor;

  // Scroll tracking for gesture coordination
  const scrollOffset = useSharedValue(0);
  const isScrolling = useSharedValue(false);

  // Chart paths (memoized since chartData updates with period changes)
  const { linePath, lastPoint, areaPath } = useMemo(() => {
    const { path, lastPoint } = createChartPath(chartData, CHART_WIDTH, CHART_HEIGHT);
    const area = createAreaPath(path, CHART_WIDTH, CHART_HEIGHT, chartData.length);
    return { linePath: path, lastPoint, areaPath: area };
  }, [chartData]);

  // Drawer gesture handlers
  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const notifyDrawerChange = useCallback((open: boolean) => {
    setIsDrawerOpen(open);
  }, []);

  // Pan gesture only for the drawer handle area
  const handlePanGesture = Gesture.Pan()
    .onStart(() => {
      startDragY.value = drawerTranslateY.value;
    })
    .onUpdate((event) => {
      const newValue = startDragY.value + event.translationY;
      drawerTranslateY.value = Math.max(maxTranslate, Math.min(0, newValue));
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const shouldOpen = velocity < -500 || (drawerTranslateY.value < maxTranslate / 2 && velocity < 200);

      if (shouldOpen) {
        drawerTranslateY.value = withSpring(maxTranslate, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
        runOnJS(notifyDrawerChange)(true);
      } else {
        drawerTranslateY.value = withSpring(0, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
        runOnJS(notifyDrawerChange)(false);
      }
    });

  // Native scroll gesture for the ScrollView
  const scrollGesture = Gesture.Native();

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drawerTranslateY.value }],
  }));

  const handleDrawerToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isDrawerOpen) {
      drawerTranslateY.value = withSpring(0, SPRING_CONFIG);
      setIsDrawerOpen(false);
    } else {
      drawerTranslateY.value = withSpring(maxTranslate, SPRING_CONFIG);
      setIsDrawerOpen(true);
    }
  };

  // Transaction stack expand/collapse
  const txAnimatedStyle = useAnimatedStyle(() => ({
    height: txHeight.value,
  }));

  const handleTxExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isTxExpanded) {
      txHeight.value = withTiming(80, { duration: 200 });
    } else {
      txHeight.value = withTiming(140, { duration: 200 });
    }
    setIsTxExpanded(!isTxExpanded);
  };

  // Full-screen chart modal
  const toggleChart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsChartExpanded(!isChartExpanded);
  };

  // Full-screen chart paths
  const { linePath: fullscreenLinePath, lastPoint: fullscreenLastPoint, areaPath: fullscreenAreaPath } = useMemo(() => {
    const { path, lastPoint } = createChartPath(chartData, FULLSCREEN_CHART_WIDTH, FULLSCREEN_CHART_HEIGHT);
    const area = createAreaPath(path, FULLSCREEN_CHART_WIDTH, FULLSCREEN_CHART_HEIGHT, chartData.length);
    return { linePath: path, lastPoint, areaPath: area };
  }, [chartData]);

  const timePeriods: TimePeriod[] = ['H', 'D', 'W', 'M', 'Y', 'Max'];

  // Circular action buttons for owned tokens
  const actions = [
    { id: 'send', icon: 'arrow-up' as const, label: 'Send', onPress: onSend },
    { id: 'receive', icon: 'arrow-down' as const, label: 'Receive', onPress: onReceive },
    { id: 'swap', icon: 'swap-horizontal' as const, label: 'Swap', onPress: onSwap },
    { id: 'buy', icon: 'cart' as const, label: 'Buy', onPress: onBuy },
  ];

  // Get most recent transaction for stack display
  const mostRecentTx = recentTransactions?.[0];

  // Equity data for owned tokens
  const equityData = useMemo(() => {
    if (!owned) return null;
    return {
      ofAllAssets: owned.allocation ? `${owned.allocation.toFixed(1)}%` : '--',
      averageCost: owned.avgCost ? `$${owned.avgCost.toFixed(6)}` : '--',
      paidFees: owned.paidFees ? `$${owned.paidFees.toFixed(2)}` : '--',
      return24h: owned.return24h ? `$${owned.return24h.toFixed(2)}` : '--',
      returnPercent: owned.pnlPercent ? `${owned.pnlPercent >= 0 ? '+' : ''}${owned.pnlPercent.toFixed(2)}%` : '--',
    };
  }, [owned]);

  return (
    <ThemedView style={styles.container}>
      {/* Ambient Gradient Background */}
      <LinearGradient
        colors={isPositive
          ? ['rgba(16,185,129,0.15)', 'rgba(16,185,129,0.05)', 'transparent']
          : ['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.05)', 'transparent']
        }
        style={styles.ambientGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: cardBg },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={textColor} />
        </Pressable>

        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>{token.symbol}</ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: mutedColor }]}>
            {token.network || 'Solana'}
          </ThemedText>
        </View>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsWatchlisted(!isWatchlisted);
          }}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: cardBg },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={isWatchlisted ? 'star' : 'star-outline'}
            size={20}
            color={isWatchlisted ? '#f59e0b' : mutedColor}
          />
        </Pressable>
      </View>

      {/* Hero Section */}
      <View style={styles.heroSection}>
        {/* Token Icon */}
        <View style={[styles.tokenIconWrapper, { borderColor }]}>
          {token.logoUri ? (
            <Image source={{ uri: token.logoUri }} style={styles.tokenIconImage} />
          ) : (
            <View style={[styles.tokenIconPlaceholder, { backgroundColor: cardBg }]}>
              <ThemedText style={styles.tokenIconText}>
                {token.icon || token.symbol.slice(0, 2)}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Balance/Price Display */}
        {owned ? (
          <>
            <ThemedText style={styles.heroBalance}>
              {owned.balance} {token.symbol}
            </ThemedText>
            <ThemedText style={[styles.heroFiatValue, { color: mutedColor }]}>
              ≈ ${owned.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </ThemedText>
          </>
        ) : (
          <>
            <ThemedText style={styles.heroPrice}>
              ${formatPrice(token.price)}
            </ThemedText>
            <View style={styles.heroChangeRow}>
              <View style={[styles.heroChangeBadge, { backgroundColor: `${changeColor}20` }]}>
                <ThemedText style={[styles.heroChangeText, { color: changeColor }]}>
                  {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
                </ThemedText>
              </View>
              <ThemedText style={[styles.heroChangeLabel, { color: mutedColor }]}>24h</ThemedText>
            </View>
          </>
        )}
      </View>

      {/* Action Buttons - Different for owned vs non-owned */}
      {owned ? (
        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                action.onPress?.();
              }}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: cardBg, borderColor }]}>
                <Ionicons name={action.icon} size={20} color={textColor} />
              </View>
              <ThemedText style={[styles.actionLabel, { color: mutedColor }]}>
                {action.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.nonOwnedActions}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onBuy?.();
            }}
            style={({ pressed }) => [
              styles.buyButton,
              { backgroundColor: primaryColor },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <ThemedText style={styles.buyButtonText}>Buy {token.symbol}</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsWatchlisted(!isWatchlisted);
            }}
            style={({ pressed }) => [
              styles.watchlistButton,
              {
                backgroundColor: isWatchlisted ? 'rgba(245,158,11,0.15)' : cardBg,
                borderColor: isWatchlisted ? 'rgba(245,158,11,0.3)' : borderColor,
              },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={isWatchlisted ? 'star' : 'star-outline'}
              size={20}
              color={isWatchlisted ? '#f59e0b' : textColor}
            />
            <ThemedText style={[styles.watchlistButtonText, isWatchlisted && { color: '#f59e0b' }]}>
              {isWatchlisted ? 'Watching' : 'Watchlist'}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Transaction Stack - Only for owned tokens */}
      {owned && mostRecentTx && (
        <Pressable onPress={handleTxExpand} style={styles.txStackContainer}>
          {/* Background stacked cards */}
          <View style={[styles.txStackCard3, { backgroundColor: cardBg, borderColor }]} />
          <View style={[styles.txStackCard2, { backgroundColor: cardBg, borderColor }]} />

          {/* Main card */}
          <Animated.View style={[styles.txStackMain, { backgroundColor: cardBg, borderColor }, txAnimatedStyle]}>
            <View style={styles.txMainContent}>
              <View style={[styles.txIcon, { borderColor }]}>
                <Ionicons name={getTransactionIcon(mostRecentTx.type)} size={18} color={textColor} />
              </View>
              <View style={styles.txInfo}>
                <ThemedText style={styles.txType}>
                  {mostRecentTx.type.charAt(0).toUpperCase() + mostRecentTx.type.slice(1)}
                </ThemedText>
                <View style={styles.txAddressRow}>
                  <View style={styles.txAddressDot}>
                    <ThemedText style={[styles.txDiamond, { color: primaryColor }]}>◆</ThemedText>
                  </View>
                  <ThemedText style={[styles.txAddress, { color: mutedColor }]}>
                    {mostRecentTx.address}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.txAmountContainer}>
                <ThemedText style={styles.txAmount}>{mostRecentTx.tokenAmount}</ThemedText>
                <ThemedText style={[styles.txFiat, { color: mutedColor }]}>{mostRecentTx.fiatValue}</ThemedText>
              </View>
            </View>

            {/* Expanded content */}
            {isTxExpanded && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.txExpandedContent}>
                <View style={[styles.txExpandedDivider, { backgroundColor: borderColor }]} />
                <View style={styles.txExpandedRow}>
                  <ThemedText style={[styles.txExpandedLabel, { color: mutedColor }]}>Fee</ThemedText>
                  <ThemedText style={styles.txExpandedValue}>{mostRecentTx.fee || '$0.12'}</ThemedText>
                </View>
                <View style={styles.txExpandedRow}>
                  <ThemedText style={[styles.txExpandedLabel, { color: mutedColor }]}>Time</ThemedText>
                  <ThemedText style={styles.txExpandedValue}>{mostRecentTx.time || '≈3-4m'}</ThemedText>
                </View>
              </Animated.View>
            )}
          </Animated.View>
        </Pressable>
      )}

      {/* Draggable Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: drawerBg,
            borderTopColor: borderColor,
            height: DRAWER_OPEN_HEIGHT,
            top: SCREEN_HEIGHT - DRAWER_CLOSED_HEIGHT - insets.bottom,
          },
          drawerAnimatedStyle,
        ]}
      >
        {/* Drawer Handle - Only this part is draggable */}
        <GestureDetector gesture={handlePanGesture}>
          <Animated.View>
            <Pressable style={styles.drawerHandle} onPress={handleDrawerToggle}>
              <View style={[styles.drawerHandleBar, { backgroundColor: mutedColor }]} />
            </Pressable>
          </Animated.View>
        </GestureDetector>

        <GestureDetector gesture={scrollGesture}>
          <ScrollView
            style={styles.drawerContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
            nestedScrollEnabled={true}
            contentContainerStyle={{ paddingBottom: 80 }}
          >
            {/* Stats Section */}
            <View style={styles.sectionContainer}>
              <ThemedText style={styles.sectionTitle}>Stats</ThemedText>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <View style={styles.statHeader}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Market Cap</ThemedText>
                    <Ionicons name="analytics-outline" size={14} color={mutedColor} />
                  </View>
                  <ThemedText style={styles.statValue}>
                    {detailMarketCap !== 'N/A' ? detailMarketCap : formatLargeNumber(token.marketCap)}
                  </ThemedText>
                </View>
                <View style={styles.statItem}>
                  <View style={styles.statHeader}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Volume 24h</ThemedText>
                    <Ionicons name="trending-up-outline" size={14} color={mutedColor} />
                  </View>
                  <ThemedText style={styles.statValue}>
                    {detailVolume24h !== 'N/A' ? detailVolume24h : formatLargeNumber(token.volume24h)}
                  </ThemedText>
                </View>
                <View style={styles.statItem}>
                  <View style={styles.statHeader}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Circulating</ThemedText>
                    <Ionicons name="repeat-outline" size={14} color={mutedColor} />
                  </View>
                  <ThemedText style={styles.statValue}>
                    {detailCirculatingSupply !== 'N/A' ? detailCirculatingSupply : formatSupply(token.supply)}
                  </ThemedText>
                </View>
                <View style={styles.statItem}>
                  <View style={styles.statHeader}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Total Supply</ThemedText>
                    <Ionicons name="layers-outline" size={14} color={mutedColor} />
                  </View>
                  <ThemedText style={styles.statValue}>
                    {detailTotalSupply !== 'N/A' ? detailTotalSupply : formatSupply(token.totalSupply || token.supply)}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Expanded Content */}
            {isDrawerOpen && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                {/* About Section */}
                <View style={styles.sectionContainer}>
                  <ThemedText style={styles.sectionTitle}>About {token.symbol}</ThemedText>
                  <ThemedText style={[styles.aboutText, { color: mutedColor }]}>
                    {tokenDetailData?.description || token.about || `${token.name} (${token.symbol}) is a cryptocurrency available on the ${token.network || 'Solana'} network. Trade, send, and receive ${token.symbol} with ease.`}
                  </ThemedText>
                  {(tokenDetailData?.description || token.about) && (
                    <Pressable style={styles.showMoreButton}>
                      <ThemedText style={[styles.showMoreText, { color: primaryColor }]}>Show more</ThemedText>
                    </Pressable>
                  )}
                </View>

                {/* Equity Section - Only for owned tokens */}
                {owned && equityData && (
                  <View style={styles.sectionContainer}>
                    <ThemedText style={styles.sectionTitle}>Equity</ThemedText>
                    <View style={styles.statsGrid}>
                      <View style={styles.statItem}>
                        <View style={styles.statHeader}>
                          <ThemedText style={[styles.statLabel, { color: mutedColor }]}>% of Assets</ThemedText>
                          <Ionicons name="information-circle-outline" size={14} color={mutedColor} />
                        </View>
                        <ThemedText style={styles.statValue}>{equityData.ofAllAssets}</ThemedText>
                      </View>
                      <View style={styles.statItem}>
                        <View style={styles.statHeader}>
                          <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Avg Cost</ThemedText>
                          <Ionicons name="information-circle-outline" size={14} color={mutedColor} />
                        </View>
                        <ThemedText style={styles.statValue}>{equityData.averageCost}</ThemedText>
                      </View>
                      <View style={styles.statItem}>
                        <View style={styles.statHeader}>
                          <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Paid Fees</ThemedText>
                          <Ionicons name="information-circle-outline" size={14} color={mutedColor} />
                        </View>
                        <ThemedText style={styles.statValue}>{equityData.paidFees}</ThemedText>
                      </View>
                      <View style={styles.statItem}>
                        <View style={styles.statHeader}>
                          <ThemedText style={[styles.statLabel, { color: mutedColor }]}>24h Return</ThemedText>
                          <Ionicons name="information-circle-outline" size={14} color={mutedColor} />
                        </View>
                        <ThemedText style={[styles.statValue, { color: changeColor }]}>
                          {equityData.returnPercent}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                )}

                {/* Performance Section */}
                <View style={styles.sectionContainer}>
                  <ThemedText style={styles.sectionTitle}>Performance</ThemedText>
                  {performanceData.map((item, index) => {
                    const isNegative = item.change < 0;
                    const barColor = item.value === null ? mutedColor : (isNegative ? negativeColor : positiveColor);
                    return (
                      <View key={index} style={styles.performanceRow}>
                        <ThemedText style={[styles.performanceLabel, { color: mutedColor }]}>
                          {item.period}
                        </ThemedText>
                        <View style={styles.performanceBarContainer}>
                          <View
                            style={[
                              styles.performanceBar,
                              { width: `${item.percent}%`, backgroundColor: barColor },
                            ]}
                          />
                        </View>
                        <ThemedText
                          style={[
                            styles.performanceValue,
                            { color: item.value === null ? mutedColor : barColor },
                          ]}
                        >
                          {item.value || '--'}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>

                {/* Resources Section - Only show if at least one link is available */}
                {(socials.website || socials.twitter || socials.telegram || socials.discord) && (
                  <View style={styles.sectionContainer}>
                    <ThemedText style={styles.sectionTitle}>Resources</ThemedText>
                    <View style={styles.resourcesRow}>
                      {socials.website && (
                        <Pressable
                          style={[styles.resourceButton, { backgroundColor: cardBg, borderColor }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            Linking.openURL(socials.website!);
                          }}
                        >
                          <Ionicons name="globe-outline" size={20} color={textColor} />
                        </Pressable>
                      )}
                      {socials.twitter && (
                        <Pressable
                          style={[styles.resourceButton, { backgroundColor: cardBg, borderColor }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            // Handle both full URLs and usernames
                            const url = socials.twitter!.startsWith('http')
                              ? socials.twitter!
                              : `https://x.com/${socials.twitter!.replace('@', '')}`;
                            Linking.openURL(url);
                          }}
                        >
                          <Ionicons name="logo-twitter" size={20} color={textColor} />
                        </Pressable>
                      )}
                      {socials.telegram && (
                        <Pressable
                          style={[styles.resourceButton, { backgroundColor: cardBg, borderColor }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            // Handle both full URLs and usernames
                            const url = socials.telegram!.startsWith('http')
                              ? socials.telegram!
                              : `https://t.me/${socials.telegram!.replace('@', '')}`;
                            Linking.openURL(url);
                          }}
                        >
                          <Ionicons name="paper-plane-outline" size={20} color={textColor} />
                        </Pressable>
                      )}
                      {socials.discord && (
                        <Pressable
                          style={[styles.resourceButton, { backgroundColor: cardBg, borderColor }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            Linking.openURL(socials.discord!);
                          }}
                        >
                          <Ionicons name="logo-discord" size={20} color={textColor} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}

                {/* Edit Widgets Button */}
                <Pressable
                  style={[styles.editWidgetsButton, { borderColor }]}
                  onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                >
                  <Ionicons name="options-outline" size={18} color={mutedColor} />
                  <ThemedText style={[styles.editWidgetsText, { color: mutedColor }]}>
                    Edit Widgets
                  </ThemedText>
                </Pressable>
              </Animated.View>
            )}
          </ScrollView>
        </GestureDetector>

        </Animated.View>

      {/* Price Bar - Always visible at bottom */}
      <View style={[styles.expandablePriceContainer, { bottom: insets.bottom }]}>
        <Pressable
          onPress={toggleChart}
          style={[styles.expandablePriceRow, { backgroundColor: cardBg, borderTopColor: borderColor }]}
        >
          <View style={styles.expandablePriceInfo}>
            <ThemedText style={[styles.expandablePriceLabel, { color: mutedColor }]}>
              Current {token.symbol} price
            </ThemedText>
            <View style={styles.expandablePriceValueRow}>
              <ThemedText style={styles.expandablePrice}>${formatPrice(token.price)}</ThemedText>
              <ThemedText style={[styles.expandableChangeText, { color: changeColor }]}>
                {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
              </ThemedText>
            </View>
          </View>
          <Pressable
            onPress={toggleChart}
            style={[styles.expandableExpandButton, { backgroundColor: drawerBg }]}
          >
            <Ionicons
              name="chevron-up"
              size={20}
              color={mutedColor}
            />
          </Pressable>
        </Pressable>
      </View>

      {/* Full-Screen Chart Modal */}
      <Modal
        visible={isChartExpanded}
        animationType="slide"
        transparent={false}
        onRequestClose={toggleChart}
      >
        <View style={[styles.fullscreenChartContainer, { paddingTop: insets.top }]}>
          {/* Modal Header */}
          <View style={styles.fullscreenChartHeader}>
            <ThemedText style={styles.fullscreenChartTitle}>{token.symbol} Price</ThemedText>
            <Pressable
              onPress={toggleChart}
              style={({ pressed }) => [
                styles.fullscreenCloseButton,
                { backgroundColor: cardBg },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={22} color={textColor} />
            </Pressable>
          </View>

          {/* Price Display */}
          <View style={styles.fullscreenPriceSection}>
            <View style={[styles.fullscreenTokenIcon, { borderColor }]}>
              {token.logoUri ? (
                <Image source={{ uri: token.logoUri }} style={styles.fullscreenTokenImage} />
              ) : (
                <View style={[styles.fullscreenTokenIconPlaceholder, { backgroundColor: cardBg }]}>
                  <ThemedText style={styles.fullscreenTokenIconText}>
                    {token.icon || token.symbol.slice(0, 2)}
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText style={styles.fullscreenPrice}>${formatPrice(token.price)}</ThemedText>
            <ThemedText style={[styles.fullscreenChangeText, { color: changeColor }]}>
              {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
            </ThemedText>
          </View>

          {/* Chart */}
          <View style={styles.fullscreenChartWrapper}>
            <Svg width={FULLSCREEN_CHART_WIDTH} height={FULLSCREEN_CHART_HEIGHT}>
              <Defs>
                <SvgLinearGradient id="fullscreenChartGradient" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={changeColor} stopOpacity="0.4" />
                  <Stop offset="100%" stopColor={changeColor} stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>
              <Path d={fullscreenAreaPath} fill="url(#fullscreenChartGradient)" />
              <Path d={fullscreenLinePath} stroke={changeColor} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={fullscreenLastPoint.x} cy={fullscreenLastPoint.y} r={6} fill={changeColor} stroke="#0d1117" strokeWidth={2} />
            </Svg>
          </View>

          {/* Time Period Selector */}
          <View style={[styles.fullscreenTimePeriodContainer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.timePeriodSelector, { backgroundColor: cardBg }]}>
              {timePeriods.map((period) => (
                <Pressable
                  key={period}
                  onPress={() => {
                    setSelectedPeriod(period);
                    Haptics.selectionAsync();
                  }}
                  style={[
                    styles.timePeriodButton,
                    selectedPeriod === period && [styles.timePeriodButtonActive, { backgroundColor: drawerBg }],
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.timePeriodText,
                      { color: selectedPeriod === period ? textColor : mutedColor },
                    ]}
                  >
                    {period}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ambientGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  // Hero Section
  heroSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  tokenIconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  tokenIconImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  tokenIconPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconText: {
    fontSize: 22,
    fontWeight: '600',
  },
  heroBalance: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  heroFiatValue: {
    fontSize: 16,
    marginTop: 4,
  },
  heroPrice: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  heroChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  heroChangeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroChangeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  heroChangeLabel: {
    fontSize: 14,
  },

  // Action Buttons - Owned
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  actionButton: {
    alignItems: 'center',
    gap: 6,
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Action Buttons - Non-Owned
  nonOwnedActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  watchlistButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  watchlistButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Transaction Stack
  txStackContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    position: 'relative',
  },
  txStackCard3: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    height: 70,
    borderRadius: 14,
    borderWidth: 1,
    opacity: 0.4,
  },
  txStackCard2: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    height: 74,
    borderRadius: 14,
    borderWidth: 1,
    opacity: 0.7,
  },
  txStackMain: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  txMainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
    marginLeft: 12,
  },
  txType: {
    fontSize: 16,
    fontWeight: '600',
  },
  txAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  txAddressDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txDiamond: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  txAddress: {
    fontSize: 14,
    fontFamily: Fonts.mono,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  txFiat: {
    fontSize: 14,
    marginTop: 2,
  },
  txExpandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  txExpandedDivider: {
    height: 1,
    marginBottom: 12,
  },
  txExpandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  txExpandedLabel: {
    fontSize: 13,
  },
  txExpandedValue: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Drawer
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 50,
  },
  drawerHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  drawerHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  drawerContent: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // Sections
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    paddingVertical: 8,
    paddingRight: 8,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingRight: 16,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
  },

  // About
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
  },
  showMoreButton: {
    marginTop: 8,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Performance
  performanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  performanceLabel: {
    width: 80,
    fontSize: 12,
  },
  performanceBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(128,128,128,0.15)',
    borderRadius: 4,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  performanceBar: {
    height: '100%',
    borderRadius: 4,
  },
  performanceValue: {
    width: 70,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },

  // News
  newsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  newsContent: {
    flex: 1,
  },
  newsSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  newsSourceIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  newsSource: {
    fontSize: 12,
    fontWeight: '500',
  },
  newsTime: {
    fontSize: 12,
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  newsImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginLeft: 12,
  },

  // Resources
  resourcesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  resourceButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Edit Widgets
  editWidgetsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  editWidgetsText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Fixed Price Bar
  fixedPriceBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  priceBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceBarLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  priceBarRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  priceBarValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  priceBarChange: {
    fontSize: 14,
    fontWeight: '500',
  },
  expandChartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Price Bar at Bottom
  expandablePriceContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 60,
  },
  expandablePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  expandablePriceInfo: {
    flex: 1,
    flexDirection: 'column',
  },
  expandablePriceLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  expandablePriceValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  expandablePrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  expandableChangeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  expandableExpandButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Time Period Selector
  timePeriodSelector: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
  },
  timePeriodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
  },
  timePeriodButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  timePeriodText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Full-Screen Chart Modal
  fullscreenChartContainer: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  fullscreenChartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fullscreenChartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  fullscreenCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenPriceSection: {
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  fullscreenTokenIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  fullscreenTokenImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  fullscreenTokenIconPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenTokenIconText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  fullscreenPrice: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  fullscreenChangeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  fullscreenChartWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  fullscreenTimePeriodContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
});
