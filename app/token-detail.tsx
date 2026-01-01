import { router, useLocalSearchParams } from 'expo-router';
import { TokenDetailScreen } from '@/components/token-detail-screen';

// Mock token data - in a real app this would come from a store or API
const mockTokens: Record<string, {
  symbol: string;
  name: string;
  icon?: string;
  price: number;
  change24h: number;
  marketCap?: string;
  volume24h?: string;
  supply?: string;
  rank?: number;
  owned?: {
    balance: string;
    value: number;
    avgCost?: number;
    pnl?: number;
    pnlPercent?: number;
    allocation?: number;
    isAmbientManaged?: boolean;
  };
}> = {
  eth: {
    symbol: 'ETH',
    name: 'Ethereum',
    icon: '◇',
    price: 3752.41,
    change24h: 5.23,
    marketCap: '$462B',
    volume24h: '$18.2B',
    supply: '120.2M ETH',
    rank: 2,
    owned: {
      balance: '12.847',
      value: 48234.12,
      avgCost: 3200.00,
      pnl: 7098.12,
      pnlPercent: 17.25,
      allocation: 28,
      isAmbientManaged: true,
    },
  },
  btc: {
    symbol: 'BTC',
    name: 'Bitcoin',
    icon: '₿',
    price: 84692.15,
    change24h: 3.89,
    marketCap: '$1.7T',
    volume24h: '$42.8B',
    supply: '19.6M BTC',
    rank: 1,
    owned: {
      balance: '0.8421',
      value: 71284.67,
      avgCost: 62000.00,
      pnl: 19086.67,
      pnlPercent: 36.58,
      allocation: 41,
    },
  },
  sol: {
    symbol: 'SOL',
    name: 'Solana',
    icon: '◎',
    price: 178.45,
    change24h: 12.34,
    marketCap: '$82B',
    volume24h: '$4.1B',
    supply: '460M SOL',
    rank: 5,
  },
};

export default function TokenDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const tokenData = id ? mockTokens[id.toLowerCase()] : Object.values(mockTokens)[0];

  if (!tokenData) {
    router.back();
    return null;
  }

  const { owned, ...token } = tokenData;

  // Map token symbol to MoonPay currency code
  const getCurrencyCode = (symbol: string) => {
    const map: Record<string, string> = {
      ETH: 'eth',
      BTC: 'btc',
      SOL: 'sol',
      USDC: 'usdc',
      USDT: 'usdt',
    };
    return map[symbol.toUpperCase()] || symbol.toLowerCase();
  };

  return (
    <TokenDetailScreen
      token={token}
      owned={owned}
      onBack={() => router.back()}
      onBuy={() => {
        // Navigate to buy flow with pre-selected currency
        router.push(`/buy-crypto?currency=${getCurrencyCode(token.symbol)}`);
      }}
      onSell={() => {
        // Navigate to sell flow with pre-selected currency
        router.push(`/sell-crypto?currency=${getCurrencyCode(token.symbol)}`);
      }}
      onSend={() => {
        // Navigate to send flow
        router.back();
      }}
      onReceive={() => {
        // Navigate to receive flow
        router.back();
      }}
      onSwap={() => {
        // Navigate to swap flow
        router.back();
      }}
      onSetGoal={() => {
        // Navigate to goal setting
        router.back();
      }}
    />
  );
}

