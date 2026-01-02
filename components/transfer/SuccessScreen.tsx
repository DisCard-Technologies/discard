/**
 * DisCard 2035 - SuccessScreen Component
 *
 * Animated success screen for completed transfers:
 * - Animated checkmark
 * - Transaction summary
 * - Solscan link
 * - Done button
 */

import { useEffect } from "react";
import { StyleSheet, View, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  FadeInUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { formatAddress } from "@/lib/transfer/address-resolver";
import type { TransferResult, TransferRecipient } from "@/hooks/useTransfer";

// ============================================================================
// Types
// ============================================================================

export interface SuccessScreenProps {
  /** Transfer result */
  result: TransferResult;
  /** Recipient information */
  recipient: TransferRecipient;
  /** Amount sent (display) */
  amountDisplay: string;
  /** Amount in USD */
  amountUsd: number;
  /** Token symbol */
  tokenSymbol: string;
  /** Fees paid */
  feesPaid: number;
  /** Callback when done is pressed */
  onDone: () => void;
  /** Auto dismiss after delay (ms), 0 to disable */
  autoDismissMs?: number;
}

// ============================================================================
// Animated Checkmark Component
// ============================================================================

function AnimatedCheckmark() {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(-20);

  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const bgColor = useThemeColor(
    { light: "rgba(76, 175, 80, 0.1)", dark: "rgba(102, 187, 106, 0.15)" },
    "background"
  );

  useEffect(() => {
    // Trigger haptic on mount
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate checkmark
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSequence(
      withTiming(1.2, { duration: 200, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
    rotation.value = withTiming(0, { duration: 300 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.checkmarkContainer,
        { backgroundColor: bgColor },
        animatedStyle,
      ]}
    >
      <Ionicons name="checkmark" size={48} color={successColor} />
    </Animated.View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SuccessScreen({
  result,
  recipient,
  amountDisplay,
  amountUsd,
  tokenSymbol,
  feesPaid,
  onDone,
  autoDismissMs = 0,
}: SuccessScreenProps) {
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");

  // Auto dismiss
  useEffect(() => {
    if (autoDismissMs > 0) {
      const timer = setTimeout(onDone, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [autoDismissMs, onDone]);

  // Open Solscan
  const handleViewOnSolscan = () => {
    Linking.openURL(result.explorerUrl);
  };

  // Format recipient display
  const recipientDisplay =
    recipient.displayName || formatAddress(recipient.address, 6);

  // Format confirmation time
  const confirmationTimeDisplay = result.confirmationTimeMs < 1000
    ? `${result.confirmationTimeMs}ms`
    : `${(result.confirmationTimeMs / 1000).toFixed(1)}s`;

  return (
    <View style={styles.container}>
      {/* Animated Checkmark */}
      <AnimatedCheckmark />

      {/* Success Title */}
      <Animated.View entering={FadeIn.delay(200).duration(300)}>
        <ThemedText style={styles.title}>Transfer Sent!</ThemedText>
      </Animated.View>

      {/* Amount Display */}
      <Animated.View
        entering={FadeInUp.delay(300).duration(300)}
        style={styles.amountContainer}
      >
        <ThemedText style={styles.amountText}>{amountDisplay}</ThemedText>
        <ThemedText style={[styles.amountUsd, { color: mutedColor }]}>
          ≈ ${amountUsd.toFixed(2)} USD
        </ThemedText>
      </Animated.View>

      {/* Transfer Details Card */}
      <Animated.View
        entering={FadeInUp.delay(400).duration(300)}
        style={[styles.detailsCard, { backgroundColor: cardBg, borderColor }]}
      >
        {/* Recipient */}
        <View style={styles.detailRow}>
          <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>
            To
          </ThemedText>
          <View style={styles.recipientContainer}>
            <ThemedText style={styles.detailValue} numberOfLines={1}>
              {recipientDisplay}
            </ThemedText>
            {recipient.type === "sol_name" && (
              <Ionicons name="checkmark-circle" size={14} color={successColor} />
            )}
          </View>
        </View>

        {/* Confirmation Time */}
        <View style={styles.detailRow}>
          <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>
            Confirmed in
          </ThemedText>
          <View style={styles.confirmationContainer}>
            <ThemedText
              style={[
                styles.detailValue,
                result.withinTarget && { color: successColor },
              ]}
            >
              {confirmationTimeDisplay}
            </ThemedText>
            {result.withinTarget && (
              <Ionicons name="flash" size={14} color={successColor} />
            )}
          </View>
        </View>

        {/* Fees Paid */}
        <View style={styles.detailRow}>
          <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>
            Fees paid
          </ThemedText>
          <ThemedText style={styles.detailValue}>
            ${feesPaid.toFixed(4)}
          </ThemedText>
        </View>

        {/* Transaction Signature */}
        <View style={styles.signatureRow}>
          <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>
            Signature
          </ThemedText>
          <ThemedText
            style={[styles.signatureText, { color: mutedColor }]}
            numberOfLines={1}
          >
            {formatAddress(result.signature, 8)}
          </ThemedText>
        </View>
      </Animated.View>

      {/* Action Buttons */}
      <Animated.View
        entering={FadeInUp.delay(500).duration(300)}
        style={styles.buttonsContainer}
      >
        {/* View on Solscan */}
        <Pressable
          onPress={handleViewOnSolscan}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor },
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="open-outline" size={18} color={primaryColor} />
          <ThemedText style={[styles.secondaryButtonText, { color: primaryColor }]}>
            View on Solscan
          </ThemedText>
        </Pressable>

        {/* Done Button */}
        <Pressable
          onPress={onDone}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: primaryColor },
            pressed && styles.buttonPressed,
          ]}
        >
          <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
        </Pressable>
      </Animated.View>

      {/* Alpenglow Badge */}
      {result.withinTarget && (
        <Animated.View
          entering={FadeIn.delay(700).duration(300)}
          style={[styles.alpenglowBadge, { backgroundColor: `${successColor}15` }]}
        >
          <Ionicons name="flash" size={14} color={successColor} />
          <ThemedText style={[styles.alpenglowText, { color: successColor }]}>
            Alpenglow fast confirmation
          </ThemedText>
        </Animated.View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  checkmarkContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  amountContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  amountText: {
    fontSize: 36,
    fontWeight: "700",
  },
  amountUsd: {
    fontSize: 16,
    marginTop: 4,
  },
  detailsCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  recipientContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  confirmationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  signatureRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    marginTop: 4,
  },
  signatureText: {
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 4,
  },
  buttonsContainer: {
    width: "100%",
    gap: 12,
  },
  primaryButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  alpenglowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 24,
  },
  alpenglowText: {
    fontSize: 13,
    fontWeight: "500",
  },
});

export default SuccessScreen;
