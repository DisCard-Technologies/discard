import React, { useMemo } from 'react';
import { StyleSheet, View, Pressable, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { positiveColor, negativeColor } from '@/constants/theme';

export interface MarketOutcome {
  id: string;
  label: string;
  probability: number;
  icon?: string;
  scoreBadge?: string;
  color?: string;
}

export interface OutcomeProbabilitiesProps {
  outcomes: MarketOutcome[];
  selectedOutcomeId?: string | null;
  onOutcomePress?: (outcomeId: string) => void;
  showProbabilityDots?: boolean;
  style?: ViewStyle;
}

export const OutcomeProbabilities = React.memo(function OutcomeProbabilities({
  outcomes,
  selectedOutcomeId,
  onOutcomePress,
  showProbabilityDots = true,
  style,
}: OutcomeProbabilitiesProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const leadingOutcome = useMemo(() => {
    return outcomes.reduce((max, o) => (o.probability > max.probability ? o : max));
  }, [outcomes]);

  const getOutcomeColor = (outcome: MarketOutcome): string => {
    if (outcome.color) return outcome.color;
    if (outcome.id === 'yes') return positiveColor;
    if (outcome.id === 'no') return negativeColor;
    if (outcome.id === leadingOutcome.id) return '#F87171';
    return mutedColor;
  };

  if (showProbabilityDots) {
    return (
      <View style={[styles.dotsContainer, style]}>
        {outcomes.map((outcome) => {
          const color = getOutcomeColor(outcome);
          return (
            <View key={outcome.id} style={styles.dotItem}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <ThemedText style={[styles.dotLabel, { color: mutedColor }]}>
                {outcome.label} {(outcome.probability * 100).toFixed(0)}%
              </ThemedText>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.buttonsContainer, style]}>
      {outcomes.map((outcome) => {
        const isSelected = selectedOutcomeId === outcome.id;
        const color = getOutcomeColor(outcome);

        return (
          <Pressable
            key={outcome.id}
            onPress={() => onOutcomePress?.(outcome.id)}
            style={[
              styles.outcomeButton,
              { borderColor: isSelected ? color : borderColor },
              isSelected && { backgroundColor: `${color}15` },
            ]}
          >
            <ThemedText
              style={[
                styles.outcomeButtonText,
                { color: isSelected ? color : textColor },
              ]}
            >
              {outcome.label} {(outcome.probability * 100).toFixed(0)}%
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  // Probability dots display
  dotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingBottom: 16,
  },
  dotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLabel: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Selectable buttons
  buttonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  outcomeButton: {
    flexGrow: 1,
    minWidth: 100,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  outcomeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
