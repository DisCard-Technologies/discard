// Mock environment variables first
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

import { TransactionAnalyticsService } from '../../../../services/transactions/transaction-analytics.service';
import { supabase } from '../../../../utils/supabase';

// Mock dependencies
jest.mock('../../../../utils/supabase');
jest.mock('../../../../utils/logger');

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('TransactionAnalyticsService', () => {
  let service: TransactionAnalyticsService;

  beforeEach(() => {
    service = new TransactionAnalyticsService();
    jest.clearAllMocks();
  });

  describe('getCardAnalytics', () => {
    const mockCard = {
      id: 'card-123',
      card_context_hash: 'context-hash-123'
    };

    const mockTransactions = [
      {
        transaction_id: 'tx-1',
        merchant_name: 'Grocery Store',
        merchant_category: 'grocery',
        amount: 5000, // $50.00
        status: 'settled',
        processed_at: '2025-08-01T10:00:00Z'
      },
      {
        transaction_id: 'tx-2',
        merchant_name: 'Gas Station',
        merchant_category: 'gas',
        amount: 3000, // $30.00
        status: 'settled',
        processed_at: '2025-08-02T15:30:00Z'
      },
      {
        transaction_id: 'tx-3',
        merchant_name: 'Restaurant',
        merchant_category: 'restaurant',
        amount: 2500, // $25.00
        status: 'settled',
        processed_at: '2025-08-03T19:00:00Z'
      },
      {
        transaction_id: 'tx-4',
        merchant_name: 'Another Grocery Store',
        merchant_category: 'grocery',
        amount: 7500, // $75.00
        status: 'settled',
        processed_at: '2025-08-04T11:15:00Z'
      }
    ];

    it('should return comprehensive analytics for authorized card', async () => {
      // Mock card query
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RPC call
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });

      // Mock transactions query
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockTransactions,
          error: null
        })
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'cards') {
          return mockCardQuery as any;
        } else if (table === 'payment_transactions') {
          return mockTransactionQuery as any;
        }
        return {} as any;
      });

      mockSupabase.rpc = mockRpc;

      const result = await service.getCardAnalytics({
        cardId: 'card-123',
        userId: 'user-123',
        periodDays: 30
      });

      // Verify card access check
      expect(mockCardQuery.eq).toHaveBeenCalledWith('id', 'card-123');
      expect(mockCardQuery.eq).toHaveBeenCalledWith('user_id', 'user-123');

      // Verify RLS context setting
      expect(mockRpc).toHaveBeenCalledWith('set_app_context', {
        context_value: 'context-hash-123'
      });

      // Verify transaction query
      expect(mockTransactionQuery.eq).toHaveBeenCalledWith('card_context_hash', 'context-hash-123');
      expect(mockTransactionQuery.eq).toHaveBeenCalledWith('status', 'settled');

      // Verify analytics results
      expect(result).toEqual({
        totalSpent: 18000, // $50 + $30 + $25 + $75 = $180.00
        transactionCount: 4,
        averageTransactionAmount: 4500, // $180 / 4 = $45.00
        medianTransactionAmount: 4000, // ($30 + $50) / 2 = $40.00
        largestTransaction: {
          amount: 7500,
          merchantName: 'Another Grocery Store',
          date: '2025-08-04T11:15:00Z'
        },
        smallestTransaction: {
          amount: 2500,
          merchantName: 'Restaurant',
          date: '2025-08-03T19:00:00Z'
        },
        categoryBreakdown: {
          grocery: {
            amount: 12500, // $50 + $75 = $125.00
            count: 2,
            percentage: 69.44 // 125/180 * 100 = 69.44%
          },
          gas: {
            amount: 3000, // $30.00
            count: 1,
            percentage: 16.67 // 30/180 * 100 = 16.67%
          },
          restaurant: {
            amount: 2500, // $25.00
            count: 1,
            percentage: 13.89 // 25/180 * 100 = 13.89%
          }
        },
        spendingTrends: expect.arrayContaining([
          expect.objectContaining({
            date: expect.any(String),
            amount: expect.any(Number),
            transactionCount: expect.any(Number)
          })
        ]),
        transactionFrequency: {
          daily: expect.any(Number),
          weekly: expect.any(Number)
        },
        periodStart: expect.any(String),
        periodEnd: expect.any(String)
      });
    });

    it('should return null for unauthorized card access', async () => {
      // Mock card query to return null (unauthorized)
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);

      const result = await service.getCardAnalytics({
        cardId: 'card-123',
        userId: 'different-user',
        periodDays: 30
      });

      expect(result).toBeNull();
    });

    it('should handle empty transaction data', async () => {
      // Mock card query
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RPC call
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });

      // Mock empty transactions query
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'cards') {
          return mockCardQuery as any;
        } else if (table === 'payment_transactions') {
          return mockTransactionQuery as any;
        }
        return {} as any;
      });

      mockSupabase.rpc = mockRpc;

      const result = await service.getCardAnalytics({
        cardId: 'card-123',
        userId: 'user-123',
        periodDays: 30
      });

      expect(result).toEqual({
        totalSpent: 0,
        transactionCount: 0,
        averageTransactionAmount: 0,
        medianTransactionAmount: 0,
        largestTransaction: null,
        smallestTransaction: null,
        categoryBreakdown: {},
        spendingTrends: [],
        transactionFrequency: {
          daily: 0,
          weekly: 0
        },
        periodStart: expect.any(String),
        periodEnd: expect.any(String)
      });
    });

    it('should handle database errors', async () => {
      // Mock card query
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RPC call
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });

      // Mock transaction query with error
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' }
        })
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'cards') {
          return mockCardQuery as any;
        } else if (table === 'payment_transactions') {
          return mockTransactionQuery as any;
        }
        return {} as any;
      });

      mockSupabase.rpc = mockRpc;

      await expect(service.getCardAnalytics({
        cardId: 'card-123',
        userId: 'user-123',
        periodDays: 30
      })).rejects.toEqual({ message: 'Database error' });
    });

    it('should calculate correct spending trends for weekly grouping', async () => {
      const weeklyMockTransactions = [
        {
          transaction_id: 'tx-1',
          merchant_name: 'Store A',
          merchant_category: 'retail',
          amount: 1000,
          status: 'settled',
          processed_at: '2025-07-01T10:00:00Z' // Week 1
        },
        {
          transaction_id: 'tx-2',
          merchant_name: 'Store B',
          merchant_category: 'retail',
          amount: 2000,
          status: 'settled',
          processed_at: '2025-07-02T15:00:00Z' // Same week
        },
        {
          transaction_id: 'tx-3',
          merchant_name: 'Store C',
          merchant_category: 'retail',
          amount: 3000,
          status: 'settled',
          processed_at: '2025-07-08T12:00:00Z' // Week 2
        }
      ];

      // Mock card query
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RPC call
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });

      // Mock transactions query
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: weeklyMockTransactions,
          error: null
        })
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'cards') {
          return mockCardQuery as any;
        } else if (table === 'payment_transactions') {
          return mockTransactionQuery as any;
        }
        return {} as any;
      });

      mockSupabase.rpc = mockRpc;

      const result = await service.getCardAnalytics({
        cardId: 'card-123',
        userId: 'user-123',
        periodDays: 45 // > 30 days, should group by week
      });

      // Check spending trends are grouped by week
      expect(result!.spendingTrends).toHaveLength(2);
      expect(result!.spendingTrends[0]).toEqual({
        date: '2025-06-29', // Start of week containing July 1st
        amount: 3000, // $10 + $20
        transactionCount: 2
      });
      expect(result!.spendingTrends[1]).toEqual({
        date: '2025-07-06', // Start of week containing July 8th
        amount: 3000, // $30
        transactionCount: 1
      });
    });
  });
});