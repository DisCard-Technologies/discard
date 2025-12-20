import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  AmbientBackground,
  GlassCard,
  AssetRow,
  BalanceDisplay,
  CommandBar,
  StatusDot,
} from '../../components/vision';
import { useCrypto } from '../../stores/cryptoConvex';
import { formatCurrency, formatPercentage } from '../../lib/utils';

type TabType = 'tokens' | 'assets' | 'markets';

// Mock data for demo
const mockTokens = [
  { symbol: 'ETH', name: 'Ethereum', balance: '12.847 ETH', value: 48234.12, change: 5.23, icon: '◆', hasAuto: true },
  { symbol: 'USDC', name: 'USD Coin', balance: '45,892.00 USDC', value: 45892, change: 0.01, icon: '$', hasAuto: true },
  { symbol: 'BTC', name: 'Bitcoin', balance: '0.8421 BTC', value: 71284.67, change: 3.89, icon: '₿', hasAuto: false },
  { symbol: 'SOL', name: 'Solana', balance: '234.5 SOL', value: 8421.45, change: -2.14, icon: '◎', hasAuto: false },
  { symbol: 'ARB', name: 'Arbitrum', balance: '12,450 ARB', value: 2847.23, change: 8.92, icon: '🔷', hasAuto: false },
  { symbol: 'LINK', name: 'Chainlink', balance: '892.3 LINK', value: 1591.87, change: -1.23, icon: '⚡', hasAuto: false },
];

const mockAssets = [
  { name: 'Bored Ape #7284', type: 'NFT', value: 42500, change: 5.2, image: '🦍' },
  { name: 'Manhattan RE Token', type: 'RWA', value: 25000, change: 2.1, image: '🏢' },
  { name: 'Helium Hotspot #12847', type: 'DePIN', value: 3200, change: 15.4, image: '📡' },
  { name: 'CryptoPunk #4821', type: 'NFT', value: 89000, change: 1.8, image: '🎭' },
];

const mockMarkets = [
  { question: 'ETH > $5k by March 2025?', side: 'YES', platform: 'Polymarket', shares: 500, avgPrice: 0.42, currentPrice: 0.68, value: 130, change: 61.9, voters: 47 },
  { question: 'US Spot ETH ETF Approved Q1?', side: 'YES', platform: 'Polymarket', shares: 1200, avgPrice: 0.31, currentPrice: 0.74, value: 516, change: 138.7, voters: 23 },
  { question: 'BTC ATH in December?', side: 'NO', platform: 'Kalshi', shares: 300, avgPrice: 0.78, currentPrice: 0.45, value: -99, change: -42.3, voters: 12 },
  { question: 'Fed Rate Cut > 50bps?', side: 'YES', platform: 'Kalshi', shares: 800, avgPrice: 0.52, currentPrice: 0.68, value: 128, change: 30.8, voters: 8 },
];

