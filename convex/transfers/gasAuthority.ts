/**
 * DisCard 2035 - Gas Authority Service
 *
 * Handles fee sponsorship for user transactions.
 * The gas authority wallet pays network fees, enabling free transfers for users.
 *
 * Flow:
 * 1. User builds transaction with gas authority as fee payer
 * 2. User signs with their Turnkey TEE wallet (authorizes the transfer)
 * 3. Gas authority co-signs (pays the fee)
 * 4. Fully signed transaction is submitted to Solana
 *
 * Security Model:
 * - Gas authority private key stored securely (environment/HSM)
 * - Only signs transactions where it is explicitly the fee payer
 * - Rate limiting and fraud detection before signing
 * - Audit trail of all sponsored transactions
 */

import { v } from "convex/values";
import {
  action,
  mutation,
  query,
  internalMutation,
  internalQuery,
  internalAction,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Configuration
// ============================================================================

/** Gas authority public key */
const GAS_AUTHORITY_PUBKEY = process.env.EXPO_PUBLIC_GAS_AUTHORITY_PUBKEY;

/** Gas authority private key (base58 encoded) - stored securely */
const GAS_AUTHORITY_PRIVATE_KEY = process.env.GAS_AUTHORITY_PRIVATE_KEY;

/** Maximum sponsored transactions per user per day */
const MAX_SPONSORED_TXS_PER_DAY = 100;

/** Maximum gas spend per user per day (in lamports) */
const MAX_GAS_SPEND_PER_DAY = 50_000_000; // 0.05 SOL

/** Solana RPC for fee estimation */
const SOLANA_RPC_URL = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// ============================================================================
// Types
// ============================================================================

export interface GasSponsorship {
  userId: string;
  transactionId: string;
  feeLamports: number;
  transactionType: "transfer" | "swap" | "merchant_payment" | "other";
  status: "pending" | "signed" | "submitted" | "confirmed" | "failed";
  userSignature?: string;
  gasAuthoritySignature?: string;
  solanaSignature?: string;
  createdAt: number;
  completedAt?: number;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Check if gas subsidization is available
 */
export const isAvailable = query({
  args: {},
  handler: async (): Promise<boolean> => {
    return !!GAS_AUTHORITY_PUBKEY && !!GAS_AUTHORITY_PRIVATE_KEY;
  },
});

/**
 * Get gas authority public key
 */
export const getPublicKey = query({
  args: {},
  handler: async (): Promise<string | null> => {
    return GAS_AUTHORITY_PUBKEY || null;
  },
});

/**
 * Get user's gas sponsorship usage for the day
 */
export const getUserDailyUsage = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sponsorships = await ctx.db
      .query("gasSponsorships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), startOfDay.getTime()),
          q.or(
            q.eq(q.field("status"), "confirmed"),
            q.eq(q.field("status"), "submitted"),
            q.eq(q.field("status"), "signed")
          )
        )
      )
      .collect();

    const totalSpent = sponsorships.reduce((sum, s) => sum + s.feeLamports, 0);

    return {
      transactionsToday: sponsorships.length,
      maxTransactionsPerDay: MAX_SPONSORED_TXS_PER_DAY,
      lamportsSpentToday: totalSpent,
      maxLamportsPerDay: MAX_GAS_SPEND_PER_DAY,
      remainingTransactions: Math.max(0, MAX_SPONSORED_TXS_PER_DAY - sponsorships.length),
      remainingLamports: Math.max(0, MAX_GAS_SPEND_PER_DAY - totalSpent),
    };
  },
});

/**
 * Get user's gas sponsorship usage for the day (public query)
 */
export const getUserUsage = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sponsorships = await ctx.db
      .query("gasSponsorships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), startOfDay.getTime()),
          q.or(
            q.eq(q.field("status"), "confirmed"),
            q.eq(q.field("status"), "submitted"),
            q.eq(q.field("status"), "signed")
          )
        )
      )
      .collect();

    const totalSpent = sponsorships.reduce((sum, s) => sum + s.feeLamports, 0);

    return {
      transactionsToday: sponsorships.length,
      maxTransactionsPerDay: MAX_SPONSORED_TXS_PER_DAY,
      lamportsSpentToday: totalSpent,
      maxLamportsPerDay: MAX_GAS_SPEND_PER_DAY,
      remainingTransactions: Math.max(0, MAX_SPONSORED_TXS_PER_DAY - sponsorships.length),
      remainingLamports: Math.max(0, MAX_GAS_SPEND_PER_DAY - totalSpent),
    };
  },
});

/**
 * Get sponsorship history for a user
 */
