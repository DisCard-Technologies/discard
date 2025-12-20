import React from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { cn } from '../../lib/utils';

interface StatusDotProps {
  color?: 'primary' | 'accent' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

const colorClasses = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  destructive: 'bg-destructive',
};

export function StatusDot({ 
  color = 'primary', 
  size = 'md', 
  animated = true,
  className 
}: StatusDotProps) {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    if (animated) {
      opacity.value = withRepeat(
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [animated]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: animated ? opacity.value : 1,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View className={cn(
        'rounded-full',
        sizeClasses[size],
        colorClasses[color],
        className
      )} />
    </Animated.View>
  );
}

