/**
 * DisCard 2035 - TransferSummary Component
 *
 * Displays transfer details before confirmation:
 * - Recipient info
 * - Amount breakdown
 * - Fee breakdown
 * - Total cost
 */

import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { formatAddress } from "@/lib/transfer/address-resolver";
import type {
  TransferRecipient,
  TransferToken,
  TransferAmount,
  TransferFees,
} from "@/hooks/useTransfer";

// ============================================================================
// Types
// ============================================================================

export interface TransferSummaryProps {
  /** Recipient information */
  recipient: TransferRecipient;
  /** Token being sent */
  token: TransferToken;
  /** Amount details */
  amount: TransferAmount;
  /** Fee breakdown */
  fees: TransferFees;
  /** Whether ATA will be created */
  createsAta?: boolean;
  /** Optional memo */
  memo?: string;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

function SummaryRow({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");

  return (
    <View style={styles.row}>
      <ThemedText style={[styles.rowLabel, { color: mutedColor }]}>
        {label}
      </ThemedText>
      <ThemedText
        style={[
          styles.rowValue,
          { color: valueColor || textColor },
          bold && styles.boldText,
        ]}
      >
        {value}
      </ThemedText>
    </View>
  );
}

function Divider() {
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.08)" },
    "background"
  );

  return <View style={[styles.divider, { backgroundColor: borderColor }]} />;
}

// ============================================================================
// Main Component
// ============================================================================

export function TransferSummary({
  recipient,
  token,
  amount,
  fees,
  createsAta,
  memo,
  compact = false,
}: TransferSummaryProps) {
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");

  // Format amounts
  const amountDisplay = `${amount.amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: token.decimals,
  })} ${token.symbol}`;

  const amountUsdDisplay = `$${amount.amountUsd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const totalUsdDisplay = `$${fees.totalCostUsd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Recipient display
  const recipientDisplay =
    recipient.displayName || formatAddress(recipient.address, 6);
  const recipientSubtext =
    recipient.displayName && recipient.type !== "address"
      ? formatAddress(recipient.address, 6)
      : null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        styles.container,
        { backgroundColor: cardBg, borderColor },
        compact && styles.containerCompact,
      ]}
    >
      {/* Recipient Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={18} color={mutedColor} />
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            TO
          </ThemedText>
        </View>

        <View style={styles.recipientRow}>
          <View style={styles.recipientInfo}>
            <ThemedText style={styles.recipientName} numberOfLines={1}>
              {recipientDisplay}
            </ThemedText>
            {recipientSubtext && (
              <ThemedText
                style={[styles.recipientAddress, { color: mutedColor }]}
              >
                {recipientSubtext}
              </ThemedText>
            )}
          </View>
          {recipient.type === "sol_name" && (
            <View style={[styles.typeBadge, { backgroundColor: `${successColor}20` }]}>
              <ThemedText style={[styles.typeBadgeText, { color: successColor }]}>
                .sol
              </ThemedText>
            </View>
          )}
          {recipient.type === "contact" && (
            <Ionicons name="person-circle" size={20} color={primaryColor} />
          )}
        </View>
      </View>

      <Divider />

      {/* Amount Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="wallet-outline" size={18} color={mutedColor} />
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            AMOUNT
          </ThemedText>
        </View>

        <View style={styles.amountDisplay}>
          <ThemedText style={styles.amountPrimary}>{amountDisplay}</ThemedText>
          <ThemedText style={[styles.amountSecondary, { color: mutedColor }]}>
            ≈ {amountUsdDisplay}
          </ThemedText>
        </View>
      </View>

      {memo && (
        <>
          <Divider />
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="chatbubble-outline" size={16} color={mutedColor} />
              <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
                MEMO
              </ThemedText>
            </View>
            <ThemedText style={[styles.memoText, { color: mutedColor }]}>
              {memo}
            </ThemedText>
          </View>
        </>
      )}

      <Divider />

      {/* Fee Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="receipt-outline" size={18} color={mutedColor} />
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            FEES
          </ThemedText>
        </View>

        <View style={styles.feeRows}>
          <SummaryRow
            label="Network fee"
            value={`$${fees.networkFeeUsd.toFixed(4)}`}
          />
          <SummaryRow
            label="Platform fee (0.3%)"
            value={`$${fees.platformFee.toFixed(2)}`}
          />
          {fees.ataRent > 0 && (
            <SummaryRow
              label="Account creation"
              value={`$${(fees.ataRent * 150).toFixed(4)}`}
            />
          )}
          {createsAta && (
            <View style={styles.ataNotice}>
              <Ionicons name="information-circle" size={14} color={primaryColor} />
              <ThemedText style={[styles.ataNoticeText, { color: mutedColor }]}>
                Creating token account for recipient
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      <Divider />

      {/* Total Section */}
      <View style={[styles.section, styles.totalSection]}>
        <SummaryRow
          label="Total"
          value={totalUsdDisplay}
          valueColor={primaryColor}
          bold
        />
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Compact Summary (for inline display)
// ============================================================================

export function CompactTransferSummary({
  recipient,
  amount,
  token,
  fees,
}: Pick<TransferSummaryProps, "recipient" | "amount" | "token" | "fees">) {
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.05)" },
    "background"
  );

  const recipientDisplay =
    recipient.displayName || formatAddress(recipient.address, 4);

  return (
    <View style={[styles.compactContainer, { backgroundColor: cardBg }]}>
      <View style={styles.compactRow}>
        <ThemedText style={[styles.compactLabel, { color: mutedColor }]}>
          Sending
        </ThemedText>
        <ThemedText style={styles.compactValue}>
          {amount.amount.toFixed(2)} {token.symbol}
        </ThemedText>
      </View>
      <View style={styles.compactRow}>
        <ThemedText style={[styles.compactLabel, { color: mutedColor }]}>
          To
        </ThemedText>
        <ThemedText style={styles.compactValue} numberOfLines={1}>
          {recipientDisplay}
        </ThemedText>
      </View>
      <View style={styles.compactRow}>
        <ThemedText style={[styles.compactLabel, { color: mutedColor }]}>
          Total
        </ThemedText>
        <ThemedText style={[styles.compactValue, styles.boldText]}>
          ${fees.totalCostUsd.toFixed(2)}
        </ThemedText>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  containerCompact: {
    padding: 12,
  },
  section: {
    paddingVertical: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    marginHorizontal: -16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 14,
  },
  rowValue: {
    fontSize: 14,
  },
  boldText: {
    fontWeight: "600",
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recipientInfo: {
    flex: 1,
  },
  recipientName: {
    fontSize: 18,
    fontWeight: "600",
  },
  recipientAddress: {
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  amountDisplay: {
    alignItems: "flex-start",
  },
  amountPrimary: {
    fontSize: 28,
    fontWeight: "700",
  },
  amountSecondary: {
    fontSize: 16,
    marginTop: 2,
  },
  memoText: {
    fontSize: 14,
    fontStyle: "italic",
  },
  feeRows: {
    gap: 4,
  },
  ataNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,122,255,0.1)",
    borderRadius: 8,
  },
  ataNoticeText: {
    fontSize: 12,
  },
  totalSection: {
    paddingBottom: 4,
  },
  // Compact styles
  compactContainer: {
    borderRadius: 12,
    padding: 12,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  compactLabel: {
    fontSize: 13,
  },
  compactValue: {
    fontSize: 13,
    maxWidth: "60%",
  },
});

export default TransferSummary;
