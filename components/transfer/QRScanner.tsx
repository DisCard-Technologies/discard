/**
 * DisCard 2035 - QRScanner Component
 *
 * Camera-based QR code scanner for:
 * - Solana Pay URIs
 * - Raw Solana addresses
 * - DisCard payment links
 */

import { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Pressable, Dimensions, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";

// expo-camera is optional - may not be available in Expo Go
type CameraViewType = React.ComponentType<any>;
type BarcodeScanningResult = { data: string };
type PermissionStatus = { granted: boolean; canAskAgain: boolean };

let CameraView: CameraViewType | null = null;
let useCameraPermissions: (() => [PermissionStatus | null, () => Promise<PermissionStatus>]) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expoCamera = require("expo-camera");
  CameraView = expoCamera.CameraView;
  useCameraPermissions = expoCamera.useCameraPermissions;
} catch {
  console.warn("[QRScanner] expo-camera not available");
}

// ============================================================================
// Types
// ============================================================================

export interface QRScanResult {
  /** Type of scanned data */
  type: "solana_pay" | "address" | "discard_link" | "discard_merchant" | "unknown";
  /** Raw scanned data */
  raw: string;
  /** Parsed address if available */
  address?: string;
  /** Amount if specified in Solana Pay URI */
  amount?: number;
  /** Token mint if specified */
  tokenMint?: string;
  /** Memo if specified */
  memo?: string;
  /** Label/recipient name if specified */
  label?: string;
  /** Settlement token mint (what merchant accepts) */
  settlementMint?: string;
  /** Settlement token symbol (e.g., "USDC") */
  settlementSymbol?: string;
  /** Merchant name (for merchant QRs) */
  merchantName?: string;
  /** Merchant logo URL (optional) */
  merchantLogo?: string;
  /** Whether this is a merchant payment vs P2P */
  isMerchantPayment?: boolean;
}

export interface QRScannerProps {
  /** Callback when QR code is scanned */
  onScan: (result: QRScanResult) => void;
  /** Callback when close is pressed */
  onClose: () => void;
  /** Enable flash */
  flashEnabled?: boolean;
  /** Custom overlay color */
  overlayColor?: string;
}

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

// Solana address regex
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ============================================================================
// QR Parser
// ============================================================================

// Settlement token mints for identifying merchant payments
const SETTLEMENT_TOKEN_MINTS: Record<string, string> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr": "EURC",
  "FtgGSFADXBtroxq8VCausXRr2of47QBf5AS1NtZCu4GD": "BRZ",
  "E77cpQ4VncGmcAXX16LHFFzNBEBb2U7Ar7LBmZNfCgwL": "MXNE",
  "AhhdRu5YZdjVkKR3wbnUDaymVQL2ucjMQ63sZ3LFHsch": "VCHF",
  "C2oEjBbrwaaAg9zpcMvd4VKKhqBjFFzGKybxPFQN9sBN": "VGBP",
};

function parseQRData(data: string): QRScanResult {
  const trimmed = data.trim();

  // Check for DisCard merchant link: discard://merchant?...
  if (trimmed.startsWith("discard://merchant")) {
    try {
      const url = new URL(trimmed);
      const params = url.searchParams;
      const address = params.get("to") || undefined;
      const settlement = params.get("settlement") || "USDC";

      // Find settlement mint from symbol
      const settlementMint = Object.entries(SETTLEMENT_TOKEN_MINTS)
        .find(([_, symbol]) => symbol === settlement)?.[0];

      return {
        type: "discard_merchant",
        raw: data,
        address,
        amount: params.get("amount") ? parseFloat(params.get("amount")!) : undefined,
        memo: params.get("memo") || undefined,
        settlementMint,
        settlementSymbol: settlement,
        merchantName: params.get("name") ? decodeURIComponent(params.get("name")!) : undefined,
        merchantLogo: params.get("logo") ? decodeURIComponent(params.get("logo")!) : undefined,
        isMerchantPayment: true,
      };
    } catch {
      return { type: "unknown", raw: data };
    }
  }

  // Check for Solana Pay URI: solana:<address>?...
  if (trimmed.startsWith("solana:")) {
    try {
      const url = new URL(trimmed);
      const address = url.pathname;

      if (!SOLANA_ADDRESS_REGEX.test(address)) {
        return { type: "unknown", raw: data };
      }

      const params = url.searchParams;
      const tokenMint = params.get("spl-token") || undefined;
      const label = params.get("label") || undefined;
      const amount = params.get("amount") ? parseFloat(params.get("amount")!) : undefined;

      // Determine if this is a merchant payment (has amount + settlement token)
      const settlementSymbol = tokenMint ? SETTLEMENT_TOKEN_MINTS[tokenMint] : undefined;
      const isMerchantPayment = !!(amount && tokenMint && settlementSymbol);

      return {
        type: "solana_pay",
        raw: data,
        address,
        amount,
        tokenMint,
        memo: params.get("memo") || undefined,
        label,
        // Settlement info for merchant payments
        settlementMint: isMerchantPayment ? tokenMint : undefined,
        settlementSymbol: isMerchantPayment ? settlementSymbol : undefined,
        merchantName: isMerchantPayment ? label : undefined,
        isMerchantPayment,
      };
    } catch {
      return { type: "unknown", raw: data };
    }
  }

  // Check for DisCard deep link: discard://pay?...
  if (trimmed.startsWith("discard://pay")) {
    try {
      const url = new URL(trimmed);
      const params = url.searchParams;

      return {
        type: "discard_link",
        raw: data,
        address: params.get("to") || undefined,
        amount: params.get("amount") ? parseFloat(params.get("amount")!) : undefined,
        tokenMint: params.get("token") || undefined,
        memo: params.get("memo") || undefined,
        isMerchantPayment: false,
      };
    } catch {
      return { type: "unknown", raw: data };
    }
  }

  // Check for raw Solana address
  if (SOLANA_ADDRESS_REGEX.test(trimmed)) {
    return {
      type: "address",
      raw: data,
      address: trimmed,
      isMerchantPayment: false,
    };
  }

  return { type: "unknown", raw: data };
}

