/**
 * DisCard 2035 - useTransfer Hook
 *
 * Comprehensive transfer hook managing the entire P2P transfer flow:
 * - State machine: idle → recipient → amount → confirmation → signing → success/error
 * - Turnkey TEE signing integration
 * - Firedancer-optimized transaction submission
 * - Fee calculation and validation
 * - Double-send prevention via idempotency
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  buildTransfer,
  buildSOLTransfer,
  buildSPLTokenTransfer,
  estimateTransferFees,
  simulateTransaction,
  toBaseUnits,
  fromBaseUnits,
  NATIVE_MINT,
  USDC_MINT,
  type TransferTransaction,
  type FeeEstimate,
} from "@/lib/transfer/transaction-builder";
import { type ResolvedAddress } from "@/lib/transfer/address-resolver";
import { useTurnkey, type VelocityCheckResult } from "@/hooks/useTurnkey";
import {
  getFiredancerClient,
  type ConfirmationResult,
} from "@/lib/solana/firedancer-client";

// ============================================================================
// Types
// ============================================================================

export type TransferState =
  | "idle"
  | "recipient"
  | "amount"
  | "confirmation"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

export interface TransferRecipient {
  /** Original input (address or .sol domain) */
  input: string;
  /** Resolved Solana address (empty for non-user phone/email) */
  address: string;
  /** Display name (.sol domain or contact name) */
  displayName?: string;
  /** Recipient type */
  type: "address" | "sol_name" | "contact" | "phone" | "email";
  /** Contact ID if from contacts */
  contactId?: Id<"contacts">;
  /** User ID if resolved to a DisCard user */
  userId?: string;
  /** Whether this is a non-user who can be invited (TextPay) */
  canInvite?: boolean;
}

export interface TransferToken {
  /** Token symbol (e.g., "USDC", "SOL") */
  symbol: string;
  /** Token mint address */
  mint: string;
  /** Token decimals */
  decimals: number;
  /** User's available balance */
  balance: number;
  /** Balance in USD */
  balanceUsd: number;
  /** Token icon URL */
  iconUrl?: string;
}

export interface TransferAmount {
  /** Amount in token units */
  amount: number;
  /** Amount in USD */
  amountUsd: number;
  /** Amount in base units (lamports/smallest token unit) */
  amountBaseUnits: bigint;
}

export interface TransferFees {
  /** Network fee in SOL */
  networkFee: number;
  /** Network fee in USD */
  networkFeeUsd: number;
  /** Platform fee (0.3%) in USD */
  platformFee: number;
  /** Priority fee in SOL */
  priorityFee: number;
  /** ATA creation rent if needed */
  ataRent: number;
  /** Total fees in USD */
  totalFeesUsd: number;
  /** Total cost (amount + fees) in USD */
  totalCostUsd: number;
}

export interface TransferResult {
  /** Solana transaction signature */
  signature: string;
  /** Confirmation time in ms */
  confirmationTimeMs: number;
  /** Whether confirmed within Alpenglow target (150ms) */
  withinTarget: boolean;
  /** Convex transfer record ID */
  transferId: Id<"transfers">;
  /** Solscan URL */
  explorerUrl: string;
}

export interface TransferError {
  /** Error code */
  code:
    | "INSUFFICIENT_BALANCE"
    | "VELOCITY_LIMIT"
    | "SIGNING_FAILED"
    | "SIMULATION_FAILED"
    | "SUBMISSION_FAILED"
    | "CONFIRMATION_FAILED"
    | "NETWORK_ERROR"
    | "INVALID_RECIPIENT"
    | "UNKNOWN";
  /** Human-readable error message */
  message: string;
  /** Optional error details */
  details?: string;
}

export interface UseTransferOptions {
  /** User ID for Convex operations */
  userId: Id<"users"> | null;
  /** Turnkey config for signing */
  turnkeyConfig: {
    organizationId: string;
    rpId: string;
  };
  /** Solana connection */
  connection: Connection;
  /** Platform fee percentage (default: 0.003 = 0.3%) */
  platformFeePercent?: number;
  /** SOL price for fee calculations */
  solPrice?: number;
  /** Callback on successful transfer */
  onSuccess?: (result: TransferResult) => void;
  /** Callback on error */
  onError?: (error: TransferError) => void;
}

export interface UseTransferReturn {
  // State
  state: TransferState;
  recipient: TransferRecipient | null;
  token: TransferToken | null;
  amount: TransferAmount | null;
  fees: TransferFees | null;
  result: TransferResult | null;
  error: TransferError | null;
  isLoading: boolean;

