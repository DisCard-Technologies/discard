/**
 * Card Dashboard Screen for React Native
 * Displays all user cards with filtering, search, and quick actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { formatUSD } from '@discard/shared';
import { useCards, useCardOperations } from '../../stores/cards';
import CardComponent from '../../components/cards/CardComponent';
import { PrivacyStatusSummary } from '../../components/privacy/PrivacyIndicator';
import { CardWithDetails } from '../../stores/cards';

interface CardDashboardScreenProps {
  onCardPress?: (card: CardWithDetails) => void;
  onCreateCard?: () => void;
  navigation?: any; // For navigation if available
}

type FilterType = 'all' | 'active' | 'paused' | 'deleted';

const CardDashboardScreen: React.FC<CardDashboardScreenProps> = ({
  onCardPress,
  onCreateCard,
  navigation,
}) => {
  const { state } = useCards();
  const cardOperations = useCardOperations();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Load cards on mount
  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = useCallback(async () => {
    try {
      await cardOperations.loadCards({
        status: activeFilter === 'all' ? undefined : activeFilter,
        limit: 50,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to load cards');
    }
  }, [activeFilter, cardOperations]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadCards();
    setIsRefreshing(false);
  }, [loadCards]);

  const handleFilterChange = useCallback((filter: FilterType) => {
    setActiveFilter(filter);
    // loadCards will be triggered by useEffect dependency
  }, []);

  const handleCardStatusChange = useCallback(async (cardId: string, status: 'active' | 'paused') => {
    try {
      await cardOperations.updateCardStatus(cardId, status);
      Alert.alert('Success', `Card ${status === 'active' ? 'activated' : 'paused'} successfully`);
    } catch (error) {
      Alert.alert('Error', `Failed to ${status === 'active' ? 'activate' : 'pause'} card`);
    }
  }, [cardOperations]);

  const handleCardDelete = useCallback(async (cardId: string) => {
    try {
      const success = await cardOperations.deleteCard(cardId);
      if (success) {
        Alert.alert('Success', 'Card deleted permanently');
      } else {
        Alert.alert('Error', 'Failed to delete card');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to delete card');
    }
  }, [cardOperations]);

  // Filter cards based on search and status
  const filteredCards = state.cards.filter(card => {
    // Status filter
    if (activeFilter !== 'all' && card.status !== activeFilter) {
      return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const cardId = card.cardId.toLowerCase();
      const matchesId = cardId.includes(query);
      
      return matchesId;
    }

    return true;
  });

  // Calculate stats
  const stats = {
    total: state.cards.length,
    active: state.cards.filter(c => c.status === 'active').length,
    paused: state.cards.filter(c => c.status === 'paused').length,
    deleted: state.cards.filter(c => c.status === 'deleted').length,
    totalBalance: state.cards
      .filter(c => c.status === 'active')
      .reduce((sum, card) => sum + card.currentBalance, 0),
    totalLimit: state.cards
      .filter(c => c.status === 'active')
      .reduce((sum, card) => sum + card.spendingLimit, 0),
  };

  const renderFilterButton = (filter: FilterType, label: string, count: number) => (
    <TouchableOpacity
      key={filter}
      style={[
        styles.filterButton,
        activeFilter === filter && styles.filterButtonActive,
      ]}
      onPress={() => handleFilterChange(filter)}
    >
      <Text
        style={[
          styles.filterButtonText,
          activeFilter === filter && styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
      {count > 0 && (
        <View style={styles.filterCount}>
          <Text style={styles.filterCountText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderCard = ({ item }: { item: CardWithDetails }) => (
    <CardComponent
      card={item}
      onPress={() => onCardPress?.(item)}
      onStatusChange={handleCardStatusChange}
      onDelete={handleCardDelete}
      showActions={true}
      style={styles.cardItem}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>💳</Text>
      <Text style={styles.emptyStateTitle}>
        {activeFilter === 'all' ? 'No Cards Yet' : `No ${activeFilter} Cards`}
      </Text>
      <Text style={styles.emptyStateDescription}>
        {activeFilter === 'all'
          ? 'Create your first disposable virtual card to get started'
          : `You don't have any ${activeFilter} cards`}
      </Text>
      {activeFilter === 'all' && onCreateCard && (
        <TouchableOpacity style={styles.emptyStateButton} onPress={onCreateCard}>
          <Text style={styles.emptyStateButtonText}>Create First Card</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const ListHeaderComponent = () => (
    <View>
      {/* Stats Overview */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.active}</Text>
          <Text style={styles.statLabel}>Active Cards</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.balanceValue]}>
            {formatUSD(stats.totalBalance / 100)}
          </Text>
          <Text style={styles.statLabel}>Total Balance</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {formatUSD(stats.totalLimit / 100)}
          </Text>
          <Text style={styles.statLabel}>Total Limit</Text>
        </View>
      </View>

      {/* Privacy Summary */}
      {state.cards.length > 0 && (
        <PrivacyStatusSummary cards={state.cards} style={styles.privacySummary} />
      )}

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by card ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          <TouchableOpacity
            style={styles.searchCloseButton}
            onPress={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
          >
            <Text style={styles.searchCloseButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Buttons */}
      <View style={styles.filtersContainer}>
        <View style={styles.filterButtons}>
          {renderFilterButton('all', 'All', stats.total)}
          {renderFilterButton('active', 'Active', stats.active)}
          {renderFilterButton('paused', 'Paused', stats.paused)}
          {renderFilterButton('deleted', 'Deleted', stats.deleted)}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>My Cards</Text>
          <Text style={styles.subtitle}>
            {filteredCards.length} {filteredCards.length === 1 ? 'card' : 'cards'}
          </Text>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSearch(!showSearch)}
          >
            <Text style={styles.headerButtonText}>🔍</Text>
          </TouchableOpacity>
          
          {onCreateCard && (
            <TouchableOpacity
              style={[styles.headerButton, styles.createButton]}
              onPress={onCreateCard}
            >
              <Text style={styles.createButtonText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error Display */}
      {state.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{state.error}</Text>
          <TouchableOpacity
            style={styles.errorDismiss}
            onPress={cardOperations.clearError}
          >
            <Text style={styles.errorDismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cards List */}
      {state.isLoading && filteredCards.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading cards...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCards}
          renderItem={renderCard}
          keyExtractor={(item) => item.cardId}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#3B82F6"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  headerLeft: {
    flex: 1,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },

  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },

  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },

  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },

  headerButtonText: {
    fontSize: 16,
  },

  createButton: {
    backgroundColor: '#3B82F6',
  },

  createButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
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

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },

  // List
  listContent: {
    flexGrow: 1,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },

  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },

  balanceValue: {
    color: '#22C55E',
  },

  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },

  // Privacy summary
  privacySummary: {
    marginHorizontal: 16,
    marginBottom: 16,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },

  searchCloseButton: {
    padding: 8,
  },

  searchCloseButtonText: {
    fontSize: 16,
    color: '#6B7280',
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  filterButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },

  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },

  filterButtonTextActive: {
    color: 'white',
  },

  filterCount: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
  },

  filterCountText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },

  // Card items
  cardItem: {
    marginHorizontal: 16,
    marginVertical: 4,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },

  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },

  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },

  emptyStateDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },

  emptyStateButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },

  emptyStateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CardDashboardScreen;