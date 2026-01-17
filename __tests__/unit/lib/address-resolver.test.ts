/**
 * Address Resolver Tests
 *
 * Tests for universal address resolution supporting:
 * - Raw Solana addresses
 * - SNS .sol domain names
 * - Phone numbers
 * - Email addresses
 */

import {
  detectAddressType,
  isValidSolanaAddress,
  validateAddressInput,
  formatAddress,
  clearResolutionCache,
  getCacheSize,
} from '@/lib/transfer/address-resolver';

describe('Address Resolver', () => {
  beforeEach(() => {
    clearResolutionCache();
  });

  // ==========================================================================
  // Address Type Detection
  // ==========================================================================

  describe('detectAddressType', () => {
    describe('Solana Addresses', () => {
      test('detects valid Solana address', () => {
        const address = 'So11111111111111111111111111111111111111112';
        expect(detectAddressType(address)).toBe('address');
      });

      test('detects another valid Solana address', () => {
        const address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        expect(detectAddressType(address)).toBe('address');
      });

      test('handles address with whitespace', () => {
        const address = '  So11111111111111111111111111111111111111112  ';
        expect(detectAddressType(address)).toBe('address');
      });
    });

    describe('.sol Domains', () => {
      test('detects simple .sol domain', () => {
        expect(detectAddressType('alice.sol')).toBe('sol_name');
      });

      test('detects .sol domain with numbers', () => {
        expect(detectAddressType('alice123.sol')).toBe('sol_name');
      });

      test('detects .sol domain with hyphens', () => {
        expect(detectAddressType('my-wallet.sol')).toBe('sol_name');
      });

      test('detects uppercase .sol domain', () => {
        expect(detectAddressType('ALICE.SOL')).toBe('sol_name');
      });

      test('detects mixed case .sol domain', () => {
        expect(detectAddressType('AlIcE.SoL')).toBe('sol_name');
      });
    });

    describe('Phone Numbers', () => {
      test('detects US phone number', () => {
        expect(detectAddressType('+14155551234')).toBe('phone');
      });

      test('detects UK phone number', () => {
        expect(detectAddressType('+447911123456')).toBe('phone');
      });

      test('detects international phone number', () => {
        expect(detectAddressType('+8613812345678')).toBe('phone');
      });

      test('rejects phone without plus', () => {
        expect(detectAddressType('14155551234')).toBe('unknown');
      });

      test('rejects phone starting with 0', () => {
        expect(detectAddressType('+04155551234')).toBe('unknown');
      });

      test('rejects too short phone', () => {
        expect(detectAddressType('+123')).toBe('unknown');
      });
    });

    describe('Email Addresses', () => {
      test('detects simple email', () => {
        expect(detectAddressType('alice@example.com')).toBe('email');
      });

      test('detects email with subdomain', () => {
        expect(detectAddressType('user@mail.example.com')).toBe('email');
      });

      test('detects email with dots in name', () => {
        expect(detectAddressType('alice.smith@example.com')).toBe('email');
      });

      test('detects email with plus sign', () => {
        expect(detectAddressType('alice+tag@example.com')).toBe('email');
      });

      test('rejects invalid email without @', () => {
        expect(detectAddressType('aliceexample.com')).toBe('unknown');
      });

      test('rejects invalid email without domain', () => {
        expect(detectAddressType('alice@')).toBe('unknown');
      });
    });

    describe('Unknown Types', () => {
      test('returns unknown for random string', () => {
        expect(detectAddressType('hello world')).toBe('unknown');
      });

      test('returns unknown for empty string', () => {
        expect(detectAddressType('')).toBe('unknown');
      });

      test('returns unknown for special characters only', () => {
        expect(detectAddressType('!@#$%')).toBe('unknown');
      });

      test('returns unknown for invalid base58', () => {
        expect(detectAddressType('0OIl')).toBe('unknown'); // Contains invalid base58 chars
      });
    });
  });

  // ==========================================================================
  // Solana Address Validation
  // ==========================================================================

  describe('isValidSolanaAddress', () => {
    test('validates correct Solana address', () => {
      expect(isValidSolanaAddress('So11111111111111111111111111111111111111112')).toBe(true);
    });

    test('validates USDC mint address', () => {
      expect(isValidSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
    });

    test('rejects too short address', () => {
      expect(isValidSolanaAddress('So1111111111')).toBe(false);
    });

    test('rejects too long address', () => {
      const tooLong = 'So11111111111111111111111111111111111111111111111111111';
      expect(isValidSolanaAddress(tooLong)).toBe(false);
    });

    test('rejects address with invalid characters', () => {
      expect(isValidSolanaAddress('So1111111111111111111111111111111O')).toBe(false); // O is invalid
    });

    test('rejects empty string', () => {
      expect(isValidSolanaAddress('')).toBe(false);
    });
  });

  // ==========================================================================
  // Address Input Validation
  // ==========================================================================

  describe('validateAddressInput', () => {
    test('validates Solana address', () => {
      const result = validateAddressInput('So11111111111111111111111111111111111111112');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('address');
      expect(result.error).toBeUndefined();
    });

    test('validates .sol domain', () => {
      const result = validateAddressInput('alice.sol');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('sol_name');
    });

    test('validates phone number', () => {
      const result = validateAddressInput('+14155551234');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('phone');
    });

    test('validates email', () => {
      const result = validateAddressInput('alice@example.com');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('email');
    });

    test('rejects unknown format with error message', () => {
      const result = validateAddressInput('invalid input');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('unknown');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid format');
    });

    test('rejects invalid Solana address', () => {
      const result = validateAddressInput('So1111'); // Too short but matches regex loosely
      expect(result.isValid).toBe(false);
    });
  });

  // ==========================================================================
  // Address Formatting
  // ==========================================================================

  describe('formatAddress', () => {
    test('truncates long address with default chars', () => {
      const address = 'So11111111111111111111111111111111111111112';
      const formatted = formatAddress(address);
      expect(formatted).toBe('So11...1112');
      expect(formatted.length).toBe(11);
    });

    test('truncates with custom char count', () => {
      const address = 'So11111111111111111111111111111111111111112';
      // formatAddress takes first N and last N chars
      expect(formatAddress(address, 6)).toBe('So1111...111112');
      expect(formatAddress(address, 8)).toBe('So111111...11111112');
    });

    test('does not truncate short address', () => {
      const address = 'So111...112';
      expect(formatAddress(address, 4)).toBe(address);
    });

    test('handles exact boundary case', () => {
      const address = 'So111...112'; // 11 chars, boundary is 4+4+3=11
      expect(formatAddress(address, 4)).toBe(address);
    });
  });

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  describe('Cache Management', () => {
    test('cache starts empty', () => {
      expect(getCacheSize()).toBe(0);
    });

    test('clearResolutionCache empties cache', () => {
      // Cache would be populated by resolveAddress calls
      // After clear, should be empty
      clearResolutionCache();
      expect(getCacheSize()).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    test('handles null-like inputs', () => {
      expect(detectAddressType('')).toBe('unknown');
      expect(detectAddressType('   ')).toBe('unknown');
    });

    test('handles unicode characters', () => {
      expect(detectAddressType('alice\u0000.sol')).toBe('unknown');
    });

    test('handles very long input', () => {
      const longInput = 'a'.repeat(1000);
      expect(detectAddressType(longInput)).toBe('unknown');
    });

    test('prioritizes email over other patterns', () => {
      // Email regex is checked first
      const input = 'test@example.sol'; // Could look like .sol but is email
      expect(detectAddressType(input)).toBe('email');
    });
  });

  // ==========================================================================
  // Pattern Constants
  // ==========================================================================

  describe('Pattern Constants', () => {
    test('Solana address regex matches 32-44 char base58', () => {
      const regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

      expect(regex.test('1'.repeat(32))).toBe(true);
      expect(regex.test('1'.repeat(44))).toBe(true);
      expect(regex.test('1'.repeat(31))).toBe(false);
      expect(regex.test('1'.repeat(45))).toBe(false);
    });

    test('.sol domain regex is case insensitive', () => {
      const regex = /^[a-zA-Z0-9-]+\.sol$/i;

      expect(regex.test('alice.sol')).toBe(true);
      expect(regex.test('ALICE.SOL')).toBe(true);
      expect(regex.test('Alice.Sol')).toBe(true);
    });

    test('phone regex requires E.164 format', () => {
      const regex = /^\+[1-9]\d{6,14}$/;

      expect(regex.test('+14155551234')).toBe(true);
      expect(regex.test('+1234567')).toBe(true); // 7 digits
      expect(regex.test('+123456789012345')).toBe(true); // 15 digits
      expect(regex.test('+1234567890123456')).toBe(false); // 16 digits - too long
      expect(regex.test('+123456')).toBe(false); // 6 digits - too short
    });
  });
});
