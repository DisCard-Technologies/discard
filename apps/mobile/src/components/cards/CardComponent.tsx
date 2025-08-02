/**
 * Card Component for React Native
 * Displays individual virtual card with privacy indicators and action buttons
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { formatUSD, maskCardNumber, copySecurely, CardClipboard } from '@discard/shared';
import PrivacyIndicator, { getCardPrivacyStatus } from '../privacy/PrivacyIndicator';
import { CardWithDetails } from '../../stores/cards';

export interface CardComponentProps {
  card: CardWithDetails;
  onPress?: () => void;
  onStatusChange?: (cardId: string, status: 'active' | 'paused') => void;
  onDelete?: (cardId: string) => void;
  showActions?: boolean;
  compact?: boolean;
  style?: any;
}

const CardComponent: React.FC<CardComponentProps> = ({
  card,
  onPress,
  onStatusChange,
  onDelete,
  showActions = true,
  compact = false,
  style,
}) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const privacyStatus = getCardPrivacyStatus(card);

  const handleCopyCardNumber = async () => {
    if (!card.cardNumber) {
      Alert.alert('Error', 'Card number not available');
      return;
    }

    try {
      const result = await CardClipboard.copyCardNumber(card.cardNumber);
      if (result.success) {
        Alert.alert('Copied', result.message);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to copy card number');
    }
  };

  const handleCopyCVV = async () => {
    if (!card.cvv) {
      Alert.alert('Error', 'CVV not available');
      return;
    }

    try {
      const result = await CardClipboard.copyCVV(card.cvv);
      if (result.success) {
        Alert.alert('Copied', result.message);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to copy CVV');
    }
  };

  const handleStatusToggle = async () => {
    if (!onStatusChange) return;

    const newStatus = card.status === 'active' ? 'paused' : 'active';
    const actionText = newStatus === 'paused' ? 'Pausing' : 'Activating';
    
    setActionLoading('status');
    try {
      await onStatusChange(card.cardId, newStatus);
    } catch (error) {
      Alert.alert('Error', `Failed to ${actionText.toLowerCase()} card`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = () => {
    if (!onDelete) return;

    Alert.alert(
      'Delete Card',
      `Are you sure you want to permanently delete this card? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading('delete');
            try {
              await onDelete(card.cardId);
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

  const getStatusColor = () => {
    switch (card.status) {
      case 'active':
        return '#22C55E';
      case 'paused':
        return '#F59E0B';
      case 'deleted':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = () => {
    switch (card.status) {
      case 'active':
        return '🟢';
      case 'paused':
        return '🟡';
      case 'deleted':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const formatCardNumber = () => {
    if (card.cardNumber) {
      // Show full number temporarily after creation
      return card.cardNumber.replace(/(\d{4})/g, '$1 ').trim();
    }
    return maskCardNumber(card.cardId.slice(0, 16)); // Fallback using card ID
  };

  const CardContainer = onPress ? TouchableOpacity : View;

  if (compact) {
    return (
      <CardContainer
        style={[styles.compactCard, style]}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <View style={styles.compactHeader}>
          <Text style={styles.compactStatus}>{getStatusIcon()}</Text>
          <Text style={styles.compactTitle}>Card {card.cardId.slice(0, 8)}</Text>
          <Text style={[styles.compactAmount, { color: getStatusColor() }]}>
            {formatUSD(card.currentBalance / 100)}
          </Text>
        </View>
        <PrivacyIndicator status={privacyStatus} size="small" />
      </CardContainer>
    );
  }

  return (
    <CardContainer
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {card.isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}

      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {card.status.toUpperCase()}
          </Text>
        </View>
        <PrivacyIndicator status={privacyStatus} size="small" />
      </View>

      {/* Card Number */}
      <View style={styles.cardNumberContainer}>
        <Text style={styles.cardNumberLabel}>Card Number</Text>
        <View style={styles.cardNumberRow}>
          <Text style={styles.cardNumber}>{formatCardNumber()}</Text>
          {card.cardNumber && (
            <TouchableOpacity
              style={styles.copyButton}
              onPress={handleCopyCardNumber}
            >
              <Text style={styles.copyButtonText}>📋</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Card Details */}
      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>CVV</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailValue}>
                {card.cvv || '•••'}
              </Text>
              {card.cvv && (
                <TouchableOpacity
                  style={styles.smallCopyButton}
                  onPress={handleCopyCVV}
                >
                  <Text style={styles.smallCopyButtonText}>📋</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>
              {new Date(card.expiresAt).toLocaleDateString('en-US', {
                month: '2-digit',
                year: '2-digit',
              })}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Balance</Text>
            <Text style={[styles.detailValue, styles.balanceText]}>
              {formatUSD(card.currentBalance / 100)}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Limit</Text>
            <Text style={styles.detailValue}>
              {formatUSD(card.spendingLimit / 100)}
            </Text>
          </View>
        </View>
      </View>

      {/* Merchant Restrictions */}
      {card.merchantRestrictions && card.merchantRestrictions.length > 0 && (
        <View style={styles.merchantRestrictions}>
          <Text style={styles.merchantRestrictionsLabel}>Merchant Restrictions:</Text>
          <Text style={styles.merchantRestrictionsText}>
            {card.merchantRestrictions.join(', ')}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      {showActions && card.status !== 'deleted' && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.toggleButton,
              { backgroundColor: card.status === 'active' ? '#F59E0B' : '#22C55E' },
            ]}
            onPress={handleStatusToggle}
            disabled={actionLoading === 'status'}
          >
            {actionLoading === 'status' ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.actionButtonText}>
                {card.status === 'active' ? 'Pause' : 'Activate'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDelete}
            disabled={actionLoading === 'delete'}
          >
            {actionLoading === 'delete' ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.actionButtonText}>Delete</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Error Message */}
      {card.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{card.error}</Text>
        </View>
      )}
    </CardContainer>
  );
};

const styles = StyleSheet.create({
  // Full card styles
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    position: 'relative',
  },

  // Compact card styles
  compactCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  compactStatus: {
    fontSize: 16,
  },

  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    marginLeft: 8,
  },

  compactAmount: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Loading overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    zIndex: 10,
  },

  // Header
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusIcon: {
    fontSize: 16,
    marginRight: 8,
  },

  statusText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Card number
  cardNumberContainer: {
    marginBottom: 16,
  },

  cardNumberLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },

  cardNumberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  cardNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    fontFamily: 'monospace',
    flex: 1,
  },

  copyButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },

  copyButtonText: {
    fontSize: 16,
  },

  smallCopyButton: {
    padding: 4,
    marginLeft: 8,
  },

  smallCopyButtonText: {
    fontSize: 12,
  },

  // Card details
  cardDetails: {
    marginBottom: 16,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  detailItem: {
    flex: 1,
  },

  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },

  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },

  balanceText: {
    color: '#22C55E',
    fontSize: 16,
  },

  // Merchant restrictions
  merchantRestrictions: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },

  merchantRestrictionsLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },

  merchantRestrictionsText: {
    fontSize: 12,
    color: '#1F2937',
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },

  toggleButton: {
    // Color set dynamically
  },

  deleteButton: {
    backgroundColor: '#EF4444',
  },

  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Error
  errorContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },

  errorText: {
    fontSize: 12,
    color: '#EF4444',
  },
});

export default CardComponent;