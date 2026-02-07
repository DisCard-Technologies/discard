/**
 * DisCard 2035 - Transfer Confirmation Modal
 *
 * Pre-send confirmation screen showing:
 * - Transfer summary
 * - Fee breakdown
 * - Biometric confirm button
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  Image,
} from "react-native";
import { PressableScale } from "pressto";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useContacts } from "@/hooks/useContacts";
// TransferSummary removed - using simplified inline display
import { useAuth, useCurrentCredentialId, getLocalSolanaKeypair } from "@/stores/authConvex";
import { usePrivateTransfer } from "@/hooks/usePrivateTransfer";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
// Connection/PublicKey no longer needed — private path handles on-chain interaction
import { useTurnkey } from "@/hooks/useTurnkey";
// Firedancer and transaction builder imports removed — all transfers go through ShadowWire privacy path
import { sha256 as sha256Hash } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import type {
  TransferRecipient,
  TransferToken,
  TransferAmount,
  TransferFees,
  TransferResult,
} from "@/hooks/useTransfer";

// ============================================================================
// Constants
// ============================================================================

// Use Helius RPC URL for consistency with the rest of the app
// Prefer Helius devnet, then generic Solana RPC, finally devnet fallback
const SOLANA_RPC_URL =
  process.env.EXPO_PUBLIC_HELIUS_RPC_URL ||
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

const TURNKEY_RP_ID = process.env.EXPO_PUBLIC_TURNKEY_RP_ID || "www.discard.tech";
const TURNKEY_ORG_ID = process.env.EXPO_PUBLIC_TURNKEY_ORG_ID || "";

type ExecutionPhase = "idle" | "building" | "signing" | "shielding" | "submitting" | "confirming";

// ============================================================================
// Component
// ============================================================================

export default function TransferConfirmationScreen() {
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    recipient: string;
    token: string;
    amount: string;
    fees: string;
    createsAta?: string;
    memo?: string;
  }>();

  const [isConfirming, setIsConfirming] = useState(false);
  const [executionPhase, setExecutionPhase] = useState<ExecutionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [complianceChecked, setComplianceChecked] = useState(false);
  const complianceCheckingRef = useRef(false);

  // Privacy transfer hook - always enabled
  const {
    state: privacyState,
    isLoading: isCheckingPrivacy,
    checkTransferCompliance,
    executePrivateTransfer,
    generateStealthAddress,
    isPrivateTransferAvailable,
    // ZK-compressed methods (Light Protocol)
    generateZkCompressedStealthAddress,
    executeZkPrivateTransfer,
    isZkCompressionAvailable,
    // Relay pool for sender privacy
    isRelayAvailable,
    relayPoolAddress,
    shadowWireStatus,
  } = usePrivateTransfer();

  // Auth and Turnkey
  const { user, userId } = useAuth();
  const credentialId = useCurrentCredentialId();

  // Check if recipient is a known contact
  const { getContactByAddress } = useContacts();
  const turnkey = useTurnkey(userId, {
    organizationId: TURNKEY_ORG_ID,
    rpId: TURNKEY_RP_ID,
  });

  // Use user's Solana address from auth (biometric flow) OR Turnkey (TEE flow)
  const walletAddress = user?.solanaAddress || turnkey.walletAddress;

  // ShadowWire relay action for sender privacy (User → Pool → Stealth)
  const relayToStealth = useAction(api.shadowwire.relay.relayToStealth);

  // Convex mutations for transfer records
  const createTransfer = useMutation(api.transfers.transfers.create);
  const updateTransferStatus = useMutation(api.transfers.transfers.updateStatus);
  const publishNote = useMutation(api.shadowwire.privateTransferNotes.publishNote);

  // Theme colors
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");
  // In dark mode, tint is white so button needs dark text; in light mode, tint is teal so white text
  const confirmButtonTextColor = isDark ? "#000" : "#fff";

  // Parse params - memoize to prevent new object refs on each render
  const recipient = useMemo<TransferRecipient | null>(() => {
    try {
      return params.recipient ? JSON.parse(params.recipient) : null;
    } catch { return null; }
  }, [params.recipient]);

  const token = useMemo<TransferToken | null>(() => {
    try {
      return params.token ? JSON.parse(params.token) : null;
    } catch { return null; }
  }, [params.token]);

  const amount = useMemo<TransferAmount | null>(() => {
    try {
      return params.amount ? JSON.parse(params.amount) : null;
    } catch { return null; }
  }, [params.amount]);

  const fees = useMemo<TransferFees | null>(() => {
    try {
      return params.fees ? JSON.parse(params.fees) : null;
    } catch { return null; }
  }, [params.fees]);

  const createsAta = params.createsAta === "true";
  const memo = params.memo;

  // Auto-run compliance check on mount (once only)
  useEffect(() => {
    if (complianceChecked || complianceCheckingRef.current) return;
    if (!recipient || !walletAddress || !amount) return;

    complianceCheckingRef.current = true;
    checkTransferCompliance(
      walletAddress,
      recipient.address,
      amount.amountUsd || 0
    ).finally(() => {
      setComplianceChecked(true);
      complianceCheckingRef.current = false;
    });
  }, [complianceChecked, recipient, walletAddress, amount, checkTransferCompliance]);

  // Handle edit (go back)
  const handleEdit = useCallback(() => {
    router.back();
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    router.dismissAll();
  }, []);

  // Handle confirm - executes the actual transfer
  const handleConfirm = useCallback(async () => {
    if (!recipient || !token || !amount || !fees || !userId || !walletAddress) {
      setError("Missing required data. Please go back and try again.");
      return;
    }

    setIsConfirming(true);
    setError(null);
    setExecutionPhase("idle");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const startTime = Date.now();
    let transferId: any = null;

    try {
      // Step 1: Biometric authentication
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const biometricResult = await LocalAuthentication.authenticateAsync({
          promptMessage: `Send ${amount.amount} ${token.symbol} to ${recipient.displayName || "recipient"}`,
          disableDeviceFallback: false,
          cancelLabel: "Cancel",
        });

        if (!biometricResult.success) {
          const errorMsg = 'error' in biometricResult ? biometricResult.error : "unknown";
          if (errorMsg === "user_cancel") {
            setError("Authentication cancelled");
          } else {
            setError("Biometric authentication failed. Please try again.");
          }
          setIsConfirming(false);
          setExecutionPhase("idle");
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Step 2: Privacy-first transfer via ShadowWire
      // Check compliance status - block if not compliant
      if (privacyState.privacyCheck && !privacyState.privacyCheck.compliant) {
        setError(privacyState.privacyCheck.error || "Transfer blocked by compliance check");
        setIsConfirming(false);
        setExecutionPhase("idle");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      // Use ShadowWire private transfer when available
      if (isPrivateTransferAvailable) {
        console.log("[Confirmation] Executing shielded transfer via ShadowWire", {
          zkCompression: isZkCompressionAvailable,
          relayAvailable: isRelayAvailable,
          relayPool: relayPoolAddress?.slice(0, 8),
          features: shadowWireStatus?.features,
        });
        setExecutionPhase("shielding");

        // Get local keypair for signing real transactions
        const localKeypair = await getLocalSolanaKeypair();
        if (!localKeypair) {
          console.warn("[Confirmation] No local keypair, falling back to regular transfer");
          // Fall through to regular transfer
        }

        // Generate stealth address for recipient - use ZK compressed when available
        const stealthAddress = isZkCompressionAvailable
          ? await generateZkCompressedStealthAddress(recipient.address, walletAddress)
          : await generateStealthAddress(recipient.address);
        if (!stealthAddress) {
          console.warn("[Confirmation] Stealth address generation failed, falling back to regular transfer");
          // Fall through to regular transfer
        } else if (localKeypair) {
          // Create Convex transfer record for private transfer
          // Store amount as base units (lamports) for consistent display
          const amountBaseUnits = typeof amount.amountBaseUnits === 'string'
            ? Number(amount.amountBaseUnits)
            : Number(amount.amountBaseUnits);

          // Determine if we should use relay for sender privacy
          const useRelay = isRelayAvailable && !!relayPoolAddress;

          // Determine privacy method
          const privacyMethod = isZkCompressionAvailable
            ? "zk_compressed" as const
            : (useRelay ? "relay" as const : "shadowwire" as const);

          transferId = await createTransfer({
            recipientType: recipient.type,
            recipientIdentifier: recipient.input,
            recipientAddress: stealthAddress.publicAddress, // Use stealth address (not real address)
            recipientDisplayName: recipient.displayName,
            amount: amountBaseUnits,
            token: token.symbol,
            tokenMint: token.mint,
            tokenDecimals: token.decimals,
            amountUsd: amount.amountUsd,
            networkFee: fees.networkFeeUsd,
            platformFee: fees.platformFee,
            priorityFee: fees.priorityFee * 150,
            credentialId: credentialId || undefined,
            // Privacy metadata
            isPrivate: true,
            stealthAddress: stealthAddress.publicAddress,
            ephemeralPubKey: stealthAddress.viewingKey,
            privacyMethod,
          });

          await updateTransferStatus({
            transferId,
            status: "signing",
            credentialId: credentialId || undefined,
          });

          // Parse amount to lamports (base units) for the transfer
          const amountLamports = typeof amount.amountBaseUnits === 'string'
            ? Number(amount.amountBaseUnits)
            : Number(amount.amountBaseUnits);

          console.log("[Confirmation] Private transfer with signer:", {
            from: localKeypair.publicKey.toBase58().slice(0, 8) + "...",
            to: stealthAddress.publicAddress.slice(0, 8) + "...",
            amountLamports,
            useRelay,
            relayPool: relayPoolAddress?.slice(0, 8),
          });

          // Execute private transfer - use ZK compressed when available
          // Pass the signer keypair for REAL on-chain transactions
          // If relay is available, use it for sender privacy (User → Pool → Stealth)
          const privateResult = isZkCompressionAvailable
            ? await executeZkPrivateTransfer(
                localKeypair.publicKey.toBase58(),
                stealthAddress.publicAddress,
                amountLamports,
                token.mint === "native" ? undefined : token.mint,
                localKeypair,
                useRelay,
                useRelay ? relayToStealth : undefined
              )
            : await executePrivateTransfer(
                localKeypair.publicKey.toBase58(),
                stealthAddress.publicAddress,
                amountLamports,
                token.mint === "native" ? undefined : token.mint,
                localKeypair,
                useRelay,
                useRelay ? relayToStealth : undefined
              );

          if (privateResult.success && privateResult.txSignature) {
            const confirmationTimeMs = Date.now() - startTime;

            await updateTransferStatus({
              transferId,
              status: "confirmed",
              solanaSignature: privateResult.txSignature,
              confirmationTimeMs,
              credentialId: credentialId || undefined,
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Navigate to success screen
            // Use correct explorer based on network
            const isDevnet = SOLANA_RPC_URL.includes("devnet");
            const explorerBase = isDevnet
              ? "https://explorer.solana.com/tx"
              : "https://solscan.io/tx";
            const explorerCluster = isDevnet ? "?cluster=devnet" : "";

            const result: TransferResult = {
              signature: privateResult.txSignature,
              confirmationTimeMs,
              withinTarget: confirmationTimeMs < 200,
              transferId,
              explorerUrl: `${explorerBase}/${privateResult.txSignature}${explorerCluster}`,
            };

            const usedRelay = privateResult.usedRelay ?? false;
            console.log("[Confirmation] Private transfer success:", {
              signature: privateResult.txSignature?.slice(0, 16) + "...",
              usedRelay,
              depositTx: privateResult.depositSignature?.slice(0, 16),
              relayTx: privateResult.relaySignature?.slice(0, 16),
            });

            // Publish encrypted note for recipient discovery & claim
            try {
              const recipientHash = bs58.encode(sha256Hash(new TextEncoder().encode(recipient.address)));

              await publishNote({
                recipientHash,
                encryptedNote: privateResult.encryptedNote || "",
                ephemeralPubKey: stealthAddress.viewingKey,
                stealthAddress: stealthAddress.publicAddress,
                amount: amountBaseUnits,
                token: token.mint,
                tokenSymbol: token.symbol,
                transferId: transferId?.toString(),
                recipientAddress: recipient.address,
                credentialId: credentialId || undefined,
              });
              console.log("[Confirmation] Published transfer note for recipient");
            } catch (noteErr) {
              // Non-fatal — transfer already succeeded, note publishing is best-effort
              console.warn("[Confirmation] Failed to publish transfer note:", noteErr);
            }

            // Check if recipient is a known contact
            const existingContact = getContactByAddress(recipient.address);
            const isNewRecipient = !existingContact;

            router.push({
              pathname: "/transfer/success",
              params: {
                result: JSON.stringify(result),
                recipient: params.recipient,
                amountDisplay: amount.amount.toString(),
                amountUsd: amount.amountUsd.toString(),
                tokenSymbol: token.symbol,
                feesPaid: fees.totalFeesUsd.toString(),
                shielded: "true", // Mark as shielded transfer
                senderPrivate: usedRelay ? "true" : "false", // Sender privacy via relay
                isNewRecipient: isNewRecipient ? "true" : "false",
              },
            });
            return; // Exit early - transfer complete
          } else {
            // Private transfer failed - update record and fall through to regular transfer
            console.warn("[Confirmation] Private transfer failed:", privateResult.error);
            await updateTransferStatus({
              transferId,
              status: "failed",
              errorMessage: privateResult.error || "Private transfer failed",
              credentialId: credentialId || undefined,
            });
            // Reset transferId so regular flow creates new record
            transferId = null;
          }
        }
      }

      // Privacy-first: No fallback to non-private transfer
      // If we reach here, the private path was unavailable or failed
      console.error("[Confirmation] Private transfer path unavailable", {
        privateTransferAvailable: isPrivateTransferAvailable,
        zkCompressionAvailable: isZkCompressionAvailable,
      });

      throw new Error(
        "Private transfer failed. Your funds are safe — no transfer was made. Please try again."
      );
    } catch (err) {
      console.error("[Confirmation] Transfer failed:", err);

      // Update Convex record if we created one
      if (transferId) {
        try {
          await updateTransferStatus({
            transferId,
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
            credentialId: credentialId || undefined,
          });
        } catch (updateErr) {
          console.error("[Confirmation] Failed to update status:", updateErr);
        }
      }

      // Show user-friendly error message
      let errorMessage = "Transfer failed. Please try again.";
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes("cancelled")) {
          errorMessage = "Transfer cancelled";
        } else if (msg.includes("insufficient") || msg.includes("balance") || msg.includes("0x1")) {
          errorMessage = "Insufficient balance for this transfer";
        } else if (msg.includes("simulation")) {
          errorMessage = "Transaction validation failed. Please check your balance.";
        } else if (msg.includes("confirm")) {
          errorMessage = "Network confirmation failed. Your funds are safe - please try again.";
        } else if (msg.includes("InstructionError")) {
          // Parse Solana InstructionError for better messaging
          try {
            // Example: {"InstructionError":[2,{"Custom":1}]}
            const match = msg.match(/Custom["\s:]+(\d+)/);
            if (match) {
              const customCode = parseInt(match[1], 10);
              if (customCode === 1) {
                errorMessage = "Insufficient funds or invalid account. Please check your balance.";
              } else if (customCode === 0) {
                errorMessage = "Invalid instruction data";
              } else {
                errorMessage = `Transaction failed (error code: ${customCode})`;
              }
            } else if (msg.includes("InsufficientFunds")) {
              errorMessage = "Insufficient balance for this transfer";
            } else if (msg.includes("AccountNotFound")) {
              errorMessage = "Recipient account not found on this network";
            } else {
              errorMessage = "Transaction failed on the network. Please try again.";
            }
          } catch {
            errorMessage = "Transaction failed. Please try again.";
          }
        } else if (msg.includes("blockhash") || msg.includes("expired")) {
          errorMessage = "Transaction expired. Please try again.";
        } else {
          errorMessage = msg;
        }
      }

      setError(errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsConfirming(false);
      setExecutionPhase("idle");
    }
  }, [recipient, token, amount, fees, userId, walletAddress, turnkey, params, createTransfer, updateTransferStatus, credentialId, privacyState, isPrivateTransferAvailable, isZkCompressionAvailable, isRelayAvailable, relayPoolAddress, generateStealthAddress, generateZkCompressedStealthAddress, executePrivateTransfer, executeZkPrivateTransfer, relayToStealth, getContactByAddress, publishNote]);

  // Show error if params missing
  if (!recipient || !token || !amount || !fees) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.errorContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Ionicons name="alert-circle" size={48} color={errorColor} />
          <ThemedText style={[styles.errorTitle, { color: errorColor }]}>
            Invalid Transfer Data
          </ThemedText>
          <ThemedText style={[styles.errorText, { color: mutedColor }]}>
            Could not load transfer details.
          </ThemedText>
          <PressableScale
            onPress={handleClose}
            style={[styles.closeButton, { borderColor: mutedColor }]}
          >
            <ThemedText>Close</ThemedText>
          </PressableScale>
        </View>
      </ThemedView>
    );
  }

  // Format recipient display
  const recipientDisplay = recipient.displayName || recipient.input;
  const recipientAddress = recipient.address.slice(0, 6) + '...' + recipient.address.slice(-4);

  // Calculate total fee
  const totalFee = fees.networkFeeUsd + fees.platformFee;

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(200)} style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <PressableScale
            onPress={handleEdit}
            style={[styles.headerButton]}
          >
            <Ionicons name="arrow-back" size={24} color={mutedColor} />
          </PressableScale>

          <ThemedText style={styles.headerTitle}>Confirm</ThemedText>

          <PressableScale
            onPress={handleClose}
            style={[styles.headerButton]}
          >
            <Ionicons name="close" size={24} color={mutedColor} />
          </PressableScale>
        </Animated.View>

      {/* Content - Simplified */}
      <View style={styles.content}>
        {/* Hero Amount */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.heroSection}>
          <Text style={[styles.heroAmount, { color: textColor }]}>
            ${amount.amountUsd.toFixed(2)}
          </Text>
          <View style={[styles.tokenBadge, { backgroundColor: primaryColor }]}>
            {token.iconUrl && (
              <Image source={{ uri: token.iconUrl }} style={styles.tokenImage} />
            )}
            <Text style={styles.tokenText}>{token.symbol}</Text>
          </View>
        </Animated.View>

        {/* Arrow indicator */}
        <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.arrowSection}>
          <View style={[styles.arrowLine, { backgroundColor: mutedColor }]} />
          <Ionicons name="arrow-down" size={20} color={mutedColor} />
          <View style={[styles.arrowLine, { backgroundColor: mutedColor }]} />
        </Animated.View>

        {/* Recipient */}
        <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.recipientSection}>
          <View style={[styles.recipientAvatar, { backgroundColor: primaryColor }]}>
            <Ionicons name="person" size={24} color="#fff" />
          </View>
          <Text style={[styles.recipientName, { color: textColor }]}>
            {recipientDisplay}
          </Text>
          <Text style={[styles.recipientAddress, { color: mutedColor }]}>
            {recipientAddress}
          </Text>
        </Animated.View>

        {/* Fee + Privacy line */}
        <Animated.View entering={FadeInUp.delay(250).duration(300)} style={styles.infoLine}>
          <Text style={[styles.infoText, { color: mutedColor }]}>
            Fee: ${totalFee.toFixed(2)}
          </Text>
          <View style={styles.infoDot} />
          <Ionicons name="shield-checkmark" size={14} color={primaryColor} />
          <Text style={[styles.infoText, { color: primaryColor }]}>Private</Text>
        </Animated.View>

        {/* Error Message */}
        {error && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={errorColor} />
            <ThemedText style={[styles.errorBannerText, { color: errorColor }]}>
              {error}
            </ThemedText>
            <PressableScale onPress={() => setError(null)}>
              <Ionicons name="close-circle" size={20} color={errorColor} />
            </PressableScale>
          </Animated.View>
        )}
      </View>

      {/* Send Button */}
      <Animated.View entering={FadeInUp.delay(300).duration(300)} style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
        <PressableScale
          onPress={handleConfirm}
          enabled={!isConfirming}
          style={[
            styles.sendButton,
            { backgroundColor: primaryColor },
            isConfirming && styles.buttonDisabled,
          ]}
        >
          {isConfirming ? (
            <View style={styles.confirmingContent}>
              <ActivityIndicator size="small" color={confirmButtonTextColor} />
              <Text style={[styles.sendButtonText, { color: confirmButtonTextColor }]}>
                {executionPhase === "building" && "Building..."}
                {executionPhase === "signing" && "Signing..."}
                {executionPhase === "shielding" && "Shielding..."}
                {executionPhase === "submitting" && "Sending..."}
                {executionPhase === "confirming" && "Confirming..."}
                {executionPhase === "idle" && "Processing..."}
              </Text>
            </View>
          ) : (
            <Text style={[styles.sendButtonText, { color: confirmButtonTextColor }]}>
              {error ? "Try Again" : "Send"}
            </Text>
          )}
        </PressableScale>
      </Animated.View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  // Hero Amount
  heroSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  heroAmount: {
    fontSize: 48,
    fontWeight: "700",
    marginBottom: 12,
  },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: 24,
  },
  tokenImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  tokenText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Arrow
  arrowSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  arrowLine: {
    width: 40,
    height: 1,
    opacity: 0.3,
  },
  // Recipient
  recipientSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  recipientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  recipientName: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
  recipientAddress: {
    fontSize: 14,
    fontFamily: "monospace",
  },
  // Info line
  infoLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 12,
  },
  infoText: {
    fontSize: 14,
  },
  infoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  // Error
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderRadius: 12,
    marginTop: 16,
    width: "100%",
  },
  errorBannerText: {
    fontSize: 14,
    flex: 1,
  },
  // Bottom
  bottomActions: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  confirmingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Error container (for invalid params)
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  closeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});
