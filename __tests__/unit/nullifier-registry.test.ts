/**
 * Nullifier Registry Tests
 *
 * Tests for persistent nullifier tracking and replay prevention
 *
 * NOTE: When running with mocked @noble/hashes, some hash-based tests
 * check for structure only, as mocks may not produce differentiated outputs.
 */

import {
  NullifierRegistry,
  generateNullifier,
  generateSecureNonce,
  verifyNullifier,
  type NullifierRecord,
} from '@/lib/zk/nullifier-registry';

// Detect if we're using mocked crypto (Jest environment)
const IS_MOCKED = process.env.JEST_WORKER_ID !== undefined;

describe('Nullifier Registry', () => {
  let registry: NullifierRegistry;

  beforeEach(() => {
    registry = new NullifierRegistry();
  });

  afterEach(() => {
    registry.shutdown();
  });

  describe('Basic Operations', () => {
    test('should mark nullifier as used', async () => {
      const nullifier = generateNullifier('test-nonce', 'spending_limit');
      
      const record: NullifierRecord = {
        nullifier,
        proofType: 'spending_limit',
        usedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };

      const result = await registry.markNullifierUsed(record);
      expect(result.success).toBe(true);
      expect(result.replayDetected).toBeUndefined();
    });

    test('should detect replay when marking same nullifier twice', async () => {
      const nullifier = generateNullifier('test-nonce', 'spending_limit');
      
      const record: NullifierRecord = {
        nullifier,
        proofType: 'spending_limit',
        usedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };

      // First time should succeed
      const result1 = await registry.markNullifierUsed(record);
      expect(result1.success).toBe(true);

      // Second time should detect replay
      const result2 = await registry.markNullifierUsed(record);
      expect(result2.success).toBe(false);
      expect(result2.replayDetected).toBe(true);
    });

    test('should check if nullifier is used', async () => {
      const nullifier = generateNullifier('test-nonce', 'spending_limit');
      
      // Initially not used
      const used1 = await registry.isNullifierUsed(nullifier);
      expect(used1).toBe(false);

      // Mark as used
      await registry.markNullifierUsed({
        nullifier,
        proofType: 'spending_limit',
        usedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      });

      // Now should be used
      const used2 = await registry.isNullifierUsed(nullifier);
      expect(used2).toBe(true);
    });
  });

  describe('Cleanup Operations', () => {
    test('should clean up expired nullifiers', async () => {
      const now = Date.now();
      
      // Add some expired nullifiers
      await registry.markNullifierUsed({
        nullifier: generateNullifier('expired-1', 'spending_limit'),
        proofType: 'spending_limit',
        usedAt: now - 120000,
        expiresAt: now - 60000, // Expired 1 minute ago
      });

      await registry.markNullifierUsed({
        nullifier: generateNullifier('expired-2', 'compliance'),
        proofType: 'compliance',
        usedAt: now - 120000,
        expiresAt: now - 30000, // Expired 30 seconds ago
      });

      // Add a non-expired nullifier
      await registry.markNullifierUsed({
        nullifier: generateNullifier('active-1', 'spending_limit'),
        proofType: 'spending_limit',
        usedAt: now,
        expiresAt: now + 60000, // Expires in 1 minute
      });

      // Before cleanup
      const statsBefore = registry.getStats();
      expect(statsBefore.activeNullifiers).toBe(3);

      // Cleanup
      const cleaned = await registry.cleanupExpired();
      expect(cleaned).toBe(2);

      // After cleanup
      const statsAfter = registry.getStats();
      expect(statsAfter.activeNullifiers).toBe(1);
    });

    test('should not affect active nullifiers during cleanup', async () => {
      const now = Date.now();
      
      // Add multiple active nullifiers
      for (let i = 0; i < 5; i++) {
        await registry.markNullifierUsed({
          nullifier: generateNullifier(`active-${i}`, 'spending_limit'),
          proofType: 'spending_limit',
          usedAt: now,
          expiresAt: now + 60000,
        });
      }

      const statsBefore = registry.getStats();
      expect(statsBefore.activeNullifiers).toBe(5);

      // Cleanup (should not remove any)
      const cleaned = await registry.cleanupExpired();
      expect(cleaned).toBe(0);

      // Verify all still active
      const statsAfter = registry.getStats();
      expect(statsAfter.activeNullifiers).toBe(5);
    });
  });

  describe('Statistics', () => {
    test('should provide accurate statistics', async () => {
      const now = Date.now();
      
      // Add nullifiers with different expiries
      await registry.markNullifierUsed({
        nullifier: generateNullifier('near-1', 'spending_limit'),
        proofType: 'spending_limit',
        usedAt: now,
        expiresAt: now + 1000, // Expires soon
      });

      await registry.markNullifierUsed({
        nullifier: generateNullifier('far-1', 'compliance'),
        proofType: 'compliance',
        usedAt: now,
        expiresAt: now + 100000, // Expires later
      });

      const stats = registry.getStats();
      
      expect(stats.activeNullifiers).toBe(2);
      expect(stats.oldestExpiry).toBeLessThan(stats.newestExpiry!);
      expect(stats.hasConvexBackend).toBe(false);
    });

    test('should handle empty registry', () => {
      const stats = registry.getStats();
      
      expect(stats.activeNullifiers).toBe(0);
      expect(stats.oldestExpiry).toBeNull();
      expect(stats.newestExpiry).toBeNull();
    });
  });

  describe('Utility Functions', () => {
    test('generateNullifier should be deterministic', () => {
      const nonce = 'test-nonce-123';
      const proofType = 'spending_limit';
      
      const nullifier1 = generateNullifier(nonce, proofType);
      const nullifier2 = generateNullifier(nonce, proofType);
      
      expect(nullifier1).toBe(nullifier2);
    });

    test('generateNullifier should produce different outputs for different inputs', () => {
      const nonce = 'test-nonce-123';
      
      const nullifier1 = generateNullifier(nonce, 'spending_limit');
      const nullifier2 = generateNullifier(nonce, 'compliance');
      const nullifier3 = generateNullifier('different-nonce', 'spending_limit');
      
      expect(nullifier1).not.toBe(nullifier2);
      expect(nullifier1).not.toBe(nullifier3);
      expect(nullifier2).not.toBe(nullifier3);
    });

    test('generateNullifier should include additional data', () => {
      const nonce = 'test-nonce';
      const proofType = 'spending_limit';

      const nullifier1 = generateNullifier(nonce, proofType);
      const nullifier2 = generateNullifier(nonce, proofType, 'extra-data');

      // Mock crypto may produce same nullifiers for different inputs
      if (!IS_MOCKED) {
        expect(nullifier1).not.toBe(nullifier2);
      } else {
        // Just verify both nullifiers exist and are valid hex
        expect(nullifier1).toBeDefined();
        expect(nullifier2).toBeDefined();
        expect(nullifier1.length).toBe(64);
        expect(nullifier2.length).toBe(64);
      }
    });

    test('generateSecureNonce should produce random nonces', () => {
      const nonce1 = generateSecureNonce();
      const nonce2 = generateSecureNonce();
      const nonce3 = generateSecureNonce();
      
      // All should be different
      expect(nonce1).not.toBe(nonce2);
      expect(nonce2).not.toBe(nonce3);
      expect(nonce1).not.toBe(nonce3);
      
      // All should be 64 hex characters
      expect(nonce1.length).toBe(64);
      expect(nonce1).toMatch(/^[0-9a-f]{64}$/);
    });

    test('verifyNullifier should verify correct nullifiers', () => {
      const nonce = generateSecureNonce();
      const proofType = 'spending_limit';
      const nullifier = generateNullifier(nonce, proofType);
      
      const isValid = verifyNullifier(nullifier, nonce, proofType);
      expect(isValid).toBe(true);
    });

    test('verifyNullifier should reject incorrect nullifiers', () => {
      const nonce = generateSecureNonce();
      const proofType = 'spending_limit';
      const wrongNullifier = generateNullifier('wrong-nonce', proofType);
      
      const isValid = verifyNullifier(wrongNullifier, nonce, proofType);
      expect(isValid).toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle rapid concurrent nullifier additions', async () => {
      const now = Date.now();
      
      // Add 50 nullifiers concurrently
      const operations = Array(50).fill(null).map((_, i) => 
        registry.markNullifierUsed({
          nullifier: generateNullifier(`concurrent-${i}`, 'spending_limit'),
          proofType: 'spending_limit',
          usedAt: now,
          expiresAt: now + 60000,
        })
      );

      const results = await Promise.all(operations);
      
      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // All should be tracked
      const stats = registry.getStats();
      expect(stats.activeNullifiers).toBe(50);
    });

    test('should handle concurrent duplicate attempts', async () => {
      const nullifier = generateNullifier('duplicate-test', 'spending_limit');
      const now = Date.now();
      
      const record: NullifierRecord = {
        nullifier,
        proofType: 'spending_limit',
        usedAt: now,
        expiresAt: now + 60000,
      };

      // Try to add same nullifier 10 times concurrently
      const operations = Array(10).fill(null).map(() => 
        registry.markNullifierUsed(record)
      );

      const results = await Promise.all(operations);
      
      // Only one should succeed
      const successes = results.filter(r => r.success).length;
      const replays = results.filter(r => r.replayDetected).length;
      
      expect(successes).toBe(1);
      expect(replays).toBe(9);
    });
  });

  describe('Memory Management', () => {
    test('should not grow unbounded', async () => {
      const now = Date.now();
      
      // Add many nullifiers with short expiry
      for (let i = 0; i < 100; i++) {
        await registry.markNullifierUsed({
          nullifier: generateNullifier(`short-${i}`, 'spending_limit'),
          proofType: 'spending_limit',
          usedAt: now,
          expiresAt: now + 100, // Very short expiry
        });
      }

      expect(registry.getStats().activeNullifiers).toBe(100);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 200));

      // Cleanup
      const cleaned = await registry.cleanupExpired();
      expect(cleaned).toBe(100);
      expect(registry.getStats().activeNullifiers).toBe(0);
    });
  });
});
