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
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

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
      responses[i] = bytesToBigInt(randomScalar());
    }
  }
  
  // 6. Compute initial challenge at signer position
  // L_s = G^alpha
  const L_s = ed25519.ExtendedPoint.BASE.multiply(bytesToBigInt(alpha));
  // R_s = H_p(P_s)^alpha
  const H_p_s = hashToPoint(signerPublicKey);
  const R_s = H_p_s.multiply(bytesToBigInt(alpha));
  
  // Hash to get initial challenge
  const c_next = hashPoints(messageHash, L_s, R_s);
  challenges[(signerIndex + 1) % ringSize] = c_next;
  
  // 7. Loop through ring computing challenges
  for (let i = (signerIndex + 1) % ringSize; i !== signerIndex; i = (i + 1) % ringSize) {
    const pubKey = ed25519.ExtendedPoint.fromHex(bytesToHex(ringPublicKeys[i]));
    const c_i = challenges[i];
    const r_i = responses[i];
    
    // L_i = G^r_i + P_i^c_i
    const L_i = ed25519.ExtendedPoint.BASE.multiply(r_i).add(pubKey.multiply(c_i));
    
    // R_i = H_p(P_i)^r_i + I^c_i
    const H_p_i = hashToPoint(ringPublicKeys[i]);
    const keyImagePoint = ed25519.ExtendedPoint.fromHex(keyImage);
    const R_i = H_p_i.multiply(r_i).add(keyImagePoint.multiply(c_i));
    
    // Next challenge
    challenges[(i + 1) % ringSize] = hashPoints(messageHash, L_i, R_i);
  }
  
  // 8. Close the ring: compute response for signer
  const c_s = challenges[signerIndex];
  const x = bytesToBigInt(signerPrivateKey);
  const alphaBig = bytesToBigInt(alpha);
  
  // r_s = alpha - c_s * x (mod order)
  const order = ed25519.CURVE.n;
  responses[signerIndex] = mod(alphaBig - c_s * x, order);
  
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
    const keyImagePoint = ed25519.ExtendedPoint.fromHex(keyImage);
    
    // Verify ring equation for all members
    let c_next = BigInt('0x' + challenges[0]);
    
    for (let i = 0; i < ringSize; i++) {
      const pubKey = ed25519.ExtendedPoint.fromHex(ring[i]);
      const c_i = BigInt('0x' + challenges[i]);
      const r_i = BigInt('0x' + responses[i]);
      
      // Compute L_i = G^r_i + P_i^c_i
      const L_i = ed25519.ExtendedPoint.BASE.multiply(r_i).add(pubKey.multiply(c_i));
      
      // Compute R_i = H_p(P_i)^r_i + I^c_i
      const H_p_i = hashToPoint(hexToBytes(ring[i]));
      const R_i = H_p_i.multiply(r_i).add(keyImagePoint.multiply(c_i));
      
      // Compute next challenge
      c_next = hashPoints(messageHash, L_i, R_i);
      
      // Verify it matches stored challenge
      const expectedChallenge = BigInt('0x' + challenges[(i + 1) % ringSize]);
      if (c_next !== expectedChallenge && i !== ringSize - 1) {
        return false;
      }
    }
    
    // Ring closes: last challenge should match first
    const firstChallenge = BigInt('0x' + challenges[0]);
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
  const x = bytesToBigInt(privateKey);
  const H_p = hashToPoint(publicKey);
  const keyImage = H_p.multiply(x);
  return bytesToHex(keyImage.toRawBytes());
}

/**
 * Hash-to-point function
 * 
 * Deterministically maps bytes to curve point.
 */
function hashToPoint(data: Uint8Array): typeof ed25519.ExtendedPoint {
  // Hash data to get point seed
  const hash = sha512(new Uint8Array([...data, 0x00]));
  
  // Use first 32 bytes as scalar, multiply base point
  const scalar = bytesToBigInt(hash.slice(0, 32));
  return ed25519.ExtendedPoint.BASE.multiply(scalar);
}

/**
 * Hash points to generate challenge
 */
function hashPoints(
  messageHash: string,
  L: typeof ed25519.ExtendedPoint,
  R: typeof ed25519.ExtendedPoint
): bigint {
  const data = new TextEncoder().encode(
    `${messageHash}:${bytesToHex(L.toRawBytes())}:${bytesToHex(R.toRawBytes())}`
  );
  const hash = sha256(data);
  return bytesToBigInt(hash);
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
