import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { formatCurrency, formatPercentage, cn } from '../../lib/utils';

interface AssetRowProps {
  symbol: string;
  name: string;
  balance: string;
  value: number;
  change: number;
  icon?: string;
  hasAutoStrategy?: boolean;
  onPress?: () => void;
}

export function AssetRow({ 
  symbol, 
  name, 
  balance, 
  value, 
  change, 
  icon,
  hasAutoStrategy = false,
  onPress 
}: AssetRowProps) {
  const isPositive = change >= 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <GlassCard className="flex-row items-center justify-between mb-2">
        {/* Icon and Info */}
        <View className="flex-row items-center flex-1">
          {/* Icon */}
          <View className="w-12 h-12 rounded-full bg-surface items-center justify-center mr-3">
            <Text className="text-xl">{icon || symbol.slice(0, 1)}</Text>
          </View>

          {/* Symbol and Balance */}
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text className="text-base font-medium text-foreground">{symbol}</Text>
              {hasAutoStrategy && (
                <View className="ml-2 px-2 py-0.5 rounded-md bg-primary/20">
                  <Text className="text-[10px] font-medium text-primary uppercase">Auto</Text>
                </View>
              )}
            </View>
            <Text className="text-sm text-muted-foreground mt-0.5">{balance}</Text>
          </View>
        </View>

        {/* Value and Change */}
        <View className="items-end">
          <Text className="text-base font-medium text-foreground">
            {formatCurrency(value)}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Ionicons 
              name={isPositive ? 'trending-up' : 'trending-down'} 
              size={12} 
              color={isPositive ? '#10B981' : '#EF4444'} 
            />
            <Text className={cn(
              'text-sm ml-1',
              isPositive ? 'text-primary' : 'text-destructive'
            )}>
              {formatPercentage(change)}
            </Text>
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

