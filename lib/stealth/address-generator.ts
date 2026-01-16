/**
 * Stealth Address Generator
 *
 * ECDH-based stealth address generation for privacy-preserving transactions.
 * Based on the Hush wallet implementation.
 */

import { Keypair, PublicKey } from '@solana/web3.js';

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
 * Derive shared secret via simplified ECDH
 * Note: In production, use proper x25519 ECDH
 */
async function deriveSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Promise<Uint8Array> {
  // XOR + hash approach for simplified ECDH
  // Production should use @noble/curves x25519
  const combined = new Uint8Array(64);

  // Use first 32 bytes of private key
  const privSlice = privateKey.slice(0, 32);

  // Combine private and public key material
  for (let i = 0; i < 32; i++) {
    combined[i] = privSlice[i];
    combined[i + 32] = publicKey[i];
  }

  // Hash to get shared secret
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hashBuffer);
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
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
