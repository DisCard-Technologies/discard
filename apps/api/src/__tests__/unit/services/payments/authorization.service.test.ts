import { AuthorizationService } from '../../../../services/payments/authorization.service';
import { FraudDetectionService } from '../../../../services/payments/fraud-detection.service';
import { CurrencyConversionService } from '../../../../services/payments/currency-conversion.service';
import { AuthorizationHoldsService } from '../../../../services/payments/authorization-holds.service';
import { RestrictionsService } from '../../../../services/payments/restrictions.service';

// Mock all dependencies
jest.mock('../../../../services/payments/fraud-detection.service');
jest.mock('../../../../services/payments/currency-conversion.service');
jest.mock('../../../../services/payments/authorization-holds.service');
jest.mock('../../../../services/payments/restrictions.service');
jest.mock('@supabase/supabase-js');

describe('AuthorizationService', () => {
  let authorizationService: AuthorizationService;
  let mockFraudDetectionService: jest.Mocked<FraudDetectionService>;
  let mockCurrencyConversionService: jest.Mocked<CurrencyConversionService>;
  let mockAuthorizationHoldsService: jest.Mocked<AuthorizationHoldsService>;
  let mockRestrictionsService: jest.Mocked<RestrictionsService>;
  let mockSupabase: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      raw: jest.fn((query) => ({ toSQL: () => query }))
    };

    // Mock the createClient function
    const mockCreateClient = require('@supabase/supabase-js').createClient as jest.Mock;
    mockCreateClient.mockReturnValue(mockSupabase);

    // Create service instance
    authorizationService = new AuthorizationService();
    
    // Get mocked service instances
    mockFraudDetectionService = authorizationService['fraudDetectionService'] as jest.Mocked<FraudDetectionService>;
    mockCurrencyConversionService = authorizationService['currencyConversionService'] as jest.Mocked<CurrencyConversionService>;
    mockAuthorizationHoldsService = authorizationService['authorizationHoldsService'] as jest.Mocked<AuthorizationHoldsService>;
    mockRestrictionsService = authorizationService['restrictionsService'] as jest.Mocked<RestrictionsService>;
  });

  describe('processAuthorization', () => {
    const validRequest = {
      cardContext: 'card_123',
      marqetaTransactionToken: 'txn_456',
      merchantName: 'Test Merchant',
      merchantCategoryCode: '5411',
      amount: 10000, // $100.00 in cents
      currencyCode: 'USD',
      merchantLocation: {
        country: 'US',
        city: 'San Francisco'
      }
    };

    beforeEach(() => {
      // Mock successful responses for all dependencies
      mockRestrictionsService.validateTransaction.mockResolvedValue({
        allowed: true,
        reason: null
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'cards') {
          return {
            ...mockSupabase,
            single: jest.fn().mockResolvedValue({
              data: {
                status: 'active',
                current_balance: 50000, // $500.00
                spending_limit: 100000, // $1000.00
                overdraft_limit: 5000 // $50.00
              }
            })
          };
        }
        return mockSupabase;
      });

      mockFraudDetectionService.analyzeTransaction.mockResolvedValue({
        riskScore: 15,
        riskLevel: 'low',
        action: 'approve',
        riskFactors: {
          velocityScore: 0,
          amountScore: 5,
          locationScore: 0,
          timeScore: 0,
          merchantScore: 10
        },
        recommendation: 'Low risk transaction'
      });

      mockAuthorizationHoldsService.createHold.mockResolvedValue({
        holdId: 'hold_789',
        cardContext: 'card_123',
        authorizationId: expect.any(String),
        marqetaTransactionToken: 'txn_456',
        merchantName: 'Test Merchant',
        merchantCategoryCode: '5411',
        authorizationAmount: 10000,
        holdAmount: 10000,
        currencyCode: 'USD',
        authorizationCode: expect.any(String),
        status: 'active',
        riskScore: 15,
        responseTimeMs: expect.any(Number),
        createdAt: expect.any(Date),
        expiresAt: expect.any(Date)
      });

      // Mock successful database operations
      mockSupabase.insert.mockReturnValue({
        ...mockSupabase,
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { authorization_id: 'auth_123' }
        })
      });

      mockSupabase.update.mockResolvedValue({ error: null });
    });

    it('should process successful authorization with USD currency', async () => {
      const result = await authorizationService.processAuthorization(validRequest);

      expect(result).toMatchObject({
        authorizationId: expect.any(String),
        status: 'approved',
        authorizationCode: expect.any(String),
        holdId: 'hold_789',
        responseTimeMs: expect.any(Number),
        riskScore: 15
      });

      expect(result.responseTimeMs).toBeLessThan(800); // Sub-second response requirement
    });

    it('should handle multi-currency conversion', async () => {
      const eurRequest = { ...validRequest, currencyCode: 'EUR' };
      
      mockCurrencyConversionService.convertCurrency.mockResolvedValue({
        originalAmount: 10000,
        originalCurrency: 'EUR',
        convertedAmount: 11000,
        targetCurrency: 'USD',
        exchangeRate: 1.1,
        conversionFee: 275, // 2.5% fee
        totalCost: 11275,
        rateSource: 'exchangerate-api.com',
        rateTimestamp: new Date()
      });

      const result = await authorizationService.processAuthorization(eurRequest);

      expect(mockCurrencyConversionService.convertCurrency).toHaveBeenCalledWith(
        10000, 'EUR', 'USD'
      );
      
      expect(result.currencyConversion).toMatchObject({
        originalAmount: 10000,
        originalCurrency: 'EUR',
        convertedAmount: 11000,
        exchangeRate: 1.1,
        conversionFee: 275
      });
    });

    it('should decline due to merchant restrictions', async () => {
      mockRestrictionsService.validateTransaction.mockResolvedValue({
        allowed: false,
        reason: 'Merchant category blocked'
      });

      const result = await authorizationService.processAuthorization(validRequest);

      expect(result).toMatchObject({
        status: 'declined',
        declineCode: 'RESTRICTION_VIOLATION',
        declineReason: 'Merchant category blocked',
        riskScore: 0
      });
    });

    it('should decline due to insufficient funds', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'cards') {
          return {
            ...mockSupabase,
            single: jest.fn().mockResolvedValue({
              data: {
                status: 'active',
                current_balance: 5000, // $50.00 - insufficient
                spending_limit: 100000,
                overdraft_limit: 0
              }
            })
          };
        }
        return mockSupabase;
      });

      const result = await authorizationService.processAuthorization(validRequest);

      expect(result).toMatchObject({
        status: 'declined',
        declineCode: 'INSUFFICIENT_FUNDS',
        declineReason: 'Insufficient balance for transaction'
      });
    });

    it('should decline due to high fraud risk', async () => {
      mockFraudDetectionService.analyzeTransaction.mockResolvedValue({
        riskScore: 85,
        riskLevel: 'high',
        action: 'decline',
        riskFactors: {
          velocityScore: 30,
          amountScore: 25,
          locationScore: 15,
          timeScore: 10,
          merchantScore: 5
        },
        recommendation: 'Decline - High risk transaction'
      });

      const result = await authorizationService.processAuthorization(validRequest);

      expect(result).toMatchObject({
        status: 'declined',
        declineCode: 'FRAUD_SUSPECTED',
        declineReason: 'Transaction flagged for suspected fraud',
        riskScore: 85
      });
    });

    it('should handle overdraft protection', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'cards') {
          return {
            ...mockSupabase,
            single: jest.fn().mockResolvedValue({
              data: {
                status: 'active',
                current_balance: 8000, // $80.00
                spending_limit: 100000,
                overdraft_limit: 5000 // $50.00 overdraft
              }
            })
          };
        }
        return mockSupabase;
      });

      const result = await authorizationService.processAuthorization(validRequest);

      expect(result.status).toBe('approved');
      // Should approve because balance (80) + overdraft (50) = 130 > 100 (requested)
    });

    it('should respect sub-second response time requirement', async () => {
      const startTime = Date.now();
      await authorizationService.processAuthorization(validRequest);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(800);
    });

    it('should validate request format', async () => {
      const invalidRequest = {
        ...validRequest,
        amount: 0 // Invalid amount
      };

      await expect(authorizationService.processAuthorization(invalidRequest))
        .rejects.toThrow('Valid transaction amount is required');
    });

    it('should handle processing errors gracefully', async () => {
      mockSupabase.insert.mockRejectedValue(new Error('Database error'));

      const result = await authorizationService.processAuthorization(validRequest);

      expect(result).toMatchObject({
        status: 'declined',
        declineCode: 'PROCESSING_ERROR',
        declineReason: 'Authorization processing failed'
      });
    });
  });

  describe('retryAuthorization', () => {
    const originalRequest = {
      cardContext: 'card_123',
      marqetaTransactionToken: 'txn_456',
      merchantName: 'Test Merchant',
      merchantCategoryCode: '5411',
      amount: 10000,
      currencyCode: 'USD'
    };

    beforeEach(() => {
      // Mock getting previous authorization
      mockSupabase.single.mockResolvedValue({
        data: { retry_count: 1 }
      });
    });

    it('should retry authorization with incremented count', async () => {
      // Mock successful retry
      jest.spyOn(authorizationService, 'processAuthorization').mockResolvedValue({
        authorizationId: 'auth_retry_123',
        status: 'approved',
        authorizationCode: 'CODE123',
        holdId: 'hold_retry_789',
        responseTimeMs: 150,
        riskScore: 10
      });

      const result = await authorizationService.retryAuthorization(originalRequest, 'auth_prev_123');

      expect(result.status).toBe('approved');
      expect(authorizationService.processAuthorization).toHaveBeenCalledWith(originalRequest, 2);
    });

    it('should reject retry when max attempts exceeded', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { retry_count: 3 } // Already at max
      });

      const result = await authorizationService.retryAuthorization(originalRequest, 'auth_prev_123');

      expect(result).toMatchObject({
        declineCode: 'MAX_RETRIES_EXCEEDED',
        declineReason: 'Maximum retry attempts exceeded'
      });
    });
  });

  describe('getAuthorizationStatus', () => {
    it('should return authorization status', async () => {
      const mockAuthData = {
        authorization_id: 'auth_123',
        card_context: 'card_123',
        status: 'approved',
        authorization_amount: 10000,
        currency_code: 'USD',
        risk_score: 15,
        response_time_ms: 250,
        processed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24*60*60*1000).toISOString()
      };

      mockSupabase.single.mockResolvedValue({ data: mockAuthData });

      const result = await authorizationService.getAuthorizationStatus('auth_123');

      expect(result).toMatchObject({
        authorizationId: 'auth_123',
        cardContext: 'card_123',
        status: 'approved',
        authorizationAmount: 10000,
        currencyCode: 'USD',
        riskScore: 15,
        responseTimeMs: 250
      });
    });

    it('should return null for non-existent authorization', async () => {
      mockSupabase.single.mockResolvedValue({ data: null });

      const result = await authorizationService.getAuthorizationStatus('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('Performance Tests', () => {
    const performanceRequest = {
      cardContext: 'card_perf_test',
      marqetaTransactionToken: 'txn_perf_456',
      merchantName: 'Performance Test Merchant',
      merchantCategoryCode: '5411',
      amount: 10000,
      currencyCode: 'USD'
    };

    beforeEach(() => {
      // Setup mocks for performance tests
      mockRestrictionsService.validateTransaction.mockResolvedValue({
        allowed: true,
        reason: null
      });

      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        single: jest.fn().mockResolvedValue({
          data: {
            status: 'active',
            current_balance: 50000,
            spending_limit: 100000
          }
        })
      });

      mockFraudDetectionService.analyzeTransaction.mockResolvedValue({
        riskScore: 10,
        riskLevel: 'low',
        action: 'approve',
        riskFactors: {
          velocityScore: 0,
          amountScore: 0,
          locationScore: 0,
          timeScore: 0,
          merchantScore: 10
        },
        recommendation: 'Low risk'
      });

      mockAuthorizationHoldsService.createHold.mockResolvedValue({
        holdId: 'hold_perf_789',
        cardContext: 'card_perf_test',
        authorizationId: 'auth_perf_123',
        marqetaTransactionToken: 'txn_perf_456',
        merchantName: 'Performance Test Merchant',
        merchantCategoryCode: '5411',
        authorizationAmount: 10000,
        holdAmount: 10000,
        currencyCode: 'USD',
        authorizationCode: 'PERF123',
        status: 'active',
        riskScore: 10,
        responseTimeMs: 100,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24*60*60*1000)
      });

      mockSupabase.insert.mockReturnValue({
        ...mockSupabase,
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { authorization_id: 'auth_perf_123' }
        })
      });
    });

    it('should meet sub-second authorization processing requirement', async () => {
      const iterations = 10;
      const results = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = await authorizationService.processAuthorization({
          ...performanceRequest,
          marqetaTransactionToken: `txn_perf_${i}`
        });
        const endTime = Date.now();

        results.push({
          responseTime: endTime - startTime,
          reported: result.responseTimeMs
        });
      }

      // All responses should be under 800ms
      results.forEach(result => {
        expect(result.responseTime).toBeLessThan(800);
      });

      // Average response time should be well under the limit
      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      expect(avgResponseTime).toBeLessThan(400);
    });

    it('should handle concurrent authorizations efficiently', async () => {
      const concurrentRequests = 50;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          authorizationService.processAuthorization({
            ...performanceRequest,
            marqetaTransactionToken: `txn_concurrent_${i}`
          })
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All should complete successfully
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result.status).toBe('approved');
      });

      // Total time for concurrent processing should be reasonable
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds for 50 concurrent requests
    });
  });
});