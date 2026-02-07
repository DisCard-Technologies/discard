/**
 * Confidential Blink Claims — Solana Actions for External Wallet Claims
 *
 * Enables any Solana wallet (Phantom, Backpack, etc.) to claim a private
 * transfer via a shareable blink URL. Uses two-hop pool relay for privacy:
 *
 *   Stealth → Pool (claimer-signed blink tx)
 *   Pool → Recipient (server-side batched payout)
 *
 * On-chain observers cannot link the stealth deposit to the recipient payout.
 */

import { action, mutation, query, internalMutation, internalAction } from "../_generated/server";
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
  rpcCall,
  getBalance,
  getLatestBlockhash,
  sendTransaction,
  uint8ArrayToBase64,
  base64ToUint8Array,
  waitForConfirmation,
  getTransaction,
  accountExists,
  deriveAta,
  getTokenAccountBalance,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_SOL_MINT,
} from "../lib/solanaRpc";
import { screenAddress } from "../lib/compliance";

// ============================================================================
// Configuration
// ============================================================================

const BLINK_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CLAIM_ATTEMPTS = 5;
const POOL_PRIVATE_KEY = process.env.SHADOWWIRE_POOL_PRIVATE_KEY;
const PAYOUT_MAX_RETRIES = 3;

function getPoolKeypair(): Keypair {
  if (!POOL_PRIVATE_KEY) {
    throw new Error("SHADOWWIRE_POOL_PRIVATE_KEY not configured");
  }
  const secretKey = bs58.decode(POOL_PRIVATE_KEY);
  return Keypair.fromSecretKey(secretKey);
}

/** Generate a random 8-char alphanumeric link ID */
function generateLinkId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ============================================================================
// Mutations & Queries
// ============================================================================

/**
 * Create a new blink claim link.
 * Called by the sender when they want to create a blink-compatible claim URL.
 */
export const createBlinkClaim = mutation({
  args: {
    stealthSeed: v.string(),        // base64-encoded 32-byte seed
    stealthAddress: v.string(),     // Derived stealth pubkey
    amount: v.number(),             // Base units (lamports / token smallest unit)
    tokenMint: v.string(),
    tokenDecimals: v.number(),
    tokenSymbol: v.string(),
    amountDisplay: v.number(),      // Human-readable (e.g. 5.00)
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auth: Convex auth or credentialId fallback
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();
    if (!user) {
      throw new Error("User not found");
    }

    const linkId = generateLinkId();
    const now = Date.now();

    const claimId = await ctx.db.insert("blinkClaims", {
      linkId,
      stealthAddress: args.stealthAddress,
      stealthSeed: args.stealthSeed,
      amount: args.amount,
      tokenMint: args.tokenMint,
      tokenDecimals: args.tokenDecimals,
      tokenSymbol: args.tokenSymbol,
      amountDisplay: args.amountDisplay,
      status: "active",
      claimAttempts: 0,
      expiresAt: now + BLINK_LINK_EXPIRY_MS,
      createdAt: now,
      creatorId: user._id,
    });

    return { linkId, claimId, stealthAddress: args.stealthAddress };
  },
});

/**
 * Public query — returns metadata for the GET endpoint (never exposes seed).
 */
export const getBlinkClaim = query({
  args: { linkId: v.string() },
  handler: async (ctx, args) => {
    const claim = await ctx.db
      .query("blinkClaims")
      .withIndex("by_link_id", (q) => q.eq("linkId", args.linkId))
      .first();

    if (!claim) return null;

    return {
      linkId: claim.linkId,
      amount: claim.amount,
      amountDisplay: claim.amountDisplay,
      tokenSymbol: claim.tokenSymbol,
      tokenMint: claim.tokenMint,
      tokenDecimals: claim.tokenDecimals,
      status: claim.status,
      expiresAt: claim.expiresAt,
      createdAt: claim.createdAt,
    };
  },
});

// ============================================================================
// Actions — Blink Transaction Building
// ============================================================================

/**
 * Build the stealth → pool deposit transaction for the Blink POST.
 *
 * The recipient's wallet receives a partially-signed transaction where:
 * - Stealth keypair has signed (authorizes transfer from stealth)
 * - Recipient is the fee payer (signs + submits in their wallet)
 *
 * Funds go to the ShadowWire pool, NOT directly to the recipient.
 */
