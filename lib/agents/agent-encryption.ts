/**
 * Agent Encryption - E2EE Wrapper for Agent Records
 *
 * Client-side encryption/decryption of agent records using NaCl secretbox.
 * Follows the same pattern as lib/privacy-storage.ts for consistency.
 *
 * SECURITY GUARANTEES:
 * - Agent records encrypted CLIENT-SIDE before sending to Convex
 * - Encryption key derived from user's wallet private key via HKDF
 * - Convex sees only opaque base64 ciphertext
 * - Different context string ensures key isolation from other storage
 */

import {
  deriveEncryptionKey,
  encryptData,
  decryptData,
} from '../crypto-utils';
import type { AgentRecord } from './types';

// ============================================================================
// Constants
// ============================================================================

const AGENT_REGISTRY_CONTEXT = 'discard-agent-registry-v1';
const AGENT_OPERATIONS_CONTEXT = 'discard-agent-operations-v1';

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive encryption key for agent records
 *
 * Uses HKDF-SHA256 with agent-specific context to ensure
 * key isolation from credential vault, deposit notes, etc.
 */
export async function deriveAgentEncryptionKey(
  userPrivateKey: Uint8Array,
  context?: string
): Promise<Uint8Array> {
  return deriveEncryptionKey(
    userPrivateKey,
    context ?? AGENT_REGISTRY_CONTEXT
  );
}

// ============================================================================
// Agent Record Encryption
// ============================================================================

/**
 * Encrypt an agent record for storage in Convex
 *
 * Serializes to JSON, then encrypts with NaCl secretbox (XSalsa20-Poly1305).
 * Returns base64-encoded ciphertext including nonce prefix.
 */
export function encryptAgentRecord(
  record: AgentRecord,
  encryptionKey: Uint8Array
): string {
  const plaintext = JSON.stringify(record);
  return encryptData(plaintext, encryptionKey);
}

/**
 * Decrypt an agent record from Convex storage
 *
 * Decrypts base64 ciphertext and parses JSON back to AgentRecord.
 *
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export function decryptAgentRecord(
  ciphertext: string,
  encryptionKey: Uint8Array
): AgentRecord {
  const plaintext = decryptData(ciphertext, encryptionKey);
  return JSON.parse(plaintext) as AgentRecord;
}

// ============================================================================
// Agent Operation Encryption
// ============================================================================

/**
 * Encrypt an agent operation for the audit log
 *
 * Operations are encrypted with a separate context to provide
 * key isolation from agent records.
 */
export async function encryptAgentOperation(
  operation: Record<string, unknown>,
  userPrivateKey: Uint8Array
): Promise<string> {
  const key = await deriveEncryptionKey(userPrivateKey, AGENT_OPERATIONS_CONTEXT);
  const plaintext = JSON.stringify(operation);
  return encryptData(plaintext, key);
}

/**
 * Decrypt an agent operation from the audit log
 */
export async function decryptAgentOperation(
  ciphertext: string,
  userPrivateKey: Uint8Array
): Promise<Record<string, unknown>> {
  const key = await deriveEncryptionKey(userPrivateKey, AGENT_OPERATIONS_CONTEXT);
  const plaintext = decryptData(ciphertext, key);
  return JSON.parse(plaintext) as Record<string, unknown>;
}
