import { useEffect, useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { MarketDetailScreen } from '@/components/market-detail-screen';
import { usePrivatePrediction } from '@/hooks/usePrivatePrediction';
import { useAuth } from '@/stores/authConvex';
import { useTurnkeySigner } from '@/hooks/useTurnkeySigner';

// Helper to calculate time remaining from end date
const getTimeRemaining = (endDate: string): string => {
  const end = new Date(endDate);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 'Ended';
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 30) return `${Math.floor(days / 30)}mo`;
  return `${days}d`;
};

// Helper to format volume
const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(1)}B`;
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
};

export default function MarketDetailRoute() {
  const params = useLocalSearchParams<{
    id: string; // DFlow market ID
    question?: string;
    category?: string;
    yesPrice?: string;
    noPrice?: string;
    volume24h?: string;
    endDate?: string;
    ticker?: string;
    resolutionSource?: string;
  }>();

  // Auth and user info
  const { user, userId } = useAuth();
  const walletAddress = user?.solanaAddress || undefined;

  // Turnkey signer for transaction signing
  const {
    isReady: signerReady,
    isSigning,
    signTransaction,
    error: signerError,
  } = useTurnkeySigner(userId || undefined);

  // Private prediction hook for encrypted betting
  const {
    state: predictionState,
    isLoading: predictionLoading,
    quickBet,
    sellPosition,
    getSellQuote,
    positions,
    isAvailable: isPrivateBettingAvailable,
  } = usePrivatePrediction(walletAddress, userId || undefined);

  const [isBetting, setIsBetting] = useState(false);

  // Build market data from route params (real API data)
  const marketData = params.question ? {
    marketId: params.id,
    question: params.question,
    category: params.category || 'Other',
    volume: formatVolume(parseFloat(params.volume24h || '0')),
    yesPrice: parseFloat(params.yesPrice || '0.5'),
    noPrice: parseFloat(params.noPrice || '0.5'),
    expiresIn: params.endDate ? getTimeRemaining(params.endDate) : 'TBD',
    ticker: params.ticker,
    resolutionSource: params.resolutionSource,
    traders: 0, // Would come from API
  } : null;

  // Handle private bet placement - all bets are private by default
  const handlePlaceBet = useCallback(async (side: 'yes' | 'no', amountDollars: number = 10) => {
    if (!marketData?.marketId || !walletAddress || !userId) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    // Check if Turnkey signer is ready
    if (!signerReady) {
      Alert.alert(
        'Wallet Not Ready',
        signerError || 'Please ensure your wallet is properly initialized.'
      );
      return;
    }

    if (!isPrivateBettingAvailable) {
      Alert.alert(
        'Private Betting Unavailable',
        'Private betting service is currently unavailable. Please try again later.'
      );
      return;
    }

    setIsBetting(true);

    try {
      // Convert dollars to cents
      const betAmount = amountDollars * 100;

      console.log('[MarketDetail] Placing private bet with Turnkey signer:', {
        marketId: marketData.marketId,
        side,
        amount: betAmount,
        amountDollars,
        privateMode: true,
      });

      // Use a placeholder - actual signing is handled by Turnkey via the hook
      // The prediction service will prepare transactions and we sign via signTransaction
      const placeholderKey = new Uint8Array(32);

      const result = await quickBet(
        marketData.marketId,
        side,
        betAmount,
        placeholderKey // Signing handled by Turnkey
      );

      if (result?.success) {
        Alert.alert(
          'Bet Placed!',
          `Your private ${side.toUpperCase()} bet of $${amountDollars} has been placed.\n\nBet amount is hidden on-chain via ZK proofs.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', result?.error || 'Failed to place bet');
      }
    } catch (error) {
      console.error('[MarketDetail] Bet failed:', error);
      Alert.alert('Error', 'Failed to place bet');
    }

    setIsBetting(false);
  }, [marketData, walletAddress, userId, isPrivateBettingAvailable, quickBet, signerReady, signerError]);

  // Handle position selling
  const handleSell = useCallback(async () => {
    if (!marketData?.marketId || !walletAddress) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    // Find user's position for this market
    const position = positions.find(
      (p) => p.marketId === marketData.marketId && p.status === 'open'
    );

    if (!position) {
      Alert.alert('No Position', 'You don\'t have an open position in this market');
      return;
    }

    // Get sell quote first
    const quote = await getSellQuote(position.positionId);
    if (!quote) {
      Alert.alert('Error', 'Failed to get sell quote');
      return;
    }

    if (!quote.canSell) {
      Alert.alert('Cannot Sell', quote.error || 'Market is not open for selling');
      return;
    }

    // Show confirmation dialog
    const pnlText = quote.estimatedPnl >= 0
      ? `+$${(quote.estimatedPnl / 100).toFixed(2)}`
      : `-$${(Math.abs(quote.estimatedPnl) / 100).toFixed(2)}`;

    Alert.alert(
      'Sell Position',
      `Current price: ${(quote.currentPrice * 100).toFixed(1)}¢\n` +
      `Estimated proceeds: $${(quote.estimatedProceeds / 100).toFixed(2)}\n` +
      `Estimated P&L: ${pnlText}\n\n` +
      `Proceeds will be sent to a private address.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sell',
          style: 'destructive',
          onPress: async () => {
            setIsBetting(true);
            const result = await sellPosition(position.positionId, {
              useStealthOutput: true,
            });

            if (result?.success) {
              Alert.alert(
                'Position Sold!',
                `Received: $${((result.proceedsAmount || 0) / 100).toFixed(2)}\n\n` +
                `Proceeds sent to private address.`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } else {
              Alert.alert('Error', result?.error || 'Failed to sell position');
            }
            setIsBetting(false);
          },
        },
      ]
    );
  }, [marketData, walletAddress, positions, getSellQuote, sellPosition]);

  useEffect(() => {
    if (!marketData) {
      router.back();
    }
  }, [marketData]);

  if (!marketData) {
    return null;
  }

  return (
    <MarketDetailScreen
      market={marketData}
      onBack={() => router.back()}
      onBuyYes={(amount) => handlePlaceBet('yes', amount)}
      onBuyNo={(amount) => handlePlaceBet('no', amount)}
      onSell={handleSell}
    />
  );
}
