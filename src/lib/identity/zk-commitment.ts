/**
 * DisCard 2035 - ZK Commitment Utilities
 *
 * Implements Poseidon hashing for ZK-friendly commitments to DID documents.
 * Used for on-chain anchoring via Light Protocol without revealing the full document.
 */

import { poseidon2 } from 'poseidon-lite';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type {
  DIDDocument,
  DIDCommitment,
  DIDString,
  AlexSovereignDIDDocument,
} from './did-document';
import { canonicalizeDIDDocument } from './did-document';

// ============================================================================
// Constants
// ============================================================================

/**
 * Field modulus for BN254 (used by Poseidon in most ZK systems)
 * This is the scalar field order of the BN254 curve
 */
const FIELD_MODULUS = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

/**
 * Maximum bytes that can be encoded into a single field element
 */
const BYTES_PER_FIELD_ELEMENT = 31;

// ============================================================================
// Core Hashing Functions
// ============================================================================

/**
 * Compute SHA-256 hash of DID document
 */
export function computeDocumentHash(doc: DIDDocument): string {
  const canonical = canonicalizeDIDDocument(doc);
  const hash = sha256(new TextEncoder().encode(canonical));
  return bytesToHex(hash);
}

/**
 * Compute Poseidon hash of DID document for ZK proofs
 * Returns a commitment that can be verified in ZK circuits
 */
export function computePoseidonCommitment(doc: DIDDocument): string {
  // First compute SHA-256 of canonical document
  const docHash = computeDocumentHash(doc);

  // Convert to field elements and hash with Poseidon
  const fieldElements = bytesToFieldElements(hexToBytes(docHash));
  const commitment = hashFieldElements(fieldElements);

  return bigintToHex(commitment);
}

/**
 * Compute commitment for a specific key rotation
 */
export function computeKeyRotationCommitment(
  currentDid: DIDString,
  newPublicKey: string,
  nonce: bigint
): string {
  // Hash the inputs together
  const didBytes = new TextEncoder().encode(currentDid);
  const keyBytes = new TextEncoder().encode(newPublicKey);
  const combined = new Uint8Array(didBytes.length + keyBytes.length);
  combined.set(didBytes, 0);
  combined.set(keyBytes, didBytes.length);

  const fieldElements = bytesToFieldElements(combined);
  fieldElements.push(nonce % FIELD_MODULUS);

  const commitment = hashFieldElements(fieldElements);
  return bigintToHex(commitment);
}

/**
 * Compute commitment for recovery guardian attestation
 */
export function computeGuardianCommitment(
  didToRecover: DIDString,
  guardianDid: DIDString,
  attestationData: string,
  timestamp: number
): string {
  const combined = new TextEncoder().encode(
    `${didToRecover}:${guardianDid}:${attestationData}:${timestamp}`
  );

  const fieldElements = bytesToFieldElements(combined);
  const commitment = hashFieldElements(fieldElements);

  return bigintToHex(commitment);
}

// ============================================================================
// Commitment Creation
// ============================================================================

/**
 * Create a full DID commitment for on-chain anchoring
 */
export function createDIDCommitment(
  doc: AlexSovereignDIDDocument
): DIDCommitment {
  const documentHash = computeDocumentHash(doc);
  const commitmentHash = computePoseidonCommitment(doc);

  return {
    did: doc.id,
    documentHash,
    commitmentHash,
    timestamp: Date.now(),
  };
}

/**
 * Verify that a commitment matches a DID document
 */
export function verifyCommitment(
  doc: DIDDocument,
  commitment: DIDCommitment
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Verify document hash
  const computedDocHash = computeDocumentHash(doc);
  if (computedDocHash !== commitment.documentHash) {
    errors.push(
      `Document hash mismatch: expected ${commitment.documentHash}, got ${computedDocHash}`
    );
  }

  // Verify commitment hash
  const computedCommitment = computePoseidonCommitment(doc);
  if (computedCommitment !== commitment.commitmentHash) {
    errors.push(
      `Commitment hash mismatch: expected ${commitment.commitmentHash}, got ${computedCommitment}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Field Element Utilities
// ============================================================================

/**
 * Convert bytes to field elements for Poseidon hashing
 * Each field element is at most 31 bytes to stay within the field modulus
 */
export function bytesToFieldElements(bytes: Uint8Array): bigint[] {
  const elements: bigint[] = [];

  for (let i = 0; i < bytes.length; i += BYTES_PER_FIELD_ELEMENT) {
    const chunk = bytes.slice(i, i + BYTES_PER_FIELD_ELEMENT);
    let value = BigInt(0);

    for (let j = 0; j < chunk.length; j++) {
      value = (value << BigInt(8)) | BigInt(chunk[j]);
    }

    // Ensure value is within field
    elements.push(value % FIELD_MODULUS);
  }

  return elements;
}

/**
 * Hash multiple field elements using Poseidon
 * Uses a Merkle-Damgård-like construction for arbitrary-length inputs
 */
export function hashFieldElements(elements: bigint[]): bigint {
  if (elements.length === 0) {
    return BigInt(0);
  }

  if (elements.length === 1) {
    // Hash single element with zero
    return poseidon2([elements[0], BigInt(0)]);
  }

  if (elements.length === 2) {
    return poseidon2([elements[0], elements[1]]);
  }

  // For more than 2 elements, use chained hashing
  let accumulator = poseidon2([elements[0], elements[1]]);

  for (let i = 2; i < elements.length; i++) {
    accumulator = poseidon2([accumulator, elements[i]]);
  }

  return accumulator;
}

// ============================================================================
// Hex/BigInt Utilities
// ============================================================================

/**
 * Convert bigint to hex string (with 0x prefix)
 */
export function bigintToHex(value: bigint): string {
  const hex = value.toString(16);
  // Pad to 64 chars (32 bytes)
  return '0x' + hex.padStart(64, '0');
}

/**
 * Convert hex string to bigint
 */
export function hexToBigint(hex: string): bigint {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return BigInt('0x' + cleanHex);
}

/**
 * Generate a cryptographically secure random field element
 */
export async function generateRandomFieldElement(): Promise<bigint> {
  // Get 32 random bytes
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  // Convert to bigint and reduce modulo field
  let value = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << BigInt(8)) | BigInt(randomBytes[i]);
  }

  return value % FIELD_MODULUS;
}

// ============================================================================
// Merkle Tree Utilities (for Light Protocol integration)
// ============================================================================

/**
 * Compute Merkle leaf hash for DID commitment
 */
export function computeMerkleLeaf(commitment: DIDCommitment): bigint {
  const leafData = new TextEncoder().encode(
    `${commitment.did}:${commitment.commitmentHash}:${commitment.timestamp}`
  );

  const fieldElements = bytesToFieldElements(leafData);
  return hashFieldElements(fieldElements);
}

/**
 * Verify Merkle proof for a commitment
 */
export function verifyMerkleProof(
  leaf: bigint,
  proof: { sibling: bigint; isLeft: boolean }[],
  root: bigint
): boolean {
  let current = leaf;

  for (const { sibling, isLeft } of proof) {
    if (isLeft) {
      current = poseidon2([sibling, current]);
    } else {
      current = poseidon2([current, sibling]);
    }
  }

  return current === root;
}

// ============================================================================
// Export Types
// ============================================================================

export interface MerkleProofElement {
  sibling: bigint;
  isLeft: boolean;
}

export interface CommitmentVerificationResult {
  valid: boolean;
  errors: string[];
}
