/**
 * Card Test Fixtures
 *
 * Factory functions for creating test card data.
 */

import type { Id } from '@/convex/_generated/dataModel';

// ============================================================================
// Types
// ============================================================================

export interface TestCard {
  _id: Id<'cards'>;
  userId: Id<'users'>;
  nickname: string;
  color: string;
  cardNumber: string;
  cvv: string;
  expirationMonth: number;
  expirationYear: number;
  balance: number;
  spendingLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
  currentDailySpend: number;
  currentMonthlySpend: number;
  isFrozen: boolean;
  isDeleted: boolean;
  privacyIsolated: boolean;
  blockedMccCodes: string[];
  blockedCountries: string[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Default Values
// ============================================================================

const defaultCard: Omit<TestCard, '_id' | 'userId'> = {
  nickname: 'Test Card',
  color: '#8B5CF6',
  cardNumber: '4111111111111111',
  cvv: '123',
  expirationMonth: 12,
  expirationYear: 2028,
  balance: 10000, // $100.00 in cents
  spendingLimit: 100000, // $1000.00
  dailyLimit: 50000, // $500.00
  monthlyLimit: 200000, // $2000.00
  currentDailySpend: 0,
  currentMonthlySpend: 0,
  isFrozen: false,
  isDeleted: false,
  privacyIsolated: false,
  blockedMccCodes: [],
  blockedCountries: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ============================================================================
// Factory Functions
// ============================================================================

let cardCounter = 0;

/**
 * Create a test card with optional overrides
 */
export function createTestCard(
  overrides: Partial<TestCard> = {},
  userId: Id<'users'> = 'test_user_001' as Id<'users'>
): TestCard {
  cardCounter++;
  return {
    _id: `card_${cardCounter}_${Date.now()}` as Id<'cards'>,
    userId,
    ...defaultCard,
    ...overrides,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

/**
 * Create a frozen card
 */
export function createFrozenCard(
  overrides: Partial<TestCard> = {},
  userId?: Id<'users'>
): TestCard {
  return createTestCard(
    {
      ...overrides,
      isFrozen: true,
      nickname: overrides.nickname ?? 'Frozen Card',
    },
    userId
  );
}

/**
 * Create a privacy-isolated card
 */
export function createPrivacyIsolatedCard(
  overrides: Partial<TestCard> = {},
  userId?: Id<'users'>
): TestCard {
  return createTestCard(
    {
      ...overrides,
      privacyIsolated: true,
      nickname: overrides.nickname ?? 'Privacy Card',
      color: overrides.color ?? '#10B981',
    },
    userId
  );
}

/**
 * Create a card with spending restrictions
 */
export function createRestrictedCard(
  restrictions: {
    blockedMccCodes?: string[];
    blockedCountries?: string[];
  } = {},
  overrides: Partial<TestCard> = {},
  userId?: Id<'users'>
): TestCard {
  return createTestCard(
    {
      ...overrides,
      blockedMccCodes: restrictions.blockedMccCodes ?? ['5411', '5812'], // Grocery, Restaurant
      blockedCountries: restrictions.blockedCountries ?? ['RU', 'CN'],
      nickname: overrides.nickname ?? 'Restricted Card',
    },
    userId
  );
}

/**
 * Create a card near its daily limit
 */
export function createNearLimitCard(
  overrides: Partial<TestCard> = {},
  userId?: Id<'users'>
): TestCard {
  return createTestCard(
    {
      ...overrides,
      dailyLimit: 10000, // $100.00
      currentDailySpend: 9500, // $95.00 spent
      nickname: overrides.nickname ?? 'Near Limit Card',
    },
    userId
  );
}

/**
 * Create a card with zero balance
 */
export function createEmptyCard(
  overrides: Partial<TestCard> = {},
  userId?: Id<'users'>
): TestCard {
  return createTestCard(
    {
      ...overrides,
      balance: 0,
      nickname: overrides.nickname ?? 'Empty Card',
    },
    userId
  );
}

/**
 * Create multiple test cards
 */
export function createTestCards(
  count: number,
  overrides: Partial<TestCard> = {},
  userId?: Id<'users'>
): TestCard[] {
  return Array.from({ length: count }, (_, i) =>
    createTestCard(
      {
        ...overrides,
        nickname: `${overrides.nickname ?? 'Test Card'} ${i + 1}`,
      },
      userId
    )
  );
}

/**
 * Create a card with specific balance in dollars
 */
export function createCardWithBalance(
  balanceDollars: number,
  overrides: Partial<TestCard> = {},
  userId?: Id<'users'>
): TestCard {
  return createTestCard(
    {
      ...overrides,
      balance: Math.round(balanceDollars * 100),
    },
    userId
  );
}

// ============================================================================
// Card Color Presets
// ============================================================================

export const CARD_COLORS = {
  purple: '#8B5CF6',
  blue: '#3B82F6',
  green: '#10B981',
  red: '#EF4444',
  orange: '#F97316',
  pink: '#EC4899',
  cyan: '#06B6D4',
  yellow: '#EAB308',
};

// ============================================================================
// Reset Helper
// ============================================================================

/**
 * Reset card counter (useful between test suites)
 */
export function resetCardCounter(): void {
  cardCounter = 0;
}