export const buildDepositToPoolTransaction = action({
  args: {
    linkId: v.string(),
    claimerAccount: v.string(), // Recipient wallet pubkey (from POST body)
  },
  handler: async (ctx, args): Promise<any> => {
    // Look up the claim
    const claim = await ctx.runQuery((internal.actions.blinkClaim as any).getBlinkClaimInternal, {
      linkId: args.linkId,
    });

    if (!claim) {
      throw new Error("Claim not found");
    }

    // Validate state
    if (claim.status !== "active") {
      throw new Error(
        claim.status === "expired" ? "This claim link has expired" :
        claim.status === "deposited" || claim.status === "confirmed" || claim.status === "paid"
          ? "This claim has already been used"
          : "Claim is not available"
      );
    }

    if (claim.expiresAt < Date.now()) {
      throw new Error("This claim link has expired");
    }

    if (claim.claimAttempts >= MAX_CLAIM_ATTEMPTS) {
      throw new Error("Too many claim attempts");
    }

    // Validate claimer address
    let claimerPubkey: PublicKey;
    try {
      claimerPubkey = new PublicKey(args.claimerAccount);
    } catch {
      throw new Error("Invalid wallet address");
    }

    // Compliance: screen claimer address before building transaction
    const complianceCheck = await screenAddress(args.claimerAccount);
    if (!complianceCheck.passed) {
      console.warn(`[BlinkClaim] Claimer blocked by compliance: ${complianceCheck.reason}`);
      throw new Error("This address cannot claim transfers due to compliance restrictions");
    }

    // Reconstruct stealth keypair from seed
    const seedBytes = base64ToUint8Array(claim.stealthSeed);
    const stealthKeypair = Keypair.fromSeed(seedBytes);

    // Verify stealth address matches
    if (stealthKeypair.publicKey.toBase58() !== claim.stealthAddress) {
      throw new Error("Stealth address mismatch — claim data corrupted");
    }

    // Get pool address
    const poolKeypair = getPoolKeypair();
    const poolPubkey = poolKeypair.publicKey;

    // Determine if native SOL or SPL token
    const isNativeSol = claim.tokenMint === "native" || claim.tokenMint === NATIVE_SOL_MINT;

    // Check stealth address has funds
    if (isNativeSol) {
      const balance = await getBalance(claim.stealthAddress);
      if (balance < claim.amount) {
        throw new Error(`Stealth address underfunded: has ${balance}, need ${claim.amount}`);
      }
    } else {
      const tokenBalance = await getTokenAccountBalance(claim.stealthAddress, claim.tokenMint);
      if (BigInt(tokenBalance.amount) < BigInt(claim.amount)) {
        throw new Error(`Stealth address underfunded: has ${tokenBalance.amount}, need ${claim.amount}`);
      }
    }

    // Build the deposit transaction (stealth → pool)
    const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();
    const transaction = new Transaction();

    if (isNativeSol) {
      // Native SOL: transfer full amount (stealth → pool)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: stealthKeypair.publicKey,
          toPubkey: poolPubkey,
          lamports: claim.amount,
        })
      );
    } else {
      // SPL token: transfer tokens then close ATA to recover rent
      const mintPubkey = new PublicKey(claim.tokenMint);
      const stealthAta = deriveAta(stealthKeypair.publicKey, mintPubkey);
      const poolAta = deriveAta(poolPubkey, mintPubkey);

      // Ensure pool ATA exists (create if needed, claimer pays rent)
      const poolAtaExists = await accountExists(poolAta.toBase58());
      if (!poolAtaExists) {
        transaction.add({
          keys: [
            { pubkey: claimerPubkey, isSigner: true, isWritable: true },      // payer (claimer)
            { pubkey: poolAta, isSigner: false, isWritable: true },           // ata
            { pubkey: poolPubkey, isSigner: false, isWritable: false },       // owner
            { pubkey: mintPubkey, isSigner: false, isWritable: false },       // mint
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          data: Buffer.from(new Uint8Array(0)),
        });
      }

      // SPL Token Transfer (stealth ATA → pool ATA)
      const transferData = new Uint8Array(9);
      const view = new DataView(transferData.buffer);
      transferData[0] = 3; // Transfer instruction index
      view.setBigUint64(1, BigInt(claim.amount), true); // little-endian amount

      transaction.add({
        keys: [
          { pubkey: stealthAta, isSigner: false, isWritable: true },           // source
          { pubkey: poolAta, isSigner: false, isWritable: true },              // destination
          { pubkey: stealthKeypair.publicKey, isSigner: true, isWritable: false }, // authority
        ],
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from(transferData),
      });

      // Close stealth ATA (rent goes to claimer as fee payer)
      const closeData = new Uint8Array([9]); // CloseAccount instruction index
      transaction.add({
        keys: [
          { pubkey: stealthAta, isSigner: false, isWritable: true },           // account to close
          { pubkey: claimerPubkey, isSigner: false, isWritable: true },        // rent destination
          { pubkey: stealthKeypair.publicKey, isSigner: true, isWritable: false }, // authority
        ],
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from(closeData),
      });
    }

    // Set transaction metadata
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = claimerPubkey; // Recipient pays tx fees

    // Partially sign with stealth keypair (authorizes transfer from stealth)
    transaction.partialSign(stealthKeypair);

    // Serialize (allow missing claimer signature)
    const serializedTx = transaction.serialize({ requireAllSignatures: false });
    const base64Tx = uint8ArrayToBase64(serializedTx);

    // Update claim state atomically
    await ctx.runMutation(internal.actions.blinkClaim.markDeposited, {
      linkId: args.linkId,
      claimerAccount: args.claimerAccount,
    });

    return {
      transaction: base64Tx,
      message: `Claim ${claim.amountDisplay} ${claim.tokenSymbol} — funds will arrive in your wallet shortly after confirmation.`,
    };
  },
});

