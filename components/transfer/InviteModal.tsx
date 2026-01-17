/**
 * DisCard 2035 - InviteModal Component
 *
 * Modal for sending SMS invitations to non-DisCard users.
 * Features:
 * - Phone number display
 * - Optional custom message
 * - Optional pending transfer amount
 * - Send/cancel actions
 * - Loading and success states
 */

import { useState } from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";

// ============================================================================
// Types
// ============================================================================

export interface InviteModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Phone number to invite */
  phoneNumber: string;
  /** Optional pending transfer amount (in USD) */
  pendingAmount?: number;
  /** Optional pending transfer token */
  pendingToken?: string;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when invitation is sent successfully */
  onSuccess?: () => void;
}

type InviteStatus = "idle" | "sending" | "success" | "error";

// ============================================================================
// Main Component
// ============================================================================

export function InviteModal({
  visible,
  phoneNumber,
  pendingAmount,
  pendingToken,
  onClose,
  onSuccess,
}: InviteModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({ light: "#fff", dark: "#1c1c1e" }, "background");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#2c2c2e" }, "background");
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");

  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<InviteStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Convex mutation for creating and action for sending invitation
  const createInvitation = useMutation(api.transfers.invitations.create);
  const sendInvitation = useAction(api.transfers.invitations.send);

  // Format phone number for display
  const formatPhoneNumber = (phone: string): string => {
    // Simple formatting - could be enhanced with libphonenumber
    if (phone.startsWith("+1") && phone.length === 12) {
      return `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
    }
    return phone;
  };

  // Handle send invitation
  const handleSend = async () => {
    setStatus("sending");
    setErrorMessage(null);

    try {
      // Create invitation record
      const invitationId = await createInvitation({
        recipientPhone: phoneNumber,
        message: message.trim() || undefined,
        pendingAmount: pendingAmount,
        pendingToken: pendingToken,
      });

      // Send SMS
      await sendInvitation({ invitationId });

      setStatus("success");

      // Call success callback after short delay
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1500);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to send invitation");
    }
  };

  // Handle close
  const handleClose = () => {
    setMessage("");
    setStatus("idle");
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <Animated.View
          entering={SlideInDown.duration(300)}
          style={[styles.modal, { backgroundColor: bgColor }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Ionicons name="person-add" size={24} color={primaryColor} />
              <ThemedText style={styles.title}>Invite to DisCard</ThemedText>
            </View>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={24} color={mutedColor} />
            </Pressable>
          </View>

          {/* Phone Number Display */}
          <View style={[styles.phoneCard, { backgroundColor: cardBg }]}>
            <Ionicons name="call-outline" size={20} color={mutedColor} />
            <ThemedText style={styles.phoneNumber}>
              {formatPhoneNumber(phoneNumber)}
            </ThemedText>
          </View>

          {/* Pending Transfer Info */}
          {pendingAmount && pendingToken && (
            <View style={[styles.pendingCard, { backgroundColor: `${primaryColor}10` }]}>
              <Ionicons name="gift-outline" size={20} color={primaryColor} />
              <View style={styles.pendingContent}>
                <ThemedText style={[styles.pendingLabel, { color: mutedColor }]}>
                  Pending transfer
                </ThemedText>
                <ThemedText style={[styles.pendingAmount, { color: primaryColor }]}>
                  ${pendingAmount.toFixed(2)} {pendingToken}
                </ThemedText>
              </View>
            </View>
          )}

          {/* Custom Message Input */}
          <View style={styles.messageSection}>
            <ThemedText style={[styles.messageLabel, { color: mutedColor }]}>
              Add a message (optional)
            </ThemedText>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Hey! Join me on DisCard..."
              placeholderTextColor={mutedColor}
              style={[
                styles.messageInput,
                {
                  backgroundColor: cardBg,
                  color: textColor,
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                },
              ]}
              multiline
              maxLength={160}
              editable={status === "idle"}
            />
            <ThemedText style={[styles.charCount, { color: mutedColor }]}>
              {message.length}/160
            </ThemedText>
          </View>

          {/* Error Message */}
          {errorMessage && (
            <Animated.View entering={FadeIn} style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={errorColor} />
              <ThemedText style={[styles.errorText, { color: errorColor }]}>
                {errorMessage}
              </ThemedText>
            </Animated.View>
          )}

          {/* Success Message */}
          {status === "success" && (
            <Animated.View
              entering={FadeIn}
              style={[styles.successContainer, { backgroundColor: "#4CAF5020" }]}
            >
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <ThemedText style={[styles.successText, { color: "#4CAF50" }]}>
                Invitation sent!
              </ThemedText>
            </Animated.View>
          )}

          {/* Action Buttons */}
          {status !== "success" && (
            <View style={styles.actions}>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [
                  styles.cancelButton,
                  { borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)" },
                  pressed && styles.pressed,
                ]}
                disabled={status === "sending"}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                onPress={handleSend}
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: primaryColor },
                  pressed && styles.pressed,
                  status === "sending" && styles.sendingButton,
                ]}
                disabled={status === "sending"}
              >
                {status === "sending" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <ThemedText style={styles.sendButtonText}>Send Invite</ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  phoneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  pendingContent: {
    flex: 1,
  },
  pendingLabel: {
    fontSize: 12,
  },
  pendingAmount: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 2,
  },
  messageSection: {
    marginBottom: 16,
  },
  messageLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  messageInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 13,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  successText: {
    fontSize: 16,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  sendButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  sendingButton: {
    opacity: 0.8,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default InviteModal;
