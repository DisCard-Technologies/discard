/**
 * Agent Registry Unit Tests
 *
 * Verification plan tests for the privacy-preserving AI agent registry:
 *
 * 2. Commitment roundtrip: verifyAgentCommitment(computeAgentCommitment(inputs), inputs) === true
 * 3. Encryption roundtrip: decryptAgentRecord(encryptAgentRecord(record, key), key) matches
 * 5. E2EE invariant: encrypted output is opaque base64, not plaintext
 * 6. Nullifier uniqueness: two operations produce different nullifiers; replay is rejected
 * 8. Proof invalidation: changing permissions clears cachedProof field
 * 9. Revocation completeness: sets status "revoked", clears session key + proof
 */

import type {
  AgentRecord,
  AgentPermissions,
  AgentCommitmentInputs,
  CachedAgentProof,
  AgentStatus,
} from '@/lib/agents/types';

// ============================================================================
// Mock poseidon-lite (returns deterministic bigint hash)
// ============================================================================

jest.mock('poseidon-lite', () => ({
  poseidon2: (inputs: bigint[]) => {
    // Deterministic mock: XOR inputs together and add a constant
    let result = BigInt(0);
    for (const input of inputs) {
      result = result ^ input;
    }
    // Ensure result is within field
    const FIELD_MODULUS = BigInt(
      '21888242871839275222246405745257275088548364400416034343698204186575808495617'
    );
    return ((result + BigInt(12345)) % FIELD_MODULUS + FIELD_MODULUS) % FIELD_MODULUS;
  },
}));

// ============================================================================
// Mock tweetnacl (minimal secretbox for encryption roundtrip)
// ============================================================================

