import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Dimensions, Keyboard, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopBar } from '@/components/top-bar';
import { CommandBar } from '@/components/command-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth, useCurrentUserId } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { positiveColor, negativeColor } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 180;

type ViewMode = 'wallets' | 'strategy';

// Wallet avatars for the filter row
interface WalletAvatar {
  id: string;
  label: string;
  color: string;
  isAll?: boolean;
}

const walletAvatars: WalletAvatar[] = [
  { id: 'all', label: 'A', color: '#10B981', isAll: true },
  { id: 'main', label: '', color: '#3b82f6' },
  { id: 'trading', label: '', color: '#f97316' },
  { id: 'savings', label: '', color: '#8b5cf6' },
  { id: 'defi', label: '', color: '#ef4444' },
];

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
function createChartPath(data: number[], width: number, height: number): string {
  if (data.length === 0) return '';
  
  const minValue = Math.min(...data);
  const maxValue = Math.max(...data);
  const range = maxValue - minValue || 1;
  
  const xStep = width / (data.length - 1);
  const padding = 10;
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
  
  return path;
}

// Create area path for gradient fill
function createAreaPath(data: number[], width: number, height: number): string {
  if (data.length === 0) return '';
  
  const linePath = createChartPath(data, width, height);
  const lastPoint = data.length - 1;
  const xStep = width / (data.length - 1);
  
  return `${linePath} L ${lastPoint * xStep} ${height} L 0 ${height} Z`;
}

