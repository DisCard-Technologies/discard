import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type TabType = 'tokens' | 'assets' | 'markets';

// Mock data for demo
const mockTokens = [
  { symbol: 'ETH', name: 'Ethereum', balance: '12.847 ETH', value: 48234.12, change: 5.23, hasAuto: true },
  { symbol: 'USDC', name: 'USD Coin', balance: '45,892.00 USDC', value: 45892, change: 0.01, hasAuto: true },
  { symbol: 'BTC', name: 'Bitcoin', balance: '0.8421 BTC', value: 71284.67, change: 3.89, hasAuto: false },
  { symbol: 'SOL', name: 'Solana', balance: '234.5 SOL', value: 8421.45, change: -2.14, hasAuto: false },
  { symbol: 'ARB', name: 'Arbitrum', balance: '12,450 ARB', value: 2847.23, change: 8.92, hasAuto: false },
  { symbol: 'LINK', name: 'Chainlink', balance: '892.3 LINK', value: 1591.87, change: -1.23, hasAuto: false },
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
];

export default function HoldingsScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('tokens');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [command, setCommand] = useState('');

  // Calculate totals
  const tokensValue = mockTokens.reduce((sum, t) => sum + t.value, 0);
  const assetsValue = mockAssets.reduce((sum, a) => sum + a.value, 0);
  const totalValue = tokensValue + assetsValue;

  const tabs = [
    { id: 'tokens' as const, label: 'Tokens', value: tokensValue, icon: 'layers' },
    { id: 'assets' as const, label: 'Assets', value: assetsValue, icon: 'grid' },
    { id: 'markets' as const, label: 'Markets', value: 1859, icon: 'bar-chart' },
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const formatCurrency = (value: number) => {
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentage = (value: number) => {
    const prefix = value >= 0 ? '↗' : '↘';
    return `${prefix}${Math.abs(value).toFixed(2)}%`;
  };

  return (
    <View style={styles.container}>
      {/* Ambient glow background */}
      <View style={styles.ambientGlow} />
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#10B981" />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.title}>Holdings</Text>
              <View style={styles.aiPill}>
                <Ionicons name="sparkles" size={12} color="#10B981" />
                <Text style={styles.aiPillText}>AI Optimizing</Text>
              </View>
            </View>
            <Text style={styles.totalValue}>
              ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total value
            </Text>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={[
                    styles.tab,
                    isActive && styles.tabActive
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={styles.tabContent}>
                    {tab.id === 'tokens' && <Ionicons name="layers-outline" size={14} color={isActive ? '#10B981' : '#6B7280'} />}
                    {tab.id === 'assets' && <Ionicons name="grid-outline" size={14} color={isActive ? '#6B7280' : '#6B7280'} />}
                    {tab.id === 'markets' && <Ionicons name="stats-chart-outline" size={14} color={isActive ? '#6B7280' : '#6B7280'} />}
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                      {tab.label}
                    </Text>
                  </View>
                  <Text style={[styles.tabValue, isActive && styles.tabValueActive]}>
                    ${tab.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Token List */}
          <View style={styles.tokenList}>
            {activeTab === 'tokens' && mockTokens.map((token, index) => (
              <View key={token.symbol} style={styles.tokenRow}>
                {/* Divider line at top of each card */}
                {index > 0 && <View style={styles.divider} />}
                
                <View style={styles.tokenContent}>
                  {/* Left: Icon */}
                  <View style={styles.tokenIconContainer}>
                    {token.symbol === 'ETH' && <Text style={styles.ethSymbol}>◆</Text>}
                    {token.symbol === 'USDC' && <Text style={styles.usdcSymbol}>◆</Text>}
                    {token.symbol === 'BTC' && <Text style={styles.btcSymbol}>₿</Text>}
                    {token.symbol === 'SOL' && <Text style={styles.solSymbol}>◎</Text>}
                    {token.symbol === 'ARB' && (
                      <View style={styles.arbDiamondIcon}>
                        <View style={styles.arbDiamondShape} />
                      </View>
                    )}
                    {token.symbol === 'LINK' && <Text style={styles.linkSymbol}>●</Text>}
                  </View>

                  {/* Center: Symbol, Auto badge, Balance */}
                  <View style={styles.tokenInfo}>
                    <View style={styles.tokenNameRow}>
                      <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                      {token.hasAuto && (
                        <View style={styles.autoBadge}>
                          <Ionicons name="sparkles" size={8} color="#10B981" />
                          <Text style={styles.autoBadgeText}>AUTO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.tokenBalance}>{token.balance}</Text>
                  </View>

                  {/* Right: Value and Change */}
                  <View style={styles.tokenValueContainer}>
                    <Text style={styles.tokenValue}>{formatCurrency(token.value)}</Text>
                    <Text style={[
                      styles.tokenChange,
                      token.change >= 0 ? styles.positiveChange : styles.negativeChange
                    ]}>
                      {formatPercentage(token.change)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            {activeTab === 'assets' && mockAssets.map((asset, index) => (
              <View key={asset.name} style={styles.tokenRow}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.tokenContent}>
                  <View style={styles.assetIconContainer}>
                    <Text style={styles.assetEmoji}>{asset.image}</Text>
                  </View>
                  <View style={styles.tokenInfo}>
                    <Text style={styles.tokenSymbol}>{asset.name}</Text>
                    <View style={styles.assetTypeBadge}>
                      <Text style={styles.assetTypeText}>{asset.type}</Text>
                    </View>
                  </View>
                  <View style={styles.tokenValueContainer}>
                    <Text style={styles.tokenValue}>{formatCurrency(asset.value)}</Text>
                    <Text style={[
                      styles.tokenChange,
                      asset.change >= 0 ? styles.positiveChange : styles.negativeChange
                    ]}>
                      {formatPercentage(asset.change)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            {activeTab === 'markets' && mockMarkets.map((market, index) => (
              <View key={market.question} style={styles.marketRow}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.marketContent}>
                  <Text style={styles.marketQuestion}>{market.question}</Text>
                  <View style={styles.marketDetails}>
                    <View style={[styles.sideBadge, market.side === 'YES' ? styles.yesBadge : styles.noBadge]}>
                      <Text style={[styles.sideBadgeText, market.side === 'YES' ? styles.yesText : styles.noText]}>
                        {market.side}
                      </Text>
                    </View>
                    <Text style={styles.platformText}>{market.platform}</Text>
                    <View style={styles.marketValue}>
                      <Text style={[styles.marketPnL, market.value >= 0 ? styles.positiveChange : styles.negativeChange]}>
                        {market.value >= 0 ? '+' : ''}{formatCurrency(market.value)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Command Bar */}
        <View style={styles.commandBarContainer}>
          <View style={styles.commandBar}>
            <TouchableOpacity style={styles.commandIcon}>
              <Ionicons name="camera-outline" size={22} color="#6B7280" />
            </TouchableOpacity>
            
            <TextInput
              value={command}
              onChangeText={setCommand}
              placeholder="What would you like to do?"
              placeholderTextColor="#6B7280"
              style={styles.commandInput}
            />
            
            <TouchableOpacity style={styles.commandIcon}>
              <Ionicons name="mic-outline" size={22} color="#6B7280" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.sendButton}>
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  ambientGlow: {
    position: 'absolute',
    top: -150,
    left: '25%',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(31, 41, 55, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.5)',
  },
  aiPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    marginLeft: 6,
  },
  totalValue: {
    fontSize: 14,
    color: '#6B7280',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(31, 41, 55, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.3)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabLabelActive: {
    color: '#10B981',
  },
  tabValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabValueActive: {
    color: '#FFFFFF',
  },
  tokenList: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  tokenRow: {
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(55, 65, 81, 0.3)',
    marginVertical: 8,
  },
  tokenContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  tokenIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  ethSymbol: {
    fontSize: 18,
    color: '#9CA3AF',
  },
  usdcSymbol: {
    fontSize: 18,
    color: '#2775CA',
  },
  btcSymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F7931A',
  },
  solSymbol: {
    fontSize: 20,
    color: '#9945FF',
  },
  arbDiamondIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arbDiamondShape: {
    width: 12,
    height: 12,
    backgroundColor: '#28A0F0',
    transform: [{ rotate: '45deg' }],
  },
  linkSymbol: {
    fontSize: 18,
    color: '#375BD2',
  },
  tokenInfo: {
    flex: 1,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    gap: 4,
  },
  autoBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  tokenBalance: {
    fontSize: 13,
    color: '#6B7280',
  },
  tokenValueContainer: {
    alignItems: 'flex-end',
  },
  tokenValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tokenChange: {
    fontSize: 13,
  },
  positiveChange: {
    color: '#10B981',
  },
  negativeChange: {
    color: '#EF4444',
  },
  assetIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  assetEmoji: {
    fontSize: 22,
  },
  assetTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  assetTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'uppercase',
  },
  marketRow: {
    marginBottom: 2,
  },
  marketContent: {
    paddingVertical: 12,
  },
  marketQuestion: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  marketDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  yesBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  noBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  sideBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  yesText: {
    color: '#10B981',
  },
  noText: {
    color: '#EF4444',
  },
  platformText: {
    fontSize: 12,
    color: '#6B7280',
  },
  marketValue: {
    flex: 1,
    alignItems: 'flex-end',
  },
  marketPnL: {
    fontSize: 14,
    fontWeight: '600',
  },
  commandBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  commandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(31, 41, 55, 0.8)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(55, 65, 81, 0.5)',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  commandIcon: {
    padding: 10,
  },
  commandInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  // Token icon specific styles
  ethIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ethIconText: {
    fontSize: 18,
    color: '#9CA3AF',
  },
  coinIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinIconText: {
    fontSize: 18,
    color: '#2775CA',
  },
  btcIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F7931A',
  },
  solIcon: {
    fontSize: 20,
    color: '#9945FF',
  },
  arbIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arbDiamond: {
    width: 12,
    height: 12,
    backgroundColor: '#28A0F0',
    transform: [{ rotate: '45deg' }],
  },
  linkIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkIconText: {
    fontSize: 18,
    color: '#375BD2',
  },
});
