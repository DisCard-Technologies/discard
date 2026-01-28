import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { PressableScale } from 'pressto';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

export type TimePeriod = 'H' | 'D' | 'W' | 'M' | 'Y' | 'Max' | 'GAME' | '1D' | '1W' | '1M' | 'ALL';

export interface TimePeriodSelectorProps {
  periods: TimePeriod[];
  selectedPeriod: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  style?: ViewStyle;
}

export const TimePeriodSelector = React.memo(function TimePeriodSelector({
  periods,
  selectedPeriod,
  onPeriodChange,
  style,
}: TimePeriodSelectorProps) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const activeBg = useThemeColor({ light: '#ffffff', dark: '#2a2a2c' }, 'background');

  const handlePeriodPress = (period: TimePeriod) => {
    Haptics.selectionAsync();
    onPeriodChange(period);
  };

  return (
    <View style={[styles.container, { backgroundColor: cardBg }, style]}>
      {periods.map((period) => (
        <PressableScale
          key={period}
          onPress={() => handlePeriodPress(period)}
          style={[
            styles.periodButton,
            selectedPeriod === period && [styles.periodButtonActive, { backgroundColor: activeBg }],
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
        </PressableScale>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
  },
  periodButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
