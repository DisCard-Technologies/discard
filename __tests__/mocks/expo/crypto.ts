/**
 * Expo Crypto Mock
 *
 * Mocks expo-crypto for testing cryptographic operations.
 */

let uuidCounter = 0;

export const mockExpoCrypto = {
  randomUUID: jest.fn(() => {
    uuidCounter++;
    return `test-uuid-${uuidCounter}`;
  }),
  digestStringAsync: jest.fn(
    async (algorithm: string, data: string): Promise<string> => {
      // Return a predictable hash for testing
      const hash = Buffer.from(data).toString('base64').slice(0, 64);
      return hash.padEnd(64, '0');
    }
  ),
  getRandomBytes: jest.fn((size: number) => {
    return new Uint8Array(size).fill(0).map(() => Math.floor(Math.random() * 256));
  }),
  getRandomBytesAsync: jest.fn(async (size: number) => {
    return new Uint8Array(size).fill(0).map(() => Math.floor(Math.random() * 256));
  }),
  CryptoDigestAlgorithm: {
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA384: 'SHA-384',
    SHA512: 'SHA-512',
    MD5: 'MD5',
  },
  CryptoEncoding: {
    HEX: 'hex',
    BASE64: 'base64',
  },
};

// Helper to reset UUID counter between tests
export const resetUUIDCounter = () => {
  uuidCounter = 0;
};

// Helper to set specific UUID for deterministic tests
export const setNextUUID = (uuid: string) => {
  mockExpoCrypto.randomUUID.mockReturnValueOnce(uuid);
};

jest.mock('expo-crypto', () => mockExpoCrypto);
