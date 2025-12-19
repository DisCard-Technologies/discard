import React from 'react';
import { 
  FlatList, 
  View, 
  Text, 
  StyleSheet, 
  RefreshControl, 
  ActivityIndicator 
} from 'react-native';
import { TransactionListItem } from './TransactionListItem';

interface Transaction {
  transactionId: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  status: 'authorized' | 'settled' | 'declined' | 'refunded';
  processedAt: string;
  privacyCountdown: number;
}

interface TransactionListProps {
  transactions: Transaction[];
  onRefresh: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  isLoading: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  onTransactionPress: (transactionId: string) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  onRefresh,
  onLoadMore,
  isLoading,
  isRefreshing,
  hasMore,
  onTransactionPress
}) => {
  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TransactionListItem
      transaction={item}
      onPress={() => onTransactionPress(item.transactionId)}
    />
  );

  const renderFooter = () => {
    if (!isLoading || transactions.length === 0) return null;
    
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.loadingText}>Loading more transactions...</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No transactions yet</Text>
      <Text style={styles.emptySubtitle}>
        Your transaction history will appear here once you start using this card
      </Text>
    </View>
  );

  const handleEndReached = () => {
    if (hasMore && !isLoading) {
      onLoadMore();
    }
  };

  return (
    <FlatList
      data={transactions}
      renderItem={renderTransaction}
      keyExtractor={(item) => item.transactionId}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={['#007AFF']}
          tintColor="#007AFF"
        />
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.3}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={transactions.length === 0 ? styles.emptyList : undefined}
      showsVerticalScrollIndicator={false}
      accessibilityLabel="Transaction history list"
    />
  );
};

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyList: {
    flex: 1,
  },
});