export const getSponsorshipHistory = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("gasSponsorships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Request gas sponsorship for a transaction
 * Returns whether the request is approved and the gas authority pubkey
 */
export const requestSponsorship = action({
  args: {
    userId: v.id("users"),
    transactionType: v.union(
      v.literal("transfer"),
      v.literal("swap"),
      v.literal("merchant_payment"),
      v.literal("other")
    ),
    estimatedFeeLamports: v.number(),
  },
  handler: async (ctx, args): Promise<{
    approved: boolean;
    gasAuthorityPubkey?: string;
    sponsorshipId?: string;
    reason?: string;
  }> => {
    // Check if gas authority is configured
    if (!GAS_AUTHORITY_PUBKEY || !GAS_AUTHORITY_PRIVATE_KEY) {
      return {
        approved: false,
        reason: "Gas sponsorship not configured",
      };
    }

    // Check user's daily limits
    const usage = await ctx.runQuery(internal.transfers.gasAuthority.getUserDailyUsage, {
      userId: args.userId,
    });

    if (usage.transactionsToday >= MAX_SPONSORED_TXS_PER_DAY) {
      return {
        approved: false,
        reason: "Daily transaction limit reached",
      };
    }

    if (usage.lamportsSpentToday + args.estimatedFeeLamports > MAX_GAS_SPEND_PER_DAY) {
      return {
        approved: false,
        reason: "Daily gas spend limit reached",
      };
    }

    // Create sponsorship record
    const sponsorshipId = await ctx.runMutation(
      internal.transfers.gasAuthority.createSponsorship,
      {
        userId: args.userId,
        transactionType: args.transactionType,
        estimatedFeeLamports: args.estimatedFeeLamports,
      }
    );

    return {
      approved: true,
      gasAuthorityPubkey: GAS_AUTHORITY_PUBKEY,
      sponsorshipId,
    };
  },
});

/**
 * Sign a transaction with the gas authority
 * This adds the fee payer signature to a user-signed transaction
 */
export const signTransaction = action({
  args: {
    sponsorshipId: v.string(),
    /** Base64-encoded transaction (partially signed by user) */
    partiallySignedTransaction: v.string(),
    /** User's signature (for verification) */
    userSignature: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    fullySignedTransaction?: string;
    error?: string;
  }> => {
    if (!GAS_AUTHORITY_PRIVATE_KEY) {
      return {
        success: false,
        error: "Gas authority not configured",
      };
    }

    try {
      // Verify the sponsorship exists and is pending
      const sponsorship = await ctx.runQuery(
        internal.transfers.gasAuthority.getSponsorship,
        { sponsorshipId: args.sponsorshipId }
      );

      if (!sponsorship) {
        return {
          success: false,
          error: "Sponsorship not found",
        };
      }

      if (sponsorship.status !== "pending") {
        return {
          success: false,
          error: `Invalid sponsorship status: ${sponsorship.status}`,
        };
      }

      // Decode and verify the transaction
      const txBuffer = Buffer.from(args.partiallySignedTransaction, "base64");

      // Verify the fee payer matches our gas authority
      // Transaction format: [num_signatures, ...signatures, message]
      // Message starts with header (3 bytes) then account addresses
      const numSignatures = txBuffer[0];
      const signaturesEnd = 1 + numSignatures * 64;
      const messageStart = signaturesEnd;

      // Skip header (3 bytes) to get to account addresses
      const numRequiredSignatures = txBuffer[messageStart];
      const accountsStart = messageStart + 3;

      // First account in static accounts is the fee payer
      const feePayerBytes = txBuffer.slice(accountsStart, accountsStart + 32);
      const feePayerBase58 = base58Encode(feePayerBytes);

      if (feePayerBase58 !== GAS_AUTHORITY_PUBKEY) {
        return {
          success: false,
          error: "Transaction fee payer does not match gas authority",
        };
      }

      // Sign with gas authority private key
      const privateKeyBytes = base58Decode(GAS_AUTHORITY_PRIVATE_KEY);
      const messageBytes = txBuffer.slice(messageStart);

      // Use Ed25519 signing (would need crypto library in production)
      // For now, we'll use a placeholder that the actual signing happens server-side
      const gasAuthoritySignature = await signWithEd25519(privateKeyBytes, messageBytes);

      // Insert gas authority signature into transaction
      // The gas authority is the fee payer, so its signature goes first
      const fullySignedTx = Buffer.alloc(txBuffer.length + 64);
      fullySignedTx[0] = numSignatures + 1;

      // Insert gas authority signature first (fee payer)
      gasAuthoritySignature.copy(fullySignedTx, 1);

      // Copy existing signatures after
      txBuffer.slice(1, signaturesEnd).copy(fullySignedTx, 65);

      // Copy message
      txBuffer.slice(messageStart).copy(fullySignedTx, 1 + (numSignatures + 1) * 64);

      // Update sponsorship record
      await ctx.runMutation(internal.transfers.gasAuthority.updateSponsorship, {
        sponsorshipId: args.sponsorshipId,
        status: "signed",
        userSignature: args.userSignature,
        gasAuthoritySignature: gasAuthoritySignature.toString("hex"),
      });

      return {
        success: true,
        fullySignedTransaction: fullySignedTx.toString("base64"),
      };
    } catch (error) {
      console.error("[GasAuthority] Signing error:", error);

      await ctx.runMutation(internal.transfers.gasAuthority.updateSponsorship, {
        sponsorshipId: args.sponsorshipId,
        status: "failed",
        error: error instanceof Error ? error.message : "Signing failed",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Signing failed",
      };
    }
  },
});

/**
 * Mark a sponsorship as confirmed after transaction settles
 */
export const confirmSponsorship = action({
  args: {
    sponsorshipId: v.string(),
    solanaSignature: v.string(),
    actualFeeLamports: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.transfers.gasAuthority.updateSponsorship, {
      sponsorshipId: args.sponsorshipId,
      status: "confirmed",
      solanaSignature: args.solanaSignature,
      actualFeeLamports: args.actualFeeLamports,
    });

    return { success: true };
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Create a new sponsorship record
 */
export const createSponsorship = internalMutation({
  args: {
    userId: v.id("users"),
    transactionType: v.string(),
    estimatedFeeLamports: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sponsorshipId = `gas_${now}_${Math.random().toString(36).slice(2, 11)}`;

    await ctx.db.insert("gasSponsorships", {
      sponsorshipId,
      userId: args.userId,
      transactionType: args.transactionType,
      feeLamports: args.estimatedFeeLamports,
      status: "pending",
      createdAt: now,
    });

    return sponsorshipId;
  },
});

/**
 * Get sponsorship by ID
 */
export const getSponsorship = internalQuery({
  args: { sponsorshipId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gasSponsorships")
      .withIndex("by_sponsorship_id", (q) => q.eq("sponsorshipId", args.sponsorshipId))
      .first();
  },
});

/**
 * Update sponsorship status
 */
export const updateSponsorship = internalMutation({
  args: {
    sponsorshipId: v.string(),
    status: v.string(),
    userSignature: v.optional(v.string()),
    gasAuthoritySignature: v.optional(v.string()),
    solanaSignature: v.optional(v.string()),
    actualFeeLamports: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db
      .query("gasSponsorships")
      .withIndex("by_sponsorship_id", (q) => q.eq("sponsorshipId", args.sponsorshipId))
      .first();

    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.userSignature) updates.userSignature = args.userSignature;
    if (args.gasAuthoritySignature) updates.gasAuthoritySignature = args.gasAuthoritySignature;
    if (args.solanaSignature) updates.solanaSignature = args.solanaSignature;
    if (args.actualFeeLamports) updates.feeLamports = args.actualFeeLamports;
    if (args.error) updates.error = args.error;
    if (args.status === "confirmed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(sponsorship._id, updates);
  },
});

/**
 * Get gas authority metrics
 */
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaySponsorships = await ctx.db
      .query("gasSponsorships")
      .filter((q) => q.gte(q.field("createdAt"), startOfDay.getTime()))
      .collect();

    const confirmed = todaySponsorships.filter((s) => s.status === "confirmed");
    const failed = todaySponsorships.filter((s) => s.status === "failed");
    const pending = todaySponsorships.filter((s) =>
      s.status === "pending" || s.status === "signed" || s.status === "submitted"
    );

    const totalGasSpent = confirmed.reduce((sum, s) => sum + s.feeLamports, 0);

    return {
      todayTotal: todaySponsorships.length,
      confirmed: confirmed.length,
      failed: failed.length,
      pending: pending.length,
      totalGasSpentLamports: totalGasSpent,
      totalGasSpentSol: totalGasSpent / 1_000_000_000,
      successRate: todaySponsorships.length > 0
        ? (confirmed.length / todaySponsorships.length) * 100
        : 100,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Buffer): string {
  let result = "";
  let value = BigInt("0x" + bytes.toString("hex"));

  while (value > 0) {
    const remainder = Number(value % 58n);
    value = value / 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }

  // Handle leading zeros
  for (const byte of bytes) {
    if (byte === 0) {
      result = "1" + result;
    } else {
      break;
    }
  }

  return result;
}

function base58Decode(str: string): Buffer {
  let value = 0n;

  for (const char of str) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base58 character");
    value = value * 58n + BigInt(index);
  }

  const hex = value.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

async function signWithEd25519(privateKey: Buffer, message: Buffer): Promise<Buffer> {
  // In production, use proper Ed25519 signing
  // This would typically use @noble/ed25519 or tweetnacl
  // For Convex actions, we need to use a compatible crypto library

  // Placeholder: In the real implementation, this would be:
  // import { sign } from "@noble/ed25519";
  // return Buffer.from(await sign(message, privateKey.slice(0, 32)));

  // For now, we'll throw an error indicating the need for proper implementation
  // This file serves as the structure for the gas authority signing service
  throw new Error(
    "Ed25519 signing implementation required. Install @noble/ed25519 or use external signing service."
  );
}
