import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Attention state colors
const ATTENTION_COLORS = {
  normal: {
    light: 'rgba(0,0,0,0.06)',
    dark: 'rgba(255,255,255,0.1)',
    border: 'transparent',
  },
  warning: {
    light: 'rgba(245, 158, 11, 0.15)',
    dark: 'rgba(245, 158, 11, 0.2)',
    border: 'rgba(245, 158, 11, 0.5)',
  },
  critical: {
    light: 'rgba(239, 68, 68, 0.15)',
    dark: 'rgba(239, 68, 68, 0.2)',
    border: 'rgba(239, 68, 68, 0.5)',
  },
};

export interface GoalChipProps {
  icon: string;
  value: number;
  type: 'percentage' | 'currency';
  attention?: 'normal' | 'warning' | 'critical';
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GoalChip({
  icon,
  value,
  type,
  attention = 'normal',
  onPress,
}: GoalChipProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scale = useSharedValue(1);

  const colors = ATTENTION_COLORS[attention];
  const bgColor = isDark ? colors.dark : colors.light;
  const borderColor = colors.border;

  // Format the value based on type
  const formattedValue = type === 'percentage'
    ? `${Math.round(value)}%`
    : `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.chip,
        { backgroundColor: bgColor, borderColor },
        attention !== 'normal' && styles.chipAttention,
        animatedStyle,
      ]}
    >
      <ThemedText style={styles.icon}>{icon}</ThemedText>
      <ThemedText style={[
        styles.value,
        attention === 'warning' && styles.valueWarning,
        attention === 'critical' && styles.valueCritical,
      ]}>
        {formattedValue}
      </ThemedText>
    </AnimatedPressable>
  );
}

// Overflow chip component (+N)
export interface OverflowChipProps {
  count: number;
  onPress?: () => void;
}

export function OverflowChip({ count, onPress }: OverflowChipProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scale = useSharedValue(1);

  const bgColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.chip, { backgroundColor: bgColor }, animatedStyle]}
    >
      <ThemedText style={styles.overflowText}>+{count}</ThemedText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipAttention: {
    borderWidth: 1,
  },
  icon: {
    fontSize: 12,
  },
  value: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  valueWarning: {
    color: '#F59E0B',
  },
  valueCritical: {
    color: '#EF4444',
  },
  overflowText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
});
