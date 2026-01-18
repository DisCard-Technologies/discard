/**
 * Ring Signatures on Elliptic Curves
 * 
 * Implements Borromean-style ring signatures for sender anonymity.
 * Based on Monero's approach but simplified for Solana's Ed25519.
 * 
 * Properties:
 * - Anonymity: Signer hidden among ring members
 * - Unforgeability: Only ring member can sign
 * - Linkability: Key images prevent double-signing
 * 
 * @see https://web.getmonero.org/library/Zero-to-Monero-2-0-0.pdf
 * @see https://eprint.iacr.org/2015/1098.pdf (Borromean)
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Get curve order from @noble/curves v2 API
const CURVE_ORDER = ed25519.Point.Fn.ORDER;

// ============================================================================
// Types
// ============================================================================

export interface RingSignature {
  /** Ring member public keys */
  ring: string[];
  /** Key image (prevents double-signing) */
  keyImage: string;
  /** Challenge values for each ring member */
  challenges: string[];
  /** Response values for each ring member */
  responses: string[];
  /** Message that was signed */
  messageHash: string;
}

export interface RingSignatureParams {
  /** Message to sign */
  message: Uint8Array;
  /** Signer's private key */
  signerPrivateKey: Uint8Array;
  /** Signer's index in ring (0-based) */
  signerIndex: number;
  /** All ring member public keys (including signer) */
  ringPublicKeys: Uint8Array[];
}

// ============================================================================
// Ring Signature Generation
// ============================================================================

/**
 * Generate a ring signature
 * 
 * Proves signer is one of the ring members without revealing which one.
 * 
 * @param params - Signature parameters
 * @returns Ring signature
 */
export function generateRingSignature(params: RingSignatureParams): RingSignature {
  const { message, signerPrivateKey, signerIndex, ringPublicKeys } = params;
  
  if (signerIndex < 0 || signerIndex >= ringPublicKeys.length) {
    throw new Error('Invalid signer index');
  }
  
  const ringSize = ringPublicKeys.length;
  
  // 1. Compute key image: I = x * H_p(P) where x is private key, P is public key
  const signerPublicKey = ed25519.getPublicKey(signerPrivateKey);
  const keyImage = computeKeyImage(signerPrivateKey, signerPublicKey);
  
  // 2. Hash message
  const messageHash = bytesToHex(sha256(message));
  
  // 3. Generate random alpha for signer
  const alpha = randomScalar();
  
  // 4. Initialize challenges and responses
  const challenges: bigint[] = new Array(ringSize);
  const responses: bigint[] = new Array(ringSize);
  
  // 5. Generate random responses for all positions except signer
  for (let i = 0; i < ringSize; i++) {
    if (i !== signerIndex) {
      responses[i] = bytesToValidScalar(randomScalar());
    }
  }

  // 6. Compute initial challenge at signer position
  // L_s = G^alpha
  const alphaScalar = bytesToValidScalar(alpha);
  const L_s = ed25519.Point.BASE.multiply(alphaScalar);
  // R_s = H_p(P_s)^alpha
  const H_p_s = hashToPoint(signerPublicKey);
  const R_s = H_p_s.multiply(alphaScalar);

  // Hash to get initial challenge
  const c_next = hashPoints(messageHash, L_s, R_s);
  challenges[(signerIndex + 1) % ringSize] = c_next;
  
  // 7. Loop through ring computing challenges
  for (let i = (signerIndex + 1) % ringSize; i !== signerIndex; i = (i + 1) % ringSize) {
    const pubKey = ed25519.Point.fromHex(bytesToHex(ringPublicKeys[i]));
    const c_i = ensureValidScalar(challenges[i]);
    const r_i = ensureValidScalar(responses[i]);

    // L_i = G^r_i + P_i^c_i
    const L_i = ed25519.Point.BASE.multiply(r_i).add(pubKey.multiply(c_i));

    // R_i = H_p(P_i)^r_i + I^c_i
    const H_p_i = hashToPoint(ringPublicKeys[i]);
    const keyImagePoint = ed25519.Point.fromHex(keyImage);
    const R_i = H_p_i.multiply(r_i).add(keyImagePoint.multiply(c_i));

    // Next challenge (already reduced by hashPoints)
    challenges[(i + 1) % ringSize] = hashPoints(messageHash, L_i, R_i);
  }

  // 8. Close the ring: compute response for signer
  const c_s = challenges[signerIndex];
  const x = bytesToValidScalar(signerPrivateKey);

  // r_s = alpha - c_s * x (mod order)
  // Note: c_s might be 0, so we use mod directly without ensureValidScalar
  responses[signerIndex] = mod(alphaScalar - mod(c_s, CURVE_ORDER) * x, CURVE_ORDER);
  
  // 9. Return ring signature
  return {
    ring: ringPublicKeys.map(pk => bytesToHex(pk)),
    keyImage,
    challenges: challenges.map(c => c.toString(16)),
    responses: responses.map(r => r.toString(16)),
    messageHash,
  };
}

