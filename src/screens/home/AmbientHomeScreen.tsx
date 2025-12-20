import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { 
  AmbientBackground, 
  GlassCard, 
  StatusDot, 
  BalanceDisplay,
  CommandBar 
} from '../../components/vision';
import { useFunding } from '../../stores/fundingConvex';
import { useCrypto } from '../../stores/cryptoConvex';
import { useCards } from '../../stores/cardsConvex';
import { formatCurrency } from '../../lib/utils';

interface AmbientAction {
  id: number;
  action: string;
  time: string;
  type: 'rebalance' | 'yield' | 'optimization';
}

export default function AmbientHomeScreen() {
  const { state: fundingState } = useFunding();
  const { state: cryptoState } = useCrypto();
  const { state: cardsState } = useCards();

  const [showBalance, setShowBalance] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ambientActions, setAmbientActions] = useState<AmbientAction[]>([
    { id: 1, action: 'Auto-rebalanced card to $200', time: 'Just now', type: 'rebalance' },
    { id: 2, action: 'Yield optimized +$12.84', time: '2h ago', type: 'yield' },
    { id: 3, action: 'Gas saved on 3 transactions', time: '4h ago', type: 'optimization' },
  ]);

  // Calculate net worth from account balance + crypto holdings
  const accountBalance = fundingState.accountBalance?.availableBalance || 0;
  
  // Mock crypto value for now (in production, sum up all token values)
  const cryptoValue = 125000 * 100; // $125k in cents
  
  const netWorth = (accountBalance + cryptoValue) / 100;
  const todayChange = { value: 8842, percentage: 4.96 };

  // Simulate ambient actions
  useEffect(() => {
    const interval = setInterval(() => {
      const actions = [
        'Yield compounded +$0.42',
        'Auto-optimized gas route',
        'Portfolio rebalanced',
        'Card topped up to target',
      ];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      setAmbientActions((prev) => [
        {
          id: Date.now(),
          action: randomAction,
          time: 'Just now',
          type: 'yield',
        },
        ...prev.slice(0, 4),
      ]);
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Reload data
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView 
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#10B981" />
          }
        >
          {/* Status indicator */}
          <View className="flex-row items-center justify-between px-6 pt-6 mb-8">
            <View className="flex-row items-center">
              <StatusDot size="sm" />
              <Text className="text-[10px] text-muted-foreground font-medium tracking-[0.2em] uppercase ml-2">
                All Systems Nominal
              </Text>
            </View>
          </View>

          {/* Net Worth - centered */}
          <View className="flex-1 items-center justify-center px-6 py-12">
            <BalanceDisplay
              amount={netWorth}
              showBalance={showBalance}
              onToggle={() => setShowBalance(!showBalance)}
              label="Net Worth"
              change={todayChange}
              size="lg"
            />

            {/* Ambient Finance indicator */}
            <View className="mt-8 flex-row items-center px-4 py-2 rounded-full bg-surface/60 border border-border/30">
              <Ionicons name="sparkles" size={16} color="#10B981" />
              <Text className="text-xs text-muted-foreground mx-2">
                Ambient finance active
              </Text>
              <StatusDot size="sm" />
            </View>
          </View>

          {/* Ambient Activity Feed */}
          <View className="px-6 pb-6">
            <View className="flex-row items-center mb-3">
              <Ionicons name="flash" size={12} color="#10B981" />
              <Text className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase ml-2">
                Background Activity
              </Text>
            </View>

            <View className="gap-2">
              {ambientActions.slice(0, 3).map((action) => (
                <View 
                  key={action.id} 
                  className="flex-row items-center justify-between py-2 px-3 rounded-lg bg-surface/30"
                >
                  <View className="flex-row items-center flex-1">
                    <View 
                      className={`w-1.5 h-1.5 rounded-full ${
                        action.type === 'yield' 
                          ? 'bg-primary' 
                          : action.type === 'rebalance' 
                          ? 'bg-accent' 
                          : 'bg-[#F59E0B]'
                      }`}
                    />
                    <Text className="text-xs text-muted-foreground ml-2">{action.action}</Text>
                  </View>
                  <Text className="text-[10px] text-muted-foreground/60">{action.time}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Active Goals */}
          <View className="px-6 pb-6">
            <GlassCard>
              <View className="flex-row items-center mb-3">
                <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                <Text className="text-xs font-medium text-foreground ml-2">Active Goals</Text>
              </View>
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-muted-foreground">"Keep card at $200"</Text>
                  <Text className="text-xs text-primary">Active</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-muted-foreground">"Maximize yield on idle USDC"</Text>
                  <Text className="text-xs text-primary">+$847/mo</Text>
                </View>
              </View>
            </GlassCard>
          </View>
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}