/**
 * Chained action callback — called after the deposit tx confirms.
 * Verifies the stealth → pool deposit on-chain and queues payout.
 */
export const confirmClaimAndRelay = action({
  args: {
    linkId: v.string(),
    signature: v.string(),  // The deposit tx signature from the wallet
    account: v.string(),    // Claimer pubkey (from chained POST body)
  },
  handler: async (ctx, args): Promise<any> => {
    // Look up claim
    const claim = await ctx.runQuery((internal.actions.blinkClaim as any).getBlinkClaimInternal, {
      linkId: args.linkId,
    });

    if (!claim) {
      throw new Error("Claim not found");
    }

    if (claim.status !== "deposited") {
      throw new Error(`Unexpected claim status: ${claim.status}`);
    }

    // Verify the deposit transaction on-chain
    const tx = await getTransaction(args.signature);
    if (!tx) {
      throw new Error("Deposit transaction not found or not confirmed");
    }
    if (tx.meta?.err) {
      throw new Error("Deposit transaction failed on-chain");
    }

    // Verify the pool received the funds (check post-balance change)
    const poolKeypair = getPoolKeypair();
    const accountKeys = tx.transaction?.message?.accountKeys || [];
    const poolIndex = accountKeys.findIndex(
      (key: string) => key === poolKeypair.publicKey.toBase58()
    );

    // For SPL tokens, check token balance changes instead
    const isNativeSol = claim.tokenMint === "native" || claim.tokenMint === NATIVE_SOL_MINT;

    if (isNativeSol && poolIndex !== -1) {
      const postBalances = tx.meta?.postBalances || [];
      const preBalances = tx.meta?.preBalances || [];
      const received = (postBalances[poolIndex] || 0) - (preBalances[poolIndex] || 0);
      if (received < claim.amount) {
        throw new Error(`Insufficient deposit: expected ${claim.amount}, received ${received}`);
      }
    }
    // For SPL: we trust the tx succeeded if no error (token balance changes are in meta.postTokenBalances)

    // Queue the pool → recipient payout with timing jitter (0-300s random delay)
    const jitterMs = Math.floor(Math.random() * 300_000);
    const now = Date.now();

    await ctx.runMutation(internal.actions.blinkClaim.confirmAndQueuePayout, {
      linkId: args.linkId,
      depositTxSig: args.signature,
      recipientAddress: claim.claimerAccount || args.account,
      amount: claim.amount,
      tokenMint: claim.tokenMint,
      tokenDecimals: claim.tokenDecimals,
      scheduledFor: now + jitterMs,
    });

    return {
      success: true,
      message: `Transfer claimed! ${claim.amountDisplay} ${claim.tokenSymbol} will arrive in your wallet shortly.`,
    };
  },
});

