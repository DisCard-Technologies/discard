// Mock environment variables first
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

import { TransactionSearchService } from '../../../../services/transactions/transaction-search.service';
import { supabase } from '../../../../utils/supabase';

// Mock dependencies
jest.mock('../../../../utils/supabase');
jest.mock('../../../../utils/logger');

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('TransactionSearchService', () => {
  let service: TransactionSearchService;

  beforeEach(() => {
    service = new TransactionSearchService();
    jest.clearAllMocks();
  });

  describe('searchTransactions', () => {
    const mockSearchParams = {
      cardId: 'card-123',
      userId: 'user-456',
      searchParams: {
        merchantName: 'Starbucks',
        minAmount: 500,
        maxAmount: 2000,
        merchantCategory: 'coffee'
      }
    };

    const mockCard = {
      id: 'card-123',
      card_context_hash: 'context-hash-123'
    };

    const mockSearchResults = [
      {
        transaction_id: 'tx-1',
        merchant_name: 'Starbucks Coffee',
        merchant_category: 'coffee',
        amount: 750,
        status: 'settled',
        processed_at: '2025-08-09T09:00:00Z',
        authorization_code: 'AUTH123456',
        retention_until: '2026-08-09T09:00:00Z'
      },
      {
        transaction_id: 'tx-2',
        merchant_name: 'Starbucks Reserve',
        merchant_category: 'coffee',
        amount: 1200,
        status: 'settled',
        processed_at: '2025-08-08T14:30:00Z',
        authorization_code: 'AUTH789012',
        retention_until: '2026-08-08T14:30:00Z'
      }
    ];

    it('should search transactions with privacy protection', async () => {
      // Mock disable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock card lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock search query with proper promise resolution
      const mockSearchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({
          data: mockSearchResults,
          error: null
        })),
        catch: jest.fn(),
        finally: jest.fn()
      };

      // Mock re-enable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.from.mockReturnValueOnce(mockSearchQuery as any);

      const result = await service.searchTransactions(mockSearchParams);

      // Verify privacy protection - query logging disabled
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting: 'log_statement',
        value: 'none'
      });

      // Verify card ownership check
      expect(mockSupabase.from).toHaveBeenCalledWith('cards');

      // Verify RLS context was set
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_app_context', {
        context_value: mockCard.card_context_hash
      });

      // Verify search query construction
      expect(mockSearchQuery.ilike).toHaveBeenCalledWith('merchant_name', '%Starbucks%');
      expect(mockSearchQuery.gte).toHaveBeenCalledWith('amount', 500);
      expect(mockSearchQuery.lte).toHaveBeenCalledWith('amount', 2000);
      expect(mockSearchQuery.eq).toHaveBeenCalledWith('merchant_category', 'coffee');
      expect(mockSearchQuery.limit).toHaveBeenCalledWith(50);

      // Verify result structure
      expect(result).toEqual({
        transactions: expect.arrayContaining([
          expect.objectContaining({
            transactionId: 'tx-1',
            merchantName: 'Starbucks Coffee',
            amount: 750,
            status: 'settled',
            privacyCountdown: expect.any(Number)
          })
        ]),
        searchCriteria: mockSearchParams.searchParams,
        resultCount: 2,
        analytics: expect.objectContaining({
          totalAmount: 1950,
          transactionCount: 2,
          averageAmount: 975,
          categoryDistribution: expect.any(Object)
        })
      });

      // Verify query logging was re-enabled
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting: 'log_statement',
        value: 'all'
      });
    });

    it('should return null for unauthorized card access', async () => {
      // Mock disable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock card lookup failure
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);

      const result = await service.searchTransactions(mockSearchParams);

      expect(result).toBeNull();
    });

    it('should handle merchant name search only', async () => {
      const searchParamsNameOnly = {
        ...mockSearchParams,
        searchParams: { merchantName: 'Amazon' }
      };

      // Mock disable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock card lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock search query
      const mockSearchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({
          data: [],
          error: null
        })),
        catch: jest.fn(),
        finally: jest.fn()
      };

      // Mock re-enable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.from.mockReturnValueOnce(mockSearchQuery as any);

      const result = await service.searchTransactions(searchParamsNameOnly);

      // Verify only merchant name search was applied
      expect(mockSearchQuery.ilike).toHaveBeenCalledWith('merchant_name', '%Amazon%');
      expect(mockSearchQuery.gte).not.toHaveBeenCalled();
      expect(mockSearchQuery.lte).not.toHaveBeenCalled();

      expect(result?.transactions).toEqual([]);
      expect(result?.searchCriteria).toEqual({ merchantName: 'Amazon' });
    });

    it('should handle amount range search only', async () => {
      const searchParamsAmountOnly = {
        ...mockSearchParams,
        searchParams: { 
          minAmount: 1000,
          maxAmount: 5000
        }
      };

      // Mock disable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock card lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock search query
      const mockSearchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({
          data: [],
          error: null
        })),
        catch: jest.fn(),
        finally: jest.fn()
      };

      // Mock re-enable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.from.mockReturnValueOnce(mockSearchQuery as any);

      await service.searchTransactions(searchParamsAmountOnly);

      // Verify amount range filters were applied
      expect(mockSearchQuery.gte).toHaveBeenCalledWith('amount', 1000);
      expect(mockSearchQuery.lte).toHaveBeenCalledWith('amount', 5000);
      expect(mockSearchQuery.ilike).not.toHaveBeenCalled();
    });

    it('should enforce 50 transaction limit for performance', async () => {
      // Mock disable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock card lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock search query
      const mockSearchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({
          data: mockSearchResults,
          error: null
        })),
        catch: jest.fn(),
        finally: jest.fn()
      };

      // Mock re-enable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.from.mockReturnValueOnce(mockSearchQuery as any);

      await service.searchTransactions({
        ...mockSearchParams,
        searchParams: { merchantName: 'Test' }
      });

      // Verify 50 transaction limit is enforced
      expect(mockSearchQuery.limit).toHaveBeenCalledWith(50);
    });

    it('should calculate search analytics correctly', async () => {
      // Mock disable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock card lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock search query with settled transactions
      const mockSearchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({
          data: mockSearchResults,
          error: null
        })),
        catch: jest.fn(),
        finally: jest.fn()
      };

      // Mock re-enable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.from.mockReturnValueOnce(mockSearchQuery as any);

      const result = await service.searchTransactions({
        ...mockSearchParams,
        searchParams: { merchantName: 'Starbucks' }
      });

      // Verify analytics calculation
      expect(result?.analytics).toEqual({
        totalAmount: 1950, // 750 + 1200
        transactionCount: 2,
        averageAmount: 975, // 1950 / 2
        categoryDistribution: {
          coffee: 2 // Both transactions are coffee category
        }
      });
    });

    it('should handle privacy countdown calculation', async () => {
      // Mock disable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock card lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Create transaction with specific retention date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 100);
      
      const transactionWithRetention = {
        ...mockSearchResults[0],
        retention_until: futureDate.toISOString()
      };

      const mockSearchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve({
          data: [transactionWithRetention],
          error: null
        })),
        catch: jest.fn(),
        finally: jest.fn()
      };

      // Mock re-enable query logging
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.from.mockReturnValueOnce(mockSearchQuery as any);

      const result = await service.searchTransactions({
        ...mockSearchParams,
        searchParams: { merchantName: 'Starbucks' }
      });

      // Verify privacy countdown is calculated correctly
      expect(result?.transactions[0].privacyCountdown).toBeGreaterThan(90);
      expect(result?.transactions[0].privacyCountdown).toBeLessThanOrEqual(101);
    });
  });
});