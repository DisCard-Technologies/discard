import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, ActivityIndicator, Image } from 'react-native';
import { PressableScale } from 'pressto';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedCounter } from '@/components/animated-counter';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { positiveColor, negativeColor } from '@/constants/theme';

// Props for the content component when used in pager
export interface PortfolioScreenContentProps {
  onNavigateToHome?: () => void;
  onNavigateToCard?: () => void;
  topInset?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 48;
const CHART_HEIGHT = 100;

type TimePeriod = 'H' | 'D' | 'W' | 'M' | 'Y' | 'Max';

// Generate mock chart data
function generateChartData(): number[] {
  const points: number[] = [];
  let value = 3000;
  for (let i = 0; i < 50; i++) {
    value += (Math.random() - 0.45) * 200;
    value = Math.max(2000, Math.min(4500, value));
    points.push(value);
  }
  return points;
}

// Create SVG path from data points
function createChartPath(data: number[], width: number, height: number): { path: string; lastPoint: { x: number; y: number } } {
  if (data.length === 0) return { path: '', lastPoint: { x: 0, y: 0 } };

  const minValue = Math.min(...data);
  const maxValue = Math.max(...data);
  const range = maxValue - minValue || 1;

  const xStep = width / (data.length - 1);
  const padding = 8;
  const chartHeight = height - padding * 2;

  const points = data.map((value, index) => {
    const x = index * xStep;
    const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
    return { x, y };
  });

  // Create smooth curve using quadratic bezier
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    path += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
  }
  path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

  return { path, lastPoint: points[points.length - 1] };
}

// Create area path for gradient fill
function createAreaPath(linePath: string, width: number, height: number, dataLength: number): string {
  if (!linePath) return '';
  const xStep = width / (dataLength - 1);
  const lastX = (dataLength - 1) * xStep;
  return `${linePath} L ${lastX} ${height} L 0 ${height} Z`;
}

// Drawer constants
const DRAWER_CLOSED_HEIGHT = 340;
const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 1 };

