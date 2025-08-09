import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet 
} from 'react-native';

interface Transaction {
  transactionId: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  status: 'authorized' | 'settled' | 'declined' | 'refunded';
  processedAt: string;
  privacyCountdown: number;
}

interface TransactionListItemProps {
  transaction: Transaction;
  onPress: () => void;
}

export const TransactionListItem: React.FC<TransactionListItemProps> = ({
  transaction,
  onPress
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'settled':
        return '#10B981'; // Green
      case 'authorized':
        return '#F59E0B'; // Amber
      case 'declined':
        return '#EF4444'; // Red
      case 'refunded':
        return '#6B7280'; // Gray
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
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPrivacyCountdownText = (days: number) => {
    if (days > 30) {
      return `${days} days`;
    } else if (days > 1) {
      return `${days} days left`;
    } else if (days === 1) {
      return '1 day left';
    } else {
      return 'Expires today';
    }
  };

  const getPrivacyCountdownColor = (days: number) => {
    if (days > 30) return '#6B7280';
    if (days > 7) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`Transaction at ${transaction.merchantName} for ${formatAmount(transaction.amount)}`}
      accessibilityHint="Double tap to view transaction details"
    >
      <View style={styles.header}>
        <View style={styles.merchantInfo}>
          <Text style={styles.merchantName} numberOfLines={1}>
            {transaction.merchantName}
          </Text>
          <Text style={styles.merchantCategory}>
            {transaction.merchantCategory}
          </Text>
        </View>
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
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.date}>
          {formatDate(transaction.processedAt)}
        </Text>
        <Text style={[styles.privacyCountdown, { color: getPrivacyCountdownColor(transaction.privacyCountdown) }]}>
          🔒 {getPrivacyCountdownText(transaction.privacyCountdown)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  merchantInfo: {
    flex: 1,
    marginRight: 16,
  },
  merchantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  merchantCategory: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
  privacyCountdown: {
    fontSize: 12,
    fontWeight: '500',
  },
});