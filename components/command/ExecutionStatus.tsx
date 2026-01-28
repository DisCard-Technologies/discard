/**
 * ExecutionStatus Component
 *
 * Displays real-time execution status and transaction results.
 * Shows progress, Solana transaction signature, and success/failure states.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { PressableScale, PressableOpacity } from "pressto";
import { Ionicons } from "@expo/vector-icons";

interface Intent {
  _id: string;
  rawText: string;
  status: string;
  solanaTransactionSignature?: string;
  error?: string;
  parsedIntent?: {
    action: string;
    amount?: number;
    currency?: string;
  };
}

interface ExecutionStatusProps {
  intent: Intent;
  onClose: () => void;
}

export function ExecutionStatus({ intent, onClose }: ExecutionStatusProps) {
  const isExecuting = intent.status === "executing";
  const isCompleted = intent.status === "completed";
  const isFailed = intent.status === "failed";

  /**
   * Open Solana transaction in explorer
   */
  const openExplorer = () => {
    if (intent.solanaTransactionSignature) {
      const url = `https://explorer.solana.com/tx/${intent.solanaTransactionSignature}`;
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      {/* Status Icon */}
      <View style={styles.statusContainer}>
        {isExecuting && (
          <>
            <View style={styles.executingIcon}>
              <ActivityIndicator size="large" color="#8B5CF6" />
            </View>
            <Text style={styles.statusTitle}>Processing Transaction</Text>
            <Text style={styles.statusSubtitle}>
              Signing and submitting to Solana...
            </Text>
          </>
        )}

        {isCompleted && (
          <>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.statusTitle}>Transaction Complete</Text>
            {intent.parsedIntent?.amount && (
              <Text style={styles.amountText}>
                {formatCurrency(
                  intent.parsedIntent.amount,
                  intent.parsedIntent.currency
                )}
              </Text>
            )}
          </>
        )}

        {isFailed && (
          <>
            <View style={styles.errorIcon}>
              <Ionicons name="close-circle" size={64} color="#EF4444" />
            </View>
            <Text style={styles.statusTitle}>Transaction Failed</Text>
            <Text style={styles.errorText}>{intent.error || "Unknown error"}</Text>
          </>
        )}
      </View>

      {/* Transaction Signature */}
      {intent.solanaTransactionSignature && (
        <PressableOpacity style={styles.signatureContainer} onPress={openExplorer}>
          <Ionicons name="link" size={16} color="#8B5CF6" />
          <Text style={styles.signatureLabel}>View on Solana Explorer</Text>
          <Text style={styles.signatureValue}>
            {truncateSignature(intent.solanaTransactionSignature)}
          </Text>
          <Ionicons name="open-outline" size={16} color="#6B7280" />
        </PressableOpacity>
      )}

      {/* Progress Steps (during execution) */}
      {isExecuting && (
        <View style={styles.stepsContainer}>
          <ProgressStep
            label="Building transaction"
            status="completed"
          />
          <ProgressStep
            label="Signing with passkey"
            status="current"
          />
          <ProgressStep
            label="Submitting to network"
            status="pending"
          />
          <ProgressStep
            label="Confirming"
            status="pending"
          />
        </View>
      )}

      {/* Close Button */}
      {(isCompleted || isFailed) && (
        <PressableScale style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Done</Text>
        </PressableScale>
      )}
    </View>
  );
}

/**
 * Progress Step Component
 */
function ProgressStep({
  label,
  status,
}: {
  label: string;
  status: "pending" | "current" | "completed";
}) {
  return (
    <View style={styles.stepContainer}>
      <View
        style={[
          styles.stepDot,
          status === "completed" && styles.stepDotCompleted,
          status === "current" && styles.stepDotCurrent,
        ]}
      >
        {status === "completed" && (
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
        )}
        {status === "current" && (
          <ActivityIndicator size="small" color="#FFFFFF" />
        )}
      </View>
      <Text
        style={[
          styles.stepLabel,
          status === "completed" && styles.stepLabelCompleted,
          status === "current" && styles.stepLabelCurrent,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Format helpers
 */
function formatCurrency(amount: number, currency?: string): string {
  if (currency?.toLowerCase() === "usd" || !currency) {
    return `$${(amount / 100).toFixed(2)}`;
  }
  return `${amount} ${currency.toUpperCase()}`;
}

function truncateSignature(signature: string): string {
  if (signature.length <= 16) return signature;
  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  executingIcon: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successIcon: {
    marginBottom: 16,
  },
  errorIcon: {
    marginBottom: 16,
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  statusSubtitle: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  amountText: {
    color: "#10B981",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  signatureContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  signatureLabel: {
    color: "#8B5CF6",
    fontSize: 14,
    fontWeight: "500",
  },
  signatureValue: {
    flex: 1,
    color: "#9CA3AF",
    fontSize: 12,
    fontFamily: "monospace",
    textAlign: "right",
  },
  stepsContainer: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  stepContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#4B5563",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepDotCompleted: {
    backgroundColor: "#10B981",
  },
  stepDotCurrent: {
    backgroundColor: "#8B5CF6",
  },
  stepLabel: {
    color: "#6B7280",
    fontSize: 14,
  },
  stepLabelCompleted: {
    color: "#9CA3AF",
  },
  stepLabelCurrent: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  closeButton: {
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default ExecutionStatus;
