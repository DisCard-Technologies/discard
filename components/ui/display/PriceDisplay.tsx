import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { positiveColor, negativeColor } from '@/constants/theme';

export interface PriceDisplayProps {
  price: number;
  change?: number;
  changeLabel?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showBadge?: boolean;
  prefix?: string;
  style?: ViewStyle;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

const SIZE_CONFIG = {
  sm: { price: 16, change: 12 },
  md: { price: 20, change: 14 },
  lg: { price: 28, change: 16 },
  hero: { price: 32, change: 14 },
};

export const PriceDisplay = React.memo(function PriceDisplay({
  price,
  change,
  changeLabel = '24h',
  size = 'md',
  showBadge = false,
  prefix = '$',
  style,
}: PriceDisplayProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  const isPositive = (change ?? 0) >= 0;
  const changeColor = isPositive ? positiveColor : negativeColor;
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <View style={[styles.container, style]}>
      <ThemedText style={[styles.price, { fontSize: sizeConfig.price }]}>
        {prefix}{formatPrice(price)}
      </ThemedText>
      {change !== undefined && (
        <View style={styles.changeRow}>
          {showBadge ? (
            <View style={[styles.changeBadge, { backgroundColor: `${changeColor}20` }]}>
              <ThemedText style={[styles.changeText, { fontSize: sizeConfig.change, color: changeColor }]}>
                {isPositive ? '+' : ''}{change.toFixed(2)}%
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={[styles.changeText, { fontSize: sizeConfig.change, color: changeColor }]}>
              {isPositive ? '+' : ''}{change.toFixed(2)}%
            </ThemedText>
          )}
          {changeLabel && (
            <ThemedText style={[styles.changeLabel, { color: mutedColor, fontSize: sizeConfig.change }]}>
              {changeLabel}
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  price: {
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changeText: {
    fontWeight: '600',
  },
  changeLabel: {
    fontSize: 14,
  },
});
