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

import { useState, useCallback, useRef } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { getRangeComplianceService, type TransferComplianceCheck } from "@/services/rangeComplianceClient";
import {
  getPhalaComplianceClient,
  type PrivateComplianceResult,
} from "@/services/phalaComplianceClient";
import {
  getShadowWireService,
  type PrivateTransferResult,
  type StealthAddress,
  type CompressedStealthAddress,
  type ZkPrivateTransferResult,
} from "@/services/shadowWireClient";
import {
  type PrivateComplianceProof,
  createPrivateComplianceProof,
} from "@/lib/compliance/private-compliance-proof";

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

export interface TeePrivacyCheckResult {
  /** Whether transfer is compliant */
  compliant: boolean;
  /** TEE compliance result with attestation */
  teeResult?: PrivateComplianceResult;
  /** Private compliance proof (can be verified independently) */
  proof?: PrivateComplianceProof;
  /** Warning messages */
  warnings: string[];
  /** Error message if check failed */
  error?: string;
  /** Whether TEE was actually used (vs fallback) */
  usedTee: boolean;
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

  // Get service instances - use useRef to maintain stable references
  const complianceServiceRef = useRef(getRangeComplianceService());
  const phalaComplianceRef = useRef(getPhalaComplianceClient());
  const shadowWireServiceRef = useRef(getShadowWireService());

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
      const complianceCheck = await complianceServiceRef.current.checkTransferCompliance(
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
        compliant: false,
        warnings: [],
        error: "Compliance check unavailable — transfer blocked for safety. Please try again.",
      };
      setState({ status: "error", privacyCheck: result, error: result.error });
      setIsLoading(false);
      return result;
    }
  }, []);

  /**
   * Check compliance privately via Phala TEE
   *
   * This performs sanctions/compliance checks inside a trusted enclave where:
   * - Address is encrypted before transmission
   * - Range API sees the address but can't link it to the user (no IP/session)
   * - RA-TLS attestation proves unmodified enclave code
   * - Result includes a proof that can be verified independently
   *
   * @param address - Address to check (source or destination)
   * @param chain - Blockchain (solana or ethereum)
   * @returns TEE privacy check result with attestation proof
   */
  const checkPrivateCompliance = useCallback(async (
    address: string,
    chain: "solana" | "ethereum" = "solana"
  ): Promise<TeePrivacyCheckResult> => {
    console.log("[PrivateTransfer] Checking compliance via TEE...");
    setIsLoading(true);
    setState({ status: "checking" });

    try {
      // Check if TEE is available
      const teeAvailable = await phalaComplianceRef.current.isAvailable();

      if (!teeAvailable) {
        console.warn("[PrivateTransfer] TEE unavailable - cannot perform private check");
        const result: TeePrivacyCheckResult = {
          compliant: false,
          warnings: [],
          error: "TEE enclave unavailable for private compliance check",
          usedTee: false,
        };
        setState({ status: "error", error: result.error });
        setIsLoading(false);
        return result;
      }

      // Perform private sanctions check via TEE
      const teeResult = await phalaComplianceRef.current.checkPrivateSanctions({
        address,
        chain,
      });

      // Create proof from TEE result
      const proof = createPrivateComplianceProof(
        teeResult.attestation,
        address,
        {
          compliant: teeResult.compliant,
          riskLevel: teeResult.riskLevel,
        }
      );

      const warnings: string[] = [];

      // Add warnings for elevated risk
      if (teeResult.riskLevel === "medium") {
        warnings.push("Address has medium risk score (TEE verified)");
      }
      if (teeResult.riskLevel === "high") {
        warnings.push("Address has elevated risk score (TEE verified)");
      }

      const result: TeePrivacyCheckResult = {
        compliant: teeResult.compliant,
        teeResult,
        proof,
        warnings,
        usedTee: true,
      };

      setState({
        status: teeResult.compliant ? "ready" : "error",
        privacyCheck: {
          compliant: teeResult.compliant,
          warnings,
          error: teeResult.compliant ? undefined : "Address failed TEE compliance check",
        },
      });

      console.log("[PrivateTransfer] TEE compliance check complete:", {
        compliant: teeResult.compliant,
        riskLevel: teeResult.riskLevel,
        mrEnclave: teeResult.attestation.mrEnclave.slice(0, 16) + "...",
      });

      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[PrivateTransfer] TEE compliance check failed:", error);
      const result: TeePrivacyCheckResult = {
        compliant: false,
        warnings: ["TEE compliance check failed"],
        error: error instanceof Error ? error.message : "TEE check failed",
        usedTee: false,
      };
      setState({ status: "error", error: result.error });
      setIsLoading(false);
      return result;
    }
  }, []);

  /**
   * Execute a private transfer via ShadowWire
   *
   * @param senderAddress - Sender's wallet address
   * @param recipientStealthAddress - Recipient's stealth address
   * @param amount - Amount in lamports
   * @param tokenMint - Optional token mint (native SOL if not specified)
   * @param signer - Optional signer keypair for REAL transaction submission
   * @param useRelay - Use relay pool for sender privacy (User → Pool → Stealth)
   * @param relayAction - Convex action to trigger relay (required if useRelay=true)
   */
  const executePrivateTransfer = useCallback(async (
    senderAddress: string,
    recipientStealthAddress: string,
    amount: number,
    tokenMint?: string,
    signer?: Keypair,
    useRelay?: boolean,
    relayAction?: (args: {
      stealthAddress: string;
      amountLamports: number;
      depositTxSignature: string;
    }) => Promise<{ success: boolean; relaySignature?: string; error?: string }>
  ): Promise<PrivateTransferResult> => {
    console.log("[PrivateTransfer] Executing private transfer...", {
      hasRealSigner: !!signer,
      useRelay,
      amount,
    });
    setIsLoading(true);
    setState({ status: "transferring" });

    try {
      const result = await shadowWireServiceRef.current.createPrivateTransfer({
        senderAddress,
        recipientStealthAddress,
        amount,
        tokenMint,
        signer,
        useRelay,
        relayAction,
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
  }, []);

  /**
   * Generate a stealth address for receiving private transfers
   */
  const generateStealthAddress = useCallback(async (
    recipientPubkey: string
  ): Promise<StealthAddress | null> => {
    console.log("[PrivateTransfer] Generating stealth address...");
    try {
      return await shadowWireServiceRef.current.generateStealthAddress(recipientPubkey);
    } catch (error) {
      console.error("[PrivateTransfer] Stealth address generation failed:", error);
      return null;
    }
  }, []);

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
      const result = await shadowWireServiceRef.current.generateCompressedStealthAddress(
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
      return shadowWireServiceRef.current.generateStealthAddress(recipientPubkey);
    }
  }, []);

  /**
   * Execute a ZK-compressed private transfer using Light Protocol
   *
   * This method uses Light Protocol's ZK compression for:
   * - Reduced rent costs (1000x)
   * - ZK validity proofs
   * - Compressed state storage
   *
   * @param senderAddress - Sender's wallet address
   * @param recipientStealthAddress - Recipient's stealth address
   * @param amount - Amount in lamports
   * @param tokenMint - Optional token mint
   * @param signer - Optional signer keypair for REAL transaction submission
   * @param useRelay - Use relay pool for sender privacy
   * @param relayAction - Convex action to trigger relay
   */
  const executeZkPrivateTransfer = useCallback(async (
    senderAddress: string,
    recipientStealthAddress: string,
    amount: number,
    tokenMint?: string,
    signer?: Keypair,
    useRelay?: boolean,
    relayAction?: (args: {
      stealthAddress: string;
      amountLamports: number;
      depositTxSignature: string;
    }) => Promise<{ success: boolean; relaySignature?: string; error?: string }>
  ): Promise<ZkPrivateTransferResult> => {
    console.log("[PrivateTransfer] Executing ZK-compressed private transfer...", {
      hasRealSigner: !!signer,
      useRelay,
      amount,
    });
    setIsLoading(true);
    setState({ status: "transferring" });

    try {
      const payerPubkey = new PublicKey(senderAddress);
      const result = await shadowWireServiceRef.current.createZkPrivateTransfer(
        {
          senderAddress,
          recipientStealthAddress,
          amount,
          tokenMint,
          signer,
          useRelay,
          relayAction,
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
      // Fall back to regular private transfer (with signer for real tx)
      const fallbackResult = await executePrivateTransfer(
        senderAddress,
        recipientStealthAddress,
        amount,
        tokenMint,
        signer,
        useRelay,
        relayAction
      );
      return fallbackResult;
    }
  }, [executePrivateTransfer]);

  /**
   * Scan for incoming private transfers
   */
  const scanIncomingTransfers = useCallback(async (
    viewingKey: string,
    fromBlock?: number
  ) => {
    console.log("[PrivateTransfer] Scanning for incoming transfers...");
    try {
      return await shadowWireServiceRef.current.scanForTransfers(viewingKey, fromBlock);
    } catch (error) {
      console.error("[PrivateTransfer] Scan failed:", error);
      return { transfers: [], scannedToBlock: 0 };
    }
  }, []);

  /**
   * Check if user has initialized compressed account for ZK transfers
   */
  const hasCompressedAccount = useCallback(async (
    ownerAddress: string
  ): Promise<boolean> => {
    try {
      const ownerPubkey = new PublicKey(ownerAddress);
      return await shadowWireServiceRef.current.hasCompressedAccount(ownerPubkey);
    } catch {
      return false;
    }
  }, []);

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
      return await shadowWireServiceRef.current.initializeCompressedAccount(ownerPubkey);
    } catch (error) {
      console.error("[PrivateTransfer] ZK account initialization failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Initialization failed",
      };
    }
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ status: "idle" });
    setIsLoading(false);
  }, []);

  // Get ShadowWire status for ZK compression info
  const shadowWireStatus = shadowWireServiceRef.current.getStatus();

  // Check TEE availability (memoized to avoid repeated async calls)
  const [isTeeAvailable, setIsTeeAvailable] = useState<boolean | null>(null);

  // Check TEE availability on mount
  const checkTeeAvailability = useCallback(async () => {
    try {
      const available = await phalaComplianceRef.current.isAvailable();
      setIsTeeAvailable(available);
    } catch {
      setIsTeeAvailable(false);
    }
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

    // ZK-compressed actions (Light Protocol integration)
    generateZkCompressedStealthAddress,
    executeZkPrivateTransfer,
    hasCompressedAccount,
    initializeZkAccount,

    // TEE-based private compliance (Phala SGX)
    checkPrivateCompliance,
    checkTeeAvailability,

    // Service availability
    isComplianceAvailable: complianceServiceRef.current.isConfigured(),
    isPrivateTransferAvailable: shadowWireServiceRef.current.isAvailable(),
    isZkCompressionAvailable: shadowWireStatus.zkCompressionEnabled,
    isRelayAvailable: shadowWireServiceRef.current.isRelayAvailable(),
    isTeeComplianceAvailable: isTeeAvailable,

    // Relay pool info
    relayPoolAddress: shadowWireServiceRef.current.getRelayPoolAddress(),

    // Feature status
    shadowWireStatus,
  };
}

export default usePrivateTransfer;
