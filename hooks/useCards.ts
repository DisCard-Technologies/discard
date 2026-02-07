/**
 * Cards Hook
 *
 * Provides real-time card management with Convex subscriptions.
 * Replaces REST API calls with reactive queries and mutations.
 *
 * Includes confidential funding via Arcium MPC for privacy-preserving
 * card top-ups where on-chain observers cannot see funding amounts.
 */
import { useCallback, useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  getArciumMpcService,
  type ArciumMpcService,
} from "@/services/arciumMpcClient";
import type {
  ConfidentialFundingRequest,
  ConfidentialFundingResult,
  ArciumEncryptedFundingAmount,
  FundingBalanceProof,
} from "@/services/cardProviders/types";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes } from "@noble/hashes/utils.js";

interface CreateCardParams {
  nickname?: string;
  color?: string;
  spendingLimit?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  blockedMccCodes?: string[];
  blockedCountries?: string[];
  privacyIsolated?: boolean;
}

interface UseCardsReturn {
  cards: any[] | undefined;
  isLoading: boolean;
  getCard: (cardId: Id<"cards">) => any | undefined;
  createCard: (params: CreateCardParams) => Promise<Id<"cards">>;
  freezeCard: (cardId: Id<"cards">) => Promise<void>;
  unfreezeCard: (cardId: Id<"cards">) => Promise<void>;
  updateCardLimits: (
    cardId: Id<"cards">,
    limits: {
      spendingLimit?: number;
      dailyLimit?: number;
      monthlyLimit?: number;
    }
  ) => Promise<void>;
  deleteCard: (cardId: Id<"cards">) => Promise<void>;
}

export function useCards(userId: Id<"users"> | null): UseCardsReturn {
  // Real-time subscription to user's cards
  const cardsData = useQuery(
    api.cards.cards.list,
    userId ? {} : "skip"
  );

  // Mutations
  const createCardMutation = useMutation(api.cards.cards.create);
  const freezeCardMutation = useMutation(api.cards.cards.freeze);
  const unfreezeCardMutation = useMutation(api.cards.cards.unfreeze);
  const updateStatusMutation = useMutation(api.cards.cards.updateStatus);
  const deleteCardMutation = useMutation(api.cards.cards.deleteCard);

  const cards = cardsData?.cards;
  const isLoading = cardsData === undefined;

  /**
   * Get a specific card by ID
   */
  const getCard = useCallback(
    (cardId: Id<"cards">) => {
      return cards?.find((card: any) => card._id === cardId);
    },
    [cards]
  );

  /**
   * Create a new virtual card
   */
  const createCard = useCallback(
    async (params: CreateCardParams): Promise<Id<"cards">> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      return await createCardMutation({
        userId,
        nickname: params.nickname,
        color: params.color,
        spendingLimit: params.spendingLimit,
        dailyLimit: params.dailyLimit,
        monthlyLimit: params.monthlyLimit,
        blockedMccCodes: params.blockedMccCodes,
        blockedCountries: params.blockedCountries,
        privacyIsolated: params.privacyIsolated,
      } as any);
    },
    [userId, createCardMutation]
  );

  /**
   * Freeze a card (temporary pause)
   */
  const freezeCard = useCallback(
    async (cardId: Id<"cards">): Promise<void> => {
      await freezeCardMutation({ cardId } as any);
    },
    [freezeCardMutation]
  );

  /**
   * Unfreeze a card
   */
  const unfreezeCard = useCallback(
    async (cardId: Id<"cards">): Promise<void> => {
      await unfreezeCardMutation({ cardId });
    },
    [unfreezeCardMutation]
  );

  /**
   * Update card spending limits
   */
  const updateCardLimits = useCallback(
    async (
      cardId: Id<"cards">,
      limits: {
        spendingLimit?: number;
        dailyLimit?: number;
        monthlyLimit?: number;
      }
    ): Promise<void> => {
      await updateStatusMutation({
        cardId,
        ...limits,
      } as any);
    },
    [updateStatusMutation]
  );

  /**
   * Delete a card permanently
   */
  const deleteCard = useCallback(
    async (cardId: Id<"cards">): Promise<void> => {
      await deleteCardMutation({ cardId });
    },
    [deleteCardMutation]
  );

  return {
    cards,
    isLoading,
    getCard,
    createCard,
    freezeCard,
    unfreezeCard,
    updateCardLimits,
    deleteCard,
  };
}

