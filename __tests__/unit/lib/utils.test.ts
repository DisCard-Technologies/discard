/**
 * Utility Functions Tests
 *
 * Tests for common utility functions used throughout the app.
 */

describe('Utility Functions', () => {
  // ==========================================================================
  // Currency Formatting
  // ==========================================================================

  describe('Currency Formatting', () => {
    const formatCurrency = (amount: number, currency: string = 'USD'): string => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    };

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
  });

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
        let timeout: NodeJS.Timeout;
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
