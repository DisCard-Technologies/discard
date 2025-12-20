import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { cn } from '../../lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

export function GlassCard({ children, className, style, intensity = 20 }: GlassCardProps) {
  return (
    <View 
      className={cn(
        'rounded-2xl overflow-hidden border border-border/30',
        className
      )}
      style={style}
    >
      <BlurView 
        intensity={intensity} 
        tint="dark"
        className="p-4"
      >
        {children}
      </BlurView>
    </View>
  );
}

