import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Share,
  Alert
} from 'react-native';

interface TransactionDetail {
  transactionId: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  status: 'authorized' | 'settled' | 'declined' | 'refunded';
  processedAt: string;
  authorizationCode?: string;
  privacyCountdown: number;
  encryptionStatus: boolean;
  refundInfo?: {
    refundAmount: number;
    refundDate: string;
    reason?: string;
  } | null;
  maskedCardNumber?: string;
  maskedAuthCode?: string;
  transactionHash?: string;
}

interface TransactionDetailModalProps {
  visible: boolean;
  transaction: TransactionDetail | null;
  onClose: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  visible,
  transaction,
  onClose
}) => {
  if (!transaction) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'settled':
        return '#10B981';
      case 'authorized':
        return '#F59E0B';
      case 'declined':
        return '#EF4444';
      case 'refunded':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'settled':
        return 'Completed';
      case 'authorized':
        return 'Pending';
      case 'declined':
        return 'Declined';
      case 'refunded':
        return 'Refunded';
      default:
        return status;
    }
  };

  const formatAmount = (amount: number) => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const getPrivacyCountdownText = (days: number) => {
    if (days > 30) {
      return `${days} days remaining`;
    } else if (days > 1) {
      return `${days} days left`;
    } else if (days === 1) {
      return '1 day remaining';
    } else {
      return 'Expires today';
    }
  };

  const getPrivacyCountdownColor = (days: number) => {
    if (days > 30) return '#6B7280';
    if (days > 7) return '#F59E0B';
    return '#EF4444';
  };

  const handleExport = async () => {
    try {
      const exportData = `Transaction Details
Merchant: ${transaction.merchantName}
Amount: ${formatAmount(transaction.amount)}
Status: ${getStatusDisplay(transaction.status)}
Date: ${formatDate(transaction.processedAt)}
Category: ${transaction.merchantCategory}
Transaction ID: ${transaction.transactionId}
${transaction.authorizationCode ? `Auth Code: ${transaction.maskedAuthCode || transaction.authorizationCode}` : ''}
${transaction.maskedCardNumber ? `Card: ${transaction.maskedCardNumber}` : ''}

Privacy Information:
Data retention: ${getPrivacyCountdownText(transaction.privacyCountdown)}
Encryption: ${transaction.encryptionStatus ? 'Enabled' : 'Disabled'}
${transaction.transactionHash ? `Verification Hash: ${transaction.transactionHash.substring(0, 16)}...` : ''}`;

      await Share.share({
        message: exportData,
        title: 'Transaction Details'
      });
    } catch (error) {
      Alert.alert('Export Failed', 'Unable to export transaction details');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close transaction details">
            <Text style={styles.closeButton}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Transaction Details</Text>
          <TouchableOpacity onPress={handleExport} accessibilityLabel="Export transaction details">
            <Text style={styles.exportButton}>Export</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Transaction Overview */}
          <View style={styles.section}>
            <View style={styles.amountContainer}>
              <Text style={[styles.amount, { color: transaction.status === 'refunded' ? '#10B981' : '#333' }]}>
                {transaction.status === 'refunded' ? '+' : '-'}{formatAmount(transaction.amount)}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(transaction.status) }]}>
                <Text style={styles.statusText}>
                  {getStatusDisplay(transaction.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.merchantName}>{transaction.merchantName}</Text>
            <Text style={styles.date}>{formatDate(transaction.processedAt)}</Text>
          </View>

          {/* Transaction Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction Information</Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{transaction.merchantCategory}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Transaction ID</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {transaction.transactionId}
              </Text>
            </View>
            
            {transaction.authorizationCode && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Authorization Code</Text>
                <Text style={styles.detailValue}>
                  {transaction.maskedAuthCode || transaction.authorizationCode}
                </Text>
              </View>
            )}
            
            {transaction.maskedCardNumber && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Card</Text>
                <Text style={styles.detailValue}>
                  {transaction.maskedCardNumber}
                </Text>
              </View>
            )}
          </View>

          {/* Refund Information */}
          {transaction.refundInfo && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Refund Information</Text>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Refund Amount</Text>
                <Text style={[styles.detailValue, { color: '#10B981' }]}>
                  +{formatAmount(transaction.refundInfo.refundAmount)}
                </Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Refund Date</Text>
                <Text style={styles.detailValue}>
                  {formatDate(transaction.refundInfo.refundDate)}
                </Text>
              </View>
              
              {transaction.refundInfo.reason && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reason</Text>
                  <Text style={styles.detailValue}>
                    {transaction.refundInfo.reason}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Privacy Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Privacy & Security</Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Data Retention</Text>
              <Text style={[styles.detailValue, { color: getPrivacyCountdownColor(transaction.privacyCountdown) }]}>
                🔒 {getPrivacyCountdownText(transaction.privacyCountdown)}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Encryption Status</Text>
              <Text style={[styles.detailValue, { color: transaction.encryptionStatus ? '#10B981' : '#EF4444' }]}>
                {transaction.encryptionStatus ? '🔐 Encrypted' : '⚠️ Not Encrypted'}
              </Text>
            </View>
            
            {transaction.transactionHash && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Verification Hash</Text>
                <Text style={[styles.detailValue, styles.hashValue]} numberOfLines={1}>
                  {transaction.transactionHash}
                </Text>
              </View>
            )}
          </View>

          {/* Privacy Notice */}
          <View style={styles.privacyNotice}>
            <Text style={styles.privacyTitle}>Privacy Notice</Text>
            <Text style={styles.privacyText}>
              This transaction data is cryptographically isolated to this card only. 
              It will be automatically deleted after the retention period expires, 
              ensuring your privacy and data minimization.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    fontSize: 16,
    color: '#6B7280',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  exportButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  amount: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  merchantName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 16,
    color: '#6B7280',
    flex: 1,
  },
  detailValue: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  hashValue: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  privacyNotice: {
    marginTop: 24,
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0EA5E9',
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    color: '#0369A1',
    lineHeight: 20,
  },
});