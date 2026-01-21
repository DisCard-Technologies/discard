import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Line, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { positiveColor, negativeColor } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MarketOutcome {
  id: string;
  label: string;
  probability: number;
  icon?: string;
  scoreBadge?: string;
  color?: string;
}

interface MarketDetailProps {
  market: {
    marketId?: string;
    question: string;
    category: string;
    volume: string;
    yesPrice: number;
    noPrice: number;
    expiresIn: string;
    traders?: number;
    trending?: boolean;
    description?: string;
    resolutionSource?: string;
    createdAt?: string;
    // Sports match specific
    isLive?: boolean;
    liveMinutes?: number;
    homeTeam?: { name: string; shortName: string; score?: number };
    awayTeam?: { name: string; shortName: string; score?: number };
    // Multi-outcome support
    outcomes?: MarketOutcome[];
  };
  position?: {
    side: string;
    shares: number;
    avgPrice: number;
    currentValue: number;
    pnl: number;
    pnlPercent: number;
  };
  onBack: () => void;
  onBuyOutcome?: (outcomeId: string, amount: number) => void;
  onBuyYes?: (amount: number) => void;
  onBuyNo?: (amount: number) => void;
  onSell?: () => void;
}

// Chart time periods
type TimePeriod = 'GAME' | '1D' | '1W' | '1M' | 'ALL';

