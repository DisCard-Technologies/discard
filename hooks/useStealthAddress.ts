/**
 * useStealthAddress Hook
 *
 * React hook for generating and managing Hush-style stealth addresses
 * for privacy-preserving card funding.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getHushService, isHushConfigured } from '@/services/hushClient';
import type { StealthAddress } from '@/services/hushClient';

// ============ TYPES ============

export interface UseStealthAddressOptions {
  /** Card ID to generate addresses for */
  cardId?: Id<"cards">;
  /** Auto-generate addresses when pool is low */
  autoGenerate?: boolean;
  /** Minimum pool size before auto-generating */
  minPoolSize?: number;
}

export interface UseStealthAddressResult {
  /** Available stealth addresses for the card */
  addresses: StealthAddressRecord[];
  /** Next unused address */
  nextAddress: StealthAddressRecord | null;
  /** Number of unused addresses */
  unusedCount: number;
  /** Whether addresses are loading */
  isLoading: boolean;
  /** Whether Hush is configured */
  isConfigured: boolean;
  /** Generate a new stealth address */
  generateAddress: (purpose?: StealthAddress['purpose']) => Promise<GenerateResult>;
  /** Generate multiple addresses */
  generateBatch: (count: number, purpose?: StealthAddress['purpose']) => Promise<BatchGenerateResult>;
  /** Mark an address as used */
  markUsed: (address: string, txSignature?: string) => Promise<void>;
  /** Get next unused address (and optionally mark as used) */
  getNextAndUse: (purpose?: StealthAddress['purpose']) => Promise<StealthAddressRecord | null>;
  /** Current error */
  error: Error | null;
  /** Clear error */
  clearError: () => void;
}

export interface StealthAddressRecord {
  _id: Id<"stealthAddresses">;
  stealthAddress: string;
  ephemeralPubKey: string;
  purpose: 'card_funding' | 'merchant_payment' | 'p2p_transfer';
  used: boolean;
  usedAt?: number;
  createdAt: number;
}

export interface GenerateResult {
  success: boolean;
  address?: StealthAddressRecord;
  error?: string;
}

export interface BatchGenerateResult {
  success: boolean;
  count: number;
  error?: string;
}

// ============ HOOK ============

