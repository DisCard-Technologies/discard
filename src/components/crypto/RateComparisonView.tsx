/**
 * RateComparisonView Component for React Native
 * Multi-cryptocurrency rate comparison for optimal funding source selection
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  ViewStyle,
} from 'react-native';
import {
  RateComparisonRequest,
  RateComparisonResponse,
  CryptoRateComparison,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
} from '../../types';

interface RateComparisonViewProps {
  onCryptoSelected?: (comparison: CryptoRateComparison) => void;
  onError?: (error: CryptoWalletError) => void;
  style?: ViewStyle;
}

const CRYPTO_ICONS: { [key: string]: string } = {
  BTC: '₿',
  ETH: 'Ξ',
  USDT: '₮',
  USDC: '$',
  XRP: 'X',
};

const RateComparisonView: React.FC<RateComparisonViewProps> = ({
  onCryptoSelected,
  onError,
  style,
}) => {
  const [targetAmount, setTargetAmount] = useState('');
  const [comparison, setComparison] = useState<RateComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 30 seconds when enabled
  useEffect(() => {
    if (!autoRefresh || !targetAmount || parseFloat(targetAmount) <= 0) return;

    const interval = setInterval(() => {
      fetchComparison();
    }, 30000);

    return () => clearInterval(interval);
  }, [targetAmount, autoRefresh]);

  // Fetch comparison on target amount changes with debounce
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (targetAmount && parseFloat(targetAmount) > 0) {
        fetchComparison();
      }
    }, 1000);

    return () => clearTimeout(debounceTimer);
  }, [targetAmount]);

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    return 'mock-token';
  };

  const fetchComparison = async () => {
    if (!targetAmount || parseFloat(targetAmount) <= 0) {
      setComparison(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const request: RateComparisonRequest = {
        targetUsdAmount: Math.round(parseFloat(targetAmount) * 100), // Convert to cents
      };

      const response = await fetch('/api/v1/crypto/rates/comparison', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch rate comparison');
      }

      const data = await response.json();
      const comparisonData = data.data as RateComparisonResponse;
      
      setComparison(comparisonData);
      setLastUpdated(new Date());

    } catch (error) {
      const walletError: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.RATE_FETCH_FAILED,
        message: error instanceof Error ? error.message : 'Rate comparison failed',
        details: { originalError: error },
      };
      
      setError(walletError.message);
      onError?.(walletError);
      setComparison(null);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCryptoAmount = (amount: string, symbol: string): string => {
    const num = parseFloat(amount);
    if (num < 0.001) return `${num.toExponential(2)} ${symbol}`;
    if (num < 1) return `${num.toFixed(6)} ${symbol}`;
    if (num < 100) return `${num.toFixed(4)} ${symbol}`;
    return `${num.toFixed(2)} ${symbol}`;
  };

  const formatUsdAmount = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatRate = (rate: string): string => {
    const num = parseFloat(rate);
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getCostEfficiencyColor = (efficiency: number, maxEfficiency: number): string => {
    const ratio = efficiency / maxEfficiency;
    if (ratio <= 0.33) return '#10B981'; // Green - most efficient
    if (ratio <= 0.66) return '#F59E0B'; // Yellow - moderate
    return '#EF4444'; // Red - least efficient
  };

  const getCostEfficiencyLabel = (efficiency: number, maxEfficiency: number): string => {
    const ratio = efficiency / maxEfficiency;
    if (ratio <= 0.33) return 'Best Value';
    if (ratio <= 0.66) return 'Good Value';
    return 'Higher Cost';
  };

  const handleCryptoSelect = (comparisonItem: CryptoRateComparison) => {
    onCryptoSelected?.(comparisonItem);
  };

  const renderComparisonItem = (item: CryptoRateComparison, isBest: boolean, maxEfficiency: number) => {
    const efficiencyColor = getCostEfficiencyColor(item.costEfficiency, maxEfficiency);
    const efficiencyLabel = getCostEfficiencyLabel(item.costEfficiency, maxEfficiency);

    return (
      <TouchableOpacity
        key={item.symbol}
        style={[
          styles.comparisonItem,
          isBest && styles.comparisonItemBest,
        ]}
        onPress={() => handleCryptoSelect(item)}
      >
        <View style={styles.comparisonHeader}>
          <View style={styles.cryptoInfo}>
            <Text style={styles.cryptoIcon}>
              {CRYPTO_ICONS[item.symbol] || '?'}
            </Text>
            <View>
              <Text style={styles.cryptoSymbol}>{item.symbol}</Text>
              {isBest && (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>RECOMMENDED</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.efficiencyBadge}>
            <View style={[styles.efficiencyDot, { backgroundColor: efficiencyColor }]} />
            <Text style={[styles.efficiencyText, { color: efficiencyColor }]}>
              {efficiencyLabel}
            </Text>
          </View>
        </View>

        <View style={styles.comparisonDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>You Need</Text>
            <Text style={styles.detailValue}>
              {formatCryptoAmount(item.requiredAmount, item.symbol)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Current Rate</Text>
            <Text style={styles.detailValue}>
              {formatRate(item.currentRate)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Cost</Text>
            <Text style={[styles.detailValue, styles.totalCostValue]}>
              {formatUsdAmount(item.totalCost)}
            </Text>
          </View>

          <View style={styles.feesRow}>
            <Text style={styles.feesLabel}>Fees: </Text>
            <Text style={styles.feesBreakdown}>
              Network {formatUsdAmount(item.fees.networkFee)} + 
              Conv. {formatUsdAmount(item.fees.conversionFee)} + 
              Platform {formatUsdAmount(item.fees.platformFee)}
            </Text>
          </View>
        </View>

        <View style={styles.selectButton}>
          <Text style={styles.selectButtonText}>
            {isBest ? 'Use Recommended' : 'Select'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderComparison = () => {
    if (!comparison) return null;

    const maxEfficiency = Math.max(...comparison.comparisons.map(c => c.costEfficiency));
    const sortedComparisons = [...comparison.comparisons].sort((a, b) => a.costEfficiency - b.costEfficiency);

    return (
      <View style={styles.comparisonContainer}>
        <View style={styles.comparisonHeader}>
          <Text style={styles.comparisonTitle}>Rate Comparison</Text>
          <View style={styles.refreshControls}>
            <TouchableOpacity
              style={[styles.autoRefreshToggle, autoRefresh && styles.autoRefreshActive]}
              onPress={() => setAutoRefresh(!autoRefresh)}
            >
              <Text style={[
                styles.autoRefreshText,
                autoRefresh && styles.autoRefreshActiveText,
              ]}>
                Auto
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manualRefreshButton}
              onPress={fetchComparison}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Text style={styles.manualRefreshText}>↻</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.targetAmountDisplay}>
          Target: {formatUsdAmount(comparison.targetUsdAmount)}
        </Text>

        {lastUpdated && (
          <Text style={styles.lastUpdated}>
            Updated: {lastUpdated.toLocaleTimeString()}
          </Text>
        )}

        <ScrollView style={styles.comparisonList} showsVerticalScrollIndicator={false}>
          {sortedComparisons.map((item, index) => 
            renderComparisonItem(
              item, 
              item.symbol === comparison.bestOption, 
              maxEfficiency
            )
          )}
        </ScrollView>

        <View style={styles.comparisonFooter}>
          <Text style={styles.footerNote}>
            💡 Rates update every 30 seconds. Tap any option to proceed with funding.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, style]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <Text style={styles.title}>Rate Comparison</Text>
        <Text style={styles.subtitle}>
          Compare rates across cryptocurrencies to find the best funding option
        </Text>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>USD Amount to Fund</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.usdInput}
              value={targetAmount}
              onChangeText={setTargetAmount}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              maxLength={10}
            />
            <Text style={styles.inputPrefix}>$</Text>
          </View>
        </View>

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

        {isLoading && !comparison && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Comparing rates...</Text>
          </View>
        )}

        {renderComparison()}
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
  },

  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Input Section
  inputSection: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    gap: 8,
  },

  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  inputContainer: {
    position: 'relative',
  },

  usdInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'right',
  },

  inputPrefix: {
    position: 'absolute',
    left: 12,
    top: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },

  // Comparison Container
  comparisonContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },

  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },

  comparisonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },

  refreshControls: {
    flexDirection: 'row',
    gap: 8,
  },

  autoRefreshToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
  },

  autoRefreshActive: {
    backgroundColor: '#3B82F6',
  },

  autoRefreshText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },

  autoRefreshActiveText: {
    color: 'white',
  },

  manualRefreshButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    minWidth: 28,
    alignItems: 'center',
  },

  manualRefreshText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },

  targetAmountDisplay: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    paddingHorizontal: 20,
    paddingBottom: 5,
  },

  lastUpdated: {
    fontSize: 12,
    color: '#6B7280',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },

  // Comparison List
  comparisonList: {
    maxHeight: 400,
  },

  comparisonItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },

  comparisonItemBest: {
    backgroundColor: '#F0FDF4',
    borderTopColor: '#10B981',
    borderTopWidth: 2,
  },

  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  cryptoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  cryptoIcon: {
    fontSize: 24,
    color: '#1F2937',
  },

  cryptoSymbol: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },

  bestBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginTop: 2,
  },

  bestBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: 'white',
    textTransform: 'uppercase',
  },

  efficiencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  efficiencyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  efficiencyText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // Comparison Details
  comparisonDetails: {
    gap: 8,
    marginBottom: 12,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  detailLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },

  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },

  totalCostValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },

  feesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  feesLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },

  feesBreakdown: {
    fontSize: 10,
    color: '#9CA3AF',
    flex: 1,
  },

  // Select Button
  selectButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },

  selectButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },

  // Footer
  comparisonFooter: {
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },

  footerNote: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Error and Loading States
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

  loadingContainer: {
    backgroundColor: 'white',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },

  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
});

export default RateComparisonView;