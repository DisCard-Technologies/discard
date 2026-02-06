/**
 * Deposit Screen
 *
 * Allows users to purchase crypto via MoonPay with Apple Pay, Google Pay, or card.
 * Supports pre-selecting a token from token-detail or defaults to USDC.
 */
import { useState, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator, Dimensions, Image } from 'react-native';
import { PressableScale } from 'pressto';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/stores/authConvex';
import { useMoonPay } from '@/hooks/useMoonPay';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Supported currencies for purchase with prices
const CURRENCIES = [
  {
    code: 'usdc_sol',
    name: 'Digital Dollars',
    symbol: 'USDC',
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    network: 'solana',
    price: 1,
  },
  {
    code: 'sol',
    name: 'Solana',
    symbol: 'SOL',
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    network: 'solana',
    price: 178.55,
  },
  {
    code: 'jup',
    name: 'Jupiter',
    symbol: 'JUP',
    logoUri: 'https://static.jup.ag/jup/icon.png',
    network: 'solana',
    price: 0.89,
  },
  {
    code: 'bonk',
    name: 'Bonk',
    symbol: 'BONK',
    logoUri: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    network: 'solana',
    price: 0,
  },
];

// Helper to get wallet address based on currency network
function getWalletAddress(
  currency: typeof CURRENCIES[number],
  solanaAddress?: string | null,
  ethereumAddress?: string | null
): string | null {
  if (currency.network === 'solana') {
    return solanaAddress || null;
  }
  return ethereumAddress || null;
}

// Quick amount buttons
const QUICK_AMOUNTS = [25, 50, 100, 250, 500];

// Number pad keys
const NUMBER_PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'delete'];

