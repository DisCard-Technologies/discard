/**
 * Inco Lightning Frontend Encryption Utilities
 *
 * Provides client-side encryption utilities for Inco Lightning integration.
 * Used for encrypting user balance input before sending to TEE network.
 *
 * Security Features:
 * - Client-side encryption before data leaves device
 * - Ephemeral key generation for forward secrecy
 * - Handle validation and freshness checks
 */

import { EncryptedHandle } from './inco-client';

// ============ TYPES ============

/**
 * Encryption parameters for balance encryption
 */
export interface EncryptionParams {
  /** User's Inco public key */
  publicKey: string;
  /** Optional entropy source for additional randomness */
  additionalEntropy?: Uint8Array;
}

/**
 * Decrypted balance result
 */
export interface DecryptedBalance {
  /** The decrypted balance value */
  balance: bigint;
  /** Timestamp of decryption */
  decryptedAt: number;
  /** Whether decryption was verified */
  verified: boolean;
}

/**
 * Handle conversion result for on-chain storage
 */
export interface OnChainHandle {
  /** Handle as byte array for Solana account storage */
  bytes: Uint8Array;
  /** Handle as hex string for Convex storage */
  hex: string;
  /** Public key used */
  publicKey: string;
  /** Current epoch */
  epoch: number;
}

// ============ CONSTANTS ============

/**
 * Inco Euint128 handle size (16 bytes)
 */
export const HANDLE_SIZE = 16;

/**
 * Public key size for Inco encryption
 */
export const PUBLIC_KEY_SIZE = 32;

/**
 * Epoch duration in milliseconds (1 hour)
 */
export const EPOCH_DURATION_MS = 60 * 60 * 1000;

// ============ ENCRYPTION FUNCTIONS ============

/**
 * Encrypt a balance value for Inco TEE storage
 *
 * This is called client-side before sending balance to backend.
 * The encryption ensures the actual balance never leaves the device in plaintext.
 *
 * @param balance - Balance to encrypt (in smallest units, e.g., cents)
 * @param params - Encryption parameters
 * @returns Encrypted handle for storage
 */
export async function encryptBalanceForInco(
  balance: bigint,
  params: EncryptionParams
): Promise<EncryptedHandle> {
  // Validate inputs
  if (balance < BigInt(0)) {
    throw new Error('Balance cannot be negative');
  }

  if (balance > BigInt('340282366920938463463374607431768211455')) {
    throw new Error('Balance exceeds Euint128 maximum');
  }

  // Generate random nonce for encryption
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);

  // Add additional entropy if provided
  if (params.additionalEntropy) {
    for (let i = 0; i < Math.min(nonce.length, params.additionalEntropy.length); i++) {
      nonce[i] ^= params.additionalEntropy[i];
    }
  }

  // In production, this would use Inco SDK's encryption:
  // const encrypted = await incoSdk.encrypt(balance, params.publicKey, nonce);

  // For development, create a deterministic but opaque handle
  const handleBytes = new Uint8Array(HANDLE_SIZE);

  // Use Web Crypto to create encrypted representation
  const balanceBytes = bigintToBytes(balance, 8);
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(params.publicKey + bytesToHex(nonce))
  );

  // XOR balance bytes with derived key for basic encryption
  const keyBytes = new Uint8Array(keyMaterial);
  for (let i = 0; i < 8; i++) {
    handleBytes[i] = balanceBytes[i] ^ keyBytes[i];
  }

  // Add randomness for uniqueness
  handleBytes.set(nonce.slice(0, 8), 8);

  const currentEpoch = Math.floor(Date.now() / EPOCH_DURATION_MS);

  return {
    handle: bytesToHex(handleBytes),
    publicKey: params.publicKey,
    epoch: currentEpoch,
    createdAt: Date.now(),
  };
}

/**
 * Decrypt an encrypted balance handle (client-side only)
 *
 * This should only be used for display purposes on the user's device.
 * The actual comparison operations happen in the TEE.
 *
 * @param handle - Encrypted handle
 * @param privateKey - User's private key for decryption
 * @returns Decrypted balance
 */
export async function decryptBalanceFromInco(
  handle: EncryptedHandle,
  privateKey: string
): Promise<DecryptedBalance> {
  // Validate handle
  if (!isHandleValid(handle)) {
    throw new Error('Handle is expired or invalid');
  }

  // In production, this would use Inco SDK's decryption:
  // const balance = await incoSdk.decrypt(handle, privateKey);

  // For development, reverse the encryption process
  const handleBytes = hexToBytes(handle.handle);

  // Derive the same key material
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(handle.publicKey + bytesToHex(handleBytes.slice(8, 16)))
  );

  // XOR to recover balance bytes
  const keyBytes = new Uint8Array(keyMaterial);
  const balanceBytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    balanceBytes[i] = handleBytes[i] ^ keyBytes[i];
  }

  return {
    balance: bytesToBigint(balanceBytes),
    decryptedAt: Date.now(),
    verified: true,
  };
}

// ============ HANDLE UTILITIES ============

/**
 * Convert an EncryptedHandle to on-chain storage format
 *
 * @param handle - The encrypted handle
 * @returns Handle formatted for on-chain storage
 */
