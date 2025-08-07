import { describe, test, expect } from '@jest/globals';
import {
  validateStripePaymentMethodId,
  validateCurrency,
  validateEmail,
  validateNotificationThreshold
} from '../../utils/validation';

describe('Validation Utilities', () => {
  describe('validateStripePaymentMethodId', () => {
    test('should validate correct payment method IDs', () => {
      const validIds = [
        'pm_1234567890abcdef123456',
        'pm_abcdefghijklmnopqrstuvwx',
        'pm_1A2B3C4D5E6F7G8H9I0J1K2L'
      ];

      validIds.forEach(id => {
        expect(validateStripePaymentMethodId(id)).toEqual({ isValid: true });
      });
    });

    test('should reject payment method IDs without pm_ prefix', () => {
      const invalidIds = [
        'card_1234567890abcdef',
        'sk_test_1234567890abcdef',
        '1234567890abcdef',
        'payment_method_123'
      ];

      invalidIds.forEach(id => {
        const result = validateStripePaymentMethodId(id);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid payment method ID format');
      });
    });

    test('should reject payment method IDs with invalid length', () => {
      const tooShort = 'pm_short';
      const tooLong = 'pm_this_is_way_too_long_to_be_a_valid_stripe_payment_method_id';

      expect(validateStripePaymentMethodId(tooShort)).toEqual({
        isValid: false,
        error: 'Invalid payment method ID length'
      });

      expect(validateStripePaymentMethodId(tooLong)).toEqual({
        isValid: false,
        error: 'Invalid payment method ID length'
      });
    });

    test('should reject non-string inputs', () => {
      const invalidInputs = [null, undefined, 123, {}, []];

      invalidInputs.forEach(input => {
        expect(validateStripePaymentMethodId(input as any)).toEqual({
          isValid: false,
          error: 'Payment method ID is required'
        });
      });
    });

    test('should reject empty strings', () => {
      expect(validateStripePaymentMethodId('')).toEqual({
        isValid: false,
        error: 'Payment method ID is required'
      });
    });
  });

  describe('validateCurrency', () => {
    test('should validate supported currencies', () => {
      const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

      supportedCurrencies.forEach(currency => {
        expect(validateCurrency(currency)).toEqual({ isValid: true });
      });
    });

    test('should validate currencies case insensitively', () => {
      const currencyVariations = ['usd', 'Usd', 'USD', 'eur', 'Eur', 'EUR'];

      currencyVariations.forEach(currency => {
        expect(validateCurrency(currency)).toEqual({ isValid: true });
      });
    });

    test('should reject unsupported currencies', () => {
      const unsupportedCurrencies = ['JPY', 'CHF', 'SEK', 'NOK', 'XYZ'];

      unsupportedCurrencies.forEach(currency => {
        const result = validateCurrency(currency);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(`Unsupported currency: ${currency}`);
      });
    });

    test('should reject non-string inputs', () => {
      const invalidInputs = [null, undefined, 123, {}, []];

      invalidInputs.forEach(input => {
        expect(validateCurrency(input as any)).toEqual({
          isValid: false,
          error: 'Currency is required'
        });
      });
    });

    test('should reject empty strings', () => {
      expect(validateCurrency('')).toEqual({
        isValid: false,
        error: 'Currency is required'
      });
    });
  });

  describe('validateEmail', () => {
    test('should validate correct email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.email@domain.org',
        'user+tag@example.co.uk',
        'firstname.lastname@company.com',
        'user123@test-domain.net',
        'simple@example.io'
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toEqual({ isValid: true });
      });
    });

    test('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user..double.dot@example.com',
        'user@example',
        'user@.example.com',
        'user@example..com',
        'user name@example.com', // Space in local part
        'user@ex ample.com' // Space in domain
      ];

      invalidEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid email format');
      });
    });

    test('should reject non-string inputs', () => {
      const invalidInputs = [null, undefined, 123, {}, []];

      invalidInputs.forEach(input => {
        expect(validateEmail(input as any)).toEqual({
          isValid: false,
          error: 'Email is required'
        });
      });
    });

    test('should reject empty strings', () => {
      expect(validateEmail('')).toEqual({
        isValid: false,
        error: 'Email is required'
      });
    });

    test('should handle edge cases', () => {
      // Very long but valid email
      const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
      expect(validateEmail(longEmail)).toEqual({ isValid: true });

      // Email with numbers
      expect(validateEmail('user123@example123.com')).toEqual({ isValid: true });

      // Email with hyphens
      expect(validateEmail('user-name@test-domain.com')).toEqual({ isValid: true });
    });
  });

  describe('validateNotificationThreshold', () => {
    test('should validate correct threshold values', () => {
      const validThresholds = [0, 100, 1000, 5000, 50000, 100000]; // $0 to $1000

      validThresholds.forEach(threshold => {
        expect(validateNotificationThreshold(threshold)).toEqual({ isValid: true });
      });
    });

    test('should reject negative thresholds', () => {
      const negativeThresholds = [-1, -100, -1000];

      negativeThresholds.forEach(threshold => {
        const result = validateNotificationThreshold(threshold);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Threshold must be a non-negative integer in cents');
      });
    });

    test('should reject non-integer thresholds', () => {
      const nonIntegerThresholds = [100.5, 999.99, 10.1];

      nonIntegerThresholds.forEach(threshold => {
        const result = validateNotificationThreshold(threshold);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Threshold must be a non-negative integer in cents');
      });
    });

    test('should reject thresholds above maximum', () => {
      const tooHighThresholds = [100001, 200000, 500000]; // Above $1000

      tooHighThresholds.forEach(threshold => {
        const result = validateNotificationThreshold(threshold);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Threshold cannot exceed $1000.00');
      });
    });

    test('should handle edge cases', () => {
      // Exactly at maximum
      expect(validateNotificationThreshold(100000)).toEqual({ isValid: true });

      // Just over maximum
      expect(validateNotificationThreshold(100001)).toEqual({
        isValid: false,
        error: 'Threshold cannot exceed $1000.00'
      });

      // Zero threshold (valid for disabling notifications)
      expect(validateNotificationThreshold(0)).toEqual({ isValid: true });
    });

    test('should reject non-numeric inputs', () => {
      const invalidInputs = ['100', null, undefined, {}, [], true];

      invalidInputs.forEach(input => {
        const result = validateNotificationThreshold(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Threshold must be a non-negative integer in cents');
      });
    });

    test('should handle special numeric values', () => {
      // NaN
      expect(validateNotificationThreshold(NaN)).toEqual({
        isValid: false,
        error: 'Threshold must be a non-negative integer in cents'
      });

      // Infinity
      expect(validateNotificationThreshold(Infinity)).toEqual({
        isValid: false,
        error: 'Threshold must be a non-negative integer in cents'
      });

      // -Infinity
      expect(validateNotificationThreshold(-Infinity)).toEqual({
        isValid: false,
        error: 'Threshold must be a non-negative integer in cents'
      });
    });
  });

  describe('validation integration', () => {
    test('should work together for complete payment validation', () => {
      // Valid payment setup
      const paymentMethodId = 'pm_1234567890abcdef123456';
      const currency = 'USD';
      const email = 'user@example.com';
      const threshold = 1000;

      expect(validateStripePaymentMethodId(paymentMethodId).isValid).toBe(true);
      expect(validateCurrency(currency).isValid).toBe(true);
      expect(validateEmail(email).isValid).toBe(true);
      expect(validateNotificationThreshold(threshold).isValid).toBe(true);
    });

    test('should catch invalid combinations', () => {
      // Invalid combinations
      expect(validateStripePaymentMethodId('invalid_pm').isValid).toBe(false);
      expect(validateCurrency('INVALID').isValid).toBe(false);
      expect(validateEmail('invalid-email').isValid).toBe(false);
      expect(validateNotificationThreshold(-100).isValid).toBe(false);
    });
  });
});