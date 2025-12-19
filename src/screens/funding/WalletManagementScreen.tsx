/**
 * Wallet Management Screen for React Native
 * Centralized interface for managing all connected cryptocurrency wallets
 * Now using Convex-based real-time subscriptions
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
// Use Convex-based wallets store
import { useWallets, CryptoWallet, WalletType, NetworkType } from '../../stores/walletsConvex';
import WalletConnectComponent from '../../components/crypto/WalletConnectComponent';

interface WalletManagementScreenProps {
  onNavigateToBalance?: (walletId: string) => void;
  onNavigateToFunding?: () => void;
}

const WalletManagementScreen: React.FC<WalletManagementScreenProps> = ({
  onNavigateToBalance,
  onNavigateToFunding,
}) => {
  // Use Convex-based wallet state
  const { state, actions } = useWallets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'connect'>('overview');

  // Map Convex state to local variables for compatibility
  const connectedWallets = state.wallets;
  const isLoading = state.isLoading;
  const error = state.error;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await actions.refreshAllBalances();
    setIsRefreshing(false);
  }, [actions]);

  const disconnectWallet = async (wallet: CryptoWallet) => {
    Alert.alert(
      'Disconnect Wallet',
      `Are you sure you want to disconnect ${getWalletDisplayName(wallet)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await actions.disconnectWallet(wallet.walletId);
              if (success) {
                Alert.alert('Success', 'Wallet disconnected successfully');
              }
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect wallet';
              actions.setError(errorMessage);
            }
          },
        },
      ]
    );
  };

  const getWalletDisplayName = (wallet: CryptoWallet): string => {
    if (wallet.nickname) return wallet.nickname;

    const typeNames: Record<WalletType, string> = {
      metamask: 'MetaMask',
      walletconnect: 'WalletConnect',
      phantom: 'Phantom',
      solflare: 'Solflare',
      coinbase: 'Coinbase Wallet',
    };

    return typeNames[wallet.walletType] || 'Unknown Wallet';
  };

  const getWalletTypeIcon = (walletType: WalletType): string => {
    const icons: Record<WalletType, string> = {
      metamask: '🦊',
      walletconnect: '🔗',
      phantom: '👻',
      solflare: '☀️',
      coinbase: '🔵',
    };

    return icons[walletType] || '💳';
  };

  const getNetworkIcon = (networkType: NetworkType): string => {
    const icons: Record<NetworkType, string> = {
      ethereum: 'Ξ',
      solana: '◎',
      polygon: '⬡',
      arbitrum: '🔷',
      base: '🔵',
    };

    return icons[networkType] || '🔗';
  };

  const formatCurrency = (amountCents: number): string => {
    return (amountCents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const handleWalletConnected = async (
    walletType: WalletType,
    networkType: NetworkType,
    publicAddress: string,
    nickname?: string
  ) => {
    const wallet = await actions.connectWallet(walletType, networkType, publicAddress, nickname);
    if (wallet) {
      setActiveTab('overview');
      Alert.alert('Success', 'Wallet connected successfully');
    }
  };

  const handleWalletDisconnected = async (walletId: string) => {
    await actions.disconnectWallet(walletId);
  };

  const renderWalletCard = (wallet: CryptoWallet) => {
    const displayName = getWalletDisplayName(wallet);
    const typeIcon = getWalletTypeIcon(wallet.walletType);
    const networkIcon = getNetworkIcon(wallet.networkType);

    return (
      <View key={wallet.walletId} style={styles.walletCard}>
        <View style={styles.walletHeader}>
          <View style={styles.walletInfo}>
            <Text style={styles.walletIcon}>{typeIcon}</Text>
            <View style={styles.walletDetails}>
              <Text style={styles.walletName}>{displayName}</Text>
              <Text style={styles.walletAddress}>
                {networkIcon} {wallet.networkType} • {`${wallet.publicAddress.slice(0, 6)}...${wallet.publicAddress.slice(-4)}`}
              </Text>
            </View>
          </View>
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

        {wallet.cachedBalanceUsd !== undefined && (
          <View style={styles.balanceSection}>
            <Text style={styles.balanceLabel}>Estimated Value</Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(wallet.cachedBalanceUsd * 100)}
            </Text>
            {wallet.lastUsedAt && (
              <Text style={styles.balanceSubtext}>
                Last used {new Date(wallet.lastUsedAt).toLocaleDateString()}
              </Text>
            )}
          </View>
        )}

        <View style={styles.walletActions}>
          <TouchableOpacity
            style={styles.viewBalanceButton}
            onPress={() => onNavigateToBalance?.(wallet.walletId)}
          >
            <Text style={styles.viewBalanceButtonText}>View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => actions.refreshWalletBalance(wallet.walletId)}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={() => disconnectWallet(wallet)}
          >
            <Text style={styles.disconnectButtonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderOverviewTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Portfolio Summary */}
      <View style={styles.portfolioSummary}>
        <Text style={styles.portfolioLabel}>Total Portfolio Value</Text>
        <Text style={styles.portfolioValue}>
          {formatCurrency(state.totalPortfolioValue * 100)}
        </Text>
        <Text style={styles.portfolioSubtext}>
          {connectedWallets.length} wallet{connectedWallets.length !== 1 ? 's' : ''} connected
        </Text>
        {state.totalDefiValue > 0 && (
          <View style={styles.defiSummary}>
            <Text style={styles.defiLabel}>DeFi Positions</Text>
            <Text style={styles.defiValue}>
              {formatCurrency(state.totalDefiValue * 100)}
            </Text>
            <Text style={styles.defiSubtext}>
              {formatCurrency(state.totalAvailableForFunding * 100)} available for funding
            </Text>
          </View>
        )}
      </View>

      {/* Connected Wallets */}
      {connectedWallets.length > 0 ? (
        <View style={styles.walletsSection}>
          <Text style={styles.sectionTitle}>Connected Wallets</Text>
          {connectedWallets.map(renderWalletCard)}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>💳</Text>
          <Text style={styles.emptyStateTitle}>No Wallets Connected</Text>
          <Text style={styles.emptyStateText}>
            Connect your first cryptocurrency wallet to start funding your cards.
          </Text>
          <TouchableOpacity
            style={styles.connectFirstWalletButton}
            onPress={() => setActiveTab('connect')}
          >
            <Text style={styles.connectFirstWalletButtonText}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* DeFi Positions Summary */}
      {state.defiPositions.length > 0 && (
        <View style={styles.defiSection}>
          <Text style={styles.sectionTitle}>DeFi Positions</Text>
          {state.defiPositions.map((position) => (
            <View key={position.positionId} style={styles.defiCard}>
              <View style={styles.defiHeader}>
                <Text style={styles.defiProtocol}>{position.protocolName}</Text>
                <Text style={styles.defiType}>{position.positionType}</Text>
              </View>
              <View style={styles.defiStats}>
                <View style={styles.defiStat}>
                  <Text style={styles.defiStatLabel}>Total Value</Text>
                  <Text style={styles.defiStatValue}>
                    {formatCurrency(position.totalValueUsd * 100)}
                  </Text>
                </View>
                <View style={styles.defiStat}>
                  <Text style={styles.defiStatLabel}>APY</Text>
                  <Text style={styles.defiStatValueGreen}>
                    {position.currentYieldApy.toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.defiStat}>
                  <Text style={styles.defiStatLabel}>Available</Text>
                  <Text style={styles.defiStatValue}>
                    {formatCurrency(position.availableForFunding * 100)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      {connectedWallets.length > 0 && (
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={onNavigateToFunding}
          >
            <Text style={styles.quickActionIcon}>💰</Text>
            <Text style={styles.quickActionText}>Fund Card from Wallet</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  const renderConnectTab = () => (
    <WalletConnectComponent
      onWalletConnected={(wallet) => handleWalletConnected(
        wallet.walletType as WalletType,
        wallet.networkType as NetworkType,
        wallet.publicAddress,
        wallet.nickname
      )}
      onWalletDisconnected={handleWalletDisconnected}
      onError={(err) => actions.setError(err.message)}
      style={styles.tabContent}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading wallets...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet Management</Text>
        <Text style={styles.subtitle}>
          Manage your cryptocurrency wallets and DeFi positions
        </Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabNavigation}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'connect' && styles.activeTab]}
          onPress={() => setActiveTab('connect')}
        >
          <Text style={[styles.tabText, activeTab === 'connect' && styles.activeTabText]}>
            Connect Wallet
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.errorDismiss}
            onPress={actions.clearError}
          >
            <Text style={styles.errorDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' ? renderOverviewTab() : renderConnectTab()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },

  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },

  // Header
  header: {
    padding: 20,
    paddingBottom: 16,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  // Tab Navigation
  tabNavigation: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },

  activeTab: {
    backgroundColor: '#3B82F6',
  },

  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  activeTabText: {
    color: 'white',
  },

  // Error Container
  errorContainer: {
    backgroundColor: '#FEF2F2',
    marginHorizontal: 20,
    marginBottom: 16,
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

  // Tab Content
  tabContent: {
    flex: 1,
  },

  // Portfolio Summary
  portfolioSummary: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  portfolioLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },

  portfolioValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },

  portfolioSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  defiSummary: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    alignItems: 'center',
    width: '100%',
  },

  defiLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },

  defiValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 2,
  },

  defiSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
  },

  // Sections
  walletsSection: {
    paddingHorizontal: 20,
    gap: 16,
  },

  defiSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },

  // Wallet Cards
  walletCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  walletIcon: {
    fontSize: 24,
    marginRight: 12,
  },

  walletDetails: {
    flex: 1,
  },

  walletName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },

  walletAddress: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  statusConnected: {
    backgroundColor: '#DCFCE7',
  },

  statusDisconnected: {
    backgroundColor: '#FEE2E2',
  },

  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  statusConnectedText: {
    color: '#166534',
  },

  statusDisconnectedText: {
    color: '#991B1B',
  },

  // Balance Section
  balanceSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },

  balanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },

  balanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },

  balanceSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
  },

  // Wallet Actions
  walletActions: {
    flexDirection: 'row',
    gap: 8,
  },

  viewBalanceButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },

  viewBalanceButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  refreshButton: {
    backgroundColor: '#E0F2FE',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },

  refreshButtonText: {
    color: '#0284C7',
    fontSize: 14,
    fontWeight: '600',
  },

  disconnectButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },

  disconnectButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },

  // DeFi Cards
  defiCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  defiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  defiProtocol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  defiType: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    textTransform: 'capitalize',
  },

  defiStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  defiStat: {
    alignItems: 'center',
  },

  defiStatLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },

  defiStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },

  defiStatValueGreen: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },

  // Empty State
  emptyState: {
    backgroundColor: 'white',
    margin: 20,
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },

  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },

  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },

  connectFirstWalletButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },

  connectFirstWalletButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // Quick Actions
  quickActions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },

  quickActionButton: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  quickActionIcon: {
    fontSize: 24,
    marginRight: 12,
  },

  quickActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
});

export default WalletManagementScreen;
