import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TouchableOpacity
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TransactionList } from '../../components/transactions/TransactionList';
import { TransactionSearchBar, TransactionSearchQuery, TransactionFilters } from '../../components/transactions/TransactionSearchBar';
import { TransactionDetailModal } from '../../components/transactions/TransactionDetailModal';
import { TransactionAnalytics } from '../../components/transactions/TransactionAnalytics';
import { useTransactionWebSocket } from '../../hooks/useTransactionWebSocket';
// API base URL - should be moved to environment config
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

interface Transaction {
  transactionId: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  status: 'authorized' | 'settled' | 'declined' | 'refunded';
  processedAt: string;
  authorizationCode?: string;
  privacyCountdown: number;
}

interface TransactionDetail extends Transaction {
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

interface TransactionHistoryScreenProps {
  route: {
    params: {
      cardId: string;
      cardName?: string;
    };
  };
  navigation: any;
}

const TransactionHistoryScreen: React.FC<TransactionHistoryScreenProps> = ({ 
  route, 
  navigation 
}) => {
  const { cardId, cardName } = route.params;
  
  // State management
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState<TransactionSearchQuery>({});
  const [searchFilters, setSearchFilters] = useState<TransactionFilters>({
    merchant: '',
    minAmount: '',
    maxAmount: '',
    category: '',
    status: ''
  });
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebSocket integration for real-time updates
  const { 
    isConnected, 
    lastUpdate, 
    subscribeToCard, 
    unsubscribeFromCard 
  } = useTransactionWebSocket();

  // Set screen title
  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: cardName ? `${cardName} History` : 'Transaction History',
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setShowAnalytics(!showAnalytics)}
            style={styles.headerButton}
            accessibilityLabel={showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
          >
            <Text style={styles.headerButtonText}>
              {showAnalytics ? '📊' : '📈'}
            </Text>
          </TouchableOpacity>
        ),
      });
    }, [navigation, cardName, showAnalytics])
  );

  // Initialize data loading and WebSocket subscription
  useEffect(() => {
    loadTransactionHistory();
    if (isConnected) {
      subscribeToCard(cardId, ['history', 'transactions']);
    }

    return () => {
      if (isConnected) {
        unsubscribeFromCard(cardId);
      }
    };
  }, [cardId, isConnected]);

  // Handle real-time updates
  useEffect(() => {
    if (lastUpdate && 
      ((lastUpdate.type === 'transactionHistoryUpdated' && lastUpdate.cardId === cardId) ||
       (lastUpdate.type === 'new_transaction' && lastUpdate.cardContext === cardId))) {
    handleRealTimeUpdate(lastUpdate);
  }
  }, [lastUpdate, cardId]);

  /**
   * Load transaction history from API
   */
  const loadTransactionHistory = async (
    page: number = 1, 
    append: boolean = false,
    query: TransactionSearchQuery = {}
  ) => {
    try {
      if (!append) {
        setIsLoading(true);
        setError(null);
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });

      // Add filters to params
      if (query.merchant) params.append('merchantName', query.merchant);
      if (query.minAmount) params.append('minAmount', query.minAmount.toString());
      if (query.maxAmount) params.append('maxAmount', query.maxAmount.toString());
      if (query.category) params.append('category', query.category);
      if (query.status) params.append('status', query.status);

      const response = await fetch(`${API_BASE_URL}/api/v1/cards/${cardId}/transactions?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (append && page > 1) {
          setTransactions(prev => [...prev, ...data.transactions]);
        } else {
          setTransactions(data.transactions);
          setAnalytics(data.analytics);
        }
        
        setHasMore(data.pagination.hasMore);
        setCurrentPage(page);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load transactions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      Alert.alert('Error', `Failed to load transaction history: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  /**
   * Load transaction detail
   */
  const loadTransactionDetail = async (transactionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/transactions/${transactionId}`);
      
      if (response.ok) {
        const data = await response.json();
        setSelectedTransaction(data);
      } else {
        Alert.alert('Error', 'Failed to load transaction details');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load transaction details');
    }
  };

  /**
   * Handle pull-to-refresh
   */
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setCurrentPage(1);
    await loadTransactionHistory(1, false, searchQuery);
  }, [searchQuery]);

  /**
   * Handle load more (infinite scroll)
   */
  const onLoadMore = useCallback(async () => {
    if (hasMore && !isLoadingMore && !isLoading) {
      setIsLoadingMore(true);
      await loadTransactionHistory(currentPage + 1, true, searchQuery);
    }
  }, [hasMore, isLoadingMore, isLoading, currentPage, searchQuery]);

  /**
   * Handle search
   */
  const onSearch = useCallback(async (query: TransactionSearchQuery) => {
    setSearchQuery(query);
    setCurrentPage(1);
    await loadTransactionHistory(1, false, query);
  }, []);

  /**
   * Handle transaction selection
   */
  const onTransactionPress = useCallback((transactionId: string) => {
    setSelectedTransactionId(transactionId);
    loadTransactionDetail(transactionId);
  }, []);

  /**
   * Handle modal close
   */
  const onCloseModal = useCallback(() => {
    setSelectedTransactionId(null);
    setSelectedTransaction(null);
  }, []);

  /**
   * Handle real-time transaction updates
   */
  const handleRealTimeUpdate = (update: any) => {
    switch (update.type) {
      case 'transactionHistoryUpdated':
        if (update.update.type === 'new') {
          // Add new transaction to the top of the list
          setTransactions(prev => [update.update.transaction, ...prev]);
          
          // Update analytics if provided
          if (update.update.affectedAnalytics) {
            setAnalytics((prev: any) => ({
              ...prev,
              totalSpent: prev.totalSpent + update.update.affectedAnalytics.totalSpentChange,
              transactionCount: prev.transactionCount + 1,
              categoryBreakdown: {
                ...prev.categoryBreakdown,
                ...update.update.affectedAnalytics.categoryChange
              }
            }));
          }
        } else if (update.update.type === 'status_change') {
          // Update existing transaction status
          setTransactions(prev => 
            prev.map(tx => 
              tx.transactionId === update.update.transaction.transactionId
                ? { ...tx, ...update.update.transaction }
                : tx
            )
          );
        }
        break;
        
      case 'new_transaction':
        // Handle legacy format
        const newTransaction = {
          transactionId: update.transactionId,
          merchantName: update.merchantName,
          merchantCategory: update.category,
          amount: update.amount,
          status: update.status,
          processedAt: update.timestamp,
          privacyCountdown: 365 // Default
        };
        
        setTransactions(prev => [newTransaction, ...prev]);
        break;
    }
  };

  // Render loading state
  if (isLoading && transactions.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading transaction history...</Text>
      </View>
    );
  }

  // Render error state
  if (error && transactions.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={() => loadTransactionHistory()}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Bar */}
      <TransactionSearchBar
        onSearch={onSearch}
        filters={searchFilters}
        onFiltersChange={setSearchFilters}
      />

      {/* Analytics Panel (if enabled) */}
      {showAnalytics && analytics && (
        <View style={styles.analyticsContainer}>
          <TransactionAnalytics 
            analytics={analytics}
            cardId={cardId}
          />
        </View>
      )}

      {/* Connection Status Indicator */}
      <View style={styles.statusBar}>
        <View style={[
          styles.connectionIndicator, 
          { backgroundColor: isConnected ? '#4CAF50' : '#FF9800' }
        ]} />
        <Text style={styles.statusText}>
          {isConnected ? 'Real-time updates active' : 'Offline mode'}
        </Text>
        {isRefreshing && (
          <ActivityIndicator 
            size="small" 
            color="#007AFF" 
            style={styles.refreshIndicator} 
          />
        )}
      </View>

      {/* Transaction List */}
      <TransactionList
        transactions={transactions}
        onRefresh={onRefresh}
        onLoadMore={onLoadMore}
        isLoading={isLoadingMore}
        isRefreshing={isRefreshing}
        hasMore={hasMore}
        onTransactionPress={onTransactionPress}
      />

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        visible={selectedTransactionId !== null}
        transaction={selectedTransaction}
        onClose={onCloseModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButton: {
    marginRight: 16,
  },
  headerButtonText: {
    fontSize: 20,
  },
  analyticsContainer: {
    maxHeight: 300,
    backgroundColor: '#FFFFFF',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
  refreshIndicator: {
    marginLeft: 8,
  },
});

export default TransactionHistoryScreen;