import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { primaryColor } from '@/constants/theme';

export interface TokenAction {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}

export interface TokenActionsProps {
  actions: TokenAction[];
  variant?: 'circular' | 'horizontal';
  style?: ViewStyle;
}

export const TokenActions = React.memo(function TokenActions({
  actions,
  variant = 'circular',
  style,
}: TokenActionsProps) {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const handlePress = (action: TokenAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action.onPress?.();
  };

  if (variant === 'circular') {
    return (
      <View style={[styles.circularContainer, style]}>
        {actions.map((action) => (
          <PressableScale
            key={action.id}
            onPress={() => handlePress(action)}
            style={styles.circularButton}
          >
            <View style={[styles.circularIconContainer, { backgroundColor: cardBg, borderColor }]}>
              <Ionicons name={action.icon} size={20} color={textColor} />
            </View>
            <ThemedText style={[styles.circularLabel, { color: mutedColor }]}>
              {action.label}
            </ThemedText>
          </PressableScale>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.horizontalContainer, style]}>
      {actions.map((action, index) => (
        <PressableScale
          key={action.id}
          onPress={() => handlePress(action)}
          style={[
            styles.horizontalButton,
            index === 0 && { backgroundColor: primaryColor },
            index !== 0 && { backgroundColor: cardBg, borderWidth: 1, borderColor },
          ]}
        >
          <Ionicons
            name={action.icon}
            size={20}
            color={index === 0 ? '#fff' : textColor}
          />
          <ThemedText
            style={[
              styles.horizontalLabel,
              index === 0 && styles.horizontalLabelPrimary,
            ]}
          >
            {action.label}
          </ThemedText>
        </PressableScale>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  // Circular variant (for owned tokens)
  circularContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  circularButton: {
    alignItems: 'center',
    gap: 6,
  },
  circularIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularLabel: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Horizontal variant (for non-owned tokens)
  horizontalContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  horizontalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  horizontalLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  horizontalLabelPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
