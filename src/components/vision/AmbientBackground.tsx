import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AmbientBackgroundProps {
  children: React.ReactNode;
}

export function AmbientBackground({ children }: AmbientBackgroundProps) {
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} className="bg-background">
      {/* Top gradient blob */}
      <Animated.View 
        style={[
          {
            position: 'absolute',
            top: '10%',
            left: '50%',
            width: 600,
            height: 600,
            marginLeft: -300,
            marginTop: -300,
            borderRadius: 300,
          },
          animatedStyle
        ]}
      >
        <LinearGradient
          colors={['#10B981', 'transparent']}
          style={{ width: '100%', height: '100%', borderRadius: 300 }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Bottom gradient blob */}
      <Animated.View 
        style={[
          {
            position: 'absolute',
            bottom: '20%',
            left: '50%',
            width: 400,
            height: 400,
            marginLeft: -200,
            marginBottom: -200,
            borderRadius: 200,
          },
          animatedStyle
        ]}
      >
        <LinearGradient
          colors={['#3B82F6', 'transparent']}
          style={{ width: '100%', height: '100%', borderRadius: 200 }}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
        />
      </Animated.View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {children}
      </View>
    </View>
  );
}

