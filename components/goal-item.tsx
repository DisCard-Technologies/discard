import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { primaryColor } from '@/constants/theme';

export interface Goal {
  id: string;
  title: string;
  target: number;
  current: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  deadline?: string;
}

interface GoalItemProps {
  goal: Goal;
  onPress?: (goal: Goal) => void;
}

export function GoalItem({ goal, onPress }: GoalItemProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');

  const progress = Math.min((goal.current / goal.target) * 100, 100);

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress(goal);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
      onPress={handlePress}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${goal.color}20` }]}>
        <Ionicons name={goal.icon} size={16} color={goal.color} />
      </View>

      <View style={styles.info}>
        <ThemedText style={styles.title}>{goal.title}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          {goal.deadline ? `Target: ${goal.deadline}` : `${Math.round(progress)}% complete`}
        </ThemedText>
      </View>

      <View style={styles.progressContainer}>
        <ThemedText style={styles.progressText}>{Math.round(progress)}%</ThemedText>
        <Ionicons name="chevron-forward" size={20} color={mutedColor} />
      </View>
    </Pressable>
  );
}

interface GoalsSectionProps {
  goals: Goal[];
  onGoalPress?: (goal: Goal) => void;
  onAddGoal?: () => void;
}

export function GoalsSection({ goals, onGoalPress, onAddGoal }: GoalsSectionProps) {
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardColor = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');

  const handleAddGoal = () => {
    if (onAddGoal) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onAddGoal();
    }
  };

  return (
    <View style={styles.section}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.sectionTitle}>Active Goals</ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: cardColor },
            pressed && styles.addButtonPressed,
          ]}
          onPress={handleAddGoal}
        >
          <ThemedText style={styles.addButtonText}>Add Goal</ThemedText>
        </Pressable>
      </View>

      {/* Goals List */}
      <View style={styles.goalsList}>
        {goals.map((goal) => (
          <View key={goal.id} style={[styles.goalItemWrapper, { borderBottomColor: borderColor }]}>
            <GoalItem goal={goal} onPress={onGoalPress} />
          </View>
        ))}
      </View>

      {/* Create New Goal Banner */}
      <Pressable
        style={({ pressed }) => [
          styles.createBanner,
          { borderColor: `${primaryColor}40` },
          pressed && styles.createBannerPressed,
        ]}
        onPress={handleAddGoal}
      >
        <Ionicons name="sparkles" size={16} color={primaryColor} />
        <ThemedText style={styles.createBannerText}>Create a Savings Goal</ThemedText>
        <Ionicons name="chevron-forward" size={20} color={primaryColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonPressed: {
    opacity: 0.7,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  goalsList: {},
  goalItemWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  containerPressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
  },
  createBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    marginTop: 12,
  },
  createBannerPressed: {
    opacity: 0.7,
  },
  createBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});
