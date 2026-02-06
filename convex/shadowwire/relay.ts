/**
 * ShadowWire Relay - Server-side relay for sender privacy
 *
 * This module handles the second step of private transfers:
 * 1. User sends to ShadowWire Pool (visible: User → Pool)
 * 2. Pool forwards to Stealth Address (visible: Pool → Stealth)
 *
 * Result: On-chain observer sees Pool → Stealth, not User → Stealth
 *
 * Note: Uses raw fetch for Solana RPC calls because @solana/web3.js
 * Connection class has browser-specific code that doesn't work in Convex.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

// ============================================================================
// Configuration
// ============================================================================

const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet";
const IS_DEVNET = SOLANA_NETWORK === "devnet";

const RPC_URL = IS_DEVNET
  ? process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com"
  : process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

// Pool keypair from environment (server-side only - never expose to client)
const POOL_PRIVATE_KEY = process.env.SHADOWWIRE_POOL_PRIVATE_KEY;

// ============================================================================
// Raw RPC Helper Functions (avoiding @solana/web3.js Connection)
// ============================================================================

async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
  }
  return data.result;
}

async function getBalance(pubkey: string): Promise<number> {
  const result = await rpcCall("getBalance", [pubkey, { commitment: "confirmed" }]);
  return result.value;
}

async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const result = await rpcCall("getLatestBlockhash", [{ commitment: "confirmed" }]);
  return {
    blockhash: result.value.blockhash,
    lastValidBlockHeight: result.value.lastValidBlockHeight,
  };
}

async function sendTransaction(serializedTx: Uint8Array): Promise<string> {
  // Convert Uint8Array to base64 without using Node.js Buffer
  const base64Tx = uint8ArrayToBase64(serializedTx);
  const signature = await rpcCall("sendTransaction", [
    base64Tx,
    {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
    },
  ]);
  return signature;
}

// Helper to convert Uint8Array to base64 without Buffer
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function getSignatureStatus(signature: string): Promise<{ confirmed: boolean; err: any }> {
  const result = await rpcCall("getSignatureStatuses", [[signature]]);
  const status = result.value[0];
  if (!status) {
    return { confirmed: false, err: null };
  }
  return {
    confirmed: status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized",
    err: status.err,
  };
}

async function waitForConfirmation(signature: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getSignatureStatus(signature);
    if (status.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status.confirmed) {
      return true;
    }
    // Wait 1 second between checks
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Transaction confirmation timeout");
}

async function getTransaction(signature: string): Promise<any> {
  const result = await rpcCall("getTransaction", [
    signature,
    { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ]);
  return result;
}

// ============================================================================
// SPL Token Constants & Helpers (raw, no @solana/spl-token in Convex)
// ============================================================================

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Derive Associated Token Address (deterministic PDA)
 */
function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/**
 * Check if an account exists on-chain via RPC
 */
async function accountExists(address: string): Promise<boolean> {
  try {
    const result = await rpcCall("getAccountInfo", [address, { encoding: "base64" }]);
    return result.value !== null;
  } catch {
    return false;
  }
}

/**
 * Build a raw SPL token transfer transaction with ATA creation if needed.
 * Uses @solana/web3.js Transaction + manual instruction building.
 */
