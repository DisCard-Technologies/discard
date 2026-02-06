/**
 * Claimable Transfers — Inline component for incoming private transfers
 *
 * Shows pending inbound private transfers that need to be claimed.
 * Each card: amount, token icon, time ago, "Claim" button.
 * Claim action: sweep stealth → main wallet, mark note claimed.
 */

import { useState, useCallback } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useThemeColor } from "@/hooks/use-theme-color";
import { useStealthScanner, type ClaimableTransfer } from "@/hooks/useStealthScanner";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// Helpers
// ============================================================================

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// Claim Card Component
// ============================================================================

interface ClaimCardProps {
  transfer: ClaimableTransfer;
  onClaim: (noteId: Id<"privateTransferNotes">) => Promise<void>;
  isClaiming: boolean;
}

function ClaimCard({ transfer, onClaim, isClaiming }: ClaimCardProps) {
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const primaryColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.06)" },
    "background"
  );

  // Format amount based on token decimals
  const formattedAmount = transfer.amount > 0
    ? transfer.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "—";

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[styles.card, { backgroundColor: cardBg }]}
    >
      <View style={styles.cardLeft}>
        <View style={[styles.iconCircle, { borderColor: primaryColor }]}>
          <Ionicons name="arrow-down" size={18} color={primaryColor} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.amountText, { color: textColor }]}>
            {formattedAmount} {transfer.tokenSymbol}
          </Text>
          <Text style={[styles.timeText, { color: mutedColor }]}>
            {timeAgo(transfer.createdAt)}
          </Text>
        </View>
      </View>
      <PressableScale
        onPress={() => onClaim(transfer.noteId)}
        enabled={!isClaiming}
        style={[
          styles.claimButton,
          { backgroundColor: primaryColor },
          isClaiming && styles.claimButtonDisabled,
        ]}
      >
        {isClaiming ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.claimButtonText}>Claim</Text>
        )}
      </PressableScale>
    </Animated.View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ClaimableTransfers() {
  const { claimableTransfers, claimableCount, isLoading, claimTransfer } = useStealthScanner();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");

  const handleClaim = useCallback(
    async (noteId: Id<"privateTransferNotes">) => {
      setClaimingId(noteId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        const result = await claimTransfer(noteId);
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          console.error("[ClaimableTransfers] Claim failed:", result.error);
        }
      } catch (err) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        console.error("[ClaimableTransfers] Claim error:", err);
      } finally {
        setClaimingId(null);
      }
    },
    [claimTransfer]
  );

  // Don't render if nothing to show
  if (isLoading || claimableCount === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="arrow-down-circle-outline" size={18} color={mutedColor} />
        <Text style={[styles.headerText, { color: textColor }]}>
          Incoming Transfers
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{claimableCount}</Text>
        </View>
      </View>
      {claimableTransfers.map((transfer) => (
        <ClaimCard
          key={transfer.noteId}
          transfer={transfer}
          onClaim={handleClaim}
          isClaiming={claimingId === transfer.noteId}
        />
      ))}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  headerText: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  badge: {
    backgroundColor: "#10b981",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
  },
  amountText: {
    fontSize: 16,
    fontWeight: "600",
  },
  timeText: {
    fontSize: 13,
    marginTop: 2,
  },
  claimButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
    alignItems: "center",
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default ClaimableTransfers;
