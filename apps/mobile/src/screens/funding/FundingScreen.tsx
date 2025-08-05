/**
 * Funding Screen for React Native
 * Main funding interface with multiple funding options
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
import { useFunding } from '../../stores/funding';
import BalanceIndicator from '../../components/funding/BalanceIndicator';
import FundingComponent from '../../components/funding/FundingComponent';

interface FundingScreenProps {
  navigation?: any;
  onNavigateToBalance?: () => void;
  onNavigateToTransactions?: () => void;
}

type FundingMode = 'overview' | 'fund' | 'allocate' | 'transfer';

const FundingScreen: React.FC<FundingScreenProps> = ({
  navigation,
  onNavigateToBalance,
  onNavigateToTransactions,
}) => {
  const { state, actions } = useFunding();
  const [currentMode, setCurrentMode] = useState<FundingMode>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      await Promise.all([
        actions.loadBalance(),
        actions.loadTransactions({ limit: 5 }), // Load recent transactions
      ]);
    } catch (error) {
      console.error('Failed to load funding data:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadInitialData();
    setIsRefreshing(false);
  };

  const handleFundingSuccess = (transactionId: string) => {
    setCurrentMode('overview');
    Alert.alert(
      'Success',
      'Funding operation completed successfully',
      [
        { 
          text: 'View Transactions', 
          onPress: () => onNavigateToTransactions?.() 
        },
        { text: 'OK' }
      ]
    );
  };

  const renderQuickActions = () => (
    <View style={styles.quickActions}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryAction]}
          onPress={() => setCurrentMode('fund')}
        >
          <Text style={styles.actionIcon}>💳</Text>
          <Text style={styles.actionText}>Fund Account</Text>
          <Text style={styles.actionSubtext}>Add money from bank or card</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setCurrentMode('allocate')}
          disabled={!state.accountBalance || state.accountBalance.availableBalance <= 0}
        >
          <Text style={styles.actionIcon}>📤</Text>
          <Text style={styles.actionText}>Allocate to Card</Text>
          <Text style={styles.actionSubtext}>Move funds to a card</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setCurrentMode('transfer')}
        >
          <Text style={styles.actionIcon}>🔄</Text>
          <Text style={styles.actionText}>Transfer</Text>
          <Text style={styles.actionSubtext}>Move between cards</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRecentTransactions = () => {
    if (state.transactions.length === 0) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📊</Text>
            <Text style={styles.emptyStateText}>No transactions yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Start by funding your account
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={onNavigateToTransactions}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.transactionList}>
          {state.transactions.slice(0, 3).map((transaction) => (
            <View key={transaction.id} style={styles.transactionItem}>
              <View style={styles.transactionLeft}>
                <Text style={styles.transactionIcon}>
                  {transaction.type === 'account_funding' ? '💳' :
                   transaction.type === 'card_allocation' ? '📤' : '🔄'}
                </Text>
                <View style={styles.transactionDetails}>
                  <Text style={styles.transactionTitle}>
                    {transaction.type === 'account_funding' ? 'Account Funding' :
                     transaction.type === 'card_allocation' ? 'Card Allocation' : 'Card Transfer'}
                  </Text>
                  <Text style={styles.transactionDate}>
                    {new Date(transaction.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <View style={styles.transactionRight}>
                <Text style={[
                  styles.transactionAmount,
                  transaction.type === 'account_funding' ? styles.positiveAmount : styles.neutralAmount
                ]}>
                  {transaction.type === 'account_funding' ? '+' : ''}
                  ${(transaction.amount / 100).toFixed(2)}
                </Text>
                <View style={[
                  styles.statusBadge,
                  transaction.status === 'completed' ? styles.completedStatus :
                  transaction.status === 'pending' ? styles.pendingStatus :
                  transaction.status === 'failed' ? styles.failedStatus : styles.processingStatus
                ]}>
                  <Text style={styles.statusText}>{transaction.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderOverview = () => (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor="#3B82F6"
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Funding</Text>
        <Text style={styles.subtitle}>Manage your account balance and funding</Text>
      </View>

      {/* Balance Overview */}
      <View style={styles.section}>
        <BalanceIndicator
          accountBalance={state.accountBalance}
          onPress={onNavigateToBalance}
        />
      </View>

      {/* Quick Actions */}
      {renderQuickActions()}

      {/* Recent Transactions */}
      {renderRecentTransactions()}

      {/* Error Display */}
      {state.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{state.error}</Text>
          <TouchableOpacity
            style={styles.errorDismiss}
            onPress={actions.clearError}
          >
            <Text style={styles.errorDismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  if (state.isLoadingBalance && !state.accountBalance) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading funding data...</Text>
      </View>
    );
  }

  if (currentMode === 'fund') {
    return (
      <View style={styles.container}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={() => setCurrentMode('overview')}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <FundingComponent
          mode="fund"
          onSuccess={handleFundingSuccess}
          onCancel={() => setCurrentMode('overview')}
        />
      </View>
    );
  }

  if (currentMode === 'allocate') {
    return (
      <View style={styles.container}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={() => setCurrentMode('overview')}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.modalNote}>
          Select a card to allocate funds to from the card dashboard
        </Text>
      </View>
    );
  }

  if (currentMode === 'transfer') {
    return (
      <View style={styles.container}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={() => setCurrentMode('overview')}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.modalNote}>
          Select source and target cards from the card dashboard to transfer funds
        </Text>
      </View>
    );
  }

  return renderOverview();
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },

  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },

  // Header
  header: {
    padding: 20,
    paddingBottom: 10,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },

  // Sections
  section: {
    margin: 16,
    marginTop: 0,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },

  viewAllText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },

  // Quick Actions
  quickActions: {
    margin: 16,
    marginTop: 8,
  },

  actionButtons: {
    gap: 12,
    marginTop: 12,
  },

  actionButton: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    opacity: 1,
  },

  primaryAction: {
    borderWidth: 2,
    borderColor: '#3B82F6',
  },

  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },

  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  actionSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Transactions
  transactionList: {
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  transactionIcon: {
    fontSize: 20,
    marginRight: 12,
  },

  transactionDetails: {
    flex: 1,
  },

  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },

  transactionDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  transactionRight: {
    alignItems: 'flex-end',
    gap: 4,
  },

  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },

  positiveAmount: {
    color: '#059669',
  },

  neutralAmount: {
    color: '#1F2937',
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },

  completedStatus: {
    backgroundColor: '#D1FAE5',
  },

  pendingStatus: {
    backgroundColor: '#FEF3C7',
  },

  failedStatus: {
    backgroundColor: '#FEE2E2',
  },

  processingStatus: {
    backgroundColor: '#DBEAFE',
  },

  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#374151',
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

  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  emptyStateSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },

  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: 'white',
  },

  backButton: {
    padding: 8,
  },

  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },

  modalNote: {
    padding: 20,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
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

export default FundingScreen;