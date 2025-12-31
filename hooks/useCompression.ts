/**
 * DisCard 2035 - useCompression Hook
 *
 * React hook for managing ZK-compressed accounts on Solana
 * via Light Protocol.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  LightClient,
  getLightClient,
  initializeLightClient,
  type CardStateData,
  type DIDCommitmentData,
} from "@/lib/compression/light-client";
import {
  CompressedAccountManager,
  getCompressedAccountManager,
  type CreateCardAccountParams,
  type CreateDIDAccountParams,
} from "@/lib/compression/compressed-accounts";
import { PublicKey } from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export interface UseCompressionConfig {
  rpcEndpoint: string;
  compressionRpcEndpoint?: string;
}

export interface UseCompressionReturn {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Card operations
  cardStates: Map<string, CardStateData | null>;
  createCardAccount: (params: CreateCardAccountParams) => Promise<void>;
  getCardState: (cardId: string) => Promise<CardStateData | null>;
  updateCardBalance: (cardId: string, newBalance: bigint) => Promise<void>;
  freezeCard: (cardId: string) => Promise<void>;
  canTransact: (
    cardId: string,
    amount: bigint,
    merchantId?: string,
    mccCode?: number
  ) => Promise<{ allowed: boolean; reason?: string }>;

  // DID operations
  didCommitments: Map<string, DIDCommitmentData | null>;
  createDIDCommitment: (params: CreateDIDAccountParams) => Promise<void>;
  getDIDCommitment: (did: string) => Promise<DIDCommitmentData | null>;
  verifyDIDCommitment: (
    did: string,
    expectedHash: string
  ) => Promise<{ verified: boolean; onChainHash?: string }>;

  // Statistics
  stats: CompressionStats | null;
  refreshStats: () => Promise<void>;

  // Utilities
  estimateRentSavings: (accountCount: number) => RentSavingsEstimate;
}

export interface CompressionStats {
  totalAccounts: number;
  byType: Record<string, number>;
  syncedCount: number;
  pendingCount: number;
  errorCount: number;
  estimatedRentSavingsSOL: number;
}

export interface RentSavingsEstimate {
  standardRent: number;
  compressedRent: number;
  savings: number;
  savingsPercent: number;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCompression(
  userId: Id<"users"> | null,
  config: UseCompressionConfig
): UseCompressionReturn {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightClient, setLightClient] = useState<LightClient | null>(null);
  const [accountManager, setAccountManager] =
    useState<CompressedAccountManager | null>(null);

  // Local cache for card states
  const [cardStates, setCardStates] = useState<Map<string, CardStateData | null>>(
    new Map()
  );
  const [didCommitments, setDIDCommitments] = useState<
    Map<string, DIDCommitmentData | null>
  >(new Map());

  // Convex queries
  const userStats = useQuery(
    api.compression.light.getUserStats,
    userId ? { userId } : "skip"
  );

  const userAccounts = useQuery(
    api.compression.light.getAllByUser,
    userId ? { userId } : "skip"
  );

  // Convex mutations
  const createCardAccountMutation = useMutation(
    api.compression.light.createCardAccount
  );
  const createDIDAccountMutation = useMutation(
    api.compression.light.createDIDAccount
  );
  const updateCardBalanceMutation = useMutation(
    api.compression.light.updateCardBalance
  );
  const markPendingMutation = useMutation(
    api.compression.light.markPendingUpdate
  );
  const markErrorMutation = useMutation(api.compression.light.markError);
  const updateAfterSyncMutation = useMutation(
    api.compression.light.updateAfterSync
  );

  // Initialize Light Protocol client
  useEffect(() => {
    const init = async () => {
      try {
        const client = initializeLightClient({
          rpcEndpoint: config.rpcEndpoint,
          compressionRpcEndpoint: config.compressionRpcEndpoint,
        });
        await client.initialize();
        setLightClient(client);

        const manager = getCompressedAccountManager(client);
        setAccountManager(manager);

        setIsInitialized(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize compression"
        );
      }
    };

    init();
  }, [config.rpcEndpoint, config.compressionRpcEndpoint]);

  // ============================================================================
  // Card Operations
  // ============================================================================

  const createCardAccount = useCallback(
    async (params: CreateCardAccountParams) => {
      if (!accountManager || !userId) {
        throw new Error("Not initialized");
      }

      setIsLoading(true);
      setError(null);

      try {
        // Create on-chain compressed account
        const payer = new PublicKey("11111111111111111111111111111111"); // Placeholder
        const instructions = await accountManager.createCardAccount(payer, params);

        // For now, simulate success and store in Convex
        // In production, submit transaction and get actual merkle position
        const mockMerkleTree = "7Z36Efbt7a6oKsHyiUyBsLSJsGFXFfqU9pE6GqX3KXYZ";
        const mockLeafIndex = Math.floor(Math.random() * 1000000);
        const mockStateHash = `0x${Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join("")}`;

        // Note: cardId needs to be a Convex ID - this is a placeholder
        // In production, you'd create the card first and get its ID
        // await createCardAccountMutation({
        //   userId,
        //   cardId: params.cardId as Id<"cards">,
        //   merkleTreeAddress: mockMerkleTree,
        //   leafIndex: mockLeafIndex,
        //   stateHash: mockStateHash,
        //   initialBalance: Number(params.initialBalance),
        //   spendingLimit: Number(params.spendingLimit),
        //   dailyLimit: Number(params.dailyLimit),
        //   monthlyLimit: Number(params.monthlyLimit),
        // });

        // Update local cache
        const cardState: CardStateData = {
          cardId: params.cardId,
          ownerDid: params.ownerDid,
          ownerCommitment: params.ownerCommitment,
          balance: params.initialBalance,
          spendingLimit: params.spendingLimit,
          dailyLimit: params.dailyLimit,
          monthlyLimit: params.monthlyLimit,
          currentDailySpend: BigInt(0),
          currentMonthlySpend: BigInt(0),
          lastResetSlot: BigInt(0),
          isFrozen: false,
          merchantWhitelist: params.merchantWhitelist ?? [],
          mccWhitelist: params.mccWhitelist ?? [],
          createdAt: BigInt(Date.now()),
          updatedAt: BigInt(Date.now()),
        };

        setCardStates((prev) => new Map(prev).set(params.cardId, cardState));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create card account";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [accountManager, userId]
  );

  const getCardState = useCallback(
    async (cardId: string): Promise<CardStateData | null> => {
      // Check local cache first
      if (cardStates.has(cardId)) {
        return cardStates.get(cardId) ?? null;
      }

      if (!accountManager) {
        return null;
      }

      try {
        const state = await accountManager.getCardState(cardId);
        setCardStates((prev) => new Map(prev).set(cardId, state));
        return state;
      } catch {
        return null;
      }
    },
    [accountManager, cardStates]
  );

  const updateCardBalance = useCallback(
    async (cardId: string, newBalance: bigint) => {
      if (!accountManager || !userId) {
        throw new Error("Not initialized");
      }

      setIsLoading(true);
      setError(null);

      try {
        // In production, build and submit transaction
        // For now, update local state
        const currentState = cardStates.get(cardId);
        if (currentState) {
          const newState = {
            ...currentState,
            balance: newBalance,
            updatedAt: BigInt(Date.now()),
          };
          setCardStates((prev) => new Map(prev).set(cardId, newState));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update balance";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [accountManager, userId, cardStates]
  );

  const freezeCard = useCallback(
    async (cardId: string) => {
      if (!accountManager) {
        throw new Error("Not initialized");
      }

      setIsLoading(true);
      setError(null);

      try {
        const currentState = cardStates.get(cardId);
        if (currentState) {
          const newState = {
            ...currentState,
            isFrozen: true,
            updatedAt: BigInt(Date.now()),
          };
          setCardStates((prev) => new Map(prev).set(cardId, newState));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to freeze card";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [accountManager, cardStates]
  );

  const canTransact = useCallback(
    async (
      cardId: string,
      amount: bigint,
      merchantId?: string,
      mccCode?: number
    ): Promise<{ allowed: boolean; reason?: string }> => {
      if (!accountManager) {
        return { allowed: false, reason: "Not initialized" };
      }

      return accountManager.canProcessTransaction(
        cardId,
        amount,
        merchantId,
        mccCode
      );
    },
    [accountManager]
  );

  // ============================================================================
  // DID Operations
  // ============================================================================

  const createDIDCommitment = useCallback(
    async (params: CreateDIDAccountParams) => {
      if (!accountManager || !userId) {
        throw new Error("Not initialized");
      }

      setIsLoading(true);
      setError(null);

      try {
        const payer = new PublicKey("11111111111111111111111111111111");
        await accountManager.createDIDCommitment(payer, params);

        // Update local cache
        const commitment: DIDCommitmentData = {
          did: params.did,
          commitmentHash: params.commitmentHash,
          documentHash: params.documentHash,
          verificationMethodCount: params.verificationMethodCount,
          recoveryThreshold: params.recoveryThreshold,
          activeGuardiansCount: 0,
          status: "active",
          lastKeyRotationSlot: BigInt(0),
          createdAt: BigInt(Date.now()),
          updatedAt: BigInt(Date.now()),
        };

        setDIDCommitments((prev) => new Map(prev).set(params.did, commitment));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create DID commitment";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [accountManager, userId]
  );

  const getDIDCommitment = useCallback(
    async (did: string): Promise<DIDCommitmentData | null> => {
      if (didCommitments.has(did)) {
        return didCommitments.get(did) ?? null;
      }

      if (!accountManager) {
        return null;
      }

      try {
        const commitment = await accountManager.getDIDCommitment(did);
        setDIDCommitments((prev) => new Map(prev).set(did, commitment));
        return commitment;
      } catch {
        return null;
      }
    },
    [accountManager, didCommitments]
  );

  const verifyDIDCommitment = useCallback(
    async (
      did: string,
      expectedHash: string
    ): Promise<{ verified: boolean; onChainHash?: string }> => {
      if (!accountManager) {
        return { verified: false };
      }

      return accountManager.verifyDIDCommitment(did, expectedHash);
    },
    [accountManager]
  );

  // ============================================================================
  // Statistics
  // ============================================================================

  const stats: CompressionStats | null = useMemo(() => {
    if (!userStats) return null;
    return userStats;
  }, [userStats]);

  const refreshStats = useCallback(async () => {
    // Stats are automatically refreshed via Convex subscription
  }, []);

  const estimateRentSavings = useCallback(
    (accountCount: number): RentSavingsEstimate => {
      if (!accountManager) {
        return {
          standardRent: 0,
          compressedRent: 0,
          savings: 0,
          savingsPercent: 0,
        };
      }

      return accountManager.estimateRentSavings(accountCount, 200);
    },
    [accountManager]
  );

  return {
    // State
    isInitialized,
    isLoading,
    error,

    // Card operations
    cardStates,
    createCardAccount,
    getCardState,
    updateCardBalance,
    freezeCard,
    canTransact,

    // DID operations
    didCommitments,
    createDIDCommitment,
    getDIDCommitment,
    verifyDIDCommitment,

    // Statistics
    stats,
    refreshStats,

    // Utilities
    estimateRentSavings,
  };
}

export default useCompression;
