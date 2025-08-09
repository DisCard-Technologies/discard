// Mock environment variables first
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

import { TransactionHistoryService } from '../../../../services/transactions/transaction-history.service';
import { supabase } from '../../../../utils/supabase';

// Mock dependencies
jest.mock('../../../../utils/supabase');
jest.mock('../../../../utils/logger');

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('TransactionHistoryService', () => {
  let service: TransactionHistoryService;

  beforeEach(() => {
    service = new TransactionHistoryService();
    jest.clearAllMocks();
  });

  describe('getCardTransactions', () => {
    const mockParams = {
      cardId: 'card-123',
      userId: 'user-456',
      pagination: { page: 1, limit: 20 },
      filters: { status: 'settled' }
    };

    const mockCard = {
      id: 'card-123',
      card_context_hash: 'context-hash-123'
    };

    const mockTransactions = [
      {
        transaction_id: 'tx-1',
        merchant_name: 'Test Merchant',
        merchant_category: 'grocery',
        amount: 2500,
        status: 'settled',
        processed_at: '2025-08-09T10:00:00Z',
        authorization_code: 'AUTH123456',
        retention_until: '2026-08-09T10:00:00Z'
      },
      {
        transaction_id: 'tx-2',
        merchant_name: 'Another Store',
        merchant_category: 'retail',
        amount: 1000,
        status: 'settled',
        processed_at: '2025-08-08T15:30:00Z',
        authorization_code: 'AUTH789012',
        retention_until: '2026-08-08T15:30:00Z'
      }
    ];

    it('should return paginated transactions with analytics for valid card', async () => {
      // Create proper mock chain for card lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      // Create proper mock chain for transaction query 
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockTransactions,
          count: 2,
          error: null
        })
      };

      // Setup mocks in sequence
      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });
      mockSupabase.from.mockReturnValueOnce(mockTransactionQuery as any);

      const result = await service.getCardTransactions(mockParams);

      // Verify card ownership check
      expect(mockSupabase.from).toHaveBeenCalledWith('cards');
      
      // Verify RLS context was set
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_app_context', {
        context_value: mockCard.card_context_hash
      });

      // Verify transaction query
      expect(mockSupabase.from).toHaveBeenCalledWith('payment_transactions');

      // Verify result structure
      expect(result).toEqual({
        transactions: expect.arrayContaining([
          expect.objectContaining({
            transactionId: 'tx-1',
            merchantName: 'Test Merchant',
            amount: 2500,
            status: 'settled',
            privacyCountdown: expect.any(Number)
          })
        ]),
        pagination: {
          total: 2,
          page: 1,
          limit: 20,
          hasMore: false
        },
        analytics: expect.objectContaining({
          totalSpent: 3500,
          transactionCount: 2,
          averageTransaction: 1750,
          categoryBreakdown: expect.any(Object)
        })
      });
    });

    it('should return null for invalid card ownership', async () => {
      // Mock card lookup failure
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);

      const result = await service.getCardTransactions(mockParams);

      expect(result).toBeNull();
    });

    it('should apply status filter correctly', async () => {
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCard })
      };

      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockTransactions,
          count: 2,
          error: null
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });
      mockSupabase.from.mockReturnValueOnce(mockTransactionQuery as any);

      await service.getCardTransactions(mockParams);

      // Verify status filter was applied
      expect(mockTransactionQuery.eq).toHaveBeenCalledWith('status', 'settled');
    });

    it('should enforce card context isolation', async () => {
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);

      const result = await service.getCardTransactions({
        cardId: 'unauthorized-card',
        userId: 'user-456',
        pagination: { page: 1, limit: 20 },
        filters: {}
      });

      // Should return null for unauthorized card access
      expect(result).toBeNull();
      
      // Should not attempt to set RLS context or query transactions
      expect(mockSupabase.rpc).not.toHaveBeenCalledWith('set_app_context', expect.anything());
    });
  });

  describe('getTransactionDetail', () => {
    const mockTransactionDetail = {
      transaction_id: 'tx-1',
      merchant_name: 'Test Merchant',
      merchant_category: 'grocery',
      amount: 2500,
      status: 'settled',
      processed_at: '2025-08-09T10:00:00Z',
      authorization_code: 'AUTH123456',
      card_context_hash: 'context-hash-123',
      retention_until: '2026-08-09T10:00:00Z',
      cards: {
        id: 'card-123',
        user_id: 'user-456',
        card_number: '1234567890123456'
      }
    };

    it('should return transaction detail with privacy enhancements', async () => {
      // Mock transaction lookup
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockTransactionDetail })
      };

      const mockDisputeQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [] })
      };

      mockSupabase.from.mockReturnValueOnce(mockTransactionQuery as any);
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });
      mockSupabase.from.mockReturnValueOnce(mockDisputeQuery as any);

      const result = await service.getTransactionDetail('tx-1', 'user-456');

      expect(result).toEqual(expect.objectContaining({
        transactionId: 'tx-1',
        merchantName: 'Test Merchant',
        amount: 2500,
        status: 'settled',
        encryptionStatus: true,
        maskedCardNumber: '****3456',
        maskedAuthCode: 'AUTH12******',
        transactionHash: expect.any(String),
        privacyCountdown: expect.any(Number)
      }));
    });

    it('should return null for unauthorized access', async () => {
      const mockUnauthorizedTransaction = {
        ...mockTransactionDetail,
        cards: {
          id: 'card-123',
          user_id: 'different-user',
          card_number: '1234567890123456'
        }
      };

      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockUnauthorizedTransaction })
      };

      mockSupabase.from.mockReturnValueOnce(mockTransactionQuery as any);

      const result = await service.getTransactionDetail('tx-1', 'user-456');

      expect(result).toBeNull();
    });
  });
});