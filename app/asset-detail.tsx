import { useEffect } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AssetDetailScreen } from '@/components/asset-detail-screen';
import type { RwaType } from '@/types/holdings.types';

export default function AssetDetailRoute() {
  const params = useLocalSearchParams<{
    id: string; // Solana mint address
    symbol?: string;
    issuer?: string;
    type?: string;
    yield?: string;
    minInvestment?: string;
    description?: string;
  }>();

  // Build RWA asset data from route params (real API data)
  const asset = params.symbol ? {
    name: params.symbol,
    type: 'rwa' as const, // All assets from explore are RWA on Solana
    mint: params.id, // Solana mint address
    issuer: params.issuer || 'Unknown',
    rwaType: (params.type || 'tokenized-fund') as RwaType,
    image: '', // Would come from token metadata
    value: 0, // Would come from user holdings
    change: 0, // Would come from price API
    yield: params.yield ? parseFloat(params.yield) : undefined,
    minInvest: params.minInvestment
      ? `$${(parseFloat(params.minInvestment) / 1000).toFixed(0)}K`
      : undefined,
    description: params.description,
  } : null;

  const isOwned = false; // Would check against user's holdings

  useEffect(() => {
    if (!asset) {
      router.back();
    }
  }, [asset]);

  if (!asset) {
    return null;
  }

  return (
    <AssetDetailScreen
      asset={asset}
      owned={isOwned}
      onBack={() => router.back()}
      onBuy={() => {
        router.push(`/buy-crypto?currency=${asset.name.toLowerCase()}&mint=${params.id}`);
      }}
      onSell={() => {
        router.push(`/sell-crypto?currency=${asset.name.toLowerCase()}`);
      }}
      onSend={() => {
        router.push('/transfer/send');
      }}
      onList={() => {
        Alert.alert('Coming Soon', 'Marketplace listing will be available soon.');
      }}
    />
  );
}