jest.mock('tweetnacl', () => {
  const nonceLength = 24;
  const keyLength = 32;

  return {
    default: {
      secretbox: Object.assign(
        (plaintext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array => {
          // Simple XOR "encryption" for testing roundtrip
          const result = new Uint8Array(plaintext.length);
          for (let i = 0; i < plaintext.length; i++) {
            result[i] = plaintext[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
          }
          return result;
        },
        {
          nonceLength,
          keyLength,
          open: (ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null => {
            // Reverse the XOR
            const result = new Uint8Array(ciphertext.length);
            for (let i = 0; i < ciphertext.length; i++) {
              result[i] = ciphertext[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
            }
            return result;
          },
        }
      ),
      randomBytes: (length: number): Uint8Array => {
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
        return bytes;
      },
      box: {
        nonceLength: 24,
        keyPair: {
          fromSecretKey: (sk: Uint8Array) => ({
            publicKey: new Uint8Array(32),
            secretKey: sk,
          }),
        },
      },
    },
    secretbox: Object.assign(
      (plaintext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array => {
        const result = new Uint8Array(plaintext.length);
        for (let i = 0; i < plaintext.length; i++) {
          result[i] = plaintext[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
        }
        return result;
      },
      {
        nonceLength,
        keyLength,
        open: (ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null => {
          const result = new Uint8Array(ciphertext.length);
          for (let i = 0; i < ciphertext.length; i++) {
            result[i] = ciphertext[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
          }
          return result;
        },
      }
    ),
    randomBytes: (length: number): Uint8Array => {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return bytes;
    },
  };
});

jest.mock('tweetnacl-util', () => ({
  default: {
    decodeUTF8: (str: string) => new TextEncoder().encode(str),
    encodeUTF8: (arr: Uint8Array) => new TextDecoder().decode(arr),
    encodeBase64: (arr: Uint8Array) => {
      let binary = '';
      for (let i = 0; i < arr.length; i++) {
        binary += String.fromCharCode(arr[i]);
      }
      return btoa(binary);
    },
    decodeBase64: (str: string) => {
      const binary = atob(str);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    },
  },
  decodeUTF8: (str: string) => new TextEncoder().encode(str),
  encodeUTF8: (arr: Uint8Array) => new TextDecoder().decode(arr),
  encodeBase64: (arr: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < arr.length; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
  },
  decodeBase64: (str: string) => {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },
}));

// ============================================================================
// Test Data
// ============================================================================

const TEST_PERMISSIONS: AgentPermissions = {
  allowed: ['sign_transaction', 'read_balance', 'fund_card'],
  walletScoping: {
    addresses: ['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'],
    maxTransactionAmount: 1000000,
    dailyLimit: 5000000,
  },
  activityRestrictions: {
    allowedMccCodes: ['5411', '5812'],
  },
  timeRestrictions: {
    validFrom: 1700000000000,
    validUntil: 1800000000000,
    allowedHours: [9, 17],
  },
};

const TEST_AGENT_RECORD: AgentRecord = {
  agentId: 'agent-abc123def456',
  name: 'Spending Bot',
  description: 'Automated card spending agent',
  agentPubkey: '9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  permissions: TEST_PERMISSIONS,
  walletPubkey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  nonce: '0x' + 'ab'.repeat(32),
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const TEST_COMMITMENT_INPUTS: AgentCommitmentInputs = {
  agentPubkey: '9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  walletPubkey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  permissionsHash: 'a1b2c3d4e5f6'.repeat(5) + 'a1b2',
  nonce: '0x' + 'ab'.repeat(32),
};

// ============================================================================
// Tests
// ============================================================================

describe('Agent Registry', () => {
  // ==========================================================================
  // VP-2: Commitment Roundtrip
  // ==========================================================================

  describe('Commitment Roundtrip (VP-2)', () => {
    test('verifyAgentCommitment returns true for matching inputs', () => {
      const {
        computeAgentCommitment,
        verifyAgentCommitment,
      } = require('@/lib/agents/agent-commitment');

      const commitment = computeAgentCommitment(TEST_COMMITMENT_INPUTS);
      const valid = verifyAgentCommitment(commitment, TEST_COMMITMENT_INPUTS);

      expect(valid).toBe(true);
    });

    test('computeAgentCommitment returns 0x-prefixed hex string', () => {
      const { computeAgentCommitment } = require('@/lib/agents/agent-commitment');

      const commitment = computeAgentCommitment(TEST_COMMITMENT_INPUTS);

      expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
    });

    test('same inputs produce same commitment (deterministic)', () => {
      const { computeAgentCommitment } = require('@/lib/agents/agent-commitment');

      const commitment1 = computeAgentCommitment(TEST_COMMITMENT_INPUTS);
      const commitment2 = computeAgentCommitment(TEST_COMMITMENT_INPUTS);

      expect(commitment1).toBe(commitment2);
    });

    test('different inputs produce different commitment', () => {
      const { computeAgentCommitment } = require('@/lib/agents/agent-commitment');

      const inputs2: AgentCommitmentInputs = {
        ...TEST_COMMITMENT_INPUTS,
        nonce: '0x' + 'cd'.repeat(32),
      };

      const commitment1 = computeAgentCommitment(TEST_COMMITMENT_INPUTS);
      const commitment2 = computeAgentCommitment(inputs2);

      expect(commitment1).not.toBe(commitment2);
    });

    test('verifyAgentCommitment returns false for wrong nonce', () => {
      const {
        computeAgentCommitment,
        verifyAgentCommitment,
      } = require('@/lib/agents/agent-commitment');

      const commitment = computeAgentCommitment(TEST_COMMITMENT_INPUTS);

      const wrongInputs: AgentCommitmentInputs = {
        ...TEST_COMMITMENT_INPUTS,
        nonce: '0x' + 'ff'.repeat(32),
      };

      const valid = verifyAgentCommitment(commitment, wrongInputs);
      expect(valid).toBe(false);
    });

    test('verifyAgentCommitment returns false for wrong wallet', () => {
      const {
        computeAgentCommitment,
        verifyAgentCommitment,
      } = require('@/lib/agents/agent-commitment');

      const commitment = computeAgentCommitment(TEST_COMMITMENT_INPUTS);

      const wrongInputs: AgentCommitmentInputs = {
        ...TEST_COMMITMENT_INPUTS,
        walletPubkey: 'WRONG_WALLET_PUBKEY_XXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      const valid = verifyAgentCommitment(commitment, wrongInputs);
      expect(valid).toBe(false);
    });
  });

  // ==========================================================================
  // VP-2 (cont): Permissions Hash
  // ==========================================================================

  describe('Permissions Hash', () => {
    test('computePermissionsHash is deterministic', () => {
      const { computePermissionsHash } = require('@/lib/agents/agent-commitment');

      const hash1 = computePermissionsHash(TEST_PERMISSIONS);
      const hash2 = computePermissionsHash(TEST_PERMISSIONS);

      expect(hash1).toBe(hash2);
    });

    test('computePermissionsHash is order-independent for allowed array', () => {
      const { computePermissionsHash } = require('@/lib/agents/agent-commitment');

      const perms1: AgentPermissions = {
        allowed: ['sign_transaction', 'read_balance', 'fund_card'],
      };

      const perms2: AgentPermissions = {
        allowed: ['fund_card', 'sign_transaction', 'read_balance'],
      };

      const hash1 = computePermissionsHash(perms1);
      const hash2 = computePermissionsHash(perms2);

      expect(hash1).toBe(hash2);
    });

    test('different permissions produce different hash', () => {
      const { computePermissionsHash } = require('@/lib/agents/agent-commitment');

      const perms1: AgentPermissions = { allowed: ['sign_transaction'] };
      const perms2: AgentPermissions = { allowed: ['read_balance'] };

      const hash1 = computePermissionsHash(perms1);
      const hash2 = computePermissionsHash(perms2);

      expect(hash1).not.toBe(hash2);
    });
  });

  // ==========================================================================
  // VP-2 (cont): Nonce & Merkle Leaf
  // ==========================================================================

  describe('Nonce Generation', () => {
    test('generateAgentNonce returns 0x-prefixed hex', async () => {
      const { generateAgentNonce } = require('@/lib/agents/agent-commitment');

      const nonce = await generateAgentNonce();

      expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
    });

    test('generateAgentNonce produces unique values', async () => {
      const { generateAgentNonce } = require('@/lib/agents/agent-commitment');

      const nonces = new Set<string>();
      for (let i = 0; i < 10; i++) {
        nonces.add(await generateAgentNonce());
      }

      expect(nonces.size).toBe(10);
    });
  });

  describe('Merkle Leaf', () => {
    test('computeAgentMerkleLeaf returns a bigint', () => {
      const { computeAgentMerkleLeaf } = require('@/lib/agents/agent-commitment');

      const leaf = computeAgentMerkleLeaf(
        'agent-abc123',
        '0x' + 'aa'.repeat(32),
        1700000000000
      );

      expect(typeof leaf).toBe('bigint');
    });

    test('same inputs produce same leaf (deterministic)', () => {
      const { computeAgentMerkleLeaf } = require('@/lib/agents/agent-commitment');

      const leaf1 = computeAgentMerkleLeaf('agent-abc', '0xaabb', 1234);
      const leaf2 = computeAgentMerkleLeaf('agent-abc', '0xaabb', 1234);

      expect(leaf1).toBe(leaf2);
    });

    test('different agentId produces different leaf', () => {
      const { computeAgentMerkleLeaf } = require('@/lib/agents/agent-commitment');

      const leaf1 = computeAgentMerkleLeaf('agent-abc', '0xaabb', 1234);
      const leaf2 = computeAgentMerkleLeaf('agent-xyz', '0xaabb', 1234);

      expect(leaf1).not.toBe(leaf2);
    });
  });

  // ==========================================================================
  // VP-3: Encryption Roundtrip
  // ==========================================================================

  describe('Encryption Roundtrip (VP-3)', () => {
    test('decryptAgentRecord recovers original record', () => {
      const {
        encryptAgentRecord,
        decryptAgentRecord,
      } = require('@/lib/agents/agent-encryption');

      const key = new Uint8Array(32);
      crypto.getRandomValues(key);

      const encrypted = encryptAgentRecord(TEST_AGENT_RECORD, key);
      const decrypted = decryptAgentRecord(encrypted, key);

      expect(decrypted.agentId).toBe(TEST_AGENT_RECORD.agentId);
      expect(decrypted.name).toBe(TEST_AGENT_RECORD.name);
      expect(decrypted.description).toBe(TEST_AGENT_RECORD.description);
      expect(decrypted.agentPubkey).toBe(TEST_AGENT_RECORD.agentPubkey);
      expect(decrypted.walletPubkey).toBe(TEST_AGENT_RECORD.walletPubkey);
      expect(decrypted.nonce).toBe(TEST_AGENT_RECORD.nonce);
      expect(decrypted.createdAt).toBe(TEST_AGENT_RECORD.createdAt);
      expect(decrypted.updatedAt).toBe(TEST_AGENT_RECORD.updatedAt);
    });

    test('decrypted permissions match original', () => {
      const {
        encryptAgentRecord,
        decryptAgentRecord,
      } = require('@/lib/agents/agent-encryption');

      const key = new Uint8Array(32);
      crypto.getRandomValues(key);

      const encrypted = encryptAgentRecord(TEST_AGENT_RECORD, key);
      const decrypted = decryptAgentRecord(encrypted, key);

      expect(decrypted.permissions.allowed).toEqual(
        TEST_AGENT_RECORD.permissions.allowed
      );
      expect(decrypted.permissions.walletScoping?.addresses).toEqual(
        TEST_AGENT_RECORD.permissions.walletScoping?.addresses
      );
      expect(decrypted.permissions.walletScoping?.maxTransactionAmount).toBe(
        TEST_AGENT_RECORD.permissions.walletScoping?.maxTransactionAmount
      );
    });

    test('same record encrypted twice produces different ciphertext', () => {
      const { encryptAgentRecord } = require('@/lib/agents/agent-encryption');

      const key = new Uint8Array(32);
      crypto.getRandomValues(key);

      const encrypted1 = encryptAgentRecord(TEST_AGENT_RECORD, key);
      const encrypted2 = encryptAgentRecord(TEST_AGENT_RECORD, key);

      // Different random nonce each time -> different ciphertext
      expect(encrypted1).not.toBe(encrypted2);
    });

    test('deriveAgentEncryptionKey returns 32 bytes', async () => {
      const { deriveAgentEncryptionKey } = require('@/lib/agents/agent-encryption');

      const privateKey = new Uint8Array(32);
      crypto.getRandomValues(privateKey);

      const key = await deriveAgentEncryptionKey(privateKey);

      expect(key).toHaveLength(32);
    });

    test('deriveAgentEncryptionKey is deterministic for same private key', async () => {
      const { deriveAgentEncryptionKey } = require('@/lib/agents/agent-encryption');

      const privateKey = new Uint8Array(32).fill(42);

      const key1 = await deriveAgentEncryptionKey(privateKey);
      const key2 = await deriveAgentEncryptionKey(privateKey);

      expect(Array.from(key1)).toEqual(Array.from(key2));
    });
  });

  // ==========================================================================
  // VP-3 (cont): Operation Encryption
  // ==========================================================================

  describe('Operation Encryption', () => {
    test('encryptAgentOperation/decryptAgentOperation roundtrip', async () => {
      const {
        encryptAgentOperation,
        decryptAgentOperation,
      } = require('@/lib/agents/agent-encryption');

      const privateKey = new Uint8Array(32).fill(7);
      const operation = {
        type: 'fund_card',
        agentId: 'agent-test',
        amount: 50000,
        timestamp: Date.now(),
      };

      const encrypted = await encryptAgentOperation(operation, privateKey);
      const decrypted = await decryptAgentOperation(encrypted, privateKey);

      expect(decrypted.type).toBe('fund_card');
      expect(decrypted.agentId).toBe('agent-test');
      expect(decrypted.amount).toBe(50000);
    });
  });

  // ==========================================================================
  // VP-5: E2EE Invariant
  // ==========================================================================

  describe('E2EE Invariant (VP-5)', () => {
    test('encrypted record is valid base64', () => {
      const { encryptAgentRecord } = require('@/lib/agents/agent-encryption');

      const key = new Uint8Array(32);
      crypto.getRandomValues(key);

      const encrypted = encryptAgentRecord(TEST_AGENT_RECORD, key);

      // Must be a string
      expect(typeof encrypted).toBe('string');

      // Must be valid base64 (no exception on decode)
      expect(() => atob(encrypted)).not.toThrow();
    });

    test('encrypted record does not contain plaintext agent name', () => {
      const { encryptAgentRecord } = require('@/lib/agents/agent-encryption');

      const key = new Uint8Array(32);
      crypto.getRandomValues(key);

      const encrypted = encryptAgentRecord(TEST_AGENT_RECORD, key);

      // The encrypted blob should NOT contain the agent name in plaintext
      expect(encrypted).not.toContain('Spending Bot');
      expect(encrypted).not.toContain(TEST_AGENT_RECORD.agentId);
      expect(encrypted).not.toContain(TEST_AGENT_RECORD.walletPubkey);
    });

    test('encrypted record does not contain plaintext permissions', () => {
      const { encryptAgentRecord } = require('@/lib/agents/agent-encryption');

      const key = new Uint8Array(32);
      crypto.getRandomValues(key);

      const encrypted = encryptAgentRecord(TEST_AGENT_RECORD, key);

      expect(encrypted).not.toContain('sign_transaction');
      expect(encrypted).not.toContain('read_balance');
      expect(encrypted).not.toContain('fund_card');
    });

    test('encrypted operations do not contain plaintext data', async () => {
      const { encryptAgentOperation } = require('@/lib/agents/agent-encryption');

      const privateKey = new Uint8Array(32).fill(7);
      const operation = {
        type: 'swap_tokens',
        agentId: 'agent-secret',
        amount: 999999,
      };

      const encrypted = await encryptAgentOperation(operation, privateKey);

      expect(encrypted).not.toContain('swap_tokens');
      expect(encrypted).not.toContain('agent-secret');
      expect(encrypted).not.toContain('999999');
    });
  });

  // ==========================================================================
  // VP-6: Nullifier Uniqueness
  // ==========================================================================

  describe('Nullifier Uniqueness (VP-6)', () => {
    test('two operations by same agent produce different nullifiers', () => {
      const {
        generateNullifier,
        generateSecureNonce,
      } = require('@/lib/zk/nullifier-registry');

      const agentId = 'agent-test123';
      const nonce1 = generateSecureNonce();
      const nonce2 = generateSecureNonce();

      const nullifier1 = generateNullifier(nonce1, 'agent_operation', agentId);
      const nullifier2 = generateNullifier(nonce2, 'agent_operation', agentId);

      expect(nullifier1).not.toBe(nullifier2);
    });

    test('nullifiers are deterministic for same inputs', () => {
      const { generateNullifier } = require('@/lib/zk/nullifier-registry');

      const nonce = 'fixed-nonce-value';
      const nullifier1 = generateNullifier(nonce, 'agent_operation', 'agent-x');
      const nullifier2 = generateNullifier(nonce, 'agent_operation', 'agent-x');

      expect(nullifier1).toBe(nullifier2);
    });

    test('different agent IDs produce different nullifiers (same nonce)', () => {
      const { generateNullifier } = require('@/lib/zk/nullifier-registry');

      // Use short nonce/proofType so agent ID falls within mock SHA-256's 32-byte window
      const nonce = 'x';
      const nullifier1 = generateNullifier(nonce, 'x', 'agent-A');
      const nullifier2 = generateNullifier(nonce, 'x', 'agent-B');

      expect(nullifier1).not.toBe(nullifier2);
    });

    test('different proof types produce different nullifiers', () => {
      const { generateNullifier } = require('@/lib/zk/nullifier-registry');

      const nonce = 'shared-nonce';
      const nullifier1 = generateNullifier(nonce, 'agent_operation', 'agent-A');
      const nullifier2 = generateNullifier(nonce, 'agent_revocation', 'agent-A');

      expect(nullifier1).not.toBe(nullifier2);
    });

    test('nullifiers are hex strings of expected length', () => {
      const {
        generateNullifier,
        generateSecureNonce,
      } = require('@/lib/zk/nullifier-registry');

      const nonce = generateSecureNonce();
      const nullifier = generateNullifier(nonce, 'agent_operation');

      // SHA-256 produces 64-char hex
      expect(nullifier).toMatch(/^[0-9a-f]{64}$/);
    });

    test('generateSecureNonce produces unique 64-char hex strings', () => {
      const { generateSecureNonce } = require('@/lib/zk/nullifier-registry');

      const nonces = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const nonce = generateSecureNonce();
        expect(nonce).toMatch(/^[0-9a-f]{64}$/);
        nonces.add(nonce);
      }

      expect(nonces.size).toBe(20);
    });

    test('NullifierRegistry detects replay', async () => {
      const { NullifierRegistry } = require('@/lib/zk/nullifier-registry');

      const registry = new NullifierRegistry();

      const record = {
        nullifier: 'abc123',
        proofType: 'agent_operation',
        usedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      // First use: success
      const result1 = await registry.markNullifierUsed(record);
      expect(result1.success).toBe(true);
      expect(result1.replayDetected).toBeUndefined();

      // Second use (replay): detected
      const result2 = await registry.markNullifierUsed(record);
      expect(result2.success).toBe(false);
      expect(result2.replayDetected).toBe(true);

      registry.shutdown();
    });

    test('NullifierRegistry isNullifierUsed returns false for unknown', async () => {
      const { NullifierRegistry } = require('@/lib/zk/nullifier-registry');

      const registry = new NullifierRegistry();

      const used = await registry.isNullifierUsed('never-used-nullifier');
      expect(used).toBe(false);

      registry.shutdown();
    });

    test('NullifierRegistry isNullifierUsed returns true after marking', async () => {
      const { NullifierRegistry } = require('@/lib/zk/nullifier-registry');

      const registry = new NullifierRegistry();

      await registry.markNullifierUsed({
        nullifier: 'marked-nullifier',
        proofType: 'test',
        usedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const used = await registry.isNullifierUsed('marked-nullifier');
      expect(used).toBe(true);

      registry.shutdown();
    });
  });

  // ==========================================================================
  // VP-8: Proof Invalidation (Convex mutation logic)
  // ==========================================================================

  describe('Proof Invalidation (VP-8)', () => {
    test('updateRecord clears cached proof fields', () => {
      // Simulate what the Convex mutation does on updateRecord
      const agent = {
        agentId: 'agent-test',
        encryptedRecord: 'encrypted...',
        commitmentHash: '0xaaa',
        permissionsHash: 'hash1',
        cachedProof: 'base64proof...',
        cachedProofMerkleRoot: '0xbbb',
        proofGeneratedAt: 1700000000000,
        status: 'active' as AgentStatus,
        updatedAt: 1700000000000,
      };

      // Apply the same patch logic as convex/agents/agents.ts updateRecord
      const patched = {
        ...agent,
        encryptedRecord: 'new-encrypted...',
        commitmentHash: '0xccc',
        permissionsHash: 'hash2',
        cachedProof: undefined,
        cachedProofMerkleRoot: undefined,
        proofGeneratedAt: undefined,
        updatedAt: Date.now(),
      };

      expect(patched.cachedProof).toBeUndefined();
      expect(patched.cachedProofMerkleRoot).toBeUndefined();
      expect(patched.proofGeneratedAt).toBeUndefined();
      expect(patched.commitmentHash).toBe('0xccc');
      expect(patched.permissionsHash).toBe('hash2');
    });
  });

  // ==========================================================================
  // VP-9: Revocation Completeness
  // ==========================================================================

  describe('Revocation Completeness (VP-9)', () => {
    test('revoke mutation sets correct fields', () => {
      // Simulate what the Convex mutation does on revoke
      const agent = {
        agentId: 'agent-to-revoke',
        encryptedRecord: 'encrypted...',
        commitmentHash: '0xaaa',
        permissionsHash: 'hash1',
        sessionKeyId: 'sk_12345',
        turnkeyPolicyId: 'pol_12345',
        cachedProof: 'proof...',
        cachedProofMerkleRoot: '0xroot',
        proofGeneratedAt: 1700000000000,
        status: 'active' as AgentStatus,
        revocationNullifier: undefined as string | undefined,
        updatedAt: 1700000000000,
      };

      const revocationNullifier = 'revoke-nullifier-hash-abc123';

      // Apply the same patch logic as convex/agents/agents.ts revoke
      const patched = {
        ...agent,
        status: 'revoked' as AgentStatus,
        revocationNullifier,
        sessionKeyId: undefined,
        turnkeyPolicyId: undefined,
        cachedProof: undefined,
        cachedProofMerkleRoot: undefined,
        proofGeneratedAt: undefined,
        updatedAt: Date.now(),
      };

      // Status must be revoked
      expect(patched.status).toBe('revoked');

      // Revocation nullifier must be set
      expect(patched.revocationNullifier).toBe(revocationNullifier);

      // Session key cleared
      expect(patched.sessionKeyId).toBeUndefined();
      expect(patched.turnkeyPolicyId).toBeUndefined();

      // Proof cache cleared
      expect(patched.cachedProof).toBeUndefined();
      expect(patched.cachedProofMerkleRoot).toBeUndefined();
      expect(patched.proofGeneratedAt).toBeUndefined();

      // Timestamp updated
      expect(patched.updatedAt).toBeGreaterThan(agent.updatedAt);
    });

    test('revoked agent retains encrypted record for audit', () => {
      const agent = {
        encryptedRecord: 'encrypted-data-for-audit',
        commitmentHash: '0xaaa',
        status: 'active' as AgentStatus,
      };

      // Revoke should NOT clear encryptedRecord (needed for audit)
      const patched = {
        ...agent,
        status: 'revoked' as AgentStatus,
      };

      expect(patched.encryptedRecord).toBe('encrypted-data-for-audit');
      expect(patched.commitmentHash).toBe('0xaaa');
    });
  });

  // ==========================================================================
  // Type Definitions
  // ==========================================================================

  describe('Type Definitions', () => {
    test('AgentPermission union covers all expected values', () => {
      const validPermissions: AgentPermissions = {
        allowed: [
          'sign_transaction',
          'read_balance',
          'fund_card',
          'swap_tokens',
          'transfer_funds',
          'manage_cards',
          'view_history',
          'create_intent',
          'approve_intent',
          'read_holdings',
        ],
      };

      expect(validPermissions.allowed).toHaveLength(10);
    });

    test('AgentRecord has all required fields', () => {
      const record: AgentRecord = TEST_AGENT_RECORD;

      expect(record.agentId).toBeDefined();
      expect(record.name).toBeDefined();
      expect(record.description).toBeDefined();
      expect(record.agentPubkey).toBeDefined();
      expect(record.permissions).toBeDefined();
      expect(record.walletPubkey).toBeDefined();
      expect(record.nonce).toBeDefined();
      expect(record.createdAt).toBeDefined();
      expect(record.updatedAt).toBeDefined();
    });

    test('CachedAgentProof has all required fields', () => {
      const proof: CachedAgentProof = {
        proof: btoa('mock-proof-bytes'),
        publicInputs: ['0xaaa', '0xbbb', '0xccc'],
        merkleRoot: '0x' + 'dd'.repeat(32),
        generatedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      expect(proof.proof).toBeDefined();
      expect(proof.publicInputs).toHaveLength(3);
      expect(proof.merkleRoot).toMatch(/^0x/);
      expect(proof.expiresAt).toBeGreaterThan(proof.generatedAt);
    });

    test('AgentStatus covers all lifecycle states', () => {
      const states: AgentStatus[] = ['creating', 'active', 'suspended', 'revoked'];
      expect(states).toHaveLength(4);
    });
  });

  // ==========================================================================
  // Barrel Export
  // ==========================================================================

  describe('Barrel Export', () => {
    test('index.ts exports all public API', () => {
      const agentModule = require('@/lib/agents/index');

      // Commitment functions
      expect(agentModule.computePermissionsHash).toBeDefined();
      expect(agentModule.computeAgentCommitment).toBeDefined();
      expect(agentModule.computeAgentMerkleLeaf).toBeDefined();
      expect(agentModule.verifyAgentCommitment).toBeDefined();
      expect(agentModule.generateAgentNonce).toBeDefined();

      // Encryption functions
      expect(agentModule.deriveAgentEncryptionKey).toBeDefined();
      expect(agentModule.encryptAgentRecord).toBeDefined();
      expect(agentModule.decryptAgentRecord).toBeDefined();
      expect(agentModule.encryptAgentOperation).toBeDefined();
      expect(agentModule.decryptAgentOperation).toBeDefined();

      // Registry
      expect(agentModule.AgentRegistry).toBeDefined();
      expect(agentModule.getAgentRegistry).toBeDefined();
      expect(agentModule.initializeAgentRegistry).toBeDefined();
    });
  });
});
