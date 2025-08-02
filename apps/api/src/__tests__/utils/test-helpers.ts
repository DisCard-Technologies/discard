/**
 * Common Test Utilities and Helpers
 * Provides reusable testing patterns and utilities
 */

import { createMockSupabaseClient, mockResponses, mockScenarios } from './supabase-mock';

/**
 * Test data factories
 */
export const testDataFactory = {
  createUser: (overrides: Partial<typeof mockResponses.user> = {}) => ({
    ...mockResponses.user,
    ...overrides
  }),

  createCard: (overrides: Partial<typeof mockResponses.card> = {}) => ({
    ...mockResponses.card,
    ...overrides
  }),

  createToken: (overrides: Partial<typeof mockResponses.token> = {}) => ({
    ...mockResponses.token,
    ...overrides
  }),

  createAuthTokens: () => ({
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token'
  }),

  createCardCredentials: () => ({
    cardNumber: '4111111111111111',
    cvv: '123'
  })
};

/**
 * Common mock setups for different scenarios
 */
export const setupMocks = {
  /**
   * Setup mocks for successful authentication flow
   */
  authSuccess: () => {
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('mock_jwt_token');
    jwt.verify.mockReturnValue({ 
      user_id: 'test-user-id', 
      email: 'test@example.com', 
      type: 'access' 
    });
  },

  /**
   * Setup mocks for failed authentication
   */
  authFailure: () => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValue(false);
  },

  /**
   * Setup mocks for privacy service
   */
  privacyService: () => {
    const { privacyService } = require('../../services/cards/privacy.service');
    
    privacyService.validateSpendingLimit.mockReturnValue({ valid: true });
    privacyService.generateCardCredentials.mockReturnValue(testDataFactory.createCardCredentials());
    privacyService.generateCardContext.mockReturnValue('mock-context-hash');
    privacyService.generateDeletionKey.mockReturnValue('mock-deletion-key');
    privacyService.encryptCardData.mockReturnValue('encrypted-data');
    privacyService.createDeletionProof.mockReturnValue('deletion-proof');
    privacyService.decryptCardData.mockReturnValue(testDataFactory.createCardCredentials());
  }
};

/**
 * Helper to setup standard Supabase mocks for a test
 */
export function setupSupabaseMocks() {
  const mockClient = createMockSupabaseClient();
  
  // Store original jest.mock for restoration
  const originalMock = jest.fn;
  
  return {
    mockClient,
    scenarios: mockScenarios,
    resetMocks: () => {
      jest.clearAllMocks();
    }
  };
}

/**
 * Helper to create a mock request with authentication
 */
export function createAuthenticatedRequest(overrides: any = {}) {
  return {
    headers: {
      authorization: 'Bearer mock_token',
      ...overrides.headers
    },
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      ...overrides.user
    },
    ...overrides
  };
}

/**
 * Helper to validate API response structure
 */
export function expectApiResponse(response: any, expectedStatus: number = 200) {
  expect(response.status).toBe(expectedStatus);
  
  if (expectedStatus >= 200 && expectedStatus < 300) {
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('data');
  } else {
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('error');
  }
}

/**
 * Helper to validate pagination response
 */
export function expectPaginatedResponse(response: any) {
  expectApiResponse(response);
  expect(response.body.data).toBeInstanceOf(Array);
  expect(response.body).toHaveProperty('pagination');
  expect(response.body.pagination).toHaveProperty('total');
  expect(response.body.pagination).toHaveProperty('limit');
}

/**
 * Helper to create test timeout wrapper
 */
export function withTimeout<T>(promise: Promise<T>, timeout: number = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Test timeout')), timeout)
    )
  ]);
}