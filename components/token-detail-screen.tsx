import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

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
    rank?: number;
    mint?: string; // Solana mint address
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
  onBack: () => void;
  onBuy?: () => void;
  onSell?: () => void;
  onSend?: () => void;
  onReceive?: () => void;
  onSwap?: () => void;
  onSetGoal?: () => void;
}

type TimeframeType = '1H' | '1D' | '1W' | '1M' | '1Y' | 'ALL';

export function TokenDetailScreen({
  token,
  owned,
  onBack,
  onBuy,
  onSell,
  onSend,
  onReceive,
  onSwap,
  onSetGoal,
}: TokenDetailProps) {
  const insets = useSafeAreaInsets();
  const [timeframe, setTimeframe] = useState<TimeframeType>('1D');
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [copied, setCopied] = useState(false);
  const isOwned = !!owned;

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');

  // Generate mock chart data
  const chartPoints = useMemo(() => {
    const points: number[] = [];
    const numPoints = 50;
    let base = token.price * 0.95;
    for (let i = 0; i < numPoints; i++) {
      const variance = (Math.random() - 0.5) * token.price * 0.08;
      base = Math.max(base + variance, token.price * 0.85);
      points.push(base);
    }
    points[points.length - 1] = token.price;
    return points;
  }, [token.price, timeframe]);

  const minPrice = Math.min(...chartPoints);
  const maxPrice = Math.max(...chartPoints);
  const priceRange = maxPrice - minPrice || 1;

  // Generate SVG path
  const generatePath = () => {
    const width = 320;
    const height = 120;
    const padding = 10;

    return chartPoints
      .map((price, i) => {
        const x = padding + (i / (chartPoints.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((price - minPrice) / priceRange) * (height - 2 * padding);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const handleCopyAddress = async () => {
    if (token.mint) {
      await Clipboard.setStringAsync(token.mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format Solana address for display (first 4...last 4)
  const formatAddress = (address?: string) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Open Solscan explorer
  const handleOpenExplorer = () => {
    if (token.mint) {
      // Would use Linking.openURL in real implementation
      console.log(`Opening Solscan: https://solscan.io/token/${token.mint}`);
    }
  };

  // Format volume for display
  const formatVolume = (volume?: string | number): string => {
    if (!volume) return 'N/A';
    const num = typeof volume === 'string' ? parseFloat(volume) : volume;
    if (isNaN(num)) return 'N/A';
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  // Format price for display
  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  };

  const isPositive = token.change24h >= 0;
  const chartColor = isPositive ? '#22c55e' : '#ef4444';
  const buyButtonColor = '#22c55e'; // Consistent green for buy button

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>
        <View style={styles.tokenHeader}>
          <View style={[styles.tokenIcon, { backgroundColor: cardBg }]}>
            <ThemedText style={styles.tokenIconText}>
              {token.icon || token.symbol.slice(0, 2)}
            </ThemedText>
          </View>
          <View>
            <ThemedText style={styles.tokenName}>{token.name}</ThemedText>
            <ThemedText style={[styles.tokenSymbol, { color: mutedColor }]}>{token.symbol}</ThemedText>
          </View>
        </View>
        <Pressable onPress={() => setIsWatchlisted(!isWatchlisted)} style={styles.watchlistButton}>
          <Ionicons
            name={isWatchlisted ? 'star' : 'star-outline'}
            size={20}
            color={isWatchlisted ? '#f59e0b' : mutedColor}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Price Section */}
        <View style={styles.priceSection}>
          <ThemedText style={styles.priceValue}>
            ${formatPrice(token.price)}
          </ThemedText>
          <View style={styles.changeRow}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={16}
              color={chartColor}
            />
            <ThemedText style={[styles.changeText, { color: chartColor }]}>
              {isPositive ? '+' : ''}{token.change24h.toFixed(2)}% today
            </ThemedText>
          </View>
        </View>

        {/* Chart */}
        <ThemedView style={styles.chartCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          <Svg width="100%" height={120} viewBox="0 0 320 120">
            <Defs>
              <LinearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                <Stop offset="100%" stopColor={chartColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={`${generatePath()} L 310 110 L 10 110 Z`} fill="url(#chartGradient)" />
            <Path d={generatePath()} fill="none" stroke={chartColor} strokeWidth={2} />
            <Circle cx={310} cy={10} r={4} fill={chartColor} />
          </Svg>

          {/* Timeframe Selector */}
          <View style={styles.timeframeRow}>
            {(['1H', '1D', '1W', '1M', '1Y', 'ALL'] as TimeframeType[]).map((tf) => (
              <Pressable
                key={tf}
                onPress={() => setTimeframe(tf)}
                style={[
                  styles.timeframeButton,
                  timeframe === tf && { backgroundColor: `${primaryColor}20` },
                ]}
              >
                <ThemedText
                  style={[
                    styles.timeframeText,
                    { color: timeframe === tf ? primaryColor : mutedColor },
                  ]}
                >
                  {tf}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </ThemedView>

        {/* Holdings Summary (if owned) */}
        {isOwned && owned && (
          <ThemedView style={styles.holdingsCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
            <View style={styles.holdingsHeader}>
              <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>Your Holdings</ThemedText>
              {owned.isAmbientManaged && (
                <View style={[styles.autoBadge, { backgroundColor: `${primaryColor}15` }]}>
                  <Ionicons name="flash" size={10} color={primaryColor} />
                  <ThemedText style={[styles.autoBadgeText, { color: primaryColor }]}>AUTO-MANAGED</ThemedText>
                </View>
              )}
            </View>

            <View style={styles.holdingsGrid}>
              <View style={styles.holdingItem}>
                <ThemedText style={[styles.holdingLabel, { color: mutedColor }]}>Balance</ThemedText>
                <ThemedText style={styles.holdingValue}>
                  {owned.balance} {token.symbol}
                </ThemedText>
              </View>
              <View style={styles.holdingItem}>
                <ThemedText style={[styles.holdingLabel, { color: mutedColor }]}>Value</ThemedText>
                <ThemedText style={styles.holdingValue}>${owned.value.toLocaleString()}</ThemedText>
              </View>
              {owned.avgCost !== undefined && (
                <View style={styles.holdingItem}>
                  <ThemedText style={[styles.holdingLabel, { color: mutedColor }]}>Avg Cost</ThemedText>
                  <ThemedText style={styles.holdingValueSmall}>${owned.avgCost.toFixed(2)}</ThemedText>
                </View>
              )}
              {owned.pnl !== undefined && (
                <View style={styles.holdingItem}>
                  <ThemedText style={[styles.holdingLabel, { color: mutedColor }]}>P&L</ThemedText>
                  <ThemedText
                    style={[styles.holdingValueSmall, { color: owned.pnl >= 0 ? '#22c55e' : '#ef4444' }]}
                  >
                    {owned.pnl >= 0 ? '+' : ''}${owned.pnl.toLocaleString()} ({owned.pnlPercent?.toFixed(1)}%)
                  </ThemedText>
                </View>
              )}
              {owned.allocation !== undefined && (
                <View style={styles.holdingItem}>
                  <ThemedText style={[styles.holdingLabel, { color: mutedColor }]}>Allocation</ThemedText>
                  <ThemedText style={styles.holdingValueSmall}>{owned.allocation}%</ThemedText>
                </View>
              )}
            </View>
          </ThemedView>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          {isOwned ? (
            <>
              {/* Primary Actions Row */}
              <View style={styles.actionGrid4}>
                <Pressable
                  onPress={onBuy}
                  style={[styles.actionButton, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.3)', borderWidth: 1 }]}
                >
                  <Ionicons name="add" size={20} color="#22c55e" />
                  <ThemedText style={[styles.actionButtonText, { color: '#22c55e' }]}>Buy</ThemedText>
                </Pressable>
                <Pressable
                  onPress={onSell}
                  style={[styles.actionButton, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1 }]}
                >
                  <Ionicons name="remove" size={20} color="#ef4444" />
                  <ThemedText style={[styles.actionButtonText, { color: '#ef4444' }]}>Sell</ThemedText>
                </Pressable>
                <Pressable onPress={onSend} style={[styles.actionButton, { backgroundColor: cardBg }]}>
                  <Ionicons name="send" size={20} color={textColor} />
                  <ThemedText style={styles.actionButtonText}>Send</ThemedText>
                </Pressable>
                <Pressable onPress={onReceive} style={[styles.actionButton, { backgroundColor: cardBg }]}>
                  <Ionicons name="download" size={20} color={textColor} />
                  <ThemedText style={styles.actionButtonText}>Receive</ThemedText>
                </Pressable>
              </View>

              {/* Secondary Actions */}
              <View style={styles.secondaryActions}>
                <Pressable onPress={onSwap} style={[styles.secondaryButton, { backgroundColor: cardBg }]}>
                  <Ionicons name="swap-horizontal" size={16} color={textColor} />
                  <ThemedText style={styles.secondaryButtonText}>Swap</ThemedText>
                </Pressable>
                <Pressable
                  onPress={onSetGoal}
                  style={[styles.secondaryButton, { backgroundColor: `${primaryColor}15`, borderColor: `${primaryColor}30`, borderWidth: 1 }]}
                >
                  <Ionicons name="flag" size={16} color={primaryColor} />
                  <ThemedText style={[styles.secondaryButtonText, { color: primaryColor }]}>Set Goal</ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.buyRow}>
              <Pressable onPress={onBuy} style={[styles.buyButton, { backgroundColor: buyButtonColor }]}>
                <Ionicons name="add" size={20} color="#fff" />
                <ThemedText style={[styles.buyButtonText, { color: '#fff' }]}>Buy {token.symbol}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setIsWatchlisted(!isWatchlisted)}
                style={[
                  styles.watchlistActionButton,
                  isWatchlisted
                    ? { backgroundColor: 'rgba(245,158,11,0.2)', borderColor: 'rgba(245,158,11,0.3)' }
                    : { backgroundColor: cardBg },
                ]}
              >
                <Ionicons
                  name={isWatchlisted ? 'star' : 'star-outline'}
                  size={20}
                  color={isWatchlisted ? '#f59e0b' : textColor}
                />
                <ThemedText style={[styles.watchlistActionText, isWatchlisted && { color: '#f59e0b' }]}>
                  {isWatchlisted ? 'Watching' : 'Add to Watchlist'}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>

        {/* Market Data */}
        <ThemedView style={styles.marketCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>Market Data</ThemedText>
          <View style={styles.marketList}>
            {token.marketCap && (
              <View style={styles.marketRow}>
                <ThemedText style={[styles.marketLabel, { color: mutedColor }]}>Market Cap</ThemedText>
                <ThemedText style={styles.marketValue}>{token.marketCap}</ThemedText>
              </View>
            )}
            {token.volume24h && (
              <View style={styles.marketRow}>
                <ThemedText style={[styles.marketLabel, { color: mutedColor }]}>24h Volume</ThemedText>
                <ThemedText style={styles.marketValue}>{formatVolume(token.volume24h)}</ThemedText>
              </View>
            )}
            {token.supply && (
              <View style={styles.marketRow}>
                <ThemedText style={[styles.marketLabel, { color: mutedColor }]}>Circulating Supply</ThemedText>
                <ThemedText style={styles.marketValue}>{token.supply}</ThemedText>
              </View>
            )}
            {token.rank !== undefined && (
              <View style={styles.marketRow}>
                <ThemedText style={[styles.marketLabel, { color: mutedColor }]}>Rank</ThemedText>
                <ThemedText style={styles.marketValue}>#{token.rank}</ThemedText>
              </View>
            )}
          </View>
        </ThemedView>

        {/* Contract Info - Solana */}
        {token.mint && (
          <ThemedView style={styles.contractCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>Solana Contract</ThemedText>
            <View style={styles.contractRow}>
              <ThemedText style={[styles.contractAddress, { color: mutedColor }]}>
                {formatAddress(token.mint)}
              </ThemedText>
              <View style={styles.contractActions}>
                <Pressable onPress={handleCopyAddress} style={styles.contractButton}>
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={16}
                    color={copied ? '#22c55e' : mutedColor}
                  />
                </Pressable>
                <Pressable onPress={handleOpenExplorer} style={styles.contractButton}>
                  <Ionicons name="open-outline" size={16} color={mutedColor} />
                </Pressable>
              </View>
            </View>
          </ThemedView>
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
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenHeader: {
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
    fontSize: 16,
  },
  tokenName: {
    fontSize: 16,
    fontWeight: '600',
  },
  tokenSymbol: {
    fontSize: 12,
  },
  watchlistButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  priceSection: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 4,
  },
  priceValue: {
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 44,
    marginBottom: 4,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chartCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  timeframeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  timeframeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  timeframeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  holdingsCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  holdingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  autoBadgeText: {
    fontSize: 8,
    fontWeight: '600',
  },
  holdingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  holdingItem: {
    width: '45%',
  },
  holdingLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  holdingValue: {
    fontSize: 18,
    fontWeight: '500',
  },
  holdingValueSmall: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionsSection: {
    marginBottom: 16,
  },
  actionGrid4: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionButtonText: {
    fontSize: 10,
    fontWeight: '500',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  buyRow: {
    flexDirection: 'row',
    gap: 12,
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
    fontWeight: '500',
    color: '#fff',
  },
  watchlistActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  watchlistActionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  marketCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  marketList: {
    gap: 12,
  },
  marketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  marketLabel: {
    fontSize: 14,
  },
  marketValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  contractCard: {
    borderRadius: 16,
    padding: 16,
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contractAddress: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  contractActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contractButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

