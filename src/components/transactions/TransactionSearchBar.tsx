import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView
} from 'react-native';

export interface TransactionSearchQuery {
  merchant?: string;
  minAmount?: number;
  maxAmount?: number;
  category?: string;
  status?: 'authorized' | 'settled' | 'declined' | 'refunded';
}

export interface TransactionFilters {
  merchant: string;
  minAmount: string;
  maxAmount: string;
  category: string;
  status: string;
}

interface TransactionSearchBarProps {
  onSearch: (query: TransactionSearchQuery) => void;
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
}

const MERCHANT_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'gas', label: 'Gas Station' },
  { value: 'retail', label: 'Retail' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'other', label: 'Other' },
];

const TRANSACTION_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'settled', label: 'Completed' },
  { value: 'authorized', label: 'Pending' },
  { value: 'declined', label: 'Declined' },
  { value: 'refunded', label: 'Refunded' },
];

export const TransactionSearchBar: React.FC<TransactionSearchBarProps> = ({
  onSearch,
  filters,
  onFiltersChange
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

  const handleSearch = () => {
    const query: TransactionSearchQuery = {};
    
    if (localFilters.merchant.trim()) {
      query.merchant = localFilters.merchant.trim();
    }
    
    if (localFilters.minAmount && !isNaN(parseFloat(localFilters.minAmount))) {
      query.minAmount = Math.round(parseFloat(localFilters.minAmount) * 100); // Convert to cents
    }
    
    if (localFilters.maxAmount && !isNaN(parseFloat(localFilters.maxAmount))) {
      query.maxAmount = Math.round(parseFloat(localFilters.maxAmount) * 100); // Convert to cents
    }
    
    if (localFilters.category) {
      query.category = localFilters.category;
    }
    
    if (localFilters.status) {
      query.status = localFilters.status as TransactionSearchQuery['status'];
    }

    onFiltersChange(localFilters);
    onSearch(query);
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      merchant: '',
      minAmount: '',
      maxAmount: '',
      category: '',
      status: ''
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    onSearch({});
    setShowFilters(false);
  };

  const hasActiveFilters = () => {
    return Object.values(localFilters).some(value => value.trim() !== '');
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by merchant name..."
            value={localFilters.merchant}
            onChangeText={(text) => setLocalFilters(prev => ({ ...prev, merchant: text }))}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            accessibilityLabel="Search by merchant name"
          />
        </View>
        
        <TouchableOpacity
          style={[styles.filterButton, hasActiveFilters() && styles.filterButtonActive]}
          onPress={() => setShowFilters(true)}
          accessibilityLabel="Open advanced filters"
        >
          <Text style={[styles.filterButtonText, hasActiveFilters() && styles.filterButtonTextActive]}>
            Filters {hasActiveFilters() ? '●' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Search Filters</Text>
            <TouchableOpacity onPress={handleSearch}>
              <Text style={styles.modalApply}>Apply</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Merchant Name</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="Enter merchant name..."
                value={localFilters.merchant}
                onChangeText={(text) => setLocalFilters(prev => ({ ...prev, merchant: text }))}
                accessibilityLabel="Filter by merchant name"
              />
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Amount Range</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.filterInput, styles.amountInput]}
                  placeholder="Min $"
                  value={localFilters.minAmount}
                  onChangeText={(text) => setLocalFilters(prev => ({ ...prev, minAmount: text }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Minimum amount filter"
                />
                <Text style={styles.amountSeparator}>to</Text>
                <TextInput
                  style={[styles.filterInput, styles.amountInput]}
                  placeholder="Max $"
                  value={localFilters.maxAmount}
                  onChangeText={(text) => setLocalFilters(prev => ({ ...prev, maxAmount: text }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Maximum amount filter"
                />
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Category</Text>
              <View style={styles.optionGrid}>
                {MERCHANT_CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category.value}
                    style={[
                      styles.optionButton,
                      localFilters.category === category.value && styles.optionButtonActive
                    ]}
                    onPress={() => setLocalFilters(prev => ({ ...prev, category: category.value }))}
                    accessibilityLabel={`Filter by ${category.label} category`}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      localFilters.category === category.value && styles.optionButtonTextActive
                    ]}>
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Transaction Status</Text>
              <View style={styles.optionGrid}>
                {TRANSACTION_STATUSES.map((status) => (
                  <TouchableOpacity
                    key={status.value}
                    style={[
                      styles.optionButton,
                      localFilters.status === status.value && styles.optionButtonActive
                    ]}
                    onPress={() => setLocalFilters(prev => ({ ...prev, status: status.value }))}
                    accessibilityLabel={`Filter by ${status.label} status`}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      localFilters.status === status.value && styles.optionButtonTextActive
                    ]}>
                      {status.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClearFilters}
              accessibilityLabel="Clear all filters"
            >
              <Text style={styles.clearButtonText}>Clear All Filters</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInputContainer: {
    flex: 1,
    marginRight: 12,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalCancel: {
    fontSize: 16,
    color: '#6B7280',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalApply: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  filterSection: {
    marginTop: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterInput: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
  },
  amountSeparator: {
    marginHorizontal: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    margin: 4,
  },
  optionButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionButtonText: {
    fontSize: 14,
    color: '#374151',
  },
  optionButtonTextActive: {
    color: '#FFFFFF',
  },
  clearButton: {
    marginTop: 32,
    marginBottom: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});