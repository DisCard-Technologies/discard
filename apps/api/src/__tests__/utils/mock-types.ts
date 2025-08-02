/**
 * TypeScript type definitions for test mocks
 * Simplifies complex Supabase type issues
 */

export interface MockQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  [key: string]: jest.Mock; // Allow any method to be mocked
}

export interface SimpleMockSupabase {
  from: jest.Mock<MockQueryBuilder>;
}

/**
 * Create a simple mock that bypasses complex Supabase typing
 */
export function createSimpleMock(): SimpleMockSupabase {
  const mockBuilder: MockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn()
  };

  return {
    from: jest.fn(() => mockBuilder)
  };
}