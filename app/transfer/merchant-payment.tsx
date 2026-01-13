/**
 * DisCard 2035 - Merchant Payment Screen
 *
 * Cross-currency payment flow for paying merchants.
 * User can pay with any stablecoin they hold.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { useAction } from "convex/react";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { SourceTokenSelector, type TokenHolding } from "@/components/transfer/SourceTokenSelector";
import { MerchantPaymentSummary } from "@/components/transfer/MerchantPaymentSummary";
import { useTokenHoldings } from "@/hooks/useTokenHoldings";
import { api } from "@/convex/_generated/api";
import type { MerchantPaymentQuote } from "@/convex/transfers/merchantPayment";
import { formatAddress } from "@/lib/transfer/address-resolver";

// ============================================================================
// Types
// ============================================================================

interface MerchantPaymentParams {
  merchantAddress: string;
  merchantName?: string;
  merchantLogo?: string;
  settlementMint: string;
  settlementSymbol: string;
  settlementAmount: string;
  memo?: string;
}

// ============================================================================
// Constants
// ============================================================================

const QUOTE_REFRESH_INTERVAL = 10_000; // 10 seconds

// ============================================================================
// Component
// ============================================================================

export default function MerchantPaymentScreen() {
  const params = useLocalSearchParams<{
    merchantAddress: string;
    merchantName: string;
    merchantLogo: string;
    settlementMint: string;
    settlementSymbol: string;
    settlementAmount: string;
    memo: string;
  }>();

  // Parse params
  const merchantPayment: MerchantPaymentParams = {
    merchantAddress: params.merchantAddress || "",
    merchantName: params.merchantName || undefined,
    merchantLogo: params.merchantLogo || undefined,
    settlementMint: params.settlementMint || "",
    settlementSymbol: params.settlementSymbol || "USDC",
    settlementAmount: params.settlementAmount || "0",
    memo: params.memo || undefined,
  };

  // State
  const [selectedToken, setSelectedToken] = useState<TokenHolding | null>(null);
  const [quote, setQuote] = useState<MerchantPaymentQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hooks
  const { holdings, loading: holdingsLoading } = useTokenHoldings();
  const getMerchantPaymentQuote = useAction(api.transfers.merchantPayment.getMerchantPaymentQuote);

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");

  // Filter holdings to stablecoins only
  const availableTokens: TokenHolding[] = useMemo(() => {
    if (!holdings) return [];

    // Filter for stablecoins (check if balance > 0 and is a known stablecoin)
    const stablecoins = holdings.filter((h) => {
      const isStablecoin =
        h.symbol === "USDC" ||
        h.symbol === "USDT" ||
        h.symbol === "PYUSD" ||
        h.symbol === "EURC" ||
        h.symbol === "BRZ" ||
        h.symbol === "MXNE" ||
        h.symbol === "VCHF" ||
        h.symbol === "VGBP" ||
        h.symbol === "USDY" ||
        h.symbol === "USX" ||
        h.symbol.includes("USD");

      return isStablecoin && h.balanceFormatted > 0;
    });

    return stablecoins.map((h) => ({
      mint: h.mint,
      symbol: h.symbol,
      name: h.name,
      decimals: h.decimals,
      balance: h.balanceFormatted,
      balanceUsd: h.valueUsd || h.balanceFormatted, // Fallback for stablecoins
      logoUri: h.logoUri,
      isSettlementToken: h.mint === merchantPayment.settlementMint,
    }));
  }, [holdings, merchantPayment.settlementMint]);

  // Auto-select token on load
  useEffect(() => {
    if (availableTokens.length > 0 && !selectedToken) {
      // Prefer settlement token if user has it
      const settlementToken = availableTokens.find(
        (t) => t.mint === merchantPayment.settlementMint
      );
      if (settlementToken) {
        setSelectedToken(settlementToken);
      } else {
        // Otherwise select first available
        setSelectedToken(availableTokens[0]);
      }
    }
  }, [availableTokens, selectedToken, merchantPayment.settlementMint]);

  // Fetch quote when token changes
  const fetchQuote = useCallback(
    async (isRefresh = false) => {
      if (!selectedToken || !merchantPayment.settlementMint || !merchantPayment.settlementAmount) {
        return;
      }

      if (isRefresh) {
        setQuoteRefreshing(true);
      } else {
        setQuoteLoading(true);
      }
      setQuoteError(null);

      try {
        const result = await getMerchantPaymentQuote({
          sourceMint: selectedToken.mint,
          sourceSymbol: selectedToken.symbol,
          sourceDecimals: selectedToken.decimals,
          settlementMint: merchantPayment.settlementMint,
          settlementAmount: merchantPayment.settlementAmount,
        });

        if (result.error) {
          setQuoteError(result.error);
          setQuote(null);
        } else if (result.quote) {
          setQuote(result.quote);
          // Calculate expires in seconds
          const expiresAt = result.quote.expiresAt;
          const now = Date.now();
          setExpiresIn(Math.max(0, Math.floor((expiresAt - now) / 1000)));
        }
      } catch (err) {
        setQuoteError(err instanceof Error ? err.message : "Failed to get quote");
        setQuote(null);
      } finally {
        setQuoteLoading(false);
        setQuoteRefreshing(false);
      }
    },
    [selectedToken, merchantPayment.settlementMint, merchantPayment.settlementAmount, getMerchantPaymentQuote]
  );

  // Fetch quote on token change
  useEffect(() => {
    fetchQuote();
  }, [selectedToken?.mint]);

  // Quote refresh timer
  useEffect(() => {
    if (!quote) return;

    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          fetchQuote(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [quote, fetchQuote]);

  // Handle token selection
  const handleSelectToken = useCallback((token: TokenHolding) => {
    setSelectedToken(token);
    setQuote(null);
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    router.back();
  }, []);

  // Handle submit payment
  const handleSubmit = useCallback(async () => {
    if (!selectedToken || !quote) return;

    // Check balance
    const sourceAmountNum = parseFloat(quote.sourceAmount) / Math.pow(10, selectedToken.decimals);
    if (sourceAmountNum > selectedToken.balance) {
      setError(`Insufficient ${selectedToken.symbol} balance`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Biometric authentication
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const biometricResult = await LocalAuthentication.authenticateAsync({
          promptMessage: `Pay ${merchantPayment.merchantName || "merchant"}`,
          disableDeviceFallback: false,
          cancelLabel: "Cancel",
        });

        if (!biometricResult.success) {
          if (biometricResult.error === "user_cancel") {
            setError("Authentication cancelled");
          } else {
            setError("Biometric authentication failed");
          }
          setIsSubmitting(false);
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Navigate to success screen with payment data
      // In a real implementation, this would execute the transaction first
      router.push({
        pathname: "/transfer/success",
        params: {
          type: "merchant_payment",
          merchantName: merchantPayment.merchantName || "Merchant",
          merchantAddress: merchantPayment.merchantAddress,
          sourceAmount: quote.sourceAmount,
          sourceSymbol: quote.sourceSymbol,
          settlementAmount: quote.settlementAmount,
          settlementSymbol: quote.settlementSymbol,
          merchantReceives: quote.merchantReceives,
          swapRequired: quote.swapRequired ? "true" : "false",
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setIsSubmitting(false);
    }
  }, [selectedToken, quote, merchantPayment]);

  // Format amounts for display
  const settlementAmountFormatted = useMemo(() => {
    const amount = parseFloat(merchantPayment.settlementAmount) / 1_000_000; // Assuming 6 decimals
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [merchantPayment.settlementAmount]);

  const sourceAmountFormatted = useMemo(() => {
    if (!quote) return "0.00";
    const amount = parseFloat(quote.sourceAmount) / Math.pow(10, quote.sourceDecimals);
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [quote]);

  // Check if can submit
  const canSubmit =
    selectedToken &&
    quote &&
    !quoteLoading &&
    !quoteError &&
    !isSubmitting &&
    parseFloat(quote.sourceAmount) / Math.pow(10, selectedToken.decimals) <= selectedToken.balance;

  // Validation error
  const validationError = useMemo(() => {
    if (!selectedToken || !quote) return null;
    const sourceAmountNum = parseFloat(quote.sourceAmount) / Math.pow(10, selectedToken.decimals);
    if (sourceAmountNum > selectedToken.balance) {
      return `Insufficient ${selectedToken.symbol} balance. You need ${sourceAmountNum.toFixed(2)} but have ${selectedToken.balance.toFixed(2)}`;
    }
    return null;
  }, [selectedToken, quote]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <Animated.View entering={FadeIn.duration(200)} style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={mutedColor} />
          </Pressable>

          <ThemedText style={styles.headerTitle}>Pay Merchant</ThemedText>

          <View style={styles.headerButton} />
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Merchant Info */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.merchantCard}>
            <View style={styles.merchantInfo}>
              {merchantPayment.merchantLogo ? (
                <Image
                  source={{ uri: merchantPayment.merchantLogo }}
                  style={styles.merchantLogo}
                />
              ) : (
                <View style={[styles.merchantLogoPlaceholder, { backgroundColor: primaryColor }]}>
                  <Ionicons name="storefront" size={28} color="#fff" />
                </View>
              )}
              <View style={styles.merchantDetails}>
                <ThemedText style={styles.merchantName} numberOfLines={1}>
                  {merchantPayment.merchantName || "Merchant"}
                </ThemedText>
                <ThemedText style={[styles.merchantAddress, { color: mutedColor }]}>
                  {formatAddress(merchantPayment.merchantAddress, 6)}
                </ThemedText>
              </View>
            </View>

            {/* Requested Amount */}
            <View style={styles.requestedAmount}>
              <ThemedText style={[styles.requestedLabel, { color: mutedColor }]}>
                Requested
              </ThemedText>
              <ThemedText style={styles.requestedValue}>
                {settlementAmountFormatted} {merchantPayment.settlementSymbol}
              </ThemedText>
            </View>
          </Animated.View>

          {/* Pay With Section */}
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.section}>
            <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
              PAY WITH
            </ThemedText>
            <SourceTokenSelector
              tokens={availableTokens}
              selectedToken={selectedToken}
              onSelect={handleSelectToken}
              settlementSymbol={merchantPayment.settlementSymbol}
              disabled={isSubmitting}
              loading={holdingsLoading}
            />

            {/* You Pay Amount */}
            {selectedToken && quote && (
              <View style={styles.youPayRow}>
                <ThemedText style={[styles.youPayLabel, { color: mutedColor }]}>
                  You pay
                </ThemedText>
                <ThemedText style={styles.youPayValue}>
                  {sourceAmountFormatted} {selectedToken.symbol}
                </ThemedText>
              </View>
            )}
          </Animated.View>

          {/* Payment Summary */}
          <Animated.View entering={FadeInUp.delay(300).duration(300)} style={styles.section}>
            <MerchantPaymentSummary
              quote={quote}
              loading={quoteLoading}
              error={quoteError || undefined}
              refreshing={quoteRefreshing}
              expiresIn={expiresIn}
            />
          </Animated.View>

          {/* Validation Error */}
          {validationError && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.validationError, { backgroundColor: `${errorColor}15` }]}
            >
              <Ionicons name="alert-circle" size={18} color={errorColor} />
              <ThemedText style={[styles.validationErrorText, { color: errorColor }]}>
                {validationError}
              </ThemedText>
            </Animated.View>
          )}

          {/* Error */}
          {error && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.errorBanner, { backgroundColor: `${errorColor}15` }]}
            >
              <Ionicons name="alert-circle" size={18} color={errorColor} />
              <ThemedText style={[styles.errorText, { color: errorColor }]}>
                {error}
              </ThemedText>
            </Animated.View>
          )}

          {/* Memo */}
          {merchantPayment.memo && (
            <Animated.View entering={FadeInUp.delay(400).duration(300)} style={styles.memoSection}>
              <Ionicons name="chatbubble-outline" size={16} color={mutedColor} />
              <ThemedText style={[styles.memoText, { color: mutedColor }]}>
                {merchantPayment.memo}
              </ThemedText>
            </Animated.View>
          )}
        </ScrollView>

        {/* Bottom Actions */}
        <Animated.View entering={FadeInUp.delay(400).duration(300)} style={styles.bottomActions}>
          {/* Pay Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.payButton,
              { backgroundColor: canSubmit ? primaryColor : mutedColor },
              pressed && styles.pressed,
              !canSubmit && styles.buttonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="finger-print" size={22} color="#fff" />
                <ThemedText style={styles.payButtonText}>
                  Pay {selectedToken?.symbol ? `${sourceAmountFormatted} ${selectedToken.symbol}` : ""}
                </ThemedText>
              </>
            )}
          </Pressable>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <Ionicons name="shield-checkmark" size={14} color={mutedColor} />
            <ThemedText style={[styles.securityText, { color: mutedColor }]}>
              Atomic swap via Jupiter • Secured by Turnkey TEE
            </ThemedText>
          </View>
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  merchantCard: {
    marginBottom: 24,
  },
  merchantInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  merchantLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  merchantLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  merchantDetails: {
    marginLeft: 14,
    flex: 1,
  },
  merchantName: {
    fontSize: 20,
    fontWeight: "700",
  },
  merchantAddress: {
    fontSize: 13,
    fontFamily: "monospace",
    marginTop: 2,
  },
  requestedAmount: {
    alignItems: "center",
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  requestedLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  requestedValue: {
    fontSize: 36,
    fontWeight: "700",
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "600",
    marginBottom: 10,
  },
  youPayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  youPayLabel: {
    fontSize: 14,
  },
  youPayValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  validationError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  validationErrorText: {
    fontSize: 13,
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  memoSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 12,
  },
  memoText: {
    fontSize: 13,
    flex: 1,
    fontStyle: "italic",
  },
  bottomActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 8,
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
  },
  payButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  securityText: {
    fontSize: 12,
    textAlign: "center",
  },
});
