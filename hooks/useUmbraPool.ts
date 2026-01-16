/**
 * useUmbraPool Hook
 *
 * React hook for managing Umbra shielded pool operations
 * for privacy-preserving large transfers and cross-card movements.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getUmbraService, isUmbraConfigured } from '@/services/umbraClient';
import type { DepositNote, ShieldedTransferResult } from '@/services/umbraClient';
import { PublicKey } from '@solana/web3.js';

// ============ TYPES ============

export interface UseUmbraPoolOptions {
  /** Card ID for card-specific operations */
  cardId?: Id<"cards">;
}

export interface UseUmbraPoolResult {
  /** User's deposit notes */
  deposits: DepositRecord[];
  /** Available (unspent) notes */
  availableNotes: DepositRecord[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Whether Umbra is configured */
  isConfigured: boolean;
  /** Deposit to shielded pool */
  deposit: (amount: bigint, payerAddress: string) => Promise<DepositResult>;
  /** Withdraw from shielded pool */
  withdraw: (noteId: string, recipientAddress: string) => Promise<WithdrawResult>;
  /** Transfer between cards through pool */
  crossCardTransfer: (
    amount: bigint,
    sourceAddress: string,
    targetCardId: Id<"cards">
  ) => Promise<TransferResult>;
  /** Get estimated fee */
  estimateFee: (amount: bigint) => bigint;
  /** Current error */
  error: Error | null;
  /** Clear error */
  clearError: () => void;
}

export interface DepositRecord {
  _id: Id<"umbraTransfers">;
  noteId: string;
  commitment: string;
  nullifier: string;
  encryptedAmount: string;
  poolId: string;
  status: 'pending' | 'confirmed' | 'withdrawing' | 'withdrawn' | 'failed';
  type: 'deposit' | 'withdrawal';
  createdAt: number;
  confirmedAt?: number;
  txSignature?: string;
}

export interface DepositResult {
  success: boolean;
  noteId?: string;
  txSignature?: string;
  error?: string;
}

export interface WithdrawResult {
  success: boolean;
  txSignature?: string;
  error?: string;
}

export interface TransferResult {
  success: boolean;
  noteId?: string;
  txSignature?: string;
  error?: string;
}

// ============ HOOK ============

export function useUmbraPool(
  options: UseUmbraPoolOptions = {}
): UseUmbraPoolResult {
  const { cardId } = options;

  const [error, setError] = useState<Error | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if Umbra is configured
  const isConfigured = isUmbraConfigured();

  // Query user's deposits
  const deposits = useQuery(
    api.privacy.umbra.getUserDeposits,
    { limit: 100 }
  ) as DepositRecord[] | undefined;

  // Query available (unspent) notes
  const availableNotes = useQuery(
    api.privacy.umbra.getAvailableNotes,
    {}
  ) as DepositRecord[] | undefined;

  // Mutations and actions
  const recordDepositMutation = useMutation(api.privacy.umbra.recordDeposit);
  const confirmDepositMutation = useMutation(api.privacy.umbra.confirmDeposit);
  const recordWithdrawalMutation = useMutation(api.privacy.umbra.recordWithdrawal);
  const confirmWithdrawalMutation = useMutation(api.privacy.umbra.confirmWithdrawal);
  const initiateTransferMutation = useMutation(api.privacy.umbra.initiateCardTransfer);

  // Deposit to shielded pool
  const deposit = useCallback(async (
    amount: bigint,
    payerAddress: string
  ): Promise<DepositResult> => {
    if (!isConfigured) {
      return { success: false, error: 'Umbra service not configured' };
    }

    setIsProcessing(true);
    setError(null);

    try {
      const umbra = getUmbraService();
      const payer = new PublicKey(payerAddress);

      // Execute deposit on-chain
      const result = await umbra.deposit(amount, payer);

      if (!result.success || !result.depositNote) {
        return {
          success: false,
          error: result.error || 'Deposit failed',
        };
      }

      // Record in Convex
      await recordDepositMutation({
        cardId,
        noteId: result.depositNote.noteId,
        commitment: result.depositNote.commitment,
        nullifier: result.depositNote.nullifier,
        encryptedAmount: result.depositNote.encryptedAmount,
        poolId: result.depositNote.poolId,
      });

      // Confirm deposit
      if (result.txSignature) {
        await confirmDepositMutation({
          noteId: result.depositNote.noteId,
          txSignature: result.txSignature,
        });
      }

      return {
        success: true,
        noteId: result.depositNote.noteId,
        txSignature: result.txSignature,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Deposit failed');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsProcessing(false);
    }
  }, [cardId, isConfigured, recordDepositMutation, confirmDepositMutation]);

  // Withdraw from shielded pool
  const withdraw = useCallback(async (
    noteId: string,
    recipientAddress: string
  ): Promise<WithdrawResult> => {
    if (!isConfigured) {
      return { success: false, error: 'Umbra service not configured' };
    }

    setIsProcessing(true);
    setError(null);

    try {
      const umbra = getUmbraService();
      const recipient = new PublicKey(recipientAddress);

      // Record withdrawal request
      await recordWithdrawalMutation({
        noteId,
        targetCardId: cardId,
        recipientAddress,
      });

      // Execute withdrawal on-chain
      const result = await umbra.withdraw(noteId, recipient);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Withdrawal failed',
        };
      }

      // Confirm withdrawal
      if (result.txSignature) {
        await confirmWithdrawalMutation({
          noteId,
          txSignature: result.txSignature,
        });
      }

      return {
        success: true,
        txSignature: result.txSignature,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Withdrawal failed');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsProcessing(false);
    }
  }, [cardId, isConfigured, recordWithdrawalMutation, confirmWithdrawalMutation]);

  // Cross-card transfer through shielded pool
  const crossCardTransfer = useCallback(async (
    amount: bigint,
    sourceAddress: string,
    targetCardId: Id<"cards">
  ): Promise<TransferResult> => {
    if (!isConfigured) {
      return { success: false, error: 'Umbra service not configured' };
    }

    if (!cardId) {
      return { success: false, error: 'Source card ID not set' };
    }

    setIsProcessing(true);
    setError(null);

    try {
      const umbra = getUmbraService();
      const source = new PublicKey(sourceAddress);

      // Get target card address (would need to fetch from Convex in production)
      // For now, use a placeholder
      const target = new PublicKey(sourceAddress); // Placeholder

      // Execute shielded transfer
      const result = await umbra.shieldedCardTransfer(amount, source, target);

      if (!result.success || !result.depositNote) {
        return {
          success: false,
          error: result.error || 'Transfer failed',
        };
      }

      // Record as cross-card transfer
      await initiateTransferMutation({
        sourceCardId: cardId,
        targetCardId,
        noteId: result.depositNote.noteId,
        commitment: result.depositNote.commitment,
        nullifier: result.depositNote.nullifier,
        encryptedAmount: result.depositNote.encryptedAmount,
        poolId: result.depositNote.poolId,
      });

      return {
        success: true,
        noteId: result.depositNote.noteId,
        txSignature: result.txSignature,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Transfer failed');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsProcessing(false);
    }
  }, [cardId, isConfigured, initiateTransferMutation]);

  // Estimate fee for an amount
  const estimateFee = useCallback((amount: bigint): bigint => {
    const umbra = getUmbraService();
    return umbra.calculateFee(amount);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    deposits: deposits || [],
    availableNotes: availableNotes || [],
    isLoading: deposits === undefined || isProcessing,
    isConfigured,
    deposit,
    withdraw,
    crossCardTransfer,
    estimateFee,
    error,
    clearError,
  };
}

// ============ CONVENIENCE HOOKS ============

/**
 * Hook for large card funding through shielded pool
 */
export function useShieldedFunding(cardId: Id<"cards"> | undefined) {
  const pool = useUmbraPool({ cardId });

  const fundCard = useCallback(async (
    amount: bigint,
    payerAddress: string
  ): Promise<DepositResult> => {
    // For large amounts, use shielded pool
    const LARGE_AMOUNT_THRESHOLD = BigInt(10_000_000_000); // 10 SOL

    if (amount >= LARGE_AMOUNT_THRESHOLD) {
      console.log('[Umbra] Using shielded pool for large amount');
      return pool.deposit(amount, payerAddress);
    }

    // For smaller amounts, could use direct funding or Hush stealth addresses
    // This would integrate with the regular funding flow
    return pool.deposit(amount, payerAddress);
  }, [pool]);

  return {
    ...pool,
    fundCard,
  };
}

/**
 * Hook for cross-card private transfers
 */
export function useCrossCardTransfer(sourceCardId: Id<"cards"> | undefined) {
  const pool = useUmbraPool({ cardId: sourceCardId });

  const transfer = useCallback(async (
    amount: bigint,
    sourceAddress: string,
    targetCardId: Id<"cards">
  ): Promise<TransferResult> => {
    return pool.crossCardTransfer(amount, sourceAddress, targetCardId);
  }, [pool]);

  // Get available balance for transfer (sum of unspent notes)
  // In production, this would decrypt amounts - for now return count
  const availableForTransfer = useMemo(() => {
    return pool.availableNotes.length;
  }, [pool.availableNotes]);

  return {
    ...pool,
    transfer,
    availableForTransfer,
  };
}

/**
 * Hook for institutional/corporate card funding
 */
export function useInstitutionalFunding(cardId: Id<"cards"> | undefined) {
  const pool = useUmbraPool({ cardId });

  const institutionalDeposit = useCallback(async (
    amount: bigint,
    payerAddress: string,
    metadata?: {
      department?: string;
      costCenter?: string;
      approver?: string;
    }
  ): Promise<DepositResult> => {
    // Log metadata for compliance (encrypted in production)
    console.log('[Umbra] Institutional deposit:', { amount: amount.toString(), metadata });

    // Use shielded pool for privacy
    return pool.deposit(amount, payerAddress);
  }, [pool]);

  return {
    ...pool,
    institutionalDeposit,
  };
}
