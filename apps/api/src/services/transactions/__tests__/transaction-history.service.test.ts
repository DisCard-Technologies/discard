import { TransactionHistoryService } from '../transaction-history.service';
import { supabase } from '../../../utils/supabase';

// Mock dependencies
jest.mock('../../../utils/supabase');
jest.mock('../../../utils/logger');

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
      // Mock card lookup
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard })
            })
          })
        })
      } as any);

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock transaction query
      const mockQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                range: jest.fn().mockResolvedValue({
                  data: mockTransactions,
                  count: 2,
                  error: null
                })
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockQuery as any);

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
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null })
            })
          })
        })
      } as any);

      const result = await service.getCardTransactions(mockParams);

      expect(result).toBeNull();
    });

    it('should apply status filter correctly', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard })
            })
          })
        })
      } as any);

      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      const mockQueryChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockTransactions,
          count: 2,
          error: null
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockQueryChain as any);

      await service.getCardTransactions(mockParams);

      // Verify status filter was applied
      expect(mockQueryChain.eq).toHaveBeenCalledWith('status', 'settled');
    });

    it('should apply date range filters correctly', async () => {
      const paramsWithDateRange = {
        ...mockParams,
        filters: {
          startDate: '2025-08-01T00:00:00Z',
          endDate: '2025-08-31T23:59:59Z'
        }
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard })
            })
          })
        })
      } as any);

      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      const mockQueryChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockTransactions,
          count: 2,
          error: null
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockQueryChain as any);

      await service.getCardTransactions(paramsWithDateRange);

      // Verify date filters were applied
      expect(mockQueryChain.gte).toHaveBeenCalledWith('processed_at', '2025-08-01T00:00:00Z');
      expect(mockQueryChain.lte).toHaveBeenCalledWith('processed_at', '2025-08-31T23:59:59Z');
    });

    it('should handle pagination correctly', async () => {
      const paginationParams = {
        ...mockParams,
        pagination: { page: 2, limit: 10 }
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard })
            })
          })
        })
      } as any);

      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      const mockQueryChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockTransactions,
          count: 25,
          error: null
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockQueryChain as any);

      const result = await service.getCardTransactions(paginationParams);

      // Verify pagination range calculation (page 2, limit 10 = range 10-19)
      expect(mockQueryChain.range).toHaveBeenCalledWith(10, 19);
      
      // Verify hasMore calculation
      expect(result?.pagination.hasMore).toBe(true); // 25 total > 20 (10 + 10)
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
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockTransactionDetail })
          })
        })
      } as any);

      // Mock RLS context setting
      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock dispute lookup
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [] })
        })
      } as any);

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

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockUnauthorizedTransaction })
          })
        })
      } as any);

      const result = await service.getTransactionDetail('tx-1', 'user-456');

      expect(result).toBeNull();
    });

    it('should include dispute information when available', async () => {
      const mockDispute = {
        id: 'dispute-1',
        dispute_type: 'chargeback',
        amount: 2500,
        status: 'pending',
        reason: 'Unauthorized transaction'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockTransactionDetail })
          })
        })
      } as any);

      mockSupabase.rpc.mockResolvedValueOnce({ data: null });

      // Mock dispute lookup with result
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [mockDispute] })
        })
      } as any);

      const result = await service.getTransactionDetail('tx-1', 'user-456');

      expect(result?.refundInfo).toEqual(mockDispute);
    });
  });

  describe('privacy compliance', () => {
    it('should calculate privacy countdown correctly', async () => {
      const service = new TransactionHistoryService();
      
      // Use reflection to access private method for testing
      const calculatePrivacyCountdown = (service as any).calculatePrivacyCountdown;
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 100);
      
      const countdown = calculatePrivacyCountdown(futureDate.toISOString());
      
      expect(countdown).toBeGreaterThan(95);
      expect(countdown).toBeLessThanOrEqual(100);
    });

    it('should generate consistent transaction hashes', async () => {
      const service = new TransactionHistoryService();
      const generateTransactionHash = (service as any).generateTransactionHash;
      
      const transaction = {
        transaction_id: 'tx-1',
        merchant_name: 'Test Merchant',
        amount: 2500,
        processed_at: '2025-08-09T10:00:00Z'
      };
      
      const hash1 = generateTransactionHash(transaction);
      const hash2 = generateTransactionHash(transaction);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    it('should enforce card context isolation', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null })
            })
          })
        })
      } as any);

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
});