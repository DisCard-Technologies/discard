import { StyleSheet, View } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { PredictionMarket, MarketOutcome } from '@/types/holdings.types';
import {
  marketToOutcomes,
  formatVolume,
  getLeadingOutcome,
  isMarketLive,
  formatProbability,
  getCategoryLabel,
} from '@/lib/market-helpers';

interface MarketCardProps {
  market: PredictionMarket;
  onPress?: () => void;
}

const LEADING_COLOR = '#F87171'; // Coral/red for leading probability
const LIVE_DOT_COLOR = '#10B981'; // Green for live indicator

export function MarketCard({ market, onPress }: MarketCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const outcomes = marketToOutcomes(market);
  const leadingOutcome = getLeadingOutcome(outcomes);
  const isLive = isMarketLive(market);

  const handlePress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  return (
    <PressableScale
      onPress={handlePress}
      style={[
        styles.container,
        { backgroundColor: cardBg, borderColor },
      ]}
    >
      {/* Header: Title + Live badge */}
      <View style={styles.header}>
        <ThemedText style={styles.title} numberOfLines={2}>
          {market.question}
        </ThemedText>
        {isLive && (
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, { backgroundColor: LIVE_DOT_COLOR }]} />
            <ThemedText style={styles.liveText}>LIVE</ThemedText>
          </View>
        )}
      </View>

      {/* Outcomes list */}
      <View style={styles.outcomes}>
        {outcomes.map((outcome) => {
          const isLeading = leadingOutcome?.id === outcome.id;
          return (
            <View key={outcome.id} style={styles.outcomeRow}>
              {/* Icon */}
              <View style={[styles.outcomeIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                <Ionicons
                  name={outcome.id === 'yes' ? 'checkmark' : outcome.id === 'no' ? 'close' : 'ellipse'}
                  size={14}
                  color={outcome.id === 'yes' ? '#10B981' : outcome.id === 'no' ? '#EF4444' : mutedColor}
                />
              </View>

              {/* Label */}
              <ThemedText style={styles.outcomeLabel}>{outcome.label}</ThemedText>

              {/* Score badge if present */}
              {outcome.scoreBadge && (
                <View style={[styles.scoreBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                  <ThemedText style={[styles.scoreBadgeText, { color: mutedColor }]}>
                    {outcome.scoreBadge}
                  </ThemedText>
                </View>
              )}

              {/* Spacer */}
              <View style={styles.spacer} />

              {/* Probability pill */}
              <View
                style={[
                  styles.probabilityPill,
                  isLeading
                    ? { backgroundColor: LEADING_COLOR }
                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
                ]}
              >
                <ThemedText
                  style={[
                    styles.probabilityText,
                    isLeading ? styles.probabilityTextLeading : { color: mutedColor },
                  ]}
                >
                  {formatProbability(outcome.probability)}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </View>

      {/* Footer: Volume + Category */}
      <View style={[styles.footer, { borderTopColor: borderColor }]}>
        <ThemedText style={[styles.footerText, { color: mutedColor }]}>
          {formatVolume(market.volume24h)} Vol
        </ThemedText>
        <View style={styles.footerDot}>
          <ThemedText style={[styles.footerDotText, { color: mutedColor }]}>
            ·
          </ThemedText>
        </View>
        <ThemedText style={[styles.footerText, { color: mutedColor }]}>
          {getCategoryLabel(market.category)}
        </ThemedText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  outcomes: {
    gap: 10,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  outcomeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  scoreBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
  },
  probabilityPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  probabilityText: {
    fontSize: 13,
    fontWeight: '700',
  },
  probabilityTextLeading: {
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footerDot: {
    paddingHorizontal: 6,
  },
  footerDotText: {
    fontSize: 12,
  },
});
