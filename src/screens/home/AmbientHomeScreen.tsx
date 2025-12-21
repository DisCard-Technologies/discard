import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { 
  AmbientBackground, 
  StatusDot, 
  CommandBar 
} from '../../components/vision';
import { useFunding } from '../../stores/fundingConvex';
import { useCrypto } from '../../stores/cryptoConvex';
import { useCards } from '../../stores/cardsConvex';

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

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#10B981" />
          }
        >
          {/* Status Header */}
          <View style={styles.header}>
            <View style={styles.statusRow}>
              <StatusDot size="sm" />
              <Text style={styles.statusText}>ALL SYSTEMS NOMINAL</Text>
            </View>
            <TouchableOpacity onPress={() => setShowBalance(!showBalance)} style={styles.eyeButton}>
              <Ionicons 
                name={showBalance ? 'eye-outline' : 'eye-off-outline'} 
                size={20} 
                color="#6B7280" 
              />
            </TouchableOpacity>
          </View>

          {/* Net Worth Display - Large centered */}
          <View style={styles.balanceSection}>
            <Text style={styles.netWorthLabel}>NET WORTH</Text>
            <Text style={styles.balanceAmount}>
              {showBalance ? formatNetWorth(netWorth) : '••••••'}
            </Text>
            {showBalance && (
              <View style={styles.changeRow}>
                <Ionicons name="trending-up" size={16} color="#10B981" />
                <Text style={styles.changeText}>+{todayChange}% today</Text>
              </View>
            )}

            {/* Ambient Finance Pill */}
            <View style={styles.ambientPill}>
              <Ionicons name="sparkles" size={14} color="#10B981" />
              <Text style={styles.ambientText}>Ambient finance active</Text>
              <StatusDot size="sm" />
            </View>
          </View>

          {/* Background Activity */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flash" size={12} color="#10B981" />
              <Text style={styles.sectionTitle}>BACKGROUND ACTIVITY</Text>
            </View>

            <View style={styles.activityList}>
              {ambientActions.slice(0, 3).map((action) => (
                <View key={action.id} style={styles.activityItem}>
                  <View style={styles.activityLeft}>
                    <View style={[
                      styles.activityDot,
                      action.type === 'yield' && styles.dotYield,
                      action.type === 'rebalance' && styles.dotRebalance,
                      action.type === 'optimization' && styles.dotOptimization,
                    ]} />
                    <Text style={styles.activityText}>{action.action}</Text>
                  </View>
                  <Text style={styles.activityTime}>{action.time}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Active Goals Card */}
          <View style={styles.section}>
            <View style={styles.goalsCard}>
              <View style={styles.goalsHeader}>
                <View style={styles.goalsIconCircle}>
                  <Ionicons name="ellipse-outline" size={16} color="#10B981" />
                </View>
                <Text style={styles.goalsTitle}>Active Goals</Text>
              </View>
              
              <View style={styles.goalItem}>
                <Text style={styles.goalText}>"Keep card at $200"</Text>
                <Text style={styles.goalStatus}>Active</Text>
              </View>
              
              <View style={styles.goalItem}>
                <Text style={styles.goalText}>"Maximize yield on idle USDC"</Text>
                <Text style={styles.goalValue}>+$847/mo</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
    letterSpacing: 2,
    marginLeft: 8,
  },
  eyeButton: {
    padding: 8,
  },
  balanceSection: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  netWorthLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    letterSpacing: 3,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 52,
    fontWeight: '200',
    color: '#FFFFFF',
    letterSpacing: -2,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  changeText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
    marginLeft: 6,
  },
  ambientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.4)',
    marginTop: 32,
    gap: 8,
  },
  ambientText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
    letterSpacing: 2,
    marginLeft: 8,
  },
  activityList: {
    gap: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.3)',
    borderRadius: 8,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  dotYield: {
    backgroundColor: '#10B981',
  },
  dotRebalance: {
    backgroundColor: '#3B82F6',
  },
  dotOptimization: {
    backgroundColor: '#F59E0B',
  },
  activityText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  activityTime: {
    fontSize: 11,
    color: '#4B5563',
  },
  goalsCard: {
    backgroundColor: 'rgba(31, 41, 55, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.5)',
    // Glassmorphism glow effect
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  goalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalsIconCircle: {
    marginRight: 8,
  },
  goalsTitle: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  goalText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  goalStatus: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
  },
  goalValue: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
  },
});

