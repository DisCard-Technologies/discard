import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { positiveColor, negativeColor } from '@/constants/theme';
import { TokenIcon } from './TokenIcon';

export interface TokenHeroSectionProps {
  symbol: string;
  name?: string;
  logoUri?: string;
  icon?: string;
  price: number;
  change24h: number;
  owned?: {
    balance: string;
    value: number;
  };
  style?: ViewStyle;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

export const TokenHeroSection = React.memo(function TokenHeroSection({
  symbol,
  logoUri,
  icon,
  price,
  change24h,
  owned,
  style,
}: TokenHeroSectionProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  const isPositive = change24h >= 0;
  const changeColor = isPositive ? positiveColor : negativeColor;

  return (
    <View style={[styles.container, style]}>
      <TokenIcon
        symbol={symbol}
        logoUri={logoUri}
        icon={icon}
        size="xl"
        style={styles.icon}
      />

      {owned ? (
        <>
          <ThemedText style={styles.balance}>
            {owned.balance} {symbol}
          </ThemedText>
          <ThemedText style={[styles.fiatValue, { color: mutedColor }]}>
            ≈ ${owned.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </ThemedText>
        </>
      ) : (
        <>
          <ThemedText style={styles.price}>
            ${formatPrice(price)}
          </ThemedText>
          <View style={styles.changeRow}>
            <View style={[styles.changeBadge, { backgroundColor: `${changeColor}20` }]}>
              <ThemedText style={[styles.changeText, { color: changeColor }]}>
                {isPositive ? '+' : ''}{change24h.toFixed(2)}%
              </ThemedText>
            </View>
            <ThemedText style={[styles.changeLabel, { color: mutedColor }]}>24h</ThemedText>
          </View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  icon: {
    marginBottom: 12,
  },
  balance: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  fiatValue: {
    fontSize: 16,
    marginTop: 4,
  },
  price: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  changeLabel: {
    fontSize: 14,
  },
});
