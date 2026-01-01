import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

interface MarketDetailProps {
  market: {
    question: string;
    category: string;
    volume: string;
    yesPrice: number;
    noPrice: number;
    expiresIn: string;
    traders: number;
    trending?: boolean;
    description?: string;
    resolutionSource?: string;
    createdAt?: string;
  };
  position?: {
    side: 'yes' | 'no';
    shares: number;
    avgPrice: number;
    currentValue: number;
    pnl: number;
    pnlPercent: number;
  };
  onBack: () => void;
  onBuyYes?: () => void;
  onBuyNo?: () => void;
  onSell?: () => void;
}

export function MarketDetailScreen({
  market,
  position,
  onBack,
  onBuyYes,
  onBuyNo,
  onSell,
}: MarketDetailProps) {
  const insets = useSafeAreaInsets();
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');

  const hasPosition = !!position;

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');

  // Calculate potential payout
  const potentialPayout =
    selectedSide === 'yes'
      ? (selectedAmount / market.yesPrice).toFixed(2)
      : (selectedAmount / market.noPrice).toFixed(2);

  // Mock price history for chart
  const priceHistory = useMemo(() => {
    const points: { yes: number; no: number }[] = [];
    let yesBase = market.yesPrice - 0.15;
    for (let i = 0; i < 30; i++) {
      const variance = (Math.random() - 0.5) * 0.1;
      yesBase = Math.max(0.05, Math.min(0.95, yesBase + variance));
      points.push({ yes: yesBase, no: 1 - yesBase });
    }
    points[points.length - 1] = { yes: market.yesPrice, no: market.noPrice };
    return points;
  }, [market.yesPrice, market.noPrice]);

  // Generate SVG path for yes price
  const generatePath = () => {
    const width = 300;
    const height = 80;
    const padding = 5;

    return priceHistory
      .map((point, i) => {
        const x = padding + (i / (priceHistory.length - 1)) * (width - 2 * padding);
        const y = height - padding - point.yes * (height - 2 * padding);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const lastYPrice = priceHistory[priceHistory.length - 1]?.yes || market.yesPrice;
  const chartY = 80 - 5 - lastYPrice * 70;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>
        <View style={[styles.categoryBadge, { backgroundColor: cardBg }]}>
          <ThemedText style={[styles.categoryText, { color: mutedColor }]}>{market.category}</ThemedText>
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
        {/* Question */}
        <ThemedText style={styles.questionText}>{market.question}</ThemedText>

        {/* Current Prices */}
        <View style={styles.pricesRow}>
          <View style={[styles.priceCard, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }]}>
            <View style={styles.priceCardHeader}>
              <ThemedText style={[styles.priceCardLabel, { color: '#22c55e' }]}>YES</ThemedText>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            </View>
            <ThemedText style={[styles.priceCardValue, { color: '#22c55e' }]}>
              ${market.yesPrice.toFixed(2)}
            </ThemedText>
            <ThemedText style={[styles.priceCardChance, { color: mutedColor }]}>
              {(market.yesPrice * 100).toFixed(0)}% chance
            </ThemedText>
          </View>
          <View style={[styles.priceCard, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]}>
            <View style={styles.priceCardHeader}>
              <ThemedText style={[styles.priceCardLabel, { color: '#ef4444' }]}>NO</ThemedText>
              <Ionicons name="close-circle" size={16} color="#ef4444" />
            </View>
            <ThemedText style={[styles.priceCardValue, { color: '#ef4444' }]}>
              ${market.noPrice.toFixed(2)}
            </ThemedText>
            <ThemedText style={[styles.priceCardChance, { color: mutedColor }]}>
              {(market.noPrice * 100).toFixed(0)}% chance
            </ThemedText>
          </View>
        </View>

        {/* Price Chart */}
        <ThemedView style={styles.chartCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          <View style={styles.chartHeader}>
            <ThemedText style={[styles.chartTitle, { color: mutedColor }]}>Price History (YES)</ThemedText>
            <ThemedText style={[styles.chartPeriod, { color: mutedColor }]}>30d</ThemedText>
          </View>
          <Svg width="100%" height={80} viewBox="0 0 300 80">
            <Defs>
              <LinearGradient id="marketGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <Stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={`${generatePath()} L 295 75 L 5 75 Z`} fill="url(#marketGradient)" />
            <Path d={generatePath()} fill="none" stroke="#22c55e" strokeWidth={2} />
            <Circle cx={295} cy={chartY} r={3} fill="#22c55e" />
          </Svg>
        </ThemedView>

        {/* Market Stats */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Ionicons name="bar-chart" size={16} color={mutedColor} style={styles.statIcon} />
            <ThemedText style={styles.statValue}>{market.volume}</ThemedText>
            <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Volume</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Ionicons name="people" size={16} color={mutedColor} style={styles.statIcon} />
            <ThemedText style={styles.statValue}>{market.traders.toLocaleString()}</ThemedText>
            <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Traders</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Ionicons name="time" size={16} color={mutedColor} style={styles.statIcon} />
            <ThemedText style={styles.statValue}>{market.expiresIn}</ThemedText>
            <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Expires</ThemedText>
          </View>
        </View>

        {/* Your Position (if exists) */}
        {hasPosition && position && (
          <ThemedView
            style={[styles.positionCard, { borderColor: `${primaryColor}30` }]}
            lightColor="#f4f4f5"
            darkColor="#1c1c1e"
          >
            <View style={styles.positionHeader}>
              <ThemedText style={[styles.positionTitle, { color: mutedColor }]}>Your Position</ThemedText>
              <View
                style={[
                  styles.sideBadge,
                  { backgroundColor: position.side === 'yes' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' },
                ]}
              >
                <ThemedText
                  style={[styles.sideBadgeText, { color: position.side === 'yes' ? '#22c55e' : '#ef4444' }]}
                >
                  {position.side.toUpperCase()}
                </ThemedText>
              </View>
            </View>
            <View style={styles.positionGrid}>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>Shares</ThemedText>
                <ThemedText style={styles.positionValue}>{position.shares}</ThemedText>
              </View>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>Value</ThemedText>
                <ThemedText style={styles.positionValue}>${position.currentValue.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>Avg Price</ThemedText>
                <ThemedText style={styles.positionValueSmall}>${position.avgPrice.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>P&L</ThemedText>
                <ThemedText
                  style={[styles.positionValueSmall, { color: position.pnl >= 0 ? '#22c55e' : '#ef4444' }]}
                >
                  {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} ({position.pnlPercent.toFixed(1)}%)
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={onSell}
              style={[styles.sellPositionButton, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]}
            >
              <ThemedText style={[styles.sellPositionText, { color: '#ef4444' }]}>Sell Position</ThemedText>
            </Pressable>
          </ThemedView>
        )}

        {/* Trade Panel */}
        <ThemedView style={styles.tradeCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          <ThemedText style={[styles.tradeTitle, { color: mutedColor }]}>Place Trade</ThemedText>

          {/* Side Selector */}
          <View style={styles.sideSelector}>
            <Pressable
              onPress={() => setSelectedSide('yes')}
              style={[
                styles.sideButton,
                selectedSide === 'yes'
                  ? { backgroundColor: '#22c55e' }
                  : { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)', borderWidth: 1 },
              ]}
            >
              <ThemedText
                style={[styles.sideButtonText, { color: selectedSide === 'yes' ? '#fff' : '#22c55e' }]}
              >
                Yes ${market.yesPrice.toFixed(2)}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setSelectedSide('no')}
              style={[
                styles.sideButton,
                selectedSide === 'no'
                  ? { backgroundColor: '#ef4444' }
                  : { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', borderWidth: 1 },
              ]}
            >
              <ThemedText
                style={[styles.sideButtonText, { color: selectedSide === 'no' ? '#fff' : '#ef4444' }]}
              >
                No ${market.noPrice.toFixed(2)}
              </ThemedText>
            </Pressable>
          </View>

          {/* Amount Selector */}
          <View style={styles.amountRow}>
            <ThemedText style={[styles.amountLabel, { color: mutedColor }]}>Amount</ThemedText>
            <View style={styles.amountControls}>
              <Pressable
                onPress={() => setSelectedAmount(Math.max(1, selectedAmount - 10))}
                style={[styles.amountButton, { backgroundColor: cardBg }]}
              >
                <Ionicons name="remove" size={16} color={textColor} />
              </Pressable>
              <ThemedText style={styles.amountValue}>${selectedAmount}</ThemedText>
              <Pressable
                onPress={() => setSelectedAmount(selectedAmount + 10)}
                style={[styles.amountButton, { backgroundColor: cardBg }]}
              >
                <Ionicons name="add" size={16} color={textColor} />
              </Pressable>
            </View>
          </View>

          {/* Quick Amounts */}
          <View style={styles.quickAmounts}>
            {[10, 25, 50, 100].map((amount) => (
              <Pressable
                key={amount}
                onPress={() => setSelectedAmount(amount)}
                style={[
                  styles.quickAmountButton,
                  selectedAmount === amount
                    ? { backgroundColor: `${primaryColor}20`, borderColor: `${primaryColor}30`, borderWidth: 1 }
                    : { backgroundColor: cardBg },
                ]}
              >
                <ThemedText
                  style={[
                    styles.quickAmountText,
                    { color: selectedAmount === amount ? primaryColor : mutedColor },
                  ]}
                >
                  ${amount}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {/* Payout Info */}
          <View style={[styles.payoutInfo, { backgroundColor: cardBg }]}>
            <ThemedText style={[styles.payoutLabel, { color: mutedColor }]}>Potential Payout</ThemedText>
            <ThemedText style={[styles.payoutValue, { color: '#22c55e' }]}>
              {potentialPayout} shares → ${Number(potentialPayout).toFixed(2)} if {selectedSide.toUpperCase()}
            </ThemedText>
          </View>

          {/* Buy Button */}
          <Pressable
            onPress={selectedSide === 'yes' ? onBuyYes : onBuyNo}
            style={[
              styles.buyTradeButton,
              { backgroundColor: selectedSide === 'yes' ? '#22c55e' : '#ef4444' },
            ]}
          >
            <ThemedText style={styles.buyTradeText}>
              Buy {selectedSide.toUpperCase()} for ${selectedAmount}
            </ThemedText>
          </Pressable>
        </ThemedView>

        {/* Market Info */}
        <ThemedView style={styles.infoCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          <ThemedText style={[styles.infoTitle, { color: mutedColor }]}>Market Info</ThemedText>

          {market.description && (
            <ThemedText style={[styles.infoDescription, { color: mutedColor }]}>
              {market.description}
            </ThemedText>
          )}

          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: mutedColor }]}>Resolution Source</ThemedText>
              <ThemedText style={styles.infoValue}>{market.resolutionSource || 'Official Announcement'}</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: mutedColor }]}>Expiration</ThemedText>
              <ThemedText style={styles.infoValue}>{market.expiresIn}</ThemedText>
            </View>
          </View>

          <Pressable style={styles.externalLink}>
            <Ionicons name="open-outline" size={12} color={primaryColor} />
            <ThemedText style={[styles.externalLinkText, { color: primaryColor }]}>
              View on Polymarket
            </ThemedText>
          </Pressable>
        </ThemedView>
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
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryText: {
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
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    marginBottom: 16,
  },
  pricesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  priceCard: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  priceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  priceCardValue: {
    fontSize: 24,
    fontWeight: '600',
  },
  priceCardChance: {
    fontSize: 12,
    marginTop: 4,
  },
  chartCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chartPeriod: {
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
  },
  statIcon: {
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  positionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  positionTitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sideBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  positionItem: {
    width: '45%',
  },
  positionLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  positionValue: {
    fontSize: 18,
    fontWeight: '500',
  },
  positionValueSmall: {
    fontSize: 14,
    fontWeight: '500',
  },
  sellPositionButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  sellPositionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tradeCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  tradeTitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  sideSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sideButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  sideButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
  },
  amountControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '500',
    width: 64,
    textAlign: 'center',
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 12,
    fontWeight: '500',
  },
  payoutInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  payoutLabel: {
    fontSize: 12,
  },
  payoutValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  buyTradeButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  buyTradeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
  },
  infoTitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  infoDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  infoList: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  externalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
  },
  externalLinkText: {
    fontSize: 12,
  },
});

