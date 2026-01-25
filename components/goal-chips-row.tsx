import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GoalChip, OverflowChip } from '@/components/goal-chip';

export interface GoalChipData {
  id: string;
  icon: string;
  value: number;
  type: 'percentage' | 'currency';
  attention?: 'normal' | 'warning' | 'critical';
  queryPrompt: string;
}

export interface GoalChipsRowProps {
  goals: GoalChipData[];
  maxVisible?: number;
  onChipPress: (goal: GoalChipData) => void;
  onOverflowPress: () => void;
  visible?: boolean;
}

export function GoalChipsRow({
  goals,
  maxVisible = 3,
  onChipPress,
  onOverflowPress,
  visible = true,
}: GoalChipsRowProps) {
  if (!visible || goals.length === 0) {
    return null;
  }

  const visibleGoals = goals.slice(0, maxVisible);
  const overflowCount = goals.length - maxVisible;
  const hasOverflow = overflowCount > 0;

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      {visibleGoals.map((goal) => (
        <GoalChip
          key={goal.id}
          icon={goal.icon}
          value={goal.value}
          type={goal.type}
          attention={goal.attention}
          onPress={() => onChipPress(goal)}
        />
      ))}
      {hasOverflow && (
        <OverflowChip count={overflowCount} onPress={onOverflowPress} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
