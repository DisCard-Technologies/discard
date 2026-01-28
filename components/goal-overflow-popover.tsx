import { useEffect } from 'react';
import { View, StyleSheet, Pressable, Modal } from 'react-native';
import { PressableScale } from 'pressto';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GoalChipData } from '@/components/goal-chips-row';

export interface GoalOverflowPopoverProps {
  visible: boolean;
  goals: GoalChipData[];
  onGoalPress: (goal: GoalChipData) => void;
  onClose: () => void;
}

const springConfig = {
  damping: 20,
  stiffness: 300,
};

export function GoalOverflowPopover({
  visible,
  goals,
  onGoalPress,
  onClose,
}: GoalOverflowPopoverProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 150 });
      translateY.value = withSpring(0, springConfig);
      scale.value = withSpring(1, springConfig);
    } else {
      opacity.value = withTiming(0, { duration: 100 });
      translateY.value = withTiming(10, { duration: 100 });
      scale.value = withTiming(0.95, { duration: 100 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleGoalPress = (goal: GoalChipData) => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onGoalPress(goal);
  };

  if (!visible && opacity.value === 0) {
    return null;
  }

  const bgColor = isDark ? '#1F2937' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const itemHoverBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.popover,
            { backgroundColor: bgColor, borderColor },
            animatedStyle,
          ]}
        >
          <View style={styles.header}>
            <ThemedText style={styles.headerText}>More Goals</ThemedText>
          </View>
          {goals.map((goal) => (
            <PressableScale
              key={goal.id}
              onPress={() => handleGoalPress(goal)}
              style={[
                styles.goalItem,
              ]}
            >
              <ThemedText style={styles.goalIcon}>{goal.icon}</ThemedText>
              <View style={styles.goalInfo}>
                <ThemedText style={styles.goalPrompt} numberOfLines={1}>
                  {goal.queryPrompt.replace('Tell me about my ', '').replace(' goal', '')}
                </ThemedText>
                <ThemedText style={[
                  styles.goalValue,
                  goal.attention === 'warning' && styles.goalValueWarning,
                  goal.attention === 'critical' && styles.goalValueCritical,
                ]}>
                  {goal.type === 'percentage' ? `${goal.value}%` : `$${goal.value}`}
                </ThemedText>
              </View>
            </PressableScale>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 140, // Position above the dock
    paddingHorizontal: 16,
  },
  popover: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: 280,
    alignSelf: 'flex-end',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6B7280',
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  goalIcon: {
    fontSize: 18,
  },
  goalInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalPrompt: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  goalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },
  goalValueWarning: {
    color: '#F59E0B',
  },
  goalValueCritical: {
    color: '#EF4444',
  },
});
