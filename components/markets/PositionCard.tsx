import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { PressableScale } from 'pressto';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { positiveColor, negativeColor } from '@/constants/theme';

export interface MarketPosition {
  side: string;
  shares: number;
  avgPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface PositionCardProps {
  position: MarketPosition;
  onSell?: () => void;
  style?: ViewStyle;
}

export const PositionCard = React.memo(function PositionCard({
  position,
  onSell,
  style,
}: PositionCardProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const sideColor = position.side === 'yes' ? positiveColor : negativeColor;
  const pnlColor = position.pnl >= 0 ? positiveColor : negativeColor;

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor }, style]}>
      <View style={styles.header}>
        <ThemedText style={[styles.title, { color: mutedColor }]}>
          YOUR POSITION
        </ThemedText>
        <View style={[styles.sideBadge, { backgroundColor: `${sideColor}20` }]}>
          <ThemedText style={[styles.sideText, { color: sideColor }]}>
            {position.side.toUpperCase()}
          </ThemedText>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <ThemedText style={[styles.label, { color: mutedColor }]}>
            Shares
          </ThemedText>
          <ThemedText style={styles.value}>{position.shares}</ThemedText>
        </View>
        <View style={styles.gridItem}>
          <ThemedText style={[styles.label, { color: mutedColor }]}>
            Value
          </ThemedText>
          <ThemedText style={styles.value}>
            ${position.currentValue.toFixed(2)}
          </ThemedText>
        </View>
        <View style={styles.gridItem}>
          <ThemedText style={[styles.label, { color: mutedColor }]}>
            Avg Price
          </ThemedText>
          <ThemedText style={styles.valueSmall}>
            ${position.avgPrice.toFixed(2)}
          </ThemedText>
        </View>
        <View style={styles.gridItem}>
          <ThemedText style={[styles.label, { color: mutedColor }]}>
            P&L
          </ThemedText>
          <ThemedText style={[styles.valueSmall, { color: pnlColor }]}>
            {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} (
            {position.pnlPercent.toFixed(1)}%)
          </ThemedText>
        </View>
      </View>

      {onSell && (
        <PressableScale
          onPress={onSell}
          style={[styles.sellButton, { borderColor: `${negativeColor}30` }]}
        >
          <ThemedText style={[styles.sellButtonText, { color: negativeColor }]}>
            Sell Position
          </ThemedText>
        </PressableScale>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  sideBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sideText: {
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridItem: {
    width: '45%',
  },
  label: {
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: '500',
  },
  valueSmall: {
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
});
