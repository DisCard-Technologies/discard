import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { MarketDetailScreen } from '@/components/market-detail-screen';

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
      onBuyYes={() => {
        // TODO: Navigate to DFlow buy YES flow
        router.back();
      }}
      onBuyNo={() => {
        // TODO: Navigate to DFlow buy NO flow
        router.back();
      }}
      onSell={() => {
        // TODO: Navigate to DFlow sell flow
        router.back();
      }}
    />
  );
}
