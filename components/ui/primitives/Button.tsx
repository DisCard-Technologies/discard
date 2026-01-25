import React from 'react';
import { StyleSheet, Pressable, PressableProps, ViewStyle, TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { primaryColor } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  haptic?: boolean;
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
  ...props
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

  const handlePress = (e: any) => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        variantStyles.container,
        sizeStyles.container,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
      {...props}
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
    </Pressable>
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
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
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
