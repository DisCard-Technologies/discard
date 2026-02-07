/**
 * Deposit Monitor — Cron-based polling for inbound deposits at stealth addresses
 *
 * Polls active receive addresses every 60 seconds for incoming deposits.
 * When a deposit is detected:
 *   1. Extract sender address from on-chain transaction
 *   2. Record deposit in receiveAddresses table
 *   3. Trigger compliance screening + auto-shield pipeline
 *
 * Phase 3 upgrade path: replace polling with Helius webhooks.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

import {
  getBalance,
  getTokenAccountBalance,
  NATIVE_SOL_MINT,
  rpcCall,
} from "../lib/solanaRpc";

// ============================================================================
// Configuration
// ============================================================================

/** Minimum deposit to process (avoid dust attacks) — 1000 lamports / 0.001 USDC */
const MIN_DEPOSIT_LAMPORTS = 1000;

// ============================================================================
// Deposit Monitor (Cron Action)
// ============================================================================

/**
 * Poll all active receive addresses for incoming deposits.
 * Runs on a 1-minute cron schedule.
 */
export const pollForDeposits = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all active receive addresses
    const activeAddresses = await ctx.runQuery(
      internal.external.receiveAddresses.getActiveAddresses,
      {}
    );

    if (activeAddresses.length === 0) return;

    console.log(`[DepositMonitor] Checking ${activeAddresses.length} active receive addresses`);

    for (const addr of activeAddresses) {
      try {
        // Check for balance at stealth address
        let balance = 0;
        let depositTokenMint: string | undefined;

        if (!addr.tokenMint || addr.tokenMint === "native" || addr.tokenMint === NATIVE_SOL_MINT) {
          // Check native SOL balance
          balance = await getBalance(addr.stealthAddress);
          if (balance > 0) {
            depositTokenMint = NATIVE_SOL_MINT;
          }
        }

        // Also check USDC balance (most common SPL deposit)
        if (balance === 0) {
          try {
            const usdcMint = addr.tokenMint && addr.tokenMint !== "native" && addr.tokenMint !== NATIVE_SOL_MINT
              ? addr.tokenMint
              : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC mainnet
            const tokenBal = await getTokenAccountBalance(addr.stealthAddress, usdcMint);
            balance = parseInt(tokenBal.amount, 10);
            if (balance > 0) {
              depositTokenMint = usdcMint;
            }
          } catch {
            // Token account doesn't exist — no SPL deposit
          }
        }

        if (balance < MIN_DEPOSIT_LAMPORTS) continue;

        console.log(`[DepositMonitor] Deposit detected at ${addr.stealthAddress.slice(0, 8)}...: ${balance}`);

        // Extract sender address from recent transactions
        const senderAddress = await extractSenderAddress(addr.stealthAddress);

        // Record the deposit
        await ctx.runMutation(internal.external.receiveAddresses.recordDeposit, {
          stealthAddress: addr.stealthAddress,
          senderAddress: senderAddress || "unknown",
          depositTxSignature: `poll_${Date.now()}`, // Placeholder — real sig from getSignaturesForAddress
          depositAmount: balance,
          depositTokenMint,
        });

        // Trigger the compliance + shield pipeline
        await ctx.runAction(internal.external.inboundShield.processInboundDeposit, {
          receiveAddressId: addr._id,
          stealthAddress: addr.stealthAddress,
          senderAddress: senderAddress || "unknown",
          depositAmount: balance,
          depositTokenMint,
        });
      } catch (error) {
        console.error(
          `[DepositMonitor] Error checking ${addr.stealthAddress.slice(0, 8)}...:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the sender address from the most recent transaction to a stealth address.
 * Uses getSignaturesForAddress + getTransaction RPC calls.
 */
async function extractSenderAddress(stealthAddress: string): Promise<string | null> {
  try {
    // Get recent signatures for this address
    const signatures = await rpcCall("getSignaturesForAddress", [
      stealthAddress,
      { limit: 1 },
    ]);

    if (!signatures || signatures.length === 0) return null;

    const sig = signatures[0].signature;

    // Get full transaction to find sender
    const tx = await rpcCall("getTransaction", [
      sig,
      { encoding: "json", maxSupportedTransactionVersion: 0 },
    ]);

    if (!tx?.transaction?.message?.accountKeys) return null;

    // The first account key is typically the fee payer / sender
    const accountKeys = tx.transaction.message.accountKeys;
    const stealthIndex = accountKeys.findIndex(
      (key: string) => key === stealthAddress
    );

    // Return the first signer that isn't the stealth address itself
    for (const key of accountKeys) {
      if (key !== stealthAddress) {
        return key;
      }
    }

    return accountKeys[0] || null;
  } catch (error) {
    console.error("[DepositMonitor] Failed to extract sender:", error);
    return null;
  }
}
