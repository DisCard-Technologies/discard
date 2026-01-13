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
import { getRangeComplianceService, type TransferComplianceCheck } from "@/services/rangeComplianceClient";
import { getShadowWireService, type PrivateTransferResult, type StealthAddress } from "@/services/shadowWireClient";

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
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ status: "idle" });
    setIsLoading(false);
  }, []);

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

    // Service availability
    isComplianceAvailable: complianceService.isConfigured(),
    isPrivateTransferAvailable: shadowWireService.isAvailable(),
  };
}

export default usePrivateTransfer;
