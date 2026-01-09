/**
 * DisCard 2035 - MerchantPaymentSummary Component
 *
 * Displays cross-currency payment details:
 * - Exchange rate
 * - Fee breakdown (merchant absorbs)
 * - What merchant receives
 */

import { StyleSheet, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import type { MerchantPaymentQuote } from "@/convex/transfers/merchantPayment";

// ============================================================================
// Types
// ============================================================================

export interface MerchantPaymentSummaryProps {
  /** Payment quote from backend */
  quote: MerchantPaymentQuote | null;
  /** Whether quote is loading */
  loading?: boolean;
  /** Error message if quote failed */
  error?: string;
  /** Whether quote is refreshing */
  refreshing?: boolean;
  /** Time until quote expires (seconds) */
  expiresIn?: number;
}

// ============================================================================
// Helper Components
// ============================================================================

function SummaryRow({
  label,
  value,
  valueColor,
  bold,
  icon,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
  icon?: React.ReactNode;
}) {
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <ThemedText style={[styles.rowLabel, { color: mutedColor }]}>
          {label}
        </ThemedText>
      </View>
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

export function MerchantPaymentSummary({
  quote,
  loading = false,
  error,
  refreshing = false,
  expiresIn,
}: MerchantPaymentSummaryProps) {
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.08)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");
  const warningColor = useThemeColor({ light: "#FF9800", dark: "#FFA726" }, "text");

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={primaryColor} />
          <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
            Getting best rate...
          </ThemedText>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.container, styles.errorContainer, { borderColor: errorColor }]}
      >
        <Ionicons name="alert-circle" size={24} color={errorColor} />
        <ThemedText style={[styles.errorText, { color: errorColor }]}>
          {error}
        </ThemedText>
      </Animated.View>
    );
  }

  // No quote yet
  if (!quote) {
    return null;
  }

  // Format amounts
  const sourceAmountFormatted = (
    parseFloat(quote.sourceAmount) / Math.pow(10, quote.sourceDecimals)
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: quote.sourceDecimals,
  });

  const settlementAmountFormatted = (
    parseFloat(quote.settlementAmount) / Math.pow(10, quote.settlementDecimals)
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const platformFeeFormatted = (
    parseFloat(quote.platformFee) / Math.pow(10, quote.settlementDecimals)
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  const merchantReceivesFormatted = (
    parseFloat(quote.merchantReceives) / Math.pow(10, quote.settlementDecimals)
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const priceImpact = parseFloat(quote.priceImpact);
  const highPriceImpact = priceImpact > 1;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      style={[styles.container, { backgroundColor: cardBg, borderColor }]}
    >
      {/* Header with refresh indicator */}
      <View style={styles.header}>
        <ThemedText style={[styles.headerTitle, { color: mutedColor }]}>
          PAYMENT DETAILS
        </ThemedText>
        {refreshing && (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size="small" color={primaryColor} />
          </View>
        )}
        {expiresIn !== undefined && expiresIn > 0 && (
          <ThemedText style={[styles.expiresText, { color: mutedColor }]}>
            Updates in {expiresIn}s
          </ThemedText>
        )}
      </View>

      {/* No swap needed notice */}
      {!quote.swapRequired && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.noSwapNotice, { backgroundColor: `${successColor}15` }]}
        >
          <Ionicons name="checkmark-circle" size={18} color={successColor} />
          <ThemedText style={[styles.noSwapText, { color: successColor }]}>
            No currency conversion needed
          </ThemedText>
        </Animated.View>
      )}

      {/* Exchange Rate */}
      {quote.swapRequired && (
        <>
          <SummaryRow
            label="Exchange Rate"
            value={`1 ${quote.settlementSymbol} = ${quote.exchangeRate.toFixed(4)} ${quote.sourceSymbol}`}
            icon={<Ionicons name="swap-horizontal" size={14} color={mutedColor} style={styles.rowIcon} />}
          />

          {/* Price Impact */}
          {priceImpact > 0.01 && (
            <SummaryRow
              label="Price Impact"
              value={`${priceImpact.toFixed(2)}%`}
              valueColor={highPriceImpact ? warningColor : mutedColor}
              icon={
                <Ionicons
                  name={highPriceImpact ? "warning" : "analytics"}
                  size={14}
                  color={highPriceImpact ? warningColor : mutedColor}
                  style={styles.rowIcon}
                />
              }
            />
          )}

          <Divider />
        </>
      )}

      {/* Fee Breakdown */}
      <View style={styles.feeSection}>
        <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
          FEE BREAKDOWN
        </ThemedText>
        <SummaryRow
          label="Platform Fee (0.3%)"
          value={`-${platformFeeFormatted} ${quote.settlementSymbol}`}
        />
        {quote.swapRequired && (
          <SummaryRow
            label="Swap Fee"
            value="Included in rate"
          />
        )}
      </View>

      <Divider />

      {/* Merchant Receives */}
      <View style={styles.merchantSection}>
        <View style={styles.merchantHeader}>
          <Ionicons name="storefront" size={16} color={mutedColor} />
          <ThemedText style={[styles.merchantLabel, { color: mutedColor }]}>
            MERCHANT RECEIVES
          </ThemedText>
        </View>
        <View style={styles.merchantAmount}>
          <ThemedText style={[styles.merchantAmountValue, { color: primaryColor }]}>
            {merchantReceivesFormatted} {quote.settlementSymbol}
          </ThemedText>
        </View>
      </View>

      {/* Info Notice */}
      <View style={[styles.infoNotice, { backgroundColor: `${primaryColor}10` }]}>
        <Ionicons name="information-circle" size={16} color={primaryColor} />
        <ThemedText style={[styles.infoText, { color: mutedColor }]}>
          {quote.swapRequired
            ? `Your ${quote.sourceSymbol} will be instantly swapped to ${quote.settlementSymbol} via Jupiter.`
            : `Payment will be sent directly in ${quote.settlementSymbol}.`}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
  },
  errorText: {
    fontSize: 14,
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  refreshIndicator: {
    marginLeft: 8,
  },
  expiresText: {
    fontSize: 11,
  },
  noSwapNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  noSwapText: {
    fontSize: 13,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowIcon: {
    marginRight: 6,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
  },
  boldText: {
    fontWeight: "600",
  },
  divider: {
    height: 1,
    marginVertical: 10,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  feeSection: {
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "600",
    marginBottom: 6,
  },
  merchantSection: {
    marginTop: 4,
  },
  merchantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  merchantLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "600",
  },
  merchantAmount: {
    alignItems: "flex-start",
  },
  merchantAmountValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  infoNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  infoText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
});

export default MerchantPaymentSummary;
