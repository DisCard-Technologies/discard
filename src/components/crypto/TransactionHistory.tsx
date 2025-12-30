import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';

export interface TransactionHistoryProps {
  cardId: string;
  onTransactionSelected?: (transactionId: string) => void;
}

interface TransactionHistoryItem {
  processingId: string;
  transactionId: string;
  status: string;
  confirmationCount: number;
  requiredConfirmations: number;
  networkFeeEstimate: number;
  estimatedCompletion: string;
  networkType: string;
  createdAt: string;
  completedAt?: string;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  cardId,
  onTransactionSelected
}) => {
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionHistoryItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'pending' | 'confirmed' | 'failed'>('all');

  const { getTransactionHistory, isLoading } = useCryptoStore();

  const loadTransactions = useCallback(async (refresh = false) => {
    try {
      const newOffset = refresh ? 0 : offset;
      const limit = 20;

      const result = await getTransactionHistory(cardId, limit, newOffset);
      
      if (refresh) {
        setTransactions(result.transactions);
        setOffset(limit);
      } else {
        setTransactions(prev => [...prev, ...result.transactions]);
        setOffset(prev => prev + limit);
      }

      setHasMore(result.pagination.hasMore);
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
  }, [cardId, offset, getTransactionHistory]);

  useEffect(() => {
    loadTransactions(true);
  }, [cardId]);

  useEffect(() => {
    // Apply filters and search
    let filtered = transactions;

    // Apply status filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(tx => {
        switch (selectedFilter) {
          case 'pending':
            return tx.status === 'pending' || tx.status === 'confirming' || tx.status === 'initiated';
          case 'confirmed':
            return tx.status === 'confirmed';
          case 'failed':
            return tx.status === 'failed' || tx.status === 'refunded';
          default:
            return true;
        }
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.transactionId.toLowerCase().includes(query) ||
        tx.processingId.toLowerCase().includes(query) ||
        tx.networkType.toLowerCase().includes(query)
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, selectedFilter, searchQuery]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setOffset(0);
    await loadTransactions(true);
    setIsRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (hasMore && !isLoadingMore && !isLoading) {
      setIsLoadingMore(true);
      await loadTransactions(false);
      setIsLoadingMore(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      'initiated': '#ffa500',
      'pending': '#ff8c00',
      'confirming': '#32cd32',
      'confirmed': '#008000',
      'failed': '#dc3545',
      'refunded': '#6c757d'
    };
    return colors[status] || '#6c757d';
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      'initiated': '🚀',
      'pending': '⏳',
      'confirming': '⚡',
      'confirmed': '✅',
      'failed': '❌',
      'refunded': '↩️'
    };
    return icons[status] || '📊';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFee = (fee: number) => {
    return `$${(fee / 100).toFixed(2)}`;
  };

  const getFilterCount = (filter: string) => {
    switch (filter) {
      case 'pending':
        return transactions.filter(tx => 
          tx.status === 'pending' || tx.status === 'confirming' || tx.status === 'initiated'
        ).length;
      case 'confirmed':
        return transactions.filter(tx => tx.status === 'confirmed').length;
      case 'failed':
        return transactions.filter(tx => tx.status === 'failed' || tx.status === 'refunded').length;
      default:
        return transactions.length;
    }
  };

  const renderTransaction = ({ item }: { item: TransactionHistoryItem }) => (
    <TouchableOpacity
      style={styles.transactionItem}
      onPress={() => onTransactionSelected?.(item.transactionId)}
    >
      <View style={styles.transactionHeader}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusIcon}>{getStatusIcon(item.status)}</Text>
          <View>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.toUpperCase()}
            </Text>
            <Text style={styles.networkType}>{item.networkType}</Text>
          </View>
        </View>
        <View style={styles.feeContainer}>
          <Text style={styles.feeText}>{formatFee(item.networkFeeEstimate)}</Text>
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.transactionDetails}>
        <View style={styles.confirmationContainer}>
          <Text style={styles.confirmationText}>
            {item.confirmationCount}/{item.requiredConfirmations} confirmations
          </Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill,
                { 
                  width: `${Math.min((item.confirmationCount / item.requiredConfirmations) * 100, 100)}%`,
                  backgroundColor: getStatusColor(item.status)
                }
              ]}
            />
          </View>
        </View>

        <Text style={styles.transactionId} numberOfLines={1} ellipsizeMode="middle">
          ID: {item.transactionId}
        </Text>

        {item.completedAt ? (
          <Text style={styles.completedText}>
            Completed: {formatDate(item.completedAt)}
          </Text>
        ) : item.status !== 'failed' && item.status !== 'refunded' && (
          <Text style={styles.estimatedText}>
            Est. completion: {formatDate(item.estimatedCompletion)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transaction History</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by transaction ID or network..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        {[
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'confirmed', label: 'Confirmed' },
          { key: 'failed', label: 'Failed' }
        ].map(filter => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterButton,
              selectedFilter === filter.key && styles.filterButtonActive
            ]}
            onPress={() => setSelectedFilter(filter.key as any)}
          >
            <Text style={[
              styles.filterButtonText,
              selectedFilter === filter.key && styles.filterButtonTextActive
            ]}>
              {filter.label} ({getFilterCount(filter.key)})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTransactions}
        renderItem={renderTransaction}
        keyExtractor={item => item.processingId}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Transactions</Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedFilter !== 'all' 
                ? 'No transactions match your current filters.' 
                : 'Your transaction history will appear here.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingFooter}>
              <Text style={styles.loadingText}>Loading more...</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a12',
  },
  header: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  searchInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8B9299',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  transactionItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
  },
  networkType: {
    fontSize: 12,
    color: '#8B9299',
    fontWeight: '500',
    marginTop: 2,
  },
  feeContainer: {
    alignItems: 'flex-end',
  },
  feeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  dateText: {
    fontSize: 12,
    color: '#8B9299',
    marginTop: 2,
  },
  transactionDetails: {
    marginTop: 8,
  },
  confirmationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  confirmationText: {
    fontSize: 12,
    color: '#8B9299',
    marginRight: 12,
    minWidth: 100,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  transactionId: {
    fontSize: 12,
    color: '#8B9299',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  completedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  estimatedText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#8B9299',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingFooter: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#8B9299',
  },
});