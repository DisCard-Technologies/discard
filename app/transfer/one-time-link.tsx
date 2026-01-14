/**
 * DisCard 2035 - One-Time Payment Link Screen
 *
 * Privacy-preserving disposable payment links:
 * - Single-claim enforcement
 * - Stealth address generation at claim time
 * - 15-minute expiry for minimal exposure
 * - No persistent recipient identity on-chain
 */

import { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { EyeOff, Shield, Clock, Zap } from "lucide-react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import QRCode from "react-native-qrcode-svg";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  getOneTimePaymentService,
  type OneTimeLinkResult,
} from "@/services/oneTimePaymentClient";

// ============================================================================
// Constants
// ============================================================================

const TOKENS = [
  { symbol: "USDC", name: "USD Coin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "SOL", name: "Solana", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  { symbol: "USDT", name: "Tether", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
];

// ============================================================================
// Component
// ============================================================================

export default function OneTimeLinkScreen() {
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [memo, setMemo] = useState("");
  const [generatedLink, setGeneratedLink] = useState<OneTimeLinkResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const oneTimeService = getOneTimePaymentService();

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const privacyColor = useThemeColor({ light: "#7C3AED", dark: "#A78BFA" }, "text");
  const warningColor = useThemeColor({ light: "#FF9800", dark: "#FFB74D" }, "text");
  const textColor = useThemeColor({}, "text");

  // Update time remaining countdown
  useEffect(() => {
    if (!generatedLink) return;

    const updateTimer = () => {
      const remaining = oneTimeService.getTimeRemaining(generatedLink.linkData.expiresAt);
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [generatedLink, oneTimeService]);

  // Handle close
  const handleClose = useCallback(() => {
    router.back();
  }, []);

  // Parse amount
  const numericAmount = parseFloat(amount) || 0;

  // Calculate USD (stablecoins 1:1, SOL at $150 placeholder)
  const amountUsd =
    selectedToken.symbol === "USDC" || selectedToken.symbol === "USDT"
      ? numericAmount
      : numericAmount * 150;

  // Generate one-time link
  const handleGenerate = useCallback(async () => {
    if (numericAmount <= 0) return;

    setIsCreating(true);
    setError(null);

    try {
      const result = await oneTimeService.createOneTimeLink({
        amount: numericAmount,
        token: selectedToken.symbol,
        tokenMint: selectedToken.mint,
        tokenDecimals: selectedToken.decimals,
        amountUsd,
        memo: memo.trim() || undefined,
      });

      setGeneratedLink(result);
    } catch (err) {
      console.error("[OneTimeLink] Generation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create link");
    }

    setIsCreating(false);
  }, [numericAmount, selectedToken, amountUsd, memo, oneTimeService]);

  // Copy link
  const handleCopy = useCallback(async () => {
    if (!generatedLink) return;

    try {
      // Use expo-clipboard
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(generatedLink.claimUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("[OneTimeLink] Copy failed:", err);
    }
  }, [generatedLink]);

  // Share link
  const handleShare = useCallback(async () => {
    if (!generatedLink) return;

    try {
      const { Share } = await import("react-native");
      await Share.share({
        message: `Claim ${numericAmount} ${selectedToken.symbol} privately (expires in 15 min): ${generatedLink.claimUrl}`,
        url: generatedLink.claimUrl,
      });
    } catch (err) {
      console.error("[OneTimeLink] Share failed:", err);
    }
  }, [generatedLink, numericAmount, selectedToken]);

  // Reset and create new
  const handleNewRequest = useCallback(() => {
    setGeneratedLink(null);
    setAmount("");
    setMemo("");
    setError(null);
  }, []);

  // Show generated link view
  if (generatedLink) {
    const isExpired = generatedLink.linkData.expiresAt < Date.now();

    return (
      <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={24} color={mutedColor} />
            </Pressable>
            <ThemedText style={styles.headerTitle}>One-Time Link</ThemedText>
            <View style={styles.headerButton} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Privacy Badge */}
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.privacyBadge, { backgroundColor: `${privacyColor}15` }]}
            >
              <Shield size={16} color={privacyColor} />
              <ThemedText style={[styles.privacyBadgeText, { color: privacyColor }]}>
                Privacy-Preserving Payment
              </ThemedText>
            </Animated.View>

            {/* Amount Display */}
            <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.amountDisplay}>
              <ThemedText style={styles.amountLarge}>
                {numericAmount.toFixed(selectedToken.decimals <= 2 ? 2 : 4)} {selectedToken.symbol}
              </ThemedText>
              <ThemedText style={[styles.amountUsd, { color: mutedColor }]}>
                ≈ ${amountUsd.toFixed(2)} USD
              </ThemedText>
            </Animated.View>

            {/* QR Code */}
            <Animated.View
              entering={FadeInUp.delay(200).duration(300)}
              style={[
                styles.qrContainer,
                { backgroundColor: "#fff", borderColor: isExpired ? warningColor : borderColor },
              ]}
            >
              {isExpired ? (
                <View style={styles.expiredOverlay}>
                  <Clock size={40} color={warningColor} />
                  <ThemedText style={[styles.expiredText, { color: warningColor }]}>
                    Link Expired
                  </ThemedText>
                </View>
              ) : (
                <>
                  <QRCode
                    value={generatedLink.qrData}
                    size={180}
                    backgroundColor="#fff"
                    color="#000"
                  />
                  <View style={[styles.qrPrivacyBadge, { backgroundColor: `${privacyColor}10` }]}>
                    <EyeOff size={12} color={privacyColor} />
                    <ThemedText style={[styles.qrPrivacyText, { color: privacyColor }]}>
                      Stealth Address Delivery
                    </ThemedText>
                  </View>
                </>
              )}
            </Animated.View>

            {/* Time Remaining */}
            <Animated.View
              entering={FadeIn.delay(250).duration(200)}
              style={[
                styles.timerCard,
                {
                  backgroundColor: isExpired ? `${warningColor}15` : `${successColor}15`,
                  borderColor: isExpired ? warningColor : successColor,
                },
              ]}
            >
              <Zap size={16} color={isExpired ? warningColor : successColor} />
              <ThemedText
                style={[styles.timerText, { color: isExpired ? warningColor : successColor }]}
              >
                {isExpired ? "Expired" : `Expires in ${timeRemaining}`}
              </ThemedText>
            </Animated.View>

            {/* Link Info */}
            <Animated.View
              entering={FadeInUp.delay(300).duration(300)}
              style={[styles.linkCard, { backgroundColor: cardBg, borderColor }]}
            >
              <ThemedText style={[styles.linkLabel, { color: mutedColor }]}>
                ONE-TIME CLAIM LINK
              </ThemedText>
              <ThemedText style={styles.linkText} numberOfLines={1}>
                {generatedLink.claimUrl}
              </ThemedText>
            </Animated.View>

            {/* Privacy Features */}
            <Animated.View
              entering={FadeInUp.delay(350).duration(300)}
              style={[styles.featuresCard, { backgroundColor: cardBg, borderColor }]}
            >
              <ThemedText style={[styles.featuresTitle, { color: mutedColor }]}>
                PRIVACY FEATURES
              </ThemedText>
              <View style={styles.featureRow}>
                <Shield size={14} color={privacyColor} />
                <ThemedText style={styles.featureText}>Single-use link (auto-expires after claim)</ThemedText>
              </View>
              <View style={styles.featureRow}>
                <EyeOff size={14} color={privacyColor} />
                <ThemedText style={styles.featureText}>Recipient address generated at claim time</ThemedText>
              </View>
              <View style={styles.featureRow}>
                <Ionicons name="shield-checkmark" size={14} color={privacyColor} />
                <ThemedText style={styles.featureText}>No persistent identity on-chain</ThemedText>
              </View>
            </Animated.View>
          </ScrollView>

          {/* Action Buttons */}
          {!isExpired && (
            <Animated.View
              entering={FadeInUp.delay(400).duration(300)}
              style={styles.actionButtons}
            >
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [
                  styles.actionButton,
                  { borderColor },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name={isCopied ? "checkmark" : "copy-outline"} size={20} color={primaryColor} />
                <ThemedText style={[styles.actionButtonText, { color: primaryColor }]}>
                  {isCopied ? "Copied!" : "Copy"}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.primaryActionButton,
                  { backgroundColor: primaryColor },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
                <ThemedText style={styles.primaryActionButtonText}>Share</ThemedText>
              </Pressable>
            </Animated.View>
          )}

          {/* New Link Button */}
          <Pressable
            onPress={handleNewRequest}
            style={({ pressed }) => [styles.newRequestButton, pressed && styles.pressed]}
          >
            <ThemedText style={[styles.newRequestText, { color: mutedColor }]}>
              {isExpired ? "Create new link" : "Create another link"}
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Show input form
  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={mutedColor} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>One-Time Link</ThemedText>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Privacy Info Banner */}
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.infoBanner, { backgroundColor: `${privacyColor}10`, borderColor: `${privacyColor}30` }]}
          >
            <Shield size={18} color={privacyColor} />
            <View style={styles.infoBannerContent}>
              <ThemedText style={[styles.infoBannerTitle, { color: privacyColor }]}>
                Privacy-Preserving Payment Link
              </ThemedText>
              <ThemedText style={[styles.infoBannerText, { color: mutedColor }]}>
                Link expires in 15 minutes and can only be claimed once. Recipient's address is
                generated at claim time for maximum privacy.
              </ThemedText>
            </View>
          </Animated.View>

          {/* Amount Input */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
              AMOUNT
            </ThemedText>
            <View style={[styles.amountInputContainer, { borderColor }]}>
              <ThemedText style={styles.currencyPrefix}>$</ThemedText>
              <TextInput
                style={[styles.amountInput, { color: textColor }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={mutedColor}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
            {numericAmount > 0 && (
              <ThemedText style={[styles.conversionText, { color: mutedColor }]}>
                ≈ {(numericAmount / (selectedToken.symbol === "SOL" ? 150 : 1)).toFixed(
                  selectedToken.decimals <= 2 ? 2 : 4
                )}{" "}
                {selectedToken.symbol}
              </ThemedText>
            )}
          </Animated.View>

          {/* Token Selection */}
          <Animated.View entering={FadeInUp.delay(200).duration(300)}>
            <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
              TOKEN
            </ThemedText>
            <View style={styles.tokenGrid}>
              {TOKENS.map((token) => (
                <Pressable
                  key={token.symbol}
                  onPress={() => setSelectedToken(token)}
                  style={({ pressed }) => [
                    styles.tokenOption,
                    { borderColor },
                    selectedToken.symbol === token.symbol && {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}10`,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.tokenSymbol,
                      selectedToken.symbol === token.symbol && { color: primaryColor },
                    ]}
                  >
                    {token.symbol}
                  </ThemedText>
                  <ThemedText style={[styles.tokenName, { color: mutedColor }]}>
                    {token.name}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Memo Input */}
          <Animated.View entering={FadeInUp.delay(300).duration(300)}>
            <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
              PRIVATE MEMO (OPTIONAL)
            </ThemedText>
            <TextInput
              style={[styles.memoInput, { borderColor, color: textColor }]}
              value={memo}
              onChangeText={setMemo}
              placeholder="Encrypted memo for recipient..."
              placeholderTextColor={mutedColor}
              multiline
              maxLength={100}
            />
            <View style={styles.memoHint}>
              <EyeOff size={12} color={mutedColor} />
              <ThemedText style={[styles.memoHintText, { color: mutedColor }]}>
                Memo is encrypted and only visible to recipient
              </ThemedText>
            </View>
          </Animated.View>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={18} color="#F44336" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}
        </ScrollView>

        {/* Generate Button */}
        <Animated.View
          entering={FadeInUp.delay(400).duration(300)}
          style={styles.generateButtonContainer}
        >
          <Pressable
            onPress={handleGenerate}
            disabled={numericAmount <= 0 || isCreating}
            style={({ pressed }) => [
              styles.generateButton,
              { backgroundColor: privacyColor },
              (numericAmount <= 0 || isCreating) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Shield size={20} color="#fff" />
                <ThemedText style={styles.generateButtonText}>Create Private Link</ThemedText>
              </>
            )}
          </Pressable>
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
    paddingTop: 8,
    paddingBottom: 24,
  },
  infoBanner: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 16,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 20,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  currencyPrefix: {
    fontSize: 32,
    fontWeight: "600",
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: "600",
  },
  conversionText: {
    fontSize: 13,
    marginTop: 8,
    marginLeft: 4,
  },
  tokenGrid: {
    flexDirection: "row",
    gap: 12,
  },
  tokenOption: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  tokenName: {
    fontSize: 11,
    marginTop: 2,
  },
  memoInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
  memoHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  memoHintText: {
    fontSize: 11,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderRadius: 12,
  },
  errorText: {
    color: "#F44336",
    fontSize: 14,
    flex: 1,
  },
  generateButtonContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
  },
  generateButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  // Generated Link View
  privacyBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: "center",
    marginBottom: 20,
  },
  privacyBadgeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  amountDisplay: {
    alignItems: "center",
    marginBottom: 20,
  },
  amountLarge: {
    fontSize: 32,
    fontWeight: "700",
  },
  amountUsd: {
    fontSize: 16,
    marginTop: 4,
  },
  qrContainer: {
    alignItems: "center",
    padding: 24,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 12,
  },
  qrPrivacyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  qrPrivacyText: {
    fontSize: 11,
    fontWeight: "500",
  },
  expiredOverlay: {
    alignItems: "center",
    justifyContent: "center",
    height: 180,
    gap: 12,
  },
  expiredText: {
    fontSize: 18,
    fontWeight: "600",
  },
  timerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  timerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  linkCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  linkLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "monospace",
  },
  featuresCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  featuresTitle: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  featureText: {
    fontSize: 13,
    flex: 1,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  primaryActionButton: {
    borderWidth: 0,
  },
  primaryActionButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  newRequestButton: {
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 16,
  },
  newRequestText: {
    fontSize: 14,
  },
});
