import React from 'react';
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { PressableScale } from 'pressto';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { primaryColor } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  haptic?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button = React.memo(function Button({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  fullWidth = false,
  haptic = true,
  disabled,
  onPress,
  style,
  textStyle,
}: ButtonProps) {
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (variant) {
      case 'primary':
        return {
          container: { backgroundColor: primaryColor },
          text: { color: '#fff' },
        };
      case 'secondary':
        return {
          container: { backgroundColor: cardBg },
          text: { color: textColor },
        };
      case 'outline':
        return {
          container: { backgroundColor: 'transparent', borderWidth: 1, borderColor },
          text: { color: textColor },
        };
      case 'ghost':
        return {
          container: { backgroundColor: 'transparent' },
          text: { color: textColor },
        };
    }
  };

  const getSizeStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (size) {
      case 'sm':
        return {
          container: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
          text: { fontSize: 13 },
        };
      case 'md':
        return {
          container: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
          text: { fontSize: 14 },
        };
      case 'lg':
        return {
          container: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14 },
          text: { fontSize: 16 },
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

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
        variantStyles.container,
        sizeStyles.container,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon && iconPosition === 'left' && icon}
      <ThemedText
        style={[
          styles.text,
          variantStyles.text,
          sizeStyles.text,
          icon && iconPosition === 'left' ? styles.textWithLeftIcon : undefined,
          icon && iconPosition === 'right' ? styles.textWithRightIcon : undefined,
          textStyle,
        ]}
      >
        {title}
      </ThemedText>
      {icon && iconPosition === 'right' && icon}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: '600',
  },
  textWithLeftIcon: {
    marginLeft: 8,
  },
  textWithRightIcon: {
    marginRight: 8,
  },
});
