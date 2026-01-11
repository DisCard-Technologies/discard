/**
 * DisCard 2035 - Claim Invite Screen
 *
 * Handles deep links for invite codes:
 * - discard://claim/{code}
 * - https://www.discard.tech/claim/{code}
 *
 * Shows pending transfer info and CTA to signup/login.
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
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/stores/authConvex";

// ============================================================================
// Types
// ============================================================================

type ClaimStatus = "loading" | "valid" | "invalid" | "expired" | "claimed" | "claiming" | "success";

// ============================================================================
// Main Screen
// ============================================================================

export default function ClaimScreen() {
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { isAuthenticated, user } = useAuth();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const successColor = "#4CAF50";
  const errorColor = "#F44336";

  const [status, setStatus] = useState<ClaimStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Query invitation by code
  const invitation = useQuery(
    api.transfers.invitations.getByCode,
    code ? { inviteCode: code } : "skip"
  );

  // Claim mutation
  const claimInvitation = useMutation(api.transfers.invitations.claim);

  // Update status based on invitation query
  useEffect(() => {
    if (!code) {
      setStatus("invalid");
      setErrorMessage("Invalid invite link");
      return;
    }

    if (invitation === undefined) {
      setStatus("loading");
      return;
    }

    if (invitation === null) {
      setStatus("invalid");
      setErrorMessage("Invitation not found");
      return;
    }

    if (invitation.claimStatus === "claimed") {
      setStatus("claimed");
      setErrorMessage("This invitation has already been claimed");
      return;
    }

    if (invitation.claimStatus === "expired" || (invitation.expiresAt && invitation.expiresAt < Date.now())) {
      setStatus("expired");
      setErrorMessage("This invitation has expired");
      return;
    }

    setStatus("valid");
  }, [code, invitation]);

  // Auto-claim if user is authenticated
  useEffect(() => {
    if (status === "valid" && isAuthenticated && code) {
      handleClaim();
    }
  }, [status, isAuthenticated, code]);

  // Handle claim
  const handleClaim = async () => {
    if (!code) return;

    setStatus("claiming");
    try {
      const result = await claimInvitation({ inviteCode: code });
      if (result.success) {
        setStatus("success");
        // Navigate to main app after delay
        setTimeout(() => {
          router.replace("/(tabs)");
        }, 2000);
      } else {
        setStatus("invalid");
        setErrorMessage("Failed to claim invitation");
      }
    } catch (err) {
      setStatus("invalid");
      setErrorMessage(err instanceof Error ? err.message : "Failed to claim invitation");
    }
  };

  // Handle get started (signup/login)
  const handleGetStarted = () => {
    // Store the invite code for after auth
    // The onboarding flow will check for pending invites
    router.push({
      pathname: "/onboarding",
      params: { inviteCode: code },
    });
  };

  // Render loading state
  if (status === "loading") {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.content, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
            Loading invitation...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Render error states
  if (status === "invalid" || status === "expired" || status === "claimed") {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.content, { paddingTop: insets.top }]}>
          <View style={[styles.iconCircle, { backgroundColor: `${errorColor}20` }]}>
            <Ionicons
              name={status === "expired" ? "time-outline" : "close-circle-outline"}
              size={64}
              color={errorColor}
            />
          </View>
          <ThemedText style={styles.title}>
            {status === "expired" ? "Invitation Expired" : status === "claimed" ? "Already Claimed" : "Invalid Link"}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            {errorMessage}
          </ThemedText>
          <Pressable
            onPress={() => router.replace("/onboarding")}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: primaryColor },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={styles.buttonText}>Get DisCard</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  // Render claiming/success state
  if (status === "claiming" || status === "success") {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.content, { paddingTop: insets.top }]}>
          {status === "claiming" ? (
            <>
              <ActivityIndicator size="large" color={primaryColor} />
              <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                Claiming your transfer...
              </ThemedText>
            </>
          ) : (
            <>
              <View style={[styles.iconCircle, { backgroundColor: `${successColor}20` }]}>
                <Ionicons name="checkmark-circle" size={64} color={successColor} />
              </View>
              <ThemedText style={styles.title}>Transfer Claimed!</ThemedText>
              {invitation?.pendingAmount && invitation?.pendingToken && (
                <ThemedText style={[styles.amountText, { color: successColor }]}>
                  +${invitation.pendingAmount.toFixed(2)} {invitation.pendingToken}
                </ThemedText>
              )}
              <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
                The funds are now in your wallet
              </ThemedText>
            </>
          )}
        </View>
      </ThemedView>
    );
  }

  // Render valid invitation
  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        style={[styles.gradient, { paddingTop: insets.top }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <ThemedText style={styles.logo}>DisCard</ThemedText>
          </View>
        </View>

        {/* Invitation Card */}
        <View style={styles.inviteCard}>
          <View style={[styles.iconCircle, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="gift" size={48} color={primaryColor} />
          </View>

          <ThemedText style={styles.inviteTitle}>
            You've been invited!
          </ThemedText>

          {invitation?.senderName && (
            <ThemedText style={[styles.senderText, { color: mutedColor }]}>
              {invitation.senderName} sent you money
            </ThemedText>
          )}

          {invitation?.pendingAmount && invitation?.pendingToken && (
            <View style={styles.amountCard}>
              <ThemedText style={[styles.amountLabel, { color: mutedColor }]}>
                Pending transfer
              </ThemedText>
              <ThemedText style={styles.amountValue}>
                ${invitation.pendingAmount.toFixed(2)} {invitation.pendingToken}
              </ThemedText>
            </View>
          )}

          <ThemedText style={[styles.description, { color: mutedColor }]}>
            Create your DisCard account to claim this transfer and start sending money instantly.
          </ThemedText>
        </View>

        {/* CTA Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          {isAuthenticated ? (
            <Pressable
              onPress={handleClaim}
              style={({ pressed }) => [
                styles.ctaButton,
                { backgroundColor: primaryColor },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <ThemedText style={styles.ctaButtonText}>Claim Transfer</ThemedText>
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
  inviteCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  inviteTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  senderText: {
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
  },
  amountLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: "700",
    color: "#fff",
  },
  amountText: {
    fontSize: 28,
    fontWeight: "700",
    marginVertical: 16,
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
