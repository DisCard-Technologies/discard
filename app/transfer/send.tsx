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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Text,
} from "react-native";
import { PressableScale } from "pressto";
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
import { useFeeEstimate } from "@/hooks/useFeeEstimate";
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

  // Dynamic fee estimation
  const { fees } = useFeeEstimate({
    amountUsd: amount?.amount || 0,
    includeAtaRent: false, // Will be determined by recipient
    enabled: true,
  });

  // State
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [pendingRecipient, setPendingRecipient] = useState<{
    resolved: ResolvedAddress;
    contact?: Contact;
  } | null>(null);

  // Handle recipient selection - store pending recipient
  const handleRecipientSelect = useCallback(
    (resolved: ResolvedAddress, contact?: Contact) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPendingRecipient({ resolved, contact });
    },
    []
  );

  // Handle continue - navigate to confirmation
  const handleContinue = useCallback(() => {
    if (!pendingRecipient) return;

    const { resolved, contact } = pendingRecipient;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
          networkFee: fees.networkFee,
          networkFeeUsd: fees.networkFeeUsd,
          platformFee: fees.platformFee,
          priorityFee: fees.priorityFee,
          ataRent: fees.ataRent,
          totalFeesUsd: fees.totalFeesUsd,
          totalCostUsd: fees.totalCostUsd,
        }),
      },
    });
  }, [pendingRecipient, params.token, params.amount, fees]);

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
          <PressableScale
            onPress={handleBack}
            style={[styles.backButton]}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </PressableScale>

          <ThemedText style={styles.headerTitle}>Send</ThemedText>

          {/* Right: QR Button */}
          <PressableScale
            onPress={handleScanQR}
            style={[styles.qrButton]}
          >
            <Ionicons name="qr-code-outline" size={22} color={primaryColor} />
          </PressableScale>
        </View>

        {/* Amount + Token Badge */}
        <View style={styles.amountRow}>
          <Text style={[styles.amountText, { color: textColor }]}>
            ${amount?.amount?.toFixed(2) || '0.00'}
          </Text>
          {token && (
            <View style={[styles.tokenBadge, { backgroundColor: primaryColor }]}>
              {token.logoUri && (
                <Image
                  source={{ uri: token.logoUri }}
                  style={styles.tokenImage}
                />
              )}
              <Text style={styles.tokenText}>{token.symbol}</Text>
            </View>
          )}
        </View>

        {/* Recipient Input */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <RecipientInput
            onSelect={handleRecipientSelect}
            onInvite={handleInvite}
            placeholder="Name, phone, or address"
            autoFocus
          />
        </ScrollView>

        {/* Continue Button - shown when recipient is selected */}
        {pendingRecipient && (
          <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.selectedRecipient}>
              <Ionicons name="person-circle-outline" size={20} color={primaryColor} />
              <Text style={[styles.selectedRecipientText, { color: textColor }]} numberOfLines={1}>
                {pendingRecipient.contact?.name || pendingRecipient.resolved.displayName || pendingRecipient.resolved.input}
              </Text>
              <PressableScale
                onPress={() => setPendingRecipient(null)}
                style={styles.clearRecipient}
              >
                <Ionicons name="close-circle" size={20} color={mutedColor} />
              </PressableScale>
            </View>
            <PressableScale
              onPress={handleContinue}
              style={[
                styles.continueButton,
                { backgroundColor: primaryColor },
              ]}
            >
              <Text style={styles.continueButtonText}>Review</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </PressableScale>
          </View>
        )}
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
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  qrButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  amountText: {
    fontSize: 32,
    fontWeight: "700",
  },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 5,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tokenImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  tokenText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  bottomContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
    gap: 12,
  },
  selectedRecipient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
  },
  selectedRecipientText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  clearRecipient: {
    padding: 4,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  continueButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
