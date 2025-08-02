/**
 * Centralized Supabase Mock Factory
 * Provides consistent mocking patterns across all test files
 */

export interface MockSupabaseClient {
  from: jest.Mock;
}

export interface MockQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  gt: jest.Mock;
  gte: jest.Mock;
  lt: jest.Mock;
  lte: jest.Mock;
  like: jest.Mock;
  ilike: jest.Mock;
  is: jest.Mock;
  in: jest.Mock;
  contains: jest.Mock;
  containedBy: jest.Mock;
  rangeGt: jest.Mock;
  rangeGte: jest.Mock;
  rangeLt: jest.Mock;
  rangeLte: jest.Mock;
  rangeAdjacent: jest.Mock;
  overlaps: jest.Mock;
  textSearch: jest.Mock;
  match: jest.Mock;
  not: jest.Mock;
  or: jest.Mock;
  filter: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  range: jest.Mock;
  single: jest.Mock;
  maybe_single: jest.Mock;
  csv: jest.Mock;
  geojson: jest.Mock;
  explain: jest.Mock;
  rollback: jest.Mock;
  returns: jest.Mock;
}

/**
 * Creates a mock Supabase query builder with all common methods
 */
export function createMockQueryBuilder(): MockQueryBuilder {
  const builder = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    gt: jest.fn(),
    gte: jest.fn(),
    lt: jest.fn(),
    lte: jest.fn(),
    like: jest.fn(),
    ilike: jest.fn(),
    is: jest.fn(),
    in: jest.fn(),
    contains: jest.fn(),
    containedBy: jest.fn(),
    rangeGt: jest.fn(),
    rangeGte: jest.fn(),
    rangeLt: jest.fn(),
    rangeLte: jest.fn(),
    rangeAdjacent: jest.fn(),
    overlaps: jest.fn(),
    textSearch: jest.fn(),
    match: jest.fn(),
    not: jest.fn(),
    or: jest.fn(),
    filter: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    range: jest.fn(),
    single: jest.fn(),
    maybe_single: jest.fn(),
    csv: jest.fn(),
    geojson: jest.fn(),
    explain: jest.fn(),
    rollback: jest.fn(),
    returns: jest.fn(),
  };

  // Make all methods chainable (return this)
  Object.keys(builder).forEach(key => {
    if (key !== 'single' && key !== 'maybe_single') {
      (builder as any)[key].mockReturnValue(builder);
    }
  });

  return builder;
}

/**
 * Creates a mock Supabase client
 */
export function createMockSupabaseClient(): MockSupabaseClient {
  const mockQueryBuilder = createMockQueryBuilder();
  
  return {
    from: jest.fn((_tableName: string) => mockQueryBuilder)
  };
}

/**
 * Mock responses for common Supabase operations
 */
export const mockResponses = {
  success: { data: {}, error: null },
  error: { data: null, error: new Error('Database error') },
  notFound: { data: null, error: null },
  
  // User responses
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    username: 'testuser',
    email_verified: true,
    password_hash: '$2b$12$hashedpassword',
    created_at: '2023-01-01T00:00:00Z',
    last_active: '2023-01-01T00:00:00Z',
    privacy_settings: { dataRetention: 365, analyticsOptOut: false },
    failed_login_attempts: 0,
    locked_until: null,
    totp_enabled: false
  },

  // Card responses
  card: {
    card_id: 'test-card-id',
    user_id: 'test-user-id',
    card_context_hash: 'mock-context-hash',
    encrypted_card_number: 'encrypted-card-number',
    encrypted_cvv: 'encrypted-cvv',
    expiration_date: '1226',
    status: 'active',
    spending_limit: 10000,
    current_balance: 0,
    expires_at: '2026-12-31T23:59:59.999Z',
    merchant_restrictions: ['grocery', 'gas'],
    deletion_key: 'mock-deletion-key',
    created_at: '2024-01-01T00:00:00.000Z'
  },

  // Token responses
  token: {
    user_id: 'test-user-id',
    token: 'verification-token',
    type: 'email_verification',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    created_at: '2024-01-01T00:00:00.000Z'
  }
};

/**
 * Helper to setup common mock scenarios
 */
export const mockScenarios = {
  // User scenarios
  userExists: (mockClient: MockSupabaseClient, user = mockResponses.user) => {
    const builder = mockClient.from();
    builder.single.mockResolvedValue({ data: user, error: null });
    return builder;
  },

  userNotFound: (mockClient: MockSupabaseClient) => {
    const builder = mockClient.from();
    builder.single.mockResolvedValue({ data: null, error: null });
    return builder;
  },

  createUserSuccess: (mockClient: MockSupabaseClient, user = mockResponses.user) => {
    const builder = mockClient.from();
    builder.single.mockResolvedValue({ data: user, error: null });
    return builder;
  },

  updateSuccess: (mockClient: MockSupabaseClient) => {
    const builder = mockClient.from();
    builder.eq.mockResolvedValue({ error: null });
    return builder;
  },

  deleteSuccess: (mockClient: MockSupabaseClient) => {
    const builder = mockClient.from();
    builder.eq.mockResolvedValue({ error: null });
    return builder;
  },

  // Card scenarios
  cardExists: (mockClient: MockSupabaseClient, card = mockResponses.card) => {
    const builder = mockClient.from();
    builder.single.mockResolvedValue({ data: card, error: null });
    return builder;
  },

  cardNotFound: (mockClient: MockSupabaseClient) => {
    const builder = mockClient.from();
    builder.single.mockResolvedValue({ data: null, error: null });
    return builder;
  },

  createCardSuccess: (mockClient: MockSupabaseClient, card = mockResponses.card) => {
    const builder = mockClient.from();
    builder.single.mockResolvedValue({ data: card, error: null });
    return builder;
  },

  // List scenarios
  listCards: (mockClient: MockSupabaseClient, cards = [mockResponses.card]) => {
    const builder = mockClient.from();
    builder.single.mockResolvedValue({ data: cards, error: null });
    return builder;
  }
};