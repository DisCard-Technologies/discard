/**
 * Buy Crypto Screen
 *
 * Allows users to purchase crypto via MoonPay with Apple Pay, Google Pay, or card.
 * Supports pre-selecting a token from token-detail or defaults to USDC.
 */
import { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/stores/authConvex';
import { useMoonPay } from '@/hooks/useMoonPay';

// Supported currencies for purchase
const CURRENCIES = [
  { code: 'usdc', name: 'USD Coin', symbol: 'USDC', icon: '$' },
  { code: 'sol', name: 'Solana', symbol: 'SOL', icon: '◎' },
  { code: 'eth', name: 'Ethereum', symbol: 'ETH', icon: '◇' },
  { code: 'usdt', name: 'Tether', symbol: 'USDT', icon: '₮' },
];

// Quick amount buttons
const QUICK_AMOUNTS = [25, 50, 100, 250, 500];

export default function BuyCryptoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ currency?: string; amount?: string; mode?: string }>();

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // Deposit mode locks to USDC only
  const isDepositMode = params.mode === 'deposit';

  // User wallet address
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Selected currency (default to USDC or from params)
  const initialCurrency = params.currency?.toLowerCase() || 'usdc';
  const [selectedCurrency, setSelectedCurrency] = useState(
    CURRENCIES.find((c) => c.code === initialCurrency) || CURRENCIES[0]
  );

  // Amount input
  const [amount, setAmount] = useState(params.amount || '');
  const numericAmount = parseFloat(amount) || 0;

  // MoonPay hook
  const { openBuy, isReady, isLoading, error } = useMoonPay({
    walletAddress,
    defaultCurrency: selectedCurrency.code,
  });

  // Handle buy action
  const handleBuy = useCallback(async () => {
    if (numericAmount < 10) {
      return; // Minimum $10
    }

    try {
      await openBuy({
        currencyCode: selectedCurrency.code,
        baseCurrencyAmount: numericAmount,
      });
    } catch (err) {
      console.error('Buy failed:', err);
    }
  }, [openBuy, selectedCurrency, numericAmount]);

  // Set quick amount
  const handleQuickAmount = (value: number) => {
    setAmount(value.toString());
  };

  const isValidAmount = numericAmount >= 10;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {isDepositMode ? 'Deposit USDC' : 'Buy Crypto'}
        </ThemedText>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {/* Currency Selector - hidden in deposit mode */}
        {!isDepositMode && (
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
                      { backgroundColor: isSelected ? `${primaryColor}15` : cardBg },
                      isSelected && { borderColor: primaryColor, borderWidth: 1 },
                    ]}
                  >
                    <View style={[styles.currencyIcon, { backgroundColor: isSelected ? `${primaryColor}20` : borderColor }]}>
                      <ThemedText style={styles.currencyIconText}>{currency.icon}</ThemedText>
                    </View>
                    <ThemedText style={[styles.currencySymbol, isSelected && { color: primaryColor }]}>
                      {currency.symbol}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Amount Input */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>AMOUNT (USD)</ThemedText>
          <View style={[styles.amountInputContainer, { backgroundColor: cardBg }]}>
            <ThemedText style={styles.dollarSign}>$</ThemedText>
            <TextInput
              style={[styles.amountInput, { color: textColor }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={mutedColor}
              keyboardType="decimal-pad"
            />
          </View>
          {numericAmount > 0 && numericAmount < 10 && (
            <ThemedText style={[styles.errorText, { color: '#ef4444' }]}>Minimum amount is $10</ThemedText>
          )}
        </View>

        {/* Quick Amount Buttons */}
        <View style={styles.quickAmounts}>
          {QUICK_AMOUNTS.map((value) => (
            <Pressable
              key={value}
              onPress={() => handleQuickAmount(value)}
              style={[
                styles.quickAmountButton,
                { backgroundColor: numericAmount === value ? `${primaryColor}15` : cardBg },
                numericAmount === value && { borderColor: primaryColor, borderWidth: 1 },
              ]}
            >
              <ThemedText style={[styles.quickAmountText, numericAmount === value && { color: primaryColor }]}>
                ${value}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Payment Methods Info */}
        <View style={[styles.paymentInfo, { backgroundColor: cardBg }]}>
          <ThemedText style={[styles.paymentInfoTitle, { color: mutedColor }]}>PAYMENT METHODS</ThemedText>
          <View style={styles.paymentMethods}>
            {Platform.OS === 'ios' && (
              <View style={styles.paymentMethod}>
                <Ionicons name="logo-apple" size={20} color={textColor} />
                <ThemedText style={styles.paymentMethodText}>Apple Pay</ThemedText>
              </View>
            )}
            {Platform.OS === 'android' && (
              <View style={styles.paymentMethod}>
                <Ionicons name="logo-google" size={20} color={textColor} />
                <ThemedText style={styles.paymentMethodText}>Google Pay</ThemedText>
              </View>
            )}
            <View style={styles.paymentMethod}>
              <Ionicons name="card" size={20} color={textColor} />
              <ThemedText style={styles.paymentMethodText}>Credit/Debit Card</ThemedText>
            </View>
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

      {/* Buy Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleBuy}
          disabled={!isValidAmount || isLoading || !isReady}
          style={[
            styles.buyButton,
            { backgroundColor: isValidAmount && isReady ? primaryColor : `${mutedColor}50` },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="flash" size={20} color="#fff" />
              <ThemedText style={styles.buyButtonText}>
                {isValidAmount
                    ? (isDepositMode ? `Deposit $${numericAmount} USDC` : `Buy $${numericAmount} of ${selectedCurrency.symbol}`)
                    : 'Enter amount'}
              </ThemedText>
            </>
          )}
        </Pressable>
        <ThemedText style={[styles.footerNote, { color: mutedColor }]}>
          Powered by MoonPay. Instant delivery to your wallet.
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
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dollarSign: {
    fontSize: 32,
    fontWeight: '300',
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '300',
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
  paymentInfo: {
    borderRadius: 14,
    padding: 16,
  },
  paymentInfoTitle: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 12,
  },
  paymentMethods: {
    gap: 12,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentMethodText: {
    fontSize: 14,
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
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  buyButtonText: {
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
