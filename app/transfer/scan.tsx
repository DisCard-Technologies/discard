/**
 * DisCard 2035 - QR Scan Screen
 *
 * Full-screen QR scanner modal for scanning:
 * - Solana addresses
 * - Solana Pay URIs
 * - DisCard payment links
 */

import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { QRScanner, type QRScanResult } from "@/components/transfer/QRScanner";

// ============================================================================
// Component
// ============================================================================

export default function TransferScanScreen() {
  // Handle scan result
  const handleScan = useCallback((result: QRScanResult) => {
    // Navigate back with the scanned data
    router.back();

    // Pass scanned data to parent via params
    // The parent screen will handle the result
    router.setParams({
      scannedAddress: result.address || "",
      scannedAmount: result.amount?.toString() || "",
      scannedToken: result.tokenMint || "",
      scannedMemo: result.memo || "",
      scannedLabel: result.label || "",
      scannedType: result.type,
    });
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    router.back();
  }, []);

  return (
    <View style={styles.container}>
      <QRScanner onScan={handleScan} onClose={handleClose} />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});
