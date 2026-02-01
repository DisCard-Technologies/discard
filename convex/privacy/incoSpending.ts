/**
 * Inco Lightning Spending Check - Convex Actions
 *
 * STATUS: BETA - Disabled by default. Set INCO_ENABLED=true when Inco mainnet is ready.
 * PRIMARY PATH: Noir ZK proofs via zkProofs.ts (production-ready)
 *
 * TEE-based confidential compute for realtime spending limit verification.
 * Provides ~50ms latency vs 1-5s for ZK proof generation, critical for
 * meeting the 800ms Marqeta authorization deadline.
 *
 * Key Features (when enabled):
 * - Encrypted balance handles (Euint128)
 * - TEE-based comparison via Inco Lightning network
 * - Fallback to Noir when Inco unavailable
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// ============ CONSTANTS ============

/**
 * Inco Lightning Solana Devnet program ID
 */
const INCO_PROGRAM_ID = "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj";

/**
 * Target response time (50ms)
 */
const TARGET_RESPONSE_TIME_MS = 50;

/**
 * Maximum response time before warning (100ms)
 */
const MAX_RESPONSE_TIME_MS = 100;

/**
 * Epoch duration (1 hour in milliseconds)
 */
const EPOCH_DURATION_MS = 60 * 60 * 1000;

// ============ SPENDING CHECK ============

/**
 * Check spending limit via Inco Lightning TEE
 *
 * This is the critical path for Marqeta authorization.
 * Must respond within 800ms total (budget: 100ms for this check).
 */