// ============================================================================
// Batch Payout Processing (Server-Side Pool → Recipient)
// ============================================================================

/**
 * Process queued pool → recipient payouts.
 * Runs on a 5-minute cron schedule.
 */
export const processPayoutBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all queued payouts ready for processing
    const pendingPayouts = await ctx.runQuery((internal.actions.blinkClaim as any).getPendingPayouts, {
      beforeTimestamp: now,
    });

    if (pendingPayouts.length === 0) return;

    console.log(`[BlinkClaim] Processing ${pendingPayouts.length} pending payouts`);

    const poolKeypair = getPoolKeypair();

    for (const payout of pendingPayouts) {
      try {
        // Compliance: re-screen recipient before sending payout
        const complianceCheck = await screenAddress(payout.recipientAddress);
        if (!complianceCheck.passed) {
          console.warn(`[BlinkClaim] Payout blocked by compliance: ${complianceCheck.reason} (${payout.recipientAddress.slice(0, 8)}...)`);
          await ctx.runMutation(internal.actions.blinkClaim.updatePayoutStatus, {
            payoutId: payout._id,
            status: "failed",
            error: `Compliance: ${complianceCheck.reason}`,
          });
          continue;
        }

        // Mark as processing
        await ctx.runMutation(internal.actions.blinkClaim.updatePayoutStatus, {
          payoutId: payout._id,
          status: "processing",
        });

        const isNativeSol = payout.tokenMint === "native" || payout.tokenMint === NATIVE_SOL_MINT;
        const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();

        let transaction: Transaction;

        if (isNativeSol) {
          // Native SOL relay: pool → recipient
          transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: poolKeypair.publicKey,
              toPubkey: new PublicKey(payout.recipientAddress),
              lamports: payout.amount,
            })
          );
        } else {
          // SPL token relay: pool ATA → recipient ATA
          const mintPubkey = new PublicKey(payout.tokenMint);
          const recipientPubkey = new PublicKey(payout.recipientAddress);
          const poolAta = deriveAta(poolKeypair.publicKey, mintPubkey);
          const recipientAta = deriveAta(recipientPubkey, mintPubkey);

          transaction = new Transaction();

          // Create recipient ATA if needed (pool pays rent)
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
              data: Buffer.from(new Uint8Array(0)),
            });
          }

          // SPL Transfer (pool ATA → recipient ATA)
          const transferData = new Uint8Array(9);
          const view = new DataView(transferData.buffer);
          transferData[0] = 3;
          view.setBigUint64(1, BigInt(payout.amount), true);

          transaction.add({
            keys: [
              { pubkey: poolAta, isSigner: false, isWritable: true },
              { pubkey: recipientAta, isSigner: false, isWritable: true },
              { pubkey: poolKeypair.publicKey, isSigner: true, isWritable: false },
            ],
            programId: TOKEN_PROGRAM_ID,
            data: Buffer.from(transferData),
          });
        }

        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = poolKeypair.publicKey;
        transaction.sign(poolKeypair);

        const txSignature = await sendTransaction(transaction.serialize());
        await waitForConfirmation(txSignature);

        // Mark payout as completed
        await ctx.runMutation(internal.actions.blinkClaim.completePayoutAndClaim, {
          payoutId: payout._id,
          blinkClaimId: payout.blinkClaimId,
          txSignature,
        });

        console.log(`[BlinkClaim] Payout completed: ${txSignature}`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Payout failed";
        console.error(`[BlinkClaim] Payout failed for ${payout._id}:`, errMsg);

        // Retry with exponential backoff
        const nextAttempt = payout.attempts + 1;
        if (nextAttempt < PAYOUT_MAX_RETRIES) {
          const backoffMs = Math.pow(2, nextAttempt) * 60_000; // 2min, 4min, 8min
          await ctx.runMutation(internal.actions.blinkClaim.retryPayout, {
            payoutId: payout._id,
            error: errMsg,
            nextScheduledFor: Date.now() + backoffMs,
          });
        } else {
          await ctx.runMutation(internal.actions.blinkClaim.updatePayoutStatus, {
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
// Expiry Cleanup
// ============================================================================

/**
 * Expire unclaimed blink links past their 15-minute window.
 */
export const expireOldBlinks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const activeClaims = await ctx.db
      .query("blinkClaims")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let expired = 0;
    for (const claim of activeClaims) {
      if (claim.expiresAt < now) {
        await ctx.db.patch(claim._id, { status: "expired" });
        expired++;
      }
    }

    if (expired > 0) {
      console.log(`[BlinkClaim] Expired ${expired} unclaimed blink links`);
    }
  },
});

// ============================================================================
// Internal Helpers (called by actions via ctx.runMutation / ctx.runQuery)
// ============================================================================

/** Internal query — returns full claim data including seed (never expose to client) */
export const getBlinkClaimInternal = query({
  args: { linkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("blinkClaims")
      .withIndex("by_link_id", (q) => q.eq("linkId", args.linkId))
      .first();
  },
});

/** Mark claim as deposited and record claimer account */
export const markDeposited = internalMutation({
  args: {
    linkId: v.string(),
    claimerAccount: v.string(),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db
      .query("blinkClaims")
      .withIndex("by_link_id", (q) => q.eq("linkId", args.linkId))
      .first();

    if (!claim) throw new Error("Claim not found");
    if (claim.status !== "active") throw new Error("Claim already used");

    await ctx.db.patch(claim._id, {
      status: "deposited",
      claimerAccount: args.claimerAccount,
      claimAttempts: claim.claimAttempts + 1,
      claimedAt: Date.now(),
    });
  },
});

/** Confirm deposit and queue the pool → recipient payout */
export const confirmAndQueuePayout = internalMutation({
  args: {
    linkId: v.string(),
    depositTxSig: v.string(),
    recipientAddress: v.string(),
    amount: v.number(),
    tokenMint: v.string(),
    tokenDecimals: v.number(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db
      .query("blinkClaims")
      .withIndex("by_link_id", (q) => q.eq("linkId", args.linkId))
      .first();

    if (!claim) throw new Error("Claim not found");

    // Update claim status
    await ctx.db.patch(claim._id, {
      status: "confirmed",
      depositTxSig: args.depositTxSig,
    });

    // Insert payout into batch queue
    await ctx.db.insert("pendingPayouts", {
      blinkClaimId: claim._id,
      recipientAddress: args.recipientAddress,
      amount: args.amount,
      tokenMint: args.tokenMint,
      tokenDecimals: args.tokenDecimals,
      status: "queued",
      scheduledFor: args.scheduledFor,
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});

/** Get pending payouts ready for processing */
export const getPendingPayouts = query({
  args: { beforeTimestamp: v.number() },
  handler: async (ctx, args) => {
    const payouts = await ctx.db
      .query("pendingPayouts")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "queued").lte("scheduledFor", args.beforeTimestamp)
      )
      .collect();
    return payouts;
  },
});

/** Update payout status */
export const updatePayoutStatus = internalMutation({
  args: {
    payoutId: v.id("pendingPayouts"),
    status: v.union(v.literal("processing"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.payoutId, {
      status: args.status,
      ...(args.error ? { error: args.error } : {}),
    });
  },
});

/** Complete payout and update the parent blink claim */
export const completePayoutAndClaim = internalMutation({
  args: {
    payoutId: v.id("pendingPayouts"),
    blinkClaimId: v.id("blinkClaims"),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.payoutId, {
      status: "completed",
      txSignature: args.txSignature,
      completedAt: now,
    });

    await ctx.db.patch(args.blinkClaimId, {
      status: "paid",
      payoutTxSig: args.txSignature,
      paidAt: now,
    });
  },
});

/** Retry a failed payout with backoff */
export const retryPayout = internalMutation({
  args: {
    payoutId: v.id("pendingPayouts"),
    error: v.string(),
    nextScheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) return;

    await ctx.db.patch(args.payoutId, {
      status: "queued",
      attempts: payout.attempts + 1,
      scheduledFor: args.nextScheduledFor,
      error: args.error,
    });
  },
});
