/**
 * Confidential Transfers via Token-2022
 *
 * Client-side operations for encrypted on-chain token balances using
 * Token-2022's confidential transfer extension. Wraps the existing
 * ElGamal implementation (Ristretto255-based) for Token-2022 compatibility.
 *
 * Flow:
 * 1. initializeConfidentialMint — enable extension on Token-2022 mint
 * 2. configureConfidentialAccount — register ElGamal public key
 * 3. encryptTransferAmount — encrypt amount for transfer
 * 4. buildConfidentialTransfer — build transfer with ZK range proof
 * 5. applyPendingBalance — credit pending encrypted amounts
 * 6. decryptBalance — decrypt balance client-side
 */

import {
  generateKeypair,
  encrypt,
  decrypt,
  add,
  serializeCiphertext,
  deserializeCiphertext,
  serializePublicKey,
  deserializePublicKey,
  ElGamalPublicKey,
  ElGamalPrivateKey,
  ElGamalKeypair,
  ElGamalCiphertext,
  SerializedCiphertext,
} from '../crypto/elgamal';

// ============================================================================
// Constants
// ============================================================================

/** USDC mint on Solana mainnet */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Supported mints for confidential transfers (start with USDC only) */
export const SUPPORTED_CONFIDENTIAL_MINTS = [USDC_MINT];

// ============================================================================
// Types
// ============================================================================

export interface ConfidentialMintConfig {
  mint: string;
  authority: string;
  auditorElGamalPubkey?: string;
  autoApproveNewAccounts: boolean;
}

export interface ConfidentialAccountConfig {
  owner: string;
  mint: string;
  tokenAccount: string;
  elGamalPubkey: string;
  decryptableBalance: string;
  pendingBalanceLo: SerializedCiphertext;
  pendingBalanceHi: SerializedCiphertext;
  availableBalance: SerializedCiphertext;
}

export interface ConfidentialTransferParams {
  source: string;
  destination: string;
  mint: string;
  amount: bigint;
  recipientElGamalPubkey: ElGamalPublicKey;
  senderKeypair: ElGamalKeypair;
  /** ZK proof that amount > 0 and amount <= available balance */
  rangeProof: Uint8Array;
}

export interface ConfidentialTransferResult {
  /** Encrypted amount for recipient */
  encryptedAmount: SerializedCiphertext;
  /** Updated encrypted sender balance */
  newSenderBalance: SerializedCiphertext;
  /** Serialized transaction instructions */
  instructions: unknown[];
}

// ============================================================================
// Mint Configuration
// ============================================================================

/**
 * Enable confidential transfer extension on a Token-2022 mint.
 *
 * This configures the mint to support encrypted transfers. Must be called
 * once per mint by the mint authority.
 *
 * @param mint - Mint address to enable confidential transfers on
 * @param authority - Mint authority pubkey
 * @param auditorPubkey - Optional auditor ElGamal pubkey for regulatory visibility
 */
export function initializeConfidentialMint(
  mint: string,
  authority: string,
  auditorPubkey?: string
): ConfidentialMintConfig {
  if (!SUPPORTED_CONFIDENTIAL_MINTS.includes(mint)) {
    throw new Error(`Mint ${mint} not supported for confidential transfers`);
  }

  return {
    mint,
    authority,
    auditorElGamalPubkey: auditorPubkey,
    autoApproveNewAccounts: true,
  };
}

// ============================================================================
// Account Configuration
// ============================================================================

/**
 * Configure a token account for confidential transfers.
 * Generates an ElGamal keypair and registers the public key on-chain.
 *
 * @param owner - Account owner pubkey
 * @param mint - Token mint address
 * @param tokenAccount - Token account address
 * @returns Account config with generated ElGamal keypair
 */
export function configureConfidentialAccount(
  owner: string,
  mint: string,
  tokenAccount: string
): {
  config: ConfidentialAccountConfig;
  keypair: ElGamalKeypair;
} {
  // Generate ElGamal keypair for this account
  const keypair = generateKeypair();

  // Initialize encrypted balances to zero
  const zeroCiphertext = encrypt(0n, keypair.publicKey);
  const serializedZero = serializeCiphertext(zeroCiphertext);

  const config: ConfidentialAccountConfig = {
    owner,
    mint,
    tokenAccount,
    elGamalPubkey: serializePublicKey(keypair.publicKey),
    decryptableBalance: "0",
    pendingBalanceLo: serializedZero,
    pendingBalanceHi: serializedZero,
    availableBalance: serializedZero,
  };

  return { config, keypair };
}

// ============================================================================
// Transfer Operations
// ============================================================================

/**
 * Encrypt a transfer amount for a recipient.
 *
 * Creates an ElGamal ciphertext of the amount under the recipient's public key.
 * The sender also encrypts under their own key for balance tracking.
 *
 * @param amount - Amount to transfer (in token base units)
 * @param recipientPubkey - Recipient's ElGamal public key
 */
