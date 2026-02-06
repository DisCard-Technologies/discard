/**
 * Agent Commitment - Poseidon Commitment Computation
 *
 * Computes ZK-friendly Poseidon commitments for agent records.
 * Reuses primitives from lib/identity/zk-commitment.ts for consistency.
 *
 * Commitment = Poseidon(agentPubkey, walletPubkey, permissionsHash, nonce)
 *
 * This hides the wallet-to-agent relationship while allowing
 * ZK proofs of agent membership without revealing the wallet.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  bytesToFieldElements,
  hashFieldElements,
  generateRandomFieldElement,
  bigintToHex,
  hexToBigint,
} from '../identity/zk-commitment';
import type { AgentCommitmentInputs, AgentPermissions } from './types';

// ============================================================================
// Permissions Hashing
// ============================================================================

/**
 * Compute SHA-256 hash of canonicalized permissions JSON
 *
 * Canonicalization ensures deterministic hashing regardless of
 * property insertion order.
 */
export function computePermissionsHash(permissions: AgentPermissions): string {
  // Sort allowed permissions for canonical form
  const canonical = {
    allowed: [...permissions.allowed].sort(),
    walletScoping: permissions.walletScoping
      ? {
          addresses: [...(permissions.walletScoping.addresses || [])].sort(),
          maxTransactionAmount: permissions.walletScoping.maxTransactionAmount,
          dailyLimit: permissions.walletScoping.dailyLimit,
          monthlyLimit: permissions.walletScoping.monthlyLimit,
        }
      : undefined,
    activityRestrictions: permissions.activityRestrictions
      ? {
          allowedIntents: permissions.activityRestrictions.allowedIntents
            ? [...permissions.activityRestrictions.allowedIntents].sort()
            : undefined,
          allowedMccCodes: permissions.activityRestrictions.allowedMccCodes
            ? [...permissions.activityRestrictions.allowedMccCodes].sort()
            : undefined,
          blockedMccCodes: permissions.activityRestrictions.blockedMccCodes
            ? [...permissions.activityRestrictions.blockedMccCodes].sort()
            : undefined,
        }
      : undefined,
    timeRestrictions: permissions.timeRestrictions || undefined,
  };

  const json = JSON.stringify(canonical);
  const hash = sha256(new TextEncoder().encode(json));
  return bytesToHex(hash);
}

// ============================================================================
// Poseidon Commitment
// ============================================================================

/**
 * Compute Poseidon commitment for agent registration
 *
 * commitment = Poseidon(agentPubkey, walletPubkey, permissionsHash, nonce)
 *
 * Uses chained poseidon2 calls via hashFieldElements for
 * arbitrary-length input support.
 */
export function computeAgentCommitment(inputs: AgentCommitmentInputs): string {
  const encoder = new TextEncoder();

  // Convert each input to field elements
  const agentElements = bytesToFieldElements(encoder.encode(inputs.agentPubkey));
  const walletElements = bytesToFieldElements(encoder.encode(inputs.walletPubkey));
  const permHashElements = bytesToFieldElements(
    encoder.encode(inputs.permissionsHash)
  );
  const nonceValue = hexToBigint(inputs.nonce);

  // Combine all field elements for Poseidon hashing
  const allElements = [
    ...agentElements,
    ...walletElements,
    ...permHashElements,
    nonceValue,
  ];

  const commitment = hashFieldElements(allElements);
  return bigintToHex(commitment);
}

/**
 * Compute Merkle leaf hash for Light Protocol tree insertion
 */
export function computeAgentMerkleLeaf(
  agentId: string,
  commitmentHash: string,
  timestamp: number
): bigint {
  const leafData = new TextEncoder().encode(
    `${agentId}:${commitmentHash}:${timestamp}`
  );
  const fieldElements = bytesToFieldElements(leafData);
  return hashFieldElements(fieldElements);
}

/**
 * Verify that a commitment matches the given inputs
 *
 * Recomputes the commitment and performs constant-time comparison.
 */
export function verifyAgentCommitment(
  commitment: string,
  inputs: AgentCommitmentInputs
): boolean {
  const computed = computeAgentCommitment(inputs);
  // Use constant-length comparison (both are 0x-prefixed 64-char hex)
  if (computed.length !== commitment.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ commitment.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generate a random nonce for agent commitment
 *
 * Wraps generateRandomFieldElement from zk-commitment.ts
 * and returns as hex string.
 */
export async function generateAgentNonce(): Promise<string> {
  const nonce = await generateRandomFieldElement();
  return bigintToHex(nonce);
}