async function buildSplRelayTransaction(
  poolKeypair: Keypair,
  stealthAddress: string,
  mintAddress: string,
  amount: number,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<Transaction> {
  const mintPubkey = new PublicKey(mintAddress);
  const stealthPubkey = new PublicKey(stealthAddress);
  const poolAta = deriveAta(poolKeypair.publicKey, mintPubkey);
  const stealthAta = deriveAta(stealthPubkey, mintPubkey);

  const transaction = new Transaction();

  // Create stealth ATA if it doesn't exist (pool pays rent)
  const stealthAtaExists = await accountExists(stealthAta.toBase58());
  if (!stealthAtaExists) {
    // createAssociatedTokenAccountInstruction (manual)
    transaction.add({
      keys: [
        { pubkey: poolKeypair.publicKey, isSigner: true, isWritable: true },   // payer
        { pubkey: stealthAta, isSigner: false, isWritable: true },             // ata
        { pubkey: stealthPubkey, isSigner: false, isWritable: false },         // owner
        { pubkey: mintPubkey, isSigner: false, isWritable: false },            // mint
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.alloc(0), // No data needed for create ATA
    });
  }

  // SPL Token Transfer instruction (instruction index 3)
  const transferData = Buffer.alloc(9);
  transferData.writeUInt8(3, 0); // Transfer instruction index
  transferData.writeBigUInt64LE(BigInt(amount), 1);

  transaction.add({
    keys: [
      { pubkey: poolAta, isSigner: false, isWritable: true },             // source
      { pubkey: stealthAta, isSigner: false, isWritable: true },          // destination
      { pubkey: poolKeypair.publicKey, isSigner: true, isWritable: false }, // authority
    ],
    programId: TOKEN_PROGRAM_ID,
    data: transferData,
  });

  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = poolKeypair.publicKey;

  return transaction;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getPoolKeypair(): Keypair {
  if (!POOL_PRIVATE_KEY) {
    throw new Error("SHADOWWIRE_POOL_PRIVATE_KEY not configured");
  }
  const secretKey = bs58.decode(POOL_PRIVATE_KEY);
  return Keypair.fromSecretKey(secretKey);
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Relay funds from the ShadowWire Pool to a stealth address
 *
 * This is called after the user has deposited funds to the pool.
 * The pool then forwards to the stealth address, hiding the original sender.
 */
export const relayToStealth = action({
  args: {
    stealthAddress: v.string(),
    amountLamports: v.number(),
    depositTxSignature: v.string(), // Proof that user deposited
    tokenMint: v.optional(v.string()), // SPL token mint (if not native SOL)
  },
  handler: async (ctx, args) => {
    console.log("[ShadowWire Relay] Starting relay to stealth address:", {
      stealth: args.stealthAddress.slice(0, 8) + "...",
      amount: args.amountLamports / LAMPORTS_PER_SOL,
      depositTx: args.depositTxSignature.slice(0, 16) + "...",
      rpc: RPC_URL.slice(0, 30) + "...",
    });

    try {
      const poolKeypair = getPoolKeypair();

      // Verify the deposit transaction exists and is confirmed
      const depositTx = await getTransaction(args.depositTxSignature);
      if (!depositTx) {
        throw new Error("Deposit transaction not found or not confirmed");
      }

      // Check pool balance
      const poolBalance = await getBalance(poolKeypair.publicKey.toBase58());
      const requiredBalance = args.amountLamports + 5000; // Amount + fee buffer

      console.log("[ShadowWire Relay] Pool balance check:", {
        poolBalance: poolBalance / LAMPORTS_PER_SOL,
        required: requiredBalance / LAMPORTS_PER_SOL,
      });

      if (poolBalance < requiredBalance) {
        throw new Error(`Insufficient pool balance: have ${poolBalance}, need ${requiredBalance}`);
      }

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();

      // Determine if this is a native SOL or SPL token relay
      const isNativeSol = !args.tokenMint ||
        args.tokenMint === "native" ||
        args.tokenMint === NATIVE_SOL_MINT;

      let transaction: Transaction;

      if (isNativeSol) {
        // Native SOL relay
        transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: poolKeypair.publicKey,
            toPubkey: new PublicKey(args.stealthAddress),
            lamports: args.amountLamports,
          })
        );
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = poolKeypair.publicKey;
      } else {
        // SPL token relay (e.g. USDC)
        console.log("[ShadowWire Relay] Building SPL token relay for mint:", args.tokenMint!.slice(0, 8) + "...");
        transaction = await buildSplRelayTransaction(
          poolKeypair,
          args.stealthAddress,
          args.tokenMint!,
          args.amountLamports,
          blockhash,
          lastValidBlockHeight
        );
      }

      // Sign with pool keypair
      transaction.sign(poolKeypair);

      // Submit transaction (serialize returns Uint8Array)
      const relaySignature = await sendTransaction(transaction.serialize());

      console.log("[ShadowWire Relay] Transaction sent:", relaySignature);

      // Wait for confirmation
      await waitForConfirmation(relaySignature);

      console.log("[ShadowWire Relay] Transaction confirmed:", relaySignature);

      return {
        success: true,
        relaySignature,
        poolAddress: poolKeypair.publicKey.toBase58(),
      };
    } catch (error) {
      console.error("[ShadowWire Relay] Failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Relay failed",
      };
    }
  },
});

/**
 * Get the ShadowWire Pool address and balance
 */
export const getPoolInfo = action({
  args: {},
  handler: async () => {
    try {
      const poolKeypair = getPoolKeypair();
      const balance = await getBalance(poolKeypair.publicKey.toBase58());

      return {
        address: poolKeypair.publicKey.toBase58(),
        balance: balance / LAMPORTS_PER_SOL,
        balanceLamports: balance,
        network: IS_DEVNET ? "devnet" : "mainnet",
      };
    } catch (error) {
      console.error("[ShadowWire Relay] Failed to get pool info:", error);
      return {
        address: null,
        balance: 0,
        balanceLamports: 0,
        network: IS_DEVNET ? "devnet" : "mainnet",
        error: error instanceof Error ? error.message : "Failed to get pool info",
      };
    }
  },
});

/**
 * Check if a deposit to the pool has been confirmed
 */
export const verifyDeposit = action({
  args: {
    txSignature: v.string(),
    expectedAmount: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const poolKeypair = getPoolKeypair();
      const tx = await getTransaction(args.txSignature);

      if (!tx) {
        return { verified: false, reason: "Transaction not found" };
      }

      if (tx.meta?.err) {
        return { verified: false, reason: "Transaction failed" };
      }

      // Check if the pool received the expected amount
      const postBalances = tx.meta?.postBalances || [];
      const preBalances = tx.meta?.preBalances || [];
      const accountKeys = tx.transaction?.message?.accountKeys || [];

      const poolIndex = accountKeys.findIndex(
        (key: string) => key === poolKeypair.publicKey.toBase58()
      );

      if (poolIndex === -1) {
        return { verified: false, reason: "Pool not found in transaction" };
      }

      const received = (postBalances[poolIndex] || 0) - (preBalances[poolIndex] || 0);

      if (received < args.expectedAmount) {
        return {
          verified: false,
          reason: `Insufficient deposit: expected ${args.expectedAmount}, received ${received}`,
        };
      }

      return {
        verified: true,
        receivedAmount: received,
        blockTime: tx.blockTime,
      };
    } catch (error) {
      console.error("[ShadowWire Relay] Deposit verification failed:", error);
      return {
        verified: false,
        reason: error instanceof Error ? error.message : "Verification failed",
      };
    }
  },
});
