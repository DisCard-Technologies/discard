import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { TokenDetailScreen } from '@/components/token-detail-screen';

export default function TokenDetailRoute() {
  const params = useLocalSearchParams<{
    id: string; // Solana mint address
    symbol?: string;
    name?: string;
    price?: string;
    change24h?: string;
    volume24h?: string;
    marketCap?: string;
    supply?: string;
    totalSupply?: string;
    logoUri?: string;
    // Owned token data
    balance?: string;
    value?: string;
  }>();

  // Build token data from route params (real API data)
  const tokenData = params.symbol ? {
    symbol: params.symbol,
    name: params.name || params.symbol,
    price: parseFloat(params.price || '0'),
    change24h: parseFloat(params.change24h || '0'),
    volume24h: params.volume24h,
    marketCap: params.marketCap,
    supply: params.supply,
    totalSupply: params.totalSupply,
    logoUri: params.logoUri,
    mint: params.id, // Solana mint address
  } : null;

  // Build owned data if balance is provided
  const ownedData = params.balance ? {
    balance: params.balance,
    value: parseFloat(params.value || '0'),
  } : undefined;

  useEffect(() => {
    if (!tokenData) {
      router.back();
    }
  }, [tokenData]);

  if (!tokenData) {
    return null;
  }

  return (
    <TokenDetailScreen
      token={tokenData}
      owned={ownedData}
      onBack={() => router.back()}
      onBuy={() => {
        router.push(`/buy-crypto?currency=${tokenData.symbol.toLowerCase()}&mint=${params.id}`);
      }}
      onSend={() => {
        // TODO: Navigate to send flow with mint address
        router.back();
      }}
      onReceive={() => {
        // TODO: Navigate to receive flow
        router.back();
      }}
      onSwap={() => {
        // TODO: Navigate to Jupiter swap with this token
        router.back();
      }}
    />
  );
}
