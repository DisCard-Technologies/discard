import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useCryptoStore } from '../../stores/crypto';
import { useWebSocketConnection } from '../../hooks/useWebSocketConnection';

export interface TransactionStatusMonitorProps {
  transactionId?: string; // For crypto transactions
  authorizationId?: string; // For payment authorizations
  cardId: string;
  cardContext: string;
  transactionType?: 'crypto' | 'authorization';
  onStatusChange?: (status: string) => void;
  onTransactionCompleted?: () => void;
  onRetryRequested?: () => void;
  showNotifications?: boolean; // New: Show notification alerts for this transaction
  notificationPreferences?: any; // New: User's notification preferences
}

export const TransactionStatusMonitor: React.FC<TransactionStatusMonitorProps> = ({
  transactionId,
  authorizationId,
  cardId,
  cardContext,
  transactionType = 'crypto',
  onStatusChange,
  onTransactionCompleted,
  onRetryRequested,
  showNotifications = true,
  notificationPreferences
}) => {
  const [transaction, setTransaction] = useState<any>(null);
  const [authorization, setAuthorization] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accelerationOptions, setAccelerationOptions] = useState<any[]>([]);
  const [declineReason, setDeclineReason] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  
  // New notification-related state
  const [activeNotification, setActiveNotification] = useState<any>(null);
  const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
  const [showNotificationBadge, setShowNotificationBadge] = useState(false);
  
  const {
    getTransactionStatus,
    accelerateTransaction,
    isLoading
  } = useCryptoStore();

  // WebSocket connection for real-time updates
  const wsUrl = transactionType === 'authorization'
    ? `ws://localhost:8081/ws/payments/authorization?cardContext=${cardContext}&userId=${cardId}`
    : `ws://localhost:8081/ws/crypto/transactions?cardId=${cardId}`;
    
  const { isConnected, lastMessage } = useWebSocketConnection(
    wsUrl,
    {
      onMessage: handleWebSocketMessage,
      reconnectInterval: 5000
    }
  );

  const loadTransactionStatus = useCallback(async () => {
    try {
      if (transactionType === 'authorization' && authorizationId) {
        // Load authorization status from payments API
        const response = await fetch(`/api/v1/payments/authorization/${authorizationId}/status`);
        if (response.ok) {
          const { data } = await response.json();
          setAuthorization(data);
          onStatusChange?.(data.status);
          
          // Check if authorization is complete (approved/declined/expired)
          if (['approved', 'declined', 'expired'].includes(data.status)) {
            onTransactionCompleted?.();
          }
          
          // Set decline information if declined
          if (data.status === 'declined') {
            setDeclineReason(data.declineReason);
            // Check if this decline reason is retryable
            const reasonResponse = await fetch(`/api/v1/payments/decline-reasons?code=${data.declineCode}`);
            if (reasonResponse.ok) {
              const { data: reasons } = await reasonResponse.json();
              const reason = reasons.find(r => r.declineCode === data.declineCode);
              setCanRetry(reason?.isRetryable || false);
            }
          }
        }
      } else if (transactionType === 'crypto' && transactionId) {
        // Original crypto transaction logic
        const status = await getTransactionStatus(transactionId, cardId);
        if (status) {
          setTransaction(status);
          onStatusChange?.(status.status);
          
          if (status.status === 'confirmed') {
            onTransactionCompleted?.();
          }
        }
      }
    } catch (error) {
      console.error('Failed to load transaction status:', error);
    }
  }, [transactionId, authorizationId, cardId, transactionType, getTransactionStatus, onStatusChange, onTransactionCompleted]);

  useEffect(() => {
    loadTransactionStatus();
  }, [loadTransactionStatus]);

  // New notification handling functions
  const showInAppNotification = useCallback((notification: any) => {
    if (!showNotifications) return;
    
    setActiveNotification(notification);
    setShowNotificationBadge(true);
    setNotificationHistory(prev => [notification, ...prev]);
    
    // Auto-dismiss notification after 5 seconds
    setTimeout(() => {
      setActiveNotification(null);
    }, 5000);
  }, [showNotifications]);

  const handleNotificationAction = useCallback((action: string, notification: any) => {
    switch (action) {
      case 'View Details':
        // Handle view details action
        console.log('View transaction details');
        break;
      case 'Dispute':
        Alert.alert(
          'Dispute Transaction',
          'Are you sure you want to dispute this transaction?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Dispute', style: 'destructive', onPress: () => console.log('Dispute initiated') }
          ]
        );
        break;
      case 'Add Funds':
        // Handle add funds action
        console.log('Add funds to card');
        break;
      case 'Contact Support':
        // Handle contact support action
        console.log('Contact support');
        break;
    }
    setActiveNotification(null);
  }, []);

  const dismissNotification = useCallback(() => {
    setActiveNotification(null);
    setShowNotificationBadge(false);
  }, []);

  function handleWebSocketMessage(message: any) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      // Handle notification updates first
      if (data.type === 'notification_status') {
        const notificationUpdate = {
          id: data.notificationId,
          status: data.status,
          timestamp: data.timestamp
        };
        
        setNotificationHistory(prev => 
          prev.map(notif => 
            notif.id === data.notificationId 
              ? { ...notif, status: data.status, timestamp: data.timestamp }
              : notif
          )
        );
      }
      
      if (transactionType === 'authorization') {
        // Handle authorization WebSocket messages
        if (data.type === 'authorization_status' && data.authorizationId === authorizationId) {
          setAuthorization(prev => ({ ...prev, status: data.status }));
          onStatusChange?.(data.status);
          
          // Show notification for status changes
          if (showNotifications) {
            let notificationContent;
            switch (data.status) {
              case 'approved':
                notificationContent = {
                  id: `auth-${authorizationId}-approved`,
                  title: 'Transaction Approved',
                  message: `Your transaction has been approved`,
                  type: 'success',
                  actionButtons: ['View Details']
                };
                break;
              case 'declined':
                notificationContent = {
                  id: `auth-${authorizationId}-declined`,
                  title: 'Transaction Declined',
                  message: `Transaction was declined`,
                  type: 'error',
                  actionButtons: ['View Details', 'Contact Support']
                };
                break;
            }
            
            if (notificationContent) {
              showInAppNotification(notificationContent);
            }
          }
          
          if (['approved', 'declined', 'expired'].includes(data.status)) {
            onTransactionCompleted?.();
          }
        } else if (data.type === 'hold_status') {
          // Update hold information if relevant
          setAuthorization(prev => prev ? {
            ...prev,
            holdStatus: data.status,
            holdAmount: data.amount,
            remainingAmount: data.remainingAmount
          } : null);
        } else if (data.type === 'retry_attempt' && data.authorizationId === authorizationId) {
          setAuthorization(prev => prev ? {
            ...prev,
            retryAttempt: data.attempt,
            maxRetryAttempts: data.maxAttempts,
            nextRetryAt: data.nextRetryAt
          } : null);
        }
      } else if (transactionType === 'crypto') {
        // Original crypto transaction WebSocket handling
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
    if (transactionType === 'crypto' && transactionId) {
      try {
        const options = await accelerateTransaction(transactionId, cardId);
        setAccelerationOptions(options);
      } catch (error) {
        console.error('Failed to get acceleration options:', error);
      }
    }
  };

  const handleRetryAuthorization = async () => {
    if (transactionType === 'authorization' && authorizationId && canRetry) {
      onRetryRequested?.();
    }
  };

  const getStatusColor = (status: string) => {
    if (transactionType === 'authorization') {
      const authColors = {
        'pending': '#ffa500',
        'approved': '#008000',
        'declined': '#dc3545',
        'expired': '#6c757d',
        'reversed': '#6c757d'
      };
      return authColors[status] || '#6c757d';
    } else {
      const cryptoColors = {
        'initiated': '#ffa500',
        'pending': '#ff8c00',
        'confirming': '#32cd32',
        'confirmed': '#008000',
        'failed': '#dc3545',
        'refunded': '#6c757d'
      };
      return cryptoColors[status] || '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    if (transactionType === 'authorization') {
      const authIcons = {
        'pending': '⏳',
        'approved': '✅',
        'declined': '❌',
        'expired': '⏰',
        'reversed': '↩️'
      };
      return authIcons[status] || '📊';
    } else {
      const cryptoIcons = {
        'initiated': '🚀',
        'pending': '⏳',
        'confirming': '⚡',
        'confirmed': '✅',
        'failed': '❌',
        'refunded': '↩️'
      };
      return cryptoIcons[status] || '📊';
    }
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
    if (transactionType === 'authorization') {
      if (!authorization) return 0;
      
      if (authorization.status === 'approved') return 100;
      if (authorization.status === 'declined' || authorization.status === 'expired') return 100;
      if (authorization.status === 'pending') return 50;
      
      return 0;
    } else {
      if (!transaction) return 0;
      
      if (transaction.status === 'confirmed') return 100;
      if (transaction.status === 'failed' || transaction.status === 'refunded') return 100;
      
      return Math.min(
        (transaction.confirmationCount / transaction.requiredConfirmations) * 100,
        95 // Cap at 95% until fully confirmed
      );
    }
  };

  const canAccelerate = () => {
    return transactionType === 'crypto' &&
           transaction && 
           (transaction.status === 'pending' || transaction.status === 'confirming') &&
           accelerationOptions.length === 0;
  };

  if (transactionType === 'authorization' && !authorization) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading authorization status...</Text>
      </View>
    );
  }
  
  if (transactionType === 'crypto' && !transaction) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading transaction status...</Text>
      </View>
    );
  }

  const currentData = transactionType === 'authorization' ? authorization : transaction;
  const progressPercentage = getProgressPercentage();

  return (
    <View style={styles.container}>
      {/* Active Notification Banner */}
      {activeNotification && (
        <View style={[
          styles.notificationBanner,
          activeNotification.type === 'success' ? styles.successBanner :
          activeNotification.type === 'error' ? styles.errorBanner :
          styles.infoBanner
        ]}>
          <View style={styles.notificationContent}>
            <Text style={styles.notificationTitle}>{activeNotification.title}</Text>
            <Text style={styles.notificationMessage}>{activeNotification.message}</Text>
            
            {activeNotification.actionButtons && (
              <View style={styles.notificationActions}>
                {activeNotification.actionButtons.map((action: string, index: number) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.notificationActionButton}
                    onPress={() => handleNotificationAction(action, activeNotification)}
                  >
                    <Text style={styles.notificationActionText}>{action}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={dismissNotification}
          >
            <Text style={styles.dismissButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Notification Badge */}
      {showNotificationBadge && !activeNotification && (
        <TouchableOpacity
          style={styles.notificationBadge}
          onPress={() => {
            if (notificationHistory.length > 0) {
              setActiveNotification(notificationHistory[0]);
            }
          }}
        >
          <Text style={styles.notificationBadgeText}>
            {notificationHistory.length} notification{notificationHistory.length !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}
      <View style={styles.header}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusIcon}>{getStatusIcon(currentData.status)}</Text>
          <Text style={[styles.statusText, { color: getStatusColor(currentData.status) }]}>
            {currentData.status.toUpperCase()}
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
                backgroundColor: getStatusColor(currentData.status)
              }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>{Math.round(progressPercentage)}%</Text>
      </View>

      <View style={styles.detailsContainer}>
        {transactionType === 'authorization' ? (
          // Authorization-specific details
          <>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Merchant:</Text>
              <Text style={styles.detailValue}>{authorization.merchantName}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount:</Text>
              <Text style={styles.detailValue}>
                ${(authorization.authorizationAmount / 100).toFixed(2)} {authorization.currencyCode}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Risk Score:</Text>
              <Text style={styles.detailValue}>
                {authorization.riskScore}/100 ({authorization.riskScore <= 30 ? 'Low' : authorization.riskScore <= 70 ? 'Medium' : 'High'})
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Response Time:</Text>
              <Text style={styles.detailValue}>{authorization.responseTimeMs}ms</Text>
            </View>

            {authorization.authorizationCode && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Auth Code:</Text>
                <Text style={styles.detailValue}>{authorization.authorizationCode}</Text>
              </View>
            )}

            {authorization.processedAt && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Processed:</Text>
                <Text style={styles.detailValue}>
                  {new Date(authorization.processedAt).toLocaleString()}
                </Text>
              </View>
            )}

            {authorization.currencyConversion && (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Exchange Rate:</Text>
                  <Text style={styles.detailValue}>
                    {authorization.currencyConversion.exchangeRate.toFixed(4)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Conversion Fee:</Text>
                  <Text style={styles.detailValue}>
                    ${(authorization.currencyConversion.conversionFee / 100).toFixed(2)}
                  </Text>
                </View>
              </>
            )}
          </>
        ) : (
          // Crypto transaction details
          <>
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
          </>
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

        {transactionType === 'crypto' && canAccelerate() && (
          <TouchableOpacity
            style={styles.accelerateButton}
            onPress={handleAccelerate}
            disabled={isLoading}
          >
            <Text style={styles.accelerateButtonText}>⚡ Accelerate</Text>
          </TouchableOpacity>
        )}
        
        {transactionType === 'authorization' && canRetry && authorization?.status === 'declined' && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetryAuthorization}
            disabled={isLoading}
          >
            <Text style={styles.retryButtonText}>🔄 Retry</Text>
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

      {transactionType === 'authorization' && authorization?.status === 'declined' && (
        <View style={styles.statusMessage}>
          <Text style={styles.statusMessageText}>
            ❌ Authorization declined: {declineReason || authorization.declineReason}
          </Text>
          {canRetry && (
            <Text style={styles.statusMessageSubtext}>
              This transaction can be retried. Tap the Retry button above to try again.
            </Text>
          )}
        </View>
      )}
      
      {transactionType === 'authorization' && authorization?.status === 'expired' && (
        <View style={styles.statusMessage}>
          <Text style={styles.statusMessageText}>
            ⏰ Authorization expired. Please initiate a new transaction.
          </Text>
        </View>
      )}
      
      {transactionType === 'crypto' && (transaction?.status === 'failed' || transaction?.status === 'refunded') && (
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
  retryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#ffffff',
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
  statusMessageSubtext: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 8,
    lineHeight: 16,
  },
  // New notification-related styles
  notificationBanner: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  successBanner: {
    backgroundColor: '#d1f2eb',
    borderColor: '#27ae60',
    borderWidth: 1,
  },
  errorBanner: {
    backgroundColor: '#fadbd8',
    borderColor: '#e74c3c',
    borderWidth: 1,
  },
  infoBanner: {
    backgroundColor: '#d6eaf8',
    borderColor: '#3498db',
    borderWidth: 1,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
    marginBottom: 8,
  },
  notificationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  notificationActionButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 4,
  },
  notificationActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  dismissButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  dismissButtonText: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '600',
  },
  notificationBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});