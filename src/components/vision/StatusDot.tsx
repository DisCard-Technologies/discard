import React from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface StatusDotProps {
  color?: 'primary' | 'accent' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const sizeStyles: Record<string, number> = {
  sm: 6,
  md: 8,
  lg: 12,
};

const colorStyles: Record<string, string> = {
  primary: '#10B981',
  accent: '#10B981',
  destructive: '#EF4444',
};

export function StatusDot({ 
  color = 'primary', 
  size = 'md', 
  animated = true,
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

  const dotSize = sizeStyles[size];
  const dotColor = colorStyles[color];

  const dotStyle: ViewStyle = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: dotColor,
  };

  return (
    <Animated.View style={animatedStyle}>
      <View style={dotStyle} />
    </Animated.View>
  );
}

