import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';
import { useWebSocketConnection } from '../../hooks/useWebSocketConnection';

export interface TransactionStatusMonitorProps {
  transactionId: string;
  cardId: string;
  onStatusChange?: (status: string) => void;
  onTransactionCompleted?: () => void;
}

export const TransactionStatusMonitor: React.FC<TransactionStatusMonitorProps> = ({
  transactionId,
  cardId,
  onStatusChange,
  onTransactionCompleted
}) => {
  const [transaction, setTransaction] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accelerationOptions, setAccelerationOptions] = useState<any[]>([]);
  
  const {
    getTransactionStatus,
    accelerateTransaction,
    isLoading
  } = useCryptoStore();

  // WebSocket connection for real-time updates
  const { isConnected, lastMessage } = useWebSocketConnection(
    `ws://localhost:8081/ws/crypto/transactions?cardId=${cardId}`,
    {
      onMessage: handleWebSocketMessage,
      reconnectInterval: 5000
    }
  );

  const loadTransactionStatus = useCallback(async () => {
    try {
      const status = await getTransactionStatus(transactionId, cardId);
      if (status) {
        setTransaction(status);
        onStatusChange?.(status.status);
        
        if (status.status === 'confirmed') {
          onTransactionCompleted?.();
        }
      }
    } catch (error) {
      console.error('Failed to load transaction status:', error);
    }
  }, [transactionId, cardId, getTransactionStatus, onStatusChange, onTransactionCompleted]);

  useEffect(() => {
    loadTransactionStatus();
  }, [loadTransactionStatus]);

  function handleWebSocketMessage(message: any) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      if (data.type === 'TRANSACTION_STATUS_UPDATE') {
        const { payload } = data;
        if (payload.transactionId === transactionId) {
          setTransaction(payload.processing);
          onStatusChange?.(payload.processing.status);
          
          if (payload.processing.status === 'confirmed') {
            onTransactionCompleted?.();
          }
        }
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTransactionStatus();
    setIsRefreshing(false);
  };

  const handleAccelerate = async () => {
    try {
      const options = await accelerateTransaction(transactionId, cardId);
      setAccelerationOptions(options);
    } catch (error) {
      console.error('Failed to get acceleration options:', error);
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

  const formatTimeRemaining = () => {
    if (!transaction?.estimatedCompletion) return null;
    
    const now = new Date();
    const completion = new Date(transaction.estimatedCompletion);
    const diff = completion.getTime() - now.getTime();
    
    if (diff <= 0) return 'Completing soon...';
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `~${hours}h ${minutes % 60}m remaining`;
    }
    return `~${minutes}m remaining`;
  };

  const getProgressPercentage = () => {
    if (!transaction) return 0;
    
    if (transaction.status === 'confirmed') return 100;
    if (transaction.status === 'failed' || transaction.status === 'refunded') return 100;
    
    return Math.min(
      (transaction.confirmationCount / transaction.requiredConfirmations) * 100,
      95 // Cap at 95% until fully confirmed
    );
  };

  const canAccelerate = () => {
    return transaction && 
           (transaction.status === 'pending' || transaction.status === 'confirming') &&
           accelerationOptions.length === 0;
  };

  if (!transaction) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading transaction status...</Text>
      </View>
    );
  }

  const progressPercentage = getProgressPercentage();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusIcon}>{getStatusIcon(transaction.status)}</Text>
          <Text style={[styles.statusText, { color: getStatusColor(transaction.status) }]}>
            {transaction.status.toUpperCase()}
          </Text>
        </View>
        
        <View style={styles.connectionStatus}>
          <View style={[styles.connectionDot, { backgroundColor: isConnected ? '#32cd32' : '#dc3545' }]} />
          <Text style={styles.connectionText}>
            {isConnected ? 'Live' : 'Offline'}
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${progressPercentage}%`,
                backgroundColor: getStatusColor(transaction.status)
              }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>{Math.round(progressPercentage)}%</Text>
      </View>

      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Network:</Text>
          <Text style={styles.detailValue}>{transaction.networkType}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Confirmations:</Text>
          <Text style={styles.detailValue}>
            {transaction.confirmationCount} / {transaction.requiredConfirmations}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Processing ID:</Text>
          <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
            {transaction.processingId}
          </Text>
        </View>

        {transaction.estimatedCompletion && transaction.status !== 'confirmed' && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time Remaining:</Text>
            <Text style={styles.detailValue}>{formatTimeRemaining()}</Text>
          </View>
        )}

        {transaction.completedAt && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Completed:</Text>
            <Text style={styles.detailValue}>
              {new Date(transaction.completedAt).toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          <Text style={styles.refreshButtonText}>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Text>
        </TouchableOpacity>

        {canAccelerate() && (
          <TouchableOpacity
            style={styles.accelerateButton}
            onPress={handleAccelerate}
            disabled={isLoading}
          >
            <Text style={styles.accelerateButtonText}>⚡ Accelerate</Text>
          </TouchableOpacity>
        )}
      </View>

      {accelerationOptions.length > 0 && (
        <View style={styles.accelerationContainer}>
          <Text style={styles.accelerationTitle}>Acceleration Options:</Text>
          {accelerationOptions.map((option, index) => (
            <View key={option.accelerationId} style={styles.accelerationOption}>
              <View style={styles.accelerationDetails}>
                <Text style={styles.accelerationFee}>
                  +${(option.feeIncrease / 100).toFixed(2)} fee
                </Text>
                <Text style={styles.accelerationSpeedup}>
                  ~{option.estimatedSpeedup}min faster
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.selectAccelerationButton}
                onPress={() => {/* Handle acceleration selection */}}
              >
                <Text style={styles.selectAccelerationText}>Select</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {(transaction.status === 'failed' || transaction.status === 'refunded') && (
        <View style={styles.statusMessage}>
          <Text style={styles.statusMessageText}>
            {transaction.status === 'failed' 
              ? '❌ Transaction failed. A refund will be processed automatically.'
              : '↩️ Transaction has been refunded.'
            }
          </Text>
        </View>
      )}
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
  loadingContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '700',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  connectionText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    minWidth: 35,
    textAlign: 'right',
  },
  detailsContainer: {
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
  actionContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  refreshButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderColor: '#dee2e6',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  refreshButtonText: {
    color: '#495057',
    fontSize: 14,
    fontWeight: '600',
  },
  accelerateButton: {
    flex: 1,
    backgroundColor: '#ffc107',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  accelerateButtonText: {
    color: '#212529',
    fontSize: 14,
    fontWeight: '600',
  },
  accelerationContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  accelerationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 12,
  },
  accelerationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  accelerationDetails: {
    flex: 1,
  },
  accelerationFee: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  accelerationSpeedup: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  selectAccelerationButton: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectAccelerationText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusMessage: {
    backgroundColor: '#f8f9fa',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    borderRadius: 4,
    padding: 12,
  },
  statusMessageText: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
});