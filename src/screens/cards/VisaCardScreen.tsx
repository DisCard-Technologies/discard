import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CommandBar } from '../../components/command';
import { useCards, useCardOperations } from '../../stores/cardsConvex';
import { formatCurrency, colors } from '../../lib/utils';

// Mock transactions matching the design
const mockTransactions = [
  { id: '1', merchant: 'Apple Store', amount: -1299.00, date: 'Today', isAmbient: false },
  { id: '2', merchant: 'Auto-Rebalance', amount: 200.00, date: 'Today', isAmbient: true },
  { id: '3', merchant: 'Whole Foods', amount: -127.84, date: 'Today', isAmbient: false },
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
    <View style={styles.container}>
      {/* Ambient glow background */}
      <View style={styles.ambientGlow} />
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#10B981" />
          }
        >
          {/* VISA Card */}
          <View style={styles.cardContainer}>
            <View style={[styles.visaCard, cardFrozen && styles.cardFrozen]}>
              <LinearGradient
                colors={['#1F2937', '#111827', '#0A0A0A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              
              {/* Subtle ambient overlay on card */}
              <View style={styles.cardAmbientOverlay} />

              {/* Card content */}
              <View style={styles.cardContent}>
                {/* Top row: Logo and freeze indicator */}
                <View style={styles.cardHeader}>
                  <View style={styles.logoContainer}>
                    <View style={styles.logoCircle}>
                      <Text style={styles.logoText}>N</Text>
                    </View>
                    <Text style={styles.brandName}>NEXUS</Text>
                  </View>
                  {cardFrozen && (
                    <View style={styles.frozenBadge}>
                      <Ionicons name="snow" size={14} color={colors.accent} />
                      <Text style={styles.frozenText}>Frozen</Text>
                    </View>
                  )}
                </View>

                {/* Card number */}
                <View style={styles.cardNumberSection}>
                  <View style={styles.cardNumberRow}>
                    <Text style={styles.cardNumber}>
                      •••• •••• •••• ••••
                    </Text>
                  </View>
                  <View style={styles.cardNumberRow}>
                    <Text style={styles.cardNumber}>
                      •••
                    </Text>
                    <TouchableOpacity 
                      onPress={() => setShowDetails(!showDetails)} 
                      style={styles.eyeButton}
                    >
                      <Ionicons 
                        name={showDetails ? 'eye-off' : 'eye'} 
                        size={16} 
                        color="#6B7280" 
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Cardholder and VISA logo */}
                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.cardholderLabel}>CARDHOLDER</Text>
                    <Text style={styles.cardholderName}>ALEX SOVEREIGN</Text>
                  </View>
                  <Text style={styles.visaLogo}>VISA</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Auto-Rebalance Status */}
          <View style={styles.sectionContainer}>
            <View style={styles.rebalanceCard}>
              <View style={styles.rebalanceHeader}>
                <Ionicons name="flash" size={16} color="#10B981" />
                <Text style={styles.rebalanceTitle}>Auto-Rebalance Active</Text>
              </View>
              
              <View style={styles.rebalanceBalances}>
                <View>
                  <Text style={styles.balanceLabel}>Target Balance</Text>
                  <Text style={styles.balanceValue}>$200.00</Text>
                </View>
                <View style={styles.balanceRight}>
                  <Text style={styles.balanceLabel}>Current</Text>
                  <Text style={styles.balanceValueGreen}>$200.00</Text>
                </View>
              </View>
              
              <Text style={styles.rebalanceDescription}>
                "Keep my card balance at $200" — AI auto-rebalances from your portfolio
              </Text>
            </View>
          </View>

          {/* Card Controls */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity style={styles.controlButton} activeOpacity={0.7}>
              <Ionicons name="copy-outline" size={16} color="#FFFFFF" />
              <Text style={styles.controlButtonText}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleFreeze}
              style={[
                styles.controlButton,
                cardFrozen && styles.controlButtonActive
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name="snow" size={16} color={cardFrozen ? colors.accent : '#FFFFFF'} />
              <Text style={[
                styles.controlButtonText,
                cardFrozen && styles.controlButtonTextActive
              ]}>
                {cardFrozen ? 'Unfreeze' : 'Freeze'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} activeOpacity={0.7}>
              <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
              <Text style={styles.controlButtonText}>Limits</Text>
            </TouchableOpacity>
          </View>

          {/* Transactions */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionLabel}>RECENT</Text>
            
            <View style={styles.transactionsList}>
              {mockTransactions.map((tx) => (
                <View 
                  key={tx.id} 
                  style={[
                    styles.transactionCard,
                    tx.isAmbient && styles.transactionCardAmbient
                  ]}
                >
                  <View style={styles.transactionContent}>
                    <View style={styles.transactionLeft}>
                      {tx.isAmbient && (
                        <Ionicons name="flash" size={16} color="#10B981" style={styles.transactionIcon} />
                      )}
                      <View>
                        <Text style={[
                          styles.transactionMerchant,
                          tx.isAmbient && styles.transactionMerchantBold
                        ]}>
                          {tx.merchant}
                        </Text>
                        <Text style={styles.transactionDate}>{tx.date}</Text>
                      </View>
                    </View>
                    <Text style={[
                      styles.transactionAmount,
                      tx.amount > 0 && styles.transactionAmountPositive
                    ]}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Bottom padding for scroll */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  ambientGlow: {
    position: 'absolute',
    top: -50,
    left: '50%',
    marginLeft: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },

  // Card styles
  cardContainer: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
  },
  visaCard: {
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.3)',
  },
  cardFrozen: {
    opacity: 0.6,
  },
  cardAmbientOverlay: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  cardContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  logoText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  frozenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  frozenText: {
    color: colors.accent,
    fontSize: 12,
    marginLeft: 4,
  },
  cardNumberSection: {
    marginTop: 16,
  },
  cardNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    letterSpacing: 4,
  },
  eyeButton: {
    marginLeft: 16,
    padding: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardholderLabel: {
    color: '#6B7280',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  cardholderName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  visaLogo: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 28,
    fontWeight: '700',
    fontStyle: 'italic',
    letterSpacing: 1,
  },

  // Section container
  sectionContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },

  // Rebalance card
  rebalanceCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  rebalanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  rebalanceTitle: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  rebalanceBalances: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  balanceLabel: {
    color: '#6B7280',
    fontSize: 13,
    marginBottom: 4,
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
  },
  balanceRight: {
    alignItems: 'flex-end',
  },
  balanceValueGreen: {
    color: '#10B981',
    fontSize: 28,
    fontWeight: '300',
  },
  rebalanceDescription: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
  },

  // Controls
  controlsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 24,
    gap: 12,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.3)',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: colors.accent,
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  controlButtonTextActive: {
    color: colors.accent,
  },

  // Section label
  sectionLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 16,
  },

  // Transactions
  transactionsList: {
    gap: 8,
  },
  transactionCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.2)',
  },
  transactionCardAmbient: {
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  transactionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIcon: {
    marginRight: 12,
  },
  transactionMerchant: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  transactionMerchantBold: {
    fontWeight: '600',
  },
  transactionDate: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  transactionAmountPositive: {
    color: '#10B981',
  },
});
