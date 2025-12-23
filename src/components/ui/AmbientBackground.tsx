import React from 'react';
import { View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface AmbientBackgroundProps {
  children: React.ReactNode;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function AmbientBackground({ children }: AmbientBackgroundProps) {
  return (
    <View className="flex-1 bg-background">
      {/* Ambient gradient glow at top - matching the vision design */}
      <LinearGradient
        colors={[
          'rgba(16, 185, 129, 0.15)',  // Primary green with opacity
          'rgba(16, 185, 129, 0.08)',
          'rgba(16, 185, 129, 0.02)',
          'transparent',
        ]}
        locations={[0, 0.3, 0.6, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: SCREEN_HEIGHT * 0.45,
        }}
      />
      
      {/* Subtle radial-like effect using elliptical gradient */}
      <View
        style={{
          position: 'absolute',
          top: -SCREEN_HEIGHT * 0.15,
          left: SCREEN_WIDTH * 0.1,
          right: SCREEN_WIDTH * 0.1,
          height: SCREEN_HEIGHT * 0.5,
          borderRadius: SCREEN_WIDTH,
          backgroundColor: 'rgba(16, 185, 129, 0.04)',
        }}
      />
      
      {/* Content */}
      <View className="flex-1">
        {children}
      </View>
    </View>
  );
}