export default function HoldingsScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('tokens');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { state: cryptoState } = useCrypto();

  // Calculate totals
  const tokensValue = mockTokens.reduce((sum, t) => sum + t.value, 0);
  const assetsValue = mockAssets.reduce((sum, a) => sum + a.value, 0);
  const marketsValue = mockMarkets.reduce((sum, m) => sum + m.value, 0);
  const totalValue = tokensValue + assetsValue;

  const tabs = [
    { id: 'tokens' as const, label: 'Tokens', value: tokensValue },
    { id: 'assets' as const, label: 'Assets', value: assetsValue },
    { id: 'markets' as const, label: 'Markets', value: 1859 },
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView 
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#10B981" />
          }
        >
          {/* Header */}
          <View className="px-6 pt-6 pb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-2xl font-semibold text-foreground">Holdings</Text>
              <View className="flex-row items-center px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Ionicons name="sparkles" size={12} color="#10B981" />
                <Text className="text-xs font-medium text-primary ml-1.5">AI Optimizing</Text>
              </View>
            </View>
            <Text className="text-sm text-muted-foreground">
              ${totalValue.toLocaleString()} total value
            </Text>
          </View>

          {/* Tab Selector */}
          <View className="px-6 mb-4">
            <View className="flex-row gap-2">
              {tabs.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-3 rounded-xl items-center ${
                    activeTab === tab.id 
                      ? 'bg-primary/20 border border-primary/30' 
                      : 'bg-surface/40 border border-border/20'
                  }`}
                  activeOpacity={0.7}
                >
                  <Text className={`text-xs font-medium mb-1 ${
                    activeTab === tab.id ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {tab.label}
                  </Text>
                  <Text className={`text-sm font-semibold ${
                    activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    ${formatCurrency(tab.value).replace('$', '')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Content based on active tab */}
          <View className="px-6 pb-6">
            {activeTab === 'tokens' && <TokensTab tokens={mockTokens} />}
            {activeTab === 'assets' && <AssetsTab assets={mockAssets} />}
            {activeTab === 'markets' && <MarketsTab markets={mockMarkets} />}
          </View>
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}

function TokensTab({ tokens }: { tokens: typeof mockTokens }) {
  return (
    <View className="gap-2">
      {tokens.map((token) => (
        <AssetRow
          key={token.symbol}
          symbol={token.symbol}
          name={token.name}
          balance={token.balance}
          value={token.value}
          change={token.change}
          icon={token.icon}
          hasAutoStrategy={token.hasAuto}
        />
      ))}
    </View>
  );
}

function AssetsTab({ assets }: { assets: typeof mockAssets }) {
  return (
    <View>
      {/* Filter pills */}
      <View className="flex-row gap-2 mb-4">
        {['All', 'NFTs', 'RWA', 'DePIN'].map((filter) => (
          <TouchableOpacity
            key={filter}
            className={`px-3 py-1.5 rounded-full ${
              filter === 'All' 
                ? 'bg-primary/20 border border-primary/30' 
                : 'bg-surface/40 border border-border/20'
            }`}
            activeOpacity={0.7}
          >
            <Text className={`text-xs font-medium ${
              filter === 'All' ? 'text-primary' : 'text-muted-foreground'
            }`}>
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Assets list */}
      <View className="gap-2">
        {assets.map((asset, index) => (
          <GlassCard key={index}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="w-12 h-12 rounded-xl bg-surface items-center justify-center mr-3">
                  <Text className="text-2xl">{asset.image}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground">{asset.name}</Text>
                  <View className="px-2 py-0.5 rounded-md bg-accent/20 self-start mt-1">
                    <Text className="text-[10px] font-medium text-accent uppercase">{asset.type}</Text>
                  </View>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-base font-medium text-foreground">
                  {formatCurrency(asset.value)}
                </Text>
                <Text className={`text-sm ${asset.change >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {formatPercentage(asset.change)}
                </Text>
              </View>
            </View>
          </GlassCard>
        ))}
      </View>
    </View>
  );
}

function MarketsTab({ markets }: { markets: typeof mockMarkets }) {
  const totalPnL = markets.reduce((sum, m) => sum + m.value, 0);
  const openPositions = markets.length;

  return (
    <View>
      {/* Stats */}
      <View className="flex-row gap-3 mb-4">
        <GlassCard className="flex-1">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Unrealized P&L
          </Text>
          <Text className={`text-xl font-semibold ${totalPnL >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </Text>
        </GlassCard>
        <GlassCard className="flex-1">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Open Positions
          </Text>
          <Text className="text-xl font-semibold text-foreground">{openPositions}</Text>
        </GlassCard>
      </View>

      {/* Markets list */}
      <View className="gap-3">
        {markets.map((market, index) => (
          <GlassCard key={index}>
            <View className="flex-row items-start justify-between mb-2">
              <Text className="text-sm font-medium text-foreground flex-1 mr-2">
                {market.question}
              </Text>
              <View className="flex-row items-center">
                <Ionicons name="people" size={12} color="#6B7280" />
                <Text className="text-xs text-muted-foreground ml-1">{market.voters}d</Text>
              </View>
            </View>
            
            <View className="flex-row items-center mb-2">
              <View className={`px-2 py-0.5 rounded-md ${
                market.side === 'YES' ? 'bg-primary/20' : 'bg-destructive/20'
              }`}>
                <Text className={`text-xs font-bold ${
                  market.side === 'YES' ? 'text-primary' : 'text-destructive'
                }`}>
                  {market.side}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground ml-2">{market.platform}</Text>
            </View>

            <View className="flex-row items-center justify-between text-xs">
              <View>
                <Text className="text-[10px] text-muted-foreground uppercase mb-0.5">Shares</Text>
                <Text className="text-xs text-foreground font-medium">{market.shares}</Text>
              </View>
              <View>
                <Text className="text-[10px] text-muted-foreground uppercase mb-0.5 text-center">Avg</Text>
                <Text className="text-xs text-foreground font-medium">${market.avgPrice.toFixed(2)}</Text>
              </View>
              <View>
                <Text className="text-[10px] text-muted-foreground uppercase mb-0.5 text-center">Current</Text>
                <Text className="text-xs text-foreground font-medium">${market.currentPrice.toFixed(2)}</Text>
              </View>
              <View className="items-end">
                <Text className={`text-sm font-semibold ${market.value >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {market.value >= 0 ? '+' : ''}${market.value.toFixed(2)}
                </Text>
                <Text className={`text-xs ${market.change >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {market.change >= 0 ? '+' : ''}{market.change.toFixed(1)}%
                </Text>
              </View>
            </View>
          </GlassCard>
        ))}
      </View>
    </View>
  );
}

