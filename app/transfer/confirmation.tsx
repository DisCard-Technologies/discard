/**
 * DisCard 2035 - Transfer Confirmation Modal
 *
 * Pre-send confirmation screen showing:
 * - Transfer summary
 * - Fee breakdown
 * - Biometric confirm button
 */

import { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ActivityIndicator,
  Text,
  Image,
} from "react-native";
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
// TransferSummary removed - using simplified inline display
import { useAuth, useCurrentCredentialId, getLocalSolanaKeypair } from "@/stores/authConvex";
import { usePrivateTransfer } from "@/hooks/usePrivateTransfer";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Connection, PublicKey } from "@solana/web3.js";
import { useTurnkey } from "@/hooks/useTurnkey";
import {
  getFiredancerClient,
  initializeFiredancerClient,
  type ConfirmationResult,
} from "@/lib/solana/firedancer-client";
import {
  buildSOLTransfer,
  buildSPLTokenTransfer,
  simulateTransaction,
  NATIVE_MINT,
} from "@/lib/transfer/transaction-builder";
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

const SOLANA_RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

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
    shadowWireStatus,
  } = usePrivateTransfer();

  // Auth and Turnkey
  const { user, userId } = useAuth();
  const credentialId = useCurrentCredentialId();
  const turnkey = useTurnkey(userId, {
    organizationId: TURNKEY_ORG_ID,
    rpId: TURNKEY_RP_ID,
  });

  // Use user's Solana address from auth (biometric flow) OR Turnkey (TEE flow)
  const walletAddress = user?.solanaAddress || turnkey.walletAddress;

  // Convex mutations for transfer records
  const createTransfer = useMutation(api.transfers.transfers.create);
  const updateTransferStatus = useMutation(api.transfers.transfers.updateStatus);

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

  // Parse params
  let recipient: TransferRecipient | null = null;
  let token: TransferToken | null = null;
  let amount: TransferAmount | null = null;
  let fees: TransferFees | null = null;

  try {
    if (params.recipient) recipient = JSON.parse(params.recipient);
    if (params.token) token = JSON.parse(params.token);
    if (params.amount) amount = JSON.parse(params.amount);
    if (params.fees) fees = JSON.parse(params.fees);
  } catch (e) {
    console.error("[Confirmation] Failed to parse params:", e);
  }

  const createsAta = params.createsAta === "true";
  const memo = params.memo;

  // Auto-run compliance check on mount
  useEffect(() => {
    if (!complianceChecked && recipient && walletAddress && amount) {
      checkTransferCompliance(
        walletAddress,
        recipient.address,
        amount.amountUsd || 0
      ).then(() => setComplianceChecked(true));
    }
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
          features: shadowWireStatus?.features,
        });
        setExecutionPhase("shielding");

        // Generate stealth address for recipient - use ZK compressed when available
        const stealthAddress = isZkCompressionAvailable
          ? await generateZkCompressedStealthAddress(recipient.address, walletAddress)
          : await generateStealthAddress(recipient.address);
        if (!stealthAddress) {
          console.warn("[Confirmation] Stealth address generation failed, falling back to regular transfer");
          // Fall through to regular transfer
        } else {
          // Create Convex transfer record for private transfer
          transferId = await createTransfer({
            recipientType: recipient.type,
            recipientIdentifier: recipient.input,
            recipientAddress: stealthAddress.publicAddress, // Use stealth address
            recipientDisplayName: recipient.displayName,
            amount: amount.amount,
            token: token.symbol,
            tokenMint: token.mint,
            tokenDecimals: token.decimals,
            amountUsd: amount.amountUsd,
            networkFee: fees.networkFeeUsd,
            platformFee: fees.platformFee,
            priorityFee: fees.priorityFee * 150,
            credentialId: credentialId || undefined,
          });

          await updateTransferStatus({
            transferId,
            status: "signing",
            credentialId: credentialId || undefined,
          });

          // Execute private transfer - use ZK compressed when available
          const privateResult = isZkCompressionAvailable
            ? await executeZkPrivateTransfer(
                walletAddress,
                stealthAddress.publicAddress,
                Number(amount.amount),
                token.mint === "native" ? undefined : token.mint
              )
            : await executePrivateTransfer(
                walletAddress,
                stealthAddress.publicAddress,
                Number(amount.amount),
                token.mint === "native" ? undefined : token.mint
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
            const result: TransferResult = {
              signature: privateResult.txSignature,
              confirmationTimeMs,
              withinTarget: confirmationTimeMs < 200,
              transferId,
              explorerUrl: `https://solscan.io/tx/${privateResult.txSignature}`,
            };

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

      // Fallback: Regular transaction flow (when ShadowWire unavailable)
      console.log("[Confirmation] Using regular transfer flow");

      // Step 2b: Build transaction
      setExecutionPhase("building");

      console.log("[Confirmation] Using RPC:", SOLANA_RPC_URL);
      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      const fromPubkey = new PublicKey(walletAddress);
      const toPubkey = new PublicKey(recipient.address);

      // Parse amount base units (handle both string and bigint)
      const amountBaseUnits = typeof amount.amountBaseUnits === 'string'
        ? BigInt(amount.amountBaseUnits)
        : amount.amountBaseUnits;

      let txResult;
      if (token.mint === "native" || token.mint === NATIVE_MINT.toBase58()) {
        txResult = await buildSOLTransfer(
          connection,
          fromPubkey,
          toPubkey,
          amountBaseUnits
        );
      } else {
        txResult = await buildSPLTokenTransfer(
          connection,
          fromPubkey,
          toPubkey,
          amountBaseUnits,
          new PublicKey(token.mint)
        );
      }

      // Step 3: Simulate transaction
      const simulation = await simulateTransaction(connection, txResult.transaction);
      if (!simulation.success) {
        throw new Error(simulation.error || "Transaction simulation failed");
      }

      // Step 4: Create Convex transfer record
      transferId = await createTransfer({
        recipientType: recipient.type,
        recipientIdentifier: recipient.input,
        recipientAddress: recipient.address,
        recipientDisplayName: recipient.displayName,
        amount: amount.amount,
        token: token.symbol,
        tokenMint: token.mint,
        tokenDecimals: token.decimals,
        amountUsd: amount.amountUsd,
        networkFee: fees.networkFeeUsd,
        platformFee: fees.platformFee,
        priorityFee: fees.priorityFee * 150, // Convert SOL to USD estimate
        credentialId: credentialId || undefined,
      });

      // Step 5: Sign transaction (Turnkey TEE or local keypair)
      setExecutionPhase("signing");

      await updateTransferStatus({
        transferId,
        status: "signing",
        credentialId: credentialId || undefined,
      });

      let signedTransaction = txResult.transaction;

      // Check if user has Turnkey sub-organization for TEE signing
      if (turnkey.subOrg) {
        console.log("[Confirmation] Signing with Turnkey TEE");
        const signResult = await turnkey.signTransaction(txResult.transaction);
        // Add Turnkey signature to transaction
        signedTransaction.addSignature(
          fromPubkey,
          Buffer.from(signResult.signature)
        );
      } else {
        // Fall back to local keypair signing (biometric auth users)
        console.log("[Confirmation] Signing with local keypair (no Turnkey sub-org)");
        const localKeypair = await getLocalSolanaKeypair();
        if (!localKeypair) {
          throw new Error("No signing key available. Please re-authenticate.");
        }

        // For local signing, we must rebuild the transaction:
        // 1. Use the local keypair's address as sender
        // 2. Disable gas subsidization (we don't have the gas authority's key)
        const localPubkey = localKeypair.publicKey;
        console.log("[Confirmation] Using local keypair:", localPubkey.toBase58());
        console.log("[Confirmation] Rebuilding transaction without gas subsidization");

        // Rebuild transaction with local keypair's address and no gas subsidy
        if (token.mint === "native" || token.mint === NATIVE_MINT.toBase58()) {
          txResult = await buildSOLTransfer(
            connection,
            localPubkey,
            toPubkey,
            amountBaseUnits,
            false // subsidizeGas = false, user pays their own fees
          );
        } else {
          txResult = await buildSPLTokenTransfer(
            connection,
            localPubkey,
            toPubkey,
            amountBaseUnits,
            new PublicKey(token.mint),
            false // subsidizeGas = false, user pays their own fees
          );
        }
        signedTransaction = txResult.transaction;

        // Sign transaction with local keypair
        signedTransaction.sign(localKeypair);
      }

      // Step 6: Submit to Firedancer
      setExecutionPhase("submitting");

      // Initialize Firedancer client if not already done
      let firedancer;
      try {
        firedancer = getFiredancerClient();
      } catch {
        firedancer = initializeFiredancerClient({
          primaryEndpoint: SOLANA_RPC_URL,
          targetConfirmationMs: 150,
          maxRetries: 3,
        });
      }

      const { signature, confirmationPromise } = await firedancer.sendTransaction(
        signedTransaction as any
      );

      await updateTransferStatus({
        transferId,
        status: "submitted",
        solanaSignature: signature,
        credentialId: credentialId || undefined,
      });

      // Step 7: Wait for confirmation
      setExecutionPhase("confirming");

      const confirmation: ConfirmationResult = await confirmationPromise;
      const confirmationTimeMs = Date.now() - startTime;

      if (!confirmation.confirmed) {
        await updateTransferStatus({
          transferId,
          status: "failed",
          errorMessage: confirmation.error || "Confirmation failed",
          credentialId: credentialId || undefined,
        });
        throw new Error(confirmation.error || "Transaction failed to confirm on the network");
      }

      // Step 8: Success!
      await updateTransferStatus({
        transferId,
        status: "confirmed",
        confirmationTimeMs,
        credentialId: credentialId || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to success screen with real data
      const result: TransferResult = {
        signature,
        confirmationTimeMs,
        withinTarget: confirmation.withinTarget,
        transferId,
        explorerUrl: `https://solscan.io/tx/${signature}`,
      };

      router.push({
        pathname: "/transfer/success",
        params: {
          result: JSON.stringify(result),
          recipient: params.recipient,
          amountDisplay: amount.amount.toString(),
          amountUsd: amount.amountUsd.toString(),
          tokenSymbol: token.symbol,
          feesPaid: fees.totalFeesUsd.toString(),
        },
      });
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
        if (err.message.includes("cancelled")) {
          errorMessage = "Transfer cancelled";
        } else if (err.message.includes("insufficient") || err.message.includes("balance")) {
          errorMessage = "Insufficient balance for this transfer";
        } else if (err.message.includes("simulation")) {
          errorMessage = "Transaction validation failed. Please check your balance.";
        } else if (err.message.includes("confirm")) {
          errorMessage = "Network confirmation failed. Your funds are safe - please try again.";
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsConfirming(false);
      setExecutionPhase("idle");
    }
  }, [recipient, token, amount, fees, userId, walletAddress, turnkey, params, createTransfer, updateTransferStatus, credentialId, privacyState, isPrivateTransferAvailable, generateStealthAddress, executePrivateTransfer]);

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
          <Pressable
            onPress={handleClose}
            style={[styles.closeButton, { borderColor: mutedColor }]}
          >
            <ThemedText>Close</ThemedText>
          </Pressable>
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
          <Pressable
            onPress={handleEdit}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={24} color={mutedColor} />
          </Pressable>

          <ThemedText style={styles.headerTitle}>Confirm</ThemedText>

          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={mutedColor} />
          </Pressable>
        </Animated.View>

      {/* Content - Simplified */}
      <View style={styles.content}>
        {/* Hero Amount */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.heroSection}>
          <Text style={[styles.heroAmount, { color: textColor }]}>
            ${amount.amountUsd.toFixed(2)}
          </Text>
          <View style={[styles.tokenBadge, { backgroundColor: primaryColor }]}>
            {token.logoUri && (
              <Image source={{ uri: token.logoUri }} style={styles.tokenImage} />
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
            <Pressable onPress={() => setError(null)}>
              <Ionicons name="close-circle" size={20} color={errorColor} />
            </Pressable>
          </Animated.View>
        )}
      </View>

      {/* Send Button */}
      <Animated.View entering={FadeInUp.delay(300).duration(300)} style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleConfirm}
          disabled={isConfirming}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: primaryColor },
            pressed && styles.pressed,
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
        </Pressable>
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
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
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
