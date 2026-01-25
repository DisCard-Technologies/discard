import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

export interface MarketTeam {
  name: string;
  shortName: string;
  score?: number;
}

export interface MarketHeaderProps {
  question: string;
  volume: string;
  isLive?: boolean;
  liveMinutes?: number;
  homeTeam?: MarketTeam;
  awayTeam?: MarketTeam;
  style?: ViewStyle;
}

export const MarketHeader = React.memo(function MarketHeader({
  question,
  volume,
  isLive,
  liveMinutes,
  homeTeam,
  awayTeam,
  style,
}: MarketHeaderProps) {
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');

  const isSportsMatch = !!(homeTeam && awayTeam);

  if (isSportsMatch) {
    return (
      <View style={[styles.matchHeader, style]}>
        <View style={styles.teamContainer}>
          <ThemedText style={[styles.teamShortName, { color: primaryColor }]}>
            {homeTeam!.shortName}
          </ThemedText>
          <ThemedText style={[styles.teamFullName, { color: mutedColor }]}>
            {homeTeam!.name}
          </ThemedText>
        </View>

        <View style={styles.scoreContainer}>
          <ThemedText style={styles.scoreText}>
            {homeTeam!.score ?? '-'} - {awayTeam!.score ?? '-'}
          </ThemedText>
          <View style={[styles.volumeBadge, { backgroundColor: cardBg }]}>
            <ThemedText style={[styles.volumeText, { color: mutedColor }]}>
              {volume} Vol.
            </ThemedText>
          </View>
        </View>

        <View style={styles.teamContainer}>
          <ThemedText style={[styles.teamShortName, { color: '#F87171' }]}>
            {awayTeam!.shortName}
          </ThemedText>
          <ThemedText style={[styles.teamFullName, { color: mutedColor }]}>
            {awayTeam!.name}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.questionHeader, style]}>
      <ThemedText style={styles.questionText}>{question}</ThemedText>
      <View style={[styles.volumeBadge, { backgroundColor: cardBg }]}>
        <ThemedText style={[styles.volumeText, { color: mutedColor }]}>
          {volume} Vol.
        </ThemedText>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
});
