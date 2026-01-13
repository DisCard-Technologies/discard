/**
 * DisCard 2035 - usePrivateIdentity Hook
 *
 * React hook for privacy-preserving identity verification.
 * Manage encrypted credentials and generate ZK proofs for
 * selective disclosure without revealing underlying data.
 *
 * Features:
 * - Encrypted credential vault (only user can decrypt)
 * - ZK proof generation for claims (age, KYC, AML, etc.)
 * - Selective disclosure responses
 * - Privacy-preserving compliance for Range
 *
 * Example: User can prove they're over 21 without revealing
 * their birthdate, name, or any other identity information.
 */

import { useState, useCallback, useEffect } from "react";
import {
  getPrivateIdentityService,
  type StoredCredential,
  type ZkProof,
  type ZkProofType,
  type ZkProofRequest,
  type DisclosureRequest,
  type DisclosureResponse,
  type VerificationResult,
} from "@/services/privateIdentityClient";
import type { AttestationData } from "@/lib/attestations/sas-client";

// ============================================================================
// Types
// ============================================================================

export interface IdentityState {
  /** Current phase */
  phase:
    | "idle"
    | "initializing"
    | "ready"
    | "storing"
    | "proving"
    | "verifying"
    | "responding"
    | "failed";
  /** Whether vault is initialized */
  vaultInitialized: boolean;
  /** Active proof being generated */
  activeProof?: ZkProof;
  /** Error message */
  error?: string;
}

export interface ProofContext {
  /** What the proof is for */
  purpose: string;
  /** Who requested it */
  verifier?: string;
  /** When it was generated */
  generatedAt: number;
}

// ============================================================================
// Hook
// ============================================================================

