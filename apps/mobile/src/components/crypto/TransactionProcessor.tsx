import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';
import { NetworkCongestionIndicator } from './NetworkCongestionIndicator';
import { FeeEstimator } from './FeeEstimator';

export interface TransactionProcessorProps {
  cardId: string;
  networkType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  amount: string;
  fromAddress: string;
  toAddress: string;
  onTransactionInitiated?: (processingId: string) => void;
  onError?: (error: string) => void;
}

export const TransactionProcessor: React.FC<TransactionProcessorProps> = ({
  cardId,
  networkType,
  amount,
  fromAddress,
  toAddress,
  onTransactionInitiated,
  onError
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimatedCompletion, setEstimatedCompletion] = useState<Date | null>(null);
  const [networkFee, setNetworkFee] = useState<number>(0);
  const [blockchainTxHash, setBlockchainTxHash] = useState<string>('');
  
  const {
    processTransaction,
    getNetworkCongestion,
    networkCongestion,
    isLoading
  } = useCryptoStore();

  useEffect(() => {
    // Load network congestion data
    loadNetworkData();
  }, [networkType]);

  const loadNetworkData = async () => {
    try {
      await getNetworkCongestion(networkType);
    } catch (error) {
      console.error('Failed to load network data:', error);
    }
  };

  const handleProcessTransaction = async () => {
    if (!blockchainTxHash) {
      Alert.alert('Error', 'Blockchain transaction hash is required');
      return;
    }

    setIsProcessing(true);

    try {
      const result = await processTransaction({
        cardId,
        networkType,
        amount,
        fromAddress,
        toAddress,
        blockchainTxHash
      });

      setEstimatedCompletion(new Date(result.estimatedCompletion));
      setNetworkFee(result.networkFeeEstimate);
      
      onTransactionInitiated?.(result.processingId);

      Alert.alert(
        'Transaction Initiated',
        `Your ${networkType} transaction is now being processed. Estimated completion: ${result.estimatedCompletion}`
      );
    } catch (error) {
      const errorMessage = error.message || 'Failed to process transaction';
      onError?.(errorMessage);
      
      Alert.alert('Transaction Failed', errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const getConfirmationRequirements = () => {
    const requirements = {
      BTC: { confirmations: 3, time: '~30 minutes' },
      ETH: { confirmations: 12, time: '~3 minutes' },
      USDT: { confirmations: 12, time: '~3 minutes' },
      USDC: { confirmations: 12, time: '~3 minutes' },
      XRP: { confirmations: 1, time: '~4 seconds' }
    };
    return requirements[networkType];
  };

  const formatCurrency = (amount: string) => {
    return `${parseFloat(amount).toFixed(8)} ${networkType}`;
  };

  const formatFee = (fee: number) => {
    return `$${(fee / 100).toFixed(2)}`;
  };

  const requirements = getConfirmationRequirements();
  const congestion = networkCongestion[networkType];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Process {networkType} Transaction</Text>
        <NetworkCongestionIndicator networkType={networkType} />
      </View>

      <View style={styles.transactionDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Amount:</Text>
          <Text style={styles.detailValue}>{formatCurrency(amount)}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>From:</Text>
          <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
            {fromAddress}
          </Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>To:</Text>
          <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
            {toAddress}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Required Confirmations:</Text>
          <Text style={styles.detailValue}>
            {requirements.confirmations} ({requirements.time})
          </Text>
        </View>
      </View>

      <FeeEstimator
        networkType={networkType}
        onFeeEstimated={(fee) => setNetworkFee(fee)}
      />

      {networkFee > 0 && (
        <View style={styles.feeContainer}>
          <Text style={styles.feeLabel}>Estimated Network Fee:</Text>
          <Text style={styles.feeValue}>{formatFee(networkFee)}</Text>
        </View>
      )}

      {congestion && (
        <View style={styles.congestionWarning}>
          <Text style={styles.congestionText}>
            Network congestion: {congestion.level.toUpperCase()}
            {congestion.level !== 'low' && (
              <Text style={styles.congestionNote}>
                {'\n'}Transactions may take longer than usual to confirm.
              </Text>
            )}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.processButton, isProcessing && styles.processButtonDisabled]}
        onPress={handleProcessTransaction}
        disabled={isProcessing || isLoading}
      >
        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.processButtonText}>Processing...</Text>
          </View>
        ) : (
          <Text style={styles.processButtonText}>Process Transaction</Text>
        )}
      </TouchableOpacity>

      {estimatedCompletion && (
        <View style={styles.completionContainer}>
          <Text style={styles.completionLabel}>Estimated Completion:</Text>
          <Text style={styles.completionValue}>
            {estimatedCompletion.toLocaleTimeString()}
          </Text>
        </View>
      )}

      <View style={styles.securityNote}>
        <Text style={styles.securityNoteText}>
          🔒 This transaction will be validated using our advanced fraud detection system
          to ensure security while protecting your privacy.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  transactionDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  feeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  feeLabel: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '500',
  },
  feeValue: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '700',
  },
  congestionWarning: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffd60a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  congestionText: {
    fontSize: 14,
    color: '#856404',
    fontWeight: '500',
  },
  congestionNote: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  processButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  processButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  processButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  completionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f5e8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  completionLabel: {
    fontSize: 14,
    color: '#2d5a2d',
    fontWeight: '500',
  },
  completionValue: {
    fontSize: 14,
    color: '#2d5a2d',
    fontWeight: '700',
  },
  securityNote: {
    backgroundColor: '#f8f9fa',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    padding: 12,
    borderRadius: 4,
  },
  securityNoteText: {
    fontSize: 12,
    color: '#666666',
    lineHeight: 16,
  },
});