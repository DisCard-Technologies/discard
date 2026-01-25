/**
 * DisCard 2035 - Payment Request Screen
 *
 * Handles deep links for payment requests:
 * - discard://pay/{requestId}
 * - https://www.discard.tech/pay/{requestId}
 *
 * Shows payment request info and allows user to pay.
 */

import { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/stores/authConvex";

// ============================================================================
// Types
// ============================================================================

type PaymentStatus = "loading" | "valid" | "invalid" | "expired" | "paid";

// ============================================================================
// Main Screen
// ============================================================================

export default function PaymentRequestScreen() {
  const insets = useSafeAreaInsets();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { isAuthenticated } = useAuth();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const successColor = "#4CAF50";
  const errorColor = "#F44336";

  const [status, setStatus] = useState<PaymentStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Query payment request by ID
  const paymentRequest = useQuery(
    api.transfers.paymentRequests.getByRequestId,
    requestId ? { requestId } : "skip"
  );

  // Update status based on payment request query
  useEffect(() => {
    if (!requestId) {
      setStatus("invalid");
      setErrorMessage("Invalid payment link");
      return;
    }

    if (paymentRequest === undefined) {
      setStatus("loading");
      return;
    }

    if (paymentRequest === null) {
      setStatus("invalid");
      setErrorMessage("Payment request not found");
      return;
    }

    if (paymentRequest.status === "paid") {
      setStatus("paid");
      setErrorMessage("This payment request has already been paid");
      return;
    }

    if (paymentRequest.status === "expired" || (paymentRequest.expiresAt && paymentRequest.expiresAt < Date.now())) {
      setStatus("expired");
      setErrorMessage("This payment request has expired");
      return;
    }

    setStatus("valid");
  }, [requestId, paymentRequest]);

  // Handle pay button - navigate to send screen with prefilled data
  const handlePay = () => {
    if (!paymentRequest) return;

    router.push({
      pathname: "/transfer/send",
      params: {
        recipientAddress: paymentRequest.recipientAddress,
        amount: paymentRequest.amount?.toString(),
        token: paymentRequest.token,
        tokenMint: paymentRequest.tokenMint,
        memo: paymentRequest.memo,
        paymentRequestId: requestId,
      },
    });
  };

  // Handle get started (signup/login)
  const handleGetStarted = () => {
    router.push({
      pathname: "/onboarding",
      params: { paymentRequestId: requestId },
    });
  };

  // Format amount display
  const formatAmount = (amount: number, token: string) => {
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${token}`;
  };

  // Render loading state
  if (status === "loading") {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.content, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
            Loading payment request...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Render error states
  if (status === "invalid" || status === "expired" || status === "paid") {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.content, { paddingTop: insets.top }]}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + 16 }]}
          >
            <Ionicons name="close" size={24} color={mutedColor} />
          </Pressable>

          <View style={[styles.iconCircle, { backgroundColor: status === "paid" ? `${successColor}20` : `${errorColor}20` }]}>
            <Ionicons
              name={status === "expired" ? "time-outline" : status === "paid" ? "checkmark-circle" : "close-circle-outline"}
              size={64}
              color={status === "paid" ? successColor : errorColor}
            />
          </View>
          <ThemedText style={styles.title}>
            {status === "expired" ? "Request Expired" : status === "paid" ? "Already Paid" : "Invalid Link"}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            {errorMessage}
          </ThemedText>
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: primaryColor },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={styles.buttonText}>Go to Home</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  // Render valid payment request
  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        style={[styles.gradient, { paddingTop: insets.top }]}
      >
        {/* Back Button */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { top: insets.top + 16 }]}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <ThemedText style={styles.logo}>DisCard</ThemedText>
          </View>
        </View>

        {/* Payment Request Card */}
        <View style={styles.requestCard}>
          <View style={[styles.iconCircle, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="arrow-up-circle" size={48} color={primaryColor} />
          </View>

          <ThemedText style={styles.requestTitle}>
            Payment Request
          </ThemedText>

          {paymentRequest?.recipientName && (
            <ThemedText style={[styles.recipientText, { color: mutedColor }]}>
              {paymentRequest.recipientName} is requesting payment
            </ThemedText>
          )}

          {paymentRequest?.amount && paymentRequest?.token && (
            <View style={styles.amountCard}>
              <ThemedText style={[styles.amountLabel, { color: mutedColor }]}>
                Amount requested
              </ThemedText>
              <ThemedText style={styles.amountValue}>
                {formatAmount(paymentRequest.amount, paymentRequest.token)}
              </ThemedText>
              {paymentRequest.amountUsd !== undefined && paymentRequest.amountUsd > 0 && (
                <ThemedText style={[styles.amountUsd, { color: mutedColor }]}>
                  ≈ ${paymentRequest.amountUsd.toFixed(2)} USD
                </ThemedText>
              )}
            </View>
          )}

          {paymentRequest?.memo && (
            <View style={styles.memoContainer}>
              <ThemedText style={[styles.memoLabel, { color: mutedColor }]}>
                Memo
              </ThemedText>
              <ThemedText style={styles.memoText}>
                {paymentRequest.memo}
              </ThemedText>
            </View>
          )}

          <ThemedText style={[styles.description, { color: mutedColor }]}>
            {isAuthenticated
              ? "Tap below to send this payment securely via DisCard."
              : "Create a DisCard account to send this payment instantly."}
          </ThemedText>
        </View>

        {/* CTA Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          {isAuthenticated ? (
            <Pressable
              onPress={handlePay}
              style={({ pressed }) => [
                styles.ctaButton,
                { backgroundColor: primaryColor },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="send" size={20} color="#fff" />
              <ThemedText style={styles.ctaButtonText}>Pay Now</ThemedText>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleGetStarted}
              style={({ pressed }) => [
                styles.ctaButton,
                { backgroundColor: primaryColor },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="rocket" size={20} color="#fff" />
              <ThemedText style={styles.ctaButtonText}>Get Started</ThemedText>
            </Pressable>
          )}
        </View>
      </LinearGradient>
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
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  gradient: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  header: {
    padding: 24,
    alignItems: "center",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.8,
  },
  requestCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  requestTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  recipientText: {
    fontSize: 16,
    marginBottom: 24,
  },
  amountCard: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    minWidth: 200,
  },
  amountLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
  },
  amountUsd: {
    fontSize: 15,
    marginTop: 4,
  },
  memoContainer: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: "100%",
    maxWidth: 300,
  },
  memoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  memoText: {
    fontSize: 15,
    color: "#fff",
  },
  description: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  footer: {
    padding: 24,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
  },
  ctaButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
