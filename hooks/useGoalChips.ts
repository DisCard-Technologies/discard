import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { GoalChipData } from '@/components/goal-chips-row';

// Map goal type to icon emoji
const TYPE_TO_ICON: Record<string, string> = {
  savings: '💰',
  accumulate: '🎯',
  yield: '📈',
  custom: '⭐',
};

// Calculate attention state based on progress and deadline
function getAttentionState(
  currentAmount: number,
  targetAmount: number,
  deadline?: number
): 'normal' | 'warning' | 'critical' {
  const progress = targetAmount > 0 ? currentAmount / targetAmount : 0;
  const now = Date.now();

  // If deadline exists and is approaching
  if (deadline) {
    const timeRemaining = deadline - now;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    // Critical: less than a week left and less than 50% progress
    if (timeRemaining < oneWeek && progress < 0.5) {
      return 'critical';
    }

    // Warning: less than a month left and behind pace
    if (timeRemaining < oneMonth) {
      // Calculate expected progress based on time
      const totalDuration = deadline - (deadline - oneMonth * 3); // Assume 3 month goals
      const elapsed = now - (deadline - totalDuration);
      const expectedProgress = elapsed / totalDuration;

      if (progress < expectedProgress * 0.8) {
        return 'warning';
      }
    }
  }

  // Warning: very low progress
  if (progress < 0.15) {
    return 'warning';
  }

  return 'normal';
}

export interface UseGoalChipsResult {
  goals: GoalChipData[];
  isLoading: boolean;
  isEmpty: boolean;
}

export function useGoalChips(): UseGoalChipsResult {
  const convexGoals = useQuery(api.goals.goals.list, {});

  const goals = useMemo((): GoalChipData[] => {
    if (!convexGoals || convexGoals.length === 0) {
      return [];
    }

    return convexGoals.map((goal: any) => {
      const progress = goal.targetAmount > 0
        ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
        : 0;

      // Determine if this is a currency or percentage type
      // Savings/yield goals show dollar amounts, accumulate shows percentage
      const isCurrencyType = goal.type === 'savings' || goal.type === 'yield';
      const displayValue = isCurrencyType
        ? Math.round(goal.currentAmount / 100) // Convert cents to dollars
        : progress;

      return {
        id: goal._id,
        icon: TYPE_TO_ICON[goal.type] || '⭐',
        value: displayValue,
        type: isCurrencyType ? 'currency' : 'percentage',
        attention: getAttentionState(goal.currentAmount, goal.targetAmount, goal.deadline),
        queryPrompt: `Tell me about my ${goal.title} goal`,
      };
    });
  }, [convexGoals]);

  return {
    goals,
    isLoading: convexGoals === undefined,
    isEmpty: convexGoals !== undefined && convexGoals.length === 0,
  };
}
