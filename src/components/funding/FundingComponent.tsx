/**
 * Funding Component for React Native
 * Handles account funding, card allocation, and transfers
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { 
  AccountFundingRequest, 
  CardAllocationRequest, 
  CardTransferRequest,
  validateFundingAmount,
  validateTransferAmount,
  formatCurrency
} from '../../types';
import { useFunding } from '../../stores/funding';

interface FundingComponentProps {
  mode: 'fund' | 'allocate' | 'transfer';
  cardId?: string; // Required for allocate mode
  sourceCardId?: string; // Required for transfer mode
  targetCardId?: string; // Required for transfer mode
  onSuccess?: (transactionId: string) => void;
  onCancel?: () => void;
  style?: ViewStyle;
}

const FundingComponent: React.FC<FundingComponentProps> = ({
  mode,
  cardId,
  sourceCardId,
  targetCardId,
  onSuccess,
  onCancel,
  style,
}) => {
  const { state, actions } = useFunding();
  
  // Form state
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [currency, setCurrency] = useState('USD');
  
  // UI state
  const [amountError, setAmountError] = useState<string | null>(null);
  const [paymentMethodError, setPaymentMethodError] = useState<string | null>(null);

  const isLoading = mode === 'fund' ? state.isFunding : 
                   mode === 'allocate' ? state.isAllocating : 
                   state.isTransferring;

  const error = mode === 'fund' ? state.fundingError : 
               mode === 'allocate' ? state.allocationError : 
               state.transferError;

  const clearError = mode === 'fund' ? actions.clearFundingError : 
                    mode === 'allocate' ? actions.clearAllocationError : 
                    actions.clearTransferError;

  const validateAmount = (amountString: string): boolean => {
    const amountCents = Math.round(parseFloat(amountString) * 100);
    
    if (isNaN(amountCents) || amountCents <= 0) {
      setAmountError('Please enter a valid amount');
      return false;
    }

    if (mode === 'fund') {
      const validation = validateFundingAmount(amountCents);
      if (!validation.isValid) {
        setAmountError(validation.error || 'Invalid funding amount');
        return false;
      }
    } else {
      // For allocate and transfer, check against available balance
      const availableBalance = mode === 'allocate' 
        ? state.accountBalance?.availableBalance || 0
        : state.cardBalances[sourceCardId || '']?.balance || 0;
      
      const validation = validateTransferAmount(amountCents, availableBalance);
      if (!validation.isValid) {
        setAmountError(validation.error || 'Invalid transfer amount');
        return false;
      }
    }

    setAmountError(null);
    return true;
  };

  const validatePaymentMethod = (): boolean => {
    if (mode === 'fund' && !paymentMethodId.trim()) {
      setPaymentMethodError('Please select a payment method');
      return false;
    }
    setPaymentMethodError(null);
    return true;
  };

  const handleSubmit = async () => {
    // Clear previous errors
    clearError();
    
    // Validate inputs
    if (!validateAmount(amount) || !validatePaymentMethod()) {
      return;
    }

    const amountCents = Math.round(parseFloat(amount) * 100);

    try {
      let transaction = null;

      if (mode === 'fund') {
        const request: AccountFundingRequest = {
          amount: amountCents,
          paymentMethodId,
          currency,
        };
        transaction = await actions.fundAccount(request);
      } else if (mode === 'allocate' && cardId) {
        const request: CardAllocationRequest = {
          cardId,
          amount: amountCents,
        };
        transaction = await actions.allocateToCard(request);
      } else if (mode === 'transfer' && sourceCardId && targetCardId) {
        const request: CardTransferRequest = {
          fromCardId: sourceCardId,
          toCardId: targetCardId,
          amount: amountCents,
        };
        transaction = await actions.transferBetweenCards(request);
      }

      if (transaction) {
        const actionText = mode === 'fund' ? 'Account funding' : 
                          mode === 'allocate' ? 'Card allocation' : 
                          'Card transfer';
        
        Alert.alert(
          'Success',
          `${actionText} completed successfully`,
          [{ text: 'OK', onPress: () => onSuccess?.(transaction.id) }]
        );
        
        // Reset form
        setAmount('');
        setPaymentMethodId('');
      }
    } catch (error) {
      console.error('Funding operation error:', error);
    }
  };

  const handleAmountChange = (text: string) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return;
    }
    
    // Limit decimal places to 2
    if (parts[1] && parts[1].length > 2) {
      return;
    }

    setAmount(cleaned);
    
    // Clear error when user starts typing
    if (amountError) {
      setAmountError(null);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'fund':
        return 'Fund Account';
      case 'allocate':
        return 'Allocate to Card';
      case 'transfer':
        return 'Transfer Between Cards';
      default:
        return 'Funding Operation';
    }
  };

  const getSubmitText = () => {
    if (isLoading) {
      return mode === 'fund' ? 'Funding...' : 
             mode === 'allocate' ? 'Allocating...' : 
             'Transferring...';
    }
    
    return mode === 'fund' ? 'Fund Account' : 
           mode === 'allocate' ? 'Allocate Funds' : 
           'Transfer Funds';
  };

  const renderBalanceInfo = () => {
    if (mode === 'fund') {
      return (
        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>Current Account Balance</Text>
          <Text style={styles.balanceValue}>
            {state.accountBalance 
              ? formatCurrency(state.accountBalance.totalBalance)
              : '--'}
          </Text>
          {state.accountBalance && (
            <Text style={styles.balanceSubtext}>
              Available: {formatCurrency(state.accountBalance.availableBalance)}
            </Text>
          )}
        </View>
      );
    } else if (mode === 'allocate') {
      return (
        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>Available for Allocation</Text>
          <Text style={styles.balanceValue}>
            {state.accountBalance 
              ? formatCurrency(state.accountBalance.availableBalance)
              : '--'}
          </Text>
        </View>
      );
    } else if (mode === 'transfer' && sourceCardId) {
      const sourceBalance = state.cardBalances[sourceCardId];
      return (
        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>Source Card Balance</Text>
          <Text style={styles.balanceValue}>
            {sourceBalance ? formatCurrency(sourceBalance.balance) : '--'}
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <ScrollView style={[styles.container, style]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <Text style={styles.title}>{getTitle()}</Text>
        
        {renderBalanceInfo()}

        {/* Amount Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Amount</Text>
          <View style={styles.amountInputContainer}>
            <Text style={styles.currencySymbol}>$</Text>
            <TextInput
              style={[styles.amountInput, amountError && styles.inputError]}
              value={amount}
              onChangeText={handleAmountChange}
              placeholder="0.00"
              keyboardType="decimal-pad"
              editable={!isLoading}
            />
          </View>
          {amountError && (
            <Text style={styles.errorText}>{amountError}</Text>
          )}
        </View>

        {/* Payment Method Input (only for funding) */}
        {mode === 'fund' && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Payment Method</Text>
            <TextInput
              style={[styles.input, paymentMethodError && styles.inputError]}
              value={paymentMethodId}
              onChangeText={(text) => {
                setPaymentMethodId(text);
                if (paymentMethodError) {
                  setPaymentMethodError(null);
                }
              }}
              placeholder="pm_1234567890abcdef"
              editable={!isLoading}
            />
            {paymentMethodError && (
              <Text style={styles.errorText}>{paymentMethodError}</Text>
            )}
            <Text style={styles.helperText}>
              Enter your Stripe payment method ID
            </Text>
          </View>
        )}

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <TouchableOpacity
              style={styles.errorDismiss}
              onPress={clearError}
            >
              <Text style={styles.errorDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={isLoading || !amount.trim()}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.submitButtonText}>{getSubmitText()}</Text>
            )}
          </TouchableOpacity>
          
          {onCancel && (
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  content: {
    padding: 20,
    gap: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },

  // Balance Info
  balanceInfo: {
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

  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },

  balanceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#059669',
  },

  balanceSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },

  // Input Styles
  inputGroup: {
    gap: 8,
  },

  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },

  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 8,
  },

  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    paddingVertical: 12,
  },

  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  inputError: {
    borderColor: '#DC2626',
  },

  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },

  // Error Container
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },

  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 4,
  },

  errorMessage: {
    fontSize: 14,
    color: '#7F1D1D',
    marginBottom: 8,
  },

  errorDismiss: {
    alignSelf: 'flex-start',
  },

  errorDismissText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Action Buttons
  actions: {
    gap: 12,
    marginTop: 12,
  },

  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },

  submitButton: {
    backgroundColor: '#3B82F6',
  },

  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  cancelButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FundingComponent;