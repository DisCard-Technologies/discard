import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Dimensions, ActivityIndicator, Image } from 'react-native';
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
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopBar } from '@/components/top-bar';
import { AnimatedCounter } from '@/components/animated-counter';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth, useCurrentUserId } from '@/stores/authConvex';
import { useCards } from '@/stores/cardsConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { positiveColor, negativeColor } from '@/constants/theme';

// Props for the content component when used in pager
export interface PortfolioScreenContentProps {
  onNavigateToHome?: () => void;
  onNavigateToCard?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 48;
const CHART_HEIGHT = 100;

type TabType = 'tokens' | 'predictions';
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
const DRAWER_OPEN_HEIGHT = SCREEN_HEIGHT - 100;
const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 1 };

export function PortfolioScreenContent({ onNavigateToHome, onNavigateToCard }: PortfolioScreenContentProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const drawerBg = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');

  // Real data from hooks
  const { user } = useAuth();
  const { state: cardsState } = useCards();
  const walletAddress = user?.solanaAddress || null;
  const cardCount = cardsState?.cards?.length || 0;

  const {
    holdings: tokenHoldings,
    totalValue: tokenTotal,
    isLoading: tokensLoading
  } = useTokenHoldings(walletAddress);

  // State
  const [activeTab, setActiveTab] = useState<TabType>('tokens');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('D');
  const [chartData] = useState(() => generateChartData());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Drawer animation
  const drawerTranslateY = useSharedValue(0);
  const startDragY = useSharedValue(0);
  const maxTranslate = -(DRAWER_OPEN_HEIGHT - DRAWER_CLOSED_HEIGHT);

  // Calculate portfolio values
  const portfolioValue = tokenTotal || 0;
  const predictionsValue = 0; // Placeholder for predictions

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
          icon: token.logoUri || null,
        });
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
      year: 'numeric',
    }) + ', at ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
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

  // Navigation handlers
  const handlePortfolioTap = onNavigateToHome || (() => {});
  const handleCardTap = onNavigateToCard || (() => router.push('/card'));

  const timePeriods: TimePeriod[] = ['H', 'D', 'W', 'M', 'Y', 'Max'];

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Dynamic ambient background gradient */}
      <LinearGradient
        colors={isPositive
          ? ['rgba(16,185,129,0.15)', 'rgba(16,185,129,0.05)', 'transparent']
          : ['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.05)', 'transparent']
        }
        style={styles.ambientGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={{ height: insets.top }} />

      {/* Top Bar */}
      <TopBar
        walletAddress={walletAddress || ''}
        onPortfolioTap={handlePortfolioTap}
        onCardTap={handleCardTap}
        cardCount={cardCount}
      />

      {/* Hero Section - Above Drawer */}
      <View style={styles.heroSection}>
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

        {/* Summary Card - Pill Style */}
        <View style={[styles.summaryPill, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.summaryHalf}>
            <Ionicons name="diamond-outline" size={18} color={mutedColor} />
            <View style={styles.summaryTextGroup}>
              <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>All Tokens</ThemedText>
              <ThemedText style={styles.summaryValue}>
                $ {portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </View>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: borderColor }]} />
          <View style={styles.summaryHalf}>
            <Ionicons name="trending-up-outline" size={18} color={mutedColor} />
            <View style={styles.summaryTextGroup}>
              <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>Predictions</ThemedText>
              <ThemedText style={styles.summaryValue}>
                $ {predictionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>

      {/* Draggable Drawer */}
      <GestureDetector gesture={panGesture}>
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
          {/* Drawer Handle */}
          <Pressable style={styles.drawerHandle} onPress={handleDrawerToggle}>
            <View style={[styles.drawerHandleBar, { backgroundColor: mutedColor }]} />
          </Pressable>

          {/* Tab Toggle */}
          <View style={[styles.tabToggle, { backgroundColor: cardBg }]}>
            <Pressable
              onPress={() => { setActiveTab('tokens'); Haptics.selectionAsync(); }}
              style={[
                styles.tabButton,
                activeTab === 'tokens' && [styles.tabButtonActive, { backgroundColor: drawerBg }],
              ]}
            >
              <ThemedText
                style={[
                  styles.tabButtonText,
                  { color: activeTab === 'tokens' ? textColor : mutedColor },
                ]}
              >
                Tokens
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => { setActiveTab('predictions'); Haptics.selectionAsync(); }}
              style={[
                styles.tabButton,
                activeTab === 'predictions' && [styles.tabButtonActive, { backgroundColor: drawerBg }],
              ]}
            >
              <ThemedText
                style={[
                  styles.tabButtonText,
                  { color: activeTab === 'predictions' ? textColor : mutedColor },
                ]}
              >
                Predictions
              </ThemedText>
            </Pressable>
          </View>

          {activeTab === 'tokens' ? (
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
                    <Pressable
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
                    </Pressable>
                  );
                })}
                <Pressable style={[styles.filterPillMore, { backgroundColor: cardBg, borderColor }]}>
                  <Ionicons name="chevron-forward" size={14} color={mutedColor} />
                </Pressable>
              </ScrollView>

              {/* Filtered Balance & Date */}
              <View style={styles.balanceSection}>
                <ThemedText style={styles.filteredBalance}>
                  $ {displayedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={[styles.balanceDate, { color: isPositive ? positiveColor : negativeColor }]}>
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
                  <Pressable
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
                  </Pressable>
                ))}
              </View>

              {/* Holdings List */}
              <View style={styles.holdingsSection}>
                <View style={styles.holdingsHeader}>
                  <ThemedText style={[styles.holdingsTitle, { color: textColor }]}>Holdings</ThemedText>
                  <Ionicons name="chevron-up" size={16} color={primaryColor} />
                </View>

                {tokensLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <ThemedText style={[styles.loadingText, { color: mutedColor }]}>Loading holdings...</ThemedText>
                  </View>
                ) : displayedHoldings.length > 0 ? (
                  displayedHoldings.map((token) => (
                    <Pressable
                      key={token.mint}
                      style={styles.tokenRow}
                      onPress={() => Haptics.selectionAsync()}
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
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <View style={[styles.emptyStateIcon, { backgroundColor: `${primaryColor}10` }]}>
                      <Ionicons name="diamond-outline" size={32} color={primaryColor} />
                    </View>
                    <ThemedText style={styles.emptyStateTitle}>No holdings yet</ThemedText>
                    <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                      {walletAddress ? 'Your token holdings will appear here' : 'Connect your wallet to see holdings'}
                    </ThemedText>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : (
            /* Predictions Tab - Placeholder */
            <View style={styles.predictionsPlaceholder}>
              <View style={[styles.predictionsIcon, { backgroundColor: cardBg }]}>
                <Ionicons name="trending-up" size={32} color={mutedColor} />
              </View>
              <ThemedText style={styles.predictionsTitle}>Predictions Coming Soon</ThemedText>
              <ThemedText style={[styles.predictionsText, { color: mutedColor }]}>
                Track your market predictions and forecast positions here.
              </ThemedText>
            </View>
          )}
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
    flex: 1,
  },
  ambientGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },

  // Hero Section
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  portfolioLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  portfolioValue: {
    fontSize: 40,
    fontWeight: '600',
    letterSpacing: -1,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changePercent: {
    fontSize: 13,
    fontWeight: '600',
  },
  changeAmount: {
    fontSize: 13,
  },

  // Summary Pill
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  summaryDivider: {
    width: 1,
    height: 32,
  },
  summaryTextGroup: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
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
    paddingHorizontal: 16,
  },

  // Tab Toggle
  tabToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Filter Pills
  filterPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillIconAll: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillIconAllText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  filterPillIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  filterPillIconPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillIconText: {
    fontSize: 10,
    fontWeight: '600',
  },
  filterPillLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterPillMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Balance Section
  balanceSection: {
    marginTop: 8,
  },
  filteredBalance: {
    fontSize: 24,
    fontWeight: '600',
  },
  balanceDate: {
    fontSize: 12,
    marginTop: 2,
  },

  // Chart
  chartContainer: {
    marginVertical: 16,
  },

  // Time Period Selector
  timePeriodSelector: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  timePeriodButton: {
    flex: 1,
    paddingVertical: 8,
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
    fontSize: 12,
    fontWeight: '500',
  },

  // Holdings
  holdingsSection: {
    marginBottom: 40,
  },
  holdingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  holdingsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  tokenIconImage: {
    width: 40,
    height: 40,
  },
  tokenIconText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tokenInfo: {
    flex: 1,
  },
  tokenName: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  tokenPrice: {
    fontSize: 12,
  },
  tokenChange: {
    fontSize: 12,
  },
  tokenValue: {
    alignItems: 'flex-end',
  },
  tokenHoldings: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenFiatValue: {
    fontSize: 12,
    marginTop: 2,
  },

  // Predictions Placeholder
  predictionsPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  predictionsIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  predictionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  predictionsText: {
    fontSize: 14,
    textAlign: 'center',
  },

  // Loading & Empty States
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
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
