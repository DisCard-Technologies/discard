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
  eq: jest.MockedFunction<any>;
  order: jest.MockedFunction<any>;
  limit: jest.MockedFunction<any>;
  single: jest.MockedFunction<any>;
}

export function createMockSupabaseClient(): MockSupabaseClient {
  return {
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn()
    }))
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