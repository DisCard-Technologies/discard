import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTokenHoldings } from '../../hooks/useTokenHoldings';
import { useRwaHoldings, useRwaYieldSummary } from '../../hooks/useRwaHoldings';
import { usePredictionMarkets, usePnlSummary } from '../../hooks/usePredictionMarkets';
import { useAuth } from '../../stores/authConvex';
import type { JupiterHolding, RwaToken, PredictionPosition } from '../../types/holdings.types';

type TabType = 'tokens' | 'rwa' | 'markets';

export default function HoldingsScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('tokens');
  const [command, setCommand] = useState('');

  // Get user context
  const authState = useAuth();
  const userId = authState.userId;
  const walletAddress = authState.user?.solanaAddress ?? null;

  // Holdings hooks
  const {
    holdings: tokens,
    totalValue: tokensValue,
    isLoading: tokensLoading,
    isRefreshing: tokensRefreshing,
    error: tokensError,
    refresh: refreshTokens,
  } = useTokenHoldings(walletAddress);

  const {
    rwaTokens,
    totalValue: rwaValue,
    isLoading: rwaLoading,
  } = useRwaHoldings(walletAddress);

  const rwaYieldSummary = useRwaYieldSummary(rwaTokens);

  const {
    positions: marketPositions,
    totalValue: marketsValue,
    totalPnl: marketsPnl,
    isLoading: marketsLoading,
    refresh: refreshMarkets,
  } = usePredictionMarkets(userId, walletAddress);

  const pnlSummary = usePnlSummary(marketPositions);

  // Combined loading/refreshing state
  const isLoading = tokensLoading || rwaLoading || marketsLoading;
  const isRefreshing = tokensRefreshing;

  // Calculate totals
  const totalValue = tokensValue + rwaValue + marketsValue;

  const tabs = useMemo(() => [
    { id: 'tokens' as const, label: 'Tokens', value: tokensValue, icon: 'layers' },
    { id: 'rwa' as const, label: 'RWA', value: rwaValue, icon: 'business' },
    { id: 'markets' as const, label: 'Markets', value: marketsValue, icon: 'stats-chart' },
  ], [tokensValue, rwaValue, marketsValue]);

  const handleRefresh = async () => {
    await Promise.all([
      refreshTokens(),
      refreshMarkets(),
    ]);
  };

  const formatCurrency = (value: number) => {
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentage = (value: number) => {
    const prefix = value >= 0 ? '↗' : '↘';
    return `${prefix}${Math.abs(value).toFixed(2)}%`;
  };

  // Render token icon based on symbol
  const renderTokenIcon = (token: JupiterHolding) => {
    if (token.logoUri) {
      return (
        <Image
          source={{ uri: token.logoUri }}
          style={styles.tokenLogo}
          resizeMode="contain"
        />
      );
    }

    // Fallback icons for common tokens
    const symbol = token.symbol.toUpperCase();
    const symbolMap: Record<string, { char: string; color: string }> = {
      'SOL': { char: '◎', color: '#9945FF' },
      'USDC': { char: '◆', color: '#2775CA' },
      'USDT': { char: '◆', color: '#26A17B' },
      'ETH': { char: '◆', color: '#627EEA' },
      'BTC': { char: '₿', color: '#F7931A' },
      'JUP': { char: '♃', color: '#FF6B35' },
    };

    const iconInfo = symbolMap[symbol];
    if (iconInfo) {
      return <Text style={[styles.tokenIconChar, { color: iconInfo.color }]}>{iconInfo.char}</Text>;
    }

    // Default: first letter
    return <Text style={styles.tokenIconChar}>{symbol.charAt(0)}</Text>;
  };

  // Render loading skeleton
  const renderLoadingSkeleton = () => (
    <View style={styles.loadingContainer}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonContent}>
            <View style={styles.skeletonText} />
            <View style={styles.skeletonTextSmall} />
          </View>
          <View style={styles.skeletonValue} />
        </View>
      ))}
    </View>
  );

  // Render empty state
  const renderEmptyState = (message: string) => (
    <View style={styles.emptyContainer}>
      <Ionicons name="wallet-outline" size={48} color="#374151" />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );

  // Render error state
  const renderErrorState = (error: string, onRetry: () => void) => (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

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
              {isLoading ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                `${formatCurrency(totalValue)} total value`
              )}
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
                    <Ionicons
                      name={`${tab.icon}-outline` as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={isActive ? '#10B981' : '#6B7280'}
                    />
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                      {tab.label}
                    </Text>
                  </View>
                  <Text style={[styles.tabValue, isActive && styles.tabValueActive]}>
                    {formatCurrency(tab.value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Content Area */}
          <View style={styles.tokenList}>
            {/* Tokens Tab */}
            {activeTab === 'tokens' && (
              <>
                {tokensLoading && renderLoadingSkeleton()}
                {tokensError && renderErrorState(tokensError, refreshTokens)}
                {!tokensLoading && !tokensError && tokens.length === 0 &&
                  renderEmptyState('No tokens found in your wallet')}
                {!tokensLoading && !tokensError && tokens.map((token, index) => (
                  <View key={token.mint} style={styles.tokenRow}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.tokenContent}>
                      <View style={styles.tokenIconContainer}>
                        {renderTokenIcon(token)}
                      </View>
                      <View style={styles.tokenInfo}>
                        <View style={styles.tokenNameRow}>
                          <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                        </View>
                        <Text style={styles.tokenBalance}>
                          {token.balanceFormatted.toLocaleString()} {token.symbol}
                        </Text>
                      </View>
                      <View style={styles.tokenValueContainer}>
                        <Text style={styles.tokenValue}>{formatCurrency(token.valueUsd)}</Text>
                        <Text style={[
                          styles.tokenChange,
                          token.change24h >= 0 ? styles.positiveChange : styles.negativeChange
                        ]}>
                          {formatPercentage(token.change24h)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* RWA Tab */}
            {activeTab === 'rwa' && (
              <>
                {rwaLoading && renderLoadingSkeleton()}
                {!rwaLoading && rwaTokens.length === 0 &&
                  renderEmptyState('No RWA tokens found')}
                {!rwaLoading && rwaTokens.length > 0 && (
                  <>
                    {/* RWA Summary */}
                    <View style={styles.rwaSummary}>
                      <Text style={styles.rwaSummaryText}>
                        Est. Annual Yield: {formatCurrency(rwaYieldSummary.estimatedAnnualYield)}
                      </Text>
                      <Text style={styles.rwaSummarySubtext}>
                        Avg APY: {rwaYieldSummary.averageYield.toFixed(2)}%
                      </Text>
                    </View>
                    {rwaTokens.map((token, index) => (
                      <View key={token.mint} style={styles.tokenRow}>
                        {index > 0 && <View style={styles.divider} />}
                        <View style={styles.tokenContent}>
                          <View style={styles.rwaIconContainer}>
                            <Ionicons name="business" size={20} color="#3B82F6" />
                          </View>
                          <View style={styles.tokenInfo}>
                            <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                            <View style={styles.rwaDetails}>
                              <View style={styles.rwaBadge}>
                                <Text style={styles.rwaBadgeText}>{token.issuer}</Text>
                              </View>
                              {token.yield && (
                                <Text style={styles.rwaYield}>{token.yield}% APY</Text>
                              )}
                            </View>
                          </View>
                          <View style={styles.tokenValueContainer}>
                            <Text style={styles.tokenValue}>{formatCurrency(token.valueUsd)}</Text>
                            <Text style={[
                              styles.tokenChange,
                              token.change24h >= 0 ? styles.positiveChange : styles.negativeChange
                            ]}>
                              {formatPercentage(token.change24h)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}

            {/* Markets Tab */}
            {activeTab === 'markets' && (
              <>
                {marketsLoading && renderLoadingSkeleton()}
                {!marketsLoading && marketPositions.length === 0 &&
                  renderEmptyState('No prediction market positions')}
                {!marketsLoading && marketPositions.length > 0 && (
                  <>
                    {/* PnL Summary */}
                    <View style={styles.pnlSummary}>
                      <Text style={[
                        styles.pnlSummaryText,
                        pnlSummary.totalPnl >= 0 ? styles.positiveChange : styles.negativeChange
                      ]}>
                        {pnlSummary.totalPnl >= 0 ? '+' : ''}{formatCurrency(pnlSummary.totalPnl)}
                        ({pnlSummary.totalPnlPercent.toFixed(1)}%)
                      </Text>
                      <Text style={styles.pnlSummarySubtext}>
                        {pnlSummary.winningPositions}W / {pnlSummary.losingPositions}L
                      </Text>
                    </View>
                    {marketPositions.map((position, index) => (
                      <View key={position.marketId} style={styles.marketRow}>
                        {index > 0 && <View style={styles.divider} />}
                        <View style={styles.marketContent}>
                          <Text style={styles.marketQuestion}>{position.market.question}</Text>
                          <View style={styles.marketDetails}>
                            <View style={[
                              styles.sideBadge,
                              position.side === 'yes' ? styles.yesBadge : styles.noBadge
                            ]}>
                              <Text style={[
                                styles.sideBadgeText,
                                position.side === 'yes' ? styles.yesText : styles.noText
                              ]}>
                                {position.side.toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.sharesText}>
                              {position.shares} @ {(position.currentPrice * 100).toFixed(0)}¢
                            </Text>
                            <View style={styles.marketValue}>
                              <Text style={[
                                styles.marketPnL,
                                position.pnl >= 0 ? styles.positiveChange : styles.negativeChange
                              ]}>
                                {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
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
    overflow: 'hidden',
  },
  tokenLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenIconChar: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9CA3AF',
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
  // RWA specific styles
  rwaIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rwaDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  rwaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  rwaBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3B82F6',
  },
  rwaYield: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  rwaSummary: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  rwaSummaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rwaSummarySubtext: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  // Market specific styles
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
  sharesText: {
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
  pnlSummary: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  pnlSummaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pnlSummarySubtext: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  // Loading, empty, error states
  loadingContainer: {
    paddingVertical: 20,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonText: {
    width: 80,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    marginBottom: 8,
  },
  skeletonTextSmall: {
    width: 120,
    height: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(55, 65, 81, 0.3)',
  },
  skeletonValue: {
    width: 60,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10B981',
  },
  // Command bar
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
});
