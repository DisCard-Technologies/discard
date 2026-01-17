/**
 * User Test Fixtures
 *
 * Factory functions for creating test user data.
 */

import type { Id } from '@/convex/_generated/dataModel';

// ============================================================================
// Types
// ============================================================================

export interface TestUser {
  _id: Id<'users'>;
  email?: string;
  phone?: string;
  displayName?: string;
  walletAddress: string;
  organizationId: string;
  credentialId?: string;
  isVerified: boolean;
  verificationLevel: 'none' | 'basic' | 'kyc_lite' | 'kyc_full';
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  settings?: {
    notifications: boolean;
    biometricEnabled: boolean;
    defaultCurrency: string;
    theme: 'light' | 'dark' | 'system';
  };
}

// ============================================================================
// Default Values
// ============================================================================

const defaultUser: Omit<TestUser, '_id'> = {
  walletAddress: 'test_wallet_' + '1'.repeat(32),
  organizationId: 'test_org_001',
  isVerified: true,
  verificationLevel: 'basic',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  settings: {
    notifications: true,
    biometricEnabled: true,
    defaultCurrency: 'USD',
    theme: 'dark',
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

let userCounter = 0;

/**
 * Create a test user with optional overrides
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  userCounter++;
  const userId = `user_${userCounter}_${Date.now()}` as Id<'users'>;

  return {
    _id: userId,
    ...defaultUser,
    walletAddress: `wallet_${userCounter}_${'1'.repeat(30)}`.slice(0, 44),
    ...overrides,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

/**
 * Create a verified user with email
 */
export function createVerifiedUser(
  email: string,
  overrides: Partial<TestUser> = {}
): TestUser {
  return createTestUser({
    email,
    isVerified: true,
    verificationLevel: 'basic',
    ...overrides,
  });
}

/**
 * Create a fully KYC'd user
 */
export function createKycUser(
  email: string,
  phone: string,
  overrides: Partial<TestUser> = {}
): TestUser {
  return createTestUser({
    email,
    phone,
    isVerified: true,
    verificationLevel: 'kyc_full',
    displayName: overrides.displayName ?? 'Test User',
    ...overrides,
  });
}

/**
 * Create an unverified user
 */
export function createUnverifiedUser(overrides: Partial<TestUser> = {}): TestUser {
  return createTestUser({
    isVerified: false,
    verificationLevel: 'none',
    ...overrides,
  });
}

/**
 * Create a mock user ID (for development/testing without Convex auth)
 */
export function createMockUserId(): Id<'users'> {
  return `mock_user_${Date.now()}` as Id<'users'>;
}

/**
 * Check if a user ID is a mock ID
 */
export function isMockUserId(userId: Id<'users'> | null | undefined): boolean {
  return userId?.startsWith('mock_user_') ?? false;
}

/**
 * Create multiple test users
 */
export function createTestUsers(count: number, overrides: Partial<TestUser> = {}): TestUser[] {
  return Array.from({ length: count }, (_, i) =>
    createTestUser({
      ...overrides,
      displayName: `Test User ${i + 1}`,
      email: `testuser${i + 1}@example.com`,
    })
  );
}

// ============================================================================
// Pre-defined Test Users
// ============================================================================

/**
 * Standard test user for most tests
 */
export const TEST_USER = createTestUser({
  _id: 'test_user_001' as Id<'users'>,
  email: 'test@example.com',
  displayName: 'Test User',
});

/**
 * Alice - for transfer tests
 */
export const ALICE = createTestUser({
  _id: 'alice_001' as Id<'users'>,
  email: 'alice@example.com',
  displayName: 'Alice',
  walletAddress: 'alice_wallet_' + '1'.repeat(32),
});

/**
 * Bob - for transfer tests
 */
export const BOB = createTestUser({
  _id: 'bob_001' as Id<'users'>,
  email: 'bob@example.com',
  displayName: 'Bob',
  walletAddress: 'bob_wallet_' + '2'.repeat(32),
});

/**
 * Unverified user for testing verification flows
 */
export const UNVERIFIED_USER = createUnverifiedUser({
  _id: 'unverified_001' as Id<'users'>,
  email: 'unverified@example.com',
});

// ============================================================================
// Reset Helper
// ============================================================================

/**
 * Reset user counter
 */
export function resetUserCounter(): void {
  userCounter = 0;
}
