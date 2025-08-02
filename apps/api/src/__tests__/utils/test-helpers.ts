/**
 * Test helper utilities and data factories
 */

export const testDataFactory = {
  createCard: (overrides = {}) => ({
    card_id: 'test-card-id',
    user_id: 'test-user-id',
    card_context_hash: 'mock-context-hash',
    encrypted_card_number: 'encrypted-card-number',
    encrypted_cvv: 'encrypted-cvv',
    expiration_date: '1225',
    status: 'active',
    spending_limit: 10000,
    current_balance: 0,
    expires_at: '2025-12-31T23:59:59.999Z',
    merchant_restrictions: null,
    deletion_key: 'mock-deletion-key',
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides
  }),

  createCardCredentials: () => ({
    cardNumber: '4111111111111111',
    cvv: '123'
  }),

  createUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    username: 'testuser',
    email_verified: true,
    created_at: '2024-01-01T00:00:00.000Z',
    last_active: '2024-01-01T00:00:00.000Z',
    privacy_settings: {
      dataRetention: 365,
      analyticsOptOut: false
    },
    ...overrides
  }),

  createTransaction: (overrides = {}) => ({
    id: 'test-transaction-id',
    card_id: 'test-card-id',
    user_id: 'test-user-id',
    amount_usd: 1000,
    currency: 'USD',
    merchant_name: 'Test Merchant',
    merchant_category: 'grocery',
    transaction_type: 'purchase',
    status: 'completed',
    created_at: '2024-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides
  })
};

export const setupMocks = {
  authSuccess: () => {
    // Mock successful authentication
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
  },

  privacyService: () => {
    // Mock privacy service configuration
    process.env.CARD_ENCRYPTION_KEY = 'test-card-encryption-key';
    process.env.DELETION_SIGNING_KEY = 'test-deletion-signing-key';
  },

  supabaseClient: () => {
    // Mock Supabase client setup is handled in individual test files
  }
};

export const expectApiResponse = (response: any, expectedStatus: number) => {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('success');
};

export const expectSuccessResponse = (response: any, expectedData?: any) => {
  expectApiResponse(response, 200);
  expect(response.body.success).toBe(true);
  if (expectedData) {
    expect(response.body.data).toEqual(expect.objectContaining(expectedData));
  }
};

export const expectErrorResponse = (response: any, expectedStatus: number, expectedError?: string) => {
  expectApiResponse(response, expectedStatus);
  expect(response.body.success).toBe(false);
  if (expectedError) {
    expect(response.body.error).toContain(expectedError);
  }
};