export function MarketDetailScreen({
  market,
  position,
  onBack,
  onBuyOutcome,
  onBuyYes,
  onBuyNo,
  onSell,
}: MarketDetailProps) {
  const insets = useSafeAreaInsets();
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('1D');
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null);

  const hasPosition = !!position;

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  // Convert binary yes/no to outcomes if not provided
  const outcomes: MarketOutcome[] = useMemo(() => {
    if (market.outcomes && market.outcomes.length > 0) {
      return market.outcomes;
    }
    // Default binary market
    return [
      { id: 'yes', label: 'Yes', probability: market.yesPrice, color: positiveColor },
      { id: 'no', label: 'No', probability: market.noPrice, color: negativeColor },
    ];
  }, [market.outcomes, market.yesPrice, market.noPrice]);

  // Find leading outcome
  const leadingOutcome = useMemo(() => {
    return outcomes.reduce((max, o) => (o.probability > max.probability ? o : max));
  }, [outcomes]);

  // Is this a sports match with team data?
  const isSportsMatch = !!(market.homeTeam && market.awayTeam);

  // Generate mock price history for chart
  const priceHistory = useMemo(() => {
    const points: { [key: string]: number }[] = [];
    const numPoints = 50;

    // Initialize starting values for each outcome
    const startValues: { [key: string]: number } = {};
    outcomes.forEach((o) => {
      startValues[o.id] = o.probability - 0.1 + Math.random() * 0.05;
    });

    for (let i = 0; i < numPoints; i++) {
      const point: { [key: string]: number } = {};
      outcomes.forEach((o) => {
        const prev = i === 0 ? startValues[o.id] : points[i - 1][o.id];
        const variance = (Math.random() - 0.5) * 0.03;
        point[o.id] = Math.max(0.01, Math.min(0.99, prev + variance));
      });
      points.push(point);
    }

    // Ensure last point matches current probabilities
    const lastPoint: { [key: string]: number } = {};
    outcomes.forEach((o) => {
      lastPoint[o.id] = o.probability;
    });
    points[numPoints - 1] = lastPoint;

    return points;
  }, [outcomes]);

  // Generate SVG path for an outcome
  const generatePath = (outcomeId: string) => {
    const width = SCREEN_WIDTH - 48;
    const height = 160;
    const padding = 16;

    return priceHistory
      .map((point, i) => {
        const x = padding + (i / (priceHistory.length - 1)) * (width - 2 * padding);
        const y = height - padding - (point[outcomeId] || 0) * (height - 2 * padding);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  // Get outcome color
  const getOutcomeColor = (outcome: MarketOutcome, isLeading: boolean): string => {
    if (outcome.color) return outcome.color;
    if (outcome.id === 'yes') return positiveColor;
    if (outcome.id === 'no') return negativeColor;
    if (isLeading) return '#F87171'; // Coral for leading
    return mutedColor;
  };

  // Handle outcome selection for betting
  const handleOutcomePress = (outcomeId: string) => {
    setSelectedOutcomeId(outcomeId === selectedOutcomeId ? null : outcomeId);
  };

  // Handle bet placement
  const handlePlaceBet = (amount: number = 10) => {
    if (!selectedOutcomeId) return;

    if (onBuyOutcome) {
      onBuyOutcome(selectedOutcomeId, amount);
    } else if (selectedOutcomeId === 'yes' && onBuyYes) {
      onBuyYes(amount);
    } else if (selectedOutcomeId === 'no' && onBuyNo) {
      onBuyNo(amount);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>

        {/* Live Badge */}
        {market.isLive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.liveText}>LIVE</ThemedText>
            {market.liveMinutes && (
              <ThemedText style={styles.liveMinutes}>• {market.liveMinutes}'</ThemedText>
            )}
          </View>
        )}

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Sports Match Header */}
        {isSportsMatch ? (
          <View style={styles.matchHeader}>
            {/* Home Team */}
            <View style={styles.teamContainer}>
              <ThemedText style={[styles.teamShortName, { color: primaryColor }]}>
                {market.homeTeam!.shortName}
              </ThemedText>
              <ThemedText style={[styles.teamFullName, { color: mutedColor }]}>
                {market.homeTeam!.name}
              </ThemedText>
            </View>

            {/* Score */}
            <View style={styles.scoreContainer}>
              <ThemedText style={styles.scoreText}>
                {market.homeTeam!.score ?? '-'} - {market.awayTeam!.score ?? '-'}
              </ThemedText>
              <View style={[styles.volumeBadge, { backgroundColor: cardBg }]}>
                <ThemedText style={[styles.volumeText, { color: mutedColor }]}>
                  {market.volume} Vol.
                </ThemedText>
              </View>
            </View>

            {/* Away Team */}
            <View style={styles.teamContainer}>
              <ThemedText style={[styles.teamShortName, { color: '#F87171' }]}>
                {market.awayTeam!.shortName}
              </ThemedText>
              <ThemedText style={[styles.teamFullName, { color: mutedColor }]}>
                {market.awayTeam!.name}
              </ThemedText>
            </View>
          </View>
        ) : (
          /* Regular Market Header */
          <View style={styles.questionHeader}>
            <ThemedText style={styles.questionText}>{market.question}</ThemedText>
            <View style={[styles.volumeBadge, { backgroundColor: cardBg }]}>
              <ThemedText style={[styles.volumeText, { color: mutedColor }]}>
                {market.volume} Vol.
              </ThemedText>
            </View>
          </View>
        )}

        {/* Outcome Probabilities */}
        <View style={styles.outcomesRow}>
          {outcomes.map((outcome) => {
            const isLeading = outcome.id === leadingOutcome.id;
            const color = getOutcomeColor(outcome, isLeading);
            return (
              <View key={outcome.id} style={styles.outcomeItem}>
                <View style={[styles.outcomeDot, { backgroundColor: color }]} />
                <ThemedText style={[styles.outcomeLabel, { color: mutedColor }]}>
                  {outcome.label} {(outcome.probability * 100).toFixed(0)}%
                </ThemedText>
              </View>
            );
          })}
        </View>

        {/* Position P&L (if has position) */}
        {hasPosition && position && (
          <View style={styles.pnlContainer}>
            <ThemedText
              style={[
                styles.pnlText,
                { color: position.pnl >= 0 ? positiveColor : negativeColor },
              ]}
            >
              {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
            </ThemedText>
          </View>
        )}

        {/* Price Chart */}
        <View style={styles.chartContainer}>
          {/* Y-axis labels */}
          <View style={styles.yAxisLabels}>
            <ThemedText style={[styles.axisLabel, { color: mutedColor }]}>+$16</ThemedText>
            <ThemedText style={[styles.axisLabel, { color: mutedColor }]}>$0</ThemedText>
          </View>

          {/* Chart SVG */}
          <Svg width={SCREEN_WIDTH - 48} height={160} style={styles.chartSvg}>
            <Defs>
              {outcomes.map((outcome) => (
                <LinearGradient
                  key={`gradient-${outcome.id}`}
                  id={`gradient-${outcome.id}`}
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <Stop
                    offset="0%"
                    stopColor={getOutcomeColor(outcome, outcome.id === leadingOutcome.id)}
                    stopOpacity={0.2}
                  />
                  <Stop
                    offset="100%"
                    stopColor={getOutcomeColor(outcome, outcome.id === leadingOutcome.id)}
                    stopOpacity={0}
                  />
                </LinearGradient>
              ))}
            </Defs>

            {/* Grid lines */}
            <Line x1="16" y1="80" x2={SCREEN_WIDTH - 64} y2="80" stroke={borderColor} strokeWidth={1} strokeDasharray="4,4" />

            {/* Outcome paths */}
            {outcomes.map((outcome) => {
              const color = getOutcomeColor(outcome, outcome.id === leadingOutcome.id);
              const path = generatePath(outcome.id);
              return (
                <Path
                  key={`path-${outcome.id}`}
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              );
            })}

            {/* End dots for each outcome */}
            {outcomes.map((outcome) => {
              const color = getOutcomeColor(outcome, outcome.id === leadingOutcome.id);
              const lastY = 160 - 16 - outcome.probability * (160 - 32);
              return (
                <Circle
                  key={`dot-${outcome.id}`}
                  cx={SCREEN_WIDTH - 64}
                  cy={lastY}
                  r={4}
                  fill={color}
                />
              );
            })}
          </Svg>

          {/* Bottom value label */}
          <View style={styles.chartBottomLabel}>
            <ThemedText style={[styles.chartValueLabel, { color: mutedColor }]}>
              +${((leadingOutcome.probability - 0.5) * 400 + 211).toFixed(2)}
            </ThemedText>
          </View>
        </View>

        {/* Time Period Selector */}
        <View style={[styles.periodSelector, { backgroundColor: cardBg }]}>
          {(['GAME', '1D', '1W', '1M', 'ALL'] as TimePeriod[]).map((period) => (
            <Pressable
              key={period}
              onPress={() => setSelectedPeriod(period)}
              style={[
                styles.periodButton,
                selectedPeriod === period && styles.periodButtonActive,
              ]}
            >
              <ThemedText
                style={[
                  styles.periodText,
                  { color: selectedPeriod === period ? textColor : mutedColor },
                ]}
              >
                {period}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Make your prediction */}
        <View style={styles.predictionSection}>
          <ThemedText style={styles.sectionTitle}>Make your prediction</ThemedText>

          <View style={styles.predictionButtons}>
            {outcomes.map((outcome) => {
              const isSelected = selectedOutcomeId === outcome.id;
              const isLeading = outcome.id === leadingOutcome.id;
              const color = getOutcomeColor(outcome, isLeading);

              return (
                <Pressable
                  key={outcome.id}
                  onPress={() => handleOutcomePress(outcome.id)}
                  style={[
                    styles.predictionButton,
                    { borderColor: isSelected ? color : borderColor },
                    isSelected && { backgroundColor: `${color}15` },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.predictionButtonText,
                      { color: isSelected ? color : textColor },
                    ]}
                  >
                    {outcome.label} {(outcome.probability * 100).toFixed(0)}%
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Place bet button (shown when outcome selected) */}
          {selectedOutcomeId && (
            <Pressable
              onPress={() => handlePlaceBet(10)}
              style={[
                styles.placeBetButton,
                {
                  backgroundColor: getOutcomeColor(
                    outcomes.find((o) => o.id === selectedOutcomeId)!,
                    selectedOutcomeId === leadingOutcome.id
                  ),
                },
              ]}
            >
              <ThemedText style={styles.placeBetText}>
                Bet $10 on {outcomes.find((o) => o.id === selectedOutcomeId)?.label}
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Your Position (if exists) */}
        {hasPosition && position && (
          <View style={[styles.positionCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.positionHeader}>
              <ThemedText style={[styles.positionTitle, { color: mutedColor }]}>
                YOUR POSITION
              </ThemedText>
              <View
                style={[
                  styles.positionSideBadge,
                  {
                    backgroundColor:
                      position.side === 'yes'
                        ? `${positiveColor}20`
                        : `${negativeColor}20`,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.positionSideText,
                    { color: position.side === 'yes' ? positiveColor : negativeColor },
                  ]}
                >
                  {position.side.toUpperCase()}
                </ThemedText>
              </View>
            </View>

            <View style={styles.positionGrid}>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>
                  Shares
                </ThemedText>
                <ThemedText style={styles.positionValue}>{position.shares}</ThemedText>
              </View>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>
                  Value
                </ThemedText>
                <ThemedText style={styles.positionValue}>
                  ${position.currentValue.toFixed(2)}
                </ThemedText>
              </View>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>
                  Avg Price
                </ThemedText>
                <ThemedText style={styles.positionValueSmall}>
                  ${position.avgPrice.toFixed(2)}
                </ThemedText>
              </View>
              <View style={styles.positionItem}>
                <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>
                  P&L
                </ThemedText>
                <ThemedText
                  style={[
                    styles.positionValueSmall,
                    { color: position.pnl >= 0 ? positiveColor : negativeColor },
                  ]}
                >
                  {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} (
                  {position.pnlPercent.toFixed(1)}%)
                </ThemedText>
              </View>
            </View>

            <Pressable
              onPress={onSell}
              style={[styles.sellButton, { borderColor: `${negativeColor}30` }]}
            >
              <ThemedText style={[styles.sellButtonText, { color: negativeColor }]}>
                Sell Position
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* About Section */}
        <View style={[styles.aboutSection, { backgroundColor: cardBg }]}>
          <ThemedText style={styles.sectionTitle}>About</ThemedText>
          <ThemedText style={[styles.aboutText, { color: mutedColor }]}>
            {market.description ||
              `Predict the outcome of "${market.question}". Earn $1 per contract when you're right, or close your position before the event resolves.`}
          </ThemedText>

          <View style={styles.aboutMeta}>
            <View style={styles.aboutMetaRow}>
              <ThemedText style={[styles.aboutMetaLabel, { color: mutedColor }]}>
                Resolution Source
              </ThemedText>
              <ThemedText style={styles.aboutMetaValue}>
                {market.resolutionSource || 'Official Announcement'}
              </ThemedText>
            </View>
            <View style={styles.aboutMetaRow}>
              <ThemedText style={[styles.aboutMetaLabel, { color: mutedColor }]}>
                Expires
              </ThemedText>
              <ThemedText style={styles.aboutMetaValue}>{market.expiresIn}</ThemedText>
            </View>
          </View>
        </View>

        {/* Timeline Section */}
        <View style={[styles.timelineSection, { borderTopColor: borderColor }]}>
          <Pressable style={styles.timelineHeader}>
            <ThemedText style={styles.sectionTitle}>Timeline and Activity</ThemedText>
            <Ionicons name="chevron-down" size={20} color={mutedColor} />
          </Pressable>
        </View>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  liveMinutes: {
    fontSize: 11,
    fontWeight: '500',
    color: '#EF4444',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  // Sports Match Header
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  teamContainer: {
    alignItems: 'center',
    flex: 1,
  },
  teamShortName: {
    fontSize: 28,
    fontWeight: '700',
  },
  teamFullName: {
    fontSize: 12,
    marginTop: 4,
  },
  scoreContainer: {
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 32,
    fontWeight: '600',
  },
  volumeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  volumeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Regular Question Header
  questionHeader: {
    paddingVertical: 16,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    marginBottom: 12,
  },
  // Outcomes Row
  outcomesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingBottom: 16,
  },
  outcomeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  outcomeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  outcomeLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  // P&L Display
  pnlContainer: {
    paddingBottom: 8,
  },
  pnlText: {
    fontSize: 24,
    fontWeight: '600',
  },
  // Chart
  chartContainer: {
    marginBottom: 8,
  },
  yAxisLabels: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  axisLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  chartSvg: {
    marginLeft: 32,
  },
  chartBottomLabel: {
    marginTop: 4,
    marginLeft: 32,
  },
  chartValueLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Period Selector
  periodSelector: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Prediction Section
  predictionSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  predictionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  predictionButton: {
    flexGrow: 1,
    minWidth: 100,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  predictionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  placeBetButton: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  placeBetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Position Card
  positionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  positionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  positionSideBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  positionSideText: {
    fontSize: 11,
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
  sellButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
  },
  sellButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // About Section
  aboutSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  aboutMeta: {
    gap: 8,
  },
  aboutMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aboutMetaLabel: {
    fontSize: 13,
  },
  aboutMetaValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Timeline Section
  timelineSection: {
    borderTopWidth: 1,
    paddingTop: 16,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
