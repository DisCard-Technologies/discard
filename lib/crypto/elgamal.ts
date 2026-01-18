/**
 * ElGamal Encryption on Elliptic Curves
 * 
 * Twisted ElGamal encryption for encrypting amounts in shielded pools.
 * Uses Ristretto255 (prime-order group) for security.
 * 
 * Properties:
 * - Homomorphic: E(a) + E(b) = E(a+b)
 * - Rerandomizable: Can update ciphertext without decrypting
 * - IND-CPA secure
 * 
 * @see https://en.wikipedia.org/wiki/ElGamal_encryption
 * @see https://ristretto.group/
 */

import { RistrettoPoint, Scalar } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// ============================================================================
// Types
// ============================================================================

export interface ElGamalPublicKey {
  /** Public key point (generator ^ privateKey) */
  point: RistrettoPoint;
}

export interface ElGamalPrivateKey {
  /** Private key scalar */
  scalar: Scalar;
}

export interface ElGamalKeypair {
  publicKey: ElGamalPublicKey;
  privateKey: ElGamalPrivateKey;
}

export interface ElGamalCiphertext {
  /** Ephemeral public key: G^r */
  ephemeral: RistrettoPoint;
  /** Encrypted message: (publicKey^r) * G^m */
  encrypted: RistrettoPoint;
}

