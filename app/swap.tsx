import { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Dimensions, Alert, Image } from 'react-native';
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
import { estimateTransferFees, type TransferFees } from '@/lib/fees/estimateFees';

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

          // Serialize transaction to base64 for Turnkey signing
          const serializedTx = transaction.serializeMessage().toString('base64');

          // Sign with Turnkey
          const signResult = await signTransaction({
            unsignedTransaction: serializedTx,
          });

          if (!signResult.success || !signResult.signature) {
            throw new Error(signResult.error || 'Failed to sign transaction');
          }

          // Reconstruct signed transaction
          const signatureBuffer = Buffer.from(signResult.signature, 'base64');
          transaction.addSignature(
            new PublicKey(walletAddress!),
            signatureBuffer
          );

          console.log('[Swap] Submitting transaction to Solana...');

          // Submit to network
          const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
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

  // Real network fee estimation
  const [feeEstimate, setFeeEstimate] = useState<TransferFees | null>(null);
  const [isLoadingFees, setIsLoadingFees] = useState(false);

  // Fetch real network fees
  useEffect(() => {
    let cancelled = false;

    const fetchFees = async () => {
      setIsLoadingFees(true);
      try {
        // Get SOL price from available tokens if possible
        const solToken = availableTokens.find(t => t.symbol === 'SOL');
        const solPrice = solToken?.priceUsd || undefined;

        const fees = await estimateTransferFees({
          amountUsd: fromAmountUsd,
          includeAtaRent: false, // Swap usually doesn't need new ATA
          solPriceUsd: solPrice,
        });

        if (!cancelled) {
          setFeeEstimate(fees);
        }
      } catch (error) {
        console.warn('[Swap] Failed to estimate fees:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingFees(false);
        }
      }
    };

    fetchFees();

    // Refresh fees every 30 seconds
    const interval = setInterval(fetchFees, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fromAmountUsd, availableTokens]);

  // Network fee display values
  const networkFee = useMemo(() => {
    if (!feeEstimate) {
      return {
        amount: '...',
        symbol: 'SOL',
        usd: 0,
      };
    }

    const totalFee = feeEstimate.networkFee + feeEstimate.priorityFee;
    return {
      amount: totalFee.toFixed(6),
      symbol: 'SOL',
      usd: feeEstimate.networkFeeUsd + feeEstimate.priorityFeeUsd,
    };
  }, [feeEstimate]);

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
                  {token.logoUri ? (
                    <Image source={{ uri: token.logoUri }} style={styles.tokenModalImage} />
                  ) : (
                    <View style={[styles.tokenIcon, { backgroundColor: primaryColor }]}>
                      <ThemedText style={styles.tokenIconText}>
                        {token.symbol.charAt(0)}
                      </ThemedText>
                    </View>
                  )}
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

  // Number pad handler
  const handleNumberPress = useCallback((num: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (num === '.' && fromAmount.includes('.')) return;
    if (fromAmount === '0' && num !== '.') {
      setFromAmount(num);
    } else if (fromAmount === '' && num === '.') {
      setFromAmount('0.');
    } else {
      setFromAmount(fromAmount + num);
    }
  }, [fromAmount]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (fromAmount.length > 1) {
      setFromAmount(fromAmount.slice(0, -1));
    } else {
      setFromAmount('0');
    }
  }, [fromAmount]);

  // Number pad keys (simple, no letters)
  const numberPadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'delete'];

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [styles.headerButton, { backgroundColor: cardColor }, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={textColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Swap</ThemedText>
        <Pressable
          onPress={() => setShowSettingsModal(true)}
          style={({ pressed }) => [styles.headerButton, { backgroundColor: cardColor }, pressed && styles.pressed]}
        >
          <Ionicons name="settings-outline" size={22} color={textColor} />
        </Pressable>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* From Section */}
        <ThemedText style={styles.sectionLabel}>From</ThemedText>
        <View style={[styles.tokenCard, { backgroundColor: cardColor }]}>
          <View style={styles.tokenCardRow}>
            <Pressable
              onPress={() => setShowFromSelector(true)}
              style={styles.tokenSelectorButton}
            >
              {fromToken ? (
                fromToken.logoUri ? (
                  <Image source={{ uri: fromToken.logoUri }} style={styles.tokenImage} />
                ) : (
                  <View style={[styles.tokenIconCircle, { backgroundColor: '#8B5CF6' }]}>
                    <ThemedText style={styles.tokenIconText}>
                      {fromToken.symbol.charAt(0)}
                    </ThemedText>
                  </View>
                )
              ) : (
                <View style={[styles.tokenIconCircle, { backgroundColor: mutedColor, opacity: 0.3 }]} />
              )}
              <ThemedText style={styles.tokenName}>
                {fromToken?.name || 'Select'}
              </ThemedText>
              <Ionicons name="chevron-down" size={16} color={mutedColor} />
            </Pressable>

            <View style={styles.amountSection}>
              <ThemedText style={styles.amountDisplay}>
                {fromAmount || '0'}
              </ThemedText>
              <ThemedText style={[styles.amountUsd, { color: mutedColor }]}>
                ${fromAmountUsd.toFixed(2)}
              </ThemedText>
            </View>
          </View>

          <View style={styles.tokenCardBottom}>
            <ThemedText style={[styles.balanceText, { color: mutedColor }]}>
              Balance: ${fromToken?.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
            </ThemedText>
            <View style={styles.networkBadge}>
              <View style={styles.networkDot} />
              <ThemedText style={styles.networkText}>main network</ThemedText>
            </View>
          </View>
        </View>

        {/* Swap Button */}
        <View style={styles.swapButtonWrapper}>
          <Pressable
            onPress={handleSwapTokens}
            style={({ pressed }) => [
              styles.swapCircleButton,
              { backgroundColor: cardColor },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="sync" size={20} color={textColor} />
          </Pressable>
        </View>

        {/* To Section */}
        <ThemedText style={styles.sectionLabel}>To</ThemedText>
        <View style={[styles.tokenCard, { backgroundColor: cardColor }]}>
          <View style={styles.tokenCardRow}>
            <Pressable
              onPress={() => setShowToSelector(true)}
              style={styles.tokenSelectorButton}
            >
              {toToken ? (
                toToken.logoUri ? (
                  <Image source={{ uri: toToken.logoUri }} style={styles.tokenImage} />
                ) : (
                  <View style={[styles.tokenIconCircle, { backgroundColor: '#8B5CF6' }]}>
                    <ThemedText style={styles.tokenIconText}>
                      {toToken.symbol.charAt(0)}
                    </ThemedText>
                  </View>
                )
              ) : (
                <View style={[styles.tokenIconCircleEmpty, { borderColor: mutedColor }]} />
              )}
              <ThemedText style={[styles.tokenName, !toToken && { color: mutedColor }]}>
                {toToken?.name || 'Choose an asset'}
              </ThemedText>
              <Ionicons name="chevron-down" size={16} color={mutedColor} />
            </Pressable>

            <View style={styles.amountSection}>
              {isLoadingQuote ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <ThemedText style={styles.amountDisplay}>
                  {toAmount || '0.00'}
                </ThemedText>
              )}
              <ThemedText style={[styles.amountUsd, { color: mutedColor }]}>
                ${toAmountUsd.toFixed(2)}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Network Fee */}
        <Pressable style={styles.networkFeeRow}>
          <View style={styles.networkFeeLeft}>
            <ThemedText style={[styles.networkFeeLabel, { color: mutedColor }]}>Network Fee:</ThemedText>
            <ThemedText style={[styles.networkFeeSpeed, { color: textColor }]}> Fast</ThemedText>
            <Ionicons name="information-circle-outline" size={14} color={mutedColor} style={{ marginLeft: 4 }} />
          </View>
          <View style={styles.networkFeeRight}>
            {isLoadingFees ? (
              <ActivityIndicator size="small" color={mutedColor} />
            ) : (
              <>
                <ThemedText style={[styles.networkFeeAmount, { color: textColor }]}>
                  {networkFee.amount} {networkFee.symbol}
                </ThemedText>
                <ThemedText style={[styles.networkFeeUsd, { color: mutedColor }]}>
                  {' '}(${networkFee.usd.toFixed(2)})
                </ThemedText>
              </>
            )}
            <Ionicons name="chevron-forward" size={14} color={mutedColor} style={{ marginLeft: 4 }} />
          </View>
        </Pressable>
      </View>

      {/* Number Pad */}
      <View style={styles.numberPadContainer}>
        <View style={styles.numberPad}>
          {numberPadKeys.map((key, index) => (
            <Pressable
              key={index}
              onPress={() => {
                if (key === 'delete') handleDelete();
                else handleNumberPress(key);
              }}
              style={({ pressed }) => [
                styles.numberKey,
                pressed && styles.numberKeyPressed,
              ]}
            >
              {key === 'delete' ? (
                <Ionicons name="backspace-outline" size={24} color="#1C1C1E" />
              ) : (
                <ThemedText style={styles.numberKeyText}>{key}</ThemedText>
              )}
            </Pressable>
          ))}
        </View>

        {/* Review Button */}
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.reviewButton,
            { backgroundColor: canContinue ? primaryColor : '#4A4A4D' },
            pressed && canContinue && styles.pressed,
          ]}
        >
          <ThemedText style={styles.reviewButtonText}>Review</ThemedText>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerButton: {
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
  pressed: {
    opacity: 0.7,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 8,
    marginLeft: 4,
  },
  tokenCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  tokenCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tokenSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconCircleEmpty: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  tokenIconText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tokenImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenModalImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  tokenName: {
    fontSize: 15,
    fontWeight: '500',
  },
  amountSection: {
    alignItems: 'flex-end',
  },
  amountDisplay: {
    fontSize: 24,
    fontWeight: '400',
  },
  amountUsd: {
    fontSize: 13,
    marginTop: 2,
  },
  tokenCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  balanceText: {
    fontSize: 13,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  networkText: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '500',
  },
  swapButtonWrapper: {
    alignItems: 'center',
    marginVertical: 4,
  },
  swapCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  networkFeeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  networkFeeLabel: {
    fontSize: 13,
  },
  networkFeeSpeed: {
    fontSize: 13,
    fontWeight: '500',
  },
  networkFeeRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  networkFeeAmount: {
    fontSize: 13,
  },
  networkFeeUsd: {
    fontSize: 13,
  },
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
  reviewButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  reviewButtonText: {
    color: '#fff',
    fontSize: 16,
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
