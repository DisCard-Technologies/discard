/**
 * DisCard 2035 - usePrivateTransfer Hook
 *
 * Privacy-enhanced transfer hook that adds:
 * - Compliance screening via Range Faraday API
 * - Private transfer option via ShadowWire
 * - Address sanctions/blacklist checking
 *
 * This hook wraps the standard transfer flow with privacy features.
 */

import { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { getRangeComplianceService, type TransferComplianceCheck } from "@/services/rangeComplianceClient";
import {
  getShadowWireService,
  type PrivateTransferResult,
  type StealthAddress,
  type CompressedStealthAddress,
  type ZkPrivateTransferResult,
} from "@/services/shadowWireClient";

// ============================================================================
// Types
// ============================================================================

export interface PrivacyOptions {
  /** Use ShadowWire for anonymous transfer */
  usePrivateTransfer: boolean;
  /** Perform compliance check before transfer */
  checkCompliance: boolean;
  /** Risk tolerance level */
  riskTolerance: "low" | "medium" | "high";
}

export interface PrivacyCheckResult {
  /** Whether transfer is compliant */
  compliant: boolean;
  /** Compliance check details */
  complianceCheck?: TransferComplianceCheck;
  /** Warning messages */
  warnings: string[];
  /** Error message if not compliant */
  error?: string;
}

export interface PrivateTransferState {
  /** Current state */
  status: "idle" | "checking" | "ready" | "transferring" | "success" | "error";
  /** Privacy check result */
  privacyCheck?: PrivacyCheckResult;
  /** Transfer result */
  transferResult?: PrivateTransferResult;
  /** Error message */
  error?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function usePrivateTransfer() {
  const [state, setState] = useState<PrivateTransferState>({ status: "idle" });
  const [isLoading, setIsLoading] = useState(false);

  // Get service instances
  const complianceService = getRangeComplianceService();
  const shadowWireService = getShadowWireService();

  /**
   * Check compliance before transfer
   */
  const checkTransferCompliance = useCallback(async (
    sourceAddress: string,
    destAddress: string,
    amountUsd: number
  ): Promise<PrivacyCheckResult> => {
    console.log("[PrivateTransfer] Checking compliance...");
    setIsLoading(true);
    setState({ status: "checking" });

    try {
      const complianceCheck = await complianceService.checkTransferCompliance(
        sourceAddress,
        destAddress,
        Math.round(amountUsd * 100)
      );

      const warnings: string[] = [];

      // Add warnings for elevated risk
      if (complianceCheck.riskLevel === "medium") {
        warnings.push("Destination address has medium risk score");
      }
      if (complianceCheck.riskLevel === "high") {
        warnings.push("Destination address has elevated risk score");
      }

      const result: PrivacyCheckResult = {
        compliant: complianceCheck.allowed,
        complianceCheck,
        warnings,
        error: complianceCheck.reason,
      };

      setState({
        status: complianceCheck.allowed ? "ready" : "error",
        privacyCheck: result,
        error: complianceCheck.reason,
      });

      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[PrivateTransfer] Compliance check failed:", error);
      const result: PrivacyCheckResult = {
        compliant: true, // Fail open for availability
        warnings: ["Compliance check unavailable - proceeding with caution"],
      };
      setState({ status: "ready", privacyCheck: result });
      setIsLoading(false);
      return result;
    }
  }, [complianceService]);

  /**
   * Execute a private transfer via ShadowWire
   */
  const executePrivateTransfer = useCallback(async (
    senderAddress: string,
    recipientStealthAddress: string,
    amount: number,
    tokenMint?: string
  ): Promise<PrivateTransferResult> => {
    console.log("[PrivateTransfer] Executing private transfer...");
    setIsLoading(true);
    setState({ status: "transferring" });

    try {
      const result = await shadowWireService.createPrivateTransfer({
        senderAddress,
        recipientStealthAddress,
        amount,
        tokenMint,
      });

      setState({
        status: result.success ? "success" : "error",
        transferResult: result,
        error: result.error,
      });

      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[PrivateTransfer] Transfer failed:", error);
      const result: PrivateTransferResult = {
        success: false,
        error: error instanceof Error ? error.message : "Transfer failed",
      };
      setState({ status: "error", transferResult: result, error: result.error });
      setIsLoading(false);
      return result;
    }
  }, [shadowWireService]);

  /**
   * Generate a stealth address for receiving private transfers
   */
  const generateStealthAddress = useCallback(async (
    recipientPubkey: string
  ): Promise<StealthAddress | null> => {
    console.log("[PrivateTransfer] Generating stealth address...");
    try {
      return await shadowWireService.generateStealthAddress(recipientPubkey);
    } catch (error) {
      console.error("[PrivateTransfer] Stealth address generation failed:", error);
      return null;
    }
  }, [shadowWireService]);

  /**
   * Generate a ZK-compressed stealth address using Light Protocol
   *
   * This method creates a stealth address with optional ZK proof attachment.
   * When ZK compression is available, it provides validity proofs for the address.
   */
  const generateZkCompressedStealthAddress = useCallback(async (
    recipientPubkey: string,
    payer?: string
  ): Promise<CompressedStealthAddress | StealthAddress | null> => {
    console.log("[PrivateTransfer] Generating ZK-compressed stealth address...");
    try {
      const payerPubkey = payer ? new PublicKey(payer) : undefined;
      const result = await shadowWireService.generateCompressedStealthAddress(
        recipientPubkey,
        payerPubkey
      );
      console.log("[PrivateTransfer] ZK stealth address generated:",
        'compressed' in result ? "(with ZK)" : "(standard)"
      );
      return result;
    } catch (error) {
      console.error("[PrivateTransfer] ZK stealth address generation failed:", error);
      // Fall back to regular stealth address
      return shadowWireService.generateStealthAddress(recipientPubkey);
    }
  }, [shadowWireService]);

  /**
   * Execute a ZK-compressed private transfer using Light Protocol
   *
   * This method uses Light Protocol's ZK compression for:
   * - Reduced rent costs (1000x)
   * - ZK validity proofs
   * - Compressed state storage
   */
  const executeZkPrivateTransfer = useCallback(async (
    senderAddress: string,
    recipientStealthAddress: string,
    amount: number,
    tokenMint?: string
  ): Promise<ZkPrivateTransferResult> => {
    console.log("[PrivateTransfer] Executing ZK-compressed private transfer...");
    setIsLoading(true);
    setState({ status: "transferring" });

    try {
      const payerPubkey = new PublicKey(senderAddress);
      const result = await shadowWireService.createZkPrivateTransfer(
        {
          senderAddress,
          recipientStealthAddress,
          amount,
          tokenMint,
        },
        payerPubkey
      );

      setState({
        status: result.success ? "success" : "error",
        transferResult: result,
        error: result.error,
      });

      setIsLoading(false);
      console.log("[PrivateTransfer] ZK transfer complete:",
        result.zkProof ? "(with ZK proof)" : "(standard)"
      );
      return result;
    } catch (error) {
      console.error("[PrivateTransfer] ZK transfer failed:", error);
      // Fall back to regular private transfer
      const fallbackResult = await executePrivateTransfer(
        senderAddress,
        recipientStealthAddress,
        amount,
        tokenMint
      );
      return fallbackResult;
    }
  }, [shadowWireService, executePrivateTransfer]);

  /**
   * Scan for incoming private transfers
   */
  const scanIncomingTransfers = useCallback(async (
    viewingKey: string,
    fromBlock?: number
  ) => {
    console.log("[PrivateTransfer] Scanning for incoming transfers...");
    try {
      return await shadowWireService.scanForTransfers(viewingKey, fromBlock);
    } catch (error) {
      console.error("[PrivateTransfer] Scan failed:", error);
      return { transfers: [], scannedToBlock: 0 };
    }
  }, [shadowWireService]);

  /**
   * Check if user has initialized compressed account for ZK transfers
   */
  const hasCompressedAccount = useCallback(async (
    ownerAddress: string
  ): Promise<boolean> => {
    try {
      const ownerPubkey = new PublicKey(ownerAddress);
      return await shadowWireService.hasCompressedAccount(ownerPubkey);
    } catch {
      return false;
    }
  }, [shadowWireService]);

  /**
   * Initialize compressed account for first-time ZK users
   *
   * This is called automatically on first ZK transfer, but can be
   * called manually to pre-initialize during onboarding.
   */
  const initializeZkAccount = useCallback(async (
    ownerAddress: string
  ) => {
    console.log("[PrivateTransfer] Initializing ZK account...");
    try {
      const ownerPubkey = new PublicKey(ownerAddress);
      return await shadowWireService.initializeCompressedAccount(ownerPubkey);
    } catch (error) {
      console.error("[PrivateTransfer] ZK account initialization failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Initialization failed",
      };
    }
  }, [shadowWireService]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ status: "idle" });
    setIsLoading(false);
  }, []);

  // Get ShadowWire status for ZK compression info
  const shadowWireStatus = shadowWireService.getStatus();

  return {
    // State
    state,
    isLoading,

    // Actions
    checkTransferCompliance,
    executePrivateTransfer,
    generateStealthAddress,
    scanIncomingTransfers,
    reset,

    // ZK-compressed actions (Light Protocol integration)
    generateZkCompressedStealthAddress,
    executeZkPrivateTransfer,
    hasCompressedAccount,
    initializeZkAccount,

    // Service availability
    isComplianceAvailable: complianceService.isConfigured(),
    isPrivateTransferAvailable: shadowWireService.isAvailable(),
    isZkCompressionAvailable: shadowWireStatus.zkCompressionEnabled,

    // Feature status
    shadowWireStatus,
  };
}

export default usePrivateTransfer;
