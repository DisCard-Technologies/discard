/**
 * Supabase client mocking utilities for tests
 */

export interface MockSupabaseClient {
  from: jest.MockedFunction<any>;
}

export interface MockQuery {
  insert: jest.MockedFunction<any>;
  select: jest.MockedFunction<any>;
  update: jest.MockedFunction<any>;
  delete: jest.MockedFunction<any>;
  upsert: jest.MockedFunction<any>;
  eq: jest.MockedFunction<any>;
  neq: jest.MockedFunction<any>;
  gt: jest.MockedFunction<any>;
  gte: jest.MockedFunction<any>;
  lt: jest.MockedFunction<any>;
  lte: jest.MockedFunction<any>;
  like: jest.MockedFunction<any>;
  ilike: jest.MockedFunction<any>;
  is: jest.MockedFunction<any>;
  in: jest.MockedFunction<any>;
  contains: jest.MockedFunction<any>;
  containedBy: jest.MockedFunction<any>;
  not: jest.MockedFunction<any>;
  or: jest.MockedFunction<any>;
  filter: jest.MockedFunction<any>;
  order: jest.MockedFunction<any>;
  limit: jest.MockedFunction<any>;
  range: jest.MockedFunction<any>;
  single: jest.MockedFunction<any>;
  maybeSingle: jest.MockedFunction<any>;
}

export function createMockSupabaseClient(): MockSupabaseClient {
  const createMockQueryChain = () => {
    const chain: any = {};
    
    // All chainable methods that return this
    const chainableMethods = [
      'insert', 'select', 'update', 'delete', 'upsert',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
      'is', 'in', 'contains', 'containedBy', 'not', 'or', 'filter',
      'order', 'limit', 'range'
    ];
    
    chainableMethods.forEach(method => {
      chain[method] = jest.fn().mockReturnValue(chain);
    });
    
    // Terminal methods that resolve
    chain.single = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    
    // Make it thenable for direct await
    chain.then = jest.fn((resolve: (value: any) => any) => {
      return resolve({ data: [], error: null });
    });
    
    return chain;
  };

  return {
    from: jest.fn(() => createMockQueryChain())
  };
}

export const mockScenarios = {
  createCardSuccess: (client: MockSupabaseClient, mockCard: any) => {
    const mockQuery = client.from('cards');
    mockQuery.single.mockResolvedValue({ data: mockCard, error: null });
  },

  listCardsSuccess: (client: MockSupabaseClient, mockCards: any[]) => {
    const mockQuery = client.from('cards');
    mockQuery.limit.mockResolvedValue({ data: mockCards, error: null });
  },

  cardNotFound: (client: MockSupabaseClient) => {
    const mockQuery = client.from('cards');
    mockQuery.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });
  },

  deleteCardSuccess: (client: MockSupabaseClient, mockCard: any) => {
    const mockSelectQuery = client.from('cards');
    const mockUpdateQuery = client.from('cards');
    
    mockSelectQuery.single.mockResolvedValue({ data: mockCard, error: null });
    mockUpdateQuery.eq.mockResolvedValue({ error: null });

    client.from.mockReturnValueOnce(mockSelectQuery)
                .mockReturnValueOnce(mockUpdateQuery);
  }
};

export const mockResponses = {
  success: (data: any) => ({ data, error: null }),
  error: (message: string) => ({ data: null, error: { message } })
};