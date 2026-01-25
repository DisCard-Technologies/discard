import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Button, ButtonProps } from '../primitives/Button';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: {
    title: string;
    onPress: () => void;
    variant?: ButtonProps['variant'];
  };
  style?: ViewStyle;
}

export function EmptyState({
  icon = 'folder-open-outline',
  title,
  description,
  action,
  style,
}: EmptyStateProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconContainer, { backgroundColor: `${mutedColor}15` }]}>
        <Ionicons name={icon} size={32} color={mutedColor} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {description && (
        <ThemedText style={[styles.description, { color: mutedColor }]}>
          {description}
        </ThemedText>
      )}
      {action && (
        <Button
          title={action.title}
          onPress={action.onPress}
          variant={action.variant ?? 'primary'}
          size="md"
          style={styles.actionButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  actionButton: {
    marginTop: 8,
  },
});
