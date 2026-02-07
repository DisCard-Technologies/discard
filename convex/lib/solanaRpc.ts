/**
 * Shared Solana RPC Helpers for Convex
 *
 * Raw fetch-based RPC functions that work in the Convex runtime
 * (avoids @solana/web3.js Connection which has browser-specific code).
 *
 * Used by:
 * - convex/shadowwire/relay.ts (outbound relay: pool → stealth)
 * - convex/actions/blinkClaim.ts (inbound relay: stealth → pool → recipient)
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";

// ============================================================================
// Configuration
// ============================================================================

const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet";
const IS_DEVNET = SOLANA_NETWORK === "devnet";

const RPC_URL = IS_DEVNET
  ? process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com"
  : process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

// ============================================================================
// SPL Token Constants
// ============================================================================

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

// ============================================================================
// Raw RPC Functions
// ============================================================================

export async function rpcCall(method: string, params: any[]): Promise<any> {
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

export async function getBalance(pubkey: string): Promise<number> {
  const result = await rpcCall("getBalance", [pubkey, { commitment: "confirmed" }]);
  return result.value;
}

export async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const result = await rpcCall("getLatestBlockhash", [{ commitment: "confirmed" }]);
  return {
    blockhash: result.value.blockhash,
    lastValidBlockHeight: result.value.lastValidBlockHeight,
  };
}

export async function sendTransaction(serializedTx: Uint8Array): Promise<string> {
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

/** Convert Uint8Array to base64 without Buffer (Convex runtime compatible) */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert base64 to Uint8Array without Buffer (Convex runtime compatible) */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function getSignatureStatus(signature: string): Promise<{ confirmed: boolean; err: any }> {
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

export async function waitForConfirmation(signature: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getSignatureStatus(signature);
    if (status.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status.confirmed) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Transaction confirmation timeout");
}

export async function getTransaction(signature: string): Promise<any> {
  const result = await rpcCall("getTransaction", [
    signature,
    { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ]);
  return result;
}

// ============================================================================
// Account Helpers
// ============================================================================

/** Check if an account exists on-chain via RPC */
export async function accountExists(address: string): Promise<boolean> {
  try {
    const result = await rpcCall("getAccountInfo", [address, { encoding: "base64" }]);
    return result.value !== null;
  } catch {
    return false;
  }
}

/** Derive Associated Token Address (deterministic PDA) */
export function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/**
 * Get SPL token balance for an account's ATA.
 * Returns 0 if the ATA doesn't exist.
 */
export async function getTokenAccountBalance(
  ownerAddress: string,
  mintAddress: string
): Promise<{ amount: string; decimals: number; uiAmount: number }> {
  const owner = new PublicKey(ownerAddress);
  const mint = new PublicKey(mintAddress);
  const ata = deriveAta(owner, mint);

  try {
    const result = await rpcCall("getTokenAccountBalance", [ata.toBase58(), { commitment: "confirmed" }]);
    return {
      amount: result.value.amount,
      decimals: result.value.decimals,
      uiAmount: result.value.uiAmountString ? parseFloat(result.value.uiAmountString) : 0,
    };
  } catch {
    return { amount: "0", decimals: 0, uiAmount: 0 };
  }
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { RPC_URL, IS_DEVNET, SOLANA_NETWORK };
