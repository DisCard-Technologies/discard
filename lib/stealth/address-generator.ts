/**
 * Stealth Address Generator
 *
 * ECDH-based stealth address generation for privacy-preserving transactions.
 * Based on the Hush wallet implementation.
 * 
 * Uses X25519 (Curve25519) for ECDH key agreement.
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

// ============ TYPES ============

export interface StealthMeta {
  /** Stealth address */
  address: string;
  /** Ephemeral public key (for recipient to derive private key) */
  ephemeralPubKey: string;
  /** Shared secret hash (for verification) */
  sharedSecretHash: string;
  /** Timestamp */
  createdAt: number;
}

export interface DerivedKey {
  /** Derived address */
  address: string;
  /** Private key bytes */
  privateKey: Uint8Array;
  /** Public key bytes */
  publicKey: Uint8Array;
}

// ============ CORE FUNCTIONS ============

/**
 * Generate a stealth address for a recipient
 *
 * @param recipientPubKey - Recipient's master public key
 * @returns Stealth address metadata
 */
export async function generateStealthAddress(
  recipientPubKey: PublicKey | string
): Promise<StealthMeta> {
  const recipient = typeof recipientPubKey === 'string'
    ? new PublicKey(recipientPubKey)
    : recipientPubKey;

  // Generate ephemeral keypair (one-time use)
  const ephemeral = Keypair.generate();

  // Derive shared secret
  const sharedSecret = await deriveSharedSecret(
    ephemeral.secretKey,
    recipient.toBytes()
  );

  // Derive stealth keypair from shared secret
  const stealthKeypair = deriveKeypairFromSecret(sharedSecret);

  // Hash shared secret for metadata
  const sharedSecretHash = await hashBytes(sharedSecret);

  return {
    address: stealthKeypair.publicKey.toBase58(),
    ephemeralPubKey: ephemeral.publicKey.toBase58(),
    sharedSecretHash,
    createdAt: Date.now(),
  };
}

/**
 * Derive stealth private key (for recipient to spend)
 *
 * @param recipientPrivKey - Recipient's master private key
 * @param ephemeralPubKey - Ephemeral public key from sender
 * @returns Derived key information
 */
export async function deriveStealthKey(
  recipientPrivKey: Uint8Array,
  ephemeralPubKey: PublicKey | string
): Promise<DerivedKey> {
  const ephemeral = typeof ephemeralPubKey === 'string'
    ? new PublicKey(ephemeralPubKey)
    : ephemeralPubKey;

  // Derive same shared secret (ECDH property)
  const sharedSecret = await deriveSharedSecret(
    recipientPrivKey,
    ephemeral.toBytes()
  );

  // Derive same stealth keypair
  const stealthKeypair = deriveKeypairFromSecret(sharedSecret);

  return {
    address: stealthKeypair.publicKey.toBase58(),
    privateKey: stealthKeypair.secretKey,
    publicKey: stealthKeypair.publicKey.toBytes(),
  };
}

/**
 * Check if stealth address belongs to recipient
 *
 * @param stealthAddress - Address to check
 * @param recipientPrivKey - Recipient's private key
 * @param ephemeralPubKey - Ephemeral public key
 * @returns True if address belongs to recipient
 */
export async function isOwnStealthAddress(
  stealthAddress: string,
  recipientPrivKey: Uint8Array,
  ephemeralPubKey: string
): Promise<boolean> {
  try {
    const derived = await deriveStealthKey(recipientPrivKey, ephemeralPubKey);
    return derived.address === stealthAddress;
  } catch {
    return false;
  }
}

// ============ HELPER FUNCTIONS ============

/**
 * Derive shared secret via X25519 ECDH
 * 
 * Uses Curve25519 for Diffie-Hellman key agreement.
 * Both parties compute the same shared secret:
 * - Sender: sharedSecret = x25519(ephemeralPrivate, recipientPublic)
 * - Recipient: sharedSecret = x25519(recipientPrivate, ephemeralPublic)
 * 
 * @param privateKey - Ed25519 or X25519 private key (first 32 bytes used)
 * @param publicKey - Ed25519 or X25519 public key (first 32 bytes used)
 * @returns 32-byte shared secret
 */
async function deriveSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Promise<Uint8Array> {
  try {
    // Extract first 32 bytes (Solana keys are 64 bytes with private+public)
    const privKey32 = privateKey.slice(0, 32);
    const pubKey32 = publicKey.slice(0, 32);
    
    // Perform X25519 ECDH
    // This computes: scalar_multiply(privKey, pubKey) on Curve25519
    const sharedSecret = x25519.getSharedSecret(privKey32, pubKey32);
    
    // Additional hash for key derivation (optional but recommended)
    // Provides domain separation and ensures uniform distribution
    const hashedSecret = sha256(sharedSecret);
    
    return hashedSecret;
  } catch (error) {
    console.error('[StealthAddress] ECDH failed:', error);
    throw new Error('Failed to derive shared secret via X25519 ECDH');
  }
}

/**
 * Derive keypair from shared secret
 */
function deriveKeypairFromSecret(secret: Uint8Array): Keypair {
  // Use secret as seed (must be exactly 32 bytes)
  const seed = secret.slice(0, 32);
  return Keypair.fromSeed(seed);
}

/**
 * Hash bytes to hex string
 */
async function hashBytes(bytes: Uint8Array): Promise<string> {
  const hash = sha256(bytes);
  return Array.from(hash).map((b: number) => b.toString(16).padStart(2, '0')).join('');
}

// ============ BATCH OPERATIONS ============

/**
 * Generate multiple stealth addresses
 */
export async function generateBatch(
  recipientPubKey: PublicKey | string,
  count: number
): Promise<StealthMeta[]> {
  const addresses: StealthMeta[] = [];

  for (let i = 0; i < count; i++) {
    const address = await generateStealthAddress(recipientPubKey);
    addresses.push(address);
  }

  return addresses;
}

/**
 * Scan addresses to find ones belonging to recipient
 */
export async function scanAddresses(
  addresses: Array<{ address: string; ephemeralPubKey: string }>,
  recipientPrivKey: Uint8Array
): Promise<DerivedKey[]> {
  const matches: DerivedKey[] = [];

  for (const { address, ephemeralPubKey } of addresses) {
    const isOwn = await isOwnStealthAddress(address, recipientPrivKey, ephemeralPubKey);
    if (isOwn) {
      const derived = await deriveStealthKey(recipientPrivKey, ephemeralPubKey);
      matches.push(derived);
    }
  }

  return matches;
}
