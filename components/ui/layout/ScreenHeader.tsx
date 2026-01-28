import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    activeColor?: string;
    isActive?: boolean;
  };
  centerContent?: React.ReactNode;
  style?: ViewStyle;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightAction,
  centerContent,
  style,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  };

  const handleRightAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    rightAction?.onPress();
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }, style]}>
      {onBack ? (
        <PressableScale
          onPress={handleBack}
          style={[
            styles.headerButton,
            { backgroundColor: cardBg },
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={textColor} />
        </PressableScale>
      ) : (
        <View style={styles.headerButton} />
      )}

      {centerContent ? (
        <View style={styles.headerCenter}>{centerContent}</View>
      ) : (
        <View style={styles.headerCenter}>
          {title && <ThemedText style={styles.headerTitle}>{title}</ThemedText>}
          {subtitle && (
            <ThemedText style={[styles.headerSubtitle, { color: mutedColor }]}>
              {subtitle}
            </ThemedText>
          )}
        </View>
      )}

      {rightAction ? (
        <PressableScale
          onPress={handleRightAction}
          style={[
            styles.headerButton,
            { backgroundColor: cardBg },
          ]}
        >
          <Ionicons
            name={rightAction.icon}
            size={20}
            color={rightAction.isActive ? rightAction.activeColor : mutedColor}
          />
        </PressableScale>
      ) : (
        <View style={styles.headerButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
