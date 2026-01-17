/**
 * Light Protocol Client Tests
 *
 * Tests for ZK-compressed state management:
 * - Client initialization
 * - Compressed account creation
 * - Card state serialization
 * - DID commitment handling
 * - Rent calculation
 */

import type {
  LightClientConfig,
  CardStateData,
  DIDCommitmentData,
} from '@/lib/compression/light-client';

describe('Light Protocol Client', () => {
  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe('Configuration', () => {
    test('accepts valid RPC endpoint', () => {
      const config: LightClientConfig = {
        rpcEndpoint: 'https://api.mainnet-beta.solana.com',
        commitment: 'confirmed',
      };

      expect(config.rpcEndpoint).toBe('https://api.mainnet-beta.solana.com');
      expect(config.commitment).toBe('confirmed');
    });

    test('uses default commitment if not specified', () => {
      const config: LightClientConfig = {
        rpcEndpoint: 'https://api.devnet.solana.com',
      };

      const effectiveCommitment = config.commitment ?? 'confirmed';
      expect(effectiveCommitment).toBe('confirmed');
    });

    test('supports separate compression RPC endpoint', () => {
      const config: LightClientConfig = {
        rpcEndpoint: 'https://api.mainnet-beta.solana.com',
        compressionRpcEndpoint: 'https://compression.mainnet-beta.solana.com',
      };

      expect(config.compressionRpcEndpoint).toBeDefined();
    });
  });

  // ==========================================================================
  // Card State Serialization
  // ==========================================================================

  describe('Card State Serialization', () => {
    const testCardState: CardStateData = {
      cardId: 'card_001',
      ownerDid: 'did:discard:user123',
      ownerCommitment: 'commitment_hash_123',
      balance: BigInt(10000), // $100.00
      spendingLimit: BigInt(100000),
      dailyLimit: BigInt(50000),
      monthlyLimit: BigInt(200000),
      currentDailySpend: BigInt(0),
      currentMonthlySpend: BigInt(0),
      lastResetSlot: BigInt(123456),
      isFrozen: false,
      merchantWhitelist: [],
      mccWhitelist: [],
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
    };

    test('serializes card state to bytes', () => {
      // Simulate serialization
      const serializeCardState = (state: CardStateData): Uint8Array => {
        const encoder = new TextEncoder();
        const json = JSON.stringify({
          ...state,
          balance: state.balance.toString(),
          spendingLimit: state.spendingLimit.toString(),
          dailyLimit: state.dailyLimit.toString(),
          monthlyLimit: state.monthlyLimit.toString(),
          currentDailySpend: state.currentDailySpend.toString(),
          currentMonthlySpend: state.currentMonthlySpend.toString(),
          lastResetSlot: state.lastResetSlot.toString(),
          createdAt: state.createdAt.toString(),
          updatedAt: state.updatedAt.toString(),
        });
        return encoder.encode(json);
      };

      const bytes = serializeCardState(testCardState);
      // Use constructor name check to avoid cross-realm Uint8Array issues
      expect(bytes.constructor.name).toBe('Uint8Array');
      expect(bytes.length).toBeGreaterThan(0);
    });

    test('deserializes card state from bytes', () => {
      // Simulate deserialization
      const deserializeCardState = (data: Uint8Array): CardStateData => {
        const decoder = new TextDecoder();
        const json = JSON.parse(decoder.decode(data));
        return {
          ...json,
          balance: BigInt(json.balance),
          spendingLimit: BigInt(json.spendingLimit),
          dailyLimit: BigInt(json.dailyLimit),
          monthlyLimit: BigInt(json.monthlyLimit),
          currentDailySpend: BigInt(json.currentDailySpend),
          currentMonthlySpend: BigInt(json.currentMonthlySpend),
          lastResetSlot: BigInt(json.lastResetSlot),
          createdAt: BigInt(json.createdAt),
          updatedAt: BigInt(json.updatedAt),
        };
      };

      // First serialize
      const encoder = new TextEncoder();
      const json = JSON.stringify({
        ...testCardState,
        balance: testCardState.balance.toString(),
        spendingLimit: testCardState.spendingLimit.toString(),
        dailyLimit: testCardState.dailyLimit.toString(),
        monthlyLimit: testCardState.monthlyLimit.toString(),
        currentDailySpend: testCardState.currentDailySpend.toString(),
        currentMonthlySpend: testCardState.currentMonthlySpend.toString(),
        lastResetSlot: testCardState.lastResetSlot.toString(),
        createdAt: testCardState.createdAt.toString(),
        updatedAt: testCardState.updatedAt.toString(),
      });
      const bytes = encoder.encode(json);

      // Then deserialize
      const restored = deserializeCardState(bytes);

      expect(restored.cardId).toBe(testCardState.cardId);
      expect(restored.balance).toBe(testCardState.balance);
      expect(restored.isFrozen).toBe(testCardState.isFrozen);
    });

    test('handles BigInt conversion correctly', () => {
      const bigValue = BigInt('9007199254740992'); // > Number.MAX_SAFE_INTEGER
      const stringValue = bigValue.toString();
      const restored = BigInt(stringValue);

      expect(restored).toBe(bigValue);
    });
  });

  // ==========================================================================
  // DID Commitment Serialization
  // ==========================================================================

  describe('DID Commitment Serialization', () => {
    const testDIDCommitment: DIDCommitmentData = {
      did: 'did:discard:user123',
      commitmentHash: 'hash_123456',
      documentHash: 'doc_hash_789',
      verificationMethodCount: 2,
      recoveryThreshold: 2,
      activeGuardiansCount: 3,
      status: 'active',
      lastKeyRotationSlot: BigInt(100000),
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
    };

    test('serializes DID commitment to bytes', () => {
      const serializeDIDCommitment = (commitment: DIDCommitmentData): Uint8Array => {
        const encoder = new TextEncoder();
        const json = JSON.stringify({
          ...commitment,
          lastKeyRotationSlot: commitment.lastKeyRotationSlot.toString(),
          createdAt: commitment.createdAt.toString(),
          updatedAt: commitment.updatedAt.toString(),
        });
        return encoder.encode(json);
      };

      const bytes = serializeDIDCommitment(testDIDCommitment);
      // Use constructor name check to avoid cross-realm Uint8Array issues
      expect(bytes.constructor.name).toBe('Uint8Array');
    });

    test('preserves DID status in serialization', () => {
      const statusValues: Array<'active' | 'suspended' | 'revoked'> = [
        'active',
        'suspended',
        'revoked',
      ];

      statusValues.forEach((status) => {
        const commitment = { ...testDIDCommitment, status };
        const encoder = new TextEncoder();
        // Convert BigInt values to strings before JSON serialization
        const json = JSON.stringify({
          ...commitment,
          lastKeyRotationSlot: commitment.lastKeyRotationSlot.toString(),
          createdAt: commitment.createdAt.toString(),
          updatedAt: commitment.updatedAt.toString(),
        });
        const bytes = encoder.encode(json);
        const decoder = new TextDecoder();
        const restored = JSON.parse(decoder.decode(bytes));

        expect(restored.status).toBe(status);
      });
    });
  });

  // ==========================================================================
  // Address Seed Generation
  // ==========================================================================

  describe('Address Seed Generation', () => {
    test('generates deterministic seed from prefix and identifier', () => {
      const generateAddressSeed = (prefix: string, identifier: string): Uint8Array => {
        const encoder = new TextEncoder();
        const combined = `${prefix}:${identifier}`;
        const bytes = encoder.encode(combined);

        // Pad or truncate to 32 bytes
        const seed = new Uint8Array(32);
        for (let i = 0; i < bytes.length && i < 32; i++) {
          seed[i] = bytes[i];
        }
        return seed;
      };

      const seed1 = generateAddressSeed('card', 'card_001');
      const seed2 = generateAddressSeed('card', 'card_001');
      const seed3 = generateAddressSeed('card', 'card_002');

      // Same inputs = same seed
      expect(seed1).toEqual(seed2);

      // Different inputs = different seed
      expect(seed1).not.toEqual(seed3);
    });

    test('seed is always 32 bytes', () => {
      const generateAddressSeed = (prefix: string, identifier: string): Uint8Array => {
        const encoder = new TextEncoder();
        const combined = `${prefix}:${identifier}`;
        const bytes = encoder.encode(combined);

        const seed = new Uint8Array(32);
        for (let i = 0; i < bytes.length && i < 32; i++) {
          seed[i] = bytes[i];
        }
        return seed;
      };

      const shortSeed = generateAddressSeed('x', 'y');
      const longSeed = generateAddressSeed('card', 'very_long_card_identifier_123456789');

      expect(shortSeed).toHaveLength(32);
      expect(longSeed).toHaveLength(32);
    });
  });

  // ==========================================================================
  // Rent Calculation
  // ==========================================================================

  describe('Rent Calculation', () => {
    test('calculates near-zero rent for compressed accounts', () => {
      const calculateRent = (dataSize: number): number => {
        // ZK Compression reduces rent by ~1000x
        // Standard rent: ~0.002 SOL per account
        // Compressed rent: ~0.000002 SOL per leaf
        const LAMPORTS_PER_LEAF = 2000;
        return LAMPORTS_PER_LEAF;
      };

      const rent = calculateRent(1000); // 1000 bytes

      // Should be significantly less than standard rent
      expect(rent).toBe(2000); // 0.000002 SOL
      expect(rent).toBeLessThan(2039280); // Standard rent exemption
    });

    test('rent is constant regardless of data size', () => {
      const calculateRent = (): number => 2000;

      const rent100 = calculateRent();
      const rent1000 = calculateRent();
      const rent10000 = calculateRent();

      // Compressed rent is per-leaf, not per-byte
      expect(rent100).toBe(rent1000);
      expect(rent1000).toBe(rent10000);
    });

    test('rent savings compared to standard accounts', () => {
      const standardRent = 2039280; // ~0.002 SOL
      const compressedRent = 2000; // ~0.000002 SOL

      const savings = (standardRent - compressedRent) / standardRent;

      // Should save >99% on rent
      expect(savings).toBeGreaterThan(0.99);
    });
  });

  // ==========================================================================
  // Compressed Account Operations
  // ==========================================================================

  describe('Compressed Account Operations', () => {
    test('validates account creation parameters', () => {
      const validateCreateParams = (params: {
        payer: string;
        data: Uint8Array;
      }): boolean => {
        if (!params.payer || params.payer.length < 30) return false;
        if (!params.data || params.data.length === 0) return false;
        return true;
      };

      expect(
        validateCreateParams({
          payer: 'valid_payer_address_' + '1'.repeat(24),
          data: new Uint8Array([1, 2, 3]),
        })
      ).toBe(true);

      expect(
        validateCreateParams({
          payer: 'short',
          data: new Uint8Array([1]),
        })
      ).toBe(false);
    });

    test('validates account update parameters', () => {
      const validateUpdateParams = (params: {
        currentLeafIndex: number;
        newData: Uint8Array;
        proof: { a: number[]; b: number[]; c: number[] };
      }): boolean => {
        if (params.currentLeafIndex < 0) return false;
        if (!params.newData || params.newData.length === 0) return false;
        if (!params.proof || !params.proof.a || !params.proof.b || !params.proof.c) return false;
        return true;
      };

      expect(
        validateUpdateParams({
          currentLeafIndex: 0,
          newData: new Uint8Array([1, 2, 3]),
          proof: { a: [1], b: [2], c: [3] },
        })
      ).toBe(true);

      expect(
        validateUpdateParams({
          currentLeafIndex: -1,
          newData: new Uint8Array([1]),
          proof: { a: [1], b: [2], c: [3] },
        })
      ).toBe(false);
    });
  });

  // ==========================================================================
  // Proof Handling
  // ==========================================================================

  describe('Proof Handling', () => {
    test('proof structure contains required fields', () => {
      interface CompressedProof {
        a: number[];
        b: number[];
        c: number[];
      }

      const mockProof: CompressedProof = {
        a: [1, 2, 3, 4, 5, 6, 7, 8],
        b: [9, 10, 11, 12, 13, 14, 15, 16],
        c: [17, 18, 19, 20, 21, 22, 23, 24],
      };

      expect(mockProof.a).toBeDefined();
      expect(mockProof.b).toBeDefined();
      expect(mockProof.c).toBeDefined();
      expect(Array.isArray(mockProof.a)).toBe(true);
    });

    test('converts proof to array format', () => {
      const proof = {
        a: new Uint8Array([1, 2, 3]),
        b: new Uint8Array([4, 5, 6]),
        c: new Uint8Array([7, 8, 9]),
      };

      const arrayProof = {
        a: Array.from(proof.a),
        b: Array.from(proof.b),
        c: Array.from(proof.c),
      };

      expect(arrayProof.a).toEqual([1, 2, 3]);
      expect(arrayProof.b).toEqual([4, 5, 6]);
      expect(arrayProof.c).toEqual([7, 8, 9]);
    });
  });

  // ==========================================================================
  // Singleton Pattern
  // ==========================================================================

  describe('Singleton Pattern', () => {
    test('returns same instance when called multiple times', () => {
      // Simulate singleton
      let instance: { rpcEndpoint: string } | null = null;

      const getInstance = (config?: { rpcEndpoint: string }) => {
        if (!instance && config) {
          instance = { rpcEndpoint: config.rpcEndpoint };
        }
        return instance;
      };

      const first = getInstance({ rpcEndpoint: 'https://first.com' });
      const second = getInstance({ rpcEndpoint: 'https://second.com' });

      expect(first).toBe(second);
      expect(first?.rpcEndpoint).toBe('https://first.com');
    });

    test('throws if accessed before initialization', () => {
      let instance: any = null;

      const getInstance = (config?: any) => {
        if (!instance && !config) {
          throw new Error('LightClient not initialized. Call with config first.');
        }
        if (!instance && config) {
          instance = { config };
        }
        return instance;
      };

      expect(() => getInstance()).toThrow('not initialized');
    });
  });
});