// Simple Line Chart Component
function PortfolioChart({ data, primaryColor }: { data: number[]; primaryColor: string }) {
  const linePath = createChartPath(data, CHART_WIDTH, CHART_HEIGHT);
  const areaPath = createAreaPath(data, CHART_WIDTH, CHART_HEIGHT);
  
  return (
    <View style={styles.chartContainer}>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Defs>
          <SvgLinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={primaryColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#chartGradient)" />
        <Path d={linePath} stroke={primaryColor} strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}

export default function StrategyScreen() {
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
    isLoading: tokensLoading
  } = useTokenHoldings(walletAddress);

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('wallets');
  const [selectedWallet, setSelectedWallet] = useState('all');
  const [chartData] = useState(() => generateChartData());

  // Calculate portfolio values
  const walletsValue = tokenTotal || 0;
  const defiStrategyValue = 867.09; // Mock DeFi strategy value
  const totalPortfolioValue = walletsValue + defiStrategyValue;
  
  // Daily change (simulated)
  const dailyChange = 0.25;
  const dailyChangeAmount = 7.39;
  const isPositive = dailyChange >= 0;

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

  const handleMic = () => {};

  // Navigation handlers for TopBar
  const handlePortfolioTap = () => {
    // Already on portfolio screen
  };

  const handleCardTap = () => {
    router.push('/card');
  };

  // Format date for display
  const formattedDate = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) + ', at ' + new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      {/* Top Bar */}
      <TopBar
        walletAddress={walletAddress || ''}
        onPortfolioTap={handlePortfolioTap}
        onCardTap={handleCardTap}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Portfolio Header */}
        <View style={styles.portfolioHeader}>
          <ThemedText style={[styles.portfolioLabel, { color: mutedColor }]}>
            Your Portfolio
          </ThemedText>
          <ThemedText style={styles.portfolioValue}>
            $ {totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </ThemedText>
          
          {/* Daily Change Badge */}
          <View style={styles.changeContainer}>
            <View
              style={[
                styles.changeBadge,
                { backgroundColor: isPositive ? `${positiveColor}30` : `${negativeColor}30` },
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
        </View>

        {/* Summary Cards Row */}
        <View style={styles.summaryCardsRow}>
          {/* All Wallets Card */}
          <Pressable
            style={[styles.summaryCard, { backgroundColor: cardBg }]}
            onPress={() => setViewMode('wallets')}
          >
            <View style={styles.summaryCardHeader}>
              <View style={[styles.summaryCardIcon, { backgroundColor: `${borderColor}` }]}>
                <Ionicons name="wallet-outline" size={16} color={mutedColor} />
              </View>
              <ThemedText style={[styles.summaryCardLabel, { color: mutedColor }]}>
                All Wallets
              </ThemedText>
            </View>
            <ThemedText style={styles.summaryCardValue}>
              $ {walletsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </ThemedText>
          </Pressable>

          {/* DeFi Strategy Card */}
          <Pressable
            style={[styles.summaryCard, { backgroundColor: cardBg }]}
            onPress={() => setViewMode('strategy')}
          >
            <View style={styles.summaryCardHeader}>
              <View style={[styles.summaryCardIcon, { backgroundColor: `${borderColor}` }]}>
                <Ionicons name="flash-outline" size={16} color={primaryColor} />
              </View>
              <ThemedText style={[styles.summaryCardLabel, { color: mutedColor }]}>
                DeFi Strategy
              </ThemedText>
            </View>
            <ThemedText style={styles.summaryCardValue}>
              $ {defiStrategyValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </ThemedText>
          </Pressable>
        </View>

        {/* View Mode Toggle */}
        <View style={[styles.viewToggle, { backgroundColor: cardBg }]}>
          <Pressable
            onPress={() => setViewMode('wallets')}
            style={[
              styles.viewToggleButton,
              viewMode === 'wallets' && styles.viewToggleButtonActive,
            ]}
          >
            <ThemedText
              style={[
                styles.viewToggleText,
                { color: viewMode === 'wallets' ? textColor : mutedColor },
              ]}
            >
              Wallets
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('strategy')}
            style={[
              styles.viewToggleButton,
              viewMode === 'strategy' && styles.viewToggleButtonActive,
            ]}
          >
            <ThemedText
              style={[
                styles.viewToggleText,
                { color: viewMode === 'strategy' ? textColor : mutedColor },
              ]}
            >
              Strategy
            </ThemedText>
          </Pressable>
        </View>

        {/* Wallet Filter Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.walletFilterRow}
        >
          {walletAvatars.map((wallet) => (
            <Pressable
              key={wallet.id}
              onPress={() => setSelectedWallet(wallet.id)}
              style={[
                styles.walletAvatar,
                { backgroundColor: wallet.color },
                selectedWallet === wallet.id && styles.walletAvatarSelected,
              ]}
            >
              {wallet.isAll ? (
                <ThemedText style={styles.walletAvatarText}>{wallet.label}</ThemedText>
              ) : (
                <View style={styles.walletAvatarDot} />
              )}
            </Pressable>
          ))}
          <Pressable style={styles.walletAvatarMore}>
            <Ionicons name="chevron-forward" size={16} color={mutedColor} />
          </Pressable>
        </ScrollView>

        {/* Wallet Value with Date */}
        <View style={styles.walletValueSection}>
          <ThemedText style={styles.walletValueAmount}>
            $ {walletsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </ThemedText>
          <ThemedText style={[styles.walletValueDate, { color: negativeColor }]}>
            -0.48% {formattedDate}
          </ThemedText>
        </View>

        {/* Portfolio Chart */}
        <PortfolioChart data={chartData} primaryColor={primaryColor} />

        {/* Token Holdings (when in wallets mode) */}
        {viewMode === 'wallets' && (
          <View style={styles.holdingsSection}>
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              HOLDINGS
            </ThemedText>
            
            {tokensLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                  Loading holdings...
                </ThemedText>
              </View>
            ) : tokenHoldings && tokenHoldings.length > 0 ? (
              tokenHoldings.slice(0, 5).map((token) => (
                <ThemedView
                  key={token.mint}
                  style={styles.tokenRow}
                  lightColor="#f4f4f5"
                  darkColor="#1c1c1e"
                >
                  <View style={[styles.tokenIcon, { backgroundColor: borderColor }]}>
                    <ThemedText style={styles.tokenIconText}>
                      {token.symbol.charAt(0)}
                    </ThemedText>
                  </View>
                  <View style={styles.tokenInfo}>
                    <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
                    <ThemedText style={[styles.tokenBalance, { color: mutedColor }]}>
                      {token.balanceFormatted.toLocaleString()} {token.symbol}
                    </ThemedText>
                  </View>
                  <View style={styles.tokenValue}>
                    <ThemedText style={styles.tokenValueText}>
                      ${token.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.tokenChange,
                        { color: (token.change24h || 0) >= 0 ? positiveColor : negativeColor },
                      ]}
                    >
                      {(token.change24h || 0) >= 0 ? '+' : ''}
                      {(token.change24h || 0).toFixed(2)}%
                    </ThemedText>
                  </View>
                </ThemedView>
              ))
            ) : (
              <View style={styles.emptyState}>
                <View style={[styles.emptyStateIcon, { backgroundColor: `${primaryColor}10` }]}>
                  <Ionicons name="wallet-outline" size={32} color={primaryColor} />
                </View>
                <ThemedText style={styles.emptyStateTitle}>No holdings yet</ThemedText>
                <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                  {walletAddress ? 'Your token holdings will appear here' : 'Connect your wallet to see holdings'}
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Strategy View */}
        {viewMode === 'strategy' && (
          <View style={styles.strategySection}>
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              ACTIVE STRATEGIES
            </ThemedText>
            
            <ThemedView style={styles.strategyCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
              <View style={styles.strategyCardHeader}>
                <View style={[styles.strategyIcon, { backgroundColor: `${primaryColor}20` }]}>
                  <Ionicons name="trending-up" size={20} color={primaryColor} />
                </View>
                <View style={styles.strategyCardInfo}>
                  <ThemedText style={styles.strategyName}>Yield Optimizer</ThemedText>
                  <ThemedText style={[styles.strategyDescription, { color: mutedColor }]}>
                    Auto-compound yields across DeFi protocols
                  </ThemedText>
                </View>
              </View>
              <View style={styles.strategyCardFooter}>
                <View>
                  <ThemedText style={[styles.strategyStatLabel, { color: mutedColor }]}>APY</ThemedText>
                  <ThemedText style={[styles.strategyStatValue, { color: positiveColor }]}>+12.4%</ThemedText>
                </View>
                <View>
                  <ThemedText style={[styles.strategyStatLabel, { color: mutedColor }]}>Deposited</ThemedText>
                  <ThemedText style={styles.strategyStatValue}>$867.09</ThemedText>
                </View>
                <View>
                  <ThemedText style={[styles.strategyStatLabel, { color: mutedColor }]}>Earned</ThemedText>
                  <ThemedText style={[styles.strategyStatValue, { color: positiveColor }]}>+$42.15</ThemedText>
                </View>
              </View>
            </ThemedView>

            <Pressable
              style={[styles.addStrategyButton, { borderColor: primaryColor }]}
              onPress={() => Alert.alert('Add Strategy', 'Explore DeFi strategies')}
            >
              <Ionicons name="add" size={20} color={primaryColor} />
              <ThemedText style={[styles.addStrategyText, { color: primaryColor }]}>
                Explore Strategies
              </ThemedText>
            </Pressable>
          </View>
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
  
  // Portfolio Header
  portfolioHeader: {
    alignItems: 'center',
    paddingVertical: 16,
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

  // Summary Cards
  summaryCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  summaryCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCardLabel: {
    fontSize: 12,
  },
  summaryCardValue: {
    fontSize: 18,
    fontWeight: '600',
  },

  // View Toggle
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginTop: 20,
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  viewToggleButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Wallet Filter
  walletFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  walletAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletAvatarSelected: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  walletAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  walletAvatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  walletAvatarMore: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Wallet Value
  walletValueSection: {
    marginBottom: 8,
  },
  walletValueAmount: {
    fontSize: 28,
    fontWeight: '600',
  },
  walletValueDate: {
    fontSize: 12,
    marginTop: 2,
  },

  // Chart
  chartContainer: {
    marginVertical: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Holdings Section
  holdingsSection: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tokenIconText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tokenInfo: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenBalance: {
    fontSize: 12,
    marginTop: 2,
  },
  tokenValue: {
    alignItems: 'flex-end',
  },
  tokenValueText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenChange: {
    fontSize: 12,
    marginTop: 2,
  },

  // Strategy Section
  strategySection: {
    marginTop: 16,
    gap: 12,
  },
  strategyCard: {
    padding: 16,
    borderRadius: 16,
  },
  strategyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  strategyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strategyCardInfo: {
    flex: 1,
  },
  strategyName: {
    fontSize: 16,
    fontWeight: '600',
  },
  strategyDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  strategyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  strategyStatLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  strategyStatValue: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  addStrategyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addStrategyText: {
    fontSize: 14,
    fontWeight: '500',
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
