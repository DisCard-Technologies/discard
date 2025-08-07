/**
 * ConversionCalculator Component for React Native
 * Real-time cryptocurrency funding amount calculator with slippage protection
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
  ConversionCalculatorRequest,
  ConversionCalculatorResponse,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
} from '@discard/shared';

interface ConversionCalculatorProps {
  onQuoteGenerated?: (quote: ConversionCalculatorResponse) => void;
  onError?: (error: CryptoWalletError) => void;
  style?: ViewStyle;
}

const SUPPORTED_CRYPTOS = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  { symbol: 'USDT', name: 'Tether', icon: '₮' },
  { symbol: 'USDC', name: 'USD Coin', icon: '$' },
  { symbol: 'XRP', name: 'XRP', icon: 'X' },
];

const ConversionCalculator: React.FC<ConversionCalculatorProps> = ({
  onQuoteGenerated,
  onError,
  style,
}) => {
  const [selectedCrypto, setSelectedCrypto] = useState('BTC');
  const [usdAmount, setUsdAmount] = useState('');
  const [slippage, setSlippage] = useState('2');
  const [isCalculating, setIsCalculating] = useState(false);
  const [quote, setQuote] = useState<ConversionCalculatorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-calculate on input changes with debounce
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (usdAmount && parseFloat(usdAmount) > 0) {
        calculateConversion();
      }
    }, 1000);

    return () => clearTimeout(debounceTimer);
  }, [selectedCrypto, usdAmount, slippage]);

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    return 'mock-token';
  };

  const calculateConversion = async () => {
    if (!usdAmount || parseFloat(usdAmount) <= 0) {
      setQuote(null);
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const request: ConversionCalculatorRequest = {
        fromCrypto: selectedCrypto,
        toUsd: Math.round(parseFloat(usdAmount) * 100), // Convert to cents
        slippageLimit: parseFloat(slippage),
      };

      const response = await fetch('/api/v1/crypto/rates/conversion-calculator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to calculate conversion');
      }

      const data = await response.json();
      const calculatedQuote = data.data as ConversionCalculatorResponse;
      
      setQuote(calculatedQuote);
      onQuoteGenerated?.(calculatedQuote);

    } catch (error) {
      const walletError: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.RATE_FETCH_FAILED,
        message: error instanceof Error ? error.message : 'Conversion calculation failed',
        details: { originalError: error },
      };
      
      setError(walletError.message);
      onError?.(walletError);
      setQuote(null);
    } finally {
      setIsCalculating(false);
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

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const isQuoteExpiring = (expiresAt: Date): boolean => {
    const timeUntilExpiry = new Date(expiresAt).getTime() - Date.now();
    return timeUntilExpiry < 30000; // Less than 30 seconds
  };

  const renderCryptoSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorLabel}>From Cryptocurrency</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cryptoScroll}>
        {SUPPORTED_CRYPTOS.map((crypto) => (
          <TouchableOpacity
            key={crypto.symbol}
            style={[
              styles.cryptoOption,
              selectedCrypto === crypto.symbol && styles.cryptoOptionSelected,
            ]}
            onPress={() => setSelectedCrypto(crypto.symbol)}
          >
            <Text style={styles.cryptoIcon}>{crypto.icon}</Text>
            <Text style={[
              styles.cryptoSymbol,
              selectedCrypto === crypto.symbol && styles.cryptoSymbolSelected,
            ]}>
              {crypto.symbol}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderInputSection = () => (
    <View style={styles.inputSection}>
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>USD Amount to Fund</Text>
        <TextInput
          style={styles.usdInput}
          value={usdAmount}
          onChangeText={setUsdAmount}
          placeholder="0.00"
          placeholderTextColor="#9CA3AF"
          keyboardType="decimal-pad"
          maxLength={10}
        />
        <Text style={styles.inputPrefix}>$</Text>
      </View>

      <View style={styles.slippageContainer}>
        <Text style={styles.slippageLabel}>Slippage Tolerance</Text>
        <View style={styles.slippageInputContainer}>
          <TextInput
            style={styles.slippageInput}
            value={slippage}
            onChangeText={setSlippage}
            placeholder="2.0"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            maxLength={4}
          />
          <Text style={styles.slippageSuffix}>%</Text>
        </View>
      </View>
    </View>
  );

  const renderQuoteDisplay = () => {
    if (!quote) return null;

    const isExpiring = isQuoteExpiring(quote.expiresAt);

    return (
      <View style={styles.quoteContainer}>
        <View style={styles.quoteHeader}>
          <Text style={styles.quoteTitle}>Conversion Quote</Text>
          <View style={[
            styles.quoteStatus,
            isExpiring ? styles.quoteStatusExpiring : styles.quoteStatusActive,
          ]}>
            <Text style={[
              styles.quoteStatusText,
              isExpiring ? styles.quoteStatusExpiringText : styles.quoteStatusActiveText,
            ]}>
              {isExpiring ? 'Expiring Soon' : 'Active'}
            </Text>
          </View>
        </View>

        <View style={styles.conversionRow}>
          <Text style={styles.conversionLabel}>You Need</Text>
          <Text style={styles.conversionAmount}>
            {formatCryptoAmount(quote.fromAmount, selectedCrypto)}
          </Text>
        </View>

        <View style={styles.conversionRow}>
          <Text style={styles.conversionLabel}>You Get</Text>
          <Text style={styles.conversionAmount}>
            {formatUsdAmount(quote.toAmount)}
          </Text>
        </View>

        <View style={styles.conversionRow}>
          <Text style={styles.conversionLabel}>Rate</Text>
          <Text style={styles.conversionRate}>
            1 {selectedCrypto} = ${parseFloat(quote.rate).toLocaleString()}
          </Text>
        </View>

        <View style={styles.feesSection}>
          <Text style={styles.feesTitle}>Fee Breakdown</Text>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Network Fee</Text>
            <Text style={styles.feeAmount}>{formatUsdAmount(quote.fees.networkFee)}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Conversion Fee</Text>
            <Text style={styles.feeAmount}>{formatUsdAmount(quote.fees.conversionFee)}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Platform Fee</Text>
            <Text style={styles.feeAmount}>{formatUsdAmount(quote.fees.platformFee)}</Text>
          </View>
          <View style={[styles.feeRow, styles.totalFeeRow]}>
            <Text style={styles.totalFeeLabel}>Total Fees</Text>
            <Text style={styles.totalFeeAmount}>{formatUsdAmount(quote.fees.totalFee)}</Text>
          </View>
        </View>

        <View style={styles.protectionSection}>
          <Text style={styles.protectionTitle}>Slippage Protection</Text>
          <View style={styles.protectionRow}>
            <Text style={styles.protectionLabel}>Max Slippage</Text>
            <Text style={styles.protectionValue}>
              {formatPercentage(quote.slippageProtection.maxSlippage)}
            </Text>
          </View>
          <View style={styles.protectionRow}>
            <Text style={styles.protectionLabel}>Guaranteed Min</Text>
            <Text style={styles.protectionValue}>
              {formatCryptoAmount(quote.slippageProtection.guaranteedMinOutput, selectedCrypto)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={calculateConversion}
          disabled={isCalculating}
        >
          {isCalculating ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh Quote</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, style]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <Text style={styles.title}>Conversion Calculator</Text>
        <Text style={styles.subtitle}>
          Calculate exact cryptocurrency amounts needed for card funding
        </Text>

        {renderCryptoSelector()}
        {renderInputSection()}

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

        {isCalculating && !quote && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Calculating conversion...</Text>
          </View>
        )}

        {renderQuoteDisplay()}
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

  // Crypto Selector
  selectorContainer: {
    gap: 12,
  },

  selectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  cryptoScroll: {
    flexDirection: 'row',
  },

  cryptoOption: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 70,
    borderWidth: 2,
    borderColor: 'transparent',
  },

  cryptoOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },

  cryptoIcon: {
    fontSize: 20,
    marginBottom: 4,
  },

  cryptoSymbol: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },

  cryptoSymbolSelected: {
    color: '#3B82F6',
  },

  // Input Section
  inputSection: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    gap: 16,
  },

  inputContainer: {
    position: 'relative',
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
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
    top: 42,
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },

  slippageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  slippageLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    flex: 1,
  },

  slippageInputContainer: {
    position: 'relative',
    width: 80,
  },

  slippageInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    paddingRight: 20,
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    textAlign: 'right',
  },

  slippageSuffix: {
    position: 'absolute',
    right: 8,
    top: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },

  // Quote Display
  quoteContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    gap: 16,
  },

  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  quoteTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },

  quoteStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },

  quoteStatusActive: {
    backgroundColor: '#DCFCE7',
  },

  quoteStatusExpiring: {
    backgroundColor: '#FEF3C7',
  },

  quoteStatusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  quoteStatusActiveText: {
    color: '#166534',
  },

  quoteStatusExpiringText: {
    color: '#92400E',
  },

  conversionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  conversionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },

  conversionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },

  conversionRate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    fontFamily: 'monospace',
  },

  // Fees Section
  feesSection: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },

  feesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },

  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  feeLabel: {
    fontSize: 12,
    color: '#6B7280',
  },

  feeAmount: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },

  totalFeeRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    marginTop: 4,
  },

  totalFeeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },

  totalFeeAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },

  // Protection Section
  protectionSection: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },

  protectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  },

  protectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  protectionLabel: {
    fontSize: 12,
    color: '#3730A3',
  },

  protectionValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },

  // Refresh Button
  refreshButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },

  refreshButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
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

export default ConversionCalculator;