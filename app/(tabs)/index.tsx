import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, Pressable, Keyboard, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopBar } from '@/components/top-bar';
import { AnimatedCounter } from '@/components/animated-counter';
import { TransactionStack, StackTransaction } from '@/components/transaction-stack';
import { QuickActions } from '@/components/quick-actions';
import { DraggableDrawer } from '@/components/draggable-drawer';
import { GoalsSection, Goal } from '@/components/goal-item';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useFunding } from '@/stores/fundingConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { positiveColor, negativeColor } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Drawer dimensions
const DRAWER_CLOSED_HEIGHT = 220;
const DRAWER_OPEN_HEIGHT = 380;

// Props for the content component when used in pager
export interface HomeScreenContentProps {
  onNavigateToStrategy?: () => void;
  onNavigateToCard?: () => void;
}

export function HomeScreenContent({ onNavigateToStrategy, onNavigateToCard }: HomeScreenContentProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  // Real data from stores
  const { user } = useAuth();
  const { state: fundingState } = useFunding();
  const { totalValue: cryptoValue } = useTokenHoldings(user?.solanaAddress || null);

  // Calculate net worth from funding balance + crypto holdings
  const netWorth = useMemo(() => {
    const accountBalance = fundingState?.accountBalance?.availableBalance || 0;
    const cryptoTotal = cryptoValue || 0;
    return (accountBalance / 100) + cryptoTotal;
  }, [fundingState?.accountBalance, cryptoValue]);

  // Get token holdings for daily change calculation
  const { holdings } = useTokenHoldings(user?.solanaAddress || null);

  // Calculate daily change from holdings (weighted by value)
  const { dailyChange, dailyChangeAmount } = useMemo(() => {
    if (!holdings || holdings.length === 0 || netWorth === 0) {
      return { dailyChange: 0, dailyChangeAmount: 0 };
    }

    // Calculate weighted average of 24h change
    let totalWeightedChange = 0;
    let totalValue = 0;

    holdings.forEach((h) => {
      if (h.valueUsd > 0 && typeof h.change24h === 'number') {
        totalWeightedChange += h.change24h * h.valueUsd;
        totalValue += h.valueUsd;
      }
    });

    const avgChange = totalValue > 0 ? totalWeightedChange / totalValue : 0;
    const changeAmount = (avgChange / 100) * netWorth;

    return {
      dailyChange: Math.round(avgChange * 100) / 100,
      dailyChangeAmount: Math.abs(Math.round(changeAmount * 100) / 100),
    };
  }, [holdings, netWorth]);

  const isPositive = dailyChange >= 0;

  // Real transaction data from Convex
  const recentTransfers = useQuery(api.transfers.transfers.getRecent, { limit: 5 });

  // Transform transfers to StackTransaction format
  const transactions: StackTransaction[] = useMemo(() => {
    if (!recentTransfers || recentTransfers.length === 0) {
      return [];
    }

    return recentTransfers.map((transfer) => {
      // Format address for display
      const addr = transfer.recipientAddress;
      const shortAddr = addr.length > 10 
        ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
        : addr;

      // Format amount
      const amount = transfer.amount / Math.pow(10, transfer.tokenDecimals);
      const formattedAmount = amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: transfer.tokenDecimals > 2 ? 4 : 2,
      });

      // Calculate total fee
      const totalFee = transfer.networkFee + transfer.platformFee + (transfer.priorityFee || 0);
      const feeFormatted = totalFee > 0 ? `$${(totalFee / 100).toFixed(2)}` : undefined;

      return {
        id: transfer._id,
        type: 'send' as const,
        address: transfer.recipientDisplayName || shortAddr,
        tokenAmount: `-${formattedAmount} ${transfer.token}`,
        fiatValue: `$${(transfer.amountUsd / 100).toFixed(2)}`,
        fee: feeFormatted,
      };
    });
  }, [recentTransfers]);

  // Real goals from Convex
  const convexGoals = useQuery(api.goals.goals.list, {});

  // Transform Convex goals to Goal format for UI
  const goals = useMemo((): Goal[] => {
    if (!convexGoals || convexGoals.length === 0) {
      return [];
    }

    // Map goal type to icon
    const typeToIcon: Record<string, keyof typeof Ionicons.glyphMap> = {
      savings: 'wallet-outline',
      accumulate: 'analytics-outline',
      yield: 'trending-up-outline',
      custom: 'star-outline',
    };

    // Map goal type to color
    const typeToColor: Record<string, string> = {
      savings: '#10B981', // green
      accumulate: '#f97316', // orange
      yield: '#3b82f6', // blue
      custom: '#8b5cf6', // purple
    };

    return convexGoals.map((g) => ({
      id: g._id,
      title: g.title,
      target: g.targetAmount / 100, // Convert cents to dollars
      current: g.currentAmount / 100, // Convert cents to dollars
      icon: typeToIcon[g.type] || 'star-outline',
      color: typeToColor[g.type] || '#8b5cf6',
      deadline: g.deadline
        ? new Date(g.deadline).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : undefined,
    }));
  }, [convexGoals]);

  // Backdrop overlay animation
  const backdropOpacity = useSharedValue(0);
  const [isCommandBarFocused, setIsCommandBarFocused] = useState(false);

  const handleCommandBarFocusChange = (focused: boolean) => {
    setIsCommandBarFocused(focused);
    backdropOpacity.value = withTiming(focused ? 1 : 0, { duration: 200 });
  };

  const handleBackdropPress = () => {
    Keyboard.dismiss();
    setIsCommandBarFocused(false);
    backdropOpacity.value = withTiming(0, { duration: 200 });
  };

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? 'auto' : 'none',
  }));

  // Real wallet address from auth
  const walletAddress = user?.solanaAddress || '7F3a...8b2E';

  // Navigation handlers for top bar - use callbacks if provided, otherwise use router
  const handlePortfolioTap = onNavigateToStrategy || (() => router.push('/strategy'));
  const handleCardTap = onNavigateToCard || (() => router.push('/card'));

  // Quick action handlers
  const handleSend = () => router.push('/(tabs)/transfer');
  const handleReceive = () => router.push('/receive');
  const handleSwap = () => router.push('/swap');
  const handleScanQR = () => router.push('/transfer/scan');

  const handleTransactionTap = (tx: StackTransaction) => {
    // Transaction details - could navigate to explorer or detail page
    console.log('[Home] Transaction tapped:', tx.id, tx.type);
  };

  const handleGoalPress = (goal: Goal) => {
    // Goal detail - could show goal progress or edit modal
    console.log('[Home] Goal tapped:', goal.id, goal.title);
  };

  const handleAddGoal = () => {
    // Goal creation is now handled by the unified dock in the tab bar
  };

  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Ambient gradient background */}
      <View style={styles.ambientGradient}>
        <LinearGradient
          colors={isDark 
            ? ['rgba(16, 185, 129, 0.08)', 'transparent'] 
            : ['rgba(16, 185, 129, 0.05)', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
        />
      </View>
      
      {/* Safe area for top (status bar) */}
      <View style={{ height: insets.top }} />

      {/* Top Bar */}
      <TopBar
        walletAddress={walletAddress}
        onPortfolioTap={handlePortfolioTap}
        onCardTap={handleCardTap}
      />

      {/* Main Content */}
      <View style={styles.content}>
        {/* Hero Section - Balance Display */}
        <View style={styles.heroSection}>
          <AnimatedCounter value={netWorth} prefix="$" style={styles.balanceText} />

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
            <ThemedText style={styles.changeAmount}>
              (${dailyChangeAmount.toFixed(2)}) Today
            </ThemedText>
          </View>
        </View>

        {/* Transaction Stack */}
        <TransactionStack transactions={transactions} onTransactionTap={handleTransactionTap} />

        {/* Quick Actions */}
        <QuickActions
          onSend={handleSend}
          onReceive={handleReceive}
          onSwap={handleSwap}
          onScanQR={handleScanQR}
        />
      </View>

      {/* Gradient overlay before drawer */}
      <LinearGradient
        colors={isDark ? ['transparent', '#0f1419'] : ['transparent', '#ffffff']}
        style={[styles.drawerGradient, { bottom: DRAWER_CLOSED_HEIGHT - 40 }]}
        pointerEvents="none"
      />

      {/* Draggable Bottom Drawer with Goals */}
      <DraggableDrawer closedHeight={DRAWER_CLOSED_HEIGHT} openHeight={DRAWER_OPEN_HEIGHT} initiallyOpen>
        <GoalsSection goals={goals} onGoalPress={handleGoalPress} onAddGoal={handleAddGoal} />
      </DraggableDrawer>

      {/* Backdrop Overlay */}
      <AnimatedPressable
        style={[styles.backdrop, backdropAnimatedStyle]}
        onPress={handleBackdropPress}
      />
    </ThemedView>
  );
}

export default function HomeScreen() {
  // Use SwipeableMainView for the main home screen with pager navigation
  // This enables swiping between Card <-> Home <-> Strategy
  const { SwipeableMainView } = require('@/components/swipeable-main-view');
  return <SwipeableMainView />;
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
    height: SCREEN_HEIGHT * 0.5,
    pointerEvents: 'none',
  },
  content: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  stickyCommandBar: {
    zIndex: 200,
  },
  drawerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 80,
    zIndex: 5,
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
  },
  balanceText: {
    fontSize: 56,
    fontWeight: '600',
    letterSpacing: -2,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  changeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  changePercent: {
    fontSize: 14,
    fontWeight: '600',
  },
  changeAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
});
