/**
 * DisCard 2035 - Transfer Success Modal
 *
 * Success screen showing completed transfer with:
 * - Animated checkmark
 * - Transaction details
 * - Solscan link
 */

import { useCallback } from "react";
import { StyleSheet, SafeAreaView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { SuccessScreen } from "@/components/transfer";
import type { TransferResult, TransferRecipient } from "@/hooks/useTransfer";

// ============================================================================
// Component
// ============================================================================

export default function TransferSuccessScreen() {
  const params = useLocalSearchParams<{
    result: string;
    recipient: string;
    amountDisplay: string;
    amountUsd: string;
    tokenSymbol: string;
    feesPaid: string;
  }>();

  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");

  // Parse params
  let result: TransferResult | null = null;
  let recipient: TransferRecipient | null = null;

  try {
    if (params.result) result = JSON.parse(params.result);
    if (params.recipient) recipient = JSON.parse(params.recipient);
  } catch (e) {
    console.error("[Success] Failed to parse params:", e);
  }

  const amountDisplay = params.amountDisplay || "0";
  const amountUsd = parseFloat(params.amountUsd || "0");
  const tokenSymbol = params.tokenSymbol || "";
  const feesPaid = parseFloat(params.feesPaid || "0");

  // Handle done - dismiss all transfer modals
  const handleDone = useCallback(() => {
    router.dismissAll();
  }, []);

  // Fallback if data missing
  if (!result || !recipient) {
    // Create mock data for display
    const mockResult: TransferResult = {
      signature: params.result || "unknown",
      confirmationTimeMs: 150,
      withinTarget: true,
      transferId: "" as any,
      explorerUrl: `https://solscan.io/tx/${params.result || "unknown"}`,
    };

    const mockRecipient: TransferRecipient = {
      input: "",
      address: "",
      type: "address",
    };

    return (
      <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
        <SafeAreaView style={styles.safeArea}>
          <SuccessScreen
            result={mockResult}
            recipient={mockRecipient}
            amountDisplay={amountDisplay}
            amountUsd={amountUsd}
            tokenSymbol={tokenSymbol}
            feesPaid={feesPaid}
            onDone={handleDone}
          />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <SafeAreaView style={styles.safeArea}>
        <SuccessScreen
          result={result}
          recipient={recipient}
          amountDisplay={amountDisplay}
          amountUsd={amountUsd}
          tokenSymbol={tokenSymbol}
          feesPaid={feesPaid}
          onDone={handleDone}
          autoDismissMs={0} // Don't auto dismiss from success screen
        />
      </SafeAreaView>
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
  safeArea: {
    flex: 1,
  },
});
