/**
 * Mock for @arcium-hq/client
 *
 * Provides mock implementations for Arcium MPC client
 * to enable testing without real network calls.
 */

import { PublicKey } from '@solana/web3.js';

// Mock RescueCipher class
class MockRescueCipher {
  constructor(_sharedKey: Uint8Array) {}

  encrypt(data: Uint8Array): number[][] {
    // Return mock ciphertext as array of 32-byte arrays
    const result: number[][] = [];
    for (let i = 0; i < data.length; i += 32) {
      const chunk = Array.from(data.slice(i, i + 32));
      while (chunk.length < 32) chunk.push(0);
      result.push(chunk);
    }
    return result.length > 0 ? result : [[...Array(32).fill(0)]];
  }

  decrypt(ciphertext: number[][]): Uint8Array {
    // Return mock decrypted data
    return new Uint8Array(ciphertext.flat());
  }
}

// Mock x25519 functions
const mockX25519 = {
  generateKeyPair: () => ({
    publicKey: new Uint8Array(32).fill(1),
    secretKey: new Uint8Array(32).fill(2),
  }),
  getPublicKey: (privateKey: Uint8Array) => {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = privateKey[i] ^ 0x42;
    }
    return result;
  },
  getSharedSecret: (privateKey: Uint8Array, publicKey: Uint8Array) => {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = privateKey[i] ^ publicKey[i];
    }
    return result;
  },
};

// Mock getMXEPublicKey
const getMXEPublicKey = async (
  _connection: any,
  _clusterAddress: any,
  _offset: number
): Promise<Uint8Array> => {
  return new Uint8Array(32).fill(3);
};

// Mock awaitComputationFinalization
const awaitComputationFinalization = async (
  _connection: any,
  _computationAddress: any,
  _options?: any
): Promise<{ result: Uint8Array; status: string }> => {
  return {
    result: new Uint8Array(32).fill(0),
    status: 'finalized',
  };
};

// Mock getArciumEnv
const getArciumEnv = () => ({
  clusterUrl: 'https://mock.arcium.com',
  programId: 'ArciumMock111111111111111111111111111111111',
});

// Mock getClusterAccAddress
const getClusterAccAddress = (_programId: PublicKey): PublicKey => {
  return new PublicKey('Cluster11111111111111111111111111111111111');
};

// Mock getComputationAccAddress
const getComputationAccAddress = (
  _programId: PublicKey,
  _id: Uint8Array
): PublicKey => {
  return new PublicKey('Compute11111111111111111111111111111111111');
};

// Export mocks
export const RescueCipher = MockRescueCipher;
export const x25519 = mockX25519;
export {
  getMXEPublicKey,
  awaitComputationFinalization,
  getArciumEnv,
  getClusterAccAddress,
  getComputationAccAddress,
};

export default {
  RescueCipher: MockRescueCipher,
  x25519: mockX25519,
  getMXEPublicKey,
  awaitComputationFinalization,
  getArciumEnv,
  getClusterAccAddress,
  getComputationAccAddress,
};
