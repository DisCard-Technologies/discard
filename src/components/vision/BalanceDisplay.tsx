import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface BalanceDisplayProps {
  amount: number;
  showBalance: boolean;
  onToggle: () => void;
  label?: string;
  change?: {
    value: number;
    percentage: number;
  };
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-3xl',
  md: 'text-5xl',
  lg: 'text-6xl',
};

export function BalanceDisplay({ 
  amount, 
  showBalance, 
  onToggle, 
  label = 'Net Worth',
  change,
  size = 'lg'
}: BalanceDisplayProps) {
  return (
    <View className="items-center">
      {label && (
        <View className="flex-row items-center mb-2">
          <Text className="text-xs text-muted-foreground uppercase tracking-widest">
            {label}
          </Text>
          <TouchableOpacity onPress={onToggle} className="ml-3 p-1">
            <Ionicons 
              name={showBalance ? 'eye-outline' : 'eye-off-outline'} 
              size={16} 
              color="#6B7280" 
            />
          </TouchableOpacity>
        </View>
      )}

      <Text className={cn('font-extralight tracking-tight text-foreground', sizeClasses[size])}>
        {showBalance ? formatCurrency(amount) : '••••••'}
      </Text>

      {change && showBalance && (
        <View className="flex-row items-center mt-2">
          <Ionicons 
            name={change.value >= 0 ? 'trending-up' : 'trending-down'} 
            size={16} 
            color={change.value >= 0 ? '#10B981' : '#EF4444'} 
          />
          <Text className={cn(
            'text-sm font-medium ml-1',
            change.value >= 0 ? 'text-primary' : 'text-destructive'
          )}>
            {change.value >= 0 ? '+' : ''}
            {formatCurrency(change.value)} ({change.percentage >= 0 ? '+' : ''}
            {change.percentage.toFixed(2)}%)
          </Text>
        </View>
      )}
    </View>
  );
}

