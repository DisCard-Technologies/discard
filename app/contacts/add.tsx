/**
 * DisCard 2035 - Add Contact Screen
 *
 * Manual contact creation with:
 * - Name input
 * - Address/identifier input with auto-detection
 * - Real-time validation and resolution
 * - Support for Solana addresses, .sol domains, phone, email
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { ContactsStorage } from "@/lib/contacts-storage";
import { formatAddress } from "@/lib/transfer/address-resolver";

// ============================================================================
// Type Badge Component
// ============================================================================

function TypeBadge({
  type,
  isValid,
  isResolving,
}: {
  type: "address" | "sol_name" | "phone" | "email" | "unknown";
  isValid: boolean;
  isResolving: boolean;
}) {
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const warningColor = useThemeColor({ light: "#FF9800", dark: "#FFB74D" }, "text");
  const infoColor = useThemeColor({ light: "#2196F3", dark: "#64B5F6" }, "text");

  if (type === "unknown") return null;

  const labels: Record<string, string> = {
    address: "Solana address",
    sol_name: ".sol domain",
    phone: "Phone number",
    email: "Email address",
  };

  const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
    address: "wallet-outline",
    sol_name: "globe-outline",
    phone: "call-outline",
    email: "mail-outline",
  };

  const label = labels[type];
  const icon = icons[type];
  const color = isResolving
    ? infoColor
    : isValid
    ? successColor
    : warningColor;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      style={[styles.badge, { backgroundColor: `${color}15` }]}
    >
      {isResolving ? (
        <ActivityIndicator size={12} color={color} />
      ) : (
        <Ionicons
          name={isValid ? "checkmark-circle" : icon}
          size={14}
          color={color}
        />
      )}
      <ThemedText style={[styles.badgeText, { color }]}>
        {isResolving ? "Resolving..." : label}
      </ThemedText>
    </Animated.View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AddContactScreen() {
  const insets = useSafeAreaInsets();

  // Theme colors
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const inputBg = useThemeColor({ light: "#f5f5f5", dark: "#1c1c1e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );
  const errorColor = "#ef4444";

  // State
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Address resolver hook
  const {
    input: identifier,
    setInput: setIdentifier,
    type: identifierType,
    isResolving,
    resolved,
    isValidFormat,
    error: resolveError,
    isResolved,
  } = useAddressResolver();

  // Validation
  const isNameValid = name.trim().length >= 1;
  const canSave = isNameValid && isResolved && !!resolved?.address && !isSaving;

  // Handle back
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/contacts");
    }
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!canSave || !resolved) return;

    setIsSaving(true);
    setSaveError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await ContactsStorage.create({
        name: name.trim(),
        identifier: identifier.trim(),
        identifierType: identifierType === "unknown" ? "address" : identifierType,
        resolvedAddress: resolved.address,
        verified: false,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate back to contacts
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/contacts");
      }
    } catch (err) {
      console.error("[AddContact] Save failed:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save contact");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [canSave, resolved, name, identifier, identifierType]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.header, { paddingTop: insets.top + 8 }]}
        >
          <PressableScale onPress={handleBack} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={mutedColor} />
          </PressableScale>

          <ThemedText style={styles.headerTitle}>Add Contact</ThemedText>

          <PressableScale
            onPress={handleSave}
            enabled={canSave}
            style={[
              styles.saveButton,
              { backgroundColor: primaryColor },
              !canSave && styles.saveButtonDisabled,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Save</ThemedText>
            )}
          </PressableScale>
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name Input */}
          <Animated.View
            entering={FadeInUp.delay(100).duration(300)}
            style={styles.inputSection}
          >
            <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
              Name
            </ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor }]}>
              <Ionicons name="person-outline" size={20} color={mutedColor} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Contact name"
                placeholderTextColor={mutedColor}
                style={[styles.input, { color: textColor }]}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
              />
              {name.length > 0 && (
                <PressableScale onPress={() => setName("")}>
                  <Ionicons name="close-circle" size={18} color={mutedColor} />
                </PressableScale>
              )}
            </View>
          </Animated.View>

          {/* Identifier Input */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(300)}
            style={styles.inputSection}
          >
            <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
              Address or identifier
            </ThemedText>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: inputBg, borderColor },
                resolveError && !isResolving && { borderColor: errorColor },
                isResolved && { borderColor: primaryColor },
              ]}
            >
              <Ionicons
                name={
                  identifierType === "phone"
                    ? "call-outline"
                    : identifierType === "email"
                    ? "mail-outline"
                    : identifierType === "sol_name"
                    ? "globe-outline"
                    : "wallet-outline"
                }
                size={20}
                color={isResolved ? primaryColor : mutedColor}
              />
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Solana address, .sol, phone, or email"
                placeholderTextColor={mutedColor}
                style={[styles.input, { color: textColor }]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
              />
              {isResolving && (
                <ActivityIndicator size="small" color={primaryColor} />
              )}
              {identifier.length > 0 && !isResolving && (
                <PressableScale onPress={() => setIdentifier("")}>
                  <Ionicons name="close-circle" size={18} color={mutedColor} />
                </PressableScale>
              )}
            </View>

            {/* Type Badge */}
            {identifierType !== "unknown" && (
              <View style={styles.badgeRow}>
                <TypeBadge
                  type={identifierType}
                  isValid={isResolved}
                  isResolving={isResolving}
                />
              </View>
            )}

            {/* Resolved Address Display */}
            {isResolved && resolved?.address && identifierType !== "address" && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={[styles.resolvedBox, { backgroundColor: `${primaryColor}10` }]}
              >
                <Ionicons name="checkmark-circle" size={16} color={primaryColor} />
                <ThemedText style={[styles.resolvedText, { color: primaryColor }]}>
                  Resolves to {formatAddress(resolved.address, 8)}
                </ThemedText>
              </Animated.View>
            )}

            {/* Error Display */}
            {resolveError && !isResolving && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={[styles.errorBox, { backgroundColor: `${errorColor}10` }]}
              >
                <Ionicons name="alert-circle" size={16} color={errorColor} />
                <ThemedText style={[styles.errorText, { color: errorColor }]}>
                  {resolveError}
                </ThemedText>
              </Animated.View>
            )}
          </Animated.View>

          {/* Save Error */}
          {saveError && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.saveErrorBox, { backgroundColor: `${errorColor}10` }]}
            >
              <Ionicons name="alert-circle" size={18} color={errorColor} />
              <ThemedText style={[styles.saveErrorText, { color: errorColor }]}>
                {saveError}
              </ThemedText>
            </Animated.View>
          )}

          {/* Help Text */}
          <Animated.View
            entering={FadeInUp.delay(300).duration(300)}
            style={styles.helpSection}
          >
            <ThemedText style={[styles.helpTitle, { color: textColor }]}>
              Supported formats
            </ThemedText>
            <View style={styles.helpList}>
              <View style={styles.helpItem}>
                <Ionicons name="wallet-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.helpText, { color: mutedColor }]}>
                  Solana address (e.g., 7xKX...)
                </ThemedText>
              </View>
              <View style={styles.helpItem}>
                <Ionicons name="globe-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.helpText, { color: mutedColor }]}>
                  .sol domain (e.g., alice.sol)
                </ThemedText>
              </View>
              <View style={styles.helpItem}>
                <Ionicons name="call-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.helpText, { color: mutedColor }]}>
                  Phone number (DisCard users only)
                </ThemedText>
              </View>
              <View style={styles.helpItem}>
                <Ionicons name="mail-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.helpText, { color: mutedColor }]}>
                  Email address (DisCard users only)
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  inputSection: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  resolvedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  resolvedText: {
    fontSize: 13,
    fontWeight: "500",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "500",
  },
  saveErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  saveErrorText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  helpSection: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(128,128,128,0.05)",
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  helpList: {
    gap: 10,
  },
  helpItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  helpText: {
    fontSize: 13,
  },
});
