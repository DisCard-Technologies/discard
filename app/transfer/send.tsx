/**
 * DisCard 2035 - Send Screen
 *
 * Recipient selection for transfers with:
 * - RecipientInput for address/phone/email/domain entry
 * - InviteModal for SMS invites to non-users
 * - Contact suggestions
 * - QR scanning
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { RecipientInput } from "@/components/transfer/RecipientInput";
import { InviteModal } from "@/components/transfer/InviteModal";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type ResolvedAddress } from "@/hooks/useAddressResolver";
import { type Contact } from "@/hooks/useContacts";

// ============================================================================
// Main Screen
// ============================================================================

export default function SendScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    amount?: string;
    token?: string;
    returnTo?: string;
  }>();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");

  // Parse params
  const amount = params.amount ? JSON.parse(params.amount) : null;
  const token = params.token ? JSON.parse(params.token) : null;

  // State
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");

  // Handle recipient selection
  const handleRecipientSelect = useCallback(
    (resolved: ResolvedAddress, contact?: Contact) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Navigate to confirmation with the selected recipient
      (router.push as any)({
        pathname: "/transfer/confirmation",
        params: {
          recipient: JSON.stringify({
            input: resolved.input,
            address: resolved.address,
            displayName: resolved.displayName || contact?.name || resolved.input,
            type: resolved.type,
            contactId: contact?.id,
          }),
          token: params.token,
          amount: params.amount,
          fees: JSON.stringify({
            networkFee: 0.00001,
            networkFeeUsd: 0.001,
            platformFee: 0,
            priorityFee: 0.00001,
            ataRent: 0,
            totalFeesUsd: 0.001,
            totalCostUsd: (amount?.amount || 0) + 0.001,
          }),
        },
      });
    },
    [params.token, params.amount, amount]
  );

  // Handle invite
  const handleInvite = useCallback((phoneNumber: string) => {
    setInvitePhone(phoneNumber);
    setInviteModalVisible(true);
  }, []);

  // Handle QR scan
  const handleScanQR = useCallback(() => {
    router.push("/transfer/scan");
  }, []);

  // Handle invite success
  const handleInviteSuccess = useCallback(() => {
    setInviteModalVisible(false);
    // Show a success message or navigate back
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  // Handle back
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/transfer");
    }
  }, []);

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </Pressable>
          <ThemedText style={styles.title}>Send To</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        {/* Amount Display */}
        {amount && token && (
          <View style={styles.amountCard}>
            <ThemedText style={[styles.amountLabel, { color: mutedColor }]}>
              Sending
            </ThemedText>
            <ThemedText style={styles.amountValue}>
              ${amount.amount?.toFixed(2)} {token.symbol}
            </ThemedText>
          </View>
        )}

        {/* Recipient Input */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <RecipientInput
            onSelect={handleRecipientSelect}
            onScanQR={handleScanQR}
            onInvite={handleInvite}
            placeholder="Name, @username, phone, or address"
            autoFocus
          />

          {/* Helper text */}
          <View style={styles.helperSection}>
            <ThemedText style={[styles.helperText, { color: mutedColor }]}>
              Enter a Solana address, .sol domain, phone number, or email to send funds.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Invite Modal */}
      <InviteModal
        visible={inviteModalVisible}
        phoneNumber={invitePhone}
        pendingAmount={amount?.amount}
        pendingToken={token?.symbol}
        onClose={() => setInviteModalVisible(false)}
        onSuccess={handleInviteSuccess}
      />
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
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginRight: 40, // Balance the back button
  },
  headerSpacer: {
    width: 40,
  },
  pressed: {
    opacity: 0.6,
  },
  amountCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0,229,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.2)",
    alignItems: "center",
  },
  amountLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  helperSection: {
    marginTop: 24,
    paddingHorizontal: 8,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
