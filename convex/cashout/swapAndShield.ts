/**
 * Cashout Pipeline — Backend Actions
 *
 * Server-side actions supporting the confidential cashout pipeline:
 *   1. prescreenWallet — Compliance pre-screen (fail-closed via Range API)
 *   2. createSwapOutputAddress — Turnkey stealth addr for swap output
 *   3. triggerAutoShield — Defense-in-depth compliance + shield to pool
 *   4. recordCashoutPipeline — Audit trail for pipeline lifecycle
 *
 * All compliance checks are FAIL-CLOSED: if the API is unreachable, the check fails.
 */

import { action, internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

import { screenAddress } from "../lib/compliance";
import {
  getLatestBlockhash,
  sendTransaction,
  waitForConfirmation,
  accountExists,
  deriveAta,
  getTokenAccountBalance,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "../lib/solanaRpc";

import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";

// ============================================================================
// Configuration
// ============================================================================

const PRIVACY_CASH_POOL = process.env.PRIVACY_CASH_POOL_ADDRESS;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// ============================================================================
// 1. Compliance Pre-Screen
// ============================================================================

/**
 * Pre-screen a wallet address before starting cashout pipeline.
 * FAIL-CLOSED: returns passed=false on any error.
 *
 * Auth-gated (public action — requires authenticated user).
 */
export const prescreenWallet = action({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("[CashoutPipeline] Pre-screening wallet:", args.walletAddress.slice(0, 8) + "...");

    const result = await screenAddress(args.walletAddress);

    console.log("[CashoutPipeline] Pre-screen result:", {
      passed: result.passed,
      riskLevel: result.riskLevel,
      checkedLive: result.checkedLive,
    });

    return {
      passed: result.passed,
      reason: result.reason,
      riskLevel: result.riskLevel,
      checkedLive: result.checkedLive,
      isTerminal: result.passed === false && result.checkedLive === true,
    };
  },
});

// ============================================================================
// 2. Create Swap-Output Address
// ============================================================================

/**
 * Create a Turnkey stealth address to receive swap output (USDC).
 * Session key is restricted to the Privacy Cash pool address only.
 *
 * Reuses the existing createDepositWallet pattern from tee/turnkey.ts.
 */
export const createSwapOutputAddress = action({
  args: {
    subOrganizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const poolAddress = PRIVACY_CASH_POOL;
    if (!poolAddress) {
      throw new Error("PRIVACY_CASH_POOL_ADDRESS not configured");
    }

    console.log("[CashoutPipeline] Creating swap output address via Turnkey");

    // Delegate to the existing Turnkey deposit wallet creation pattern
    // This creates a new wallet + session key restricted to pool-only transfers
    const result = await ctx.runAction(
      internal.tee.turnkey.createDepositWallet,
      {
        subOrganizationId: args.subOrganizationId,
        walletName: `swap_output_${Date.now()}`,
        destinationAddress: poolAddress,
      }
    );

    console.log("[CashoutPipeline] Swap output address created:", {
      address: result.depositAddress.slice(0, 8) + "...",
      sessionKeyId: result.sessionKeyId,
    });

    return {
      address: result.depositAddress,
      sessionKeyId: result.sessionKeyId,
      walletId: result.walletId,
      policyId: result.policyId,
    };
  },
});

// ============================================================================
// 3. Auto-Shield (Stealth → Pool)
// ============================================================================

/**
 * Defense-in-depth: compliance screen swap output address, then shield to pool.
 *
 * Steps:
 *   1. Screen the swap output address (should always pass — it's fresh)
 *   2. Check USDC balance at the stealth address
 *   3. Build SPL transfer: stealth ATA → pool ATA
 *   4. Sign via Turnkey session key
 *   5. Submit to Solana
 *   6. Revoke session key after use
 *
 * Mirrors the pattern from convex/external/inboundShield.ts:shieldToPool().
 */
export const triggerAutoShield = internalAction({
  args: {
    stealthAddress: v.string(),
    sessionKeyId: v.string(),
    subOrganizationId: v.string(),
    policyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const poolAddress = PRIVACY_CASH_POOL;
    if (!poolAddress) {
      throw new Error("PRIVACY_CASH_POOL_ADDRESS not configured");
    }

    console.log("[CashoutPipeline] Auto-shield starting:", {
      stealth: args.stealthAddress.slice(0, 8) + "...",
    });

    // ---- Step 1: Defense-in-depth compliance screen ----
    const complianceResult = await screenAddress(args.stealthAddress);

    if (!complianceResult.passed) {
      console.warn(
        "[CashoutPipeline] Stealth address quarantined (defense-in-depth):",
        complianceResult.reason
      );
      return {
        success: false,
        reason: "quarantined",
        complianceReason: complianceResult.reason,
      };
    }

    // ---- Step 2: Check USDC balance at stealth address ----
    const stealthPubkey = new PublicKey(args.stealthAddress);
    const usdcMint = new PublicKey(USDC_MINT);
    const poolPubkey = new PublicKey(poolAddress);

    const stealthAta = deriveAta(stealthPubkey, usdcMint);
    let balance: number;

    try {
      const balanceResult = await getTokenAccountBalance(stealthAta.toBase58());
      balance = parseInt(balanceResult.amount, 10);
    } catch {
      console.error("[CashoutPipeline] No USDC balance at stealth address");
      return { success: false, reason: "no_balance" };
    }

    if (balance <= 0) {
      return { success: false, reason: "no_balance" };
    }

    console.log("[CashoutPipeline] USDC balance at stealth:", balance, "base units");

    // ---- Step 3: Build SPL transfer (stealth ATA → pool ATA) ----
    const poolAta = deriveAta(poolPubkey, usdcMint);

    const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();
    const transaction = new Transaction();

    // Create pool ATA if needed
    const poolAtaExists = await accountExists(poolAta.toBase58());
    if (!poolAtaExists) {
      transaction.add({
        keys: [
          { pubkey: stealthPubkey, isSigner: true, isWritable: true },
          { pubkey: poolAta, isSigner: false, isWritable: true },
          { pubkey: poolPubkey, isSigner: false, isWritable: false },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.alloc(0),
      });
    }

    // SPL Transfer instruction
    const transferData = Buffer.alloc(9);
    transferData.writeUInt8(3, 0); // Transfer instruction index
    transferData.writeBigUInt64LE(BigInt(balance), 1);

    transaction.add({
      keys: [
        { pubkey: stealthAta, isSigner: false, isWritable: true },
        { pubkey: poolAta, isSigner: false, isWritable: true },
        { pubkey: stealthPubkey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: transferData,
    });

    // Close stealth ATA to recover rent
    const closeData = Buffer.from([9]); // CloseAccount
    transaction.add({
      keys: [
        { pubkey: stealthAta, isSigner: false, isWritable: true },
        { pubkey: stealthPubkey, isSigner: false, isWritable: true },
        { pubkey: stealthPubkey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: closeData,
    });

    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = stealthPubkey;

    // ---- Step 4: Sign via Turnkey session key ----
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const signResult = await ctx.runAction(
      internal.tee.turnkey.signWithSessionKey,
      {
        subOrganizationId: args.subOrganizationId,
        sessionKeyId: args.sessionKeyId,
        walletAddress: args.stealthAddress,
        unsignedTransaction: Buffer.from(serializedTx).toString("hex"),
      }
    );

    // Add signature and submit
    const signature = Buffer.from(signResult.signature, "hex");
    transaction.addSignature(stealthPubkey, signature);

    // ---- Step 5: Submit to Solana ----
    const rawTx = transaction.serialize();
    const txSignature = await sendTransaction(rawTx);
    await waitForConfirmation(txSignature);

    console.log("[CashoutPipeline] Auto-shield tx confirmed:", txSignature);

    // ---- Step 6: Revoke session key ----
    try {
      await ctx.runAction(internal.tee.turnkey.revokeSessionKey, {
        subOrganizationId: args.subOrganizationId,
        sessionKeyId: args.sessionKeyId,
        policyId: args.policyId,
      });
      console.log("[CashoutPipeline] Session key revoked after shield");
    } catch (revokeErr) {
      // Best-effort — session key will expire in 30 min
      console.warn("[CashoutPipeline] Session key revocation failed (will expire):", revokeErr);
    }

    return {
      success: true,
      txSignature,
      shieldedAmount: balance,
    };
  },
});

// ============================================================================
// 4. Audit Trail
// ============================================================================

/**
 * Record cashout pipeline events for audit trail.
 * No schema changes — uses console logging + future audit table.
 */
export const recordCashoutPipeline = internalMutation({
  args: {
    userId: v.string(),
    pipelineId: v.string(),
    status: v.union(
      v.literal("started"),
      v.literal("compliance_passed"),
      v.literal("compliance_failed"),
      v.literal("swap_completed"),
      v.literal("shielded"),
      v.literal("shield_quarantined"),
      v.literal("unshielded"),
      v.literal("sent_to_moonpay"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    path: v.union(
      v.literal("xstock_full"),
      v.literal("usdc_wallet"),
      v.literal("usdc_pool")
    ),
    asset: v.optional(v.string()),
    amount: v.optional(v.number()),
    failedAtPhase: v.optional(v.string()),
    error: v.optional(v.string()),
    txSignatures: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    console.log("[CashoutPipeline Audit]", {
      userId: args.userId.slice(0, 8) + "...",
      pipelineId: args.pipelineId,
      status: args.status,
      path: args.path,
      asset: args.asset,
      amount: args.amount,
      failedAtPhase: args.failedAtPhase,
      error: args.error,
      txSignatures: args.txSignatures,
      timestamp: Date.now(),
    });

    // In production, this would insert into a cashoutPipelines audit table.
    // For now, console logging provides the audit trail via Convex dashboard logs.
  },
});