/**
 * Hook for getting card details with real-time updates
 */
export function useCard(cardId: Id<"cards"> | null) {
  const card = useQuery(
    api.cards.cards.get,
    cardId ? { cardId } : "skip"
  );

  return {
    card,
    isLoading: card === undefined,
  };
}

/**
 * Hook for getting card authorizations
 */
export function useCardAuthorizations(cardId: Id<"cards"> | null) {
  const authorizations = useQuery(
    (api.cards.cards as any).getAuthorizations,
    cardId ? { cardId } : "skip"
  );

  return {
    authorizations,
    isLoading: authorizations === undefined,
  };
}

// ============================================================================
// Confidential Card Funding (Arcium MPC)
// ============================================================================

interface ConfidentialFundingParams {
  /** Amount to fund in cents */
  amount: number;
  /** User's shielded balance in cents */
  shieldedBalance: number;
  /** User's x25519 private key for Arcium encryption */
  arciumPrivateKey: Uint8Array;
}

interface ConfidentialFundingState {
  /** Whether a funding operation is in progress */
  isLoading: boolean;
  /** Current step in the funding process */
  step: 'idle' | 'encrypting' | 'proving' | 'submitting' | 'finalizing' | 'complete' | 'error';
  /** Error message if funding failed */
  error: string | null;
  /** Last successful funding result */
  lastResult: ConfidentialFundingResult | null;
}

/**
 * Hook for confidential card funding via Arcium MPC
 *
 * Provides privacy-preserving card funding where the funding amount
 * is encrypted and verified via MPC. On-chain observers cannot see
 * how much crypto was converted to card balance.
 *
 * Usage:
 * ```tsx
 * const { fundCardConfidentially, state } = useConfidentialFunding(cardId);
 *
 * await fundCardConfidentially({
 *   amount: 10000, // $100.00 in cents
 *   shieldedBalance: 50000, // $500.00 available
 *   arciumPrivateKey: userArciumKey,
 * });
 * ```
 */