export function PortfolioScreenContent({ topInset = 0 }: PortfolioScreenContentProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Dynamic drawer height - expands to just under top bar (topInset includes safe area + TopBar height)
  const drawerOpenHeight = SCREEN_HEIGHT - topInset - 12;

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const drawerBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');

  // Real data from hooks
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  const {
    holdings: tokenHoldings,
    totalValue: tokenTotal,
    isLoading: tokensLoading
  } = useTokenHoldings(walletAddress);

  // State
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('D');
  const [chartData] = useState(() => generateChartData());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // Drawer animation
  const drawerTranslateY = useSharedValue(0);
  const startDragY = useSharedValue(0);
  const maxTranslate = -(drawerOpenHeight - DRAWER_CLOSED_HEIGHT);

  // Calculate portfolio values
  const portfolioValue = tokenTotal || 0;

  // Categorize holdings: USDC = Cash, everything else = Investments
  const { cashTotal, investmentsTotal, cashHoldings, investmentHoldings } = useMemo(() => {
    if (!tokenHoldings || tokenHoldings.length === 0) {
      return { cashTotal: 0, investmentsTotal: 0, cashHoldings: [], investmentHoldings: [] };
    }

    // USDC only = Cash (Coinbase-inspired model)
    const cash = tokenHoldings.filter(h => h.symbol.toUpperCase() === 'USDC');
    const investments = tokenHoldings.filter(h => h.symbol.toUpperCase() !== 'USDC');

    return {
      cashTotal: cash.reduce((sum, h) => sum + h.valueUsd, 0),
      investmentsTotal: investments.reduce((sum, h) => sum + h.valueUsd, 0),
      cashHoldings: cash,
      investmentHoldings: investments };
  }, [tokenHoldings]);

  // Calculate real daily change from token holdings
  const dailyChange = useMemo(() => {
    if (!tokenHoldings || tokenHoldings.length === 0) return 0;
    let totalChange = 0;
    tokenHoldings.forEach(token => {
      if (token.valueUsd > 0 && token.change24h) {
        totalChange += (token.change24h * token.valueUsd) / (portfolioValue || 1);
      }
    });
    return totalChange;
  }, [tokenHoldings, portfolioValue]);

  const dailyChangeAmount = Math.abs(dailyChange * portfolioValue / 100);
  const isPositive = dailyChange >= 0;
  const chartColor = isPositive ? positiveColor : negativeColor;

  // Build token filter list from actual holdings
  const tokenFilters = useMemo(() => {
    const filters: Array<{ id: string; symbol: string; name: string; icon: string | null }> = [
      { id: 'all', symbol: 'ALL', name: 'All Tokens', icon: null }
    ];
    if (tokenHoldings) {
      tokenHoldings.slice(0, 5).forEach(token => {
        filters.push({
          id: token.mint,
          symbol: token.symbol,
          name: token.name || token.symbol,
          icon: token.logoUri || null });
      });
    }
    return filters;
  }, [tokenHoldings]);

  // Filter holdings based on selection
  const displayedHoldings = useMemo(() => {
    if (!tokenHoldings) return [];
    if (selectedFilter === 'all') return tokenHoldings;
    return tokenHoldings.filter(h => h.mint === selectedFilter);
  }, [tokenHoldings, selectedFilter]);

  // Displayed balance for current filter
  const displayedBalance = useMemo(() => {
    if (selectedFilter === 'all') return portfolioValue;
    const token = tokenHoldings?.find(h => h.mint === selectedFilter);
    return token?.valueUsd || 0;
  }, [selectedFilter, tokenHoldings, portfolioValue]);

  // Format date for display
  const formattedDate = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric' }) + ', at ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false });
  }, []);

  // Chart paths
  const { path: linePath, lastPoint } = createChartPath(chartData, CHART_WIDTH, CHART_HEIGHT);
  const areaPath = createAreaPath(linePath, CHART_WIDTH, CHART_HEIGHT, chartData.length);

  // Drawer gesture handlers
  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const notifyDrawerChange = useCallback((open: boolean) => {
    setIsDrawerOpen(open);
  }, []);

  const panGesture = Gesture.Pan()
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

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drawerTranslateY.value }] }));

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

  const timePeriods: TimePeriod[] = ['H', 'D', 'W', 'M', 'Y', 'Max'];

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Dynamic ambient background gradient - matches home screen */}
      <View style={styles.ambientGradient}>
        <LinearGradient
          colors={isDark
            ? isPositive
              ? ['transparent', 'rgba(16, 185, 129, 0.12)']
              : ['transparent', 'rgba(239, 68, 68, 0.10)']
            : isPositive
              ? ['transparent', 'rgba(16, 185, 129, 0.08)']
              : ['transparent', 'rgba(239, 68, 68, 0.06)']
          }
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Hero Section - Above Drawer */}
      <View style={[styles.heroSection, { paddingTop: topInset + 24 }]}>
        <ThemedText style={[styles.portfolioLabel, { color: mutedColor }]}>
          Your Portfolio
        </ThemedText>

        <AnimatedCounter
          value={portfolioValue}
          prefix="$ "
          decimals={2}
          style={styles.portfolioValue}
        />

        {/* Daily Change Badge */}
        <View style={styles.changeContainer}>
          <View
            style={[
              styles.changeBadge,
              { backgroundColor: isPositive ? `${positiveColor}20` : `${negativeColor}20` },
            ]}
          >
            <ThemedText
              style={[styles.changePercent, { color: isPositive ? positiveColor : negativeColor }]}
            >
              {isPositive ? '+' : ''}{dailyChange.toFixed(2)}%
            </ThemedText>
          </View>
          <ThemedText style={[styles.changeAmount, { color: mutedColor }]}>
            ($ {dailyChangeAmount.toFixed(2)}) Today
          </ThemedText>
        </View>

        {/* Summary Card - Cash | Investments (Expandable) */}
        <PressableScale
          style={styles.summaryPressable}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsSummaryExpanded(!isSummaryExpanded);
          }}
        >
          <ThemedView
            style={[
              styles.summaryPill,
              { borderColor, borderRadius: isSummaryExpanded ? 16 : 999 }
            ]}
            lightColor="#f4f4f5"
            darkColor="#1a1f25"
          >
            <View style={styles.summaryContent}>
              <View style={styles.summaryHalf}>
                <Ionicons name="wallet-outline" size={18} color={positiveColor} />
                <View style={styles.summaryTextGroup}>
                  <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>Cash</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    $ {cashTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </ThemedText>
                </View>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: borderColor }]} />
              <View style={styles.summaryHalf}>
                <Ionicons name="trending-up-outline" size={18} color={primaryColor} />
                <View style={styles.summaryTextGroup}>
                  <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>Investments</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    $ {investmentsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Expanded Content - Balance Distribution */}
            {isSummaryExpanded && portfolioValue > 0 && (
              <View style={[styles.summaryExpandedContent, { borderTopColor: borderColor }]}>
                <View style={[styles.balanceBarTrack, { backgroundColor: `${mutedColor}30` }]}>
                  <View
                    style={[
                      styles.balanceBarFill,
                      {
                        width: `${Math.min((cashTotal / portfolioValue) * 100, 100)}%`,
                        backgroundColor: positiveColor
                      }
                    ]}
                  />
                </View>
                <View style={styles.balanceBarLabels}>
                  <ThemedText style={[styles.balanceBarLabel, { color: positiveColor }]}>
                    {((cashTotal / portfolioValue) * 100).toFixed(0)}% cash
                  </ThemedText>
                  <ThemedText style={[styles.balanceBarLabel, { color: mutedColor }]}>
                    {((investmentsTotal / portfolioValue) * 100).toFixed(0)}% invested
                  </ThemedText>
                </View>
              </View>
            )}
          </ThemedView>
        </PressableScale>

      </View>

      {/* Draggable Drawer */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: drawerBg,
              borderTopColor: borderColor,
              height: drawerOpenHeight,
              top: SCREEN_HEIGHT - DRAWER_CLOSED_HEIGHT - insets.bottom },
            drawerAnimatedStyle,
          ]}
        >
          {/* Drawer Handle */}
          <PressableScale style={styles.drawerHandle} onPress={handleDrawerToggle}>
            <View style={[styles.drawerHandleBar, { backgroundColor: mutedColor }]} />
          </PressableScale>

          <ScrollView
              style={styles.drawerContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              {/* Token Filter Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterPillsContainer}
              >
                {tokenFilters.map((filter) => {
                  const isSelected = selectedFilter === filter.id;
                  return (
                    <PressableScale
                      key={filter.id}
                      onPress={() => { setSelectedFilter(filter.id); Haptics.selectionAsync(); }}
                      style={[
                        styles.filterPill,
                        { backgroundColor: isSelected ? cardBg : 'transparent', borderColor: isSelected ? borderColor : 'transparent' },
                      ]}
                    >
                      {filter.id === 'all' ? (
                        <LinearGradient
                          colors={[primaryColor, '#10b981']}
                          style={styles.filterPillIconAll}
                        >
                          <ThemedText style={styles.filterPillIconAllText}>A</ThemedText>
                        </LinearGradient>
                      ) : filter.icon ? (
                        <Image source={{ uri: filter.icon }} style={styles.filterPillIcon} />
                      ) : (
                        <View style={[styles.filterPillIconPlaceholder, { backgroundColor: cardBg }]}>
                          <ThemedText style={styles.filterPillIconText}>{filter.symbol.charAt(0)}</ThemedText>
                        </View>
                      )}
                      {isSelected && (
                        <ThemedText style={styles.filterPillLabel}>{filter.name}</ThemedText>
                      )}
                    </PressableScale>
                  );
                })}
                <PressableScale style={[styles.filterPillMore, { backgroundColor: cardBg, borderColor }]}>
                  <Ionicons name="chevron-forward" size={14} color={mutedColor} />
                </PressableScale>
              </ScrollView>

              {/* Filtered Balance & Date */}
              <View style={styles.balanceSection}>
                <ThemedText style={styles.filteredBalance}>
                  $ {displayedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={[styles.balanceDate, { color: textColor }]}>
                  {isPositive ? '+' : ''}{dailyChange.toFixed(2)}% {formattedDate}
                </ThemedText>
              </View>

              {/* Performance Chart */}
              <View style={styles.chartContainer}>
                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                  <Defs>
                    <SvgLinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={chartColor} stopOpacity="0.3" />
                      <Stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                    </SvgLinearGradient>
                  </Defs>
                  <Path d={areaPath} fill="url(#chartGradient)" />
                  <Path d={linePath} stroke={chartColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Current point indicator */}
                  <Circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={chartColor} stroke={drawerBg} strokeWidth={2} />
                </Svg>
              </View>

              {/* Time Period Selector */}
              <View style={[styles.timePeriodSelector, { backgroundColor: cardBg }]}>
                {timePeriods.map((period) => (
                  <PressableScale
                    key={period}
                    onPress={() => { setSelectedPeriod(period); Haptics.selectionAsync(); }}
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
                  </PressableScale>
                ))}
              </View>

              {/* Holdings List - Grouped by Cash and Investments */}
              <View style={styles.holdingsSection}>
                {tokensLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <ThemedText style={[styles.loadingText, { color: mutedColor }]}>Loading holdings...</ThemedText>
                  </View>
                ) : selectedFilter !== 'all' ? (
                  // Filtered view - show specific token
                  <>
                    <View style={styles.holdingsHeader}>
                      <ThemedText style={[styles.holdingsTitle, { color: textColor }]}>Holdings</ThemedText>
                    </View>
                    {displayedHoldings.map((token) => (
                      <PressableScale
                        key={token.mint}
                        style={styles.tokenRow}
                        onPress={() => {
                          Haptics.selectionAsync();
                          router.push({
                            pathname: '/token-detail',
                            params: {
                              id: token.mint,
                              symbol: token.symbol,
                              name: token.name || token.symbol,
                              price: token.priceUsd.toString(),
                              change24h: (token.change24h || 0).toString(),
                              logoUri: token.logoUri || '',
                              balance: token.balanceFormatted.toString(),
                              value: token.valueUsd.toString() } });
                        }}
                      >
                        <View style={[styles.tokenIcon, { backgroundColor: cardBg }]}>
                          {token.logoUri ? (
                            <Image source={{ uri: token.logoUri }} style={styles.tokenIconImage} />
                          ) : (
                            <ThemedText style={styles.tokenIconText}>{token.symbol.charAt(0)}</ThemedText>
                          )}
                        </View>
                        <View style={styles.tokenInfo}>
                          <ThemedText style={styles.tokenName}>{token.name || token.symbol}</ThemedText>
                          <View style={styles.tokenPriceRow}>
                            <ThemedText style={[styles.tokenPrice, { color: mutedColor }]}>
                              $ {token.priceUsd < 1 ? token.priceUsd.toFixed(6) : token.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.tokenChange,
                                { color: (token.change24h || 0) >= 0 ? positiveColor : negativeColor },
                              ]}
                            >
                              {(token.change24h || 0) >= 0 ? '+' : ''}{(token.change24h || 0).toFixed(2)}%
                            </ThemedText>
                          </View>
                        </View>
                        <View style={styles.tokenValue}>
                          <ThemedText style={styles.tokenHoldings}>
                            {token.balanceFormatted.toLocaleString()}
                          </ThemedText>
                          <ThemedText style={[styles.tokenFiatValue, { color: mutedColor }]}>
                            $ {token.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </ThemedText>
                        </View>
                      </PressableScale>
                    ))}
                  </>
                ) : (cashHoldings.length > 0 || investmentHoldings.length > 0) ? (
                  // Grouped view - show Cash and Investments sections
                  <>
                    {/* Cash Section */}
                    {cashHoldings.length > 0 && (
                      <>
                        <View style={styles.holdingsHeader}>
                          <View style={styles.holdingsHeaderLeft}>
                            <Ionicons name="wallet-outline" size={16} color={positiveColor} />
                            <ThemedText style={[styles.holdingsTitle, { color: textColor }]}>Cash</ThemedText>
                          </View>
                          <ThemedText style={[styles.holdingsSubtotal, { color: mutedColor }]}>
                            $ {cashTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </ThemedText>
                        </View>
                        {cashHoldings.map((token) => (
                          <PressableScale
                            key={token.mint}
                            style={styles.tokenRow}
                            onPress={() => {
                              Haptics.selectionAsync();
                              router.push({
                                pathname: '/token-detail',
                                params: {
                                  id: token.mint,
                                  symbol: token.symbol,
                                  name: token.name || token.symbol,
                                  price: token.priceUsd.toString(),
                                  change24h: (token.change24h || 0).toString(),
                                  logoUri: token.logoUri || '',
                                  balance: token.balanceFormatted.toString(),
                                  value: token.valueUsd.toString() } });
                            }}
                          >
                            <View style={[styles.tokenIcon, { backgroundColor: cardBg }]}>
                              {token.logoUri ? (
                                <Image source={{ uri: token.logoUri }} style={styles.tokenIconImage} />
                              ) : (
                                <ThemedText style={styles.tokenIconText}>{token.symbol.charAt(0)}</ThemedText>
                              )}
                            </View>
                            <View style={styles.tokenInfo}>
                              <ThemedText style={styles.tokenName}>{token.name || token.symbol}</ThemedText>
                              <ThemedText style={[styles.primaryAssetLabel, { color: positiveColor }]}>
                                Primary spending asset
                              </ThemedText>
                            </View>
                            <View style={styles.tokenValue}>
                              <ThemedText style={styles.tokenHoldings}>
                                {token.balanceFormatted.toLocaleString()}
                              </ThemedText>
                              <ThemedText style={[styles.tokenFiatValue, { color: mutedColor }]}>
                                $ {token.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </ThemedText>
                            </View>
                          </PressableScale>
                        ))}
                      </>
                    )}

                    {/* Investments Section */}
                    {investmentHoldings.length > 0 && (
                      <>
                        <View style={[styles.holdingsHeader, cashHoldings.length > 0 && { marginTop: 20 }]}>
                          <View style={styles.holdingsHeaderLeft}>
                            <Ionicons name="trending-up-outline" size={16} color={primaryColor} />
                            <ThemedText style={[styles.holdingsTitle, { color: textColor }]}>Investments</ThemedText>
                          </View>
                          <ThemedText style={[styles.holdingsSubtotal, { color: mutedColor }]}>
                            $ {investmentsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </ThemedText>
                        </View>
                        {investmentHoldings.map((token) => (
                          <PressableScale
                            key={token.mint}
                            style={styles.tokenRow}
                            onPress={() => {
                              Haptics.selectionAsync();
                              router.push({
                                pathname: '/token-detail',
                                params: {
                                  id: token.mint,
                                  symbol: token.symbol,
                                  name: token.name || token.symbol,
                                  price: token.priceUsd.toString(),
                                  change24h: (token.change24h || 0).toString(),
                                  logoUri: token.logoUri || '',
                                  balance: token.balanceFormatted.toString(),
                                  value: token.valueUsd.toString() } });
                            }}
                          >
                            <View style={[styles.tokenIcon, { backgroundColor: cardBg }]}>
                              {token.logoUri ? (
                                <Image source={{ uri: token.logoUri }} style={styles.tokenIconImage} />
                              ) : (
                                <ThemedText style={styles.tokenIconText}>{token.symbol.charAt(0)}</ThemedText>
                              )}
                            </View>
                            <View style={styles.tokenInfo}>
                              <ThemedText style={styles.tokenName}>{token.name || token.symbol}</ThemedText>
                              <View style={styles.tokenPriceRow}>
                                <ThemedText style={[styles.tokenPrice, { color: mutedColor }]}>
                                  $ {token.priceUsd < 1 ? token.priceUsd.toFixed(6) : token.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </ThemedText>
                                <ThemedText
                                  style={[
                                    styles.tokenChange,
                                    { color: (token.change24h || 0) >= 0 ? positiveColor : negativeColor },
                                  ]}
                                >
                                  {(token.change24h || 0) >= 0 ? '+' : ''}{(token.change24h || 0).toFixed(2)}%
                                </ThemedText>
                              </View>
                            </View>
                            <View style={styles.tokenValue}>
                              <ThemedText style={styles.tokenHoldings}>
                                {token.balanceFormatted.toLocaleString()}
                              </ThemedText>
                              <ThemedText style={[styles.tokenFiatValue, { color: mutedColor }]}>
                                $ {token.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </ThemedText>
                            </View>
                          </PressableScale>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <View style={[styles.emptyStateIcon, { backgroundColor: `${primaryColor}10` }]}>
                      <Ionicons name="shield-checkmark-outline" size={32} color={primaryColor} />
                    </View>
                    <ThemedText style={styles.emptyStateTitle}>Your wallet is ready</ThemedText>
                    <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                      {walletAddress ? 'Add funds to get started. Your assets will appear here safely.' : 'Connect your wallet to see your holdings'}
                    </ThemedText>
                  </View>
                )}
              </View>
            </ScrollView>
        </Animated.View>
      </GestureDetector>
    </ThemedView>
  );
}

export default function PortfolioScreen() {
  return <PortfolioScreenContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  ambientGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
    pointerEvents: 'none' },

  // Hero Section
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20 },
  portfolioLabel: {
    fontSize: 14,
    marginBottom: 4 },
  portfolioValue: {
    fontSize: 40,
    fontWeight: '600',
    letterSpacing: -1 },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8 },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12 },
  changePercent: {
    fontSize: 13,
    fontWeight: '600' },
  changeAmount: {
    fontSize: 13 },

  // Summary Pill
  summaryPressable: {
    alignSelf: 'stretch',
    marginTop: 20 },
  summaryPill: {
    borderWidth: 1,
    overflow: 'hidden' },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center' },
  summaryHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12 },
  summaryDivider: {
    width: 1,
    height: 32 },
  summaryTextGroup: {
    alignItems: 'center' },
  summaryLabel: {
    fontSize: 12 },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600' },
  summaryExpandedContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1 },
  balanceBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden' },
  balanceBarFill: {
    height: '100%',
    borderRadius: 3 },
  balanceBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8 },
  balanceBarLabel: {
    fontSize: 11 },

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
    zIndex: 50 },
  drawerHandle: {
    alignItems: 'center',
    paddingVertical: 12 },
  drawerHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.3 },
  drawerContent: {
    flex: 1,
    paddingHorizontal: 16 },

  // Filter Pills
  filterPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1 },
  filterPillIconAll: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center' },
  filterPillIconAllText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700' },
  filterPillIcon: {
    width: 24,
    height: 24,
    borderRadius: 12 },
  filterPillIconPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center' },
  filterPillIconText: {
    fontSize: 10,
    fontWeight: '600' },
  filterPillLabel: {
    fontSize: 12,
    fontWeight: '500' },
  filterPillMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1 },

  // Balance Section
  balanceSection: {
    marginTop: 8 },
  filteredBalance: {
    fontSize: 24,
    fontWeight: '600' },
  balanceDate: {
    fontSize: 12,
    marginTop: 2 },

  // Chart
  chartContainer: {
    marginVertical: 16 },

  // Time Period Selector
  timePeriodSelector: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    marginBottom: 16 },
  timePeriodButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 999 },
  timePeriodButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1 },
  timePeriodText: {
    fontSize: 12,
    fontWeight: '500' },

  // Holdings
  holdingsSection: {
    marginBottom: 40 },
  holdingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12 },
  holdingsTitle: {
    fontSize: 14,
    fontWeight: '600' },
  holdingsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 },
  holdingsSubtotal: {
    fontSize: 13,
    fontWeight: '500' },
  primaryAssetLabel: {
    fontSize: 11,
    marginTop: 2 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12 },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden' },
  tokenIconImage: {
    width: 40,
    height: 40 },
  tokenIconText: {
    fontSize: 14,
    fontWeight: '600' },
  tokenInfo: {
    flex: 1 },
  tokenName: {
    fontSize: 14,
    fontWeight: '500' },
  tokenPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2 },
  tokenPrice: {
    fontSize: 12 },
  tokenChange: {
    fontSize: 12 },
  tokenValue: {
    alignItems: 'flex-end' },
  tokenHoldings: {
    fontSize: 14,
    fontWeight: '500' },
  tokenFiatValue: {
    fontSize: 12,
    marginTop: 2 },

  // Loading & Empty States
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12 },
  loadingText: {
    fontSize: 14 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8 },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8 },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600' },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center' } });