/**
 * Verify a ring signature
 * 
 * @param signature - Ring signature to verify
 * @param message - Original message
 * @returns True if signature is valid
 */
export function verifyRingSignature(signature: RingSignature, message: Uint8Array): boolean {
  try {
    const { ring, keyImage, challenges, responses, messageHash } = signature;
    
    // Verify message hash
    const computedHash = bytesToHex(sha256(message));
    if (computedHash !== messageHash) {
      return false;
    }
    
    const ringSize = ring.length;
    const keyImagePoint = ed25519.Point.fromHex(keyImage);
    
    // Verify ring equation for all members
    let c_next = BigInt('0x' + challenges[0]);
    
    for (let i = 0; i < ringSize; i++) {
      const pubKey = ed25519.Point.fromHex(ring[i]);
      const c_i = BigInt('0x' + challenges[i]);
      const r_i = BigInt('0x' + responses[i]);

      // Ensure scalars are valid for point multiplication
      const c_i_valid = ensureValidScalar(c_i);
      const r_i_valid = ensureValidScalar(r_i);

      // Compute L_i = G^r_i + P_i^c_i
      const L_i = ed25519.Point.BASE.multiply(r_i_valid).add(pubKey.multiply(c_i_valid));

      // Compute R_i = H_p(P_i)^r_i + I^c_i
      const H_p_i = hashToPoint(hexToBytes(ring[i]));
      const R_i = H_p_i.multiply(r_i_valid).add(keyImagePoint.multiply(c_i_valid));

      // Compute next challenge
      c_next = hashPoints(messageHash, L_i, R_i);

      // Verify it matches stored challenge (compare reduced values)
      const expectedChallenge = mod(BigInt('0x' + challenges[(i + 1) % ringSize]), CURVE_ORDER);
      if (c_next !== expectedChallenge && i !== ringSize - 1) {
        return false;
      }
    }
    
    // Ring closes: last challenge should match first (compare reduced values)
    const firstChallenge = mod(BigInt('0x' + challenges[0]), CURVE_ORDER);
    return c_next === firstChallenge;
    
  } catch (error) {
    console.error('[RingSignature] Verification failed:', error);
    return false;
  }
}

/**
 * Check if a key image has been used (double-signing detection)
 * 
 * @param keyImage - Key image to check
 * @param usedKeyImages - Set of used key images
 * @returns True if key image is already used
 */