  // Validation
  canProceed: boolean;
  velocityCheck: VelocityCheckResult | null;

  // Actions
  setRecipient: (recipient: ResolvedAddress, contactId?: Id<"contacts">) => void;
  setToken: (token: TransferToken) => void;
  setAmount: (amount: number, isUsd?: boolean) => void;
  proceedToConfirmation: () => Promise<void>;
  confirmAndSign: () => Promise<void>;
  reset: () => void;
  goBack: () => void;

  // Helpers
  calculateFees: (amount: number) => Promise<TransferFees | null>;
  validateBalance: (amount: number) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PLATFORM_FEE_PERCENT = 0.003; // 0.3%
const DEFAULT_SOL_PRICE = 150; // Fallback SOL price
const LAMPORTS_PER_SOL = 1_000_000_000;
const SOLSCAN_BASE_URL = "https://solscan.io/tx";

// ============================================================================
// Hook Implementation
// ============================================================================

export function useTransfer(options: UseTransferOptions): UseTransferReturn {
  const {
    userId,
    turnkeyConfig,
    connection,
    platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT,
    solPrice = DEFAULT_SOL_PRICE,
    onSuccess,
    onError,
  } = options;

  // Turnkey hook
  const turnkey = useTurnkey(userId, turnkeyConfig);

  // Convex mutations
  const createTransfer = useMutation(api.transfers.transfers.create);
  const updateTransferStatus = useMutation(api.transfers.transfers.updateStatus);
  const markContactUsed = useMutation(api.transfers.contacts.markUsed);

  // State
  const [state, setState] = useState<TransferState>("idle");
  const [recipient, setRecipientState] = useState<TransferRecipient | null>(null);
  const [token, setTokenState] = useState<TransferToken | null>(null);
  const [amount, setAmountState] = useState<TransferAmount | null>(null);
  const [fees, setFeesState] = useState<TransferFees | null>(null);
  const [result, setResultState] = useState<TransferResult | null>(null);
  const [error, setErrorState] = useState<TransferError | null>(null);
  const [velocityCheck, setVelocityCheck] = useState<VelocityCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Idempotency key ref for double-send prevention
  const idempotencyKeyRef = useRef<string | null>(null);
  const transferIdRef = useRef<Id<"transfers"> | null>(null);

  // Generate idempotency key
  const generateIdempotencyKey = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }, []);

  // Calculate fees
  const calculateFees = useCallback(
    async (amountValue: number): Promise<TransferFees | null> => {
      if (!recipient || !token) return null;

      try {
        const mint = token.mint === "native" ? NATIVE_MINT : new PublicKey(token.mint);

        const feeEstimate = await estimateTransferFees(connection, {
          from: new PublicKey(turnkey.walletAddress || ""),
          to: new PublicKey(recipient.address),
          amount: toBaseUnits(amountValue, token.decimals),
          mint: token.mint === "native" ? undefined : mint,
        });

        const networkFee = feeEstimate.networkFee / LAMPORTS_PER_SOL;
        const networkFeeUsd = networkFee * solPrice;
        const priorityFee = feeEstimate.priorityFee / LAMPORTS_PER_SOL;
        const ataRent = feeEstimate.ataRent / LAMPORTS_PER_SOL;

        // Calculate platform fee on the transfer amount
        const amountUsd =
          token.symbol === "USDC" || token.symbol === "USDT"
            ? amountValue // Stablecoins
            : amountValue * solPrice; // SOL

        const platformFee = amountUsd * platformFeePercent;

        const totalFeesUsd = networkFeeUsd + platformFee + ataRent * solPrice;
        const totalCostUsd = amountUsd + totalFeesUsd;

        return {
          networkFee,
          networkFeeUsd,
          platformFee,
          priorityFee,
          ataRent,
          totalFeesUsd,
          totalCostUsd,
        };
      } catch (err) {
        console.error("[useTransfer] Fee calculation failed:", err);
        return null;
      }
    },
    [recipient, token, connection, turnkey.walletAddress, solPrice, platformFeePercent]
  );

  // Validate balance
  const validateBalance = useCallback(
    (amountValue: number): boolean => {
      if (!token) return false;
      return amountValue <= token.balance;
    },
    [token]
  );

  // Set recipient
  const setRecipient = useCallback(
    (resolved: ResolvedAddress, contactId?: Id<"contacts">) => {
      if (!resolved.isValid) {
        setErrorState({
          code: "INVALID_RECIPIENT",
          message: "Invalid recipient address",
          details: resolved.error,
        });
        return;
      }

      setRecipientState({
        input: resolved.input,
        address: resolved.address,
        displayName: resolved.displayName,
        type: contactId ? "contact" : resolved.type === "sol_name" ? "sol_name" : "address",
        contactId,
      });

      setErrorState(null);
      setState("recipient");
    },
    []
  );

  // Set token
  const setToken = useCallback((tokenData: TransferToken) => {
    setTokenState(tokenData);
    setErrorState(null);
  }, []);

  // Set amount
  const setAmount = useCallback(
    (amountValue: number, isUsd = false) => {
      if (!token) return;

      let tokenAmount: number;
      let usdAmount: number;

      if (isUsd) {
        usdAmount = amountValue;
        // Convert USD to token amount
        if (token.symbol === "USDC" || token.symbol === "USDT") {
          tokenAmount = amountValue; // 1:1 for stablecoins
        } else {
          tokenAmount = amountValue / solPrice; // SOL conversion
        }
      } else {
        tokenAmount = amountValue;
        // Convert token to USD
        if (token.symbol === "USDC" || token.symbol === "USDT") {
          usdAmount = amountValue;
        } else {
          usdAmount = amountValue * solPrice;
        }
      }

      setAmountState({
        amount: tokenAmount,
        amountUsd: usdAmount,
        amountBaseUnits: toBaseUnits(tokenAmount, token.decimals),
      });

      // Calculate fees whenever amount changes
      calculateFees(tokenAmount).then(setFeesState);

      setState("amount");
      setErrorState(null);
    },
    [token, solPrice, calculateFees]
  );

  // Proceed to confirmation
  const proceedToConfirmation = useCallback(async () => {
    if (!recipient || !token || !amount || !userId) {
      return;
    }

    setIsLoading(true);

    try {
      // Check velocity limits
      const amountCents = Math.round(amount.amountUsd * 100);
      const check = await turnkey.checkCanTransact(amountCents);
      setVelocityCheck(check);

      if (!check.allowed) {
        setErrorState({
          code: "VELOCITY_LIMIT",
          message: check.reason || "Transaction exceeds spending limits",
        });
        setState("error");
        return;
      }

      // Validate balance
      if (!validateBalance(amount.amount)) {
        setErrorState({
          code: "INSUFFICIENT_BALANCE",
          message: `Insufficient ${token.symbol} balance`,
        });
        setState("error");
        return;
      }

      // Generate idempotency key
      idempotencyKeyRef.current = generateIdempotencyKey();

      // Calculate final fees
      const calculatedFees = await calculateFees(amount.amount);
      if (calculatedFees) {
        setFeesState(calculatedFees);
      }

      setState("confirmation");
    } catch (err) {
      console.error("[useTransfer] Failed to proceed:", err);
      setErrorState({
        code: "UNKNOWN",
        message: "Failed to prepare transfer",
        details: err instanceof Error ? err.message : undefined,
      });
      setState("error");
    } finally {
      setIsLoading(false);
    }
  }, [
    recipient,
    token,
    amount,
    userId,
    turnkey,
    validateBalance,
    generateIdempotencyKey,
    calculateFees,
  ]);

  // Confirm and sign transaction
  const confirmAndSign = useCallback(async () => {
    if (!recipient || !token || !amount || !fees || !userId || !turnkey.walletAddress) {
      return;
    }

    setIsLoading(true);
    setState("signing");

    const startTime = Date.now();

    try {
      // 1. Build transaction
      const fromPubkey = new PublicKey(turnkey.walletAddress);
      const toPubkey = new PublicKey(recipient.address);

      let txResult: TransferTransaction;

      if (token.mint === "native" || token.mint === NATIVE_MINT.toBase58()) {
        txResult = await buildSOLTransfer(
          connection,
          fromPubkey,
          toPubkey,
          amount.amountBaseUnits
        );
      } else {
        txResult = await buildSPLTokenTransfer(
          connection,
          fromPubkey,
          toPubkey,
          amount.amountBaseUnits,
          new PublicKey(token.mint)
        );
      }

      // 2. Simulate transaction
      const simulation = await simulateTransaction(connection, txResult.transaction);
      if (!simulation.success) {
        setErrorState({
          code: "SIMULATION_FAILED",
          message: "Transaction simulation failed",
          details: simulation.error,
        });
        setState("error");
        return;
      }

      // 3. Create Convex record before signing
      const transferId = await createTransfer({
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
        priorityFee: fees.priorityFee * solPrice,
        idempotencyKey: idempotencyKeyRef.current || undefined,
      });

      transferIdRef.current = transferId;

      // 4. Sign with Turnkey (triggers biometric)
      const { signedTransaction } = await turnkey.signTransaction(txResult.transaction);

      await updateTransferStatus({
        transferId,
        status: "signing",
      });

      // 5. Submit to Firedancer
      setState("submitting");

      const firedancer = getFiredancerClient();
      const { signature, confirmationPromise } = await firedancer.sendTransaction(
        signedTransaction as any
      );

      await updateTransferStatus({
        transferId,
        status: "submitted",
        solanaSignature: signature,
      });

      // 6. Wait for confirmation
      setState("confirming");

      const confirmation: ConfirmationResult = await confirmationPromise;
      const confirmationTimeMs = Date.now() - startTime;

      if (!confirmation.confirmed) {
        await updateTransferStatus({
          transferId,
          status: "failed",
          errorMessage: confirmation.error || "Confirmation failed",
        });

        setErrorState({
          code: "CONFIRMATION_FAILED",
          message: "Transaction failed to confirm",
          details: confirmation.error,
        });
        setState("error");
        return;
      }

      // 7. Success!
      await updateTransferStatus({
        transferId,
        status: "confirmed",
        confirmationTimeMs,
      });

      // Update contact usage if applicable
      if (recipient.contactId) {
        await markContactUsed({
          contactId: recipient.contactId,
          amountUsd: amount.amountUsd,
        });
      }

      const transferResult: TransferResult = {
        signature,
        confirmationTimeMs,
        withinTarget: confirmation.withinTarget,
        transferId,
        explorerUrl: `${SOLSCAN_BASE_URL}/${signature}`,
      };

      setResultState(transferResult);
      setState("success");
      onSuccess?.(transferResult);
    } catch (err) {
      console.error("[useTransfer] Transfer failed:", err);

      // Update Convex record if we created one
      if (transferIdRef.current) {
        await updateTransferStatus({
          transferId: transferIdRef.current,
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        });
      }

      const transferError: TransferError = {
        code: "SIGNING_FAILED",
        message: "Transfer failed",
        details: err instanceof Error ? err.message : undefined,
      };

      setErrorState(transferError);
      setState("error");
      onError?.(transferError);
    } finally {
      setIsLoading(false);
    }
  }, [
    recipient,
    token,
    amount,
    fees,
    userId,
    turnkey,
    connection,
    solPrice,
    createTransfer,
    updateTransferStatus,
    markContactUsed,
    onSuccess,
    onError,
  ]);

  // Reset state
  const reset = useCallback(() => {
    setState("idle");
    setRecipientState(null);
    setTokenState(null);
    setAmountState(null);
    setFeesState(null);
    setResultState(null);
    setErrorState(null);
    setVelocityCheck(null);
    setIsLoading(false);
    idempotencyKeyRef.current = null;
    transferIdRef.current = null;
  }, []);

  // Go back one step
  const goBack = useCallback(() => {
    switch (state) {
      case "recipient":
        setState("idle");
        setRecipientState(null);
        break;
      case "amount":
        setState("recipient");
        setAmountState(null);
        setFeesState(null);
        break;
      case "confirmation":
        setState("amount");
        break;
      case "error":
        setState("confirmation");
        setErrorState(null);
        break;
      default:
        break;
    }
  }, [state]);

  // Compute canProceed
  const canProceed = useMemo(() => {
    switch (state) {
      case "idle":
        return !!recipient;
      case "recipient":
        return !!recipient && !!token;
      case "amount":
        return (
          !!recipient &&
          !!token &&
          !!amount &&
          amount.amount > 0 &&
          validateBalance(amount.amount)
        );
      case "confirmation":
        return velocityCheck?.allowed ?? false;
      default:
        return false;
    }
  }, [state, recipient, token, amount, velocityCheck, validateBalance]);

  return {
    // State
    state,
    recipient,
    token,
    amount,
    fees,
    result,
    error,
    isLoading,

    // Validation
    canProceed,
    velocityCheck,

    // Actions
    setRecipient,
    setToken,
    setAmount,
    proceedToConfirmation,
    confirmAndSign,
    reset,
    goBack,

    // Helpers
    calculateFees,
    validateBalance,
  };
}

// ============================================================================
// Export Types & Default
// ============================================================================

export type {
  TransferState,
  TransferRecipient,
  TransferToken,
  TransferAmount,
  TransferFees,
  TransferResult,
  TransferError,
};

export default useTransfer;