export function useStealthAddress(
  options: UseStealthAddressOptions = {}
): UseStealthAddressResult {
  const { cardId, autoGenerate = false, minPoolSize = 3 } = options;

  const [error, setError] = useState<Error | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Check if Hush is configured
  const isConfigured = isHushConfigured();

  // Query addresses for the card
  const addresses = useQuery(
    api.privacy.stealthAddresses.getCardAddresses,
    cardId ? { cardId, limit: 100 } : "skip"
  ) as StealthAddressRecord[] | undefined;

  // Query next unused address
  const nextAddress = useQuery(
    api.privacy.stealthAddresses.getNextUnused,
    cardId ? { cardId } : "skip"
  ) as StealthAddressRecord | null | undefined;

  // Query unused count
  const unusedCount = useQuery(
    api.privacy.stealthAddresses.getUnusedCount,
    cardId ? { cardId } : "skip"
  ) as number | undefined;

  // Mutations
  const recordAddressMutation = useMutation(api.privacy.stealthAddresses.recordStealthAddress);
  const recordBatchMutation = useMutation(api.privacy.stealthAddresses.recordBatch);
  const markUsedMutation = useMutation(api.privacy.stealthAddresses.markAddressUsed);

  // Generate a single stealth address
  const generateAddress = useCallback(async (
    purpose: StealthAddress['purpose'] = 'card_funding'
  ): Promise<GenerateResult> => {
    if (!cardId) {
      return { success: false, error: 'No card ID provided' };
    }

    if (!isConfigured) {
      return { success: false, error: 'Hush service not configured' };
    }

    setIsGenerating(true);
    setError(null);

    try {
      const hush = getHushService();

      // Get user's public key (would come from wallet context in production)
      // For now, generate a placeholder - in production this would use the connected wallet
      const userPubKey = await getUserPublicKey();

      if (!userPubKey) {
        return { success: false, error: 'User public key not available' };
      }

      // Generate stealth address
      const stealth = await hush.generateStealthAddress(userPubKey, purpose);

      // Record in database
      const result = await recordAddressMutation({
        cardId,
        stealthAddress: stealth.address,
        ephemeralPubKey: stealth.ephemeralPubKey,
        purpose,
      });

      return {
        success: true,
        address: {
          _id: result.addressId,
          stealthAddress: stealth.address,
          ephemeralPubKey: stealth.ephemeralPubKey,
          purpose,
          used: false,
          createdAt: Date.now(),
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate address');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsGenerating(false);
    }
  }, [cardId, isConfigured, recordAddressMutation]);

  // Generate multiple addresses
  const generateBatch = useCallback(async (
    count: number,
    purpose: StealthAddress['purpose'] = 'card_funding'
  ): Promise<BatchGenerateResult> => {
    if (!cardId) {
      return { success: false, count: 0, error: 'No card ID provided' };
    }

    if (!isConfigured) {
      return { success: false, count: 0, error: 'Hush service not configured' };
    }

    setIsGenerating(true);
    setError(null);

    try {
      const hush = getHushService();
      const userPubKey = await getUserPublicKey();

      if (!userPubKey) {
        return { success: false, count: 0, error: 'User public key not available' };
      }

      // Generate batch of addresses
      const stealthAddresses = await hush.generateBatch(userPubKey, count, purpose);

      // Record batch in database
      const result = await recordBatchMutation({
        cardId,
        addresses: stealthAddresses.map(s => ({
          stealthAddress: s.address,
          ephemeralPubKey: s.ephemeralPubKey,
        })),
        purpose,
      });

      return {
        success: true,
        count: result.count,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate batch');
      setError(error);
      return { success: false, count: 0, error: error.message };
    } finally {
      setIsGenerating(false);
    }
  }, [cardId, isConfigured, recordBatchMutation]);

  // Mark address as used
  const markUsed = useCallback(async (
    address: string,
    txSignature?: string
  ): Promise<void> => {
    try {
      await markUsedMutation({
        stealthAddress: address,
        txSignature,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to mark address as used');
      setError(error);
      throw error;
    }
  }, [markUsedMutation]);

  // Get next unused address and optionally mark as used
  const getNextAndUse = useCallback(async (
    purpose?: StealthAddress['purpose']
  ): Promise<StealthAddressRecord | null> => {
    if (!nextAddress) {
      // Try to generate a new one if pool is empty
      const result = await generateAddress(purpose || 'card_funding');
      if (result.success && result.address) {
        await markUsed(result.address.stealthAddress);
        return { ...result.address, used: true, usedAt: Date.now() };
      }
      return null;
    }

    // Mark current next as used
    await markUsed(nextAddress.stealthAddress);
    return { ...nextAddress, used: true, usedAt: Date.now() };
  }, [nextAddress, generateAddress, markUsed]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-generate when pool is low
  // Note: In production, this would be more sophisticated
  // For now, it's a simple check on mount

  return {
    addresses: addresses || [],
    nextAddress: nextAddress || null,
    unusedCount: unusedCount || 0,
    isLoading: addresses === undefined || isGenerating,
    isConfigured,
    generateAddress,
    generateBatch,
    markUsed,
    getNextAndUse,
    error,
    clearError,
  };
}

// ============ HELPERS ============

/**
 * Get user's public key for stealth address generation
 * In production, this would come from the connected wallet
 */
async function getUserPublicKey(): Promise<string | null> {
  // This is a placeholder - in production:
  // 1. Check if wallet is connected
  // 2. Return wallet's public key
  // 3. Or use a derived key from user's master key

  // For development, return null (caller should handle)
  // The actual implementation would integrate with @solana/wallet-adapter-react
  if (typeof window !== 'undefined') {
    // Check for Phantom or other wallet
    const solana = (window as any).solana;
    if (solana?.publicKey) {
      return solana.publicKey.toString();
    }
  }

  return null;
}

// ============ CONVENIENCE HOOKS ============

/**
 * Hook for card funding with stealth addresses
 */
export function useStealthFunding(cardId: Id<"cards"> | undefined) {
  const stealth = useStealthAddress({ cardId, autoGenerate: true, minPoolSize: 5 });

  const getFundingAddress = useCallback(async (): Promise<{
    address: string;
    ephemeralPubKey: string;
  } | null> => {
    const next = await stealth.getNextAndUse('card_funding');
    if (next) {
      return {
        address: next.stealthAddress,
        ephemeralPubKey: next.ephemeralPubKey,
      };
    }
    return null;
  }, [stealth]);

  return {
    ...stealth,
    getFundingAddress,
  };
}

/**
 * Hook for checking if stealth address belongs to user
 * Used when scanning for incoming funds
 */
export function useStealthScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const scanAddress = useCallback(async (
    stealthAddress: string,
    ephemeralPubKey: string,
    userPrivateKey: Uint8Array
  ): Promise<boolean> => {
    setIsScanning(true);
    setError(null);

    try {
      const hush = getHushService();
      return await hush.isOwnAddress(stealthAddress, userPrivateKey, ephemeralPubKey);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Scan failed');
      setError(error);
      return false;
    } finally {
      setIsScanning(false);
    }
  }, []);

  return {
    scanAddress,
    isScanning,
    error,
  };
}
