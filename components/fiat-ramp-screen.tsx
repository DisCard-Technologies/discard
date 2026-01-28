import { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCryptoRates } from '@/hooks/useCryptoRatesConvex';

interface FiatRampScreenProps {
  mode: 'buy' | 'sell';
  token?: { symbol: string; name: string; icon: string; balance?: string; price?: number };
  onBack: () => void;
}

interface PaymentMethod {
  id: string;
  type: 'card' | 'bank' | 'apple';
  label: string;
  detail: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isDefault?: boolean;
}

// Payment methods are managed by MoonPay during checkout
// This is a placeholder to show where to add payment method
const defaultPaymentMethods: PaymentMethod[] = [];

const presetAmounts = [50, 100, 250, 500, 1000];

// Token icons for supported tokens
const TOKEN_ICONS: Record<string, string> = {
  ETH: '◇',
  BTC: '₿',
  SOL: '◎',
  USDC: '◈',
  USDT: '₮',
  XRP: '✕',
};

// Fallback token data when rates aren't loaded
const fallbackTokens = [
  { symbol: 'ETH', name: 'Ethereum', icon: '◇', price: 0 },
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', price: 0 },
  { symbol: 'SOL', name: 'Solana', icon: '◎', price: 0 },
  { symbol: 'USDC', name: 'USD Coin', icon: '◈', price: 1.0 },
];