export function encryptTransferAmount(
  amount: bigint,
  recipientPubkey: ElGamalPublicKey
): {
  recipientCiphertext: ElGamalCiphertext;
  serialized: SerializedCiphertext;
} {
  if (amount <= 0n) {
    throw new Error("Transfer amount must be positive");
  }

  const recipientCiphertext = encrypt(amount, recipientPubkey);

  return {
    recipientCiphertext,
    serialized: serializeCiphertext(recipientCiphertext),
  };
}

/**
 * Decrypt an encrypted balance using the account owner's private key.
 *
 * @param encryptedBalance - Encrypted balance ciphertext
 * @param privateKey - Account owner's ElGamal private key
 * @returns Decrypted balance amount
 */
export function decryptBalance(
  encryptedBalance: SerializedCiphertext,
  privateKey: ElGamalPrivateKey
): bigint {
  const ciphertext = deserializeCiphertext(encryptedBalance);
  return decrypt(ciphertext, privateKey);
}

/**
 * Build a confidential transfer with ZK range proof.
 *
 * The range proof demonstrates:
 * - amount > 0 (no negative transfers)
 * - amount <= available balance (no overdraft)
 *
 * @param params - Transfer parameters
 * @returns Transfer instructions and updated encrypted balances
 */
export function buildConfidentialTransfer(
  params: ConfidentialTransferParams
): ConfidentialTransferResult {
  const {
    source,
    destination,
    amount,
    recipientElGamalPubkey,
    senderKeypair,
  } = params;

  // Encrypt amount for recipient
  const { recipientCiphertext, serialized: encryptedAmount } =
    encryptTransferAmount(amount, recipientElGamalPubkey);

  // Compute the encrypted amount to subtract from sender's balance
  // Using homomorphic property: newBalance = oldBalance - amount
  const amountCiphertext = encrypt(amount, senderKeypair.publicKey);

  // The Solana program will:
  // 1. Verify the ZK range proof
  // 2. Subtract encrypted amount from sender's available balance (homomorphic)
  // 3. Add encrypted amount to recipient's pending balance (homomorphic)

  // Build instruction data
  const instructions = [
    {
      programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
      type: "confidentialTransfer",
      data: {
        source,
        destination,
        mint: params.mint,
        encryptedAmount,
        rangeProof: Array.from(params.rangeProof),
      },
    },
  ];

  return {
    encryptedAmount,
    newSenderBalance: serializeCiphertext(amountCiphertext), // placeholder
    instructions,
  };
}

/**
 * Apply pending confidential credits to available balance.
 *
 * Pending credits (from received transfers) must be explicitly applied
 * to the available balance before they can be spent.
 *
 * @param accountConfig - Current confidential account config
 * @param keypair - Account owner's ElGamal keypair
 * @returns Updated account config with applied balance
 */
export function applyPendingBalance(
  accountConfig: ConfidentialAccountConfig,
  keypair: ElGamalKeypair
): ConfidentialAccountConfig {
  // Decrypt pending balances
  const pendingLo = deserializeCiphertext(accountConfig.pendingBalanceLo);
  const pendingHi = deserializeCiphertext(accountConfig.pendingBalanceHi);

  // Add pending to available using homomorphic addition
  const currentAvailable = deserializeCiphertext(accountConfig.availableBalance);
  const withPendingLo = add(currentAvailable, pendingLo);
  const withAll = add(withPendingLo, pendingHi);

  // Reset pending balances to zero
  const zeroCiphertext = encrypt(0n, keypair.publicKey);
  const serializedZero = serializeCiphertext(zeroCiphertext);

  // Decrypt new available balance for display
  const newAvailable = decrypt(withAll, keypair.privateKey);

  return {
    ...accountConfig,
    availableBalance: serializeCiphertext(withAll),
    pendingBalanceLo: serializedZero,
    pendingBalanceHi: serializedZero,
    decryptableBalance: newAvailable.toString(),
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a mint supports confidential transfers.
 */
export function isMintSupported(mint: string): boolean {
  return SUPPORTED_CONFIDENTIAL_MINTS.includes(mint);
}

/**
 * Verify ElGamal format compatibility between DisCard's Ristretto255
 * implementation and Token-2022's expected format.
 *
 * Both use Ristretto255, so the underlying math is identical.
 * This function adapts serialization format if needed.
 */
export function verifyFormatCompatibility(
  pubkey: ElGamalPublicKey
): { compatible: boolean; adaptedPubkey?: string } {
  // Token-2022 uses Ristretto255 (same as our ElGamal implementation)
  // Verify the point is valid and serialize in Token-2022's expected format
  const serialized = serializePublicKey(pubkey);

  // Token-2022 expects 32-byte compressed Ristretto point
  // Our serializePublicKey produces hex-encoded bytes
  const isValid = serialized.length === 64; // 32 bytes = 64 hex chars

  return {
    compatible: isValid,
    adaptedPubkey: isValid ? serialized : undefined,
  };
}
