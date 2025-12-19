/**
 * Balance Indicator Component for React Native
 * Displays account and card balance information with visual indicators
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { formatCurrency } from '@discard/shared/src/utils/funding';
import { AccountBalance, CardBalance } from '../../types';

interface BalanceIndicatorProps {
  accountBalance?: AccountBalance | null;
  cardBalance?: CardBalance | null;
  showDetails?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  variant?: 'account' | 'card' | 'compact';
}

const BalanceIndicator: React.FC<BalanceIndicatorProps> = ({
  accountBalance,
  cardBalance,
  showDetails = true,
  onPress,
  style,
  variant = 'account',
}) => {
  const renderAccountBalance = () => {
    if (!accountBalance) {
      return (
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Account Balance</Text>
          <Text style={styles.balanceValue}>--</Text>
        </View>
      );
    }

    return (
      <View style={styles.accountBalanceContainer}>
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={[styles.balanceValue, styles.totalBalance]}>
            {formatCurrency(accountBalance.totalBalance)}
          </Text>
        </View>
        
        {showDetails && (
          <View style={styles.balanceDetails}>
            <View style={styles.balanceDetailItem}>
              <Text style={styles.detailLabel}>Available</Text>
              <Text style={[styles.detailValue, styles.availableBalance]}>
                {formatCurrency(accountBalance.availableBalance)}
              </Text>
            </View>
            <View style={styles.balanceDetailItem}>
              <Text style={styles.detailLabel}>Allocated</Text>
              <Text style={styles.detailValue}>
                {formatCurrency(accountBalance.allocatedBalance)}
              </Text>
            </View>
          </View>
        )}
        
        {accountBalance.lastUpdated && (
          <Text style={styles.lastUpdated}>
            Updated {new Date(accountBalance.lastUpdated).toLocaleTimeString()}
          </Text>
        )}
      </View>
    );
  };

  const renderCardBalance = () => {
    if (!cardBalance) {
      return (
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Card Balance</Text>
          <Text style={styles.balanceValue}>--</Text>
        </View>
      );
    }

    const isLowBalance = cardBalance.balance < 500; // $5.00 threshold

    return (
      <View style={styles.cardBalanceContainer}>
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={[
            styles.balanceValue,
            isLowBalance && styles.lowBalance
          ]}>
            {formatCurrency(cardBalance.balance)}
          </Text>
        </View>
        
        {isLowBalance && (
          <View style={styles.lowBalanceWarning}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>Low balance - consider adding funds</Text>
          </View>
        )}
        
        {cardBalance.lastUpdated && (
          <Text style={styles.lastUpdated}>
            Updated {new Date(cardBalance.lastUpdated).toLocaleTimeString()}
          </Text>
        )}
      </View>
    );
  };

  const renderCompactView = () => {
    const balance = accountBalance || cardBalance;
    if (!balance) {
      return (
        <View style={styles.compactContainer}>
          <Text style={styles.compactValue}>--</Text>
        </View>
      );
    }

    const amount = accountBalance 
      ? accountBalance.availableBalance 
      : cardBalance?.balance || 0;

    const isLow = amount < 1000; // $10.00 threshold

    return (
      <View style={styles.compactContainer}>
        <Text style={[
          styles.compactValue,
          isLow && styles.lowBalance
        ]}>
          {formatCurrency(amount)}
        </Text>
        {isLow && <Text style={styles.compactWarning}>!</Text>}
      </View>
    );
  };

  const content = () => {
    if (variant === 'compact') {
      return renderCompactView();
    } else if (variant === 'card') {
      return renderCardBalance();
    } else {
      return renderAccountBalance();
    }
  };

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.container, styles.touchable, style]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {content()}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {content()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  touchable: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  // Account Balance Styles
  accountBalanceContainer: {
    gap: 12,
  },

  balanceItem: {
    alignItems: 'center',
  },

  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },

  balanceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },

  totalBalance: {
    color: '#059669',
  },

  balanceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },

  balanceDetailItem: {
    alignItems: 'center',
    flex: 1,
  },

  detailLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
    fontWeight: '500',
  },

  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },

  availableBalance: {
    color: '#059669',
  },

  // Card Balance Styles
  cardBalanceContainer: {
    gap: 8,
  },

  lowBalance: {
    color: '#DC2626',
  },

  lowBalanceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
    gap: 6,
  },

  warningIcon: {
    fontSize: 14,
  },

  warningText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
    flex: 1,
  },

  // Compact View Styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  compactValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
  },

  compactWarning: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: 'bold',
  },

  // Common Styles
  lastUpdated: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
});

export default BalanceIndicator;