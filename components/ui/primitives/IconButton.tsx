import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useThemeColor } from '@/hooks/use-theme-color';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'default' | 'filled' | 'outline';

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  iconColor?: string;
  haptic?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

const SIZE_CONFIG = {
  sm: { button: 32, icon: 16 },
  md: { button: 40, icon: 20 },
  lg: { button: 52, icon: 24 },
};

export const IconButton = React.memo(function IconButton({
  icon,
  size = 'md',
  variant = 'default',
  iconColor,
  haptic = true,
  disabled,
  onPress,
  style,
}: IconButtonProps) {
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedIconColor = iconColor ?? textColor;

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case 'filled':
        return { backgroundColor: cardBg };
      case 'outline':
        return { backgroundColor: 'transparent', borderWidth: 1, borderColor };
      case 'default':
      default:
        return {};
    }
  };

  const handlePress = () => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  return (
    <PressableScale
      onPress={handlePress}
      enabled={!disabled}
      style={[
        styles.container,
        {
          width: sizeConfig.button,
          height: sizeConfig.button,
          borderRadius: sizeConfig.button / 2,
        },
        getVariantStyles(),
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={sizeConfig.icon} color={resolvedIconColor} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