export function FiatRampScreen({ mode, token: initialToken, onBack }: FiatRampScreenProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // Fetch real crypto rates
  const { rates: cryptoRates, isLoading: ratesLoading } = useCryptoRates({
    symbols: ['ETH', 'BTC', 'SOL', 'USDC'],
  });

  // Build tokens list from real rates or fallback
  const defaultTokens = useMemo(() => {
    if (cryptoRates && cryptoRates.length > 0) {
      return cryptoRates.map(rate => ({
        symbol: rate.symbol,
        name: rate.name,
        icon: TOKEN_ICONS[rate.symbol] || rate.symbol.charAt(0),
        price: parseFloat(rate.usdPrice) || 0,
      }));
    }
    return fallbackTokens;
  }, [cryptoRates]);

  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(initialToken || defaultTokens[0]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [showTokenSelect, setShowTokenSelect] = useState(false);
  const [showMethodSelect, setShowMethodSelect] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [complete, setComplete] = useState(false);

  const tokenSelectRotation = useSharedValue(0);
  const methodSelectRotation = useSharedValue(0);

  const numAmount = parseFloat(amount) || 0;
  const tokenAmount = numAmount / (selectedToken.price || 1);
  const fee = numAmount * 0.015; // 1.5% fee
  const total = mode === 'buy' ? numAmount + fee : numAmount - fee;

  const handleSubmit = () => {
    if (numAmount < 10) return;
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setComplete(true);
    }, 2500);
  };

  const toggleTokenSelect = () => {
    setShowTokenSelect(!showTokenSelect);
    tokenSelectRotation.value = withTiming(showTokenSelect ? 0 : 180, { duration: 200 });
  };

  const toggleMethodSelect = () => {
    setShowMethodSelect(!showMethodSelect);
    methodSelectRotation.value = withTiming(showMethodSelect ? 0 : 180, { duration: 200 });
  };

  const tokenChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tokenSelectRotation.value}deg` }],
  }));

  const methodChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${methodSelectRotation.value}deg` }],
  }));

  // Completion Screen
  if (complete) {
    return (
      <ThemedView style={styles.container}>
        <View style={{ height: insets.top }} />
        <View style={styles.completeContainer}>
          <View style={[styles.completeIconContainer, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="checkmark" size={40} color={primaryColor} />
          </View>

          <ThemedText style={styles.completeTitle}>
            {mode === 'buy' ? 'Purchase Complete' : 'Cash Out Initiated'}
          </ThemedText>

          <ThemedText style={[styles.completeSubtitle, { color: mutedColor }]}>
            {mode === 'buy'
              ? `You purchased ${tokenAmount.toFixed(6)} ${selectedToken.symbol}`
              : `$${numAmount.toFixed(2)} is on its way to your account`}
          </ThemedText>

          <ThemedText style={[styles.completeNote, { color: mutedColor }]}>
            {mode === 'buy'
              ? 'Tokens added to your wallet instantly'
              : 'Typically arrives in 1-3 business days'}
          </ThemedText>

          {/* Summary Card */}
          <ThemedView style={styles.summaryCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>Amount</ThemedText>
              <ThemedText style={styles.summaryValue}>
                {mode === 'buy'
                  ? `${tokenAmount.toFixed(6)} ${selectedToken.symbol}`
                  : `$${numAmount.toFixed(2)}`}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>Fee</ThemedText>
              <ThemedText style={styles.summaryValue}>${fee.toFixed(2)}</ThemedText>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowTotal, { borderTopColor: borderColor }]}>
              <ThemedText style={styles.summaryLabelTotal}>
                Total {mode === 'buy' ? 'Paid' : 'Received'}
              </ThemedText>
              <ThemedText style={styles.summaryValueTotal}>${total.toFixed(2)}</ThemedText>
            </View>
          </ThemedView>

          <PressableScale
            onPress={onBack}
            style={[
              styles.doneButton,
              { backgroundColor: primaryColor },
            ]}
          >
            <ThemedText style={styles.doneButtonText}>Done</ThemedText>
          </PressableScale>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <PressableScale onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={textColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>
          {mode === 'buy' ? 'Buy Crypto' : 'Cash Out'}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Token Selector */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
            {mode === 'buy' ? "YOU'RE BUYING" : "YOU'RE SELLING"}
          </ThemedText>

          <PressableScale
            onPress={toggleTokenSelect}
            style={[styles.selectorButton, { backgroundColor: cardBg }]}
          >
            <View style={styles.selectorLeft}>
              <View style={[styles.tokenIcon, { backgroundColor: `${borderColor}` }]}>
                <ThemedText style={styles.tokenIconText}>{selectedToken.icon}</ThemedText>
              </View>
              <View>
                <ThemedText style={styles.tokenSymbol}>{selectedToken.symbol}</ThemedText>
                <ThemedText style={[styles.tokenName, { color: mutedColor }]}>
                  {selectedToken.name}
                </ThemedText>
              </View>
            </View>
            <View style={styles.selectorRight}>
              <ThemedText style={[styles.tokenPrice, { color: mutedColor }]}>
                ${selectedToken.price?.toLocaleString()}
              </ThemedText>
              <Animated.View style={tokenChevronStyle}>
                <Ionicons name="chevron-down" size={16} color={mutedColor} />
              </Animated.View>
            </View>
          </PressableScale>

          {showTokenSelect && (
            <ThemedView style={styles.dropdown} lightColor="#f4f4f5" darkColor="#1c1c1e">
              {defaultTokens.map((t) => (
                <PressableScale
                  key={t.symbol}
                  onPress={() => {
                    setSelectedToken(t);
                    toggleTokenSelect();
                  }}
                  style={[
                    styles.dropdownItem,
                    t.symbol === selectedToken.symbol && { backgroundColor: `${primaryColor}10` },
                  ]}
                >
                  <View style={styles.dropdownItemLeft}>
                    <View style={[styles.tokenIconSmall, { backgroundColor: `${borderColor}` }]}>
                      <ThemedText style={styles.tokenIconTextSmall}>{t.icon}</ThemedText>
                    </View>
                    <ThemedText style={styles.dropdownItemText}>{t.symbol}</ThemedText>
                  </View>
                  <ThemedText style={[styles.dropdownItemPrice, { color: mutedColor }]}>
                    ${t.price.toLocaleString()}
                  </ThemedText>
                </PressableScale>
              ))}
            </ThemedView>
          )}
        </View>

        {/* Amount Input */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>AMOUNT IN USD</ThemedText>

          <View style={[styles.amountInputContainer, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.currencySymbol, { color: mutedColor }]}>$</ThemedText>
            <TextInput
              value={amount}
              onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={`${mutedColor}80`}
              keyboardType="decimal-pad"
              style={[styles.amountInput, { color: textColor }]}
            />
          </View>

          {/* Preset Amounts */}
          <View style={styles.presetAmounts}>
            {presetAmounts.map((preset) => {
              const isSelected = amount === preset.toString();
              return (
                <PressableScale
                  key={preset}
                  onPress={() => setAmount(preset.toString())}
                  style={[
                    styles.presetButton,
                    {
                      backgroundColor: isSelected ? `${primaryColor}20` : `${borderColor}`,
                      borderColor: isSelected ? `${primaryColor}30` : 'transparent',
                      borderWidth: isSelected ? 1 : 0,
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.presetButtonText,
                      { color: isSelected ? primaryColor : mutedColor },
                    ]}
                  >
                    ${preset}
                  </ThemedText>
                </PressableScale>
              );
            })}
          </View>

          {numAmount > 0 && (
            <ThemedText style={[styles.conversionText, { color: mutedColor }]}>
              ≈ {tokenAmount.toFixed(6)} {selectedToken.symbol}
            </ThemedText>
          )}
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
            {mode === 'buy' ? 'PAY WITH' : 'RECEIVE TO'}
          </ThemedText>

          <PressableScale
            onPress={toggleMethodSelect}
            style={[styles.selectorButton, { backgroundColor: cardBg }]}
          >
            <View style={styles.selectorLeft}>
              <View style={[styles.methodIcon, { backgroundColor: `${primaryColor}10` }]}>
                <Ionicons name="shield-checkmark" size={20} color={primaryColor} />
              </View>
              <View>
                <ThemedText style={styles.methodLabel}>MoonPay Checkout</ThemedText>
                <ThemedText style={[styles.methodDetail, { color: mutedColor }]}>
                  Cards, bank, Apple Pay
                </ThemedText>
              </View>
            </View>
            <Animated.View style={methodChevronStyle}>
              <Ionicons name="chevron-down" size={16} color={mutedColor} />
            </Animated.View>
          </PressableScale>

          {showMethodSelect && (
            <ThemedView style={styles.dropdown} lightColor="#f4f4f5" darkColor="#1c1c1e">
              <View style={styles.moonpayNotice}>
                <View style={[styles.moonpayNoticeIcon, { backgroundColor: `${primaryColor}10` }]}>
                  <Ionicons name="shield-checkmark" size={20} color={primaryColor} />
                </View>
                <View style={styles.moonpayNoticeText}>
                  <ThemedText style={styles.moonpayNoticeTitle}>Secure Checkout</ThemedText>
                  <ThemedText style={[styles.moonpayNoticeDetail, { color: mutedColor }]}>
                    Payment methods are securely managed by MoonPay during checkout
                  </ThemedText>
                </View>
              </View>
            </ThemedView>
          )}
        </View>

        {/* Summary Card */}
        {numAmount > 0 && (
          <ThemedView style={styles.summaryCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
            <View style={styles.summaryHeader}>
              <View style={styles.summaryHeaderLeft}>
                <Ionicons name="flash" size={14} color={primaryColor} />
                <ThemedText style={[styles.summaryPoweredBy, { color: mutedColor }]}>
                  Powered by Moonpay
                </ThemedText>
              </View>
              <View style={styles.summarySecure}>
                <Ionicons name="shield-checkmark" size={12} color={primaryColor} />
                <ThemedText style={[styles.summarySecureText, { color: primaryColor }]}>
                  Secure
                </ThemedText>
              </View>
            </View>

            <View style={styles.summaryDetails}>
              <View style={styles.summaryRow}>
                <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>
                  {mode === 'buy' ? 'You pay' : 'You sell'}
                </ThemedText>
                <ThemedText style={styles.summaryValue}>
                  {mode === 'buy'
                    ? `$${numAmount.toFixed(2)}`
                    : `${tokenAmount.toFixed(6)} ${selectedToken.symbol}`}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>
                  Network fee
                </ThemedText>
                <ThemedText style={[styles.summaryValue, { color: mutedColor }]}>$0.00</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>
                  Processing fee (1.5%)
                </ThemedText>
                <ThemedText style={[styles.summaryValue, { color: mutedColor }]}>
                  ${fee.toFixed(2)}
                </ThemedText>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowTotal, { borderTopColor: borderColor }]}>
                <ThemedText style={styles.summaryLabelTotal}>
                  {mode === 'buy' ? 'You receive' : 'You get'}
                </ThemedText>
                <ThemedText style={[styles.summaryValueTotal, { color: primaryColor }]}>
                  {mode === 'buy'
                    ? `${tokenAmount.toFixed(6)} ${selectedToken.symbol}`
                    : `$${total.toFixed(2)}`}
                </ThemedText>
              </View>
            </View>
          </ThemedView>
        )}
      </ScrollView>

      {/* Submit Button */}
      <View style={[styles.submitContainer, { paddingBottom: insets.bottom + 16 }]}>
        <PressableScale
          onPress={handleSubmit}
          enabled={numAmount >= 10 && !processing}
          style={[
            styles.submitButton,
            { backgroundColor: primaryColor },
            (numAmount < 10 || processing) && styles.submitButtonDisabled,
          ]}
        >
          {processing ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <ThemedText style={styles.submitButtonText}>Processing...</ThemedText>
            </>
          ) : (
            <>
              <ThemedText style={styles.submitButtonText}>
                {mode === 'buy' ? 'Buy' : 'Cash Out'} {selectedToken.symbol}
              </ThemedText>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </PressableScale>

        {numAmount > 0 && numAmount < 10 && (
          <ThemedText style={styles.minAmountWarning}>Minimum amount is $10</ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 140,
    gap: 20,
  },
  // Section
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  // Token Selector
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
  },
  selectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconText: {
    fontSize: 18,
  },
  tokenIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconTextSmall: {
    fontSize: 14,
  },
  tokenSymbol: {
    fontSize: 15,
    fontWeight: '500',
  },
  tokenName: {
    fontSize: 12,
    marginTop: 2,
  },
  tokenPrice: {
    fontSize: 13,
  },
  // Dropdown
  dropdown: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dropdownItemPrice: {
    fontSize: 12,
  },
  // Amount Input
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  currencySymbol: {
    fontSize: 24,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
  },
  presetAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  presetButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  conversionText: {
    fontSize: 13,
    marginTop: 12,
  },
  // Payment Method
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  methodDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  dropdownMethodLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  dropdownMethodDetail: {
    fontSize: 10,
    marginTop: 1,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  addMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  addMethodIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMethodPlus: {
    fontSize: 18,
  },
  addMethodText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Summary Card
  summaryCard: {
    padding: 16,
    borderRadius: 14,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryPoweredBy: {
    fontSize: 11,
  },
  summarySecure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summarySecureText: {
    fontSize: 10,
  },
  summaryDetails: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryRowTotal: {
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryLabelTotal: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryValueTotal: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Submit Button
  submitContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 24,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  minAmountWarning: {
    fontSize: 12,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 8,
  },
  // Complete Screen
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  completeIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  completeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  completeNote: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 32,
  },
  doneButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // MoonPay notice styles
  moonpayNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  moonpayNoticeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moonpayNoticeText: {
    flex: 1,
  },
  moonpayNoticeTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  moonpayNoticeDetail: {
    fontSize: 12,
  },
});

