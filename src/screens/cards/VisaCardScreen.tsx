import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AmbientBackground,
  GlassCard,
  CommandBar,
} from '../../components/vision';
import { useCards, useCardOperations } from '../../stores/cardsConvex';
import { formatCurrency, colors } from '../../lib/utils';

// Mock transactions
const mockTransactions = [
  { id: '1', merchant: 'Apple Store', amount: -1299.00, date: 'Today', category: 'Shopping', isAmbient: false },
  { id: '2', merchant: 'Auto-Rebalance', amount: 200.00, date: 'Today', category: 'AI', isAmbient: true },
  { id: '3', merchant: 'Whole Foods', amount: -127.84, date: 'Today', category: 'Groceries', isAmbient: false },
  { id: '4', merchant: 'Uber', amount: -24.50, date: 'Yesterday', category: 'Transport', isAmbient: false },
];

export default function VisaCardScreen() {
  const { state } = useCards();
  const cardOperations = useCardOperations();
  
  const [showDetails, setShowDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get the first active card for demo
  const activeCard = state.cards?.find((c) => c.status === 'active') || state.cards?.[0];
  const cardFrozen = activeCard?.status === 'paused';

  const handleFreeze = async () => {
    if (!activeCard) return;
    await cardOperations.updateCardStatus(
      activeCard._id,
      cardFrozen ? 'active' : 'paused'
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await cardOperations.loadCards({ limit: 50 });
    setIsRefreshing(false);
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
          {/* Card */}
          <View className="px-6 pt-12 pb-6">
            <View className={`rounded-3xl p-6 h-52 ${cardFrozen ? 'opacity-60' : ''}`}>
              <LinearGradient
                colors={['#1F2937', '#111827', '#0A0A0A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="absolute inset-0 rounded-3xl"
              />
              
              {/* Ambient gradient overlay */}
              <View className="absolute top-0 right-0 w-64 h-64 opacity-30">
                <LinearGradient
                  colors={['rgba(16, 185, 129, 0.2)', 'transparent']}
                  className="w-full h-full rounded-full"
                  style={{ transform: [{ translateX: 100 }, { translateY: -100 }] }}
                />
              </View>

              {/* Card content */}
              <View className="flex-1 relative z-10">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center mr-2">
                      <Text className="text-primary font-bold text-sm">N</Text>
                    </View>
                    <Text className="font-semibold tracking-wide text-foreground">NEXUS</Text>
                  </View>
                  {cardFrozen && (
                    <View className="flex-row items-center">
                      <Ionicons name="snow" size={16} color={colors.accent} />
                      <Text className="text-accent text-sm ml-1">Frozen</Text>
                    </View>
                  )}
                </View>

                <View className="flex-1 justify-end">
                  <View className="flex-row items-center mb-4">
                    <Text className="text-xl tracking-[0.25em] font-mono text-foreground">
                      {showDetails ? '4532 •••• •••• 8847' : '•••• •••• •••• ••••'}
                    </Text>
                    <TouchableOpacity onPress={() => setShowDetails(!showDetails)} className="ml-3">
                      <Ionicons 
                        name={showDetails ? 'eye-off' : 'eye'} 
                        size={16} 
                        color={colors.muted} 
                      />
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                        Cardholder
                      </Text>
                      <Text className="text-sm font-medium text-foreground">ALEX SOVEREIGN</Text>
                    </View>
                    <Text className="text-2xl font-bold tracking-tight italic text-foreground/80">
                      VISA
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Auto-Rebalance Status */}
          <View className="px-6 pb-6">
            <GlassCard className="border-primary/20">
              <View className="flex-row items-center mb-3">
                <Ionicons name="flash" size={16} color={colors.primary} />
                <Text className="text-xs font-medium text-primary ml-2">Auto-Rebalance Active</Text>
              </View>
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-sm text-muted-foreground">Target Balance</Text>
                  <Text className="text-2xl font-light text-foreground">$200.00</Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm text-muted-foreground">Current</Text>
                  <Text className="text-2xl font-light text-primary">$200.00</Text>
                </View>
              </View>
              <Text className="text-xs text-muted-foreground">
                "Keep my card balance at $200" — AI auto-rebalances from your portfolio
              </Text>
            </GlassCard>
          </View>

          {/* Card Controls */}
          <View className="px-6 pb-6 flex-row gap-3">
            <TouchableOpacity 
              className="flex-1 h-11 rounded-xl bg-surface/40 border border-border/30 items-center justify-center flex-row"
              activeOpacity={0.7}
            >
              <Ionicons name="copy-outline" size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground ml-2">Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleFreeze}
              className={`flex-1 h-11 rounded-xl items-center justify-center flex-row ${
                cardFrozen 
                  ? 'bg-accent/20 border border-accent' 
                  : 'bg-surface/40 border border-border/30'
              }`}
              activeOpacity={0.7}
            >
              <Ionicons name="snow" size={16} color={cardFrozen ? colors.accent : colors.foreground} />
              <Text className={`text-sm font-medium ml-2 ${
                cardFrozen ? 'text-accent' : 'text-foreground'
              }`}>
                {cardFrozen ? 'Unfreeze' : 'Freeze'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="flex-1 h-11 rounded-xl bg-surface/40 border border-border/30 items-center justify-center flex-row"
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground ml-2">Limits</Text>
            </TouchableOpacity>
          </View>

          {/* Transactions */}
          <View className="px-6 pb-6">
            <Text className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
              Recent
            </Text>
            <View className="gap-2">
              {mockTransactions.map((tx) => (
                <GlassCard 
                  key={tx.id} 
                  className={tx.isAmbient ? 'border-primary/20' : ''}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                      {tx.isAmbient && (
                        <Ionicons name="flash" size={16} color={colors.primary} className="mr-3" />
                      )}
                      <View className={tx.isAmbient ? 'ml-3' : ''}>
                        <Text className="font-medium text-sm text-foreground">{tx.merchant}</Text>
                        <Text className="text-xs text-muted-foreground">{tx.date}</Text>
                      </View>
                    </View>
                    <Text className={`font-medium text-sm ${
                      tx.amount > 0 ? 'text-primary' : 'text-foreground'
                    }`}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </Text>
                  </View>
                </GlassCard>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}