// ============================================================================
// Animated Scanner Frame
// ============================================================================

function ScannerFrame() {
  const primaryColor = useThemeColor({}, "tint");
  const scanLinePosition = useSharedValue(0);

  useEffect(() => {
    scanLinePosition.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1, // Infinite repeat
      false
    );
  }, []);

  const animatedLineStyle = useAnimatedStyle(() => ({
    top: scanLinePosition.value * (SCAN_AREA_SIZE - 4),
  }));

  return (
    <View style={styles.scanFrame}>
      {/* Corners */}
      <View style={[styles.corner, styles.cornerTopLeft, { borderColor: primaryColor }]} />
      <View style={[styles.corner, styles.cornerTopRight, { borderColor: primaryColor }]} />
      <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: primaryColor }]} />
      <View style={[styles.corner, styles.cornerBottomRight, { borderColor: primaryColor }]} />

      {/* Scanning line */}
      <Animated.View
        style={[
          styles.scanLine,
          { backgroundColor: primaryColor },
          animatedLineStyle,
        ]}
      />
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function QRScanner({
  onScan,
  onClose,
  flashEnabled = false,
}: QRScannerProps) {
  // Use camera permissions hook if available
  const cameraPermissions = useCameraPermissions ? useCameraPermissions() : null;
  const permission = cameraPermissions?.[0] ?? null;
  const requestPermission = cameraPermissions?.[1] ?? (() => Promise.resolve({ granted: false, canAskAgain: false }));

  const [torch, setTorch] = useState(flashEnabled);
  const [hasScanned, setHasScanned] = useState(false);

  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const primaryColor = useThemeColor({}, "tint");

  // Handle barcode scan
  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (hasScanned) return;

      const parsed = parseQRData(result.data);

      if (parsed.type === "unknown") {
        // Ignore unknown QR codes
        return;
      }

      setHasScanned(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onScan(parsed);
    },
    [hasScanned, onScan]
  );

  // Toggle flash
  const toggleFlash = useCallback(() => {
    setTorch((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Request permission on mount
  useEffect(() => {
    if (permission && !permission.granted && requestPermission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Camera not available (e.g., in Expo Go)
  if (!CameraView || !useCameraPermissions) {
    return (
      <View style={[styles.container, styles.centeredContainer, { backgroundColor: "#000" }]}>
        <Ionicons name="camera-outline" size={48} color={mutedColor} />
        <ThemedText style={styles.permissionText}>
          Camera not available
        </ThemedText>
        <ThemedText style={[styles.permissionSubtext, { color: mutedColor }]}>
          QR scanning requires a development build.{"\n"}
          You can still enter addresses manually.
        </ThemedText>
        <Pressable onPress={onClose} style={[styles.permissionButton, { backgroundColor: primaryColor }]}>
          <ThemedText style={{ color: "#000", fontWeight: "600" }}>Go Back</ThemedText>
        </Pressable>
      </View>
    );
  }

  // Show permission request
  if (!permission) {
    return (
      <View style={[styles.container, styles.centeredContainer, { backgroundColor: "#000" }]}>
        <ThemedText style={styles.permissionText}>
          Requesting camera permission...
        </ThemedText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centeredContainer, { backgroundColor: "#000" }]}>
        <Ionicons name="camera-outline" size={48} color={mutedColor} />
        <ThemedText style={styles.permissionText}>
          Camera permission is required to scan QR codes
        </ThemedText>
        <Pressable
          onPress={requestPermission}
          style={[styles.permissionButton, { backgroundColor: bgColor }]}
        >
          <ThemedText>Grant Permission</ThemedText>
        </Pressable>
        <Pressable onPress={onClose} style={styles.closeTextButton}>
          <ThemedText style={{ color: mutedColor }}>Cancel</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top */}
        <View style={styles.overlaySection} />

        {/* Middle row */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySection} />
          <ScannerFrame />
          <View style={styles.overlaySection} />
        </View>

        {/* Bottom */}
        <View style={styles.overlaySection} />
      </View>

      {/* Header */}
      <Animated.View entering={FadeIn.duration(200)} style={styles.header}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <ThemedText style={styles.headerTitle}>Scan QR Code</ThemedText>

        <Pressable
          onPress={toggleFlash}
          style={({ pressed }) => [
            styles.headerButton,
            torch && styles.flashActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={torch ? "flash" : "flash-outline"}
            size={24}
            color="#fff"
          />
        </Pressable>
      </Animated.View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <ThemedText style={styles.instructionsText}>
          Point at a Solana address or payment QR code
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
    flex: 1,
    backgroundColor: "#000",
  },
  centeredContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  overlaySection: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    width: "100%",
  },
  overlayMiddle: {
    flexDirection: "row",
    height: SCAN_AREA_SIZE,
  },
  scanFrame: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderWidth: 3,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position: "absolute",
    left: 4,
    right: 4,
    height: 2,
    borderRadius: 1,
    opacity: 0.8,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  flashActive: {
    backgroundColor: "rgba(255, 200, 0, 0.4)",
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  instructions: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  instructionsText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    opacity: 0.8,
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
    marginHorizontal: 24,
  },
  permissionSubtext: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginHorizontal: 32,
    lineHeight: 18,
  },
  permissionButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  closeTextButton: {
    marginTop: 16,
    padding: 12,
  },
});

export default QRScanner;
