/**
 * DisCard 2035 - Request Payment Link Screen
 *
 * Streamlined request flow:
 * - Hero amount display (from transfer screen)
 * - Optional memo
 * - QR code generation
 * - Share/copy functionality
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Text,
  Image,
  Dimensions,
} from "react-native";
import { PressableScale } from "pressto";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import QRCode from "react-native-qrcode-svg";

import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { usePaymentLink, type PaymentRequest } from "@/hooks/usePaymentLink";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================================================
// Component
// ============================================================================

export default function RequestLinkScreen() {
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    amount?: string;
    token?: string;
    tokenMint?: string;
    tokenDecimals?: string;
    tokenLogoUri?: string;
  }>();

  // Parse params from transfer screen
  const amountUsd = parseFloat(params.amount || "0");
  const tokenSymbol = params.token || "USDC";
  const tokenMint = params.tokenMint || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const tokenDecimals = parseInt(params.tokenDecimals || "6", 10);
  const tokenLogoUri = params.tokenLogoUri;

  const [memo, setMemo] = useState("");
  const [generatedRequest, setGeneratedRequest] = useState<PaymentRequest | null>(null);
  const [showMemoInput, setShowMemoInput] = useState(false);

  const { createPaymentLink, copyToClipboard, shareLink, isCreating, isCopying, isSharing, error } =
    usePaymentLink();

  // Animation values
  const qrScale = useSharedValue(0);
  const checkScale = useSharedValue(0);

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const textColor = useThemeColor({}, "text");
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");

  // Handle back
  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/transfer");
    }
  }, []);

  // Generate link automatically on mount (or when user confirms)
  const handleGenerate = useCallback(async () => {
    if (amountUsd <= 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const request = await createPaymentLink({
        amount: amountUsd,
        token: tokenSymbol,
        tokenMint: tokenMint,
        tokenDecimals: tokenDecimals,
        amountUsd: amountUsd,
        memo: memo.trim() || undefined,
      });

      setGeneratedRequest(request);

      // Animate QR code appearance
      qrScale.value = withSequence(
        withTiming(1.1, { duration: 200 }),
        withSpring(1, { damping: 12, stiffness: 150 })
      );
      checkScale.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1.2, { duration: 200 }),
        withSpring(1, { damping: 10 })
      );

      // Success haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("[RequestLink] Generation failed:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [amountUsd, tokenSymbol, tokenMint, tokenDecimals, memo, createPaymentLink]);

  // Copy link
  const handleCopy = useCallback(async () => {
    if (generatedRequest) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await copyToClipboard(generatedRequest.webLink);
    }
  }, [generatedRequest, copyToClipboard]);

  // Share link
  const handleShare = useCallback(async () => {
    if (generatedRequest) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const message = `Pay me $${amountUsd.toFixed(2)}`;
      await shareLink(generatedRequest.webLink, message);
    }
  }, [generatedRequest, amountUsd, shareLink]);

  // Create new request (go back to transfer screen)
  const handleNewRequest = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/(tabs)/transfer");
  }, []);

  // Animated styles
  const qrAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: qrScale.value }],
  }));

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // ============================================================================
  // Render: Generated Link View (Success State)
  // ============================================================================

  if (generatedRequest) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <PressableScale
            onPress={handleBack}
            style={[styles.headerButton]}
          >
            <Ionicons name="close" size={24} color={textColor} />
          </PressableScale>
          <Text style={[styles.headerTitle, { color: textColor }]}>Request</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.successContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Success Badge */}
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.successBadge, { backgroundColor: `${successColor}15` }]}
          >
            <Animated.View style={checkAnimatedStyle}>
              <Ionicons name="checkmark-circle" size={20} color={successColor} />
            </Animated.View>
            <Text style={[styles.successText, { color: successColor }]}>
              Link Ready
            </Text>
          </Animated.View>

          {/* Hero Amount */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.heroAmount}>
            <Text style={[styles.heroAmountText, { color: textColor }]}>
              ${amountUsd.toFixed(2)}
            </Text>
            <View style={[styles.tokenBadge, { backgroundColor: primaryColor }]}>
              {tokenLogoUri && (
                <Image source={{ uri: tokenLogoUri }} style={styles.tokenBadgeImage} />
              )}
              <Text style={styles.tokenBadgeText}>{tokenSymbol}</Text>
            </View>
          </Animated.View>

          {/* QR Code */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(300)}
            style={[styles.qrCard, qrAnimatedStyle]}
          >
            <QRCode
              value={generatedRequest.qrData}
              size={SCREEN_WIDTH * 0.55}
              backgroundColor="#fff"
              color="#000"
            />
          </Animated.View>

          {/* Scan hint */}
          <Animated.View entering={FadeIn.delay(300).duration(200)}>
            <Text style={[styles.scanHint, { color: mutedColor }]}>
              Scan to pay with any Solana wallet
            </Text>
          </Animated.View>

          {/* Expiry */}
          <Animated.View
            entering={FadeIn.delay(350).duration(200)}
            style={styles.expiryRow}
          >
            <Ionicons name="time-outline" size={14} color={mutedColor} />
            <Text style={[styles.expiryText, { color: mutedColor }]}>
              Expires in 24 hours
            </Text>
          </Animated.View>

          {/* Memo display if added */}
          {memo.trim() && (
            <Animated.View
              entering={FadeIn.delay(400).duration(200)}
              style={[styles.memoDisplay, { backgroundColor: cardBg }]}
            >
              <Ionicons name="document-text-outline" size={16} color={mutedColor} />
              <Text style={[styles.memoDisplayText, { color: textColor }]} numberOfLines={2}>
                {memo}
              </Text>
            </Animated.View>
          )}
        </ScrollView>

        {/* Bottom Actions */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(300)}
          style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.actionRow}>
            <PressableScale
              onPress={handleCopy}
              enabled={!isCopying}
              style={[
                styles.actionButton,
                styles.secondaryAction,
              ]}
            >
              <Ionicons
                name={isCopying ? "checkmark" : "copy-outline"}
                size={20}
                color={isCopying ? successColor : primaryColor}
              />
              <Text style={[styles.secondaryActionText, { color: isCopying ? successColor : primaryColor }]}>
                {isCopying ? "Copied!" : "Copy Link"}
              </Text>
            </PressableScale>

            <PressableScale
              onPress={handleShare}
              enabled={!isSharing}
              style={[
                styles.actionButton,
                styles.primaryAction,
                { backgroundColor: primaryColor },
              ]}
            >
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={styles.primaryActionText}>Share</Text>
            </PressableScale>
          </View>

          {/* New Request */}
          <PressableScale
            onPress={handleNewRequest}
            style={[styles.newRequestLink]}
          >
            <Text style={[styles.newRequestText, { color: mutedColor }]}>
              Create another request
            </Text>
          </PressableScale>
        </Animated.View>
      </ThemedView>
    );
  }

  // ============================================================================
  // Render: Pre-Generation View (Confirm & Add Memo)
  // ============================================================================

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableScale
          onPress={handleBack}
          style={[styles.headerButton]}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </PressableScale>
        <Text style={[styles.headerTitle, { color: textColor }]}>Request</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Hero Amount */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.heroSection}>
          <Text style={[styles.heroAmountLarge, { color: textColor }]}>
            ${amountUsd.toFixed(2)}
          </Text>
          <View style={[styles.tokenBadge, { backgroundColor: primaryColor }]}>
            {tokenLogoUri && (
              <Image source={{ uri: tokenLogoUri }} style={styles.tokenBadgeImage} />
            )}
            <Text style={styles.tokenBadgeText}>{tokenSymbol}</Text>
          </View>
        </Animated.View>

        {/* Optional Memo */}
        <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.memoSection}>
          {showMemoInput ? (
            <View style={[styles.memoInputContainer, { backgroundColor: cardBg }]}>
              <TextInput
                style={[styles.memoInput, { color: textColor }]}
                value={memo}
                onChangeText={setMemo}
                placeholder="What's this for?"
                placeholderTextColor={mutedColor}
                autoFocus
                maxLength={100}
              />
              {memo.length > 0 && (
                <PressableScale onPress={() => setMemo("")} style={styles.memoClear}>
                  <Ionicons name="close-circle" size={18} color={mutedColor} />
                </PressableScale>
              )}
            </View>
          ) : (
            <PressableScale
              onPress={() => setShowMemoInput(true)}
              style={[
                styles.addMemoButton,
                { backgroundColor: cardBg },
              ]}
            >
              <Ionicons name="add" size={20} color={primaryColor} />
              <Text style={[styles.addMemoText, { color: primaryColor }]}>Add a note</Text>
            </PressableScale>
          )}
        </Animated.View>

        {/* Error */}
        {error && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={18} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}
      </View>

      {/* Generate Button */}
      <Animated.View
        entering={FadeInDown.delay(300).duration(300)}
        style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}
      >
        <PressableScale
          onPress={handleGenerate}
          enabled={amountUsd > 0 && !isCreating}
          style={[
            styles.generateButton,
            { backgroundColor: primaryColor },
            (amountUsd <= 0 || isCreating) && styles.buttonDisabled,
          ]}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="qr-code" size={20} color="#fff" />
              <Text style={styles.generateButtonText}>Generate Link</Text>
            </>
          )}
        </PressableScale>
      </Animated.View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  successContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: "center",
  },

  // Hero Amount
  heroSection: {
    alignItems: "center",
    paddingTop: 48,
    paddingBottom: 32,
  },
  heroAmountLarge: {
    fontSize: 56,
    fontWeight: "700",
    marginBottom: 16,
  },
  heroAmount: {
    alignItems: "center",
    marginBottom: 24,
  },
  heroAmountText: {
    fontSize: 44,
    fontWeight: "700",
    marginBottom: 12,
  },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: 24,
  },
  tokenBadgeImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  tokenBadgeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // Memo Section
  memoSection: {
    width: "100%",
  },
  addMemoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  addMemoText: {
    fontSize: 15,
    fontWeight: "500",
  },
  memoInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  memoInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
  },
  memoClear: {
    padding: 4,
  },

  // Error
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

  // Bottom Actions
  bottomActions: {
    paddingHorizontal: 24,
    paddingTop: 16,
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
  // Success State
  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 20,
  },
  successText: {
    fontSize: 15,
    fontWeight: "600",
  },
  qrCard: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 16,
  },
  scanHint: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  expiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  expiryText: {
    fontSize: 13,
  },
  memoDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
    width: "100%",
  },
  memoDisplayText: {
    flex: 1,
    fontSize: 14,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  secondaryAction: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  primaryAction: {},
  primaryActionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  newRequestLink: {
    alignItems: "center",
    paddingVertical: 12,
  },
  newRequestText: {
    fontSize: 14,
  },
});
