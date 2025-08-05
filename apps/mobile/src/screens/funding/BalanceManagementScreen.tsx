/**
 * Balance Management Screen for React Native
 * Detailed view of account balance, allocations, and notifications
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Switch,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { formatCurrency } from '@discard/shared/src/utils/funding';
import { useFunding } from '../../stores/funding';
import BalanceIndicator from '../../components/funding/BalanceIndicator';

interface BalanceManagementScreenProps {
  navigation?: any;
}

const BalanceManagementScreen: React.FC<BalanceManagementScreenProps> = ({
  navigation,
}) => {
  const { state, actions } = useFunding();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditingThresholds, setIsEditingThresholds] = useState(false);
  
  // Threshold editing state
  const [accountThreshold, setAccountThreshold] = useState('');
  const [cardThreshold, setCardThreshold] = useState('');
  const [enableNotifications, setEnableNotifications] = useState(true);

  useEffect(() => {
    loadData();
    initializeThresholds();
  }, []);

  useEffect(() => {
    initializeThresholds();
  }, [state.notificationThresholds]);

  const loadData = async () => {
    try {
      await actions.loadBalance();
    } catch (error) {
      console.error('Failed to load balance data:', error);
    }
  };

  const initializeThresholds = () => {
    if (state.notificationThresholds) {
      setAccountThreshold((state.notificationThresholds.accountThreshold / 100).toString());
      setCardThreshold((state.notificationThresholds.cardThreshold / 100).toString());
      setEnableNotifications(state.notificationThresholds.enableNotifications);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleSaveThresholds = async () => {
    try {
      const accountThresholdCents = Math.round(parseFloat(accountThreshold) * 100);
      const cardThresholdCents = Math.round(parseFloat(cardThreshold) * 100);

      if (isNaN(accountThresholdCents) || isNaN(cardThresholdCents)) {
        Alert.alert('Error', 'Please enter valid threshold amounts');
        return;
      }

      await actions.updateNotificationThresholds({
        accountThreshold: accountThresholdCents,
        cardThreshold: cardThresholdCents,
        enableNotifications,
      });

      setIsEditingThresholds(false);
      Alert.alert('Success', 'Notification thresholds updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update notification thresholds');
    }
  };

  const handleCancelEdit = () => {
    setIsEditingThresholds(false);
    initializeThresholds();
  };

  const renderBalanceBreakdown = () => {
    if (!state.accountBalance) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Balance Breakdown</Text>
          <View style={styles.card}>
            <Text style={styles.noDataText}>No balance data available</Text>
          </View>
        </View>
      );
    }

    const { totalBalance, allocatedBalance, availableBalance } = state.accountBalance;
    const allocationPercentage = totalBalance > 0 ? (allocatedBalance / totalBalance) * 100 : 0;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Balance Breakdown</Text>
        
        <View style={styles.card}>
          {/* Total Balance */}
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Total Balance</Text>
            <Text style={[styles.balanceValue, styles.totalBalance]}>
              {formatCurrency(totalBalance)}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* Available Balance */}
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Available for Allocation</Text>
            <Text style={[styles.balanceValue, styles.availableBalance]}>
              {formatCurrency(availableBalance)}
            </Text>
          </View>

          {/* Allocated Balance */}
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>
              Allocated to Cards ({allocationPercentage.toFixed(1)}%)
            </Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(allocatedBalance)}
            </Text>
          </View>

          {/* Allocation Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill,
                  { width: `${Math.min(allocationPercentage, 100)}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {allocationPercentage.toFixed(1)}% allocated
            </Text>
          </View>

          {/* Last Updated */}
          <Text style={styles.lastUpdated}>
            Last updated: {new Date(state.accountBalance.lastUpdated).toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  const renderNotificationSettings = () => {
    if (!state.notificationThresholds) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Settings</Text>
          <View style={styles.card}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading notification settings...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notification Settings</Text>
          <TouchableOpacity
            onPress={() => {
              if (isEditingThresholds) {
                handleSaveThresholds();
              } else {
                setIsEditingThresholds(true);
              }
            }}
            style={styles.editButton}
          >
            <Text style={styles.editButtonText}>
              {isEditingThresholds ? 'Save' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {/* Enable Notifications */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={styles.settingLabel}>Low Balance Notifications</Text>
              <Text style={styles.settingDescription}>
                Get notified when balances fall below thresholds
              </Text>
            </View>
            <Switch
              value={enableNotifications}
              onValueChange={setEnableNotifications}
              disabled={!isEditingThresholds}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={enableNotifications ? '#3B82F6' : '#9CA3AF'}
            />
          </View>

          <View style={styles.divider} />

          {/* Account Threshold */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={styles.settingLabel}>Account Threshold</Text>
              <Text style={styles.settingDescription}>
                Notify when available balance is below this amount
              </Text>
            </View>
            <View style={styles.thresholdInput}>
              <Text style={styles.currencySymbol}>$</Text>
              {isEditingThresholds ? (
                <TextInput
                  style={styles.thresholdTextInput}
                  value={accountThreshold}
                  onChangeText={setAccountThreshold}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              ) : (
                <Text style={styles.thresholdValue}>
                  {(state.notificationThresholds.accountThreshold / 100).toFixed(2)}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Card Threshold */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={styles.settingLabel}>Card Threshold</Text>
              <Text style={styles.settingDescription}>
                Notify when individual card balance is below this amount
              </Text>
            </View>
            <View style={styles.thresholdInput}>
              <Text style={styles.currencySymbol}>$</Text>
              {isEditingThresholds ? (
                <TextInput
                  style={styles.thresholdTextInput}
                  value={cardThreshold}
                  onChangeText={setCardThreshold}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              ) : (
                <Text style={styles.thresholdValue}>
                  {(state.notificationThresholds.cardThreshold / 100).toFixed(2)}
                </Text>
              )}
            </View>
          </View>

          {/* Notification Methods */}
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={styles.settingLabel}>Notification Methods</Text>
              <Text style={styles.settingDescription}>
                {state.notificationThresholds.notificationMethods.join(', ')}
              </Text>
            </View>
          </View>

          {/* Cancel button when editing */}
          {isEditingThresholds && (
            <View style={styles.editActions}>
              <TouchableOpacity
                onPress={handleCancelEdit}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Balance Management</Text>
        <Text style={styles.subtitle}>Monitor and configure your account balance</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Balance Overview */}
        <View style={styles.section}>
          <BalanceIndicator
            accountBalance={state.accountBalance}
            showDetails={false}
          />
        </View>

        {/* Balance Breakdown */}
        {renderBalanceBreakdown()}

        {/* Notification Settings */}
        {renderNotificationSettings()}

        {/* Error Display */}
        {state.error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{state.error}</Text>
            <TouchableOpacity
              style={styles.errorDismiss}
              onPress={actions.clearError}
            >
              <Text style={styles.errorDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  header: {
    padding: 20,
    paddingBottom: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },

  content: {
    flex: 1,
  },

  section: {
    margin: 16,
    marginTop: 0,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },

  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // Balance Breakdown
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },

  balanceLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },

  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  totalBalance: {
    color: '#059669',
    fontSize: 18,
    fontWeight: '700',
  },

  availableBalance: {
    color: '#059669',
  },

  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 8,
  },

  progressContainer: {
    marginTop: 12,
  },

  progressBar: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },

  progressText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },

  lastUpdated: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
  },

  // Notification Settings
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
  },

  editButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },

  settingLeft: {
    flex: 1,
    marginRight: 16,
  },

  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
  },

  thresholdInput: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },

  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 4,
  },

  thresholdTextInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    minWidth: 60,
    textAlign: 'right',
    paddingVertical: 4,
  },

  thresholdValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  editActions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },

  cancelButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },

  cancelButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },

  // Common
  noDataText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 16,
    padding: 20,
  },

  loadingText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
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
});

export default BalanceManagementScreen;