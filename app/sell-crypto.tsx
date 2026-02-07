/**
 * Sell Crypto Screen
 *
 * Confidential cashout pipeline: any held asset → USDC → Privacy Cash → fiat.
 * Supports all wallet tokens (incl. xStocks/RWA), shielded USDC, and standard tokens.
 * Pipeline progress stepper visible during execution with retry/cancel support.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, TextInput, ActivityIndicator, Keyboard, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { PressableScale } from 'pressto';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/stores/authConvex';
import { useMoonPay } from '@/hooks/useMoonPay';
import { useCashoutPipeline, type CashoutAsset, type CashoutPhase } from '@/hooks/useCashoutPipeline';

// Quick percentage buttons for selling
const QUICK_PERCENTAGES = [25, 50, 75, 100];

// Icon for asset (fallback when no logoUri)
function getAssetIcon(asset: CashoutAsset): string {
  if (asset.isShielded) return '\u{1F6E1}'; // shield emoji
  const map: Record<string, string> = {
    USDC: '$', SOL: '\u25CE', ETH: '\u25C7', USDT: '\u20AE',
  };
  return map[asset.symbol] || '\u{1F4B0}'; // default to money bag
}

// Pipeline step config for the stepper
const PIPELINE_STEPS: { phase: CashoutPhase; label: string; icon: string }[] = [
  { phase: 'compliance_prescreen', label: 'Compliance check', icon: 'shield-checkmark' },
  { phase: 'creating_swap_address', label: 'Creating private address', icon: 'key' },
  { phase: 'swapping', label: 'Swapping to USDC', icon: 'swap-horizontal' },
  { phase: 'swap_complete', label: 'Privacy delay', icon: 'time' },
  { phase: 'shielding', label: 'Shielding funds', icon: 'lock-closed' },
  { phase: 'creating_cashout_address', label: 'Cashout address', icon: 'wallet' },
  { phase: 'unshielding', label: 'Preparing cashout', icon: 'arrow-up' },
  { phase: 'sending_to_moonpay', label: 'Sending to MoonPay', icon: 'cash' },
  { phase: 'awaiting_fiat', label: 'Awaiting fiat', icon: 'checkmark-circle' },
];

// Which steps to show for each path
function getStepsForPath(path?: string): typeof PIPELINE_STEPS {
  if (path === 'usdc_pool') {
    return PIPELINE_STEPS.filter((s) =>
      ['creating_cashout_address', 'unshielding', 'sending_to_moonpay', 'awaiting_fiat'].includes(s.phase)
    );
  }
  if (path === 'usdc_wallet') {
    return PIPELINE_STEPS.filter((s) =>
      ['compliance_prescreen', 'shielding', 'creating_cashout_address', 'unshielding', 'sending_to_moonpay', 'awaiting_fiat'].includes(s.phase)
    );
  }
  // xstock_full — all steps
  return PIPELINE_STEPS;
}

export default function SellCryptoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ currency?: string }>();

  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // User
  const { user } = useAuth();
  const solanaAddress = user?.solanaAddress || null;
  const ethereumAddress = user?.ethereumAddress || null;

  // Pipeline hook (replaces old usePrivateCashout + useTokenHoldings + hardcoded config)
  const pipeline = useCashoutPipeline();

  // Selected asset
  const initialSymbol = params.currency?.toUpperCase() || 'USDC';
  const [selectedAsset, setSelectedAsset] = useState<CashoutAsset | null>(null);

  // Set initial asset when list loads
  useEffect(() => {
    if (pipeline.allCashoutAssets.length > 0 && !selectedAsset) {
      const fromParams = pipeline.allCashoutAssets.find(
        (a) => a.symbol.toUpperCase() === initialSymbol
      );
      setSelectedAsset(fromParams || pipeline.allCashoutAssets[0]);
    }
  }, [pipeline.allCashoutAssets, initialSymbol, selectedAsset]);

  // Amount input
  const [amount, setAmount] = useState('');
  const numericAmount = parseFloat(amount) || 0;

  // Current balance for selected asset
  const currentBalance = selectedAsset ? parseFloat(selectedAsset.balance) / Math.pow(10, selectedAsset.decimals) : 0;

  // MoonPay for fallback
  const { openSell, isReady, isLoading: moonPayLoading, error: moonPayError } = useMoonPay({
    solanaAddress,
    ethereumAddress,
    defaultCurrency: 'usdc_sol',
  });

  // Handle sell action — starts the pipeline
  const handleSell = useCallback(async () => {
    if (numericAmount <= 0 || !selectedAsset) return;

    // Convert display amount to base units
    const amountBaseUnits = Math.floor(numericAmount * Math.pow(10, selectedAsset.decimals));

    await pipeline.startCashout(selectedAsset, amountBaseUnits, 'USD');
  }, [numericAmount, selectedAsset, pipeline]);

  // Quick percentage
  const handleQuickPercentage = (percentage: number) => {
    const value = (currentBalance * percentage) / 100;
    setAmount(value.toFixed(6).replace(/\.?0+$/, ''));
  };

  const isValidAmount = numericAmount > 0 && numericAmount <= currentBalance;
  const hasAssets = pipeline.allCashoutAssets.length > 0;
  const isLoadingAssets = !hasAssets && pipeline.allCashoutAssets.length === 0;

  // Pipeline active — show stepper instead of input
  const isPipelineActive = pipeline.isActive;

  // Steps for current path
  const pipelineSteps = getStepsForPath(pipeline.state.path);

  // Step status helper
  const getStepStatus = (stepPhase: CashoutPhase): 'pending' | 'active' | 'completed' | 'error' => {
    const { phase, failedAtPhase } = pipeline.state;
    if (phase === 'error' && failedAtPhase === stepPhase) return 'error';

    const allPhases: CashoutPhase[] = pipelineSteps.map((s) => s.phase);
    const currentIdx = allPhases.indexOf(phase as CashoutPhase);
    const stepIdx = allPhases.indexOf(stepPhase);

    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'active';
    return 'pending';
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <PressableScale onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>Sell Crypto</ThemedText>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={styles.touchableContent}>

        {/* ===== PIPELINE ACTIVE: Show progress stepper ===== */}
        {isPipelineActive && (
          <View style={styles.pipelineContainer}>
            {/* Progress bar */}
            <View style={[styles.progressBarBg, { backgroundColor: borderColor }]}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${pipeline.progressPercent}%`, backgroundColor: '#22c55e' },
                ]}
              />
            </View>

            {/* Current phase label */}
            <View style={styles.phaseHeader}>
              <ThemedText style={styles.phaseLabel}>{pipeline.currentPhaseLabel}</ThemedText>
              {pipeline.estimatedTimeRemaining && (
                <ThemedText style={[styles.phaseTime, { color: mutedColor }]}>
                  {pipeline.estimatedTimeRemaining}
                </ThemedText>
              )}
            </View>

            {/* Jitter countdown */}
            {pipeline.state.phase === 'swap_complete' && pipeline.state.jitterRemainingMs !== undefined && (
              <View style={[styles.jitterCard, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }]}>
                <Ionicons name="time" size={18} color="#22c55e" />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.jitterTitle, { color: '#22c55e' }]}>
                    Privacy delay... {Math.ceil(pipeline.state.jitterRemainingMs / 1000)}s
                  </ThemedText>
                  <ThemedText style={[styles.jitterDesc, { color: mutedColor }]}>
                    Random delay breaks timing correlation between your swap and shield
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Vertical stepper */}
            <View style={styles.stepper}>
              {pipelineSteps.map((step, i) => {
                const status = getStepStatus(step.phase);
                const isLast = i === pipelineSteps.length - 1;

                const dotColor =
                  status === 'completed' ? '#22c55e' :
                  status === 'active' ? '#3b82f6' :
                  status === 'error' ? '#ef4444' :
                  `${mutedColor}40`;

                const labelColor =
                  status === 'completed' ? '#22c55e' :
                  status === 'active' ? textColor :
                  status === 'error' ? '#ef4444' :
                  mutedColor;

                return (
                  <View key={step.phase} style={styles.stepRow}>
                    <View style={styles.stepIndicator}>
                      <View style={[styles.stepDot, { backgroundColor: dotColor }]}>
                        {status === 'completed' && (
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        )}
                        {status === 'active' && (
                          <ActivityIndicator size="small" color="#fff" />
                        )}
                        {status === 'error' && (
                          <Ionicons name="close" size={10} color="#fff" />
                        )}
                      </View>
                      {!isLast && (
                        <View style={[styles.stepLine, {
                          backgroundColor: status === 'completed' ? '#22c55e' : `${mutedColor}20`,
                        }]} />
                      )}
                    </View>
                    <View style={styles.stepContent}>
                      <Ionicons name={step.icon as any} size={14} color={labelColor} />
                      <ThemedText style={[styles.stepLabel, { color: labelColor }]}>
                        {step.label}
                      </ThemedText>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Error display with retry */}
            {pipeline.state.phase === 'error' && (
              <View style={[styles.errorBanner, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                <Ionicons name="alert-circle" size={16} color="#ef4444" />
                <ThemedText style={[styles.errorBannerText, { color: '#ef4444' }]}>
                  {pipeline.state.error}
                </ThemedText>
              </View>
            )}

            {/* Awaiting fiat info */}
            {pipeline.state.phase === 'awaiting_fiat' && (
              <View style={[styles.awaitingCard, { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.2)' }]}>
                <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.awaitingTitle, { color: '#3b82f6' }]}>
                    Cashout submitted
                  </ThemedText>
                  <ThemedText style={[styles.awaitingDesc, { color: mutedColor }]}>
                    MoonPay is processing your fiat withdrawal. Funds typically arrive in 1–3 business days.
                  </ThemedText>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ===== PIPELINE IDLE: Show asset selector + amount input ===== */}
        {!isPipelineActive && (
          <>
            {/* Loading State */}
            {isLoadingAssets && (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={mutedColor} />
                <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                  Loading your holdings...
                </ThemedText>
              </View>
            )}

            {/* Empty State */}
            {!isLoadingAssets && !hasAssets && (
              <View style={styles.emptyState}>
                <View style={[styles.emptyStateIcon, { backgroundColor: cardBg }]}>
                  <Ionicons name="wallet-outline" size={48} color={mutedColor} />
                </View>
                <ThemedText style={styles.emptyStateTitle}>No Holdings to Sell</ThemedText>
                <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
                  You don't have any tokens in your wallet. Deposit some crypto first to sell.
                </ThemedText>
                <PressableScale
                  onPress={() => router.replace('/buy-crypto?currency=usdc&mode=deposit')}
                  style={[styles.emptyStateButton, { backgroundColor: '#22c55e' }]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <ThemedText style={[styles.emptyStateButtonText, { color: '#fff' }]}>Deposit USDC</ThemedText>
                </PressableScale>
              </View>
            )}

            {/* Main Content */}
            {hasAssets && selectedAsset && (
              <>
                {/* Asset Selector — scrollable list of all tokens */}
                <View style={styles.section}>
                  <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>SELECT ASSET</ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assetScroll}>
                    {pipeline.allCashoutAssets.map((asset) => {
                      const isSelected = selectedAsset.mint === asset.mint && selectedAsset.isShielded === asset.isShielded;
                      const key = asset.isShielded ? `shielded_${asset.mint}` : asset.mint;
                      return (
                        <PressableScale
                          key={key}
                          onPress={() => {
                            setSelectedAsset(asset);
                            setAmount('');
                          }}
                          style={[
                            styles.assetButton,
                            { backgroundColor: isSelected ? 'rgba(239,68,68,0.15)' : cardBg },
                            isSelected && { borderColor: '#ef4444', borderWidth: 1 },
                          ]}
                        >
                          <View style={[styles.assetIcon, { backgroundColor: isSelected ? 'rgba(239,68,68,0.2)' : borderColor }]}>
                            {asset.isShielded ? (
                              <Ionicons name="lock-closed" size={16} color={isSelected ? '#ef4444' : mutedColor} />
                            ) : asset.isRwa ? (
                              <Ionicons name="trending-up" size={16} color={isSelected ? '#ef4444' : mutedColor} />
                            ) : (
                              <ThemedText style={styles.assetIconText}>{getAssetIcon(asset)}</ThemedText>
                            )}
                          </View>
                          <ThemedText style={[styles.assetSymbol, isSelected && { color: '#ef4444' }]}>
                            {asset.isShielded ? 'Shielded' : asset.symbol}
                          </ThemedText>
                          <ThemedText style={[styles.assetValue, { color: mutedColor }]}>
                            ${asset.valueUsd.toFixed(2)}
                          </ThemedText>
                        </PressableScale>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Path indicator */}
                {selectedAsset && !selectedAsset.isUSDC && !selectedAsset.isShielded && (
                  <View style={[styles.pathBadge, { backgroundColor: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.2)' }]}>
                    <Ionicons name="swap-horizontal" size={14} color="#a855f7" />
                    <ThemedText style={[styles.pathBadgeText, { color: '#a855f7' }]}>
                      {selectedAsset.symbol} will be privately swapped to USDC before cashout
                    </ThemedText>
                  </View>
                )}

                {/* Balance Display */}
                <View style={[styles.balanceCard, { backgroundColor: cardBg }]}>
                  <View style={styles.balanceRow}>
                    <ThemedText style={[styles.balanceLabel, { color: mutedColor }]}>Available Balance</ThemedText>
                    <ThemedText style={styles.balanceValue}>
                      {currentBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} {selectedAsset.symbol}
                    </ThemedText>
                  </View>
                </View>

                {/* Amount Input */}
                <View style={styles.section}>
                  <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>AMOUNT TO SELL</ThemedText>
                  <View style={[styles.amountInputContainer, { backgroundColor: cardBg }]}>
                    <TextInput
                      style={[styles.amountInput, { color: textColor }]}
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0.00"
                      placeholderTextColor={mutedColor}
                      keyboardType="decimal-pad"
                    />
                    <ThemedText style={[styles.currencyLabel, { color: mutedColor }]}>{selectedAsset.symbol}</ThemedText>
                  </View>
                  {numericAmount > currentBalance && (
                    <ThemedText style={[styles.errorText, { color: '#ef4444' }]}>Insufficient balance</ThemedText>
                  )}
                </View>

                {/* Quick Percentage Buttons */}
                <View style={styles.quickAmounts}>
                  {QUICK_PERCENTAGES.map((percentage) => {
                    const isMax = percentage === 100;
                    return (
                      <PressableScale
                        key={percentage}
                        onPress={() => handleQuickPercentage(percentage)}
                        style={[
                          styles.quickAmountButton,
                          { backgroundColor: cardBg },
                          isMax && { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1 },
                        ]}
                      >
                        <ThemedText style={[styles.quickAmountText, isMax && { color: '#ef4444' }]}>
                          {isMax ? 'MAX' : `${percentage}%`}
                        </ThemedText>
                      </PressableScale>
                    );
                  })}
                </View>

                {/* Privacy indicator — always private */}
                <View style={[styles.privacyToggle, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' }]}>
                  <View style={[styles.privacyIconContainer, { backgroundColor: 'rgba(34,197,94,0.2)' }]}>
                    <Ionicons name="shield-checkmark" size={20} color="#22c55e" />
                  </View>
                  <View style={styles.privacyText}>
                    <ThemedText style={[styles.privacyTitle, { color: '#22c55e' }]}>
                      Private Cashout
                    </ThemedText>
                    <ThemedText style={[styles.privacyDesc, { color: mutedColor }]}>
                      Your wallet history stays hidden from MoonPay
                    </ThemedText>
                  </View>
                  <View style={[styles.privacyStatus, { backgroundColor: '#22c55e' }]} />
                </View>

                {/* Payout Info */}
                <View style={[styles.payoutInfo, { backgroundColor: cardBg }]}>
                  <ThemedText style={[styles.payoutInfoTitle, { color: mutedColor }]}>PAYOUT</ThemedText>
                  <View style={styles.payoutMethods}>
                    <View style={styles.payoutMethod}>
                      <Ionicons name="business" size={20} color={textColor} />
                      <View style={styles.payoutMethodText}>
                        <ThemedText style={styles.payoutMethodTitle}>Bank Account</ThemedText>
                        <ThemedText style={[styles.payoutMethodDesc, { color: mutedColor }]}>
                          Receive USD directly to your bank
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.estimateRow, { borderTopColor: borderColor }]}>
                    <ThemedText style={[styles.estimateLabel, { color: mutedColor }]}>Estimated payout</ThemedText>
                    <ThemedText style={styles.estimateValue}>
                      ~${(numericAmount * (selectedAsset.valueUsd / (currentBalance || 1))).toLocaleString(
                        undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                      )} USD
                    </ThemedText>
                  </View>
                </View>

                {/* MoonPay error */}
                {moonPayError && (
                  <View style={[styles.errorBanner, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Ionicons name="alert-circle" size={16} color="#ef4444" />
                    <ThemedText style={[styles.errorBannerText, { color: '#ef4444' }]}>{moonPayError}</ThemedText>
                  </View>
                )}
              </>
            )}
          </>
        )}

        </View></TouchableWithoutFeedback>
      </ScrollView>

      {/* Footer — context-dependent */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {/* Pipeline active: show cancel/retry/done buttons */}
        {isPipelineActive && (
          <View style={styles.footerButtons}>
            {pipeline.canRetry && (
              <PressableScale
                onPress={pipeline.retryFromFailure}
                style={[styles.sellButton, { backgroundColor: '#3b82f6' }]}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
                <ThemedText style={styles.sellButtonText}>Retry</ThemedText>
              </PressableScale>
            )}
            {pipeline.canCancel && (
              <PressableScale
                onPress={pipeline.cancelCashout}
                style={[styles.cancelButton, { backgroundColor: cardBg, borderColor: borderColor }]}
              >
                <ThemedText style={[styles.cancelButtonText, { color: textColor }]}>Cancel</ThemedText>
              </PressableScale>
            )}
            {pipeline.state.phase === 'awaiting_fiat' && (
              <PressableScale
                onPress={() => {
                  pipeline.markComplete();
                  router.back();
                }}
                style={[styles.sellButton, { backgroundColor: '#22c55e' }]}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <ThemedText style={styles.sellButtonText}>Done</ThemedText>
              </PressableScale>
            )}
          </View>
        )}

        {/* Pipeline idle: show sell button */}
        {!isPipelineActive && hasAssets && selectedAsset && (
          <>
            <PressableScale
              onPress={handleSell}
              enabled={isValidAmount && !moonPayLoading}
              style={[
                styles.sellButton,
                { backgroundColor: isValidAmount ? '#ef4444' : `${mutedColor}50` },
              ]}
            >
              {moonPayLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-down" size={20} color="#fff" />
                  <ThemedText style={styles.sellButtonText}>
                    {isValidAmount ? `Sell ${numericAmount} ${selectedAsset.symbol}` : 'Enter amount'}
                  </ThemedText>
                </>
              )}
            </PressableScale>
            <ThemedText style={[styles.footerNote, { color: mutedColor }]}>
              Powered by MoonPay. Funds sent to your linked bank account.
            </ThemedText>
          </>
        )}

        {/* Completed/cancelled: reset button */}
        {(pipeline.state.phase === 'completed' || pipeline.state.phase === 'cancelled') && (
          <PressableScale
            onPress={() => pipeline.reset()}
            style={[styles.sellButton, { backgroundColor: '#3b82f6' }]}
          >
            <ThemedText style={styles.sellButtonText}>New Cashout</ThemedText>
          </PressableScale>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32 },
  emptyStateIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24 },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center' },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24 },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12 },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center' },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600' },
  headerRight: {
    width: 40 },
  content: {
    flex: 1 },
  contentContainer: {
    paddingHorizontal: 16,
    flexGrow: 1 },
  touchableContent: {
    flex: 1 },
  section: {
    marginBottom: 24 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 12 },

  // Asset selector
  assetScroll: {
    flexDirection: 'row' },
  assetButton: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginRight: 8,
    minWidth: 80 },
  assetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center' },
  assetIconText: {
    fontSize: 16 },
  assetSymbol: {
    fontSize: 12,
    fontWeight: '600' },
  assetValue: {
    fontSize: 10 },

  // Path badge
  pathBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1 },
  pathBadgeText: {
    fontSize: 12,
    flex: 1 },

  // Balance card
  balanceCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 24 },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  balanceLabel: {
    fontSize: 12 },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600' },

  // Amount input
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16 },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '300' },
  currencyLabel: {
    fontSize: 18,
    fontWeight: '500',
    marginLeft: 8 },
  errorText: {
    fontSize: 12,
    marginTop: 8 },

  // Quick amounts
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24 },
  quickAmountButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12 },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '500' },

  // Privacy toggle
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    gap: 12 },
  privacyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center' },
  privacyText: {
    flex: 1 },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2 },
  privacyDesc: {
    fontSize: 12 },
  privacyStatus: {
    width: 8,
    height: 8,
    borderRadius: 4 },

  // Payout
  payoutInfo: {
    borderRadius: 14,
    padding: 16 },
  payoutInfoTitle: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 12 },
  payoutMethods: {
    gap: 12 },
  payoutMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12 },
  payoutMethodText: {
    flex: 1 },
  payoutMethodTitle: {
    fontSize: 14,
    fontWeight: '500' },
  payoutMethodDesc: {
    fontSize: 12,
    marginTop: 2 },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1 },
  estimateLabel: {
    fontSize: 12 },
  estimateValue: {
    fontSize: 16,
    fontWeight: '600' },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginTop: 16 },
  errorBannerText: {
    fontSize: 12,
    flex: 1 },

  // Pipeline stepper
  pipelineContainer: {
    paddingTop: 8 },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden' },
  progressBarFill: {
    height: '100%',
    borderRadius: 2 },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20 },
  phaseLabel: {
    fontSize: 18,
    fontWeight: '600' },
  phaseTime: {
    fontSize: 14 },
  stepper: {
    gap: 0 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start' },
  stepIndicator: {
    alignItems: 'center',
    width: 24 },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center' },
  stepLine: {
    width: 2,
    height: 24 },
  stepContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
    paddingBottom: 24 },
  stepLabel: {
    fontSize: 14 },

  // Jitter card
  jitterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1 },
  jitterTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2 },
  jitterDesc: {
    fontSize: 11 },

  // Awaiting fiat card
  awaitingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1 },
  awaitingTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2 },
  awaitingDesc: {
    fontSize: 11 },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16 },
  footerButtons: {
    gap: 8 },
  sellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14 },
  sellButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff' },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1 },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500' },
  footerNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12 },
});
