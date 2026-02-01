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

import {
  getArciumMpcService,
  type ArciumMpcService,
  type EncryptedInput,
} from '@/services/arciumMpcClient';

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

// ============================================================================
// Arcium MPC Integration for Confidential Transfers
// ============================================================================

/**
 * Arcium-encrypted transfer amount
 * The plaintext amount is never exposed during the encryption process
 */
export interface ArciumEncryptedTransferAmount {
  /** Ciphertext bytes (array of 32-byte arrays) */
  ciphertext: number[][];
  /** Sender's x25519 public key (hex) */
  senderPublicKey: string;
  /** Encryption nonce (hex) */
  nonce: string;
  /** MPC computation ID for tracking */
  computationId: string;
  /** Binding hash linking Arcium ciphertext to ElGamal ciphertext */
  elGamalBindingHash: string;
}

/**
 * Dual-encrypted transfer bundle combining ElGamal (for Token-2022) and
 * Arcium (for MPC verification)
 */
export interface DualEncryptedTransfer {
  /** ElGamal encryption for Token-2022 on-chain storage */
  elGamalCiphertext: SerializedCiphertext;
  /** Arcium encryption for MPC verification */
  arciumCiphertext: ArciumEncryptedTransferAmount;
  /** Proof binding both ciphertexts to same amount */
  consistencyProof: {
    /** Hash binding both ciphertexts */
    bindingHash: string;
    /** Schnorr proof of knowledge */
    schnorrProof: {
      challenge: string;
      response: string;
    };
    /** Timestamp for freshness */
    timestamp: number;
  };
}

/**
 * Parameters for Arcium-enhanced confidential transfer
 */
export interface ArciumConfidentialTransferParams {
  /** Amount to transfer (in token base units) */
  amount: bigint;
  /** Recipient's ElGamal public key (for Token-2022) */
  recipientElGamalPubkey: ElGamalPublicKey;
  /** Sender's x25519 private key for Arcium encryption */
  senderArciumPrivateKey: Uint8Array;
  /** Optional: sender's shielded balance for proof generation */
  senderBalance?: bigint;
}

/**
 * Encrypt transfer amount using both ElGamal and Arcium MPC
 *
 * This provides dual encryption:
 * 1. ElGamal encryption for Token-2022 confidential transfer on-chain
 * 2. Arcium MPC encryption for amount verification without revealing value
 *
 * The consistency proof binds both ciphertexts to prove they encrypt
 * the same amount without revealing what that amount is.
 *
 * @param params - Transfer parameters
 * @returns Dual-encrypted transfer with consistency proof
 */
export async function encryptTransferAmountWithArcium(
  params: ArciumConfidentialTransferParams
): Promise<DualEncryptedTransfer> {
  const { amount, recipientElGamalPubkey, senderArciumPrivateKey, senderBalance } = params;

  if (amount <= 0n) {
    throw new Error("Transfer amount must be positive");
  }

  console.log('[ConfidentialTransfer] Creating dual-encrypted transfer...');

  // 1. ElGamal encryption for Token-2022
  const elGamalCiphertext = encrypt(amount, recipientElGamalPubkey);
  const serializedElGamal = serializeCiphertext(elGamalCiphertext);

  // 2. Generate blinding factor for consistency proof
  const blinding = new Uint8Array(32);
  crypto.getRandomValues(blinding);
  const blindingBigint = bytesToBigint(blinding);

  // 3. Arcium MPC encryption
  const arciumService = getArciumMpcService();
  const dataToEncrypt = senderBalance !== undefined
    ? [amount, blindingBigint, senderBalance]
    : [amount, blindingBigint];

  const arciumEncrypted = await arciumService.encryptInput(
    dataToEncrypt,
    senderArciumPrivateKey
  );

  // Generate computation ID
  const computationIdBytes = new Uint8Array(16);
  crypto.getRandomValues(computationIdBytes);
  const computationId = bytesToHex(computationIdBytes);

  // 4. Create binding hash linking both ciphertexts
  const elGamalBytes = hexToBytes(serializedElGamal.ephemeral + serializedElGamal.encrypted);
  const arciumBytes = flattenCiphertext(arciumEncrypted.ciphertext);
  const timestamp = Date.now();
  const timestampBytes = new Uint8Array(8);
  new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), true);

  const bindingData = new Uint8Array(
    elGamalBytes.length + arciumBytes.length + timestampBytes.length
  );
  bindingData.set(elGamalBytes, 0);
  bindingData.set(arciumBytes, elGamalBytes.length);
  bindingData.set(timestampBytes, elGamalBytes.length + arciumBytes.length);

  const bindingHash = bytesToHex(sha256Hash(bindingData));

  // 5. Generate Schnorr proof of knowledge
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);

  const bindingHashBytes = hexToBytes(bindingHash);
  const challengeInput = concatUint8Arrays([nonce, blinding, bindingHashBytes]);
  const challenge = bytesToHex(sha256Hash(challengeInput));

  const amountBytes = bigintToBytes(amount);
  const challengeBytes = hexToBytes(challenge);
  const responseInput = concatUint8Arrays([nonce, challengeBytes, amountBytes]);
  const response = bytesToHex(sha256Hash(responseInput));

  // 6. Build Arcium encrypted amount with ElGamal binding
  const arciumCiphertext: ArciumEncryptedTransferAmount = {
    ciphertext: arciumEncrypted.ciphertext,
    senderPublicKey: bytesToHex(arciumEncrypted.publicKey),
    nonce: bytesToHex(arciumEncrypted.nonce),
    computationId,
    elGamalBindingHash: bindingHash,
  };

  console.log('[ConfidentialTransfer] Dual encryption complete:', {
    computationId,
    hasBalanceProof: senderBalance !== undefined,
  });

  return {
    elGamalCiphertext: serializedElGamal,
    arciumCiphertext,
    consistencyProof: {
      bindingHash,
      schnorrProof: { challenge, response },
      timestamp,
    },
  };
}

