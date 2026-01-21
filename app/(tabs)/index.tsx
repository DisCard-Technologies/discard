import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, Keyboard } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedCounter } from '@/components/animated-counter';
import { TransactionStack, StackTransaction } from '@/components/transaction-stack';
import { QuickActions } from '@/components/quick-actions';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/stores/authConvex';
import { useFunding } from '@/stores/fundingConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { positiveColor, negativeColor } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Props for the content component when used in pager
export interface HomeScreenContentProps {
  onNavigateToPortfolio?: () => void;
  onNavigateToCard?: () => void;
  topInset?: number;
}

export function HomeScreenContent({ topInset = 0 }: HomeScreenContentProps) {
  const colorScheme = useColorScheme();
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

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

  // Quick action handlers
  const handleSend = () => router.push('/(tabs)/transfer');
  const handleReceive = () => router.push('/receive');
  const handleScanQR = () => router.push('/transfer/scan');
  const handleSwap = () => router.push('/swap');
  const handleFund = () => router.push('/buy-crypto');

  const handleTransactionTap = (tx: StackTransaction) => {
    // Transaction details - could navigate to explorer or detail page
    console.log('[Home] Transaction tapped:', tx.id, tx.type);
  };

  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Dynamic ambient gradient based on performance */}
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

      {/* Main Content */}
      <View style={styles.content}>
        {/* Hero Section - Balance Display */}
        <View style={[styles.heroSection, { paddingTop: topInset + 16 }]}>
          <ThemedText style={[styles.balanceLabel, { color: mutedColor }]}>
            Spendable Balance
          </ThemedText>
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
          onScanQR={handleScanQR}
          onSwap={handleSwap}
          onFund={handleFund}
        />
      </View>

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
  // This enables swiping between Card <-> Home <-> Portfolio
  const { SwipeableMainView } = require('@/components/swipeable-main-view');
  return <SwipeableMainView />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ambientGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
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
  heroSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
  },
  balanceLabel: {
    fontSize: 14,
    marginBottom: 4,
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
