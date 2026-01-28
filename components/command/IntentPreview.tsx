/**
 * IntentPreview Component
 *
 * Displays parsed intent details and allows user approval/clarification.
 * Shows source, target, amount, and any clarification questions.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";

interface ParsedIntent {
  action: string;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  amount?: number;
  currency?: string;
  // These may come from AI response but aren't stored in Convex
  needsClarification?: boolean;
  clarificationQuestion?: string;
  confidence?: number;
}

interface Intent {
  _id: string;
  rawText: string;
  parsedIntent?: ParsedIntent;
  status: string;
  // Convex stores clarification question at top level
  clarificationQuestion?: string;
}

interface IntentPreviewProps {
  intent: Intent;
  isProcessing: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onClarify: (clarification: string) => void;
}

export function IntentPreview({
  intent,
  isProcessing,
  onApprove,
  onCancel,
  onClarify,
}: IntentPreviewProps) {
  const parsed = intent.parsedIntent;

  // Needs clarification - show as chat message (no separate input - user replies via command bar)
  if (intent.status === "clarifying") {
    const questionText = intent.clarificationQuestion || parsed?.clarificationQuestion || "Please provide more details";
    return (
      <View style={styles.container}>
        <View style={styles.chatMessage}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={16} color="#8B5CF6" />
          </View>
          <View style={styles.messageBubble}>
            <Text style={styles.messageText}>{questionText}</Text>
          </View>
        </View>
        <Text style={styles.replyHint}>Reply below to continue...</Text>
      </View>
    );
  }

  // Still parsing or no parsed intent yet - show loading
  if (intent.status === "parsing" || intent.status === "pending" || !parsed) {
    return (
      <View style={styles.container}>
        <View style={styles.parsingContainer}>
          <ActivityIndicator size="small" color="#8B5CF6" />
          <Text style={styles.parsingText}>Processing your request...</Text>
        </View>
      </View>
    );
  }

  // Ready for approval
  return (
    <View style={styles.container}>
      {/* Action Summary */}
      <View style={styles.summaryContainer}>
        <ActionIcon action={parsed.action} />
        <View style={styles.summaryText}>
          <Text style={styles.actionLabel}>{formatAction(parsed.action)}</Text>
          {parsed.amount && (
            <Text style={styles.amountText}>
              {formatCurrency(parsed.amount, parsed.currency)}
            </Text>
          )}
        </View>
        <ConfidenceBadge confidence={parsed.confidence ?? 0.9} />
      </View>

      {/* Flow Details */}
      <View style={styles.flowContainer}>
        {parsed.sourceType && (
          <View style={styles.flowItem}>
            <Text style={styles.flowLabel}>From</Text>
            <Text style={styles.flowValue}>
              {formatSource(parsed.sourceType, parsed.sourceId)}
            </Text>
          </View>
        )}

        {parsed.sourceType && parsed.targetType && (
          <Ionicons name="arrow-forward" size={20} color="#6B7280" />
        )}

        {parsed.targetType && (
          <View style={styles.flowItem}>
            <Text style={styles.flowLabel}>To</Text>
            <Text style={styles.flowValue}>
              {formatTarget(parsed.targetType, parsed.targetId)}
            </Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <PressableScale style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </PressableScale>

        <PressableScale
          style={[
            styles.approveButton,
            isProcessing && styles.approveButtonDisabled,
          ]}
          onPress={onApprove}
          enabled={!isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.approveButtonText}>Approve</Text>
            </>
          )}
        </PressableScale>
      </View>
    </View>
  );
}

/**
 * Action Icon Component
 */
function ActionIcon({ action }: { action: string }) {
  const iconMap: Record<string, string> = {
    fund_card: "card",
    transfer: "swap-horizontal",
    swap: "repeat",
    withdraw_defi: "trending-down",
    create_card: "add-circle",
    pay_bill: "receipt",
  };

  const colorMap: Record<string, string> = {
    fund_card: "#10B981",
    transfer: "#3B82F6",
    swap: "#8B5CF6",
    withdraw_defi: "#F59E0B",
    create_card: "#EC4899",
    pay_bill: "#6366F1",
  };

  return (
    <View
      style={[
        styles.actionIcon,
        { backgroundColor: colorMap[action] || "#6B7280" },
      ]}
    >
      <Ionicons
        name={(iconMap[action] || "help") as any}
        size={24}
        color="#FFFFFF"
      />
    </View>
  );
}

/**
 * Confidence Badge Component
 */
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.9
      ? "#10B981"
      : confidence >= 0.7
        ? "#F59E0B"
        : "#EF4444";

  return (
    <View style={[styles.confidenceBadge, { borderColor: color }]}>
      <Text style={[styles.confidenceText, { color }]}>
        {Math.round(confidence * 100)}%
      </Text>
    </View>
  );
}

/**
 * Format helpers
 */
function formatAction(action: string): string {
  const labels: Record<string, string> = {
    fund_card: "Fund Card",
    transfer: "Transfer",
    swap: "Swap",
    withdraw_defi: "Withdraw from DeFi",
    create_card: "Create Card",
    pay_bill: "Pay Bill",
    unknown: "Unknown Action",
  };
  return labels[action] || action;
}

function formatCurrency(amount: number, currency?: string): string {
  if (currency?.toLowerCase() === "usd" || !currency) {
    return `$${(amount / 100).toFixed(2)}`;
  }
  return `${amount} ${currency.toUpperCase()}`;
}

function formatSource(type: string, id?: string): string {
  if (!id) return type;
  // In production, resolve actual names
  return `${type} (...${id.slice(-4)})`;
}

function formatTarget(type: string, id?: string): string {
  if (!id) return type;
  return `${type} (...${id.slice(-4)})`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  parsingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  parsingText: {
    color: "#9CA3AF",
    fontSize: 14,
    marginLeft: 8,
  },
  rawText: {
    color: "#6B7280",
    fontSize: 14,
    fontStyle: "italic",
  },
  summaryContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryText: {
    flex: 1,
    marginLeft: 12,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  amountText: {
    color: "#10B981",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 2,
  },
  confidenceBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  flowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  flowItem: {
    alignItems: "center",
  },
  flowLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 4,
  },
  flowValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "600",
  },
  approveButton: {
    flex: 2,
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  approveButtonDisabled: {
    backgroundColor: "#4B5563",
  },
  approveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  chatMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(139, 92, 246, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  messageBubble: {
    flex: 1,
    backgroundColor: "#374151",
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 22,
  },
  replyHint: {
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
});

export default IntentPreview;
