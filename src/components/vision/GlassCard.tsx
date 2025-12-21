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
  const containerStyle: ViewStyle = {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  };

  const contentStyle: ViewStyle = {
    padding: noPadding ? 0 : 16,
  };

  // On web, BlurView doesn't work well, use a simple background
  if (Platform.OS === 'web') {
    return (
      <View style={[containerStyle, contentStyle, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      <BlurView 
        intensity={intensity} 
        tint="dark"
        style={contentStyle}
      >
        {children}
      </BlurView>
    </View>
  );
}