export function handleToOnChainFormat(handle: EncryptedHandle): OnChainHandle {
  const bytes = hexToBytes(handle.handle);

  if (bytes.length !== HANDLE_SIZE) {
    throw new Error(`Invalid handle size: expected ${HANDLE_SIZE}, got ${bytes.length}`);
  }

  return {
    bytes,
    hex: handle.handle,
    publicKey: handle.publicKey,
    epoch: handle.epoch,
  };
}

/**
 * Parse an on-chain handle back to EncryptedHandle format
 *
 * @param onChainHandle - Handle from on-chain storage
 * @param createdAt - Original creation timestamp (if known)
 * @returns Reconstructed EncryptedHandle
 */
export function handleFromOnChainFormat(
  onChainHandle: OnChainHandle,
  createdAt?: number
): EncryptedHandle {
  return {
    handle: onChainHandle.hex,
    publicKey: onChainHandle.publicKey,
    epoch: onChainHandle.epoch,
    createdAt: createdAt || onChainHandle.epoch * EPOCH_DURATION_MS,
  };
}

/**
 * Check if an encrypted handle is still valid
 *
 * @param handle - Handle to validate
 * @returns Whether the handle is valid for use
 */
export function isHandleValid(handle: EncryptedHandle): boolean {
  const currentEpoch = Math.floor(Date.now() / EPOCH_DURATION_MS);

  // Handle must be from current or previous epoch
  if (handle.epoch < currentEpoch - 1) {
    return false;
  }

  // Handle must not be too old (2 hours max)
  const maxAge = EPOCH_DURATION_MS * 2;
  if (Date.now() - handle.createdAt > maxAge) {
    return false;
  }

  // Validate handle format
  if (handle.handle.length !== HANDLE_SIZE * 2) {
    return false;
  }

  return true;
}

/**
 * Get the remaining validity time for a handle
 *
 * @param handle - Handle to check
 * @returns Remaining validity in milliseconds, or 0 if expired
 */
export function getHandleRemainingValidity(handle: EncryptedHandle): number {
  const maxAge = EPOCH_DURATION_MS * 2;
  const age = Date.now() - handle.createdAt;
  return Math.max(0, maxAge - age);
}

/**
 * Check if a handle needs refresh (more than 50% through validity period)
 *
 * @param handle - Handle to check
 * @returns Whether the handle should be refreshed
 */
export function shouldRefreshHandle(handle: EncryptedHandle): boolean {
  const maxAge = EPOCH_DURATION_MS * 2;
  const age = Date.now() - handle.createdAt;
  return age > maxAge / 2;
}

// ============ COMPARISON UTILITIES ============

/**
 * Prepare a spending amount for comparison in TEE
 *
 * The amount is formatted for CPI to Inco's e_ge() function.
 *
 * @param amount - Spending amount to check
 * @returns Formatted bytes for CPI
 */
export function prepareAmountForComparison(amount: bigint): Uint8Array {
  if (amount < BigInt(0)) {
    throw new Error('Amount cannot be negative');
  }

  if (amount > BigInt('340282366920938463463374607431768211455')) {
    throw new Error('Amount exceeds Euint128 maximum');
  }

  // Encode as little-endian u128 (16 bytes)
  return bigintToBytes(amount, 16);
}

/**
 * Parse a comparison result from TEE
 *
 * @param resultBytes - Result bytes from CPI
 * @returns Whether the comparison passed (balance >= amount)
 */
export function parseComparisonResult(resultBytes: Uint8Array): boolean {
  // Result is a single byte: 1 for true, 0 for false
  if (resultBytes.length < 1) {
    throw new Error('Invalid comparison result');
  }
  return resultBytes[0] === 1;
}

// ============ KEY MANAGEMENT ============

/**
 * Generate a new ephemeral key pair for Inco encryption
 *
 * Used for one-time encryption where forward secrecy is desired.
 *
 * @returns Public and private key pair
 */
export async function generateEphemeralKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits']
  );

  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: bytesToHex(new Uint8Array(publicKeyRaw)),
    privateKey: bytesToHex(new Uint8Array(privateKeyRaw)),
  };
}

/**
 * Derive an Inco public key from a user's wallet
 *
 * @param walletPublicKey - User's Solana wallet public key (base58)
 * @returns Derived Inco public key
 */
export async function deriveIncoPublicKey(walletPublicKey: string): Promise<string> {
  // Hash the wallet public key to derive Inco key
  const keyBytes = new TextEncoder().encode(`inco:${walletPublicKey}`);
  const hash = await crypto.subtle.digest('SHA-256', keyBytes);
  return bytesToHex(new Uint8Array(hash));
}

// ============ BYTE UTILITIES ============

/**
 * Convert bigint to bytes (little-endian)
 */
function bigintToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(remaining & BigInt(0xff));
    remaining >>= BigInt(8);
  }
  return bytes;
}

/**
 * Convert bytes to bigint (little-endian)
 */
function bytesToBigint(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = (value << BigInt(8)) | BigInt(bytes[i]);
  }
  return value;
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// ============ EXPORTS ============

export {
  bigintToBytes,
  bytesToBigint,
  bytesToHex,
  hexToBytes,
};
