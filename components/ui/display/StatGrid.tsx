import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

export interface StatItem {
  label: string;
  value: string;
  icon?: keyof typeof Ionicons.glyphMap;
  valueColor?: string;
}

export interface StatGridProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
  style?: ViewStyle;
}

export const StatGrid = React.memo(function StatGrid({
  stats,
  columns = 2,
  style,
}: StatGridProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  const itemWidth = `${100 / columns}%` as const;

  return (
    <View style={[styles.container, style]}>
      {stats.map((stat, index) => (
        <View key={index} style={[styles.statItem, { width: itemWidth }]}>
          <View style={styles.statHeader}>
            <ThemedText style={[styles.statLabel, { color: mutedColor }]}>
              {stat.label}
            </ThemedText>
            {stat.icon && (
              <Ionicons name={stat.icon} size={14} color={mutedColor} />
            )}
          </View>
          <ThemedText
            style={[styles.statValue, stat.valueColor && { color: stat.valueColor }]}
          >
            {stat.value}
          </ThemedText>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingRight: 16,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
  },
});
