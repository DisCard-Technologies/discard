import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Dimensions, ActivityIndicator, TextInput, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopBar } from '@/components/top-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth, useCurrentUserId } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { useArciumYield } from '@/hooks/useArciumYield';
import { positiveColor, negativeColor } from '@/constants/theme';
import type { YieldVault, PrivateVaultPosition } from '@/services/arciumYieldClient';

// Props for the content component when used in pager
export interface StrategyScreenContentProps {
  onNavigateToHome?: () => void;
  onNavigateToCard?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 180;

type ViewMode = 'wallets' | 'strategy';

// Wallet avatars for the filter row
interface WalletAvatar {
  id: string;
  label: string;
  color: string;
  isAll?: boolean;
}

const walletAvatars: WalletAvatar[] = [
  { id: 'all', label: 'A', color: '#10B981', isAll: true },
  { id: 'main', label: '', color: '#3b82f6' },
  { id: 'trading', label: '', color: '#f97316' },
  { id: 'savings', label: '', color: '#8b5cf6' },
  { id: 'defi', label: '', color: '#ef4444' },
];

// Generate mock chart data
function generateChartData(): number[] {
  const points: number[] = [];
  let value = 3000;
  for (let i = 0; i < 50; i++) {
    value += (Math.random() - 0.45) * 200;
    value = Math.max(2000, Math.min(4500, value));
    points.push(value);
  }
  return points;
}

// Create SVG path from data points
function createChartPath(data: number[], width: number, height: number): string {
  if (data.length === 0) return '';
  
  const minValue = Math.min(...data);
  const maxValue = Math.max(...data);
  const range = maxValue - minValue || 1;
  
  const xStep = width / (data.length - 1);
  const padding = 10;
  const chartHeight = height - padding * 2;
  
  const points = data.map((value, index) => {
    const x = index * xStep;
    const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
    return { x, y };
  });
  
  // Create smooth curve using quadratic bezier
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    path += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
  }
  path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  
  return path;
}

// Create area path for gradient fill
function createAreaPath(data: number[], width: number, height: number): string {
  if (data.length === 0) return '';
  
  const linePath = createChartPath(data, width, height);
  const lastPoint = data.length - 1;
  const xStep = width / (data.length - 1);
  
  return `${linePath} L ${lastPoint * xStep} ${height} L 0 ${height} Z`;
}

