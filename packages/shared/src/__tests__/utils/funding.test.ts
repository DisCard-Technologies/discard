import { describe, test, expect } from '@jest/globals';
import {
  validateFundingAmount,
  validateTransferAmount,
  formatCurrency,
  parseCurrencyToCents,
  getProcessingTime,
  formatProcessingTime,
  checkDailyFundingLimit,
  checkMonthlyFundingLimit,
  detectSuspiciousVelocity,
  generateTransactionId,
  validateCardId,
  calculateAvailableBalance
} from '../utils/funding';
import { FUNDING_CONSTANTS } from '../constants/funding';
import { FundingTransaction, AccountBalance } from '../types/funding';

describe('Funding Utilities', () => {
  describe('validateFundingAmount', () => {
    test('should validate correct funding amounts', () => {
      // Valid amounts
      expect(validateFundingAmount(500)).toEqual({ isValid: true });
      expect(validateFundingAmount(10000)).toEqual({ isValid: true });
      expect(validateFundingAmount(FUNDING_CONSTANTS.MAX_FUNDING_AMOUNT)).toEqual({ isValid: true });
    });

    test('should reject amounts below minimum', () => {
      const result = validateFundingAmount(50); // Below $1.00
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Minimum funding amount is $1.00');
    });

    test('should reject amounts above maximum', () => {
      const result = validateFundingAmount(FUNDING_CONSTANTS.MAX_FUNDING_AMOUNT + 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Maximum funding amount is $10,000.00');
    });

    test('should reject non-integer amounts', () => {
      expect(validateFundingAmount(99.5)).toEqual({
        isValid: false,
        error: 'Amount must be a positive integer in cents'
      });
    });

    test('should reject negative amounts', () => {
      expect(validateFundingAmount(-100)).toEqual({
        isValid: false,
        error: 'Amount must be a positive integer in cents'
      });
    });

    test('should reject zero amount', () => {
      expect(validateFundingAmount(0)).toEqual({
        isValid: false,
        error: 'Amount must be a positive integer in cents'
      });
    });
  });

  describe('validateTransferAmount', () => {
    test('should validate correct transfer amounts with sufficient balance', () => {
      expect(validateTransferAmount(500, 1000)).toEqual({ isValid: true });
      expect(validateTransferAmount(1000, 1000)).toEqual({ isValid: true });
    });

    test('should reject amounts exceeding available balance', () => {
      const result = validateTransferAmount(1500, 1000);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Insufficient balance. Available: $10.00');
    });

    test('should reject amounts below minimum transfer', () => {
      const result = validateTransferAmount(50, 1000); // Below $1.00
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Minimum transfer amount is $1.00');
    });

    test('should reject amounts above maximum transfer', () => {
      const result = validateTransferAmount(FUNDING_CONSTANTS.MAX_TRANSFER_AMOUNT + 1, 600000);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Maximum transfer amount is $5,000.00');
    });
  });

  describe('formatCurrency', () => {
    test('should format USD currency correctly', () => {
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency(100)).toBe('$1.00');
      expect(formatCurrency(1050)).toBe('$10.50');
      expect(formatCurrency(100000)).toBe('$1,000.00');
    });

    test('should format other currencies', () => {
      expect(formatCurrency(1050, 'EUR')).toBe('€10.50');
      expect(formatCurrency(1050, 'GBP')).toBe('£10.50');
    });

    test('should handle large amounts', () => {
      expect(formatCurrency(123456789)).toBe('$1,234,567.89');
    });
  });

  describe('parseCurrencyToCents', () => {
    test('should parse currency strings correctly', () => {
      expect(parseCurrencyToCents('$1.00')).toBe(100);
      expect(parseCurrencyToCents('$10.50')).toBe(1050);
      expect(parseCurrencyToCents('$1,000.00')).toBe(100000);
      expect(parseCurrencyToCents('1.23')).toBe(123);
    });

    test('should handle currency strings without symbols', () => {
      expect(parseCurrencyToCents('10.50')).toBe(1050);
      expect(parseCurrencyToCents('1000')).toBe(100000);
    });

    test('should handle strings with spaces and commas', () => {
      expect(parseCurrencyToCents('$ 1,234.56')).toBe(123456);
      expect(parseCurrencyToCents('1 , 0 0 0 . 0 0')).toBe(100000);
    });

    test('should round properly for more than 2 decimal places', () => {
      expect(parseCurrencyToCents('1.235')).toBe(124); // Rounds up
      expect(parseCurrencyToCents('1.234')).toBe(123); // Rounds down
    });
  });

  describe('getProcessingTime', () => {
    test('should return correct processing times for payment methods', () => {
      expect(getProcessingTime('card')).toBe(FUNDING_CONSTANTS.PROCESSING_TIMES.CARD);
      expect(getProcessingTime('ach_debit')).toBe(FUNDING_CONSTANTS.PROCESSING_TIMES.ACH_DEBIT);
      expect(getProcessingTime('bank_account')).toBe(FUNDING_CONSTANTS.PROCESSING_TIMES.BANK_ACCOUNT);
    });

    test('should default to card processing time for unknown methods', () => {
      expect(getProcessingTime('unknown_method')).toBe(FUNDING_CONSTANTS.PROCESSING_TIMES.CARD);
      expect(getProcessingTime('')).toBe(FUNDING_CONSTANTS.PROCESSING_TIMES.CARD);
    });

    test('should be case insensitive', () => {
      expect(getProcessingTime('CARD')).toBe(FUNDING_CONSTANTS.PROCESSING_TIMES.CARD);
      expect(getProcessingTime('ACH_DEBIT')).toBe(FUNDING_CONSTANTS.PROCESSING_TIMES.ACH_DEBIT);
    });
  });

  describe('formatProcessingTime', () => {
    test('should format instant processing', () => {
      expect(formatProcessingTime(0)).toBe('Instant');
    });

    test('should format times in days', () => {
      expect(formatProcessingTime(24 * 60 * 60)).toBe('1 day'); // 1 day
      expect(formatProcessingTime(3 * 24 * 60 * 60)).toBe('3 days'); // 3 days
      expect(formatProcessingTime(7 * 24 * 60 * 60)).toBe('7 days'); // 7 days
    });

    test('should format times in hours', () => {
      expect(formatProcessingTime(60 * 60)).toBe('1 hour'); // 1 hour
      expect(formatProcessingTime(5 * 60 * 60)).toBe('5 hours'); // 5 hours
      expect(formatProcessingTime(23 * 60 * 60)).toBe('23 hours'); // 23 hours
    });

    test('should format times less than an hour', () => {
      expect(formatProcessingTime(30 * 60)).toBe('Less than 1 hour'); // 30 minutes
      expect(formatProcessingTime(1800)).toBe('Less than 1 hour'); // 30 minutes
    });

    test('should prioritize days over hours', () => {
      expect(formatProcessingTime(25 * 60 * 60)).toBe('1 day'); // 25 hours = 1 day
      expect(formatProcessingTime(48 * 60 * 60)).toBe('2 days'); // 48 hours = 2 days
    });
  });

  describe('checkDailyFundingLimit', () => {
    const createMockTransaction = (
      type: string,
      status: string,
      amount: number,
      hoursAgo: number
    ): FundingTransaction => ({
      id: `tx-${Date.now()}`,
      userId: 'test-user',
      type: type as any,
      status: status as any,
      amount,
      createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    });

    test('should return false when under daily limit', () => {
      const transactions = [
        createMockTransaction('account_funding', 'completed', 100000, 2), // $1000, 2 hours ago
        createMockTransaction('account_funding', 'completed', 150000, 12), // $1500, 12 hours ago
      ];

      expect(checkDailyFundingLimit(transactions)).toBe(false);
    });

    test('should return true when daily limit exceeded', () => {
      const transactions = [
        createMockTransaction('account_funding', 'completed', 300000, 2), // $3000
        createMockTransaction('account_funding', 'completed', 250000, 12), // $2500
        // Total: $5500 > $5000 limit
      ];

      expect(checkDailyFundingLimit(transactions)).toBe(true);
    });

    test('should only count completed account funding transactions', () => {
      const transactions = [
        createMockTransaction('account_funding', 'completed', 250000, 2),
        createMockTransaction('account_funding', 'failed', 300000, 4), // Shouldn't count
        createMockTransaction('card_allocation', 'completed', 300000, 6), // Shouldn't count
        createMockTransaction('account_funding', 'pending', 300000, 8), // Shouldn't count
      ];

      expect(checkDailyFundingLimit(transactions)).toBe(false);
    });

    test('should only count transactions within 24 hours', () => {
      const transactions = [
        createMockTransaction('account_funding', 'completed', 300000, 2), // Within 24h
        createMockTransaction('account_funding', 'completed', 300000, 25), // Outside 24h
      ];

      expect(checkDailyFundingLimit(transactions)).toBe(false);
    });
  });

  describe('checkMonthlyFundingLimit', () => {
    const createMockTransaction = (
      type: string,
      status: string,
      amount: number,
      daysAgo: number
    ): FundingTransaction => ({
      id: `tx-${Date.now()}`,
      userId: 'test-user',
      type: type as any,
      status: status as any,
      amount,
      createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    });

    test('should return false when under monthly limit', () => {
      const transactions = [
        createMockTransaction('account_funding', 'completed', 1000000, 5), // $10,000
        createMockTransaction('account_funding', 'completed', 1500000, 15), // $15,000
        createMockTransaction('account_funding', 'completed', 2000000, 25), // $20,000
        // Total: $45,000 < $50,000 limit
      ];

      expect(checkMonthlyFundingLimit(transactions)).toBe(false);
    });

    test('should return true when monthly limit exceeded', () => {
      const transactions = [
        createMockTransaction('account_funding', 'completed', 2000000, 5), // $20,000
        createMockTransaction('account_funding', 'completed', 2000000, 15), // $20,000
        createMockTransaction('account_funding', 'completed', 1500000, 25), // $15,000
        // Total: $55,000 > $50,000 limit
      ];

      expect(checkMonthlyFundingLimit(transactions)).toBe(true);
    });

    test('should only count transactions within 30 days', () => {
      const transactions = [
        createMockTransaction('account_funding', 'completed', 3000000, 5), // Within 30 days
        createMockTransaction('account_funding', 'completed', 3000000, 35), // Outside 30 days
      ];

      expect(checkMonthlyFundingLimit(transactions)).toBe(false);
    });
  });

  describe('detectSuspiciousVelocity', () => {
    const createRecentTransaction = (minutesAgo: number): FundingTransaction => ({
      id: `tx-${Date.now()}-${minutesAgo}`,
      userId: 'test-user',
      type: 'account_funding',
      status: 'completed',
      amount: 10000,
      createdAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    });

    test('should return false for normal transaction velocity', () => {
      const transactions = [
        createRecentTransaction(5),
        createRecentTransaction(15),
        createRecentTransaction(30),
      ];

      expect(detectSuspiciousVelocity(transactions)).toBe(false);
    });

    test('should return true for suspicious velocity', () => {
      // Create 15 transactions in the last hour (exceeds threshold of 10)
      const transactions = Array.from({ length: 15 }, (_, i) => 
        createRecentTransaction(i * 3) // Every 3 minutes
      );

      expect(detectSuspiciousVelocity(transactions)).toBe(true);
    });

    test('should only count transactions within 1 hour', () => {
      const transactions = [
        ...Array.from({ length: 5 }, (_, i) => createRecentTransaction(i * 10)), // Within 1 hour
        ...Array.from({ length: 15 }, (_, i) => createRecentTransaction(70 + i * 10)), // Outside 1 hour
      ];

      expect(detectSuspiciousVelocity(transactions)).toBe(false);
    });
  });

  describe('generateTransactionId', () => {
    test('should generate unique transaction IDs', () => {
      const id1 = generateTransactionId();
      const id2 = generateTransactionId();
      
      expect(id1).toMatch(/^funding_[a-z0-9]+_[a-z0-9]{5}$/);
      expect(id2).toMatch(/^funding_[a-z0-9]+_[a-z0-9]{5}$/);
      expect(id1).not.toBe(id2);
    });

    test('should have correct format', () => {
      const id = generateTransactionId();
      const parts = id.split('_');
      
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('funding');
      expect(parts[1]).toMatch(/^[a-z0-9]+$/); // Timestamp in base36
      expect(parts[2]).toMatch(/^[a-z0-9]{5}$/); // Random part
    });
  });

  describe('validateCardId', () => {
    test('should validate correct UUID v4 format', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '123e4567-e89b-42d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      ];

      validUUIDs.forEach(uuid => {
        expect(validateCardId(uuid)).toEqual({ isValid: true });
      });
    });

    test('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        '550e8400-e29b-31d4-a716-446655440000', // Version 3, not 4
        '550e8400-e29b-51d4-a716-446655440000', // Version 5, not 4
        '550e8400-e29b-41d4-1716-446655440000', // Invalid variant
        'not-a-uuid',
        '550e8400-e29b-41d4-a716', // Too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // Too long
        ''
      ];

      invalidUUIDs.forEach(uuid => {
        const result = validateCardId(uuid);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid card ID format');
      });
    });

    test('should reject non-string inputs', () => {
      expect(validateCardId(null as any)).toEqual({
        isValid: false,
        error: 'Card ID is required and must be a string'
      });

      expect(validateCardId(undefined as any)).toEqual({
        isValid: false,
        error: 'Card ID is required and must be a string'
      });

      expect(validateCardId(123 as any)).toEqual({
        isValid: false,
        error: 'Card ID is required and must be a string'
      });
    });
  });

  describe('calculateAvailableBalance', () => {
    test('should calculate available balance correctly', () => {
      const accountBalance: AccountBalance = {
        userId: 'test-user',
        totalBalance: 20000, // $200.00
        allocatedBalance: 12000, // $120.00
        availableBalance: 8000, // Should be ignored in calculation
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const result = calculateAvailableBalance(accountBalance);
      expect(result).toBe(8000); // $200 - $120 = $80
    });

    test('should handle zero balances', () => {
      const accountBalance: AccountBalance = {
        userId: 'test-user',
        totalBalance: 0,
        allocatedBalance: 0,
        availableBalance: 0,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      expect(calculateAvailableBalance(accountBalance)).toBe(0);
    });

    test('should handle fully allocated balance', () => {
      const accountBalance: AccountBalance = {
        userId: 'test-user',
        totalBalance: 10000,
        allocatedBalance: 10000,
        availableBalance: 0,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      expect(calculateAvailableBalance(accountBalance)).toBe(0);
    });
  });
});