export default function BuyCryptoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ currency?: string; amount?: string; mode?: string }>();

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f5f5f5', dark: '#1c1c1e' }, 'background');

  // Deposit mode locks to USDC only
  const isDepositMode = params.mode === 'deposit';

  // User wallet addresses (both Solana and Ethereum)
  const { user } = useAuth();
  const solanaAddress = user?.solanaAddress || null;
  const ethereumAddress = user?.ethereumAddress || null;

  // Selected currency (default to USDC or from params)
  const paramCurrency = params.currency?.toLowerCase();
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    // Try to match param currency (support both 'sol' and 'usdc' shortcuts)
    if (paramCurrency === 'sol') {
      return CURRENCIES.find((c) => c.code === 'sol') || CURRENCIES[0];
    }
    // Default to USDC (first in array)
    return CURRENCIES[0];
  });

  // Dropdown state
  const [showDropdown, setShowDropdown] = useState(false);

  // Get the appropriate wallet address for selected currency
  const walletAddress = getWalletAddress(selectedCurrency, solanaAddress, ethereumAddress);

  // Amount input
  const [amount, setAmount] = useState(params.amount || '');
  const numericAmount = parseFloat(amount) || 0;

  // MoonPay hook - pass both addresses, it will use the right one
  const { openBuy, isReady, isLoading, error } = useMoonPay({
    solanaAddress,
    ethereumAddress,
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
      // After browser closes, navigate to home so user sees deposit card in transaction stack
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Buy failed:', err);
    }
  }, [openBuy, selectedCurrency, numericAmount]);

  // Set quick amount
  const handleQuickAmount = (value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAmount(value.toString());
  };

  // Number pad handlers
  const handleNumberPress = useCallback((num: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (num === '.' && amount.includes('.')) return;
    if (amount === '0' && num !== '.') {
      setAmount(num);
    } else if (amount === '' && num === '.') {
      setAmount('0.');
    } else {
      setAmount(amount + num);
    }
  }, [amount]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (amount.length > 1) {
      setAmount(amount.slice(0, -1));
    } else {
      setAmount('');
    }
  }, [amount]);

  const handleSelectCurrency = useCallback((currency: typeof CURRENCIES[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCurrency(currency);
    setShowDropdown(false);
  }, []);

  const isValidAmount = numericAmount >= 10;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <PressableScale onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={textColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>Deposit</ThemedText>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {/* Dropdown Backdrop */}
        {showDropdown && (
          <PressableScale
            style={styles.dropdownBackdrop}
            onPress={() => setShowDropdown(false)}
          />
        )}

        {/* Currency Selector Dropdown */}
        {!isDepositMode && (
          <View style={[styles.section, showDropdown && styles.sectionElevated]}>
            <ThemedText style={[styles.sectionLabel, { color: textColor }]}>YOU'RE BUYING</ThemedText>
            <View style={[
              styles.dropdownContainer,
              { backgroundColor: cardBg },
              showDropdown && styles.dropdownContainerOpen,
            ]}>
              <PressableScale
                onPress={() => setShowDropdown(!showDropdown)}
                style={styles.dropdownHeader}
              >
                <View style={styles.dropdownLeft}>
                  <View style={[styles.currencyIconContainer, { backgroundColor: '#e6f4ea' }]}>
                    <Image
                      source={{ uri: selectedCurrency.logoUri }}
                      style={styles.currencyLogo}
                    />
                  </View>
                  <View style={styles.currencyInfo}>
                    <ThemedText style={styles.currencySymbol}>{selectedCurrency.symbol}</ThemedText>
                    <ThemedText style={[styles.currencyName, { color: mutedColor }]}>
                      {selectedCurrency.name}
                    </ThemedText>
                  </View>
                </View>
                <Ionicons
                  name={showDropdown ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={mutedColor}
                />
              </PressableScale>

              {/* Dropdown Items */}
              {showDropdown && (
                <Animated.View
                  entering={FadeIn.duration(150)}
                  exiting={FadeOut.duration(100)}
                  style={[styles.dropdownList, { backgroundColor: cardBg }]}
                >
                  {CURRENCIES.filter(c => c.code !== selectedCurrency.code).map((currency) => (
                    <PressableScale
                      key={currency.code}
                      onPress={() => handleSelectCurrency(currency)}
                      style={[
                        styles.dropdownItem]}
                    >
                      <View style={styles.dropdownLeft}>
                        <View style={styles.currencyIconSmall}>
                          <Image
                            source={{ uri: currency.logoUri }}
                            style={styles.currencyLogoSmall}
                          />
                        </View>
                        <ThemedText style={styles.dropdownItemText}>{currency.symbol}</ThemedText>
                      </View>
                    </PressableScale>
                  ))}
                </Animated.View>
              )}
            </View>
          </View>
        )}

        {/* Amount Input */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: textColor }]}>AMOUNT IN USD</ThemedText>
          <View style={[styles.amountInputContainer, { backgroundColor: cardBg }]}>
            <ThemedText style={[styles.dollarSign, { color: mutedColor }]}>$</ThemedText>
            <ThemedText style={[styles.amountDisplay, { color: amount ? textColor : mutedColor }]}>
              {amount || '0.00'}
            </ThemedText>
          </View>
          {numericAmount > 0 && numericAmount < 10 && (
            <ThemedText style={styles.errorText}>Minimum amount is $10</ThemedText>
          )}
        </View>

        {/* Quick Amount Pills */}
        <View style={styles.quickAmounts}>
          {QUICK_AMOUNTS.map((value) => (
            <PressableScale
              key={value}
              onPress={() => handleQuickAmount(value)}
              style={[
                styles.quickAmountPill,
                { backgroundColor: numericAmount === value ? `${primaryColor}15` : cardBg },
                numericAmount === value && { borderColor: primaryColor, borderWidth: 1 }]}
            >
              <ThemedText style={[styles.quickAmountText, numericAmount === value && { color: primaryColor }]}>
                ${value}
              </ThemedText>
            </PressableScale>
          ))}
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <ThemedText style={styles.errorBannerText}>{error}</ThemedText>
          </View>
        )}
      </View>

      {/* Number Pad */}
      <View style={styles.numberPadContainer}>
        <View style={styles.numberPad}>
          {NUMBER_PAD_KEYS.map((key, index) => (
            <PressableScale
              key={index}
              onPress={() => {
                if (key === 'delete') handleDelete();
                else handleNumberPress(key);
              }}
              style={[
                styles.numberKey]}
            >
              {key === 'delete' ? (
                <Ionicons name="backspace-outline" size={24} color="#1C1C1E" />
              ) : (
                <ThemedText style={styles.numberKeyText}>{key}</ThemedText>
              )}
            </PressableScale>
          ))}
        </View>

        {/* Continue Button */}
        <PressableScale
          onPress={handleBuy}
          enabled={isValidAmount && !isLoading && isReady}
          style={[
            styles.continueButton,
            { backgroundColor: isValidAmount && isReady ? primaryColor : '#4A4A4D' }]}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.continueButtonText}>
              {isValidAmount ? 'Continue' : 'Enter amount'}
            </ThemedText>
          )}
        </PressableScale>
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
    marginBottom: 20,
    zIndex: 1,
  },
  sectionElevated: {
    zIndex: 100,
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  // Dropdown styles
  dropdownContainer: {
    borderRadius: 20,
  },
  dropdownContainerOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currencyIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  currencyInfo: {
    gap: 2,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
  },
  currencyName: {
    fontSize: 13,
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownItemPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  currencyIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  currencyLogoSmall: {
    width: 32,
    height: 32,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  // Amount input styles
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  dollarSign: {
    fontSize: 28,
    fontWeight: '300',
    marginRight: 8,
  },
  amountDisplay: {
    flex: 1,
    fontSize: 28,
    fontWeight: '300',
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    marginLeft: 4,
    color: '#ef4444',
  },
  // Quick amount pills
  quickAmounts: {
    flexDirection: 'row',
    gap: 6,
  },
  quickAmountPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 20,
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    marginTop: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  errorBannerText: {
    fontSize: 12,
    flex: 1,
    color: '#ef4444',
  },
  // Number pad styles
  numberPadContainer: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  numberPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  numberKey: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  numberKeyPressed: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
  },
  numberKeyText: {
    fontSize: 28,
    fontWeight: '400',
    color: '#1C1C1E',
  },
  continueButton: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