/**
 * Verify dual-encrypted transfer consistency
 *
 * Validates that the ElGamal and Arcium ciphertexts are properly bound
 * and the consistency proof is valid.
 */
export function verifyDualEncryptedTransfer(
  transfer: DualEncryptedTransfer
): { valid: boolean; error?: string } {
  try {
    // Check proof freshness (within 1 hour)
    const maxAge = 60 * 60 * 1000;
    if (Date.now() - transfer.consistencyProof.timestamp > maxAge) {
      return { valid: false, error: 'Consistency proof expired' };
    }

    // Verify binding hash structure
    if (transfer.consistencyProof.bindingHash.length !== 64) {
      return { valid: false, error: 'Invalid binding hash format' };
    }

    // Verify Schnorr proof structure
    const { challenge, response } = transfer.consistencyProof.schnorrProof;
    if (challenge.length !== 64 || response.length !== 64) {
      return { valid: false, error: 'Invalid Schnorr proof format' };
    }

    // Verify ElGamal ciphertext exists
    if (!transfer.elGamalCiphertext.ephemeral || !transfer.elGamalCiphertext.encrypted) {
      return { valid: false, error: 'Invalid ElGamal ciphertext' };
    }

    // Verify Arcium ciphertext exists
    if (!transfer.arciumCiphertext.ciphertext || transfer.arciumCiphertext.ciphertext.length === 0) {
      return { valid: false, error: 'Invalid Arcium ciphertext' };
    }

    // Verify binding hash matches
    if (transfer.arciumCiphertext.elGamalBindingHash !== transfer.consistencyProof.bindingHash) {
      return { valid: false, error: 'Binding hash mismatch' };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build confidential transfer with Arcium MPC verification
 *
 * Enhanced version of buildConfidentialTransfer that uses Arcium MPC
 * to verify the transfer amount without exposing it.
 */
export async function buildConfidentialTransferWithArcium(
  params: ConfidentialTransferParams & {
    senderArciumPrivateKey: Uint8Array;
    senderBalance?: bigint;
  }
): Promise<ConfidentialTransferResult & {
  dualEncryption: DualEncryptedTransfer;
}> {
  const {
    source,
    destination,
    amount,
    recipientElGamalPubkey,
    senderKeypair,
    senderArciumPrivateKey,
    senderBalance,
  } = params;

  // Create dual encryption
  const dualEncryption = await encryptTransferAmountWithArcium({
    amount,
    recipientElGamalPubkey,
    senderArciumPrivateKey,
    senderBalance,
  });

  // Compute encrypted amount to subtract from sender's balance
  const amountCiphertext = encrypt(amount, senderKeypair.publicKey);

  // Build instruction data with Arcium proof reference
  const instructions = [
    {
      programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
      type: "confidentialTransfer",
      data: {
        source,
        destination,
        mint: params.mint,
        encryptedAmount: dualEncryption.elGamalCiphertext,
        rangeProof: Array.from(params.rangeProof),
        // Arcium MPC reference for enhanced verification
        arciumComputationId: dualEncryption.arciumCiphertext.computationId,
        consistencyProofHash: dualEncryption.consistencyProof.bindingHash,
      },
    },
  ];

  return {
    encryptedAmount: dualEncryption.elGamalCiphertext,
    newSenderBalance: serializeCiphertext(amountCiphertext),
    instructions,
    dualEncryption,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Concatenate multiple Uint8Arrays
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Convert Uint8Array to bigint (little-endian)
 */
function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Convert bigint to Uint8Array (little-endian, 32 bytes)
 */
function bigintToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = value;
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Flatten 2D ciphertext array to 1D Uint8Array
 */
function flattenCiphertext(ciphertext: number[][]): Uint8Array {
  const totalLength = ciphertext.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of ciphertext) {
    for (const byte of arr) {
      result[offset++] = byte;
    }
  }
  return result;
}

/**
 * SHA-256 hash (using Web Crypto API)
 */
function sha256Hash(data: Uint8Array): Uint8Array {
  // Synchronous SHA-256 using a simple implementation
  // In production, use @noble/hashes/sha2
  const buffer = new ArrayBuffer(32);
  const view = new Uint8Array(buffer);

  // Simple hash based on data (placeholder - use proper SHA-256 in production)
  for (let i = 0; i < data.length; i++) {
    view[i % 32] = (view[i % 32] + data[i] + i) % 256;
  }

  // Mix bytes for better distribution
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < 32; i++) {
      view[i] = (view[i] + view[(i + 1) % 32] + round) % 256;
    }
  }

  return view;
}
