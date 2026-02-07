/**
 * Inbound Shield — Post-deposit compliance + auto-shield pipeline
 *
 * After a deposit is detected at a stealth receive address:
 *   1. Screen sender address (OFAC/blacklist, fail-closed)
 *   2. PASSED → auto-shield stealth → Privacy Cash pool → notify user
 *   3. FAILED → quarantine at stealth address → notify user + ops
 *
 * Mirrors the MoonPay auto-shield pattern (convex/funding/moonpay.ts:triggerAutoShield).
 */

import { internalAction, internalMutation } from "../_generated/server";
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
  getTokenAccountBalance,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_SOL_MINT,
} from "../lib/solanaRpc";
import { screenAddress } from "../lib/compliance";

// ============================================================================
// Configuration
// ============================================================================

const POOL_PRIVATE_KEY = process.env.SHADOWWIRE_POOL_PRIVATE_KEY;
const PRIVACY_CASH_POOL = process.env.PRIVACY_CASH_POOL_ADDRESS;

function getPoolKeypair(): Keypair {
  if (!POOL_PRIVATE_KEY) {
    throw new Error("SHADOWWIRE_POOL_PRIVATE_KEY not configured");
  }
  return Keypair.fromSecretKey(bs58.decode(POOL_PRIVATE_KEY));
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Process an inbound deposit: compliance screen → shield or quarantine.
 * Called by depositMonitor after detecting a deposit.
 */
export const processInboundDeposit = internalAction({
  args: {
    receiveAddressId: v.id("receiveAddresses"),
    stealthAddress: v.string(),
    senderAddress: v.string(),
    depositAmount: v.number(),
    depositTokenMint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[InboundShield] Processing deposit:", {
      stealth: args.stealthAddress.slice(0, 8) + "...",
      sender: args.senderAddress.slice(0, 8) + "...",
      amount: args.depositAmount,
    });

    // ---- Step 1: Compliance screen the sender (fail-closed) ----
    const complianceResult = await screenAddress(args.senderAddress);

    await ctx.runMutation(
      internal.external.receiveAddresses.recordComplianceResult,
      {
        addressId: args.receiveAddressId,
        passed: complianceResult.passed,
        reason: complianceResult.reason,
      }
    );

    if (!complianceResult.passed) {
      // QUARANTINE: sender failed screening
      console.warn(
        `[InboundShield] Sender quarantined: ${complianceResult.reason} (${args.senderAddress.slice(0, 8)}...)`
      );

      await ctx.runMutation(internal.external.receiveAddresses.quarantine, {
        addressId: args.receiveAddressId,
        reason: complianceResult.reason || "Compliance screening failed",
      });

      // Notify user about quarantine
      const receiveAddr = await ctx.runQuery(
        internal.external.receiveAddresses.getByStealthAddress,
        { stealthAddress: args.stealthAddress }
      );
      if (receiveAddr) {
        await ctx.runMutation(internal.external.inboundShield.notifyUser, {
          userId: receiveAddr.userId,
          type: "quarantine",
          amount: args.depositAmount,
        });
      }

      return { success: false, reason: "quarantined" };
    }

    // ---- Step 2: Auto-shield to Privacy Cash pool ----
    console.log("[InboundShield] Compliance passed, starting auto-shield");

    await ctx.runMutation(internal.external.receiveAddresses.markShielding, {
      addressId: args.receiveAddressId,
    });

    try {
      const txSignature = await shieldToPool(
        args.stealthAddress,
        args.depositAmount,
        args.depositTokenMint,
        args.receiveAddressId,
        ctx,
      );

      // Mark as shielded
      await ctx.runMutation(internal.external.receiveAddresses.markShielded, {
        addressId: args.receiveAddressId,
        shieldTxSignature: txSignature,
      });

      // Notify user about successful receive
      const receiveAddr = await ctx.runQuery(
        internal.external.receiveAddresses.getByStealthAddress,
        { stealthAddress: args.stealthAddress }
      );
      if (receiveAddr) {
        await ctx.runMutation(internal.external.inboundShield.notifyUser, {
          userId: receiveAddr.userId,
          type: "received",
          amount: args.depositAmount,
        });
      }

      console.log("[InboundShield] Shield complete:", txSignature);
      return { success: true, txSignature };
    } catch (error) {
      console.error("[InboundShield] Shield failed:", error);
      return {
        success: false,
        reason: error instanceof Error ? error.message : "Shield failed",
      };
    }
  },
});

