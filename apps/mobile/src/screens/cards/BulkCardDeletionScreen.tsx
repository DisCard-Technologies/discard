/**
 * Bulk Card Deletion Screen for React Native
 * Allows users to select and delete multiple cards in a single operation
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Switch,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { formatUSD } from '@discard/shared';
import { CardWithDetails } from '../../stores/cards';

interface BulkDeletionProgress {
  batchId?: string;
  totalCards: number;
  completedCards: number;
  failedCards: number;
  status: 'selecting' | 'confirming' | 'processing' | 'completed' | 'failed';
  currentCard?: string;
  errors: Array<{ cardId: string; error: string }>;
}

interface BulkDeletionResult {
  cardId: string;
  status: 'completed' | 'failed' | 'pending';
  deletionProof?: string;
  error?: string;
}

export interface BulkCardDeletionScreenProps {
  cards: CardWithDetails[];
  onBulkDelete: (cardIds: string[], confirmationPhrase: string, scheduledDeletion?: Date) => Promise<void>;
  onGoBack: () => void;
}

const REQUIRED_CONFIRMATION_PHRASE = 'DELETE ALL SELECTED';
const MAX_SELECTABLE_CARDS = 100;

const BulkCardDeletionScreen: React.FC<BulkCardDeletionScreenProps> = ({
  cards,
  onBulkDelete,
  onGoBack,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'balance' | 'status'>('created');
  const [progress, setProgress] = useState<BulkDeletionProgress>({
    totalCards: 0,
    completedCards: 0,
    failedCards: 0,
    status: 'selecting',
    errors: [],
  });
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [enableScheduling, setEnableScheduling] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [deletionResults, setDeletionResults] = useState<BulkDeletionResult[]>([]);

  // Filter and sort cards based on search and sort criteria
  const filteredAndSortedCards = useMemo(() => {
    let filtered = cards.filter(card => 
      card.status !== 'deleted' && (
        searchQuery === '' ||
        card.cardId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.status.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'balance':
          return (b.currentBalance || 0) - (a.currentBalance || 0);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'created':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return filtered;
  }, [cards, searchQuery, sortBy]);

  // Calculate impact summary
  const impactSummary = useMemo(() => {
    const selectedCards = cards.filter(card => selectedCardIds.has(card.cardId));
    return {
      totalCards: selectedCards.length,
      totalBalance: selectedCards.reduce((sum, card) => sum + (card.currentBalance || 0), 0),
      activeCards: selectedCards.filter(card => card.status === 'active').length,
      pausedCards: selectedCards.filter(card => card.status === 'paused').length,
    };
  }, [cards, selectedCardIds]);

  const handleCardSelection = (cardId: string) => {
    const newSelected = new Set(selectedCardIds);
    
    if (newSelected.has(cardId)) {
      newSelected.delete(cardId);
    } else {
      if (newSelected.size >= MAX_SELECTABLE_CARDS) {
        Alert.alert(
          'Selection Limit',
          `You can select a maximum of ${MAX_SELECTABLE_CARDS} cards for bulk deletion.`,
          [{ text: 'OK' }]
        );
        return;
      }
      newSelected.add(cardId);
    }
    
    setSelectedCardIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedCardIds.size === filteredAndSortedCards.length) {
      setSelectedCardIds(new Set());
    } else {
      const cardsToSelect = filteredAndSortedCards.slice(0, MAX_SELECTABLE_CARDS);
      setSelectedCardIds(new Set(cardsToSelect.map(card => card.cardId)));
    }
  };

  const handleProceedToConfirmation = () => {
    if (selectedCardIds.size === 0) {
      Alert.alert('No Cards Selected', 'Please select at least one card to delete.');
      return;
    }

    setProgress({
      ...progress,
      status: 'confirming',
      totalCards: selectedCardIds.size,
    });
  };

  const handleConfirmDeletion = async () => {
    if (confirmationPhrase !== REQUIRED_CONFIRMATION_PHRASE) {
      Alert.alert('Invalid Confirmation', 'Please type the confirmation phrase exactly as shown.');
      return;
    }

    const cardIdsArray = Array.from(selectedCardIds);
    const scheduledDeletion = enableScheduling ? scheduledDate : undefined;

    setProgress({
      ...progress,
      status: 'processing',
      totalCards: cardIdsArray.length,
      completedCards: 0,
      failedCards: 0,
      errors: [],
    });

    try {
      await onBulkDelete(cardIdsArray, confirmationPhrase, scheduledDeletion);
      
      setProgress({
        ...progress,
        status: 'completed',
      });

      // Simulate results for demo (in real app, this would come from API)
      const simulatedResults: BulkDeletionResult[] = cardIdsArray.map(cardId => ({
        cardId,
        status: Math.random() > 0.1 ? 'completed' : 'failed', // 90% success rate
        deletionProof: Math.random() > 0.1 ? `proof-${Date.now()}-${cardId.slice(-8)}` : undefined,
        error: Math.random() > 0.1 ? undefined : 'Network timeout',
      }));

      setDeletionResults(simulatedResults);

      const completed = simulatedResults.filter(r => r.status === 'completed').length;
      const failed = simulatedResults.filter(r => r.status === 'failed').length;

      setProgress({
        ...progress,
        status: completed === cardIdsArray.length ? 'completed' : 'failed',
        completedCards: completed,
        failedCards: failed,
        errors: simulatedResults
          .filter(r => r.status === 'failed')
          .map(r => ({ cardId: r.cardId, error: r.error || 'Unknown error' })),
      });

    } catch (error) {
      setProgress({
        ...progress,
        status: 'failed',
        errors: [{ cardId: 'batch', error: error instanceof Error ? error.message : 'Bulk deletion failed' }],
      });
    }
  };

  const handleRetry = () => {
    setProgress({
      totalCards: 0,
      completedCards: 0,
      failedCards: 0,
      status: 'selecting',
      errors: [],
    });
    setConfirmationPhrase('');
    setDeletionResults([]);
  };

  const renderCardItem = ({ item }: { item: CardWithDetails }) => {
    const isSelected = selectedCardIds.has(item.cardId);
    const isDisabled = progress.status !== 'selecting';

    return (
      <TouchableOpacity
        style={[
          styles.cardItem,
          isSelected && styles.cardItemSelected,
          isDisabled && styles.cardItemDisabled,
        ]}
        onPress={() => !isDisabled && handleCardSelection(item.cardId)}
        disabled={isDisabled}
      >
        <View style={styles.cardItemHeader}>
          <Text style={styles.cardNumber}>•••• •••• •••• {item.lastFour || '0000'}</Text>
          <View style={[styles.selectionIndicator, isSelected && styles.selectionIndicatorSelected]}>
            {isSelected && <Text style={styles.selectionCheckmark}>✓</Text>}
          </View>
        </View>
        
        <View style={styles.cardItemDetails}>
          <Text style={styles.cardStatus}>Status: {item.status}</Text>
          <Text style={styles.cardBalance}>Balance: {formatUSD(item.currentBalance || 0)}</Text>
          <Text style={styles.cardCreated}>
            Created: {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSelectionScreen = () => (
    <>
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search cards..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        
        <View style={styles.sortSection}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'created' && styles.sortButtonActive]}
            onPress={() => setSortBy('created')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'created' && styles.sortButtonTextActive]}>
              Created
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'balance' && styles.sortButtonActive]}
            onPress={() => setSortBy('balance')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'balance' && styles.sortButtonTextActive]}>
              Balance
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'status' && styles.sortButtonActive]}
            onPress={() => setSortBy('status')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'status' && styles.sortButtonTextActive]}>
              Status
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.selectionHeader}>
        <TouchableOpacity style={styles.selectAllButton} onPress={handleSelectAll}>
          <Text style={styles.selectAllButtonText}>
            {selectedCardIds.size === filteredAndSortedCards.length ? 'Deselect All' : 'Select All'}
          </Text>
        </TouchableOpacity>
        
        <Text style={styles.selectionCount}>
          {selectedCardIds.size} of {filteredAndSortedCards.length} selected
        </Text>
      </View>

      <FlatList
        data={filteredAndSortedCards}
        renderItem={renderCardItem}
        keyExtractor={item => item.cardId}
        style={styles.cardsList}
        showsVerticalScrollIndicator={false}
      />

      {selectedCardIds.size > 0 && (
        <View style={styles.impactSummary}>
          <Text style={styles.impactTitle}>Selection Summary</Text>
          <View style={styles.impactGrid}>
            <View style={styles.impactItem}>
              <Text style={styles.impactNumber}>{impactSummary.totalCards}</Text>
              <Text style={styles.impactLabel}>Cards</Text>
            </View>
            <View style={styles.impactItem}>
              <Text style={styles.impactNumber}>{formatUSD(impactSummary.totalBalance)}</Text>
              <Text style={styles.impactLabel}>Total Balance</Text>
            </View>
            <View style={styles.impactItem}>
              <Text style={styles.impactNumber}>{impactSummary.activeCards}</Text>
              <Text style={styles.impactLabel}>Active</Text>
            </View>
          </View>
        </View>
      )}
    </>
  );

  const renderConfirmationScreen = () => (
    <ScrollView style={styles.confirmationContent}>
      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Bulk Deletion Warning</Text>
        <Text style={styles.warningText}>
          You are about to permanently delete {selectedCardIds.size} cards. 
          This action cannot be undone.
        </Text>
      </View>

      <View style={styles.confirmationSummary}>
        <Text style={styles.sectionTitle}>Deletion Summary</Text>
        <Text style={styles.summaryText}>Cards to delete: {impactSummary.totalCards}</Text>
        <Text style={styles.summaryText}>Total balance: {formatUSD(impactSummary.totalBalance)}</Text>
        <Text style={styles.summaryText}>Active cards: {impactSummary.activeCards}</Text>
        <Text style={styles.summaryText}>Paused cards: {impactSummary.pausedCards}</Text>
      </View>

      <View style={styles.schedulingOption}>
        <View style={styles.switchRow}>
          <Switch
            value={enableScheduling}
            onValueChange={setEnableScheduling}
            trackColor={{ false: '#ccc', true: '#007AFF' }}
          />
          <Text style={styles.switchLabel}>Schedule deletion</Text>
        </View>
        {enableScheduling && (
          <Text style={styles.schedulingInfo}>
            Deletion will be scheduled for {scheduledDate.toLocaleString()}
          </Text>
        )}
      </View>

      <View style={styles.confirmationInput}>
        <Text style={styles.confirmationLabel}>
          Type "{REQUIRED_CONFIRMATION_PHRASE}" to confirm:
        </Text>
        <TextInput
          style={[
            styles.confirmationTextInput,
            confirmationPhrase === REQUIRED_CONFIRMATION_PHRASE && styles.confirmationTextInputValid
          ]}
          value={confirmationPhrase}
          onChangeText={(text) => setConfirmationPhrase(text.toUpperCase())}
          placeholder="Type confirmation phrase"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>
    </ScrollView>
  );

  const renderProcessingScreen = () => (
    <View style={styles.processingContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.processingTitle}>
        {enableScheduling ? 'Scheduling Bulk Deletion...' : 'Deleting Cards...'}
      </Text>
      <Text style={styles.processingStatus}>
        {progress.completedCards} of {progress.totalCards} completed
      </Text>
      {progress.currentCard && (
        <Text style={styles.processingCurrentCard}>
          Current: •••• {progress.currentCard.slice(-4)}
        </Text>
      )}
    </View>
  );

  const renderResultsScreen = () => (
    <ScrollView style={styles.resultsContainer}>
      <View style={styles.resultsHeader}>
        <Text style={[
          styles.resultsTitle,
          progress.status === 'completed' ? styles.successText : styles.errorText
        ]}>
          {progress.status === 'completed' ? '✅ Bulk Deletion Completed' : '⚠️ Bulk Deletion Partially Failed'}
        </Text>
        
        <View style={styles.resultsStats}>
          <View style={styles.resultsStat}>
            <Text style={styles.resultsStatNumber}>{progress.completedCards}</Text>
            <Text style={styles.resultsStatLabel}>Completed</Text>
          </View>
          <View style={styles.resultsStat}>
            <Text style={[styles.resultsStatNumber, styles.errorText]}>{progress.failedCards}</Text>
            <Text style={styles.resultsStatLabel}>Failed</Text>
          </View>
        </View>
      </View>

      {progress.errors.length > 0 && (
        <View style={styles.errorsSection}>
          <Text style={styles.errorsTitle}>Errors:</Text>
          {progress.errors.map((error, index) => (
            <View key={index} style={styles.errorItem}>
              <Text style={styles.errorCardId}>Card: •••• {error.cardId.slice(-4)}</Text>
              <Text style={styles.errorMessage}>{error.error}</Text>
            </View>
          ))}
        </View>
      )}

      {deletionResults.length > 0 && (
        <View style={styles.detailedResults}>
          <Text style={styles.detailedResultsTitle}>Detailed Results:</Text>
          {deletionResults.map((result, index) => (
            <View key={index} style={styles.resultItem}>
              <Text style={styles.resultCardId}>•••• {result.cardId.slice(-4)}</Text>
              <Text style={[
                styles.resultStatus,
                result.status === 'completed' ? styles.successText : styles.errorText
              ]}>
                {result.status}
              </Text>
              {result.deletionProof && (
                <Text style={styles.resultProof}>Proof: {result.deletionProof.slice(0, 16)}...</Text>
              )}
              {result.error && (
                <Text style={styles.resultError}>{result.error}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderContent = () => {
    switch (progress.status) {
      case 'selecting':
        return renderSelectionScreen();
      case 'confirming':
        return renderConfirmationScreen();
      case 'processing':
        return renderProcessingScreen();
      case 'completed':
      case 'failed':
        return renderResultsScreen();
      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (progress.status === 'processing') {
      return null;
    }

    if (progress.status === 'completed' || progress.status === 'failed') {
      return (
        <View style={styles.footer}>
          {progress.failedCards > 0 && (
            <TouchableOpacity style={styles.secondaryButton} onPress={handleRetry}>
              <Text style={styles.secondaryButtonText}>Retry Failed</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryButton} onPress={onGoBack}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (progress.status === 'confirming') {
      return (
        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.secondaryButton} 
            onPress={() => setProgress({...progress, status: 'selecting'})}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.deleteButton,
              confirmationPhrase !== REQUIRED_CONFIRMATION_PHRASE && styles.buttonDisabled
            ]}
            onPress={handleConfirmDeletion}
            disabled={confirmationPhrase !== REQUIRED_CONFIRMATION_PHRASE}
          >
            <Text style={styles.deleteButtonText}>
              {enableScheduling ? 'Schedule Deletion' : 'Delete Now'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Selection screen
    return (
      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onGoBack}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            selectedCardIds.size === 0 && styles.buttonDisabled
          ]}
          onPress={handleProceedToConfirmation}
          disabled={selectedCardIds.size === 0}
        >
          <Text style={styles.primaryButtonText}>
            Delete {selectedCardIds.size} Card{selectedCardIds.size !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bulk Card Deletion</Text>
        <Text style={styles.subtitle}>
          {progress.status === 'selecting' && 'Select cards to delete'}
          {progress.status === 'confirming' && 'Confirm deletion'}
          {progress.status === 'processing' && 'Processing deletions...'}
          {(progress.status === 'completed' || progress.status === 'failed') && 'Results'}
        </Text>
      </View>

      <View style={styles.content}>
        {renderContent()}
      </View>

      {renderFooter()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  searchSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    marginBottom: 12,
  },
  sortSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  sortLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
    marginBottom: 4,
  },
  sortButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  sortButtonText: {
    fontSize: 12,
    color: '#666',
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  selectAllButtonText: {
    fontSize: 14,
    color: '#007AFF',
  },
  selectionCount: {
    fontSize: 14,
    color: '#666',
  },
  cardsList: {
    flex: 1,
  },
  cardItem: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 6,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  cardItemDisabled: {
    opacity: 0.6,
  },
  cardItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicatorSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  selectionCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardItemDetails: {
    gap: 4,
  },
  cardStatus: {
    fontSize: 12,
    color: '#666',
  },
  cardBalance: {
    fontSize: 12,
    color: '#666',
  },
  cardCreated: {
    fontSize: 12,
    color: '#666',
  },
  impactSummary: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  impactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  impactGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  impactItem: {
    alignItems: 'center',
    flex: 1,
  },
  impactNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  impactLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  confirmationContent: {
    flex: 1,
    padding: 20,
  },
  warningBox: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffeaa7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  confirmationSummary: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  schedulingOption: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  schedulingInfo: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  confirmationInput: {
    marginBottom: 20,
  },
  confirmationLabel: {
    fontSize: 14,
    color: '#333',
    marginBottom: 12,
  },
  confirmationTextInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  confirmationTextInputValid: {
    borderColor: '#28a745',
    backgroundColor: '#f8fff9',
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
  },
  processingStatus: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  processingCurrentCard: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  resultsContainer: {
    flex: 1,
    padding: 20,
  },
  resultsHeader: {
    marginBottom: 24,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  resultsStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  resultsStat: {
    alignItems: 'center',
  },
  resultsStatNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#28a745',
  },
  resultsStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  errorsSection: {
    marginBottom: 24,
  },
  errorsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc3545',
    marginBottom: 12,
  },
  errorItem: {
    backgroundColor: '#f8d7da',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  errorCardId: {
    fontSize: 14,
    fontWeight: '500',
    color: '#721c24',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    color: '#721c24',
  },
  detailedResults: {
    marginBottom: 20,
  },
  detailedResultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  resultCardId: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  resultStatus: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginHorizontal: 12,
  },
  resultProof: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
    flex: 2,
  },
  resultError: {
    fontSize: 10,
    color: '#dc3545',
    flex: 2,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#dc3545',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  successText: {
    color: '#28a745',
  },
  errorText: {
    color: '#dc3545',
  },
});

export default BulkCardDeletionScreen;