export function isKeyImageUsed(keyImage: string, usedKeyImages: Set<string>): boolean {
  return usedKeyImages.has(keyImage);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute key image: I = x * H_p(P)
 *
 * Key image proves ownership without revealing public key.
 */
function computeKeyImage(privateKey: Uint8Array, publicKey: Uint8Array): string {
  const x = bytesToValidScalar(privateKey);
  const H_p = hashToPoint(publicKey);
  const keyImage = H_p.multiply(x);
  return bytesToHex(keyImage.toBytes());
}

/**
 * Hash-to-point function
 * 
 * Deterministically maps bytes to curve point.
 */
function hashToPoint(data: Uint8Array): typeof ed25519.Point {
  // Hash data to get point seed
  const hash = sha512(new Uint8Array([...data, 0x00]));

  // Use first 32 bytes as scalar, reduce modulo curve order, multiply base point
  const rawScalar = bytesToBigInt(hash.slice(0, 32));
  // Ensure scalar is in valid range: 1 <= scalar < CURVE_ORDER
  const scalar = mod(rawScalar, CURVE_ORDER - 1n) + 1n;
  return ed25519.Point.BASE.multiply(scalar);
}

/**
 * Hash points to generate challenge
 */
function hashPoints(
  messageHash: string,
  L: typeof ed25519.Point,
  R: typeof ed25519.Point
): bigint {
  const data = new TextEncoder().encode(
    `${messageHash}:${bytesToHex(L.toBytes())}:${bytesToHex(R.toBytes())}`
  );
  const hash = sha256(data);
  // Reduce modulo curve order to ensure valid scalar for point multiplication
  return mod(bytesToBigInt(hash), CURVE_ORDER);
}

/**
 * Generate cryptographically secure random scalar
 */
function randomScalar(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Convert bytes to a valid scalar (reduced modulo curve order)
 * For @noble/curves, scalars must be in range [1, CURVE_ORDER)
 */
function bytesToValidScalar(bytes: Uint8Array): bigint {
  const raw = bytesToBigInt(bytes);
  // Reduce modulo curve order
  const reduced = mod(raw, CURVE_ORDER);
  // If zero, return 1 (rare edge case)
  return reduced === 0n ? 1n : reduced;
}

/**
 * Ensure a bigint is a valid scalar for point multiplication
 */
function ensureValidScalar(n: bigint): bigint {
  const reduced = mod(n, CURVE_ORDER);
  return reduced === 0n ? 1n : reduced;
}

/**
 * Convert bytes to bigint (little-endian)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Modulo operation that handles negative numbers correctly
 */
function mod(a: bigint, n: bigint): bigint {
  const result = a % n;
  return result < 0n ? result + n : result;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Generate multiple ring signatures in batch
 * 
 * Useful for mixing multiple transactions.
 */
export function generateBatchRingSignatures(
  messages: Uint8Array[],
  signerPrivateKey: Uint8Array,
  signerIndex: number,
  ringPublicKeys: Uint8Array[]
): RingSignature[] {
  return messages.map(message => 
    generateRingSignature({
      message,
      signerPrivateKey,
      signerIndex,
      ringPublicKeys,
    })
  );
}

/**
 * Verify multiple ring signatures in batch
 */
export function verifyBatchRingSignatures(
  signatures: RingSignature[],
  messages: Uint8Array[]
): boolean {
  if (signatures.length !== messages.length) {
    return false;
  }
  
  for (let i = 0; i < signatures.length; i++) {
    if (!verifyRingSignature(signatures[i], messages[i])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check for linkability (same signer in multiple signatures)
 * 
 * @param signatures - Array of signatures to check
 * @returns True if any key images are reused (linkable)
 */
export function checkLinkability(signatures: RingSignature[]): {
  linkable: boolean;
  linkedIndices?: [number, number];
} {
  const keyImages = new Set<string>();
  
  for (let i = 0; i < signatures.length; i++) {
    if (keyImages.has(signatures[i].keyImage)) {
      // Found duplicate key image - signatures are linkable
      const firstIndex = signatures.findIndex(s => s.keyImage === signatures[i].keyImage);
      return {
        linkable: true,
        linkedIndices: [firstIndex, i],
      };
    }
    keyImages.add(signatures[i].keyImage);
  }
  
  return { linkable: false };
}
