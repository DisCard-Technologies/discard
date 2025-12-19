/**
 * WalletConnect Component for React Native
 * Handles WalletConnect v2 integration for multi-wallet connectivity
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  ViewStyle,
  Modal,
  Linking,
} from 'react-native';
import {
  CryptoWallet,
  WalletConnectSessionRequest,
  WalletSessionInfo,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
} from '../../types';

interface WalletConnectComponentProps {
  onWalletConnected?: (wallet: CryptoWallet) => void;
  onWalletDisconnected?: (walletId: string) => void;
  onError?: (error: CryptoWalletError) => void;
  style?: ViewStyle;
}

interface WalletConnectSession {
  topic: string;
  peerMetadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
}

const WalletConnectComponent: React.FC<WalletConnectComponentProps> = ({
  onWalletConnected,
  onWalletDisconnected,
  onError,
  style,
}) => {
  // Connection state
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedWallets, setConnectedWallets] = useState<CryptoWallet[]>([]);
  const [activeSessions, setActiveSessions] = useState<WalletSessionInfo[]>([]);
  
  // Modal state
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  
  // Error state
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConnectedWallets();
  }, []);

  const loadConnectedWallets = async () => {
    try {
      const response = await fetch('/api/v1/crypto/wallets', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const walletConnectWallets = data.data.wallets.filter(
          (wallet: CryptoWallet) => wallet.walletType === 'walletconnect'
        );
        setConnectedWallets(walletConnectWallets);
      }
    } catch (error) {
      console.error('Failed to load connected wallets:', error);
    }
  };

  const loadActiveSessions = async () => {
    try {
      const response = await fetch('/api/v1/crypto/walletconnect/sessions', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setActiveSessions(data.data.sessions);
      }
    } catch (error) {
      console.error('Failed to load active sessions:', error);
    }
  };

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    // For now, returning a placeholder
    return 'mock-token';
  };

  const initiateWalletConnectSession = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const sessionRequest: WalletConnectSessionRequest = {
        sessionDuration: 3600, // 1 hour
        requiredNamespaces: ['eip155'], // Ethereum chains
      };

      const response = await fetch('/api/v1/crypto/walletconnect/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(sessionRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initiate WalletConnect session');
      }

      const data = await response.json();
      const { uri, topic } = data.data;

      setQrUri(uri);
      setShowQRModal(true);

      // Start polling for session approval
      pollForSessionApproval(topic);

    } catch (error) {
      const walletError: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.WALLETCONNECT_SESSION_FAILED,
        message: error instanceof Error ? error.message : 'WalletConnect session failed',
        details: { originalError: error },
      };
      
      setError(walletError.message);
      onError?.(walletError);
    } finally {
      setIsConnecting(false);
    }
  };

  const pollForSessionApproval = async (topic: string) => {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setShowQRModal(false);
        setQrUri(null);
        setError('Session approval timeout');
        return;
      }

      try {
        const response = await fetch(`/api/v1/crypto/walletconnect/sessions/${topic}`, {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.data.session?.approved) {
            // Session approved, close modal and refresh wallets
            setShowQRModal(false);
            setQrUri(null);
            await loadConnectedWallets();
            
            Alert.alert(
              'Wallet Connected',
              'Your wallet has been successfully connected via WalletConnect',
              [{ text: 'OK' }]
            );

            onWalletConnected?.(data.data.wallet);
            return;
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }

      attempts++;
      setTimeout(poll, 5000); // Poll every 5 seconds
    };

    poll();
  };

  const disconnectWallet = async (wallet: CryptoWallet) => {
    Alert.alert(
      'Disconnect Wallet',
      `Are you sure you want to disconnect ${wallet.walletName || wallet.walletAddress}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`/api/v1/crypto/wallets/${wallet.walletId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${await getAuthToken()}`,
                },
              });

              if (response.ok) {
                setConnectedWallets(prev => 
                  prev.filter(w => w.walletId !== wallet.walletId)
                );
                onWalletDisconnected?.(wallet.walletId);
                
                Alert.alert('Success', 'Wallet disconnected successfully');
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to disconnect wallet');
              }
            } catch (error) {
              const walletError: CryptoWalletError = {
                code: CRYPTO_ERROR_CODES.WALLET_DISCONNECTION_FAILED,
                message: error instanceof Error ? error.message : 'Failed to disconnect wallet',
              };
              
              setError(walletError.message);
              onError?.(walletError);
            }
          },
        },
      ]
    );
  };

  const openWalletApp = async () => {
    if (qrUri) {
      try {
        const canOpen = await Linking.canOpenURL(qrUri);
        if (canOpen) {
          await Linking.openURL(qrUri);
        } else {
          Alert.alert(
            'No Compatible Wallet',
            'Please install a WalletConnect compatible wallet app'
          );
        }
      } catch (error) {
        console.error('Failed to open wallet app:', error);
      }
    }
  };

  const renderConnectedWallet = (wallet: CryptoWallet) => (
    <View key={wallet.walletId} style={styles.walletItem}>
      <View style={styles.walletInfo}>
        <Text style={styles.walletName}>
          {wallet.walletName || 'WalletConnect Wallet'}
        </Text>
        <Text style={styles.walletAddress}>
          {`${wallet.walletAddress.slice(0, 6)}...${wallet.walletAddress.slice(-4)}`}
        </Text>
        <View style={[
          styles.statusBadge,
          wallet.connectionStatus === 'connected' ? styles.statusConnected : styles.statusDisconnected
        ]}>
          <Text style={[
            styles.statusText,
            wallet.connectionStatus === 'connected' ? styles.statusConnectedText : styles.statusDisconnectedText
          ]}>
            {wallet.connectionStatus}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.disconnectButton}
        onPress={() => disconnectWallet(wallet)}
      >
        <Text style={styles.disconnectButtonText}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={[styles.container, style]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <Text style={styles.title}>WalletConnect</Text>
        <Text style={styles.subtitle}>
          Connect to 100+ wallets including Trust Wallet, Rainbow, and hardware wallets
        </Text>

        {/* Connect Button */}
        <TouchableOpacity
          style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
          onPress={initiateWalletConnectSession}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.connectButtonText}>Connect New Wallet</Text>
          )}
        </TouchableOpacity>

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.errorDismiss}
              onPress={() => setError(null)}
            >
              <Text style={styles.errorDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Connected Wallets */}
        {connectedWallets.length > 0 && (
          <View style={styles.connectedSection}>
            <Text style={styles.sectionTitle}>Connected Wallets</Text>
            {connectedWallets.map(renderConnectedWallet)}
          </View>
        )}

        {connectedWallets.length === 0 && !isConnecting && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No wallets connected yet. Connect your first wallet to get started.
            </Text>
          </View>
        )}
      </View>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Connect Your Wallet</Text>
            <Text style={styles.modalSubtitle}>
              Scan this QR code with your wallet app or tap "Open Wallet" to connect automatically
            </Text>
            
            {/* QR Code placeholder - in a real implementation, you'd render the actual QR code */}
            <View style={styles.qrCodeContainer}>
              <Text style={styles.qrCodePlaceholder}>QR CODE</Text>
              <Text style={styles.qrCodeSubtext}>
                {qrUri ? `${qrUri.slice(0, 20)}...` : 'Generating...'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.openWalletButton}
              onPress={openWalletApp}
            >
              <Text style={styles.openWalletButtonText}>Open Wallet App</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowQRModal(false);
                setQrUri(null);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  },

  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Connect Button
  connectButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },

  connectButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },

  connectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // Error Styles
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },

  errorText: {
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

  // Connected Wallets
  connectedSection: {
    gap: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },

  walletItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  walletInfo: {
    flex: 1,
    gap: 4,
  },

  walletName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  walletAddress: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },

  statusConnected: {
    backgroundColor: '#DCFCE7',
  },

  statusDisconnected: {
    backgroundColor: '#FEE2E2',
  },

  statusText: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
  },

  statusConnectedText: {
    color: '#166534',
  },

  statusDisconnectedText: {
    color: '#991B1B',
  },

  disconnectButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },

  disconnectButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },

  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },

  qrCodeContainer: {
    backgroundColor: '#F9FAFB',
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
    minHeight: 120,
    justifyContent: 'center',
  },

  qrCodePlaceholder: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },

  qrCodeSubtext: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },

  openWalletButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },

  openWalletButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  cancelButton: {
    paddingVertical: 8,
  },

  cancelButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default WalletConnectComponent;