export function usePrivateIdentity(userPrivateKey?: Uint8Array) {
  const [state, setState] = useState<IdentityState>({
    phase: "idle",
    vaultInitialized: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [recentProofs, setRecentProofs] = useState<Array<ZkProof & { context?: ProofContext }>>([]);

  const identityService = getPrivateIdentityService();

  // ==========================================================================
  // Vault Management
  // ==========================================================================

  /**
   * Initialize the encrypted vault
   */
  const initializeVault = useCallback(async (): Promise<boolean> => {
    if (!userPrivateKey) {
      setState({
        phase: "failed",
        vaultInitialized: false,
        error: "No private key provided",
      });
      return false;
    }

    console.log("[PrivateIdentity] Initializing vault...");
    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "initializing" }));

    try {
      const success = await identityService.initializeVault(userPrivateKey);

      if (success) {
        setState({
          phase: "ready",
          vaultInitialized: true,
        });

        // Load existing credentials
        const stored = identityService.getStoredCredentials();
        setCredentials(stored);
      } else {
        setState({
          phase: "failed",
          vaultInitialized: false,
          error: "Failed to initialize vault",
        });
      }

      setIsLoading(false);
      return success;
    } catch (error) {
      console.error("[PrivateIdentity] Vault init failed:", error);
      setState({
        phase: "failed",
        vaultInitialized: false,
        error: error instanceof Error ? error.message : "Vault initialization failed",
      });
      setIsLoading(false);
      return false;
    }
  }, [userPrivateKey, identityService]);

  // Initialize vault when private key is available
  useEffect(() => {
    if (userPrivateKey && !state.vaultInitialized) {
      initializeVault();
    }
  }, [userPrivateKey, state.vaultInitialized, initializeVault]);

  // ==========================================================================
  // Credential Management
  // ==========================================================================

  /**
   * Store a new credential in the encrypted vault
   */
  const storeCredential = useCallback(
    async (attestation: AttestationData): Promise<StoredCredential | null> => {
      if (!userPrivateKey) {
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: "Wallet not connected",
        }));
        return null;
      }

      console.log("[PrivateIdentity] Storing credential:", attestation.type);
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "storing" }));

      try {
        const credential = await identityService.storeCredential(
          attestation,
          userPrivateKey
        );

        if (credential) {
          setState((prev) => ({ ...prev, phase: "ready" }));
          setCredentials((prev) => [...prev, credential]);
        } else {
          setState((prev) => ({
            ...prev,
            phase: "failed",
            error: "Failed to store credential",
          }));
        }

        setIsLoading(false);
        return credential;
      } catch (error) {
        console.error("[PrivateIdentity] Store failed:", error);
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: error instanceof Error ? error.message : "Store failed",
        }));
        setIsLoading(false);
        return null;
      }
    },
    [userPrivateKey, identityService]
  );

  /**
   * Remove a credential from the vault
   */
  const removeCredential = useCallback(
    (credentialId: string): boolean => {
      const success = identityService.removeCredential(credentialId);
      if (success) {
        setCredentials((prev) => prev.filter((c) => c.id !== credentialId));
      }
      return success;
    },
    [identityService]
  );

  /**
   * Refresh credentials from vault
   */
  const refreshCredentials = useCallback(() => {
    const stored = identityService.getStoredCredentials();
    setCredentials(stored);
  }, [identityService]);

  // ==========================================================================
  // ZK Proof Generation
  // ==========================================================================

  /**
   * Generate a ZK proof for selective disclosure
   */
  const generateProof = useCallback(
    async (
      proofType: ZkProofType,
      credentialId: string,
      parameters: Record<string, unknown> = {},
      context?: { purpose: string; verifier?: string }
    ): Promise<ZkProof | null> => {
      if (!userPrivateKey) {
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: "Wallet not connected",
        }));
        return null;
      }

      console.log("[PrivateIdentity] Generating proof:", proofType);
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "proving" }));

      try {
        const request: ZkProofRequest = {
          proofType,
          credentialId,
          parameters,
          context: context?.verifier,
        };

        const proof = await identityService.generateProof(request, userPrivateKey);

        if (proof) {
          setState((prev) => ({
            ...prev,
            phase: "ready",
            activeProof: proof,
          }));

          // Add to recent proofs with context
          const proofWithContext = {
            ...proof,
            context: context
              ? {
                  purpose: context.purpose,
                  verifier: context.verifier,
                  generatedAt: Date.now(),
                }
              : undefined,
          };
          setRecentProofs((prev) => [proofWithContext, ...prev.slice(0, 9)]);
        } else {
          setState((prev) => ({
            ...prev,
            phase: "failed",
            error: "Failed to generate proof",
          }));
        }

        setIsLoading(false);
        return proof;
      } catch (error) {
        console.error("[PrivateIdentity] Proof generation failed:", error);
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: error instanceof Error ? error.message : "Proof generation failed",
        }));
        setIsLoading(false);
        return null;
      }
    },
    [userPrivateKey, identityService]
  );

  /**
   * Quick proof - find credential and generate proof in one call
   */
  const quickProof = useCallback(
    async (
      proofType: ZkProofType,
      parameters: Record<string, unknown> = {},
      context?: { purpose: string; verifier?: string }
    ): Promise<ZkProof | null> => {
      // Find a credential that can satisfy this proof type
      const credential = credentials.find((c) =>
        c.availableProofs.includes(proofType)
      );

      if (!credential) {
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: `No credential available for proof type: ${proofType}`,
        }));
        return null;
      }

      return generateProof(proofType, credential.id, parameters, context);
    },
    [credentials, generateProof]
  );

  // ==========================================================================
  // Proof Verification
  // ==========================================================================

  /**
   * Verify a ZK proof
   */
  const verifyProof = useCallback(
    async (proof: ZkProof): Promise<VerificationResult> => {
      console.log("[PrivateIdentity] Verifying proof:", proof.id);
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "verifying" }));

      try {
        const result = await identityService.verifyProof(proof);
        setState((prev) => ({ ...prev, phase: "ready" }));
        setIsLoading(false);
        return result;
      } catch (error) {
        console.error("[PrivateIdentity] Verification failed:", error);
        setState((prev) => ({ ...prev, phase: "ready" }));
        setIsLoading(false);
        return {
          valid: false,
          error: error instanceof Error ? error.message : "Verification failed",
        };
      }
    },
    [identityService]
  );

  // ==========================================================================
  // Selective Disclosure
  // ==========================================================================

  /**
   * Respond to a disclosure request from a verifier
   */
  const respondToDisclosure = useCallback(
    async (request: DisclosureRequest): Promise<DisclosureResponse | null> => {
      if (!userPrivateKey) {
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: "Wallet not connected",
        }));
        return null;
      }

      console.log("[PrivateIdentity] Responding to disclosure:", request.requestId);
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "responding" }));

      try {
        const response = await identityService.respondToDisclosureRequest(
          request,
          userPrivateKey
        );

        if (response) {
          setState((prev) => ({ ...prev, phase: "ready" }));

          // Add proofs to recent proofs
          const proofsWithContext = response.proofs.map((proof) => ({
            ...proof,
            context: {
              purpose: request.purpose,
              verifier: request.verifier.name,
              generatedAt: Date.now(),
            },
          }));
          setRecentProofs((prev) => [...proofsWithContext, ...prev.slice(0, 10 - proofsWithContext.length)]);
        } else {
          setState((prev) => ({
            ...prev,
            phase: "failed",
            error: "Failed to respond to disclosure request",
          }));
        }

        setIsLoading(false);
        return response;
      } catch (error) {
        console.error("[PrivateIdentity] Disclosure response failed:", error);
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: error instanceof Error ? error.message : "Disclosure response failed",
        }));
        setIsLoading(false);
        return null;
      }
    },
    [userPrivateKey, identityService]
  );

  // ==========================================================================
  // Compliance Integration
  // ==========================================================================

  /**
   * Generate compliance proofs for Range
   */
  const generateComplianceProofs = useCallback(
    async (requirements: {
      minKycLevel?: number;
      requireAmlCleared?: boolean;
      requireSanctionsCleared?: boolean;
      allowedCountries?: string[];
    }): Promise<{ proofs: ZkProof[]; complianceToken: string } | null> => {
      if (!userPrivateKey) {
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: "Wallet not connected",
        }));
        return null;
      }

      console.log("[PrivateIdentity] Generating compliance proofs");
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "proving" }));

      try {
        const result = await identityService.generateComplianceProof(
          requirements,
          userPrivateKey
        );

        setState((prev) => ({ ...prev, phase: "ready" }));
        setIsLoading(false);
        return result;
      } catch (error) {
        console.error("[PrivateIdentity] Compliance proof failed:", error);
        setState((prev) => ({
          ...prev,
          phase: "failed",
          error: error instanceof Error ? error.message : "Compliance proof failed",
        }));
        setIsLoading(false);
        return null;
      }
    },
    [userPrivateKey, identityService]
  );

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({
      phase: state.vaultInitialized ? "ready" : "idle",
      vaultInitialized: state.vaultInitialized,
    });
    setIsLoading(false);
  }, [state.vaultInitialized]);

  /**
   * Check if a proof type is available
   */
  const canProve = useCallback(
    (proofType: ZkProofType): boolean => {
      return credentials.some((c) => c.availableProofs.includes(proofType));
    },
    [credentials]
  );

  /**
   * Get credentials by proof type
   */
  const getCredentialsForProofType = useCallback(
    (proofType: ZkProofType): StoredCredential[] => {
      return credentials.filter((c) => c.availableProofs.includes(proofType));
    },
    [credentials]
  );

  /**
   * Get available proof types across all credentials
   */
  const availableProofTypes = credentials.reduce<ZkProofType[]>((acc, cred) => {
    for (const proofType of cred.availableProofs) {
      if (!acc.includes(proofType)) {
        acc.push(proofType);
      }
    }
    return acc;
  }, []);

  /**
   * Format proof type for display
   */
  const formatProofType = useCallback((proofType: ZkProofType): string => {
    const labels: Record<ZkProofType, string> = {
      age_minimum: "Age Verification",
      country_in_set: "Country Verification",
      kyc_level: "KYC Level",
      aml_cleared: "AML Clearance",
      sanctions_cleared: "Sanctions Check",
      accredited: "Accredited Investor",
      income_range: "Income Range",
      net_worth_range: "Net Worth Range",
      custom: "Custom Proof",
    };
    return labels[proofType] || proofType;
  }, []);

  /**
   * Get credential status color
   */
  const getCredentialStatusColor = useCallback((credential: StoredCredential): string => {
    if (credential.expiresAt && Date.now() > credential.expiresAt) {
      return "#EF4444"; // Red - expired
    }
    if (credential.expiresAt && Date.now() > credential.expiresAt - 7 * 24 * 60 * 60 * 1000) {
      return "#F59E0B"; // Amber - expiring soon
    }
    return "#10B981"; // Green - valid
  }, []);

  return {
    // State
    state,
    isLoading,
    credentials,
    recentProofs,
    availableProofTypes,

    // Vault Management
    initializeVault,
    storeCredential,
    removeCredential,
    refreshCredentials,

    // ZK Proofs
    generateProof,
    quickProof,
    verifyProof,

    // Selective Disclosure
    respondToDisclosure,

    // Compliance
    generateComplianceProofs,

    // Utilities
    reset,
    canProve,
    getCredentialsForProofType,
    formatProofType,
    getCredentialStatusColor,

    // Service status
    isAvailable: identityService.isAvailable(),
  };
}

export default usePrivateIdentity;
