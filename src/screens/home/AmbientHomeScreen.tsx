import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Zap, TrendingUp, TrendingDown, Shield } from "lucide-react-native"
import { AmbientBackground, TopBar } from '../../components/ui';
import { CommandBar } from '../../components/command';
import { useFunding } from '../../stores/fundingConvex';
import { useCrypto } from '../../stores/cryptoConvex';
import { useCards } from '../../stores/cardsConvex';
import { useCurrentUserId } from '../../stores/authConvex';

interface AmbientAction {
  id: number;
  action: string;
  time: string;
  type: 'rebalance' | 'yield' | 'optimization';
}

// Format currency without cents for large amounts
function formatNetWorth(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface AmbientHomeScreenProps {
  navigation: any;
}

export default function AmbientHomeScreen({ navigation }: AmbientHomeScreenProps) {
  const { state: fundingState } = useFunding();
  const { state: cryptoState } = useCrypto();
  const { state: cardsState } = useCards();
  const userId = useCurrentUserId();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ambientActions, setAmbientActions] = useState<AmbientAction[]>([
    { id: 1, action: 'Yield compounded +$0.42', time: 'Just now', type: 'yield' },
    { id: 2, action: 'Yield compounded +$0.42', time: 'Just now', type: 'yield' },
    { id: 3, action: 'Yield compounded +$0.42', time: 'Just now', type: 'yield' },
  ]);

  // Calculate net worth from account balance + crypto holdings
  const accountBalance = fundingState.accountBalance?.availableBalance || 0;
  
  // Mock crypto value for now (in production, sum up all token values)
  const cryptoValue = 178171 * 100; // Match target image
  
  const netWorth = (accountBalance + cryptoValue) / 100;
  const todayChange = 4.96;

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
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const walletAddress = '0x8xFk4a9b2c1d3e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9pQr';

  return (
    <AmbientBackground>
      <SafeAreaView className="h-full flex flex-col" edges={['top']}>
        {/* Top Bar */}
        <TopBar
          walletAddress={walletAddress}
          onIdentityTap={() => navigation.navigate('Identity')}
          onHistoryTap={() => navigation.navigate('TransactionHistory')}
          onSettingsTap={() => navigation.navigate('Settings')}
        />

        <ScrollView 
          className="flex-1 flex flex-col px-6 pb-4"
          contentContainerClassName="pb-24"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#10B981" />
          }
        >
          {/* Net Worth Display - Large centered */}
          <View className="flex-1 flex flex-col items-center justify-center mt-10">
            <Text className="text-[11px] text-muted-foreground font-medium tracking-widest mb-3 uppercase">
              NET WORTH
            </Text>
            <Text className="text-[56px] font-extralight text-foreground tracking-tighter">
              {formatNetWorth(netWorth)}
            </Text>
            <View className="flex-row items-center mt-3">
              <TrendingUp size={16} color="#10B981" />
              <Text className="text-sm text-primary font-medium ml-1.5">
                +{todayChange}% today
              </Text>
            </View>
          </View>

          {/* Background Activity */}
          <View className="space-y-2">
            <View className="flex-row items-center gap-2 mb-3">
              <Zap size={12} color="#10B981" />
              <Text className="text-[10px] text-muted-foreground font-medium tracking-widest ml-2 uppercase">
                BACKGROUND ACTIVITY
              </Text>
            </View>

            <View className="gap-2">
              {ambientActions.slice(0, 3).map((action) => (
                <View key={action.id} className="flex-row items-center justify-between py-3 px-4 bg-card/40 rounded-xl border border-border/30">
                  <View className="flex-row items-center flex-1">
                    <View 
                      className={`w-2 h-2 rounded-full mr-3 ${
                        action.type === 'yield' 
                          ? 'bg-primary' 
                          : action.type === 'rebalance' 
                          ? 'bg-accent' 
                          : 'bg-amber-500'
                      }`} 
                    />
                    <Text className="text-[13px] text-muted-foreground">
                      {action.action}
                    </Text>
                  </View>
                  <Text className="text-[11px] text-muted-foreground/60">
                    {action.time}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Active Goals Card */}
          <View className="mt-6 glass-card">
            <View className="bg-card/50 rounded-2xl p-4 border border-border">
              <View className="flex-row items-center mb-4">
                <View className="mr-2">
                  <Shield size={18} color="#10B981" />
                </View>
                <Text className="text-[14px] text-foreground font-semibold">
                  Active Goals
                </Text>
              </View>
              
              <View className="flex-row items-center justify-between py-2.5 border-b border-border/30">
                <Text className="text-sm text-muted-foreground">
                  "Keep card at $200"
                </Text>
                <Text className="text-[13px] text-primary font-medium">
                  Active
                </Text>
              </View>
              
              <View className="flex-row items-center justify-between py-2.5">
                <Text className="text-sm text-muted-foreground">
                  "Maximize yield on idle USDC"
                </Text>
                <Text className="text-[13px] text-primary font-medium">
                  +$847/mo
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Command Bar */}
        <CommandBar userId={userId} placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}
