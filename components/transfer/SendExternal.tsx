/**
 * SendExternal — External address send with inline compliance indicator
 *
 * UI flow:
 * 1. User enters/pastes external Solana address
 * 2. Inline compliance check runs (debounced)
 * 3. Green checkmark = passed, red X = blocked
 * 4. User enters amount and confirms
 * 5. Outbound relay initiated (unshield → pool → recipient)
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { StyleSheet, View, TextInput, ActivityIndicator } from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useCurrentCredentialId } from "@/stores/authConvex";

// ============================================================================
// Types
// ============================================================================

interface ComplianceStatus {
  checking: boolean;
  passed: boolean | null;
  reason: string | null;
  valid: boolean;
}

interface SendExternalProps {
  onSend: (params: {
    recipientAddress: string;
    amount: number;
    tokenMint: string;
    tokenDecimals: number;
    tokenSymbol: string;
    amountDisplay: number;
  }) => void;
  tokenMint?: string;
  tokenDecimals?: number;
  tokenSymbol?: string;
  maxAmount?: number;
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function SendExternal({
  onSend,
  tokenMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  tokenDecimals = 6,
  tokenSymbol = "USDC",
  maxAmount,
  disabled = false,
}: SendExternalProps) {
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "card");
  const errorColor = "#E53E3E";
  const successColor = "#38A169";

  const credentialId = useCurrentCredentialId();

  // State
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [compliance, setCompliance] = useState<ComplianceStatus>({
    checking: false,
    passed: null,
    reason: null,
    valid: false,
  });
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Actions
  const checkCompliance = useAction(api.external.outboundRelay.checkRecipientCompliance);
  const initiateSend = useAction(api.external.outboundRelay.initiateExternalSend);

  // Debounced compliance check
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset compliance when address changes
    setCompliance({ checking: false, passed: null, reason: null, valid: false });
    setSendError(null);

    if (!recipientAddress || recipientAddress.length < 32) return;

    // Debounce: wait 500ms after user stops typing
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setCompliance((prev) => ({ ...prev, checking: true }));

      try {
        const result = await checkCompliance({ recipientAddress });
        setCompliance({
          checking: false,
          passed: result.passed,
          reason: result.reason || null,
          valid: result.valid,
        });
      } catch (err) {
        setCompliance({
          checking: false,
          passed: false,
          reason: "Compliance check failed",
          valid: false,
        });
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [recipientAddress, checkCompliance]);

  // Send handler
  const handleSend = useCallback(async () => {
    if (!recipientAddress || !amount || !compliance.passed || isSending || disabled) return;

    const amountDisplay = parseFloat(amount);
    if (isNaN(amountDisplay) || amountDisplay <= 0) {
      setSendError("Enter a valid amount");
      return;
    }

    if (maxAmount && amountDisplay > maxAmount) {
      setSendError(`Maximum amount is ${maxAmount} ${tokenSymbol}`);
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      const amountBaseUnits = Math.round(amountDisplay * Math.pow(10, tokenDecimals));

      const result = await initiateSend({
        recipientAddress,
        amount: amountBaseUnits,
        tokenMint,
        tokenDecimals,
        tokenSymbol,
        amountDisplay,
        credentialId: credentialId || undefined,
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSend({
          recipientAddress,
          amount: amountBaseUnits,
          tokenMint,
          tokenDecimals,
          tokenSymbol,
          amountDisplay,
        });
      } else {
        setSendError(result.reason || "Send failed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSending(false);
    }
  }, [
    recipientAddress,
    amount,
    compliance.passed,
    isSending,
    disabled,
    maxAmount,
    tokenSymbol,
    tokenDecimals,
    tokenMint,
    initiateSend,
    credentialId,
    onSend,
  ]);

  // Compliance indicator
  const renderComplianceIndicator = () => {
    if (!recipientAddress || recipientAddress.length < 32) return null;

    if (compliance.checking) {
      return <ActivityIndicator size="small" color={primaryColor} />;
    }

    if (compliance.passed === true) {
      return <Ionicons name="checkmark-circle" size={20} color={successColor} />;
    }

    if (compliance.passed === false) {
      return <Ionicons name="close-circle" size={20} color={errorColor} />;
    }

    return null;
  };

  const canSend = compliance.passed === true && amount && parseFloat(amount) > 0 && !isSending && !disabled;

  return (
    <View style={styles.container}>
      {/* Recipient Address Input */}
      <View style={styles.inputGroup}>
        <ThemedText style={[styles.label, { color: mutedColor }]}>
          Recipient Address
        </ThemedText>
        <View style={[styles.inputRow, { backgroundColor: cardColor }]}>
          <TextInput
            style={[styles.addressInput, { color: textColor }]}
            placeholder="Enter Solana address"
            placeholderTextColor={mutedColor}
            value={recipientAddress}
            onChangeText={setRecipientAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {renderComplianceIndicator()}
        </View>
        {compliance.passed === false && compliance.reason && (
          <ThemedText style={[styles.errorText, { color: errorColor }]}>
            {compliance.reason}
          </ThemedText>
        )}
      </View>

      {/* Amount Input */}
      <View style={styles.inputGroup}>
        <ThemedText style={[styles.label, { color: mutedColor }]}>
          Amount ({tokenSymbol})
        </ThemedText>
        <View style={[styles.inputRow, { backgroundColor: cardColor }]}>
          <TextInput
            style={[styles.amountInput, { color: textColor }]}
            placeholder="0.00"
            placeholderTextColor={mutedColor}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <ThemedText style={[styles.tokenLabel, { color: mutedColor }]}>
            {tokenSymbol}
          </ThemedText>
        </View>
      </View>

      {/* Error */}
      {sendError && (
        <ThemedText style={[styles.errorText, { color: errorColor }]}>
          {sendError}
        </ThemedText>
      )}

      {/* Send Button */}
      <PressableScale
        onPress={canSend ? handleSend : undefined}
        style={[
          styles.sendButton,
          {
            backgroundColor: canSend ? primaryColor : `${primaryColor}40`,
            opacity: canSend ? 1 : 0.6,
          },
        ]}
      >
        {isSending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <ThemedText style={styles.sendButtonText}>
            Send {tokenSymbol}
          </ThemedText>
        )}
      </PressableScale>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  addressInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "monospace",
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
  },
  tokenLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  sendButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default SendExternal;
