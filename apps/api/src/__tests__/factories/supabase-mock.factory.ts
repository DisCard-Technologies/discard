/**
 * Supabase mock factory for simplified database mocking in tests
 * Reduces boilerplate and provides consistent mock behavior
 */

import { jest } from '@jest/globals';

export interface SupabaseChainMock {
  select: jest.MockedFunction<any>;
  insert: jest.MockedFunction<any>;
  update: jest.MockedFunction<any>;
  delete: jest.MockedFunction<any>;
  eq: jest.MockedFunction<any>;
  not: jest.MockedFunction<any>;
  lt: jest.MockedFunction<any>;
  gt: jest.MockedFunction<any>;
  gte: jest.MockedFunction<any>;
  lte: jest.MockedFunction<any>;
  order: jest.MockedFunction<any>;
  limit: jest.MockedFunction<any>;
  single: jest.MockedFunction<any>;
  then: jest.MockedFunction<any>;
  mockResolvedValue: jest.MockedFunction<any>;
  mockRejectedValue: jest.MockedFunction<any>;
}

export class SupabaseMockFactory {
  static createChainableMock(): SupabaseChainMock {
    const mockChain: any = {
      // Query builder methods
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      
      // Filter methods
      eq: jest.fn(),
      not: jest.fn(),
      lt: jest.fn(),
      gt: jest.fn(),
      gte: jest.fn(),
      lte: jest.fn(),
      
      // Modifier methods
      order: jest.fn(),
      limit: jest.fn(),
      
      // Terminal methods
      single: jest.fn(),
      
      // Promise interface
      then: jest.fn(),
      
      // Mock helper methods
      mockResolvedValue: jest.fn(),
      mockRejectedValue: jest.fn()
    };

    // Set up chainable behavior - all query builder methods return the mock chain
    mockChain.select.mockReturnValue(mockChain);
    mockChain.insert.mockReturnValue(mockChain);
    mockChain.update.mockReturnValue(mockChain);
    mockChain.delete.mockReturnValue(mockChain);
    mockChain.eq.mockReturnValue(mockChain);
    mockChain.not.mockReturnValue(mockChain);
    mockChain.lt.mockReturnValue(mockChain);
    mockChain.gt.mockReturnValue(mockChain);
    mockChain.gte.mockReturnValue(mockChain);
    mockChain.lte.mockReturnValue(mockChain);
    mockChain.order.mockReturnValue(mockChain);
    mockChain.limit.mockReturnValue(mockChain);
    
    // Default promise behavior
    mockChain.then.mockImplementation((resolve: (value: any) => any) => {
      return resolve({ data: null, error: null });
    });

    // Mock helper method implementations
    mockChain.mockResolvedValue.mockImplementation(function(this: any, value: any) {
      this.then = jest.fn((resolve: (value: any) => any) => resolve(value));
      this.single = jest.fn().mockResolvedValue(value);
      return this;
    });
    
    mockChain.mockRejectedValue.mockImplementation(function(this: any, error: any) {
      this.then = jest.fn((resolve: (value: any) => any, reject: (error: any) => any) => reject(error));
      this.single = jest.fn().mockRejectedValue(error);
      return this;
    });

    return mockChain;
  }

  static createSuccessResponse(data: any): { data: any; error: null } {
    return { data, error: null };
  }

  static createErrorResponse(message: string, code?: string): { data: null; error: any } {
    return { 
      data: null, 
      error: { 
        message, 
        code: code || 'PGRST500',
        details: null,
        hint: null
      } 
    };
  }

  static setupSelectQuery(mock: SupabaseChainMock, data: any): void {
    mock.then.mockImplementation((resolve: (value: any) => any) => {
      return resolve(this.createSuccessResponse(data));
    });
  }

  static setupInsertQuery(mock: SupabaseChainMock, insertedData: any): void {
    const insertChain = {
      select: jest.fn().mockResolvedValue(this.createSuccessResponse(insertedData))
    };
    mock.insert.mockReturnValue(insertChain);
  }

  static setupUpdateQuery(mock: SupabaseChainMock, updatedData: any): void {
    mock.then.mockImplementation((resolve: (value: any) => any) => {
      return resolve(this.createSuccessResponse(updatedData));
    });
  }

  static setupQueryError(mock: SupabaseChainMock, errorMessage: string, code?: string): void {
    mock.then.mockImplementation((resolve: (value: any) => any, reject?: (error: any) => any) => {
      const errorResponse = this.createErrorResponse(errorMessage, code);
      return resolve(errorResponse);
    });
  }

  static clearMock(mock: SupabaseChainMock): void {
    Object.values(mock).forEach((mockFn: any) => {
      if (typeof mockFn?.mockClear === 'function') {
        mockFn.mockClear();
      }
    });

    // Reset to default chainable behavior
    mock.select.mockReturnValue(mock);
    mock.insert.mockReturnValue(mock);
    mock.update.mockReturnValue(mock);
    mock.delete.mockReturnValue(mock);
    mock.eq.mockReturnValue(mock);
    mock.not.mockReturnValue(mock);
    mock.lt.mockReturnValue(mock);
    mock.gt.mockReturnValue(mock);
    mock.gte.mockReturnValue(mock);
    mock.lte.mockReturnValue(mock);
    mock.order.mockReturnValue(mock);
    mock.limit.mockReturnValue(mock);

    // Reset default promise behavior
    mock.then.mockImplementation((resolve: (value: any) => any) => {
      return resolve({ data: null, error: null });
    });
  }
}

/**
 * Common Supabase mock patterns for quick setup
 */
export class SupabaseMockPatterns {
  static walletQuery(mock: SupabaseChainMock, wallets: any[]): void {
    SupabaseMockFactory.setupSelectQuery(mock, wallets);
  }

  static walletInsert(mock: SupabaseChainMock, walletData: any): void {
    SupabaseMockFactory.setupInsertQuery(mock, walletData);
  }

  static walletUpdate(mock: SupabaseChainMock, updatedWallet: any): void {
    SupabaseMockFactory.setupUpdateQuery(mock, updatedWallet);
  }

  static userQuery(mock: SupabaseChainMock, users: any[]): void {
    SupabaseMockFactory.setupSelectQuery(mock, users);
  }

  static transactionQuery(mock: SupabaseChainMock, transactions: any[]): void {
    SupabaseMockFactory.setupSelectQuery(mock, transactions);
  }

  static databaseError(mock: SupabaseChainMock, message: string = 'Database error'): void {
    SupabaseMockFactory.setupQueryError(mock, message, 'PGRST500');
  }

  static notFound(mock: SupabaseChainMock): void {
    SupabaseMockFactory.setupQueryError(mock, 'Not found', 'PGRST116');
  }
}