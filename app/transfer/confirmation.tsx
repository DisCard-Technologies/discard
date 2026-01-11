/**
 * DisCard 2035 - Transfer Confirmation Modal
 *
 * Pre-send confirmation screen showing:
 * - Transfer summary
 * - Fee breakdown
 * - Biometric confirm button
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { TransferSummary } from "@/components/transfer";
import { useAuth, useCurrentCredentialId, getLocalSolanaKeypair } from "@/stores/authConvex";
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

type ExecutionPhase = "idle" | "building" | "signing" | "submitting" | "confirming";

// ============================================================================
// Component
// ============================================================================

export default function TransferConfirmationScreen() {
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

      // Step 2: Build transaction
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
  }, [recipient, token, amount, fees, userId, walletAddress, turnkey, params, createTransfer, updateTransferStatus, credentialId]);

  // Show error if params missing
  if (!recipient || !token || !amount || !fees) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
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
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColor }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.header}
        >
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={mutedColor} />
          </Pressable>

          <ThemedText style={styles.headerTitle}>Confirm Transfer</ThemedText>

          <View style={styles.headerButton} />
        </Animated.View>

        {/* Content */}
        <View style={styles.content}>
          {/* Transfer Summary */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <TransferSummary
              recipient={recipient}
              token={token}
              amount={amount}
              fees={fees}
              createsAta={createsAta}
              memo={memo}
            />
          </Animated.View>

          {/* Error Message with Retry */}
          {error && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={styles.errorBanner}
            >
              <View style={styles.errorContent}>
                <Ionicons name="alert-circle" size={18} color={errorColor} />
                <ThemedText style={[styles.errorBannerText, { color: errorColor }]}>
                  {error}
                </ThemedText>
              </View>
              <View style={styles.errorActions}>
                <Pressable
                  onPress={() => setError(null)}
                  style={[styles.errorButton, { backgroundColor: `${errorColor}20` }]}
                >
                  <ThemedText style={[styles.errorButtonText, { color: errorColor }]}>
                    Dismiss
                  </ThemedText>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>

        {/* Bottom Actions */}
        <Animated.View
          entering={FadeInUp.delay(200).duration(300)}
          style={styles.bottomActions}
        >
          {/* Edit Button */}
          <Pressable
            onPress={handleEdit}
            disabled={isConfirming}
            style={({ pressed }) => [
              styles.editButton,
              { borderColor: mutedColor },
              pressed && styles.pressed,
              isConfirming && styles.buttonDisabled,
            ]}
          >
            <Ionicons name="pencil" size={18} color={mutedColor} />
            <ThemedText style={[styles.editButtonText, { color: mutedColor }]}>
              Edit
            </ThemedText>
          </Pressable>

          {/* Confirm Button */}
          <Pressable
            onPress={handleConfirm}
            disabled={isConfirming}
            style={({ pressed }) => [
              styles.confirmButton,
              { backgroundColor: primaryColor },
              pressed && styles.pressed,
              isConfirming && styles.buttonDisabled,
            ]}
          >
            {isConfirming ? (
              <View style={styles.confirmingContent}>
                <ActivityIndicator size="small" color={confirmButtonTextColor} />
                <ThemedText style={[styles.confirmButtonText, { color: confirmButtonTextColor }]}>
                  {executionPhase === "building" && "Building transaction..."}
                  {executionPhase === "signing" && "Signing..."}
                  {executionPhase === "submitting" && "Submitting..."}
                  {executionPhase === "confirming" && "Confirming..."}
                  {executionPhase === "idle" && "Processing..."}
                </ThemedText>
              </View>
            ) : (
              <>
                <Ionicons name="finger-print" size={22} color={confirmButtonTextColor} />
                <ThemedText style={[styles.confirmButtonText, { color: confirmButtonTextColor }]}>
                  {error ? "Try Again" : "Confirm with Face ID"}
                </ThemedText>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* Security Note */}
        <Animated.View
          entering={FadeIn.delay(400).duration(300)}
          style={styles.securityNote}
        >
          <Ionicons name="shield-checkmark" size={14} color={mutedColor} />
          <ThemedText style={[styles.securityText, { color: mutedColor }]}>
            Secured by Turnkey TEE • Your keys never leave the enclave
          </ThemedText>
        </Animated.View>
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
    paddingTop: 8,
  },
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
  errorBanner: {
    flexDirection: "column",
    gap: 12,
    padding: 12,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderRadius: 12,
    marginTop: 16,
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorBannerText: {
    fontSize: 14,
    flex: 1,
  },
  errorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  errorButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  errorButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
  bottomActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 17,
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
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  securityText: {
    fontSize: 12,
    textAlign: "center",
  },
});
