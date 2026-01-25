import React from 'react';
import { StyleSheet, View, Image, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

export type TokenIconSize = 'sm' | 'md' | 'lg' | 'xl';

export interface TokenIconProps {
  symbol: string;
  logoUri?: string;
  icon?: string;
  size?: TokenIconSize;
  showBorder?: boolean;
  style?: ViewStyle;
}

const SIZE_CONFIG = {
  sm: { wrapper: 32, image: 28, fontSize: 12, borderWidth: 1 },
  md: { wrapper: 44, image: 40, fontSize: 16, borderWidth: 1 },
  lg: { wrapper: 56, image: 52, fontSize: 18, borderWidth: 2 },
  xl: { wrapper: 68, image: 64, fontSize: 22, borderWidth: 2 },
};

export const TokenIcon = React.memo(function TokenIcon({
  symbol,
  logoUri,
  icon,
  size = 'md',
  showBorder = true,
  style,
}: TokenIconProps) {
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1a1f25' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const config = SIZE_CONFIG[size];
  const displayText = icon || symbol.slice(0, 2);

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: config.wrapper,
          height: config.wrapper,
          borderRadius: config.wrapper / 2,
          borderWidth: showBorder ? config.borderWidth : 0,
          borderColor,
        },
        style,
      ]}
    >
      {logoUri ? (
        <Image
          source={{ uri: logoUri }}
          style={[
            styles.image,
            {
              width: config.image,
              height: config.image,
              borderRadius: config.image / 2,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: config.image,
              height: config.image,
              borderRadius: config.image / 2,
              backgroundColor: cardBg,
            },
          ]}
        >
          <ThemedText style={[styles.placeholderText, { fontSize: config.fontSize }]}>
            {displayText}
          </ThemedText>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    resizeMode: 'cover',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontWeight: '600',
  },
});
