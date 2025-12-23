import React from 'react';
import { View, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  noPadding?: boolean;
}

export function GlassCard({ children, className, style, intensity = 20, noPadding = false }: GlassCardProps) {
  // On web, BlurView doesn't work well, use NativeWind classes
  if (Platform.OS === 'web') {
    return (
      <View
        className={`bg-white/5 border border-white/10 rounded-2xl overflow-hidden ${noPadding ? '' : 'p-4'} ${className || ''}`}
        style={style}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      className={`rounded-2xl overflow-hidden border border-white/10 bg-white/5 ${className || ''}`}
      style={style}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        className={noPadding ? '' : 'p-4'}
      >
        {children}
      </BlurView>
    </View>
  );
}