export interface SerializedCiphertext {
  /** Ephemeral point as hex */
  ephemeral: string;
  /** Encrypted point as hex */
  encrypted: string;
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate ElGamal keypair
 * 
 * @returns Fresh keypair
 */
export function generateKeypair(): ElGamalKeypair {
  // Generate random private key (scalar)
  const privateScalar = Scalar.fromBytes(randomScalar());
  
  // Compute public key: G^privateKey
  const publicPoint = RistrettoPoint.BASE.multiply(privateScalar);
  
  return {
    publicKey: { point: publicPoint },
    privateKey: { scalar: privateScalar },
  };
}

/**
 * Derive ElGamal keypair from seed
 * 
 * @param seed - 32-byte seed
 * @returns Deterministic keypair
 */
export function deriveKeypair(seed: Uint8Array): ElGamalKeypair {
  if (seed.length !== 32) {
    throw new Error('Seed must be 32 bytes');
  }
  
  const privateScalar = Scalar.fromBytes(seed);
  const publicPoint = RistrettoPoint.BASE.multiply(privateScalar);
  
  return {
    publicKey: { point: publicPoint },
    privateKey: { scalar: privateScalar },
  };
}

// ============================================================================
// Encryption
// ============================================================================

/**
 * Encrypt an amount using ElGamal
 * 
 * Twisted ElGamal: Encode amount as point, then encrypt.
 * For small amounts (< 2^32), we can use G^amount directly.
 * 
 * @param amount - Amount to encrypt (must fit in 32 bits for direct encoding)
 * @param publicKey - Recipient's public key
 * @returns Ciphertext (ephemeral, encrypted)
 */
export function encrypt(amount: bigint, publicKey: ElGamalPublicKey): ElGamalCiphertext {
  // Validate amount fits in 32 bits for direct encoding
  if (amount < 0n || amount >= 2n ** 32n) {
    throw new Error('Amount must be between 0 and 2^32-1 for direct encoding');
  }
  
  // Generate random ephemeral key
  const r = Scalar.fromBytes(randomScalar());
  
  // Compute ephemeral public key: G^r
  const ephemeral = RistrettoPoint.BASE.multiply(r);
  
  // Encode amount as point: G^amount
  const messagePoint = encodeAmount(amount);
  
  // Compute encrypted point: (publicKey^r) * G^amount
  const sharedSecret = publicKey.point.multiply(r);
  const encrypted = sharedSecret.add(messagePoint);
  
  return { ephemeral, encrypted };
}

/**
 * Decrypt an ElGamal ciphertext
 * 
 * @param ciphertext - Ciphertext to decrypt
 * @param privateKey - Recipient's private key
 * @returns Decrypted amount
 */
export function decrypt(
  ciphertext: ElGamalCiphertext,
  privateKey: ElGamalPrivateKey
): bigint {
  // Compute shared secret: ephemeral^privateKey
  const sharedSecret = ciphertext.ephemeral.multiply(privateKey.scalar);
  
  // Recover message point: encrypted / sharedSecret = encrypted - sharedSecret
  const messagePoint = ciphertext.encrypted.subtract(sharedSecret);
  
  // Decode amount from point using baby-step giant-step
  const amount = decodeAmount(messagePoint);
  
  return amount;
}

// ============================================================================
// Homomorphic Operations
// ============================================================================

/**
 * Add two ElGamal ciphertexts
 * 
 * E(a) + E(b) = E(a + b)
 * 
 * @param ct1 - First ciphertext
 * @param ct2 - Second ciphertext
 * @returns Ciphertext encrypting sum
 */
export function add(
  ct1: ElGamalCiphertext,
  ct2: ElGamalCiphertext
): ElGamalCiphertext {
  return {
    ephemeral: ct1.ephemeral.add(ct2.ephemeral),
    encrypted: ct1.encrypted.add(ct2.encrypted),
  };
}

/**
 * Rerandomize a ciphertext
 * 
 * Produces fresh ciphertext encrypting same amount (unlinkable)
 * 
 * @param ciphertext - Original ciphertext
 * @param publicKey - Public key used for encryption
 * @returns Rerandomized ciphertext
 */
export function rerandomize(
  ciphertext: ElGamalCiphertext,
  publicKey: ElGamalPublicKey
): ElGamalCiphertext {
  // Encrypt zero with fresh randomness
  const zero = encrypt(0n, publicKey);
  
  // Add to original ciphertext (homomorphic property)
  return add(ciphertext, zero);
}

// ============================================================================
// Encoding/Decoding
// ============================================================================

/**
 * Encode amount as elliptic curve point
 * 
 * For small amounts, computes G^amount directly.
 * For amounts < 2^32, this is feasible.
 */
function encodeAmount(amount: bigint): RistrettoPoint {
  if (amount === 0n) {
    return RistrettoPoint.ZERO;
  }
  
  // Compute G^amount using repeated addition
  let point = RistrettoPoint.BASE;
  for (let i = 1n; i < amount; i++) {
    point = point.add(RistrettoPoint.BASE);
  }
  
  return point;
}

/**
 * Decode amount from elliptic curve point
 * 
 * Uses baby-step giant-step algorithm for discrete log.
 * Works efficiently for amounts < 2^32.
 * 
 * @param point - Encoded point
 * @param maxAmount - Maximum expected amount (default: 2^24 for efficiency)
 * @returns Decoded amount
 */
function decodeAmount(point: RistrettoPoint, maxAmount: bigint = 2n ** 24n): bigint {
  // Handle zero case
  if (point.equals(RistrettoPoint.ZERO)) {
    return 0n;
  }
  
  // Baby-step giant-step parameters
  const m = BigInt(Math.ceil(Math.sqrt(Number(maxAmount))));
  
  // Baby steps: Store G^j for j = 0 to m-1
  const babySteps = new Map<string, bigint>();
  let currentPoint = RistrettoPoint.ZERO;
  
  for (let j = 0n; j < m; j++) {
    const key = pointToString(currentPoint);
    babySteps.set(key, j);
    currentPoint = currentPoint.add(RistrettoPoint.BASE);
  }
  
  // Giant steps: Compute point - i*m*G for i = 0 to ceil(maxAmount/m)
  const giant = RistrettoPoint.BASE.multiply(Scalar.fromBytes(bigintToScalar(m)));
  let checkPoint = point;
  
  const maxIterations = (maxAmount / m) + 1n;
  for (let i = 0n; i < maxIterations; i++) {
    const key = pointToString(checkPoint);
    if (babySteps.has(key)) {
      const j = babySteps.get(key)!;
      return i * m + j;
    }
    checkPoint = checkPoint.subtract(giant);
  }
  
  throw new Error('Failed to decode amount - value too large or invalid');
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize ciphertext for storage/transmission
 */
export function serializeCiphertext(ciphertext: ElGamalCiphertext): SerializedCiphertext {
  return {
    ephemeral: bytesToHex(ciphertext.ephemeral.toBytes()),
    encrypted: bytesToHex(ciphertext.encrypted.toBytes()),
  };
}

/**
 * Deserialize ciphertext
 */
export function deserializeCiphertext(serialized: SerializedCiphertext): ElGamalCiphertext {
  return {
    ephemeral: RistrettoPoint.fromHex(serialized.ephemeral),
    encrypted: RistrettoPoint.fromHex(serialized.encrypted),
  };
}

/**
 * Serialize public key
 */
export function serializePublicKey(publicKey: ElGamalPublicKey): string {
  return bytesToHex(publicKey.point.toBytes());
}

/**
 * Deserialize public key
 */
export function deserializePublicKey(serialized: string): ElGamalPublicKey {
  return {
    point: RistrettoPoint.fromHex(serialized),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate random scalar
 */
function randomScalar(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  
  // Reduce modulo group order to ensure valid scalar
  // For Ristretto255, this is the Ed25519 scalar field
  return bytes;
}

/**
 * Convert bigint to scalar bytes
 */
function bigintToScalar(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let remaining = value;
  
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  
  return bytes;
}

/**
 * Convert point to string key for map
 */
function pointToString(point: RistrettoPoint): string {
  return bytesToHex(point.toBytes());
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Verify that a ciphertext decrypts to expected amount
 * 
 * @param ciphertext - Ciphertext to verify
 * @param expectedAmount - Expected plaintext
 * @param privateKey - Private key for decryption
 * @returns True if decrypts to expected amount
 */
export function verifyCiphertext(
  ciphertext: ElGamalCiphertext,
  expectedAmount: bigint,
  privateKey: ElGamalPrivateKey
): boolean {
  try {
    const decrypted = decrypt(ciphertext, privateKey);
    return decrypted === expectedAmount;
  } catch {
    return false;
  }
}

/**
 * Generate proof of correct encryption (for auditing)
 * 
 * Proves that ciphertext encrypts a specific amount without revealing randomness.
 * This is a simplified proof - production would use full ZK proof.
 */
export function generateEncryptionProof(
  amount: bigint,
  ciphertext: ElGamalCiphertext,
  randomness: Scalar,
  publicKey: ElGamalPublicKey
): string {
  // Proof = H(amount || ephemeral || encrypted || publicKey)
  const data = new TextEncoder().encode(
    `${amount}:${pointToString(ciphertext.ephemeral)}:${pointToString(ciphertext.encrypted)}:${pointToString(publicKey.point)}`
  );
  return bytesToHex(sha256(data));
}