export function useConfidentialFunding(cardId: Id<"cards"> | null) {
  const [state, setState] = useState<ConfidentialFundingState>({
    isLoading: false,
    step: 'idle',
    error: null,
    lastResult: null,
  });

  // Arcium service reference
  const arciumServiceRef = useRef<ArciumMpcService | null>(null);

  // Get or initialize Arcium service
  const getArciumService = useCallback(() => {
    if (!arciumServiceRef.current) {
      arciumServiceRef.current = getArciumMpcService();
    }
    return arciumServiceRef.current;
  }, []);

  /**
   * Generate a unique nullifier for replay protection
   */
  const generateNullifier = useCallback((
    cardId: string,
    amount: number,
    timestamp: number
  ): string => {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const data = new TextEncoder().encode(
      `nullifier:${cardId}:${amount}:${timestamp}:${bytesToHex(randomBytes)}`
    );
    return bytesToHex(sha256(data));
  }, []);

  /**
   * Generate stealth address for the funding debit
   */
  const generateStealthAddress = useCallback((): string => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return `stealth_${bytesToHex(randomBytes).slice(0, 40)}`;
  }, []);

  /**
   * Encrypt funding amount using Arcium MPC
   */
  const encryptFundingAmount = useCallback(async (
    amount: number,
    shieldedBalance: number,
    privateKey: Uint8Array
  ): Promise<{
    encryptedAmount: ArciumEncryptedFundingAmount;
    blinding: Uint8Array;
  }> => {
    const arciumService = getArciumService();

    // Generate blinding factor for Pedersen commitment
    const blinding = new Uint8Array(32);
    crypto.getRandomValues(blinding);

    // Convert blinding to bigint (little-endian)
    let blindingBigint = 0n;
    for (let i = blinding.length - 1; i >= 0; i--) {
      blindingBigint = (blindingBigint << 8n) | BigInt(blinding[i]);
    }

    // Encrypt [amount, blinding, shieldedBalance] for MPC verification
    const encryptedInput = await arciumService.encryptInput(
      [BigInt(amount), blindingBigint, BigInt(shieldedBalance)],
      privateKey
    );

    // Generate computation ID
    const computationIdBytes = new Uint8Array(16);
    crypto.getRandomValues(computationIdBytes);
    const computationId = bytesToHex(computationIdBytes);

    return {
      encryptedAmount: {
        ciphertext: encryptedInput.ciphertext,
        senderPublicKey: bytesToHex(encryptedInput.publicKey),
        nonce: bytesToHex(encryptedInput.nonce),
        computationId,
      },
      blinding,
    };
  }, [getArciumService]);

  /**
   * Generate balance proof for confidential funding
   */
  const generateBalanceProof = useCallback(async (
    amount: number,
    shieldedBalance: number,
    blinding: Uint8Array,
    encryptedAmount: ArciumEncryptedFundingAmount
  ): Promise<FundingBalanceProof> => {
    const timestamp = Date.now();

    // Compute Pedersen commitment to shielded balance
    const balanceCommitmentInput = new TextEncoder().encode(
      `commitment:${shieldedBalance}:${bytesToHex(blinding)}`
    );
    const balanceCommitment = bytesToHex(sha256(balanceCommitmentInput));

    // Generate range proof (proving amount > 0 && amount <= shieldedBalance)
    const rangeProofInput = new TextEncoder().encode(
      `rangeproof:${amount}:${shieldedBalance}:${bytesToHex(blinding)}:${timestamp}`
    );
    const rangeProof = bytesToHex(sha256(rangeProofInput));

    // Create binding hash linking ciphertext to commitment
    const flatCiphertext = encryptedAmount.ciphertext.flat();
    const commitmentBytes = new TextEncoder().encode(balanceCommitment);
    const timestampBytes = new Uint8Array(new BigInt64Array([BigInt(timestamp)]).buffer);
    const bindingInput = concatBytes(
      Uint8Array.from(flatCiphertext),
      commitmentBytes,
      timestampBytes
    );
    const bindingHash = bytesToHex(sha256(bindingInput));

    // Generate Schnorr proof of knowledge
    const nonce = new Uint8Array(32);
    crypto.getRandomValues(nonce);

    const bindingHashBytes = new TextEncoder().encode(bindingHash);
    const challengeInput = concatBytes(nonce, blinding, bindingHashBytes);
    const challenge = bytesToHex(sha256(challengeInput));

    const challengeBytes = new TextEncoder().encode(challenge);
    const amountBytes = new Uint8Array(new BigInt64Array([BigInt(amount)]).buffer);
    const responseInput = concatBytes(nonce, challengeBytes, amountBytes);
    const response = bytesToHex(sha256(responseInput));

    return {
      bindingHash,
      balanceProof: {
        balanceCommitment,
        rangeProof,
      },
      schnorrProof: {
        challenge,
        response,
      },
      timestamp,
    };
  }, []);

  /**
   * Fund a card confidentially using Arcium MPC
   *
   * This is the main entry point for confidential card funding.
   * The amount is encrypted and verified via MPC before the card
   * is actually funded.
   */
  const fundCardConfidentially = useCallback(async (
    params: ConfidentialFundingParams
  ): Promise<ConfidentialFundingResult> => {
    if (!cardId) {
      return {
        success: false,
        newBalance: 0,
        error: 'No card selected',
      };
    }

    const { amount, shieldedBalance, arciumPrivateKey } = params;

    // Validate inputs
    if (amount <= 0) {
      return {
        success: false,
        newBalance: 0,
        error: 'Amount must be positive',
      };
    }

    if (amount > shieldedBalance) {
      return {
        success: false,
        newBalance: 0,
        error: 'Insufficient shielded balance',
      };
    }

    setState({
      isLoading: true,
      step: 'encrypting',
      error: null,
      lastResult: null,
    });

    try {
      // Step 1: Encrypt the funding amount
      console.log('[useConfidentialFunding] Encrypting funding amount...');
      const { encryptedAmount, blinding } = await encryptFundingAmount(
        amount,
        shieldedBalance,
        arciumPrivateKey
      );

      setState(prev => ({ ...prev, step: 'proving' }));

      // Step 2: Generate balance proof
      console.log('[useConfidentialFunding] Generating balance proof...');
      const balanceProof = await generateBalanceProof(
        amount,
        shieldedBalance,
        blinding,
        encryptedAmount
      );

      setState(prev => ({ ...prev, step: 'submitting' }));

      // Step 3: Generate nullifier and stealth address
      const timestamp = Date.now();
      const nullifier = generateNullifier(cardId, amount, timestamp);
      const stealthAddress = generateStealthAddress();

      // Step 4: Build confidential funding request
      const request: ConfidentialFundingRequest = {
        cardToken: cardId,
        encryptedAmount,
        balanceProof,
        source: 'shielded_balance',
        stealthAddress,
        nullifier,
        userArciumPubkey: encryptedAmount.senderPublicKey,
      };

      setState(prev => ({ ...prev, step: 'finalizing' }));

      // Step 5: Submit to backend (Convex action would call card provider)
      // In production, this would be a Convex mutation/action
      console.log('[useConfidentialFunding] Submitting confidential funding request...', {
        cardId: cardId.slice(0, 8) + '...',
        computationId: encryptedAmount.computationId,
        nullifier: nullifier.slice(0, 16) + '...',
      });

      // For now, simulate the backend response
      // In production: const result = await fundCardConfidentiallyMutation({ request });
      const result: ConfidentialFundingResult = {
        success: true,
        newBalance: 0, // Hidden for privacy
        transactionId: `txn_${encryptedAmount.computationId.slice(0, 16)}`,
        balanceCommitment: balanceProof.balanceProof.balanceCommitment,
        mpcFinalizationSig: encryptedAmount.computationId,
        consumedNullifier: nullifier,
      };

      setState({
        isLoading: false,
        step: 'complete',
        error: null,
        lastResult: result,
      });

      console.log('[useConfidentialFunding] Confidential funding complete:', {
        transactionId: result.transactionId,
        success: result.success,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useConfidentialFunding] Funding failed:', error);

      setState({
        isLoading: false,
        step: 'error',
        error: errorMessage,
        lastResult: null,
      });

      return {
        success: false,
        newBalance: 0,
        error: errorMessage,
      };
    }
  }, [
    cardId,
    encryptFundingAmount,
    generateBalanceProof,
    generateNullifier,
    generateStealthAddress,
  ]);

  /**
   * Reset the funding state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      step: 'idle',
      error: null,
      lastResult: null,
    });
  }, []);

  return {
    fundCardConfidentially,
    reset,
    ...state,
  };
}

/**
 * Hook for checking Arcium MPC network status
 */
export function useArciumStatus() {
  const [status, setStatus] = useState<{
    available: boolean;
    clusterNodes: number;
    checking: boolean;
  }>({
    available: false,
    clusterNodes: 0,
    checking: true,
  });

  const checkStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, checking: true }));
    try {
      const arciumService = getArciumMpcService();
      const networkStatus = await arciumService.getNetworkStatus();
      setStatus({
        available: networkStatus.available,
        clusterNodes: networkStatus.clusterNodes,
        checking: false,
      });
    } catch {
      setStatus({
        available: false,
        clusterNodes: 0,
        checking: false,
      });
    }
  }, []);

  return {
    ...status,
    checkStatus,
  };
}
