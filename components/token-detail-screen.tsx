import { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { primaryColor, Fonts } from '@/constants/theme';

export type TransactionType = 'send' | 'receive' | 'swap' | 'deposit' | 'withdrawal';

export interface RecentTransaction {
  id: string;
  type: TransactionType;
  address: string;
  tokenAmount: string;
  fiatValue: string;
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
  };
  owned?: {
    balance: string;
    value: number;
    avgCost?: number;
    pnl?: number;
    pnlPercent?: number;
    allocation?: number;
    isAmbientManaged?: boolean;
  };
  recentTransaction?: RecentTransaction;
  onBack: () => void;
  onBuy?: () => void;
  onSell?: () => void;
  onSend?: () => void;
  onReceive?: () => void;
  onSwap?: () => void;
  onSetGoal?: () => void;
  onTransactionPress?: (transaction: RecentTransaction) => void;
}

export function TokenDetailScreen({
  token,
  owned,
  recentTransaction,
  onBack,
  onBuy,
  onSend,
  onReceive,
  onSwap,
  onTransactionPress,
}: TokenDetailProps) {
  const insets = useSafeAreaInsets();
  const [isWatchlisted, setIsWatchlisted] = useState(false);

  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // Format price for display
  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  };

  // Format large numbers for display
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

  // Format supply for display (without $ prefix)
  const formatSupply = (value?: string): string => {
    if (!value) return 'N/A';
    return value;
  };

  const getTransactionIcon = (type: TransactionType): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'send':
        return 'arrow-up';
      case 'receive':
        return 'arrow-down';
      case 'swap':
        return 'swap-horizontal';
      case 'deposit':
        return 'arrow-down';
      case 'withdrawal':
        return 'arrow-up';
      default:
        return 'ellipsis-horizontal';
    }
  };

  const handleActionPress = (action: () => void | undefined) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action?.();
  };

  const isPositive = token.change24h >= 0;
  const changeColor = isPositive ? '#22c55e' : '#ef4444';

  // Action buttons configuration
  const actions = [
    { id: 'send', icon: 'arrow-up' as const, label: 'Send', onPress: onSend },
    { id: 'receive', icon: 'arrow-down' as const, label: 'Receive', onPress: onReceive },
    { id: 'swap', icon: 'swap-horizontal' as const, label: 'Swap', onPress: onSwap },
    { id: 'buy', icon: 'cart' as const, label: 'Buy', onPress: onBuy },
  ];

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable 
          onPress={onBack} 
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={textColor} />
        </Pressable>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>{token.name}</ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: mutedColor }]}>{token.name}</ThemedText>
        </View>
        <Pressable 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsWatchlisted(!isWatchlisted);
          }} 
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Ionicons
            name={isWatchlisted ? 'star' : 'star-outline'}
            size={22}
            color={isWatchlisted ? '#f59e0b' : mutedColor}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Token Icon */}
        <View style={styles.tokenIconSection}>
          <View style={[styles.tokenIconContainer, { backgroundColor: cardBg }]}>
            {token.logoUri ? (
              <Image source={{ uri: token.logoUri }} style={styles.tokenIconImage} />
            ) : (
              <ThemedText style={styles.tokenIconText}>
                {token.icon || token.symbol.slice(0, 2)}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Balance/Price Display - Different for owned vs non-owned */}
        {owned ? (
          // Owned token: Show balance
          <View style={styles.balanceSection}>
            <ThemedText style={styles.balanceAmount}>
              {owned.balance} {token.symbol}
            </ThemedText>
            <ThemedText style={[styles.balanceValue, { color: mutedColor }]}>
              ≈ ${owned.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </ThemedText>
          </View>
        ) : (
          // Non-owned token: Show price prominently
          <View style={styles.balanceSection}>
            <ThemedText style={styles.balanceAmount}>
              ${formatPrice(token.price)}
            </ThemedText>
            <View style={styles.priceChangeRow}>
              <ThemedText style={[styles.priceChangeText, { color: changeColor }]}>
                {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
              </ThemedText>
              <ThemedText style={[styles.balanceValue, { color: mutedColor }]}>
                24h
              </ThemedText>
            </View>
          </View>
        )}

        {/* Recent Transaction Card - Only for owned tokens */}
        {owned && recentTransaction && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onTransactionPress?.(recentTransaction);
            }}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <ThemedView
              style={[styles.transactionCard, { borderColor }]}
              lightColor="#f4f4f5"
              darkColor="#1a1f25"
            >
              <View style={[styles.transactionIcon, { borderColor }]}>
                <Ionicons
                  name={getTransactionIcon(recentTransaction.type)}
                  size={18}
                  color={textColor}
                />
              </View>
              <View style={styles.transactionInfo}>
                <ThemedText style={styles.transactionType}>
                  {recentTransaction.type.charAt(0).toUpperCase() + recentTransaction.type.slice(1)}
                </ThemedText>
                <View style={styles.transactionAddressRow}>
                  <View style={styles.addressDot}>
                    <ThemedText style={[styles.diamond, { color: primaryColor }]}>◆</ThemedText>
                  </View>
                  <ThemedText style={[styles.transactionAddress, { color: mutedColor }]}>
                    {recentTransaction.address}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.transactionAmountContainer}>
                <ThemedText style={styles.transactionAmount}>
                  {recentTransaction.tokenAmount}
                </ThemedText>
                <ThemedText style={[styles.transactionFiat, { color: mutedColor }]}>
                  {recentTransaction.fiatValue}
                </ThemedText>
              </View>
            </ThemedView>
          </Pressable>
        )}

        {/* Action Buttons - Different for owned vs non-owned */}
        {owned ? (
          // Owned token: Show Send, Receive, Swap, Buy circular buttons
          <View style={styles.actionsContainer}>
            {actions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => handleActionPress(action.onPress!)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                <View style={[styles.actionIconContainer, { borderColor }]}>
                  <Ionicons name={action.icon} size={20} color={textColor} />
                </View>
                <ThemedText style={[styles.actionLabel, { color: mutedColor }]}>
                  {action.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : (
          // Non-owned token: Show Buy button and Add to Watchlist
          <View style={styles.nonOwnedActions}>
            <Pressable
              onPress={() => handleActionPress(onBuy!)}
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
                {isWatchlisted ? 'Watching' : 'Add to Watchlist'}
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* Stats Section */}
        <ThemedView style={styles.statsCard} lightColor="#f4f4f5" darkColor="#1a1f25">
          <ThemedText style={styles.statsTitle}>Stats</ThemedText>
          <View style={styles.statsGrid}>
            {/* Market Cap */}
            <View style={styles.statItem}>
              <View style={styles.statHeader}>
                <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Market Cap</ThemedText>
                <Ionicons name="logo-usd" size={14} color={mutedColor} />
              </View>
              <ThemedText style={styles.statValue}>
                {formatLargeNumber(token.marketCap)}
              </ThemedText>
            </View>

            {/* Volume 24h */}
            <View style={styles.statItem}>
              <View style={styles.statHeader}>
                <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Volume (24h)</ThemedText>
                <Ionicons name="trending-up" size={14} color={mutedColor} />
              </View>
              <ThemedText style={styles.statValue}>
                {formatLargeNumber(token.volume24h)}
              </ThemedText>
            </View>

            {/* Circulating Supply */}
            <View style={styles.statItem}>
              <View style={styles.statHeader}>
                <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Circulating Supply</ThemedText>
                <Ionicons name="time-outline" size={14} color={mutedColor} />
              </View>
              <ThemedText style={styles.statValue}>
                {formatSupply(token.supply)}
              </ThemedText>
            </View>

            {/* Total Supply */}
            <View style={styles.statItem}>
              <View style={styles.statHeader}>
                <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Total Supply</ThemedText>
                <Ionicons name="layers-outline" size={14} color={mutedColor} />
              </View>
              <ThemedText style={styles.statValue}>
                {formatSupply(token.totalSupply || token.supply)}
              </ThemedText>
            </View>
          </View>
        </ThemedView>

        {/* Current Price Section - Only for owned tokens */}
        {owned && (
          <View style={styles.currentPriceSection}>
            <ThemedText style={[styles.currentPriceLabel, { color: primaryColor }]}>
              Current {token.symbol} price
            </ThemedText>
            <View style={styles.currentPriceRow}>
              <ThemedText style={styles.currentPriceValue}>
                $ {formatPrice(token.price)}
              </ThemedText>
              <ThemedText style={[styles.currentPriceChange, { color: changeColor }]}>
                {isPositive ? '' : ''}{token.change24h.toFixed(2)}%
              </ThemedText>
            </View>
          </View>
        )}
      </ScrollView>
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
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Token Icon Section
  tokenIconSection: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  tokenIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tokenIconImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  tokenIconText: {
    fontSize: 28,
    fontWeight: '600',
  },

  // Balance Section
  balanceSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  balanceValue: {
    fontSize: 16,
    marginTop: 4,
  },
  priceChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  priceChangeText: {
    fontSize: 16,
    fontWeight: '500',
  },

  // Transaction Card
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
  },
  transactionAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  addressDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  transactionAddress: {
    fontSize: 14,
    fontFamily: Fonts.mono,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  transactionFiat: {
    fontSize: 14,
    marginTop: 2,
  },

  // Action Buttons
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginBottom: 32,
  },
  actionButton: {
    alignItems: 'center',
    gap: 8,
  },
  actionIconContainer: {
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

  // Non-owned Token Actions
  nonOwnedActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  buyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
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
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  watchlistButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Stats Section
  statsCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    paddingVertical: 12,
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

  // Current Price Section
  currentPriceSection: {
    marginBottom: 16,
  },
  currentPriceLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  currentPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  currentPriceValue: {
    fontSize: 24,
    fontWeight: '600',
  },
  currentPriceChange: {
    fontSize: 14,
    fontWeight: '500',
  },
});
