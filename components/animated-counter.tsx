import { useEffect, useState } from 'react';
import { StyleSheet, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { useThemeColor } from '@/hooks/use-theme-color';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
  decimals?: number;
  testID?: string;
}

export function AnimatedCounter({
  value,
  prefix = '$',
  suffix = '',
  style,
  decimals = 0,
  testID,
}: AnimatedCounterProps) {
  const textColor = useThemeColor({}, 'text');
  const animatedValue = useSharedValue(value);
  const [displayText, setDisplayText] = useState(formatValue(value, prefix, suffix, decimals));

  function formatValue(val: number, pre: string, suf: string, dec: number): string {
    const rounded = dec > 0 ? val.toFixed(dec) : Math.round(val);
    return `${pre}${Number(rounded).toLocaleString()}${suf}`;
  }

  const updateDisplay = (val: number) => {
    setDisplayText(formatValue(val, prefix, suffix, decimals));
  };

  useEffect(() => {
    animatedValue.value = withSpring(value, {
      damping: 20,
      stiffness: 50,
      mass: 1,
    });
  }, [value]);

  useAnimatedReaction(
    () => animatedValue.value,
    (currentValue) => {
      runOnJS(updateDisplay)(currentValue);
    },
    [prefix, suffix, decimals]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(1, {
          damping: 15,
          stiffness: 100,
        }),
      },
    ],
  }));

  return (
    <Animated.Text
      testID={testID}
      style={[
        styles.counter,
        { color: textColor },
        style,
        animatedStyle,
      ]}
    >
      {displayText}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  counter: {
    fontSize: 56,
    fontWeight: '600',
    letterSpacing: -2,
  },
});
