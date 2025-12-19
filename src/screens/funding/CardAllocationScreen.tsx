/**
 * Card Allocation Screen for React Native
 * Interface for allocating funds to specific cards
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
// Use Convex-based stores
import { useFunding } from '../../stores/fundingConvex';
import { useCards } from '../../stores/cardsConvex';
import FundingComponent from '../../components/funding/FundingComponent';
import BalanceIndicator from '../../components/funding/BalanceIndicator';

// Local formatCurrency helper (was from @discard/shared)
function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

interface CardAllocationScreenProps {
  navigation?: any;
  preselectedCardId?: string;
}

const CardAllocationScreen: React.FC<CardAllocationScreenProps> = ({
  navigation,
  preselectedCardId,
}) => {
  const { state: fundingState, actions: fundingActions } = useFunding();
  const { state: cardsState, actions: cardActions } = useCards();
  
  const [selectedCardId, setSelectedCardId] = useState<string | null>(preselectedCardId || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllocationForm, setShowAllocationForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        fundingActions.loadBalance(),
        cardActions.loadCards({ status: 'active' }),
      ]);
    } catch (error) {
      console.error('Failed to load allocation data:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleCardSelect = (cardId: string) => {
    setSelectedCardId(cardId);
    setShowAllocationForm(true);
  };

  const handleAllocationSuccess = (transactionId: string) => {
    setShowAllocationForm(false);
    setSelectedCardId(null);
    Alert.alert(
      'Success',
      'Funds allocated to card successfully',
      [{ text: 'OK' }]
    );
    
    // Refresh data to show updated balances
    loadData();
  };

  const handleBack = () => {
    if (showAllocationForm) {
      setShowAllocationForm(false);
    } else {
      navigation?.goBack();
    }
  };

  const getCardBalance = (cardId: string) => {
    const cardBalance = fundingState.cardBalances[cardId];
    const card = cardsState.cards.find(c => c.cardId === cardId);
    return cardBalance?.balance ?? card?.currentBalance ?? 0;
  };

  const renderAccountBalance = () => {
    if (!fundingState.accountBalance) {
      return (
        <View style={styles.section}>
          <View style={styles.card}>
            <Text style={styles.noDataText}>Loading account balance...</Text>
          </View>
        </View>
      );
    }

    if (fundingState.accountBalance.availableBalance <= 0) {
      return (
        <View style={styles.section}>
          <View style={styles.warningCard}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningTitle}>No Available Balance</Text>
            <Text style={styles.warningText}>
              You need to fund your account before allocating to cards.
            </Text>
            <TouchableOpacity
              style={styles.warningButton}
              onPress={() => navigation?.navigate('FundingScreen')}
            >
              <Text style={styles.warningButtonText}>Fund Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available for Allocation</Text>
        <BalanceIndicator
          accountBalance={fundingState.accountBalance}
          variant="account"
          showDetails={false}
        />
      </View>
    );
  };

  const renderCardList = () => {
    const activeCards = cardsState.cards.filter(card => card.status === 'active');

    if (activeCards.length === 0) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Card</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>💳</Text>
            <Text style={styles.emptyStateTitle}>No Active Cards</Text>
            <Text style={styles.emptyStateText}>
              Create an active card to allocate funds to it
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => navigation?.navigate('CardCreationScreen')}
            >
              <Text style={styles.emptyStateButtonText}>Create Card</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Card to Fund</Text>
        <View style={styles.cardList}>
          {activeCards.map((card) => {
            const cardBalance = getCardBalance(card.cardId);
            const isSelected = selectedCardId === card.cardId;
            const isLowBalance = cardBalance < 500; // $5.00 threshold

            return (
              <TouchableOpacity
                key={card.cardId}
                style={[
                  styles.cardItem,
                  isSelected && styles.cardItemSelected,
                ]}
                onPress={() => handleCardSelect(card.cardId)}
              >
                <View style={styles.cardItemHeader}>
                  <View style={styles.cardItemLeft}>
                    <Text style={styles.cardItemTitle}>
                      Card ••••{card.cardId.slice(-4)}
                    </Text>
                    <Text style={styles.cardItemSubtitle}>
                      Limit: {formatCurrency(card.spendingLimit)}
                    </Text>
                  </View>
                  <View style={styles.cardItemRight}>
                    <Text style={[
                      styles.cardItemBalance,
                      isLowBalance && styles.lowBalance
                    ]}>
                      {formatCurrency(cardBalance)}
                    </Text>
                    {isLowBalance && (
                      <Text style={styles.lowBalanceLabel}>Low Balance</Text>
                    )}
                  </View>
                </View>
                
                {isLowBalance && (
                  <View style={styles.lowBalanceWarning}>
                    <Text style={styles.warningIcon}>⚠️</Text>
                    <Text style={styles.lowBalanceWarningText}>
                      Consider adding funds to this card
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderAllocationForm = () => {
    if (!selectedCardId) return null;

    const selectedCard = cardsState.cards.find(card => card.cardId === selectedCardId);
    if (!selectedCard) return null;

    return (
      <View style={styles.container}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>
            Allocate to Card ••••{selectedCard.cardId.slice(-4)}
          </Text>
        </View>
        
        <FundingComponent
          mode="allocate"
          cardId={selectedCardId}
          onSuccess={handleAllocationSuccess}
          onCancel={() => setShowAllocationForm(false)}
        />
      </View>
    );
  };

  if (showAllocationForm) {
    return renderAllocationForm();
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Allocate Funds</Text>
        <Text style={styles.subtitle}>Move funds from account to a specific card</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Account Balance */}
        {renderAccountBalance()}

        {/* Card Selection */}
        {fundingState.accountBalance?.availableBalance > 0 && renderCardList()}

        {/* Loading State */}
        {(fundingState.isLoadingBalance || cardsState.isLoading) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        {/* Error Display */}
        {(fundingState.error || cardsState.error) && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {fundingState.error || cardsState.error}
            </Text>
            <TouchableOpacity
              style={styles.errorDismiss}
              onPress={() => {
                fundingActions.clearError();
                cardActions.clearError();
              }}
            >
              <Text style={styles.errorDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  header: {
    padding: 20,
    paddingBottom: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
    marginTop: 8,
  },

  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },

  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginLeft: -8,
  },

  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },

  content: {
    flex: 1,
  },

  section: {
    margin: 16,
    marginTop: 0,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },

  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // Warning Card
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },

  warningIcon: {
    fontSize: 32,
    marginBottom: 8,
  },

  warningTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },

  warningText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    marginBottom: 16,
  },

  warningButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },

  warningButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Card List
  cardList: {
    gap: 12,
  },

  cardItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },

  cardItemSelected: {
    borderColor: '#3B82F6',
  },

  cardItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  cardItemLeft: {
    flex: 1,
  },

  cardItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  cardItemSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },

  cardItemRight: {
    alignItems: 'flex-end',
  },

  cardItemBalance: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 2,
  },

  lowBalance: {
    color: '#DC2626',
  },

  lowBalanceLabel: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  lowBalanceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    gap: 6,
  },

  lowBalanceWarningText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
    flex: 1,
  },

  // Empty State
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },

  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },

  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },

  emptyStateButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },

  emptyStateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },

  // Common
  noDataText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 16,
    padding: 20,
  },

  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },

  // Error
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  errorText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 14,
  },

  errorDismiss: {
    padding: 4,
  },

  errorDismissText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default CardAllocationScreen;