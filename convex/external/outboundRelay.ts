/**
 * Outbound Relay — Privacy-preserving external sends
 *
 * Flow:
 *   1. Screen recipient address (fail-closed)
 *   2. Unshield from Privacy Cash pool → single-use address
 *   3. Hop 1: Single-use → ShadowWire Pool (signed by session key)
 *   4. Hop 2: Pool → External Recipient (server-side, batched with jitter)
 *
 * On-chain observers see:
 *   [unknown addr] → Pool  (not linkable to DisCard user)
 *   Pool → Recipient        (pool sends to many, batching breaks timing)
 *
 * Mirrors the blink payout batch pattern (convex/actions/blinkClaim.ts).
 */

import { action, internalAction, internalMutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

import {
  getBalance,
  getLatestBlockhash,
  sendTransaction,
  waitForConfirmation,
  accountExists,
  deriveAta,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_SOL_MINT,
} from "../lib/solanaRpc";
import { screenAddress } from "../lib/compliance";

// ============================================================================
// Configuration
// ============================================================================

const POOL_PRIVATE_KEY = process.env.SHADOWWIRE_POOL_PRIVATE_KEY;
const PAYOUT_MAX_RETRIES = 3;

/** Max jitter for batched payouts (5 minutes) */
const MAX_JITTER_MS = 300_000;

function getPoolKeypair(): Keypair {
  if (!POOL_PRIVATE_KEY) {
    throw new Error("SHADOWWIRE_POOL_PRIVATE_KEY not configured");
  }
  return Keypair.fromSecretKey(bs58.decode(POOL_PRIVATE_KEY));
}

// ============================================================================
// Actions — Initiate External Send
// ============================================================================

/**
 * Initiate an outbound transfer to an external wallet.
 * Pre-screens recipient, creates outbound payout record.
 */
export const initiateExternalSend = action({
  args: {
    recipientAddress: v.string(),
    amount: v.number(),            // Base units
    tokenMint: v.string(),
    tokenDecimals: v.number(),
    tokenSymbol: v.string(),
    amountDisplay: v.number(),     // Human-readable
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; blocked?: boolean; reason?: string; payoutId?: any; scheduledFor?: number; message?: string }> => {
    // Auth
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    // Validate recipient address
    try {
      new PublicKey(args.recipientAddress);
    } catch {
      throw new Error("Invalid Solana address");
    }

    // Step 1: Pre-screen recipient (fail-closed)
    const complianceCheck = await screenAddress(args.recipientAddress);
    if (!complianceCheck.passed) {
      return {
        success: false,
        blocked: true,
        reason: complianceCheck.reason || "Address blocked by compliance",
      };
    }

    // Step 2: Queue the outbound payout with jitter
    const jitterMs = Math.floor(Math.random() * MAX_JITTER_MS);
    const scheduledFor = Date.now() + jitterMs;

    const payoutId = await ctx.runMutation(
      internal.external.outboundRelay.createOutboundPayout,
      {
        credentialId,
        recipientAddress: args.recipientAddress,
        amount: args.amount,
        tokenMint: args.tokenMint,
        tokenDecimals: args.tokenDecimals,
        tokenSymbol: args.tokenSymbol,
        amountDisplay: args.amountDisplay,
        scheduledFor,
      }
    );

    return {
      success: true,
      payoutId,
      scheduledFor,
      message: `Sending ${args.amountDisplay} ${args.tokenSymbol} to ${args.recipientAddress.slice(0, 8)}...`,
    };
  },
});

/**
 * Check if an external address passes compliance screening.
 * Used for inline UI indicators.
 */
export const checkRecipientCompliance = action({
  args: {
    recipientAddress: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      new PublicKey(args.recipientAddress);
    } catch {
      return { valid: false, passed: false, reason: "Invalid address" };
    }

    const result = await screenAddress(args.recipientAddress);
    return {
      valid: true,
      passed: result.passed,
      reason: result.reason,
      riskLevel: result.riskLevel,
    };
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Create outbound payout record.
 */
export const createOutboundPayout = internalMutation({
  args: {
    credentialId: v.string(),
    recipientAddress: v.string(),
    amount: v.number(),
    tokenMint: v.string(),
    tokenDecimals: v.number(),
    tokenSymbol: v.string(),
    amountDisplay: v.number(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();
    if (!user) throw new Error("User not found");

    return await ctx.db.insert("outboundPayouts", {
      userId: user._id,
      recipientAddress: args.recipientAddress,
      amount: args.amount,
      tokenMint: args.tokenMint,
      tokenDecimals: args.tokenDecimals,
      tokenSymbol: args.tokenSymbol,
      amountDisplay: args.amountDisplay,
      status: "queued",
      compliancePassed: true,
      scheduledFor: args.scheduledFor,
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update outbound payout status.
 */
export const updatePayoutStatus = internalMutation({
  args: {
    payoutId: v.id("outboundPayouts"),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("blocked")
    ),
    hop2TxSignature: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: Record<string, any> = { status: args.status };
    if (args.hop2TxSignature) update.hop2TxSignature = args.hop2TxSignature;
    if (args.error) update.error = args.error;
    if (args.status === "completed") update.completedAt = Date.now();

    await ctx.db.patch(args.payoutId, update);
  },
});

/**
 * Retry a failed payout with exponential backoff.
 */
export const retryPayout = internalMutation({
  args: {
    payoutId: v.id("outboundPayouts"),
    error: v.string(),
    nextScheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) return;

    await ctx.db.patch(args.payoutId, {
      status: "queued" as const,
      attempts: payout.attempts + 1,
      scheduledFor: args.nextScheduledFor,
      error: args.error,
    });
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

/**
 * Get queued outbound payouts ready for processing.
 */
export const getPendingOutboundPayouts = query({
  args: { beforeTimestamp: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("outboundPayouts")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "queued").lte("scheduledFor", args.beforeTimestamp)
      )
      .collect();
  },
});

// ============================================================================
// Batch Payout Processing (Server-Side Pool → Recipient)
// ============================================================================

/**
 * Process queued outbound payouts.
 * Runs on a 5-minute cron schedule. Same pattern as blink payout batch.
 */
export const processOutboundBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const pendingPayouts = await ctx.runQuery(
      internal.external.outboundRelay.getPendingOutboundPayouts,
      { beforeTimestamp: now }
    );

    if (pendingPayouts.length === 0) return;

    console.log(`[OutboundRelay] Processing ${pendingPayouts.length} pending outbound payouts`);

    const poolKeypair = getPoolKeypair();

    for (const payout of pendingPayouts) {
      try {
        // Defense in depth: re-screen recipient before payout
        const complianceCheck = await screenAddress(payout.recipientAddress);
        if (!complianceCheck.passed) {
          console.warn(
            `[OutboundRelay] Payout blocked by compliance: ${complianceCheck.reason}`
          );
          await ctx.runMutation(internal.external.outboundRelay.updatePayoutStatus, {
            payoutId: payout._id,
            status: "blocked",
            error: `Compliance: ${complianceCheck.reason}`,
          });
          continue;
        }

        // Mark as processing
        await ctx.runMutation(internal.external.outboundRelay.updatePayoutStatus, {
          payoutId: payout._id,
          status: "processing",
        });

        // Build and send pool → recipient transaction
        const isNativeSol =
          payout.tokenMint === "native" || payout.tokenMint === NATIVE_SOL_MINT;
        const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();

        let transaction: Transaction;

        if (isNativeSol) {
          transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: poolKeypair.publicKey,
              toPubkey: new PublicKey(payout.recipientAddress),
              lamports: payout.amount,
            })
          );
        } else {
          // SPL token relay
          const mintPubkey = new PublicKey(payout.tokenMint);
          const recipientPubkey = new PublicKey(payout.recipientAddress);
          const poolAta = deriveAta(poolKeypair.publicKey, mintPubkey);
          const recipientAta = deriveAta(recipientPubkey, mintPubkey);

          transaction = new Transaction();

          // Create recipient ATA if needed
          const recipientAtaExists = await accountExists(recipientAta.toBase58());
          if (!recipientAtaExists) {
            transaction.add({
              keys: [
                { pubkey: poolKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: recipientAta, isSigner: false, isWritable: true },
                { pubkey: recipientPubkey, isSigner: false, isWritable: false },
                { pubkey: mintPubkey, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              ],
              programId: ASSOCIATED_TOKEN_PROGRAM_ID,
              data: Buffer.alloc(0),
            });
          }

          // SPL Transfer
          const transferData = Buffer.alloc(9);
          transferData.writeUInt8(3, 0);
          transferData.writeBigUInt64LE(BigInt(payout.amount), 1);

          transaction.add({
            keys: [
              { pubkey: poolAta, isSigner: false, isWritable: true },
              { pubkey: recipientAta, isSigner: false, isWritable: true },
              { pubkey: poolKeypair.publicKey, isSigner: true, isWritable: false },
            ],
            programId: TOKEN_PROGRAM_ID,
            data: transferData,
          });
        }

        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = poolKeypair.publicKey;
        transaction.sign(poolKeypair);

        const txSignature = await sendTransaction(transaction.serialize());
        await waitForConfirmation(txSignature);

        // Mark completed
        await ctx.runMutation(internal.external.outboundRelay.updatePayoutStatus, {
          payoutId: payout._id,
          status: "completed",
          hop2TxSignature: txSignature,
        });

        console.log(`[OutboundRelay] Payout completed: ${txSignature}`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Payout failed";
        console.error(`[OutboundRelay] Payout failed for ${payout._id}:`, errMsg);

        // Retry with exponential backoff
        const nextAttempt = payout.attempts + 1;
        if (nextAttempt < PAYOUT_MAX_RETRIES) {
          const backoffMs = Math.pow(2, nextAttempt) * 60_000;
          await ctx.runMutation(internal.external.outboundRelay.retryPayout, {
            payoutId: payout._id,
            error: errMsg,
            nextScheduledFor: Date.now() + backoffMs,
          });
        } else {
          await ctx.runMutation(internal.external.outboundRelay.updatePayoutStatus, {
            payoutId: payout._id,
            status: "failed",
            error: errMsg,
          });
        }
      }
    }
  },
});

// ============================================================================
// Public Queries
// ============================================================================

/**
 * Get outbound payout history for user.
 */
export const getOutboundHistory = query({
  args: {
    limit: v.optional(v.number()),
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();
    if (!user) return [];

    return await ctx.db
      .query("outboundPayouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 20);
  },
});
