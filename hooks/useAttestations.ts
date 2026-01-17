/**
 * DisCard 2035 - useAttestations Hook
 *
 * React hook for managing identity attestations including
 * Civic Gateway verification and SAS (Solana Attestation Service).
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  SASClient,
  getSASClient,
  initializeSASClient,
  type AttestationType,
  type AttestationData,
  type VerificationResult,
} from "@/lib/attestations/sas-client";
import {
  CivicClient,
  getCivicClient,
  initializeCivicClient,
  CIVIC_NETWORKS,
  type CivicGatekeeperNetwork,
  type CivicGatewayToken,
  type CivicVerificationResult,
} from "@/lib/attestations/civic";

// ============================================================================
// Types
// ============================================================================

export interface UseAttestationsConfig {
  rpcEndpoint: string;
  cluster?: "mainnet-beta" | "devnet" | "localnet";
}

export interface UseAttestationsReturn {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Attestations data
  attestations: AttestationData[];
  activeAttestations: AttestationData[];
  trustScore: TrustScore | null;

  // Civic verification
  civicTokens: CivicGatewayToken[];
  initiateCivicVerification: (
    network: CivicGatekeeperNetwork
  ) => Promise<{ verificationUrl: string; requestId: string }>;
  checkCivicStatus: (
    network: CivicGatekeeperNetwork
  ) => Promise<CivicVerificationResult>;
  syncCivicTokens: () => Promise<void>;

  // SAS operations
  verifyAttestation: (
    attestationId: string,
    expectedType: AttestationType
  ) => Promise<VerificationResult>;
  createAttestation: (params: CreateAttestationParams) => Promise<void>;
  revokeAttestation: (attestationId: string, reason: string) => Promise<void>;

  // Permission checks
  hasRequiredForAction: (action: ActionType) => RequirementCheck;
  getRequiredAttestations: (action: ActionType) => AttestationType[];
  meetsMinimumTier: (tier: TierType) => boolean;

  // Refresh
  refresh: () => Promise<void>;
}

export interface TrustScore {
  score: number;
  maxScore: number;
  percentage: number;
  level: "none" | "basic" | "standard" | "enhanced" | "full";
  breakdown: Record<AttestationType, number>;
  attestationCount: number;
}

export interface CreateAttestationParams {
  type: AttestationType;
  issuer: string;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface RequirementCheck {
  allowed: boolean;
  missing: AttestationType[];
  hasAll: boolean;
}

export type ActionType =
  | "card_creation"
  | "high_value_tx"
  | "international_tx"
  | "wire_transfer";

export type TierType = "basic" | "standard" | "premium" | "institutional";

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAttestations(
  userId: Id<"users"> | null,
  walletAddress: string | null,
  config: UseAttestationsConfig
): UseAttestationsReturn {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sasClient, setSasClient] = useState<SASClient | null>(null);
  const [civicClient, setCivicClient] = useState<CivicClient | null>(null);
  const [civicTokens, setCivicTokens] = useState<CivicGatewayToken[]>([]);

  // Convex queries - safely handle missing API endpoints
  const userAttestations = useQuery(
    api.attestations?.sas?.getByUser,
    userId ? { userId } : "skip"
  );

  const activeAttestationsData = useQuery(
    api.attestations?.sas?.getActiveByUser,
    userId ? { userId } : "skip"
  );

  const trustScoreData = useQuery(
    api.attestations?.sas?.getTrustScore,
    userId ? { userId } : "skip"
  );

  // Convex mutations
  const createAttestationMutation = useMutation(api.attestations?.sas?.create);
  const revokeAttestationMutation = useMutation(api.attestations?.sas?.revoke);
  const syncCivicTokenMutation = useMutation(
    api.attestations?.sas?.syncCivicToken
  );

  // Initialize clients
  useEffect(() => {
    const init = async () => {
      try {
        const sas = initializeSASClient({ rpcEndpoint: config.rpcEndpoint });
        setSasClient(sas);

        const civic = initializeCivicClient({
          rpcEndpoint: config.rpcEndpoint,
          cluster: config.cluster,
        });
        setCivicClient(civic);

        setIsInitialized(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize attestation clients"
        );
      }
    };

    init();
  }, [config.rpcEndpoint, config.cluster]);

  // Sync Civic tokens on wallet change
  useEffect(() => {
    if (civicClient && walletAddress) {
      civicClient.getAllGatewayTokens(walletAddress).then(setCivicTokens);
    }
  }, [civicClient, walletAddress]);

  // ==========================================================================
  // Computed values
  // ==========================================================================

  const attestations: AttestationData[] = useMemo(() => {
    if (!userAttestations) return [];
    return userAttestations.map((a) => ({
      id: a._id,
      type: a.attestationType as AttestationType,
      issuer: a.issuer as any,
      subjectDid: "", // Would come from DID document
      onChainAddress: a.sasAttestationAddress,
      status: a.status as any,
      issuedAt: a.issuedAt ?? a._creationTime,
      expiresAt: a.expiresAt,
      lastVerifiedAt: a.verifiedAt,
      metadata: a.metadata as Record<string, unknown>,
    }));
  }, [userAttestations]);

  const activeAttestations: AttestationData[] = useMemo(() => {
    if (!activeAttestationsData) return [];
    return activeAttestationsData.map((a) => ({
      id: a._id,
      type: a.attestationType as AttestationType,
      issuer: a.issuer as any,
      subjectDid: "",
      onChainAddress: a.sasAttestationAddress,
      status: a.status as any,
      issuedAt: a.issuedAt ?? a._creationTime,
      expiresAt: a.expiresAt,
      lastVerifiedAt: a.verifiedAt,
      metadata: a.metadata as Record<string, unknown>,
    }));
  }, [activeAttestationsData]);

  const trustScore: TrustScore | null = useMemo(() => {
    if (!trustScoreData) return null;
    return {
      score: trustScoreData.score,
      maxScore: trustScoreData.maxScore,
      percentage: trustScoreData.percentage,
      level: trustScoreData.level,
      breakdown: trustScoreData.breakdown as Record<AttestationType, number>,
      attestationCount: trustScoreData.attestationCount,
    };
  }, [trustScoreData]);

  // ==========================================================================
  // Civic Operations
  // ==========================================================================

  const initiateCivicVerification = useCallback(
    async (
      network: CivicGatekeeperNetwork
    ): Promise<{ verificationUrl: string; requestId: string }> => {
      if (!civicClient || !walletAddress) {
        throw new Error("Civic client not initialized or wallet not connected");
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await civicClient.initiateVerification({
          wallet: walletAddress,
          gatekeeperNetwork: network,
        });
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to initiate verification";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [civicClient, walletAddress]
  );

  const checkCivicStatus = useCallback(
    async (network: CivicGatekeeperNetwork): Promise<CivicVerificationResult> => {
      if (!civicClient || !walletAddress) {
        return { success: false, status: "not_requested", error: "Not initialized" };
      }

      return civicClient.checkVerificationStatus(walletAddress, network);
    },
    [civicClient, walletAddress]
  );

  const syncCivicTokens = useCallback(async () => {
    if (!civicClient || !walletAddress || !userId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tokens = await civicClient.getAllGatewayTokens(walletAddress);
      setCivicTokens(tokens);

      // Sync each token to Convex
      for (const token of tokens) {
        await syncCivicTokenMutation({
          userId,
          gatekeeperNetwork: token.gatekeeperNetwork,
          gatewayTokenAddress: token.gatewayTokenAddress,
          state: token.state as "active" | "expired" | "revoked" | "frozen",
          issuedAt: token.issuedAt,
          expiresAt: token.expiresAt,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync Civic tokens";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [civicClient, walletAddress, userId, syncCivicTokenMutation]);

  // ==========================================================================
  // SAS Operations
  // ==========================================================================

  const verifyAttestation = useCallback(
    async (
      attestationId: string,
      expectedType: AttestationType
    ): Promise<VerificationResult> => {
      if (!sasClient) {
        return { valid: false, reason: "SAS client not initialized" };
      }

      return sasClient.verifyAttestation({
        attestationId,
        expectedType,
        expectedSubject: "",
      });
    },
    [sasClient]
  );

  const createAttestation = useCallback(
    async (params: CreateAttestationParams) => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      setIsLoading(true);
      setError(null);

      try {
        await createAttestationMutation({
          userId,
          attestationType: params.type as any,
          issuer: params.issuer as any,
          expiresAt: params.expiresAt,
          metadata: params.metadata,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create attestation";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, createAttestationMutation]
  );

  const revokeAttestation = useCallback(
    async (attestationId: string, reason: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await revokeAttestationMutation({
          id: attestationId as Id<"attestations">,
          reason,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to revoke attestation";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [revokeAttestationMutation]
  );

  // ==========================================================================
  // Permission Checks
  // ==========================================================================

  const getRequiredAttestations = useCallback(
    (action: ActionType): AttestationType[] => {
      if (!sasClient) return [];
      return sasClient.getRequiredAttestations(action);
    },
    [sasClient]
  );

  const hasRequiredForAction = useCallback(
    (action: ActionType): RequirementCheck => {
      if (!sasClient) {
        return { allowed: false, missing: [], hasAll: false };
      }

      const result = sasClient.hasRequiredAttestations(activeAttestations, action);
      return {
        allowed: result.allowed,
        missing: result.missing,
        hasAll: result.allowed,
      };
    },
    [sasClient, activeAttestations]
  );

  const meetsMinimumTier = useCallback(
    (tier: TierType): boolean => {
      if (!trustScore) return false;

      const tierMinScores: Record<TierType, number> = {
        basic: 20,
        standard: 40,
        premium: 60,
        institutional: 80,
      };

      return trustScore.percentage >= tierMinScores[tier];
    },
    [trustScore]
  );

  // ==========================================================================
  // Refresh
  // ==========================================================================

  const refresh = useCallback(async () => {
    if (walletAddress && civicClient) {
      await syncCivicTokens();
    }
  }, [walletAddress, civicClient, syncCivicTokens]);

  return {
    // State
    isInitialized,
    isLoading,
    error,

    // Data
    attestations,
    activeAttestations,
    trustScore,

    // Civic
    civicTokens,
    initiateCivicVerification,
    checkCivicStatus,
    syncCivicTokens,

    // SAS
    verifyAttestation,
    createAttestation,
    revokeAttestation,

    // Permissions
    hasRequiredForAction,
    getRequiredAttestations,
    meetsMinimumTier,

    // Refresh
    refresh,
  };
}

export default useAttestations;
