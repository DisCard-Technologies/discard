/**
 * DisCard 2035 - Transfer Confirmation Modal
 *
 * Pre-send confirmation screen showing:
 * - Transfer summary
 * - Fee breakdown
 * - Biometric confirm button
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { TransferSummary } from "@/components/transfer";
import type {
  TransferRecipient,
  TransferToken,
  TransferAmount,
  TransferFees,
} from "@/hooks/useTransfer";

// ============================================================================
// Component
// ============================================================================

export default function TransferConfirmationScreen() {
  const params = useLocalSearchParams<{
    recipient: string;
    token: string;
    amount: string;
    fees: string;
    createsAta?: string;
    memo?: string;
  }>();

  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");

  // Parse params
  let recipient: TransferRecipient | null = null;
  let token: TransferToken | null = null;
  let amount: TransferAmount | null = null;
  let fees: TransferFees | null = null;

  try {
    if (params.recipient) recipient = JSON.parse(params.recipient);
    if (params.token) token = JSON.parse(params.token);
    if (params.amount) amount = JSON.parse(params.amount);
    if (params.fees) fees = JSON.parse(params.fees);
  } catch (e) {
    console.error("[Confirmation] Failed to parse params:", e);
  }

  const createsAta = params.createsAta === "true";
  const memo = params.memo;

  // Handle edit (go back)
  const handleEdit = useCallback(() => {
    router.back();
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    router.dismissAll();
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(async () => {
    if (!recipient || !token || !amount || !fees) return;

    setIsConfirming(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Navigate to the transfer execution
      // The actual signing happens in the parent component via the useTransfer hook
      router.push({
        pathname: "/transfer/success",
        params: {
          recipient: params.recipient,
          token: params.token,
          amount: params.amount,
          fees: params.fees,
          memo: params.memo,
          // The parent will handle actual execution and pass result
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
      setIsConfirming(false);
    }
  }, [recipient, token, amount, fees, params]);

  // Show error if params missing
  if (!recipient || !token || !amount || !fees) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color={errorColor} />
            <ThemedText style={[styles.errorTitle, { color: errorColor }]}>
              Invalid Transfer Data
            </ThemedText>
            <ThemedText style={[styles.errorText, { color: mutedColor }]}>
              Could not load transfer details.
            </ThemedText>
            <Pressable
              onPress={handleClose}
              style={[styles.closeButton, { borderColor: mutedColor }]}
            >
              <ThemedText>Close</ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.header}
        >
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={mutedColor} />
          </Pressable>

          <ThemedText style={styles.headerTitle}>Confirm Transfer</ThemedText>

          <View style={styles.headerButton} />
        </Animated.View>

        {/* Content */}
        <View style={styles.content}>
          {/* Transfer Summary */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <TransferSummary
              recipient={recipient}
              token={token}
              amount={amount}
              fees={fees}
              createsAta={createsAta}
              memo={memo}
            />
          </Animated.View>

          {/* Error Message */}
          {error && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={styles.errorBanner}
            >
              <Ionicons name="alert-circle" size={18} color={errorColor} />
              <ThemedText style={[styles.errorBannerText, { color: errorColor }]}>
                {error}
              </ThemedText>
            </Animated.View>
          )}
        </View>

        {/* Bottom Actions */}
        <Animated.View
          entering={FadeInUp.delay(200).duration(300)}
          style={styles.bottomActions}
        >
          {/* Edit Button */}
          <Pressable
            onPress={handleEdit}
            disabled={isConfirming}
            style={({ pressed }) => [
              styles.editButton,
              { borderColor: mutedColor },
              pressed && styles.pressed,
              isConfirming && styles.buttonDisabled,
            ]}
          >
            <Ionicons name="pencil" size={18} color={mutedColor} />
            <ThemedText style={[styles.editButtonText, { color: mutedColor }]}>
              Edit
            </ThemedText>
          </Pressable>

          {/* Confirm Button */}
          <Pressable
            onPress={handleConfirm}
            disabled={isConfirming}
            style={({ pressed }) => [
              styles.confirmButton,
              { backgroundColor: primaryColor },
              pressed && styles.pressed,
              isConfirming && styles.buttonDisabled,
            ]}
          >
            {isConfirming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="finger-print" size={22} color="#fff" />
                <ThemedText style={styles.confirmButtonText}>
                  Confirm with Face ID
                </ThemedText>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* Security Note */}
        <Animated.View
          entering={FadeIn.delay(400).duration(300)}
          style={styles.securityNote}
        >
          <Ionicons name="shield-checkmark" size={14} color={mutedColor} />
          <ThemedText style={[styles.securityText, { color: mutedColor }]}>
            Secured by Turnkey TEE • Your keys never leave the enclave
          </ThemedText>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  closeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderRadius: 12,
    marginTop: 16,
  },
  errorBannerText: {
    fontSize: 14,
    flex: 1,
  },
  bottomActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
  },
  confirmButtonText: {
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
    paddingHorizontal: 20,
  },
  securityText: {
    fontSize: 12,
    textAlign: "center",
  },
});
