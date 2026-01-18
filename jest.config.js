/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Mock @noble packages with our test mocks
    '^@noble/curves/ed25519$': '<rootDir>/__tests__/mocks/noble-curves.ts',
    '^@noble/curves/ed25519.js$': '<rootDir>/__tests__/mocks/noble-curves.ts',
    '^@noble/hashes/sha2$': '<rootDir>/__tests__/mocks/noble-hashes.ts',
    '^@noble/hashes/sha2.js$': '<rootDir>/__tests__/mocks/noble-hashes.ts',
    '^@noble/hashes/sha256$': '<rootDir>/__tests__/mocks/noble-hashes.ts',
    '^@noble/hashes/sha512$': '<rootDir>/__tests__/mocks/noble-hashes.ts',
    '^@noble/hashes/utils$': '<rootDir>/__tests__/mocks/noble-hashes.ts',
    '^@noble/hashes/utils.js$': '<rootDir>/__tests__/mocks/noble-hashes.ts',
    // Mock Arcium client to avoid its bundled noble/curves
    '^@arcium-hq/client$': '<rootDir>/__tests__/mocks/arcium-client.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@lightprotocol|@solana|convex|bs58|@noble|tweetnacl|poseidon-lite)',
  ],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'convex/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.ts',
  ],
  coverageThreshold: {
    // Global threshold - start very low given the large untested codebase
    // Increase as more tests are added
    global: {
      branches: 0.5,
      functions: 0.5,
      lines: 0.5,
      statements: 0.5,
    },
    // Per-file thresholds for tested files
    './lib/utils.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './lib/transfer/address-resolver.ts': {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react-jsx',
      },
    },
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    '/.maestro/',
  ],
  // clearMocks clears call history between tests but preserves implementations
  clearMocks: true,
  // Don't reset implementations - we want our mocks to persist
  resetMocks: false,
  restoreMocks: false,
};