export const checkSpendingLimit = internalAction({
  args: {
    cardId: v.id("cards"),
    encryptedBalance: v.string(),    // Encrypted handle hex
    incoPublicKey: v.string(),       // Public key for verification
    incoEpoch: v.number(),           // Handle validity epoch
    amount: v.number(),              // Spending amount (cents)
  },
  handler: async (ctx, args): Promise<{
    allowed: boolean;
    responseTimeMs: number;
    error?: string;
    attestation?: {
      quote: string;
      timestamp: number;
      verified: boolean;
    };
  }> => {
    const startTime = Date.now();

    try {
      console.log(`[Inco] Checking spending limit for card ${args.cardId}, amount: ${args.amount}`);

      // Validate epoch freshness
      const currentEpoch = Math.floor(Date.now() / EPOCH_DURATION_MS);
      if (args.incoEpoch < currentEpoch - 1) {
        return {
          allowed: false,
          responseTimeMs: Date.now() - startTime,
          error: "Inco handle epoch expired",
        };
      }

      // In production, this would:
      // 1. Build Solana transaction with CPI to Inco program
      // 2. Submit to Inco TEE network
      // 3. Receive e_ge(encrypted_balance, amount) result
      // 4. Verify TEE attestation

      // For development, simulate the TEE check
      const result = await simulateTeeSpendingCheck(
        args.encryptedBalance,
        args.amount
      );

      const responseTime = Date.now() - startTime;

      // Log performance
      if (responseTime > MAX_RESPONSE_TIME_MS) {
        console.warn(`[Inco] Spending check slow: ${responseTime}ms (target: ${TARGET_RESPONSE_TIME_MS}ms)`);
      } else {
        console.log(`[Inco] Spending check completed in ${responseTime}ms`);
      }

      return {
        allowed: result.allowed,
        responseTimeMs: responseTime,
        attestation: result.attestation,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`[Inco] Spending check failed:`, error);

      return {
        allowed: false,
        responseTimeMs: responseTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Update encrypted balance after approved spending
 */
export const updateBalance = internalAction({
  args: {
    cardId: v.id("cards"),
    encryptedBalance: v.string(),    // Current handle
    incoPublicKey: v.string(),
    spentAmount: v.number(),         // Amount spent (cents)
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    newHandle?: string;
    newEpoch?: number;
    error?: string;
  }> => {
    try {
      console.log(`[Inco] Updating balance for card ${args.cardId}, spent: ${args.spentAmount}`);

      // In production, this would:
      // 1. Build Solana transaction with CPI to Inco program
      // 2. Perform e_sub(encrypted_balance, amount)
      // 3. Store new encrypted handle

      // For development, simulate balance update
      const newEpoch = Math.floor(Date.now() / EPOCH_DURATION_MS);

      // Update card record with new handle
      await ctx.runMutation(internal.privacy.incoSpending.updateCardIncoHandle, {
        cardId: args.cardId,
        encryptedBalanceHandle: args.encryptedBalance, // Would be updated in production
        incoEpoch: newEpoch,
      });

      return {
        success: true,
        newHandle: args.encryptedBalance, // In production, this would be the new handle
        newEpoch,
      };
    } catch (error) {
      console.error(`[Inco] Balance update failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Initialize Inco for a new card
 */
export const initializeForCard = internalAction({
  args: {
    cardId: v.id("cards"),
    initialBalance: v.number(),      // Initial balance (cents)
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    encryptedHandle?: string;
    incoPublicKey?: string;
    incoEpoch?: number;
    error?: string;
  }> => {
    try {
      console.log(`[Inco] Initializing for card ${args.cardId}, balance: ${args.initialBalance}`);

      // Get card to derive Inco public key from user's wallet
      const card = await ctx.runQuery(internal.cards.cards.getCardById, {
        cardId: args.cardId,
      });

      if (!card) {
        return { success: false, error: "Card not found" };
      }

      // In production, this would:
      // 1. Generate Inco public key from user's wallet
      // 2. Encrypt initial balance via Inco SDK
      // 3. Store handle on-chain via Solana transaction

      // For development, simulate encryption
      const currentEpoch = Math.floor(Date.now() / EPOCH_DURATION_MS);

      // Create simulated encrypted handle
      const balanceBytes = new ArrayBuffer(16);
      const view = new DataView(balanceBytes);
      view.setBigUint64(0, BigInt(args.initialBalance), true);
      // Add random bytes for uniqueness
      const randomBytes = new Uint8Array(8);
      crypto.getRandomValues(randomBytes);
      new Uint8Array(balanceBytes).set(randomBytes, 8);

      const encryptedHandle = Array.from(new Uint8Array(balanceBytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Derive Inco public key (simulated)
      const incoPublicKey = `inco:${card.userId}:${currentEpoch}`;

      // Update card with Inco fields
      await ctx.runMutation(internal.privacy.incoSpending.updateCardIncoHandle, {
        cardId: args.cardId,
        encryptedBalanceHandle: encryptedHandle,
        incoPublicKey,
        incoEpoch: currentEpoch,
      });

      return {
        success: true,
        encryptedHandle,
        incoPublicKey,
        incoEpoch: currentEpoch,
      };
    } catch (error) {
      console.error(`[Inco] Initialization failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Refresh Inco handle epoch before expiry
 */
export const refreshEpoch = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    newEpoch?: number;
    error?: string;
  }> => {
    try {
      console.log(`[Inco] Refreshing epoch for card ${args.cardId}`);

      const card = await ctx.runQuery(internal.cards.cards.getCardById, {
        cardId: args.cardId,
      });

      if (!card || !card.encryptedBalanceHandle) {
        return { success: false, error: "Card not found or Inco not initialized" };
      }

      const currentEpoch = Math.floor(Date.now() / EPOCH_DURATION_MS);

      // In production, this would re-encrypt with fresh epoch
      await ctx.runMutation(internal.privacy.incoSpending.updateCardIncoHandle, {
        cardId: args.cardId,
        incoEpoch: currentEpoch,
      });

      return {
        success: true,
        newEpoch: currentEpoch,
      };
    } catch (error) {
      console.error(`[Inco] Epoch refresh failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Update card's Inco handle (internal)
 */
export const updateCardIncoHandle = internalMutation({
  args: {
    cardId: v.id("cards"),
    encryptedBalanceHandle: v.optional(v.string()),
    incoPublicKey: v.optional(v.string()),
    incoEpoch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: {
      encryptedBalanceHandle?: string;
      incoPublicKey?: string;
      incoEpoch?: number;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.encryptedBalanceHandle !== undefined) {
      updates.encryptedBalanceHandle = args.encryptedBalanceHandle;
    }
    if (args.incoPublicKey !== undefined) {
      updates.incoPublicKey = args.incoPublicKey;
    }
    if (args.incoEpoch !== undefined) {
      updates.incoEpoch = args.incoEpoch;
    }

    await ctx.db.patch(args.cardId, updates);
  },
});

// ============ QUERIES ============

/**
 * Check if Inco is available for a card
 */
export const isIncoAvailable = internalQuery({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return false;

    // Check card has Inco handle
    if (!card.encryptedBalanceHandle) return false;

    // Check epoch is fresh
    const currentEpoch = Math.floor(Date.now() / EPOCH_DURATION_MS);
    if (card.incoEpoch && card.incoEpoch < currentEpoch - 1) {
      return false; // Epoch expired
    }

    return true;
  },
});

// ============ HELPERS ============

/**
 * Simulate TEE spending check (development only)
 */
async function simulateTeeSpendingCheck(
  encryptedBalance: string,
  amount: number
): Promise<{
  allowed: boolean;
  attestation: {
    quote: string;
    timestamp: number;
    verified: boolean;
  };
}> {
  // Simulate network latency (5-50ms)
  const latency = 5 + Math.random() * 45;
  await new Promise(resolve => setTimeout(resolve, latency));

  // Parse balance hint from handle (development only)
  const handleBytes = hexToBytes(encryptedBalance);
  const balanceHint = Number(
    BigInt(handleBytes[0]) |
    (BigInt(handleBytes[1]) << BigInt(8)) |
    (BigInt(handleBytes[2]) << BigInt(16)) |
    (BigInt(handleBytes[3]) << BigInt(24)) |
    (BigInt(handleBytes[4]) << BigInt(32)) |
    (BigInt(handleBytes[5]) << BigInt(40)) |
    (BigInt(handleBytes[6]) << BigInt(48)) |
    (BigInt(handleBytes[7]) << BigInt(56))
  );

  return {
    allowed: balanceHint >= amount,
    attestation: {
      quote: `simulated-sgx-quote-${Date.now().toString(16)}`,
      timestamp: Date.now(),
      verified: true,
    },
  };
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}
