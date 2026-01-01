import { router, useLocalSearchParams } from 'expo-router';
import { MarketDetailScreen } from '@/components/market-detail-screen';

// Mock market data - in a real app this would come from a store or API
const mockMarkets: Record<string, {
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  expiresIn: string;
  traders: number;
  trending?: boolean;
  description?: string;
  resolutionSource?: string;
  position?: {
    side: 'yes' | 'no';
    shares: number;
    avgPrice: number;
    currentValue: number;
    pnl: number;
    pnlPercent: number;
  };
}> = {
  'btc-100k': {
    question: 'Will BTC reach $100k by EOY 2025?',
    category: 'Crypto',
    volume: '$4.2M',
    yesPrice: 0.72,
    noPrice: 0.28,
    expiresIn: '182d',
    traders: 12847,
    trending: true,
    description: 'This market will resolve to YES if Bitcoin reaches or exceeds $100,000 USD on any major exchange before December 31, 2025 11:59 PM ET.',
    resolutionSource: 'CoinGecko',
  },
  'fed-rate-cut': {
    question: 'Fed cuts rates in January?',
    category: 'Economy',
    volume: '$2.8M',
    yesPrice: 0.82,
    noPrice: 0.18,
    expiresIn: '18d',
    traders: 8934,
    trending: true,
    description: 'This market will resolve to YES if the Federal Reserve announces a rate cut at the January FOMC meeting.',
    resolutionSource: 'Federal Reserve',
    position: {
      side: 'yes',
      shares: 500,
      avgPrice: 0.65,
      currentValue: 410,
      pnl: 85,
      pnlPercent: 26.15,
    },
  },
  'eth-5k': {
    question: 'ETH > $5k by March 2025?',
    category: 'Crypto',
    volume: '$1.8M',
    yesPrice: 0.68,
    noPrice: 0.32,
    expiresIn: '47d',
    traders: 6521,
    description: 'This market will resolve to YES if Ethereum reaches or exceeds $5,000 USD on any major exchange before March 31, 2025.',
    resolutionSource: 'CoinGecko',
    position: {
      side: 'yes',
      shares: 500,
      avgPrice: 0.42,
      currentValue: 340,
      pnl: 130,
      pnlPercent: 61.90,
    },
  },
};

export default function MarketDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const marketData = id ? mockMarkets[id] : Object.values(mockMarkets)[0];

  if (!marketData) {
    router.back();
    return null;
  }

  const { position, ...market } = marketData;

  return (
    <MarketDetailScreen
      market={market}
      position={position}
      onBack={() => router.back()}
      onBuyYes={() => {
        // Handle buy YES
        router.back();
      }}
      onBuyNo={() => {
        // Handle buy NO
        router.back();
      }}
      onSell={() => {
        // Handle sell position
        router.back();
      }}
    />
  );
}

