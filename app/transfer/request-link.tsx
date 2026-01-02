/**
 * DisCard 2035 - Request Payment Link Screen
 *
 * Generate shareable payment request links with:
 * - Amount input
 * - Token selection
 * - QR code display
 * - Share/copy functionality
 */

import { useState, useCallback } from "react";
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
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import QRCode from "react-native-qrcode-svg";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { usePaymentLink, type PaymentRequest } from "@/hooks/usePaymentLink";

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

export default function RequestLinkScreen() {
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [memo, setMemo] = useState("");
  const [generatedRequest, setGeneratedRequest] = useState<PaymentRequest | null>(null);

  const { createPaymentLink, copyToClipboard, shareLink, isCreating, isCopying, isSharing, error } =
    usePaymentLink();

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
  const textColor = useThemeColor({}, "text");

  // Handle close
  const handleClose = useCallback(() => {
    router.back();
  }, []);

  // Parse amount
  const numericAmount = parseFloat(amount) || 0;

  // Calculate USD (assuming stablecoins are 1:1, SOL at $150)
  const amountUsd =
    selectedToken.symbol === "USDC" || selectedToken.symbol === "USDT"
      ? numericAmount
      : numericAmount * 150; // SOL price placeholder

  // Generate link
  const handleGenerate = useCallback(async () => {
    if (numericAmount <= 0) return;

    try {
      const request = await createPaymentLink({
        amount: numericAmount,
        token: selectedToken.symbol,
        tokenMint: selectedToken.mint,
        tokenDecimals: selectedToken.decimals,
        amountUsd,
        memo: memo.trim() || undefined,
      });

      setGeneratedRequest(request);
    } catch (err) {
      console.error("[RequestLink] Generation failed:", err);
    }
  }, [numericAmount, selectedToken, amountUsd, memo, createPaymentLink]);

  // Copy link
  const handleCopy = useCallback(async () => {
    if (generatedRequest) {
      await copyToClipboard(generatedRequest.webLink);
    }
  }, [generatedRequest, copyToClipboard]);

  // Share link
  const handleShare = useCallback(async () => {
    if (generatedRequest) {
      const message = `Pay me $${amountUsd.toFixed(2)} in ${selectedToken.symbol}`;
      await shareLink(generatedRequest.webLink, message);
    }
  }, [generatedRequest, amountUsd, selectedToken, shareLink]);

  // Reset and create new
  const handleNewRequest = useCallback(() => {
    setGeneratedRequest(null);
    setAmount("");
    setMemo("");
  }, []);

  // Show generated link view
  if (generatedRequest) {
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
            <ThemedText style={styles.headerTitle}>Payment Request</ThemedText>
            <View style={styles.headerButton} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Success Badge */}
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.successBadge, { backgroundColor: `${successColor}15` }]}
            >
              <Ionicons name="checkmark-circle" size={18} color={successColor} />
              <ThemedText style={[styles.successText, { color: successColor }]}>
                Payment link created!
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
              style={[styles.qrContainer, { backgroundColor: "#fff", borderColor }]}
            >
              <QRCode
                value={generatedRequest.qrData}
                size={200}
                backgroundColor="#fff"
                color="#000"
              />
              <ThemedText style={[styles.qrLabel, { color: mutedColor }]}>
                Scan to pay with any Solana wallet
              </ThemedText>
            </Animated.View>

            {/* Link Display */}
            <Animated.View
              entering={FadeInUp.delay(300).duration(300)}
              style={[styles.linkCard, { backgroundColor: cardBg, borderColor }]}
            >
              <ThemedText style={[styles.linkLabel, { color: mutedColor }]}>
                PAYMENT LINK
              </ThemedText>
              <ThemedText style={styles.linkText} numberOfLines={1}>
                {generatedRequest.webLink}
              </ThemedText>
            </Animated.View>

            {/* Expiry Note */}
            <Animated.View
              entering={FadeIn.delay(400).duration(200)}
              style={styles.expiryNote}
            >
              <Ionicons name="time-outline" size={14} color={mutedColor} />
              <ThemedText style={[styles.expiryText, { color: mutedColor }]}>
                Expires in 24 hours
              </ThemedText>
            </Animated.View>
          </ScrollView>

          {/* Action Buttons */}
          <Animated.View
            entering={FadeInUp.delay(400).duration(300)}
            style={styles.actionButtons}
          >
            <Pressable
              onPress={handleCopy}
              disabled={isCopying}
              style={({ pressed }) => [
                styles.actionButton,
                { borderColor },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="copy-outline" size={20} color={primaryColor} />
              <ThemedText style={[styles.actionButtonText, { color: primaryColor }]}>
                {isCopying ? "Copied!" : "Copy"}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={handleShare}
              disabled={isSharing}
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

          {/* New Request Button */}
          <Pressable
            onPress={handleNewRequest}
            style={({ pressed }) => [styles.newRequestButton, pressed && styles.pressed]}
          >
            <ThemedText style={[styles.newRequestText, { color: mutedColor }]}>
              Create another request
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
          <ThemedText style={styles.headerTitle}>Request Payment</ThemedText>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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
              MEMO (OPTIONAL)
            </ThemedText>
            <TextInput
              style={[styles.memoInput, { borderColor, color: textColor }]}
              value={memo}
              onChangeText={setMemo}
              placeholder="What's this for?"
              placeholderTextColor={mutedColor}
              multiline
              maxLength={100}
            />
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
              { backgroundColor: primaryColor },
              (numericAmount <= 0 || isCreating) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="qr-code" size={20} color="#fff" />
                <ThemedText style={styles.generateButtonText}>Generate Link</ThemedText>
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
  successBadge: {
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
  successText: {
    fontSize: 14,
    fontWeight: "500",
  },
  amountDisplay: {
    alignItems: "center",
    marginBottom: 24,
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
    borderWidth: 1,
    marginBottom: 16,
  },
  qrLabel: {
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
  },
  linkCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
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
  expiryNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  expiryText: {
    fontSize: 12,
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
