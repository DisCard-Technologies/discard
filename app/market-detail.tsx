import { useEffect, useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { MarketDetailScreen } from '@/components/market-detail-screen';
import { usePrivatePrediction } from '@/hooks/usePrivatePrediction';
import { useAuth } from '@/stores/authConvex';

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

  // Private prediction hook for encrypted betting
  const {
    state: predictionState,
    isLoading: predictionLoading,
    quickBet,
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

  // Handle private bet placement
  const handlePlaceBet = useCallback(async (side: 'yes' | 'no') => {
    if (!marketData?.marketId || !walletAddress || !userId) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    setIsBetting(true);

    try {
      // Default bet amount of $10 (1000 cents) for demo
      const betAmount = 1000;

      // Mock private key for demo (in production, comes from Turnkey)
      const mockPrivateKey = new Uint8Array(32);

      if (isPrivateBettingAvailable) {
        console.log('[MarketDetail] Placing private bet:', {
          marketId: marketData.marketId,
          side,
          amount: betAmount,
          privateMode: true,
        });

        const result = await quickBet(
          marketData.marketId,
          side,
          betAmount,
          mockPrivateKey
        );

        if (result?.success) {
          Alert.alert(
            'Bet Placed!',
            `Your private ${side.toUpperCase()} bet has been placed.\n\nBet amount is hidden on-chain.`,
            [{ text: 'OK', onPress: () => router.back() }]
          );
        } else {
          Alert.alert('Error', result?.error || 'Failed to place bet');
        }
      } else {
        // Fallback to standard bet (would integrate with DFlow directly)
        Alert.alert('Info', 'Standard betting coming soon');
      }
    } catch (error) {
      console.error('[MarketDetail] Bet failed:', error);
      Alert.alert('Error', 'Failed to place bet');
    }

    setIsBetting(false);
  }, [marketData, walletAddress, userId, isPrivateBettingAvailable, quickBet]);

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
      onBuyYes={() => handlePlaceBet('yes')}
      onBuyNo={() => handlePlaceBet('no')}
      onSell={() => {
        // TODO: Navigate to sell/settle flow
        Alert.alert('Sell', 'Position selling coming soon');
      }}
    />
  );
}