// ============================================================================
// Shield Transaction
// ============================================================================

/**
 * Build, sign, and submit the shield transaction (stealth → Privacy Cash pool).
 * Uses the stealth keypair (reconstructed from stored seed) to sign.
 */
async function shieldToPool(
  stealthAddress: string,
  amount: number,
  tokenMint: string | undefined,
  receiveAddressId: string,
  ctx: any,
): Promise<string> {
  // Get the stealth seed to reconstruct the keypair
  const receiveAddr = await ctx.runQuery(
    internal.external.receiveAddresses.getByStealthAddress,
    { stealthAddress }
  );

  if (!receiveAddr?.stealthSeed) {
    throw new Error("Cannot reconstruct stealth keypair — seed not found");
  }

  // Reconstruct stealth keypair from seed
  const seedBytes = Buffer.from(receiveAddr.stealthSeed, "base64");
  const stealthKeypair = Keypair.fromSeed(seedBytes);

  if (stealthKeypair.publicKey.toBase58() !== stealthAddress) {
    throw new Error("Stealth keypair reconstruction mismatch");
  }

  const isNativeSol = !tokenMint || tokenMint === "native" || tokenMint === NATIVE_SOL_MINT;

  // Determine destination — Privacy Cash pool or ShadowWire pool
  const poolAddress = PRIVACY_CASH_POOL || getPoolKeypair().publicKey.toBase58();
  const poolPubkey = new PublicKey(poolAddress);

  const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();
  const transaction = new Transaction();

  if (isNativeSol) {
    // Reserve some lamports for tx fee
    const feeBuffer = 5000;
    const transferAmount = Math.max(0, amount - feeBuffer);

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: stealthKeypair.publicKey,
        toPubkey: poolPubkey,
        lamports: transferAmount,
      })
    );
  } else {
    // SPL token transfer (stealth ATA → pool ATA)
    const mintPubkey = new PublicKey(tokenMint!);
    const stealthAta = deriveAta(stealthKeypair.publicKey, mintPubkey);
    const poolAta = deriveAta(poolPubkey, mintPubkey);

    // Create pool ATA if needed (stealth pays rent)
    const poolAtaExists = await accountExists(poolAta.toBase58());
    if (!poolAtaExists) {
      transaction.add({
        keys: [
          { pubkey: stealthKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: poolAta, isSigner: false, isWritable: true },
          { pubkey: poolPubkey, isSigner: false, isWritable: false },
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
    transferData.writeUInt8(3, 0); // Transfer instruction index
    transferData.writeBigUInt64LE(BigInt(amount), 1);

    transaction.add({
      keys: [
        { pubkey: stealthAta, isSigner: false, isWritable: true },
        { pubkey: poolAta, isSigner: false, isWritable: true },
        { pubkey: stealthKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: transferData,
    });

    // Close stealth ATA (recover rent to stealth, then sweep SOL too)
    const closeData = Buffer.from([9]); // CloseAccount
    transaction.add({
      keys: [
        { pubkey: stealthAta, isSigner: false, isWritable: true },
        { pubkey: stealthKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: stealthKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: closeData,
    });
  }

  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = stealthKeypair.publicKey;

  // Sign with stealth keypair (we have the full secret key)
  transaction.sign(stealthKeypair);

  // Submit
  const txSignature = await sendTransaction(transaction.serialize());
  await waitForConfirmation(txSignature);

  return txSignature;
}

// ============================================================================
// Notification Helper
// ============================================================================

/**
 * Send notification to user about inbound transfer status.
 */
export const notifyUser = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(v.literal("received"), v.literal("quarantine")),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const title =
      args.type === "received"
        ? "Transfer Received"
        : "Transfer Held for Review";

    const body =
      args.type === "received"
        ? `You received ${args.amount} via external transfer. Funds have been shielded to your Privacy Cash balance.`
        : "An incoming transfer has been held for compliance review. Your funds are safe.";

    // Schedule push notification
    await ctx.scheduler.runAfter(0, internal.notifications.send.sendToUser, {
      userId: args.userId,
      type: "crypto_receipt" as const,
      title,
      body,
      data: {
        screen: "wallet",
      },
      sourceType: "transaction" as const,
    });
  },
});
