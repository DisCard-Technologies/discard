/**
 * Sell Crypto Screen
 *
 * Allows users to sell crypto via MoonPay and receive fiat to their bank account.
 * Supports pre-selecting a token from token-detail or defaults to USDC.
 */
import { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/stores/authConvex';
import { useMoonPay } from '@/hooks/useMoonPay';

// Supported currencies for selling
const CURRENCIES = [
  { code: 'usdc', name: 'USD Coin', symbol: 'USDC', icon: '$' },
  { code: 'sol', name: 'Solana', symbol: 'SOL', icon: '◎' },
  { code: 'eth', name: 'Ethereum', symbol: 'ETH', icon: '◇' },
  { code: 'usdt', name: 'Tether', symbol: 'USDT', icon: '₮' },
];

// Quick percentage buttons for selling
const QUICK_PERCENTAGES = [25, 50, 75, 100];

export default function SellCryptoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ currency?: string; balance?: string }>();

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // User wallet address
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Selected currency (default to USDC or from params)
  const initialCurrency = params.currency?.toLowerCase() || 'usdc';
  const [selectedCurrency, setSelectedCurrency] = useState(
    CURRENCIES.find((c) => c.code === initialCurrency) || CURRENCIES[0]
  );

  // Amount input (in crypto units)
  const [amount, setAmount] = useState('');
  const numericAmount = parseFloat(amount) || 0;

  // Mock balance - in real app this would come from wallet holdings
  const mockBalance = parseFloat(params.balance || '0') || 100;

  // MoonPay hook
  const { openSell, isReady, isLoading, error } = useMoonPay({
    walletAddress,
    defaultCurrency: selectedCurrency.code,
  });

  // Handle sell action
  const handleSell = useCallback(async () => {
    if (numericAmount <= 0) {
      return;
    }

    try {
      await openSell({
        currencyCode: selectedCurrency.code,
        quoteCurrencyAmount: numericAmount,
      });
    } catch (err) {
      console.error('Sell failed:', err);
    }
  }, [openSell, selectedCurrency, numericAmount]);

  // Set quick percentage of balance
  const handleQuickPercentage = (percentage: number) => {
    const value = (mockBalance * percentage) / 100;
    setAmount(value.toFixed(6).replace(/\.?0+$/, ''));
  };

  const isValidAmount = numericAmount > 0 && numericAmount <= mockBalance;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Sell Crypto</ThemedText>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {/* Currency Selector */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>SELECT CURRENCY</ThemedText>
          <View style={styles.currencyGrid}>
            {CURRENCIES.map((currency) => {
              const isSelected = selectedCurrency.code === currency.code;
              return (
                <Pressable
                  key={currency.code}
                  onPress={() => setSelectedCurrency(currency)}
                  style={[
                    styles.currencyButton,
                    { backgroundColor: isSelected ? 'rgba(239,68,68,0.15)' : cardBg },
                    isSelected && { borderColor: '#ef4444', borderWidth: 1 },
                  ]}
                >
                  <View style={[styles.currencyIcon, { backgroundColor: isSelected ? 'rgba(239,68,68,0.2)' : borderColor }]}>
                    <ThemedText style={styles.currencyIconText}>{currency.icon}</ThemedText>
                  </View>
                  <ThemedText style={[styles.currencySymbol, isSelected && { color: '#ef4444' }]}>
                    {currency.symbol}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Balance Display */}
        <View style={[styles.balanceCard, { backgroundColor: cardBg }]}>
          <View style={styles.balanceRow}>
            <ThemedText style={[styles.balanceLabel, { color: mutedColor }]}>Available Balance</ThemedText>
            <ThemedText style={styles.balanceValue}>
              {mockBalance.toLocaleString()} {selectedCurrency.symbol}
            </ThemedText>
          </View>
        </View>

        {/* Amount Input */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>AMOUNT TO SELL</ThemedText>
          <View style={[styles.amountInputContainer, { backgroundColor: cardBg }]}>
            <TextInput
              style={[styles.amountInput, { color: textColor }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={mutedColor}
              keyboardType="decimal-pad"
              autoFocus
            />
            <ThemedText style={[styles.currencyLabel, { color: mutedColor }]}>{selectedCurrency.symbol}</ThemedText>
          </View>
          {numericAmount > mockBalance && (
            <ThemedText style={[styles.errorText, { color: '#ef4444' }]}>Insufficient balance</ThemedText>
          )}
        </View>

        {/* Quick Percentage Buttons */}
        <View style={styles.quickAmounts}>
          {QUICK_PERCENTAGES.map((percentage) => {
            const isMax = percentage === 100;
            return (
              <Pressable
                key={percentage}
                onPress={() => handleQuickPercentage(percentage)}
                style={[
                  styles.quickAmountButton,
                  { backgroundColor: cardBg },
                  isMax && { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1 },
                ]}
              >
                <ThemedText style={[styles.quickAmountText, isMax && { color: '#ef4444' }]}>
                  {isMax ? 'MAX' : `${percentage}%`}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Payout Info */}
        <View style={[styles.payoutInfo, { backgroundColor: cardBg }]}>
          <ThemedText style={[styles.payoutInfoTitle, { color: mutedColor }]}>PAYOUT</ThemedText>
          <View style={styles.payoutMethods}>
            <View style={styles.payoutMethod}>
              <Ionicons name="business" size={20} color={textColor} />
              <View style={styles.payoutMethodText}>
                <ThemedText style={styles.payoutMethodTitle}>Bank Account</ThemedText>
                <ThemedText style={[styles.payoutMethodDesc, { color: mutedColor }]}>
                  Receive USD directly to your bank
                </ThemedText>
              </View>
            </View>
          </View>
          <View style={[styles.estimateRow, { borderTopColor: borderColor }]}>
            <ThemedText style={[styles.estimateLabel, { color: mutedColor }]}>Estimated payout</ThemedText>
            <ThemedText style={styles.estimateValue}>
              ~${(numericAmount * 1.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </ThemedText>
          </View>
        </View>

        {/* Error Display */}
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <ThemedText style={[styles.errorBannerText, { color: '#ef4444' }]}>{error}</ThemedText>
          </View>
        )}
      </View>

      {/* Sell Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleSell}
          disabled={!isValidAmount || isLoading || !isReady}
          style={[
            styles.sellButton,
            { backgroundColor: isValidAmount && isReady ? '#ef4444' : `${mutedColor}50` },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="arrow-down" size={20} color="#fff" />
              <ThemedText style={styles.sellButtonText}>
                {isValidAmount ? `Sell ${numericAmount} ${selectedCurrency.symbol}` : 'Enter amount'}
              </ThemedText>
            </>
          )}
        </Pressable>
        <ThemedText style={[styles.footerNote, { color: mutedColor }]}>
          Powered by MoonPay. Funds sent to your linked bank account.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 12,
  },
  currencyGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  currencyButton: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  currencyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyIconText: {
    fontSize: 18,
  },
  currencySymbol: {
    fontSize: 12,
    fontWeight: '500',
  },
  balanceCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '300',
  },
  currencyLabel: {
    fontSize: 18,
    fontWeight: '500',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  quickAmountButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '500',
  },
  payoutInfo: {
    borderRadius: 14,
    padding: 16,
  },
  payoutInfoTitle: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 12,
  },
  payoutMethods: {
    gap: 12,
  },
  payoutMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  payoutMethodText: {
    flex: 1,
  },
  payoutMethodTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  payoutMethodDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  estimateLabel: {
    fontSize: 12,
  },
  estimateValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  errorBannerText: {
    fontSize: 12,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  sellButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  footerNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
});