// Simple Line Chart Component
function PortfolioChart({ data, primaryColor }: { data: number[]; primaryColor: string }) {
  const linePath = createChartPath(data, CHART_WIDTH, CHART_HEIGHT);
  const areaPath = createAreaPath(data, CHART_WIDTH, CHART_HEIGHT);
  
  return (
    <View style={styles.chartContainer}>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Defs>
          <SvgLinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={primaryColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#chartGradient)" />
        <Path d={linePath} stroke={primaryColor} strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}

export function StrategyScreenContent({ onNavigateToHome, onNavigateToCard }: StrategyScreenContentProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  // Real data from hooks
  const { user } = useAuth();
  const userId = useCurrentUserId();
  const walletAddress = user?.solanaAddress || null;

  const {
    holdings: tokenHoldings,
    totalValue: tokenTotal,
    isLoading: tokensLoading
  } = useTokenHoldings(walletAddress);

  // Yield vault hook
  const {
    vaults,
    positions,
    isLoading: yieldLoading,
    state: yieldState,
    activePositionsCount,
    getDepositQuote,
    deposit,
    getWithdrawQuote,
    withdraw,
    formatApy,
    formatTvl,
    getRiskColor,
    isAvailable: isYieldAvailable,
  } = useArciumYield(walletAddress || undefined);

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('wallets');
  const [selectedWallet, setSelectedWallet] = useState('all');
  const [chartData] = useState(() => generateChartData());

  // Yield vault state
  const [selectedVault, setSelectedVault] = useState<YieldVault | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');

  // Calculate portfolio values
  const walletsValue = tokenTotal || 0;
  // Estimate DeFi value from active positions (encrypted, so we show count-based estimate)
  const defiStrategyValue = activePositionsCount * 500; // Placeholder - real value is private
  const totalPortfolioValue = walletsValue + defiStrategyValue;

  // Filter vaults by risk level
  const filteredVaults = useMemo(() => {
    if (riskFilter === 'all') return vaults;
    return vaults.filter(v => v.riskLevel === riskFilter);
  }, [vaults, riskFilter]);

  // Validate deposit amount
  const isValidDeposit = useMemo(() => {
    if (!selectedVault || !depositAmount) return false;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return false;
    const amountBaseUnits = BigInt(Math.floor(amount * 1_000_000));
    if (amountBaseUnits < selectedVault.minDeposit) return false;
    if (selectedVault.maxDeposit > 0n && amountBaseUnits > selectedVault.maxDeposit) return false;
    return true;
  }, [selectedVault, depositAmount]);

  // Calculate real daily change from token holdings
  const dailyChange = useMemo(() => {
    if (!tokenHoldings || tokenHoldings.length === 0) return 0;
    // Calculate weighted average change
    let totalChange = 0;
    tokenHoldings.forEach(token => {
      if (token.valueUsd > 0 && token.change24h) {
        totalChange += (token.change24h * token.valueUsd) / (walletsValue || 1);
      }
    });
    return totalChange;
  }, [tokenHoldings, walletsValue]);

  const dailyChangeAmount = Math.abs(dailyChange * walletsValue / 100);
  const isPositive = dailyChange >= 0;


  // Yield vault handlers
  const handleSelectVault = (vault: YieldVault) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedVault(vault);
    setDepositAmount('');
  };

  const handleDeposit = async () => {
    if (!selectedVault || !depositAmount || !walletAddress) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const amountBaseUnits = BigInt(Math.floor(parseFloat(depositAmount) * 1_000_000));
      const quote = await getDepositQuote(selectedVault.id, amountBaseUnits);

      if (!quote) {
        Alert.alert('Error', 'Failed to get deposit quote. Please try again.');
        return;
      }

      // In production, get from Turnkey
      const mockPrivateKey = new Uint8Array(32);
      const result = await deposit(quote, mockPrivateKey);

      if (result?.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Deposit Complete!',
          `Your deposit to ${selectedVault.name} is now earning yield privately.\n\nAmount is hidden on-chain.`,
          [{ text: 'OK', onPress: () => { setSelectedVault(null); setDepositAmount(''); } }]
        );
      } else {
        Alert.alert('Error', result?.error || 'Deposit failed. Please try again.');
      }
    } catch (error) {
      console.error('[Strategy] Deposit error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const handleWithdraw = async (position: PrivateVaultPosition) => {
    if (!walletAddress) return;

    Alert.alert(
      'Withdraw Position',
      'Withdraw your principal + yield to a stealth address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              const quote = await getWithdrawQuote(position.id);
              if (!quote) {
                Alert.alert('Error', 'Failed to get withdrawal quote.');
                return;
              }

              const mockPrivateKey = new Uint8Array(32);
              const result = await withdraw(quote, mockPrivateKey);

              if (result?.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Withdrawal Complete', 'Funds sent to your stealth address.');
              } else {
                Alert.alert('Error', result?.error || 'Withdrawal failed.');
              }
            } catch (error) {
              console.error('[Strategy] Withdraw error:', error);
              Alert.alert('Error', 'Something went wrong.');
            }
          },
        },
      ]
    );
  };

  // Navigation handlers for TopBar - use callbacks if provided, otherwise use router
  const handlePortfolioTap = onNavigateToHome || (() => {});

  const handleCardTap = onNavigateToCard || (() => router.push('/card'));

  // Format date for display
  const formattedDate = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) + ', at ' + new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      {/* Top Bar */}
      <TopBar
        walletAddress={walletAddress || ''}
        onPortfolioTap={handlePortfolioTap}
        onCardTap={handleCardTap}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Portfolio Header */}
        <View style={styles.portfolioHeader}>
          <ThemedText style={[styles.portfolioLabel, { color: mutedColor }]}>
            Your Portfolio
          </ThemedText>
          <ThemedText style={styles.portfolioValue}>
            $ {totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </ThemedText>
          
          {/* Daily Change Badge */}
          <View style={styles.changeContainer}>
            <View
              style={[
                styles.changeBadge,
                { backgroundColor: isPositive ? `${positiveColor}30` : `${negativeColor}30` },
              ]}
            >
              <ThemedText
                style={[styles.changePercent, { color: isPositive ? positiveColor : negativeColor }]}
              >
                {isPositive ? '+' : ''}{dailyChange.toFixed(2)}%
              </ThemedText>
            </View>
            <ThemedText style={[styles.changeAmount, { color: mutedColor }]}>
              ($ {dailyChangeAmount.toFixed(2)}) Today
            </ThemedText>
          </View>
        </View>

        {/* Summary Cards Row */}
        <View style={styles.summaryCardsRow}>
          {/* Net Worth Card */}
          <Pressable
            style={[styles.summaryCard, { backgroundColor: cardBg }]}
            onPress={() => setViewMode('wallets')}
          >
            <View style={styles.summaryCardHeader}>
              <View style={[styles.summaryCardIcon, { backgroundColor: `${borderColor}` }]}>
                <Ionicons name="diamond-outline" size={16} color={mutedColor} />
              </View>
              <ThemedText style={[styles.summaryCardLabel, { color: mutedColor }]}>
                Net Worth
              </ThemedText>
            </View>
            <ThemedText style={styles.summaryCardValue}>
              $ {walletsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </ThemedText>
          </Pressable>

          {/* DeFi Strategy Card */}
          <Pressable
            style={[styles.summaryCard, { backgroundColor: cardBg }]}
            onPress={() => setViewMode('strategy')}
          >
            <View style={styles.summaryCardHeader}>
              <View style={[styles.summaryCardIcon, { backgroundColor: `${borderColor}` }]}>
                <Ionicons name="flash-outline" size={16} color={primaryColor} />
              </View>
              <ThemedText style={[styles.summaryCardLabel, { color: mutedColor }]}>
                DeFi Strategy
              </ThemedText>
            </View>
            <ThemedText style={styles.summaryCardValue}>
              $ {defiStrategyValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </ThemedText>
          </Pressable>
        </View>

        {/* View Mode Toggle */}
        <View style={[styles.viewToggle, { backgroundColor: cardBg }]}>
          <Pressable
            onPress={() => setViewMode('wallets')}
            style={[
              styles.viewToggleButton,
              viewMode === 'wallets' && styles.viewToggleButtonActive,
            ]}
          >
            <ThemedText
              style={[
                styles.viewToggleText,
                { color: viewMode === 'wallets' ? textColor : mutedColor },
              ]}
            >
              Holdings
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('strategy')}
            style={[
              styles.viewToggleButton,
              viewMode === 'strategy' && styles.viewToggleButtonActive,
            ]}
          >
            <ThemedText
              style={[
                styles.viewToggleText,
                { color: viewMode === 'strategy' ? textColor : mutedColor },
              ]}
            >
              Strategy
            </ThemedText>
          </Pressable>
        </View>

        {/* Wallet Filter Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.walletFilterRow}
        >
          {walletAvatars.map((wallet) => (
            <Pressable
              key={wallet.id}
              onPress={() => setSelectedWallet(wallet.id)}
              style={[
                styles.walletAvatar,
                { backgroundColor: wallet.color },
                selectedWallet === wallet.id && styles.walletAvatarSelected,
              ]}
            >
              {wallet.isAll ? (
                <ThemedText style={styles.walletAvatarText}>{wallet.label}</ThemedText>
              ) : (
                <View style={styles.walletAvatarDot} />
              )}
            </Pressable>
          ))}
          <Pressable style={styles.walletAvatarMore}>
            <Ionicons name="chevron-forward" size={16} color={mutedColor} />
          </Pressable>
        </ScrollView>

        {/* Wallet Value with Date */}
        <View style={styles.walletValueSection}>
          <ThemedText style={styles.walletValueAmount}>
            $ {walletsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </ThemedText>
          <ThemedText style={[styles.walletValueDate, { color: isPositive ? positiveColor : negativeColor }]}>
            {isPositive ? '+' : ''}{dailyChange.toFixed(2)}% {formattedDate}
          </ThemedText>
        </View>

        {/* Portfolio Chart */}
        <PortfolioChart data={chartData} primaryColor={primaryColor} />

        {/* Token Holdings (when in wallets mode) */}
        {viewMode === 'wallets' && (
          <View style={styles.holdingsSection}>
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              HOLDINGS
            </ThemedText>
            
            {tokensLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                  Loading holdings...
                </ThemedText>
              </View>
            ) : tokenHoldings && tokenHoldings.length > 0 ? (
              tokenHoldings.slice(0, 5).map((token) => (
                <ThemedView
                  key={token.mint}
                  style={styles.tokenRow}
                  lightColor="#f4f4f5"
                  darkColor="#1c1c1e"
                >
                  <View style={[styles.tokenIcon, { backgroundColor: borderColor }]}>
                    <ThemedText style={styles.tokenIconText}>
                      {token.symbol.charAt(0)}
                    </ThemedText>
                  </View>
                  <View style={styles.tokenInfo}>
                    <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
                    <ThemedText style={[styles.tokenBalance, { color: mutedColor }]}>
                      {token.balanceFormatted.toLocaleString()} {token.symbol}
                    </ThemedText>
                  </View>
                  <View style={styles.tokenValue}>
                    <ThemedText style={styles.tokenValueText}>
                      ${token.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.tokenChange,
                        { color: (token.change24h || 0) >= 0 ? positiveColor : negativeColor },
                      ]}
                    >
                      {(token.change24h || 0) >= 0 ? '+' : ''}
                      {(token.change24h || 0).toFixed(2)}%
                    </ThemedText>
                  </View>
                </ThemedView>
              ))
            ) : (
              <View style={styles.emptyState}>
                <View style={[styles.emptyStateIcon, { backgroundColor: `${primaryColor}10` }]}>
                  <Ionicons name="diamond-outline" size={32} color={primaryColor} />
                </View>
                <ThemedText style={styles.emptyStateTitle}>No holdings yet</ThemedText>
                <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                  {walletAddress ? 'Your token holdings will appear here' : 'Connect your wallet to see holdings'}
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Strategy View - Yield Vaults */}
        {viewMode === 'strategy' && (
          <View style={styles.strategySection}>
            {/* Privacy Info Banner */}
            {isYieldAvailable && (
              <View style={[styles.privacyBanner, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }]}>
                <Ionicons name="shield-checkmark" size={20} color="#22c55e" />
                <View style={styles.privacyBannerText}>
                  <ThemedText style={[styles.privacyBannerTitle, { color: '#22c55e' }]}>
                    Private Yield Earning
                  </ThemedText>
                  <ThemedText style={[styles.privacyBannerDesc, { color: mutedColor }]}>
                    Deposit amounts hidden on-chain via Arcium MPC
                  </ThemedText>
                </View>
              </View>
            )}

            {/* User Positions Section */}
            {positions.length > 0 && (
              <>
                <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
                  YOUR POSITIONS
                </ThemedText>
                {positions.map((position) => {
                  const vault = vaults.find(v => v.id === position.vaultId);
                  if (!vault) return null;
                  const isLocked = position.lockExpiresAt > 0 && Date.now() < position.lockExpiresAt;

                  return (
                    <View
                      key={position.id}
                      style={[styles.positionCard, { backgroundColor: cardBg, borderColor: position.status === 'active' ? `${primaryColor}40` : borderColor }]}
                    >
                      <View style={styles.positionHeader}>
                        <View style={[styles.vaultIcon, { backgroundColor: `${getRiskColor(vault.riskLevel)}20` }]}>
                          <ThemedText style={[styles.vaultIconText, { color: getRiskColor(vault.riskLevel) }]}>
                            {vault.assetSymbol.charAt(0)}
                          </ThemedText>
                        </View>
                        <View style={styles.positionInfo}>
                          <ThemedText style={styles.positionVaultName}>{vault.name}</ThemedText>
                          <ThemedText style={[styles.positionDate, { color: mutedColor }]}>
                            Earning {formatApy(vault.apy)}
                          </ThemedText>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: position.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)' }]}>
                          <ThemedText style={[styles.statusBadgeText, { color: position.status === 'active' ? '#22c55e' : mutedColor }]}>
                            {position.status === 'active' ? 'Active' : position.status}
                          </ThemedText>
                        </View>
                      </View>

                      <View style={styles.positionDetails}>
                        <View style={styles.positionDetailRow}>
                          <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>Amount</ThemedText>
                          <View style={styles.privateValue}>
                            <Ionicons name="eye-off" size={12} color={mutedColor} />
                            <ThemedText style={[styles.privateValueText, { color: mutedColor }]}>Private</ThemedText>
                          </View>
                        </View>
                        <View style={styles.positionDetailRow}>
                          <ThemedText style={[styles.positionLabel, { color: mutedColor }]}>Yield</ThemedText>
                          <View style={styles.privateValue}>
                            <Ionicons name="eye-off" size={12} color="#22c55e" />
                            <ThemedText style={[styles.privateValueText, { color: '#22c55e' }]}>Accruing</ThemedText>
                          </View>
                        </View>
                      </View>

                      {position.status === 'active' && !isLocked && (
                        <Pressable
                          onPress={() => handleWithdraw(position)}
                          style={[styles.withdrawButton, { borderColor: primaryColor }]}
                        >
                          <ThemedText style={[styles.withdrawButtonText, { color: primaryColor }]}>Withdraw</ThemedText>
                        </Pressable>
                      )}
                      {isLocked && (
                        <View style={styles.lockInfo}>
                          <Ionicons name="lock-closed" size={12} color={mutedColor} />
                          <ThemedText style={[styles.lockInfoText, { color: mutedColor }]}>
                            Locked for {Math.ceil((position.lockExpiresAt - Date.now()) / 1000 / 60)} min
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {/* Yield Vaults Section */}
            <ThemedText style={[styles.sectionTitle, { color: mutedColor, marginTop: positions.length > 0 ? 24 : 0 }]}>
              YIELD VAULTS
            </ThemedText>

            {/* Risk Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.riskFilters}>
              {(['all', 'low', 'medium', 'high'] as const).map((risk) => {
                const isActive = riskFilter === risk;
                const labels = { all: 'All', low: 'Low Risk', medium: 'Medium', high: 'High Yield' };
                const colors = { all: primaryColor, low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
                return (
                  <Pressable
                    key={risk}
                    onPress={() => setRiskFilter(risk)}
                    style={[styles.riskChip, { backgroundColor: isActive ? colors[risk] : cardBg, borderColor: isActive ? colors[risk] : borderColor }]}
                  >
                    <ThemedText style={[styles.riskChipText, { color: isActive ? '#fff' : textColor }]}>
                      {labels[risk]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Vault Cards */}
            {yieldLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>Loading vaults...</ThemedText>
              </View>
            ) : filteredVaults.length > 0 ? (
              filteredVaults.map((vault) => {
                const isSelected = selectedVault?.id === vault.id;
                const riskColor = getRiskColor(vault.riskLevel);
                return (
                  <Pressable
                    key={vault.id}
                    onPress={() => handleSelectVault(vault)}
                    style={[styles.vaultCard, { backgroundColor: isSelected ? `${riskColor}15` : cardBg, borderColor: isSelected ? riskColor : borderColor }]}
                  >
                    <View style={[styles.vaultIcon, { backgroundColor: `${riskColor}20` }]}>
                      <ThemedText style={[styles.vaultIconText, { color: riskColor }]}>
                        {vault.assetSymbol.charAt(0)}
                      </ThemedText>
                    </View>
                    <View style={styles.vaultInfo}>
                      <ThemedText style={styles.vaultName}>{vault.name}</ThemedText>
                      <ThemedText style={[styles.vaultTvl, { color: mutedColor }]}>
                        TVL: {formatTvl(vault.tvl)} {vault.lockPeriod > 0 && `• ${Math.floor(vault.lockPeriod / 3600)}h lock`}
                      </ThemedText>
                    </View>
                    <View style={styles.vaultApy}>
                      <ThemedText style={[styles.vaultApyValue, { color: riskColor }]}>{formatApy(vault.apy)}</ThemedText>
                      <ThemedText style={[styles.vaultApyLabel, { color: mutedColor }]}>APY</ThemedText>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={24} color={riskColor} />}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>No vaults match your filter</ThemedText>
              </View>
            )}

            {/* Deposit Flow */}
            {selectedVault && (
              <View style={[styles.depositSection, { backgroundColor: cardBg, borderColor }]}>
                <ThemedText style={styles.depositTitle}>Deposit to {selectedVault.name}</ThemedText>
                <ThemedText style={[styles.depositDesc, { color: mutedColor }]}>{selectedVault.description}</ThemedText>

                {/* Quick Amount Buttons */}
                <View style={styles.quickAmounts}>
                  {[100, 500, 1000, 5000].map((amt) => (
                    <Pressable
                      key={amt}
                      onPress={() => setDepositAmount(amt.toString())}
                      style={[styles.quickAmountBtn, { backgroundColor: depositAmount === amt.toString() ? `${primaryColor}20` : 'transparent', borderColor: depositAmount === amt.toString() ? primaryColor : borderColor }]}
                    >
                      <ThemedText style={[styles.quickAmountText, depositAmount === amt.toString() && { color: primaryColor }]}>
                        {amt}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>

                {/* Amount Input */}
                <View style={[styles.amountInputContainer, { borderColor }]}>
                  <TextInput
                    style={[styles.amountInput, { color: textColor }]}
                    value={depositAmount}
                    onChangeText={setDepositAmount}
                    placeholder="Enter amount"
                    placeholderTextColor={mutedColor}
                    keyboardType="decimal-pad"
                  />
                  <ThemedText style={[styles.amountSymbol, { color: mutedColor }]}>{selectedVault.assetSymbol}</ThemedText>
                </View>

                {/* Estimated Yield */}
                {depositAmount && parseFloat(depositAmount) > 0 && (
                  <View style={[styles.yieldEstimate, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                    <Ionicons name="trending-up" size={16} color="#22c55e" />
                    <ThemedText style={[styles.yieldEstimateText, { color: '#22c55e' }]}>
                      Est. yield: +{(parseFloat(depositAmount) * selectedVault.apy / 100).toFixed(2)} {selectedVault.assetSymbol}/year
                    </ThemedText>
                  </View>
                )}

                {/* Privacy Badge */}
                <View style={[styles.privacyBadge, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                  <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
                  <ThemedText style={[styles.privacyBadgeText, { color: '#22c55e' }]}>Amount Hidden On-Chain</ThemedText>
                </View>

                {/* Deposit Button */}
                <Pressable
                  onPress={handleDeposit}
                  disabled={!isValidDeposit || yieldLoading}
                  style={[styles.depositButton, { backgroundColor: isValidDeposit ? primaryColor : `${mutedColor}50` }]}
                >
                  {yieldState.phase === 'depositing' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={18} color="#fff" />
                      <ThemedText style={styles.depositButtonText}>Deposit Privately</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

export default function StrategyScreen() {
  return <StrategyScreenContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  
  // Portfolio Header
  portfolioHeader: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  portfolioLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  portfolioValue: {
    fontSize: 40,
    fontWeight: '600',
    letterSpacing: -1,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changePercent: {
    fontSize: 13,
    fontWeight: '600',
  },
  changeAmount: {
    fontSize: 13,
  },

  // Summary Cards
  summaryCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  summaryCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCardLabel: {
    fontSize: 12,
  },
  summaryCardValue: {
    fontSize: 18,
    fontWeight: '600',
  },

  // View Toggle
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginTop: 20,
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  viewToggleButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Wallet Filter
  walletFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  walletAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletAvatarSelected: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  walletAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  walletAvatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  walletAvatarMore: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Wallet Value
  walletValueSection: {
    marginBottom: 8,
  },
  walletValueAmount: {
    fontSize: 28,
    fontWeight: '600',
  },
  walletValueDate: {
    fontSize: 12,
    marginTop: 2,
  },

  // Chart
  chartContainer: {
    marginVertical: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Holdings Section
  holdingsSection: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tokenIconText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tokenInfo: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenBalance: {
    fontSize: 12,
    marginTop: 2,
  },
  tokenValue: {
    alignItems: 'flex-end',
  },
  tokenValueText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenChange: {
    fontSize: 12,
    marginTop: 2,
  },

  // Strategy Section
  strategySection: {
    marginTop: 16,
    gap: 12,
  },
  strategyCard: {
    padding: 16,
    borderRadius: 16,
  },
  strategyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  strategyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strategyCardInfo: {
    flex: 1,
  },
  strategyName: {
    fontSize: 16,
    fontWeight: '600',
  },
  strategyDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  strategyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  strategyStatLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  strategyStatValue: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  addStrategyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addStrategyText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Loading & Empty States
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },

  // Privacy Banner
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  privacyBannerText: {
    flex: 1,
  },
  privacyBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  privacyBannerDesc: {
    fontSize: 12,
    marginTop: 2,
  },

  // Risk Filters
  riskFilters: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  riskChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  riskChipText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Vault Card
  vaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  vaultIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultIconText: {
    fontSize: 16,
    fontWeight: '600',
  },
  vaultInfo: {
    flex: 1,
  },
  vaultName: {
    fontSize: 14,
    fontWeight: '600',
  },
  vaultTvl: {
    fontSize: 12,
    marginTop: 2,
  },
  vaultApy: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  vaultApyValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  vaultApyLabel: {
    fontSize: 10,
    marginTop: 1,
  },

  // Position Card
  positionCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  positionInfo: {
    flex: 1,
  },
  positionVaultName: {
    fontSize: 14,
    fontWeight: '600',
  },
  positionDate: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  positionDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 8,
  },
  positionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  positionLabel: {
    fontSize: 12,
  },
  privateValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  privateValueText: {
    fontSize: 12,
    fontWeight: '500',
  },
  withdrawButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  withdrawButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  lockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  lockInfoText: {
    fontSize: 12,
  },

  // Deposit Section
  depositSection: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  depositTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  depositDesc: {
    fontSize: 12,
    marginBottom: 16,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickAmountBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 13,
    fontWeight: '500',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    paddingVertical: 14,
  },
  amountSymbol: {
    fontSize: 14,
    fontWeight: '500',
  },
  yieldEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  yieldEstimateText: {
    fontSize: 13,
    fontWeight: '500',
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  privacyBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  depositButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  depositButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
