import { router, useLocalSearchParams } from 'expo-router';
import { AssetDetailScreen } from '@/components/asset-detail-screen';

// Mock asset data - in a real app this would come from a store or API
const mockAssets: Record<string, {
  name: string;
  type: 'nft' | 'rwa' | 'depin';
  image: string;
  value: number;
  change: number;
  collection?: string;
  tokenId?: string;
  rarity?: string;
  floorPrice?: number;
  lastSale?: number;
  yield?: number;
  minInvest?: string;
  totalValue?: string;
  location?: string;
  earnings?: number;
  uptime?: string;
  network?: string;
}> = {
  'bored-ape-7284': {
    name: 'Bored Ape #7284',
    type: 'nft',
    image: '/bored-ape-nft-pixel-art.jpg',
    value: 42500,
    change: -8.2,
    collection: 'Bored Ape Yacht Club',
    tokenId: '7284',
    rarity: 'Rare',
    floorPrice: 38000,
    lastSale: 45000,
  },
  'manhattan-re': {
    name: 'Manhattan RE Token',
    type: 'rwa',
    image: '/manhattan-building-token.jpg',
    value: 25000,
    change: 2.1,
    yield: 8.2,
    minInvest: '$100',
    totalValue: '$45M',
    location: 'NYC',
  },
  'helium-hotspot': {
    name: 'Helium Hotspot #12847',
    type: 'depin',
    image: '/helium-hotspot-device.png',
    value: 3200,
    change: 15.4,
    earnings: 42,
    uptime: '99.8%',
    network: 'Helium',
  },
};

export default function AssetDetailRoute() {
  const { id, owned } = useLocalSearchParams<{ id: string; owned?: string }>();
  
  const asset = id ? mockAssets[id] : Object.values(mockAssets)[0];
  const isOwned = owned === 'true';

  if (!asset) {
    router.back();
    return null;
  }

  return (
    <AssetDetailScreen
      asset={asset}
      owned={isOwned}
      onBack={() => router.back()}
      onBuy={() => {
        // Navigate to buy flow
        router.back();
      }}
      onSell={() => {
        // Navigate to sell flow
        router.back();
      }}
      onSend={() => {
        // Navigate to send flow
        router.back();
      }}
      onList={() => {
        // Navigate to list flow
        router.back();
      }}
    />
  );
}

