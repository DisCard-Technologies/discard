import { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, Pressable, TextInput, ScrollView, ActivityIndicator, Dimensions, Alert } from 'react-native';
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
import { usePrivacySwap, type PrivacyProvider, type Chain } from '@/hooks/usePrivacySwap';
import { useTurnkeySigner } from '@/hooks/useTurnkeySigner';
import { DFlowSwapClient } from '@/services/dflowSwapClient';
import { Connection, Transaction, PublicKey } from '@solana/web3.js';

// Swap client instance
const dflowClient = new DFlowSwapClient({ debug: __DEV__ });
const RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const IS_DEVNET = RPC_URL.includes('devnet');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Popular tokens available for swapping (shown even if not held)
const SWAPPABLE_TOKENS: Array<{
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logoUri?: string;
}> = IS_DEVNET ? [
  // Devnet tokens
  { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  { symbol: 'USDC', name: 'USD Coin (Devnet)', mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6 },
  { symbol: 'USDT', name: 'Tether USD (Devnet)', mint: 'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS', decimals: 6 },
] : [
  // Mainnet tokens
  { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  { symbol: 'USDT', name: 'Tether USD', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  { symbol: 'BONK', name: 'Bonk', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  { symbol: 'JUP', name: 'Jupiter', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
  { symbol: 'WIF', name: 'dogwifhat', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6 },
];

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
  const { user, userId } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Turnkey signer for transaction signing
  const {
    isReady: signerReady,
    isSigning,
    signTransaction,
    error: signerError,
  } = useTurnkeySigner(userId || undefined);

  // Token holdings
  const { holdings, isLoading: tokensLoading } = useTokenHoldings(walletAddress);

  // State
  const [fromToken, setFromToken] = useState<DisplayToken | null>(null);
  const [toToken, setToToken] = useState<DisplayToken | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [showToSelector, setShowToSelector] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [slippage, setSlippage] = useState(3.0); // 3%
  const [usePrivateMode, setUsePrivateMode] = useState(true); // Privacy by default

  // Privacy swap hook (unified Anoncoin + SilentSwap)
  const {
    state: privacySwapState,
    isLoading: privacySwapLoading,
    activeProvider,
    availableProviders,
    setActiveProvider,
    canSwitchProvider,
    isAnyProviderAvailable,
    isCrossChain,
    sourceChain,
    setSourceChain,
    destChain,
    setDestChain,
    supportedChains,
    getChainName,
    getProviderName,
    quickSwap: executePrivacySwap,
    getQuote,
    getPrivacyLevel,
    formatCrossChainInfo,
  } = usePrivacySwap();

  // Chain selector state
  const [showFromChainSelector, setShowFromChainSelector] = useState(false);
  const [showToChainSelector, setShowToChainSelector] = useState(false);

  // Available tokens for selection (merge held tokens with swappable list)
  const availableTokens = useMemo((): DisplayToken[] => {
    // Start with held tokens
    const heldTokens: DisplayToken[] = (holdings || []).map(h => ({
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

    // Get mints of held tokens
    const heldMints = new Set(heldTokens.map(t => t.mint));

    // Add swappable tokens that user doesn't hold
    const additionalTokens: DisplayToken[] = SWAPPABLE_TOKENS
      .filter(t => !heldMints.has(t.mint))
      .map(t => ({
        symbol: t.symbol,
        name: t.name,
        mint: t.mint,
        decimals: t.decimals,
        balance: 0,
        balanceFormatted: '0',
        valueUsd: 0,
        priceUsd: 0,
        logoUri: t.logoUri,
      }));

    return [...heldTokens, ...additionalTokens];
  }, [holdings]);

  // Set default tokens when holdings load
  useEffect(() => {
    if (availableTokens.length > 0 && !fromToken) {
      // Default from token: SOL (if held) or first held token
      const heldTokens = availableTokens.filter(t => t.balance > 0);
      const sol = heldTokens.find(t => t.symbol === 'SOL');
      const defaultFrom = sol || heldTokens[0] || availableTokens[0];
      setFromToken(defaultFrom);

      // Default to token: USDC (even if not held)
      const usdc = availableTokens.find(t => t.symbol === 'USDC');
      const defaultTo = usdc || availableTokens.find(t => t.mint !== defaultFrom?.mint);
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

  const handleContinue = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0 || !walletAddress) {
      return;
    }

    // Check if Turnkey signer is ready
    if (!signerReady) {
      console.warn('[Swap] Turnkey signer not ready:', signerError);
      Alert.alert(
        'Wallet Not Ready',
        signerError || 'Please ensure your wallet is properly initialized.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      // Use privacy swap if available and private mode enabled
      if (usePrivateMode && isAnyProviderAvailable) {
        console.log('[Swap] Executing privacy swap with Turnkey signer:', {
          from: fromToken.symbol,
          to: toToken.symbol,
          amount: fromAmount,
          privateMode: true,
          provider: activeProvider,
          isCrossChain,
        });

        // Convert to base units
        const amountBaseUnits = BigInt(Math.floor(parseFloat(fromAmount) * Math.pow(10, fromToken.decimals)));

        // Get quote first
        const quote = await getQuote(
          fromToken.mint,
          toToken.mint,
          amountBaseUnits,
          walletAddress,
          true // useStealthOutput
        );

        if (!quote) {
          console.error('[Swap] Failed to get quote');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('Quote Failed', 'Failed to get swap quote. Please try again.');
          return;
        }

        // Sign the swap transaction via Turnkey
        // The anoncoin service will prepare the transaction, and we sign it
        const encryptedTx = 'encryptedTransaction' in quote ? quote.encryptedTransaction : '';
        const signResult = await signTransaction({
          unsignedTransaction: encryptedTx || '',
        });

        if (!signResult.success) {
          console.error('[Swap] Transaction signing failed:', signResult.error);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('Signing Failed', signResult.error || 'Failed to sign transaction.');
          return;
        }

        // Execute the swap with the signed transaction
        // For now, we'll use a placeholder that works with the privacy swap service
        // The service will handle the actual on-chain submission
        const walletAdapter = {
          signTransaction: signTransaction,
          signMessage: async (msg: Uint8Array) => msg, // Placeholder
        };
        const result = await executePrivacySwap(
          fromToken.mint,
          toToken.mint,
          amountBaseUnits,
          walletAddress,
          walletAdapter,
          true // useStealthOutput
        );

        if (result?.success) {
          const privacyLevel = getPrivacyLevel(result);
          const providerName = getProviderName(activeProvider);
          console.log('[Swap] Privacy swap completed:', {
            signature: result.signature,
            privacyLevel,
            provider: providerName,
            metrics: result.privacyMetrics,
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            'Swap Successful',
            `Swapped ${fromAmount} ${fromToken.symbol} for ${toToken.symbol}\n\nProvider: ${providerName}\nPrivacy Level: ${privacyLevel.toUpperCase()}${isCrossChain ? '\nCross-chain: Yes' : ''}`,
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        } else {
          console.error('[Swap] Privacy swap failed:', result?.error);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('Swap Failed', result?.error || 'Unknown error occurred.');
        }
      } else {
        // Standard swap via DFlow/Jupiter (less private but on-chain)
        console.log('[Swap] Executing standard swap:', {
          from: fromToken.symbol,
          to: toToken.symbol,
          amount: fromAmount,
          quote: swapQuote,
        });

        try {
          // Get fresh quote and swap instructions
          const swapAmountBaseUnits = BigInt(Math.floor(parseFloat(fromAmount) * Math.pow(10, fromToken.decimals)));
          const { quote, instructions } = await dflowClient.buildSwapAndTransfer({
            inputMint: fromToken.mint,
            outputMint: toToken.mint,
            inputAmount: swapAmountBaseUnits.toString(),
            recipientAddress: walletAddress!, // Swap to self
            userPublicKey: walletAddress!,
            slippageBps: Math.round(slippage * 100), // Convert percentage to bps
          });

          console.log('[Swap] Got swap instructions, building transaction...');

          // Build transaction
          const connection = new Connection(RPC_URL, 'confirmed');
          const transaction = new Transaction();

          // Add setup instructions (create ATAs, etc.)
          for (const ix of instructions.setupInstructions) {
            transaction.add(ix);
          }

          // Add main swap instruction
          transaction.add(instructions.swapInstruction);

          // Add cleanup instructions
          for (const ix of instructions.cleanupInstructions) {
            transaction.add(ix);
          }

          // Get recent blockhash
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash;
          transaction.lastValidBlockHeight = lastValidBlockHeight;
          transaction.feePayer = new PublicKey(walletAddress!);

          console.log('[Swap] Signing transaction with Turnkey...');

          // Sign with Turnkey
          const signedTx = await signTransaction(transaction);

          if (!signedTx) {
            throw new Error('Failed to sign transaction');
          }

          console.log('[Swap] Submitting transaction to Solana...');

          // Submit to network
          const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          console.log('[Swap] Transaction submitted:', txSignature);

          // Wait for confirmation
          await connection.confirmTransaction({
            signature: txSignature,
            blockhash,
            lastValidBlockHeight,
          }, 'confirmed');

          console.log('[Swap] Swap completed:', txSignature);

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            'Swap Successful',
            `Swapped ${fromAmount} ${fromToken.symbol} for ~${(parseInt(quote.outputAmount) / Math.pow(10, toToken.decimals)).toFixed(4)} ${toToken.symbol}\n\nTransaction: ${txSignature.slice(0, 8)}...`,
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        } catch (swapError) {
          console.error('[Swap] Standard swap failed:', swapError);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            'Swap Failed',
            swapError instanceof Error ? swapError.message : 'An error occurred during swap'
          );
          return;
        }
      }

      router.back();
    } catch (error) {
      console.error('[Swap] Swap failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Swap Error', error instanceof Error ? error.message : 'An error occurred');
    }
  }, [fromToken, toToken, fromAmount, swapQuote, walletAddress, usePrivateMode, isAnyProviderAvailable, executePrivacySwap, getPrivacyLevel, signerReady, signerError, signTransaction, getQuote, activeProvider, isCrossChain, getProviderName]);

  const canContinue = fromToken && toToken && fromAmount && parseFloat(fromAmount) > 0 && !isLoadingQuote && !privacySwapLoading && !isSigning && signerReady && (swapQuote || (usePrivateMode && isAnyProviderAvailable));

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
          onPress={() => setShowSettingsModal(true)}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <Ionicons name="settings-outline" size={24} color={textColor} />
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* From Token Section */}
        <View style={[styles.tokenSection, { backgroundColor: cardColor }]}>
          <View style={styles.tokenHeader}>
            {activeProvider === 'silentswap' && usePrivateMode ? (
              <Pressable
                onPress={() => setShowFromChainSelector(true)}
                style={[styles.networkBadge, styles.networkBadgeActive]}
              >
                <ThemedText style={[styles.networkLabel, { color: primaryColor }]}>
                  From: {getChainName(sourceChain)}
                </ThemedText>
                <Ionicons name="chevron-down" size={12} color={primaryColor} />
              </Pressable>
            ) : (
              <View style={styles.networkBadge}>
                <ThemedText style={[styles.networkLabel, { color: mutedColor }]}>
                  From: Solana
                </ThemedText>
              </View>
            )}
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
            {activeProvider === 'silentswap' && usePrivateMode ? (
              <Pressable
                onPress={() => setShowToChainSelector(true)}
                style={[styles.networkBadge, styles.networkBadgeActive]}
              >
                <ThemedText style={[styles.networkLabel, { color: primaryColor }]}>
                  To: {getChainName(destChain)}
                </ThemedText>
                <Ionicons name="chevron-down" size={12} color={primaryColor} />
              </Pressable>
            ) : (
              <View style={styles.networkBadge}>
                <ThemedText style={[styles.networkLabel, { color: mutedColor }]}>
                  To: Solana
                </ThemedText>
              </View>
            )}
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

        {/* Privacy Mode Toggle */}
        {isAnyProviderAvailable && (
          <Pressable
            onPress={() => setUsePrivateMode(!usePrivateMode)}
            style={[styles.infoRow, { borderColor }]}
          >
            <View style={styles.infoLabel}>
              <Ionicons
                name={usePrivateMode ? 'shield-checkmark' : 'shield-outline'}
                size={16}
                color={usePrivateMode ? '#22c55e' : mutedColor}
              />
              <ThemedText style={[
                styles.infoLabelText,
                { color: usePrivateMode ? '#22c55e' : mutedColor }
              ]}>
                {usePrivateMode ? 'Privacy Swap' : 'Standard Swap'}
              </ThemedText>
            </View>
            <View style={styles.infoValue}>
              <View style={[
                styles.providerBadge,
                { backgroundColor: usePrivateMode ? 'rgba(34,197,94,0.2)' : `${mutedColor}20` }
              ]}>
                <ThemedText style={[
                  styles.providerText,
                  { color: usePrivateMode ? '#22c55e' : mutedColor }
                ]}>
                  {usePrivateMode ? 'Amount Hidden' : 'Visible'}
                </ThemedText>
              </View>
            </View>
          </Pressable>
        )}

        {/* Privacy Provider Selection - only show when switchable (same-chain) */}
        {usePrivateMode && canSwitchProvider && (
          <View style={[styles.infoRow, { borderColor }]}>
            <View style={styles.infoLabel}>
              <Ionicons name="shield-checkmark-outline" size={16} color={mutedColor} />
              <ThemedText style={[styles.infoLabelText, { color: mutedColor }]}>
                Privacy Provider
              </ThemedText>
            </View>
            <View style={styles.providerToggle}>
              {availableProviders.map((provider) => (
                <Pressable
                  key={provider}
                  onPress={() => {
                    setActiveProvider(provider);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={[
                    styles.providerPill,
                    { borderColor },
                    activeProvider === provider && { backgroundColor: `${primaryColor}20`, borderColor: primaryColor },
                  ]}
                >
                  <ThemedText style={[
                    styles.providerPillText,
                    { color: mutedColor },
                    activeProvider === provider && { color: primaryColor },
                  ]}>
                    {getProviderName(provider)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Cross-chain indicator - show when cross-chain is active */}
        {usePrivateMode && isCrossChain && (
          <View style={[styles.infoRow, { borderColor }]}>
            <View style={styles.infoLabel}>
              <Ionicons name="git-branch-outline" size={16} color={primaryColor} />
              <ThemedText style={[styles.infoLabelText, { color: primaryColor }]}>
                Cross-Chain via SilentSwap
              </ThemedText>
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
              <ThemedText style={[styles.providerText, { color: primaryColor }]}>
                {usePrivateMode && isAnyProviderAvailable ? getProviderName(activeProvider) : 'Jupiter'}
              </ThemedText>
              {activeProvider === 'silentswap' && usePrivateMode && (
                <Ionicons name="git-branch-outline" size={14} color={primaryColor} style={{ marginLeft: 4 }} />
              )}
            </View>
            {!usePrivateMode && <ThemedText style={[styles.providerPlus, { color: mutedColor }]}>+2</ThemedText>}
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

      {/* Settings Modal */}
      {showSettingsModal && (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSettingsModal(false)}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.settingsModal, { backgroundColor: cardColor }]}
          >
            <View style={styles.settingsHeader}>
              <ThemedText style={styles.settingsTitle}>Swap Settings</ThemedText>
              <Pressable
                onPress={() => setShowSettingsModal(false)}
                style={styles.settingsClose}
              >
                <Ionicons name="close" size={24} color={mutedColor} />
              </Pressable>
            </View>

            {/* Slippage Tolerance */}
            <View style={styles.settingsSection}>
              <View style={styles.settingsLabelRow}>
                <ThemedText style={styles.settingsLabel}>Slippage Tolerance</ThemedText>
                <Ionicons name="information-circle-outline" size={16} color={mutedColor} />
              </View>
              <View style={styles.slippageOptions}>
                {[0.5, 1.0, 3.0, 5.0].map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setSlippage(value);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={[
                      styles.slippageOption,
                      slippage === value && { backgroundColor: `${primaryColor}20`, borderColor: primaryColor },
                      { borderColor },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.slippageOptionText,
                        slippage === value && { color: primaryColor, fontWeight: '600' },
                      ]}
                    >
                      {value}%
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <ThemedText style={[styles.slippageHint, { color: mutedColor }]}>
                {slippage <= 1
                  ? 'Low slippage may cause transaction failures'
                  : slippage >= 5
                  ? 'High slippage may result in unfavorable rates'
                  : 'Recommended for most trades'}
              </ThemedText>
            </View>

            {/* Privacy Mode */}
            <View style={styles.settingsSection}>
              <View style={styles.settingsLabelRow}>
                <Ionicons name="shield-checkmark" size={16} color={usePrivateMode ? '#22c55e' : mutedColor} />
                <ThemedText style={styles.settingsLabel}>Confidential Mode</ThemedText>
              </View>
              <Pressable
                onPress={() => {
                  setUsePrivateMode(!usePrivateMode);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.privacyToggle,
                  usePrivateMode
                    ? { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: '#22c55e' }
                    : { backgroundColor: `${mutedColor}10`, borderColor },
                ]}
              >
                <ThemedText style={[styles.privacyToggleText, usePrivateMode && { color: '#22c55e' }]}>
                  {usePrivateMode ? 'Enabled - Amount Hidden' : 'Disabled - Amount Visible'}
                </ThemedText>
                <View
                  style={[
                    styles.privacyToggleDot,
                    usePrivateMode
                      ? { backgroundColor: '#22c55e', marginLeft: 'auto' }
                      : { backgroundColor: mutedColor, marginRight: 'auto' },
                  ]}
                />
              </Pressable>
            </View>

            {/* Done Button */}
            <Pressable
              onPress={() => setShowSettingsModal(false)}
              style={[styles.settingsDoneButton, { backgroundColor: primaryColor }]}
            >
              <ThemedText style={styles.settingsDoneText}>Done</ThemedText>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      {/* From Chain Selector Modal */}
      {showFromChainSelector && (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowFromChainSelector(false)}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.chainModal, { backgroundColor: cardColor }]}
          >
            <ThemedText style={styles.chainModalTitle}>Select Source Chain</ThemedText>
            <ScrollView style={styles.chainList}>
              {supportedChains.map((chain) => (
                <Pressable
                  key={chain.id}
                  onPress={() => {
                    setSourceChain(chain.id);
                    setShowFromChainSelector(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={({ pressed }) => [
                    styles.chainItem,
                    pressed && styles.pressed,
                    sourceChain === chain.id && { backgroundColor: `${primaryColor}15` },
                  ]}
                >
                  <View style={styles.chainItemLeft}>
                    <View style={[styles.chainIcon, { backgroundColor: primaryColor }]}>
                      <ThemedText style={styles.chainIconText}>
                        {chain.name.charAt(0)}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.chainItemName}>{chain.name}</ThemedText>
                  </View>
                  {sourceChain === chain.id && (
                    <Ionicons name="checkmark-circle" size={24} color={primaryColor} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </Pressable>
      )}

      {/* To Chain Selector Modal */}
      {showToChainSelector && (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowToChainSelector(false)}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.chainModal, { backgroundColor: cardColor }]}
          >
            <ThemedText style={styles.chainModalTitle}>Select Destination Chain</ThemedText>
            <ScrollView style={styles.chainList}>
              {supportedChains.map((chain) => (
                <Pressable
                  key={chain.id}
                  onPress={() => {
                    setDestChain(chain.id);
                    setShowToChainSelector(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={({ pressed }) => [
                    styles.chainItem,
                    pressed && styles.pressed,
                    destChain === chain.id && { backgroundColor: `${primaryColor}15` },
                  ]}
                >
                  <View style={styles.chainItemLeft}>
                    <View style={[styles.chainIcon, { backgroundColor: '#8B5CF6' }]}>
                      <ThemedText style={styles.chainIconText}>
                        {chain.name.charAt(0)}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.chainItemName}>{chain.name}</ThemedText>
                  </View>
                  {destChain === chain.id && (
                    <Ionicons name="checkmark-circle" size={24} color={primaryColor} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </Pressable>
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
  // Settings Modal Styles
  settingsModal: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  settingsClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSection: {
    marginBottom: 24,
  },
  settingsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  settingsLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  slippageOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  slippageOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slippageOptionText: {
    fontSize: 14,
  },
  slippageHint: {
    fontSize: 12,
    marginTop: 8,
  },
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  privacyToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  settingsDoneButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  settingsDoneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Provider Toggle Styles
  providerToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  providerPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  providerPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Network Badge Active Style
  networkBadgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Chain Selector Modal Styles
  chainModal: {
    width: '100%',
    maxHeight: '50%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  chainModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  chainList: {
    maxHeight: 300,
  },
  chainItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  chainItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chainIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chainIconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chainItemName: {
    fontSize: 16,
    fontWeight: '500',
  },
});
