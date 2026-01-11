import { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, Pressable, TextInput, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { useCrossCurrencyTransfer } from '@/hooks/useCrossCurrencyTransfer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Token type for display
interface DisplayToken {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  balance: number;
  balanceFormatted: string;
  valueUsd: number;
  priceUsd: number;
  logoUri?: string;
}

export default function SwapScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Theme colors
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');

  // Auth and wallet
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Token holdings
  const { holdings, isLoading: tokensLoading } = useTokenHoldings(walletAddress);

  // State
  const [fromToken, setFromToken] = useState<DisplayToken | null>(null);
  const [toToken, setToToken] = useState<DisplayToken | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [showToSelector, setShowToSelector] = useState(false);
  const [slippage, setSlippage] = useState(3.0); // 3%

  // Available tokens for selection
  const availableTokens = useMemo((): DisplayToken[] => {
    if (!holdings) return [];
    return holdings.map(h => ({
      symbol: h.symbol,
      name: h.name,
      mint: h.mint,
      decimals: h.decimals,
      balance: parseFloat(h.balance) / Math.pow(10, h.decimals),
      balanceFormatted: h.balanceFormatted.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
      valueUsd: h.valueUsd,
      priceUsd: h.priceUsd,
      logoUri: h.logoUri,
    }));
  }, [holdings]);

  // Set default tokens when holdings load
  useEffect(() => {
    if (availableTokens.length > 0 && !fromToken) {
      // Default from token: SOL or first available
      const sol = availableTokens.find(t => t.symbol === 'SOL');
      setFromToken(sol || availableTokens[0]);
      
      // Default to token: USDC or second available
      const usdc = availableTokens.find(t => t.symbol === 'USDC');
      const defaultTo = usdc || availableTokens.find(t => t.symbol !== (sol?.symbol || availableTokens[0]?.symbol));
      if (defaultTo) setToToken(defaultTo);
    }
  }, [availableTokens, fromToken]);

  // Calculate input amount in base units
  const fromAmountBaseUnits = useMemo(() => {
    if (!fromAmount || !fromToken) return undefined;
    const parsed = parseFloat(fromAmount);
    if (isNaN(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed * Math.pow(10, fromToken.decimals)).toString();
  }, [fromAmount, fromToken]);

  // Cross-currency quote
  const {
    needsSwap,
    isLoadingQuote,
    estimatedReceivedFormatted,
    swapQuote,
  } = useCrossCurrencyTransfer({
    paymentMint: fromToken?.mint,
    paymentAmount: fromAmountBaseUnits,
    debounceMs: 500,
  });

  // Calculate USD value of input
  const fromAmountUsd = useMemo(() => {
    if (!fromAmount || !fromToken) return 0;
    const parsed = parseFloat(fromAmount);
    if (isNaN(parsed)) return 0;
    return parsed * fromToken.priceUsd;
  }, [fromAmount, fromToken]);

  // Calculate output amount
  const toAmount = useMemo(() => {
    if (!swapQuote || !toToken) return '';
    const outputNum = parseInt(swapQuote.outputAmount) / Math.pow(10, toToken.decimals);
    return outputNum.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }, [swapQuote, toToken]);

  // Calculate rate
  const swapRate = useMemo(() => {
    if (!swapQuote || !fromToken || !toToken) return null;
    const inputNum = parseInt(swapQuote.inputAmount) / Math.pow(10, fromToken.decimals);
    const outputNum = parseInt(swapQuote.outputAmount) / Math.pow(10, toToken.decimals);
    const rate = outputNum / inputNum;
    return {
      rate: rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
      fromSymbol: fromToken.symbol,
      toSymbol: toToken.symbol,
    };
  }, [swapQuote, fromToken, toToken]);

  // Calculate estimated output USD
  const toAmountUsd = useMemo(() => {
    if (!swapQuote || !toToken) return 0;
    const outputNum = parseInt(swapQuote.outputAmount) / Math.pow(10, toToken.decimals);
    return outputNum * toToken.priceUsd;
  }, [swapQuote, toToken]);

  // Calculate price change percentage
  const priceChangePercent = useMemo(() => {
    if (fromAmountUsd === 0 || toAmountUsd === 0) return 0;
    return ((toAmountUsd - fromAmountUsd) / fromAmountUsd) * 100;
  }, [fromAmountUsd, toAmountUsd]);

  // Handlers
  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleMaxPress = useCallback(() => {
    if (fromToken) {
      setFromAmount(fromToken.balance.toString());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [fromToken]);

  const handleSwapTokens = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount('');
  }, [fromToken, toToken]);

  const handleSelectFromToken = useCallback((token: DisplayToken) => {
    setFromToken(token);
    setShowFromSelector(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSelectToToken = useCallback((token: DisplayToken) => {
    setToToken(token);
    setShowToSelector(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleContinue = useCallback(() => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      return;
    }

    // Navigate to confirmation or execute swap
    // For now, just log and show success
    console.log('[Swap] Executing swap:', {
      from: fromToken.symbol,
      to: toToken.symbol,
      amount: fromAmount,
      quote: swapQuote,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }, [fromToken, toToken, fromAmount, swapQuote]);

  const canContinue = fromToken && toToken && fromAmount && parseFloat(fromAmount) > 0 && !isLoadingQuote && swapQuote;

  // Estimated network fee (simplified)
  const networkFee = useMemo(() => {
    // Approximate SOL transaction fee
    return {
      amount: '0.00015',
      symbol: 'SOL',
      usd: 0.03,
    };
  }, []);

  // Token selector modal
  const renderTokenSelector = (
    visible: boolean,
    onClose: () => void,
    onSelect: (token: DisplayToken) => void,
    excludeToken?: DisplayToken | null
  ) => {
    if (!visible) return null;

    const tokens = excludeToken
      ? availableTokens.filter(t => t.mint !== excludeToken.mint)
      : availableTokens;

    return (
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.tokenModal, { backgroundColor: cardColor }]}
        >
          <ThemedText style={styles.tokenModalTitle}>Select Token</ThemedText>
          <ScrollView style={styles.tokenList}>
            {tokens.map((token) => (
              <Pressable
                key={token.mint}
                onPress={() => onSelect(token)}
                style={({ pressed }) => [
                  styles.tokenItem,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.tokenItemLeft}>
                  <View style={[styles.tokenIcon, { backgroundColor: primaryColor }]}>
                    <ThemedText style={styles.tokenIconText}>
                      {token.symbol.charAt(0)}
                    </ThemedText>
                  </View>
                  <View>
                    <ThemedText style={styles.tokenItemSymbol}>{token.symbol}</ThemedText>
                    <ThemedText style={[styles.tokenItemName, { color: mutedColor }]}>
                      {token.name}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.tokenItemRight}>
                  <ThemedText style={styles.tokenItemBalance}>
                    {token.balanceFormatted}
                  </ThemedText>
                  <ThemedText style={[styles.tokenItemValue, { color: mutedColor }]}>
                    ${token.valueUsd.toFixed(2)}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Swap</ThemedText>
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <Ionicons name="settings-outline" size={24} color={textColor} />
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* From Token Section */}
        <View style={[styles.tokenSection, { backgroundColor: cardColor }]}>
          <View style={styles.tokenHeader}>
            <View style={styles.networkBadge}>
              <ThemedText style={[styles.networkLabel, { color: mutedColor }]}>
                From: Solana
              </ThemedText>
            </View>
            <View style={styles.balanceContainer}>
              <ThemedText style={[styles.balanceLabel, { color: mutedColor }]}>
                ◎ {fromToken?.balanceFormatted || '0'}
              </ThemedText>
              <Pressable onPress={handleMaxPress}>
                <ThemedText style={[styles.maxButton, { color: primaryColor }]}>Max</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.tokenInputRow}>
            <Pressable
              onPress={() => setShowFromSelector(true)}
              style={[styles.tokenSelector, { borderColor }]}
            >
              {fromToken && (
                <View style={[styles.tokenBadge, { backgroundColor: primaryColor }]}>
                  <ThemedText style={styles.tokenBadgeText}>
                    {fromToken.symbol.charAt(0)}
                  </ThemedText>
                </View>
              )}
              <ThemedText style={styles.tokenSymbol}>
                {fromToken?.symbol || 'Select'}
              </ThemedText>
              <Ionicons name="chevron-down" size={16} color={mutedColor} />
            </Pressable>

            <View style={styles.amountContainer}>
              <TextInput
                style={[styles.amountInput, { color: textColor }]}
                value={fromAmount}
                onChangeText={setFromAmount}
                placeholder="0"
                placeholderTextColor={mutedColor}
                keyboardType="decimal-pad"
              />
              <ThemedText style={[styles.amountUsd, { color: mutedColor }]}>
                ${fromAmountUsd.toFixed(2)}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Swap Direction Button */}
        <View style={styles.swapButtonContainer}>
          <Pressable
            onPress={handleSwapTokens}
            style={({ pressed }) => [
              styles.swapButton,
              { backgroundColor: primaryColor },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="swap-vertical" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* To Token Section */}
        <View style={[styles.tokenSection, { backgroundColor: cardColor }]}>
          <View style={styles.tokenHeader}>
            <View style={styles.networkBadge}>
              <ThemedText style={[styles.networkLabel, { color: mutedColor }]}>
                To: Solana
              </ThemedText>
            </View>
          </View>

          <View style={styles.tokenInputRow}>
            <Pressable
              onPress={() => setShowToSelector(true)}
              style={[styles.tokenSelector, { borderColor }]}
            >
              {toToken && (
                <View style={[styles.tokenBadge, { backgroundColor: '#8B5CF6' }]}>
                  <ThemedText style={styles.tokenBadgeText}>
                    {toToken.symbol.charAt(0)}
                  </ThemedText>
                </View>
              )}
              <ThemedText style={styles.tokenSymbol}>
                {toToken?.symbol || 'Select'}
              </ThemedText>
              <Ionicons name="chevron-down" size={16} color={mutedColor} />
            </Pressable>

            <View style={styles.amountContainer}>
              {isLoadingQuote ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <ThemedText style={styles.outputAmount}>
                  {toAmount || '0'}
                </ThemedText>
              )}
              <View style={styles.outputUsdRow}>
                <ThemedText style={[styles.amountUsd, { color: mutedColor }]}>
                  ${toAmountUsd.toFixed(2)}
                </ThemedText>
                {priceChangePercent !== 0 && (
                  <ThemedText
                    style={[
                      styles.priceChange,
                      { color: priceChangePercent < 0 ? '#EF4444' : '#10B981' },
                    ]}
                  >
                    {priceChangePercent > 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                  </ThemedText>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Rate Display */}
        {swapRate && (
          <View style={[styles.infoRow, { borderColor }]}>
            <View style={styles.infoLabel}>
              <ThemedText style={[styles.infoLabelText, { color: mutedColor }]}>Rate</ThemedText>
              <Ionicons name="information-circle-outline" size={16} color={mutedColor} />
            </View>
            <View style={styles.infoValue}>
              <ThemedText style={styles.infoValueText}>
                1 {swapRate.fromSymbol} = {swapRate.rate} {swapRate.toSymbol}
              </ThemedText>
              <Ionicons name="refresh-outline" size={14} color={mutedColor} />
            </View>
          </View>
        )}

        {/* Provider */}
        <View style={[styles.infoRow, { borderColor }]}>
          <View style={styles.infoLabel}>
            <ThemedText style={[styles.infoLabelText, { color: mutedColor }]}>Provider</ThemedText>
            <Ionicons name="information-circle-outline" size={16} color={mutedColor} />
          </View>
          <View style={styles.infoValue}>
            <View style={[styles.providerBadge, { backgroundColor: `${primaryColor}20` }]}>
              <ThemedText style={[styles.providerText, { color: primaryColor }]}>Jupiter</ThemedText>
            </View>
            <ThemedText style={[styles.providerPlus, { color: mutedColor }]}>+2</ThemedText>
          </View>
        </View>

        {/* Slippage Tolerance */}
        <View style={[styles.infoRow, { borderColor }]}>
          <View style={styles.infoLabel}>
            <ThemedText style={[styles.infoLabelText, { color: mutedColor }]}>
              Slippage Tolerance
            </ThemedText>
            <Ionicons name="information-circle-outline" size={16} color={mutedColor} />
          </View>
          <ThemedText style={styles.infoValueText}>{slippage}%</ThemedText>
        </View>

        {/* Network Fee */}
        <View style={[styles.infoRow, { borderColor }]}>
          <View style={styles.infoLabel}>
            <ThemedText style={[styles.infoLabelText, { color: mutedColor }]}>
              Network Fee: Fast
            </ThemedText>
            <Ionicons name="flash" size={16} color="#F59E0B" />
          </View>
          <ThemedText style={styles.infoValueText}>
            {networkFee.amount} {networkFee.symbol} (${networkFee.usd.toFixed(2)})
          </ThemedText>
        </View>
      </ScrollView>

      {/* Continue Button */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.continueButton,
            { backgroundColor: canContinue ? primaryColor : `${primaryColor}50` },
            pressed && canContinue && styles.pressed,
          ]}
        >
          <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
        </Pressable>
      </View>

      {/* Token Selectors */}
      {renderTokenSelector(
        showFromSelector,
        () => setShowFromSelector(false),
        handleSelectFromToken,
        toToken
      )}
      {renderTokenSelector(
        showToSelector,
        () => setShowToSelector(false),
        handleSelectToToken,
        fromToken
      )}
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tokenSection: {
    borderRadius: 16,
    padding: 16,
  },
  tokenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  networkLabel: {
    fontSize: 13,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: {
    fontSize: 13,
  },
  maxButton: {
    fontSize: 13,
    fontWeight: '600',
  },
  tokenInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  tokenBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  amountInput: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'right',
    minWidth: 100,
  },
  amountUsd: {
    fontSize: 14,
    marginTop: 2,
  },
  outputAmount: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'right',
  },
  outputUsdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  priceChange: {
    fontSize: 12,
    fontWeight: '500',
  },
  swapButtonContainer: {
    alignItems: 'center',
    marginVertical: -12,
    zIndex: 10,
  },
  swapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    marginHorizontal: 4,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoLabelText: {
    fontSize: 14,
  },
  infoValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoValueText: {
    fontSize: 14,
    fontWeight: '500',
  },
  providerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  providerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  providerPlus: {
    fontSize: 13,
  },
  bottomContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  continueButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tokenModal: {
    width: '100%',
    maxHeight: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  tokenModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  tokenList: {
    maxHeight: 400,
  },
  tokenItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  tokenItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tokenItemSymbol: {
    fontSize: 16,
    fontWeight: '600',
  },
  tokenItemName: {
    fontSize: 13,
    marginTop: 2,
  },
  tokenItemRight: {
    alignItems: 'flex-end',
  },
  tokenItemBalance: {
    fontSize: 16,
    fontWeight: '500',
  },
  tokenItemValue: {
    fontSize: 13,
    marginTop: 2,
  },
});
