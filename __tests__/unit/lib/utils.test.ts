/**
 * Utility Functions Tests
 *
 * Tests for common utility functions used throughout the app.
 * These tests import and test the ACTUAL source code from lib/utils.ts
 */

import {
  colors,
  formatCurrency,
  formatLargeNumber,
  formatPercentage,
  truncateAddress,
} from '@/lib/utils';

describe('Utility Functions', () => {
  // ==========================================================================
  // Colors Constants
  // ==========================================================================

  describe('Colors Constants', () => {
    test('defines primary color', () => {
      expect(colors.primary).toBe('#10B981');
    });

    test('defines background color', () => {
      expect(colors.background).toBe('#0A0A0A');
    });

    test('defines all required colors', () => {
      expect(colors).toHaveProperty('primary');
      expect(colors).toHaveProperty('background');
      expect(colors).toHaveProperty('surface');
      expect(colors).toHaveProperty('card');
      expect(colors).toHaveProperty('foreground');
      expect(colors).toHaveProperty('muted');
      expect(colors).toHaveProperty('mutedForeground');
      expect(colors).toHaveProperty('accent');
      expect(colors).toHaveProperty('border');
      expect(colors).toHaveProperty('destructive');
    });
  });

  // ==========================================================================
  // Currency Formatting (Real Implementation)
  // ==========================================================================

  describe('formatCurrency', () => {
    test('formats USD correctly', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency(0.01)).toBe('$0.01');
    });

    test('formats large amounts with commas', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
      expect(formatCurrency(123456789.99)).toBe('$123,456,789.99');
    });

    test('handles negative amounts', () => {
      expect(formatCurrency(-50)).toBe('-$50.00');
    });

    test('rounds to two decimal places', () => {
      expect(formatCurrency(10.999)).toBe('$11.00');
      expect(formatCurrency(10.994)).toBe('$10.99');
    });

    test('supports different currencies', () => {
      expect(formatCurrency(100, 'EUR')).toContain('100');
      expect(formatCurrency(100, 'GBP')).toContain('100');
    });
  });

  // ==========================================================================
  // Large Number Formatting (Real Implementation)
  // ==========================================================================

  describe('formatLargeNumber', () => {
    test('formats millions with M suffix', () => {
      expect(formatLargeNumber(1000000)).toBe('1.00M');
      expect(formatLargeNumber(2500000)).toBe('2.50M');
      expect(formatLargeNumber(12345678)).toBe('12.35M');
    });

    test('formats thousands with K suffix', () => {
      expect(formatLargeNumber(1000)).toBe('1.00K');
      expect(formatLargeNumber(2500)).toBe('2.50K');
      expect(formatLargeNumber(999999)).toBe('1000.00K');
    });

    test('formats small numbers without suffix', () => {
      expect(formatLargeNumber(999)).toBe('999.00');
      expect(formatLargeNumber(100)).toBe('100.00');
      expect(formatLargeNumber(0)).toBe('0.00');
    });

    test('handles decimal numbers', () => {
      expect(formatLargeNumber(1234.56)).toBe('1.23K');
    });
  });

  // ==========================================================================
  // Percentage Formatting (Real Implementation)
  // ==========================================================================

  describe('formatPercentage', () => {
    test('adds plus sign for positive values', () => {
      expect(formatPercentage(5.25)).toBe('+5.25%');
      expect(formatPercentage(100)).toBe('+100.00%');
    });

    test('shows negative sign for negative values', () => {
      expect(formatPercentage(-5.25)).toBe('-5.25%');
      expect(formatPercentage(-100)).toBe('-100.00%');
    });

    test('handles zero', () => {
      expect(formatPercentage(0)).toBe('+0.00%');
    });

    test('formats to two decimal places', () => {
      expect(formatPercentage(3.14159)).toBe('+3.14%');
    });
  });

  // ==========================================================================
  // Address Truncation (Real Implementation)
  // ==========================================================================

  describe('truncateAddress', () => {
    const testAddress = 'So11111111111111111111111111111111111111112';

    test('truncates long address with default params', () => {
      const result = truncateAddress(testAddress);
      expect(result).toBe('So1111...1112');
      expect(result.length).toBeLessThan(testAddress.length);
    });

    test('truncates with custom start length', () => {
      expect(truncateAddress(testAddress, 8, 4)).toBe('So111111...1112');
    });

    test('truncates with custom end length', () => {
      expect(truncateAddress(testAddress, 6, 6)).toBe('So1111...111112');
    });

    test('returns original if shorter than combined lengths', () => {
      const shortAddress = 'abc123';
      expect(truncateAddress(shortAddress, 4, 4)).toBe(shortAddress);
    });

    test('handles edge cases', () => {
      expect(truncateAddress('', 4, 4)).toBe('');
      expect(truncateAddress('abcd', 2, 2)).toBe('abcd');
    });
  });

  // ==========================================================================
  // Additional Mock-based Tests (for utility patterns)
  // ==========================================================================

  // ==========================================================================
  // Crypto Amount Formatting
  // ==========================================================================

  describe('Crypto Amount Formatting', () => {
    const formatCrypto = (amount: number, decimals: number = 6): string => {
      if (amount === 0) return '0';
      if (amount < 0.000001) return '<0.000001';
      return amount.toFixed(decimals).replace(/\.?0+$/, '');
    };

    test('formats whole numbers without decimals', () => {
      expect(formatCrypto(100)).toBe('100');
      expect(formatCrypto(1)).toBe('1');
    });

    test('formats decimal amounts', () => {
      expect(formatCrypto(1.5)).toBe('1.5');
      expect(formatCrypto(0.123456)).toBe('0.123456');
    });

    test('handles very small amounts', () => {
      expect(formatCrypto(0.0000001)).toBe('<0.000001');
    });

    test('removes trailing zeros', () => {
      expect(formatCrypto(1.100000)).toBe('1.1');
      expect(formatCrypto(1.000000)).toBe('1');
    });
  });

  // ==========================================================================
  // Time Formatting
  // ==========================================================================

  describe('Time Formatting', () => {
    const formatRelativeTime = (timestamp: number): string => {
      const now = Date.now();
      const diff = now - timestamp;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return new Date(timestamp).toLocaleDateString();
    };

    test('shows "just now" for recent timestamps', () => {
      const recent = Date.now() - 30000; // 30 seconds ago
      expect(formatRelativeTime(recent)).toBe('just now');
    });

    test('shows minutes for timestamps within an hour', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');
    });

    test('shows hours for timestamps within a day', () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
    });

    test('shows days for timestamps within a week', () => {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
    });
  });

  // ==========================================================================
  // String Utilities
  // ==========================================================================

  describe('String Utilities', () => {
    const truncate = (str: string, maxLength: number): string => {
      if (str.length <= maxLength) return str;
      return str.slice(0, maxLength - 3) + '...';
    };

    const capitalize = (str: string): string => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    const slugify = (str: string): string => {
      return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    };

    test('truncates long strings', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...');
      expect(truncate('Short', 10)).toBe('Short');
    });

    test('capitalizes first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('Hello');
      expect(capitalize('')).toBe('');
    });

    test('slugifies strings', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test 123!')).toBe('test-123');
      expect(slugify('--test--')).toBe('test');
    });
  });

  // ==========================================================================
  // Number Utilities
  // ==========================================================================

  describe('Number Utilities', () => {
    const clamp = (value: number, min: number, max: number): number => {
      return Math.min(Math.max(value, min), max);
    };

    const percentage = (value: number, total: number): number => {
      if (total === 0) return 0;
      return (value / total) * 100;
    };

    const roundTo = (value: number, decimals: number): number => {
      const factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    };

    test('clamps values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    test('calculates percentage', () => {
      expect(percentage(25, 100)).toBe(25);
      expect(percentage(1, 4)).toBe(25);
      expect(percentage(0, 100)).toBe(0);
      expect(percentage(50, 0)).toBe(0); // Division by zero
    });

    test('rounds to specified decimals', () => {
      expect(roundTo(3.14159, 2)).toBe(3.14);
      expect(roundTo(3.14159, 4)).toBe(3.1416);
      expect(roundTo(3.14159, 0)).toBe(3);
    });
  });

  // ==========================================================================
  // Array Utilities
  // ==========================================================================

  describe('Array Utilities', () => {
    const unique = <T>(arr: T[]): T[] => [...new Set(arr)];

    const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> => {
      return arr.reduce((acc, item) => {
        const groupKey = String(item[key]);
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(item);
        return acc;
      }, {} as Record<string, T[]>);
    };

    const chunk = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    test('removes duplicates', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
      expect(unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
    });

    test('groups by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];
      const grouped = groupBy(items, 'type');

      expect(grouped['a']).toHaveLength(2);
      expect(grouped['b']).toHaveLength(1);
    });

    test('chunks array', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    });
  });

  // ==========================================================================
  // Validation Utilities
  // ==========================================================================

  describe('Validation Utilities', () => {
    const isValidAmount = (amount: string): boolean => {
      const num = parseFloat(amount);
      return !isNaN(num) && num > 0 && isFinite(num);
    };

    const isValidPercentage = (value: number): boolean => {
      return value >= 0 && value <= 100;
    };

    const isEmpty = (value: any): boolean => {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string') return value.trim() === '';
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return false;
    };

    test('validates amounts', () => {
      expect(isValidAmount('100')).toBe(true);
      expect(isValidAmount('0.01')).toBe(true);
      expect(isValidAmount('0')).toBe(false);
      expect(isValidAmount('-10')).toBe(false);
      expect(isValidAmount('abc')).toBe(false);
      expect(isValidAmount('Infinity')).toBe(false);
    });

    test('validates percentages', () => {
      expect(isValidPercentage(0)).toBe(true);
      expect(isValidPercentage(50)).toBe(true);
      expect(isValidPercentage(100)).toBe(true);
      expect(isValidPercentage(-1)).toBe(false);
      expect(isValidPercentage(101)).toBe(false);
    });

    test('checks for empty values', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('  ')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
    });
  });

  // ==========================================================================
  // UUID Generation
  // ==========================================================================

  describe('UUID Generation', () => {
    const generateId = (): string => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    test('generates valid UUID v4 format', () => {
      const uuid = generateId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuid).toMatch(uuidRegex);
    });

    test('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }

      expect(ids.size).toBe(100);
    });
  });

  // ==========================================================================
  // Deep Clone
  // ==========================================================================

  describe('Deep Clone', () => {
    const deepClone = <T>(obj: T): T => {
      return JSON.parse(JSON.stringify(obj));
    };

    test('clones nested objects', () => {
      const original = {
        a: 1,
        b: { c: 2, d: { e: 3 } },
      };
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    test('clones arrays', () => {
      const original = [1, [2, 3], [[4]]];
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[1]).not.toBe(original[1]);
    });
  });

  // ==========================================================================
  // Debounce
  // ==========================================================================

  describe('Debounce', () => {
    jest.useFakeTimers();

    test('delays function execution', () => {
      const fn = jest.fn();
      const debounce = (func: Function, wait: number) => {
        let timeout: ReturnType<typeof setTimeout>;
        return (...args: any[]) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => func(...args), wait);
        };
      };

      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    afterAll(() => {
      jest.useRealTimers();
    });
  });
});
