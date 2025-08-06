/**
 * Wallet Balance Display Component for React Native
 * Shows real-time cryptocurrency balances with USD conversion
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  ViewStyle,
  Alert,
} from 'react-native';
import {
  CryptoWallet,
  WalletBalanceResponse,
  CryptoBalance,
  ConversionRates,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
} from '@discard/shared';

interface WalletBalanceDisplayProps {
  wallet: CryptoWallet;
  onRefresh?: () => void;
  onError?: (error: CryptoWalletError) => void;
  style?: ViewStyle;
  showRefreshButton?: boolean;
  autoRefreshInterval?: number; // in milliseconds
}

const WalletBalanceDisplay: React.FC<WalletBalanceDisplayProps> = ({
  wallet,
  onRefresh,
  onError,
  style,
  showRefreshButton = true,
  autoRefreshInterval = 30000, // 30 seconds default
}) => {
  // State management
  const [balanceData, setBalanceData] = useState<WalletBalanceResponse | null>(null);
  const [conversionRates, setConversionRates] = useState<ConversionRates>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    loadBalanceData();
    
    // Set up auto-refresh if enabled
    if (autoRefreshInterval > 0) {
      const interval = setInterval(loadBalanceData, autoRefreshInterval);
      return () => clearInterval(interval);
    }
  }, [wallet.walletId, autoRefreshInterval]);

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    // For now, returning a placeholder
    return 'mock-token';
  };

  const loadBalanceData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else if (!balanceData) {
        setIsLoading(true);
      }
      
      setError(null);

      // Load wallet balance and conversion rates in parallel
      const [balanceResponse, ratesResponse] = await Promise.all([
        fetch(`/api/v1/crypto/wallets/${wallet.walletId}/balance`, {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        }),
        fetch('/api/v1/crypto/rates', {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        }),
      ]);

      if (!balanceResponse.ok) {
        const errorData = await balanceResponse.json();
        throw new Error(errorData.error || 'Failed to load wallet balance');
      }

      if (!ratesResponse.ok) {
        const errorData = await ratesResponse.json();
        throw new Error(errorData.error || 'Failed to load conversion rates');
      }

      const balanceData = await balanceResponse.json();
      const ratesData = await ratesResponse.json();

      setBalanceData(balanceData.data);
      setConversionRates(ratesData.data.rates);
      setLastUpdated(new Date());

      onRefresh?.();

    } catch (error) {
      const walletError: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.BALANCE_FETCH_FAILED,
        message: error instanceof Error ? error.message : 'Failed to load balance data',
        details: { walletId: wallet.walletId },
      };
      
      setError(walletError.message);
      onError?.(walletError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    loadBalanceData(true);
  };

  const formatCurrency = (amountCents: number): string => {
    return (amountCents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const formatCryptoAmount = (amount: string, currency: string): string => {
    const num = parseFloat(amount);
    
    // Bitcoin and similar major cryptos
    if (['BTC', 'ETH', 'LTC'].includes(currency)) {
      return num.toFixed(6);
    }
    
    // Stablecoins and smaller amounts
    if (['USDT', 'USDC', 'DAI'].includes(currency)) {
      return num.toFixed(2);
    }
    
    // Default precision
    return num.toFixed(8);
  };

  const getCurrencyIcon = (currency: string): string => {
    const icons: Record<string, string> = {
      BTC: '₿',
      ETH: 'Ξ',
      USDT: '₮',
      USDC: '$',
      LTC: 'Ł',
      XRP: 'X',
      ADA: '₳',
      DOT: '●',
    };
    
    return icons[currency] || '○';
  };

  const getWalletTypeIcon = (walletType: string): string => {
    const icons = {
      metamask: '🦊',
      walletconnect: '🔗',
      hardware: '🔐',
      bitcoin: '₿',
    };
    
    return icons[walletType as keyof typeof icons] || '💳';
  };

  const renderBalanceItem = (balance: CryptoBalance, index: number) => {
    const currencyIcon = getCurrencyIcon(balance.currency);
    const rate = conversionRates[balance.currency];

    return (
      <View key={`${balance.currency}-${index}`} style={styles.balanceItem}>
        <View style={styles.balanceHeader}>
          <View style={styles.currencyInfo}>
            <Text style={styles.currencyIcon}>{currencyIcon}</Text>
            <Text style={styles.currencyName}>{balance.currency}</Text>
          </View>
          <View style={styles.balanceAmounts}>
            <Text style={styles.cryptoAmount}>
              {formatCryptoAmount(balance.balance, balance.currency)}
            </Text>
            <Text style={styles.usdAmount}>
              {formatCurrency(balance.usdValue)}
            </Text>
          </View>
        </View>
        
        {rate && (
          <View style={styles.rateInfo}>
            <Text style={styles.rateText}>
              1 {balance.currency} = {formatCurrency(parseFloat(rate.usd) * 100)}
            </Text>
            <Text style={styles.rateUpdated}>
              Updated {new Date(rate.lastUpdated).toLocaleTimeString()}
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (isLoading && !balanceData) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading balance...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, style]}
      refreshControl={
        <RefreshControl 
          refreshing={isRefreshing} 
          onRefresh={handleManualRefresh}
          colors={['#3B82F6']}
          tintColor="#3B82F6"
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Wallet Header */}
      <View style={styles.walletHeader}>
        <View style={styles.walletInfo}>
          <Text style={styles.walletIcon}>{getWalletTypeIcon(wallet.walletType)}</Text>
          <View style={styles.walletDetails}>
            <Text style={styles.walletName}>
              {wallet.walletName || `${wallet.walletType} Wallet`}
            </Text>
            <Text style={styles.walletAddress}>
              {`${wallet.walletAddress.slice(0, 8)}...${wallet.walletAddress.slice(-6)}`}
            </Text>
          </View>
        </View>
        
        {showRefreshButton && (
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={handleManualRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Text style={styles.refreshButtonText}>⟳</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Total Value Summary */}
      {balanceData && (
        <View style={styles.totalValueCard}>
          <Text style={styles.totalValueLabel}>Total Portfolio Value</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(balanceData.totalUsdValue)}
          </Text>
          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{balanceData.balances.length}</Text>
              <Text style={styles.statLabel}>Currencies</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {lastUpdated ? lastUpdated.toLocaleTimeString() : '--'}
              </Text>
              <Text style={styles.statLabel}>Last Updated</Text>
            </View>
          </View>
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>Unable to Load Balance</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleManualRefresh}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Balance Breakdown */}
      {balanceData && balanceData.balances.length > 0 ? (
        <View style={styles.balancesSection}>
          <Text style={styles.sectionTitle}>Balance Breakdown</Text>
          {balanceData.balances.map(renderBalanceItem)}
        </View>
      ) : balanceData && balanceData.balances.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>💰</Text>
          <Text style={styles.emptyStateTitle}>No Balances Found</Text>
          <Text style={styles.emptyStateText}>
            This wallet doesn't have any cryptocurrency balances at the moment.
          </Text>
        </View>
      ) : null}

      {/* Connection Status */}
      <View style={styles.statusSection}>
        <Text style={styles.statusLabel}>Connection Status</Text>
        <View style={[
          styles.statusBadge,
          wallet.connectionStatus === 'connected' ? styles.statusConnected : styles.statusDisconnected
        ]}>
          <Text style={[
            styles.statusText,
            wallet.connectionStatus === 'connected' ? styles.statusConnectedText : styles.statusDisconnectedText
          ]}>
            {wallet.connectionStatus.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.statusSubtext}>
          Last balance check: {new Date(wallet.lastBalanceCheck).toLocaleString()}
        </Text>
      </View>
    </ScrollView>
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
    padding: 40,
  },

  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },

  // Wallet Header
  walletHeader: {
    backgroundColor: 'white',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  walletIcon: {
    fontSize: 32,
    marginRight: 16,
  },

  walletDetails: {
    flex: 1,
  },

  walletName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  walletAddress: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
  },

  refreshButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },

  refreshButtonText: {
    fontSize: 18,
    color: '#3B82F6',
    fontWeight: '600',
  },

  // Total Value Card
  totalValueCard: {
    backgroundColor: 'white',
    margin: 20,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  totalValueLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },

  totalValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 16,
  },

  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  statItem: {
    alignItems: 'center',
  },

  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },

  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },

  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },

  // Error Container
  errorContainer: {
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    margin: 20,
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },

  errorIcon: {
    fontSize: 20,
    marginRight: 12,
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 4,
  },

  errorMessage: {
    fontSize: 12,
    color: '#7F1D1D',
    marginBottom: 8,
    lineHeight: 16,
  },

  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#DC2626',
    borderRadius: 4,
  },

  retryButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },

  // Balances Section
  balancesSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },

  balanceItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  currencyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  currencyIcon: {
    fontSize: 20,
    marginRight: 8,
  },

  currencyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  balanceAmounts: {
    alignItems: 'flex-end',
  },

  cryptoAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    fontFamily: 'monospace',
  },

  usdAmount: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
  },

  rateInfo: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  rateText: {
    fontSize: 12,
    color: '#6B7280',
  },

  rateUpdated: {
    fontSize: 10,
    color: '#9CA3AF',
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
  },

  // Status Section
  statusSection: {
    backgroundColor: 'white',
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },

  statusConnected: {
    backgroundColor: '#DCFCE7',
  },

  statusDisconnected: {
    backgroundColor: '#FEE2E2',
  },

  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  statusConnectedText: {
    color: '#166534',
  },

  statusDisconnectedText: {
    color: '#991B1B',
  },

  statusSubtext: {
    fontSize: 12,
    color: '#6B7280',
  },
});

export default WalletBalanceDisplay;