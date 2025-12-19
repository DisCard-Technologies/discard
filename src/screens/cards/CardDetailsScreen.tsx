/**
 * Card Details Screen for React Native
 * Displays detailed information about a specific card including transaction history
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
// Use Convex-based cards store
import { useCardOperations, CardWithDetails } from '../../stores/cardsConvex';
import CardComponent from '../../components/cards/CardComponent';
import PrivacyIndicator, { getCardPrivacyStatus } from '../../components/privacy/PrivacyIndicator';

// Local formatUSD helper (was from @discard/shared)
function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

// Transaction type (was from @discard/shared)
interface Transaction {
  id: string;
  amount: number;
  merchantName: string;
  merchantCategory?: string;
  status: 'completed' | 'pending' | 'failed' | 'declined';
  timestamp: string;
}

// CardClipboard utilities (was from @discard/shared)
const CardClipboard = {
  copyCardNumber: async (cardNumber: string) => {
    try {
      await Clipboard.setStringAsync(cardNumber);
      setTimeout(() => Clipboard.setStringAsync(''), 30000); // Clear after 30s
      return { success: true, message: 'Card number copied. Will clear in 30 seconds.' };
    } catch {
      return { success: false, message: 'Failed to copy' };
    }
  },
  copyCVV: async (cvv: string) => {
    try {
      await Clipboard.setStringAsync(cvv);
      setTimeout(() => Clipboard.setStringAsync(''), 10000); // Clear after 10s
      return { success: true, message: 'CVV copied. Will clear in 10 seconds.' };
    } catch {
      return { success: false, message: 'Failed to copy' };
    }
  },
};

// CardDeletion utilities (was from @discard/shared)
const CardDeletion = {
  createConfirmation: (cardId: string, cardName: string, last4?: string) => ({
    warningMessage: `You are about to permanently delete ${cardName}${last4 ? ` ending in ${last4}` : ''}. This action cannot be undone. All transaction history will be preserved for compliance.`,
  }),
};

interface CardDetailsScreenProps {
  card: CardWithDetails;
  onBack?: () => void;
  onCardUpdated?: (card: CardWithDetails) => void;
  onCardDeleted?: () => void;
  navigation?: any;
}

const CardDetailsScreen: React.FC<CardDetailsScreenProps> = ({
  card: initialCard,
  onBack,
  onCardUpdated,
  onCardDeleted,
  navigation,
}) => {
  const cardOperations = useCardOperations();
  
  // Local state
  const [card, setCard] = useState<CardWithDetails>(initialCard);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load card details and transaction history
  const loadCardDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const details = await cardOperations.getCardDetails(card.cardId);
      
      if (details) {
        setCard(details.card);
        setTransactions(details.transactionHistory || []);
        
        if (onCardUpdated) {
          onCardUpdated(details.card);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load card details');
    } finally {
      setIsLoading(false);
    }
  }, [card.cardId, cardOperations, onCardUpdated]);

  useEffect(() => {
    loadCardDetails();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadCardDetails();
    setIsRefreshing(false);
  }, [loadCardDetails]);

  const handleCopyCardNumber = async () => {
    if (!card.cardNumber) {
      Alert.alert('Error', 'Card number not available for copying');
      return;
    }

    try {
      const result = await CardClipboard.copyCardNumber(card.cardNumber);
      if (result.success) {
        Alert.alert('Copied Securely', result.message);
      } else {
        Alert.alert('Copy Failed', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to copy card number');
    }
  };

  const handleCopyCVV = async () => {
    if (!card.cvv) {
      Alert.alert('Error', 'CVV not available for copying');
      return;
    }

    try {
      const result = await CardClipboard.copyCVV(card.cvv);
      if (result.success) {
        Alert.alert('Copied Securely', result.message);
      } else {
        Alert.alert('Copy Failed', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to copy CVV');
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'paused') => {
    try {
      setActionLoading('status');
      await cardOperations.updateCardStatus(card.cardId, newStatus);
      
      setCard(prev => ({ ...prev, status: newStatus }));
      Alert.alert('Success', `Card ${newStatus === 'active' ? 'activated' : 'paused'} successfully`);
      
      if (onCardUpdated) {
        onCardUpdated({ ...card, status: newStatus });
      }
    } catch (error) {
      Alert.alert('Error', `Failed to ${newStatus === 'active' ? 'activate' : 'pause'} card`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    const confirmationData = CardDeletion.createConfirmation(
      card.cardId,
      `Card ${card.cardId.slice(0, 8)}`,
      card.cardNumber?.slice(-4)
    );

    Alert.alert(
      'Permanent Deletion Warning',
      confirmationData.warningMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'DELETE PERMANENTLY',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading('delete');
              const success = await cardOperations.deleteCard(card.cardId);
              
              if (success) {
                Alert.alert(
                  'Card Deleted',
                  'Your card has been permanently deleted with cryptographic proof.',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        if (onCardDeleted) {
                          onCardDeleted();
                        } else if (onBack) {
                          onBack();
                        }
                      },
                    },
                  ]
                );
              } else {
                Alert.alert('Error', 'Failed to delete card');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete card');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const formatTransactionDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#22C55E';
      case 'pending':
        return '#F59E0B';
      case 'failed':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const privacyStatus = getCardPrivacyStatus(card);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Card Details</Text>
        <View style={styles.headerRight}>
          {card.cardNumber && (
            <TouchableOpacity style={styles.copyHeaderButton} onPress={handleCopyCardNumber}>
              <Text style={styles.copyHeaderButtonText}>📋</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Card Component */}
        <View style={styles.cardContainer}>
          <CardComponent
            card={card}
            showActions={false}
            style={styles.cardDisplay}
          />
        </View>

        {/* Privacy Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Security Status</Text>
          <PrivacyIndicator 
            status={privacyStatus} 
            size="large" 
            showDetails={true}
            style={styles.privacyIndicator}
          />
        </View>

        {/* Card Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Card Information</Text>
          
          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Card ID</Text>
              <Text style={styles.infoValue}>{card.cardId}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={[styles.infoValue, styles.statusValue, { color: getTransactionStatusColor(card.status) }]}>
                {card.status.toUpperCase()}
              </Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created</Text>
              <Text style={styles.infoValue}>
                {new Date(card.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Expires</Text>
              <Text style={styles.infoValue}>
                {new Date(card.expiresAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>

            {card.merchantRestrictions && card.merchantRestrictions.length > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Merchant Restrictions</Text>
                <Text style={styles.infoValue}>
                  {card.merchantRestrictions.join(', ')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Secure Actions */}
        {(card.cardNumber || card.cvv) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Secure Copy Actions</Text>
            <Text style={styles.sectionDescription}>
              Card details are temporarily available for secure copying
            </Text>
            
            <View style={styles.secureActions}>
              {card.cardNumber && (
                <TouchableOpacity
                  style={styles.secureActionButton}
                  onPress={handleCopyCardNumber}
                >
                  <Text style={styles.secureActionIcon}>💳</Text>
                  <Text style={styles.secureActionText}>Copy Card Number</Text>
                  <Text style={styles.secureActionSubtext}>Auto-clears in 30s</Text>
                </TouchableOpacity>
              )}
              
              {card.cvv && (
                <TouchableOpacity
                  style={styles.secureActionButton}
                  onPress={handleCopyCVV}
                >
                  <Text style={styles.secureActionIcon}>🔐</Text>
                  <Text style={styles.secureActionText}>Copy CVV</Text>
                  <Text style={styles.secureActionSubtext}>Auto-clears in 15s</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Transaction History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.loadingText}>Loading transactions...</Text>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyTransactions}>
              <Text style={styles.emptyTransactionsIcon}>📊</Text>
              <Text style={styles.emptyTransactionsTitle}>No Transactions Yet</Text>
              <Text style={styles.emptyTransactionsDescription}>
                Transactions will appear here once you start using this card
              </Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {transactions.map((transaction, index) => (
                <View key={transaction.id} style={styles.transactionItem}>
                  <View style={styles.transactionMain}>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionMerchant}>{transaction.merchant}</Text>
                      <Text style={styles.transactionDate}>
                        {formatTransactionDate(transaction.timestamp)}
                      </Text>
                    </View>
                    <View style={styles.transactionAmount}>
                      <Text style={styles.transactionAmountText}>
                        -{formatUSD(transaction.amount / 100)}
                      </Text>
                      <Text 
                        style={[
                          styles.transactionStatus,
                          { color: getTransactionStatusColor(transaction.status) }
                        ]}
                      >
                        {transaction.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Card Actions */}
        {card.status !== 'deleted' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Card Actions</Text>
            
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: card.status === 'active' ? '#F59E0B' : '#22C55E' },
                ]}
                onPress={() => handleStatusChange(card.status === 'active' ? 'paused' : 'active')}
                disabled={actionLoading === 'status'}
              >
                {actionLoading === 'status' ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Text style={styles.actionButtonIcon}>
                      {card.status === 'active' ? '⏸️' : '▶️'}
                    </Text>
                    <Text style={styles.actionButtonText}>
                      {card.status === 'active' ? 'Pause Card' : 'Activate Card'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.deleteActionButton]}
                onPress={handleDelete}
                disabled={actionLoading === 'delete'}
              >
                {actionLoading === 'delete' ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Text style={styles.actionButtonIcon}>🗑️</Text>
                    <Text style={styles.actionButtonText}>Delete Card</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            
            {/* Navigation Actions */}
            <View style={styles.navigationActions}>
              <TouchableOpacity
                style={styles.navigationButton}
                onPress={() => {
                  // Navigate to transaction history
                  if ((navigation as any)?.navigate) {
                    (navigation as any).navigate('TransactionHistory', { cardId: card.id });
                  }
                }}
              >
                <Text style={styles.navigationButtonIcon}>📊</Text>
                <View style={styles.navigationButtonContent}>
                  <Text style={styles.navigationButtonText}>Transaction History</Text>
                  <Text style={styles.navigationButtonDescription}>View all transactions</Text>
                </View>
                <Text style={styles.navigationButtonArrow}>→</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.navigationButton}
                onPress={() => {
                  // Navigate to privacy settings
                  if ((navigation as any)?.navigate) {
                    (navigation as any).navigate('TransactionIsolation', { cardId: card.id });
                  }
                }}
              >
                <Text style={styles.navigationButtonIcon}>🔒</Text>
                <View style={styles.navigationButtonContent}>
                  <Text style={styles.navigationButtonText}>Privacy Settings</Text>
                  <Text style={styles.navigationButtonDescription}>Configure isolation</Text>
                </View>
                <Text style={styles.navigationButtonArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },

  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    textAlign: 'center',
  },

  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },

  copyHeaderButton: {
    padding: 8,
  },

  copyHeaderButtonText: {
    fontSize: 16,
  },

  // Scroll view
  scrollView: {
    flex: 1,
  },

  // Card display
  cardContainer: {
    padding: 16,
  },

  cardDisplay: {
    marginVertical: 0,
  },

  // Sections
  section: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },

  // Privacy indicator
  privacyIndicator: {
    marginVertical: 0,
  },

  // Info container
  infoContainer: {
    gap: 12,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
  },

  infoValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },

  statusValue: {
    fontWeight: '700',
  },

  // Secure actions
  secureActions: {
    gap: 12,
  },

  secureActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },

  secureActionIcon: {
    fontSize: 20,
    marginRight: 12,
  },

  secureActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
  },

  secureActionSubtext: {
    fontSize: 12,
    color: '#3B82F6',
  },

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },

  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
  },

  // Empty transactions
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: 32,
  },

  emptyTransactionsIcon: {
    fontSize: 48,
    marginBottom: 16,
  },

  emptyTransactionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },

  emptyTransactionsDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Transactions list
  transactionsList: {
    gap: 12,
  },

  transactionItem: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  transactionMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  transactionInfo: {
    flex: 1,
  },

  transactionMerchant: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },

  transactionDate: {
    fontSize: 12,
    color: '#6B7280',
  },

  transactionAmount: {
    alignItems: 'flex-end',
  },

  transactionAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },

  transactionStatus: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },

  // Action buttons
  actionButtons: {
    gap: 12,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },

  deleteActionButton: {
    backgroundColor: '#EF4444',
  },

  actionButtonIcon: {
    fontSize: 16,
  },

  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },

  // Navigation actions
  navigationActions: {
    marginTop: 16,
    gap: 12,
  },

  navigationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  navigationButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },

  navigationButtonContent: {
    flex: 1,
  },

  navigationButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },

  navigationButtonDescription: {
    fontSize: 14,
    color: '#6B7280',
  },

  navigationButtonArrow: {
    fontSize: 20,
    color: '#6B7280',
  },

  // Bottom spacing
  bottomSpacing: {
    height: 32,
  },
});

export default CardDetailsScreen;