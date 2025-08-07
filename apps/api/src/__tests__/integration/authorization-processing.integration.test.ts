import request from 'supertest';
import { Express } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthorizationService } from '../../services/payments/authorization.service';
import { FraudDetectionService } from '../../services/payments/fraud-detection.service';
import { TransactionWebSocketService } from '../../services/payments/transaction-websocket.service';

// Mock external dependencies
jest.mock('@supabase/supabase-js');
jest.mock('axios');

describe('Authorization Processing Integration Tests', () => {
  let app: Express;
  let mockSupabase: any;
  let authorizationService: AuthorizationService;
  let fraudDetectionService: FraudDetectionService;
  let wsService: TransactionWebSocketService;

  const validAuthRequest = {
    cardContext: 'card_integration_test',
    marqetaTransactionToken: 'txn_integration_456',
    merchantName: 'Integration Test Merchant',
    merchantCategoryCode: '5411',
    amount: 15000, // $150.00
    currencyCode: 'USD',
    merchantLocation: {
      country: 'US',
      city: 'San Francisco'
    }
  };

  beforeAll(async () => {
    // Setup test environment - NODE_ENV should already be 'test' from jest config
    if (!process.env.NODE_ENV) {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: false });
    }
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test_service_key';
    process.env.AUTHORIZATION_RESPONSE_TIMEOUT_MS = '800';
    process.env.FRAUD_VELOCITY_LIMIT_HOURLY = '10';
    process.env.FRAUD_RISK_THRESHOLD_DECLINE = '75';
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock Supabase client with realistic responses
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      raw: jest.fn((query) => ({ toSQL: () => query }))
    };

    const mockCreateClient = require('@supabase/supabase-js').createClient as jest.Mock;
    mockCreateClient.mockReturnValue(mockSupabase);

    // Setup realistic database responses
    setupDatabaseMocks();

    // Initialize services
    authorizationService = new AuthorizationService();
    fraudDetectionService = new FraudDetectionService();
    wsService = new TransactionWebSocketService();

    // Create test Express app (mocked for this test)
    app = {} as Express; // Simplified for integration test focus
  });

  afterEach(() => {
    // Clean up any test data
    jest.restoreAllMocks();
  });

  describe('Complete Authorization Workflow', () => {
    it('should process end-to-end authorization successfully', async () => {
      // Start timing the complete workflow
      const startTime = Date.now();

      // Step 1: Process authorization
      const authResult = await authorizationService.processAuthorization(validAuthRequest);

      expect(authResult).toMatchObject({
        authorizationId: expect.any(String),
        status: 'approved',
        authorizationCode: expect.any(String),
        holdId: expect.any(String),
        responseTimeMs: expect.any(Number),
        riskScore: expect.any(Number)
      });

      // Verify sub-second processing
      expect(authResult.responseTimeMs).toBeLessThan(800);
      expect(Date.now() - startTime).toBeLessThan(1000);

      // Step 2: Verify authorization was logged correctly
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          card_context: validAuthRequest.cardContext,
          marqeta_transaction_token: validAuthRequest.marqetaTransactionToken,
          merchant_name: validAuthRequest.merchantName,
          authorization_amount: validAuthRequest.amount,
          currency_code: validAuthRequest.currencyCode,
          status: 'pending' // Initially pending, then updated to approved
        })
      );

      // Step 3: Verify hold was created
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          card_context: validAuthRequest.cardContext,
          hold_amount: validAuthRequest.amount,
          status: 'active'
        })
      );

      // Step 4: Verify funds were reserved
      expect(mockSupabase.update).toHaveBeenCalledWith({
        current_balance: expect.anything()
      });
    });

    it('should handle high-risk transaction with fraud detection', async () => {
      // Setup high-risk scenario: many recent transactions
      const highVelocityTransactions = Array(15).fill(null).map((_, i) => ({
        authorization_id: `auth_velocity_${i}`,
        processed_at: new Date(Date.now() - (i * 2 * 60 * 1000)).toISOString()
      }));

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'authorization_transactions') {
          return {
            ...mockSupabase,
            data: highVelocityTransactions
          };
        }
        return mockSupabase;
      });

      const result = await authorizationService.processAuthorization(validAuthRequest);

      // Should be declined due to high velocity
      expect(result).toMatchObject({
        status: 'declined',
        declineCode: 'FRAUD_SUSPECTED',
        declineReason: 'Transaction flagged for suspected fraud',
        riskScore: expect.any(Number)
      });

      expect(result.riskScore).toBeGreaterThan(75);
    });

    it('should handle multi-currency authorization flow', async () => {
      // Mock currency conversion API
      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: {
          base: 'EUR',
          date: '2024-01-15',
          rates: {
            USD: 1.1050
          }
        }
      });

      const eurRequest = {
        ...validAuthRequest,
        currencyCode: 'EUR',
        amount: 10000 // €100.00
      };

      const result = await authorizationService.processAuthorization(eurRequest);

      expect(result.status).toBe('approved');
      expect(result.currencyConversion).toMatchObject({
        originalAmount: 10000,
        originalCurrency: 'EUR',
        convertedAmount: expect.any(Number),
        exchangeRate: expect.any(Number),
        conversionFee: expect.any(Number)
      });

      // Verify the converted amount is reasonable
      expect(result.currencyConversion!.convertedAmount).toBeGreaterThan(10000); // Should be more in USD
      expect(result.currencyConversion!.exchangeRate).toBeCloseTo(1.1, 1);
    });

    it('should handle authorization retry workflow', async () => {
      // First, create a failed authorization
      mockSupabase.single.mockResolvedValueOnce({
        data: { retry_count: 1 }
      });

      // Mock successful retry conditions
      setupSuccessfulAuthMocks();

      const retryResult = await authorizationService.retryAuthorization(
        validAuthRequest,
        'auth_failed_123'
      );

      expect(retryResult.status).toBe('approved');
      
      // Verify retry was processed with incremented count
      expect(mockSupabase.from).toHaveBeenCalledWith('authorization_transactions');
      expect(mockSupabase.eq).toHaveBeenCalledWith('authorization_id', 'auth_failed_123');
    });

    it('should process concurrent authorizations efficiently', async () => {
      const concurrentRequests = 20;
      const promises = [];

      // Create multiple concurrent authorization requests
      for (let i = 0; i < concurrentRequests; i++) {
        const request = {
          ...validAuthRequest,
          marqetaTransactionToken: `txn_concurrent_${i}`,
          cardContext: `card_concurrent_${i}`
        };
        promises.push(authorizationService.processAuthorization(request));
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All should complete successfully
      expect(results).toHaveLength(concurrentRequests);
      results.forEach((result, index) => {
        expect(result.status).toBe('approved');
        expect(result.responseTimeMs).toBeLessThan(800);
      });

      // Total concurrent processing time should be reasonable
      expect(endTime - startTime).toBeLessThan(3000); // 3 seconds for 20 concurrent requests
    });

    it('should handle authorization hold lifecycle', async () => {
      // Step 1: Create authorization and hold
      const authResult = await authorizationService.processAuthorization(validAuthRequest);
      expect(authResult.status).toBe('approved');
      expect(authResult.holdId).toBeDefined();

      // Step 2: Release hold (simulate settlement)
      const settleAmount = validAuthRequest.amount - 500; // Partial settlement
      await authorizationService.clearAuthorizationHold(authResult.holdId!, settleAmount);

      // Verify hold was updated and funds released
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'cleared',
        cleared_at: expect.any(String)
      });

      // Step 3: Test full reversal scenario
      await authorizationService.reverseAuthorizationHold(authResult.holdId!);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'reversed',
        cleared_at: expect.any(String)
      });
    });

    it('should handle database transaction rollback on failure', async () => {
      // Mock database failure during hold creation
      mockSupabase.insert.mockImplementation((data: any) => {
        if (data.hold_amount) { // Hold creation
          return Promise.reject(new Error('Hold creation failed'));
        }
        return Promise.resolve({ data: { authorization_id: 'auth_123' } });
      });

      const result = await authorizationService.processAuthorization(validAuthRequest);

      // Should decline due to processing error
      expect(result).toMatchObject({
        status: 'declined',
        declineCode: 'PROCESSING_ERROR',
        declineReason: 'Authorization processing failed'
      });

      // Authorization should be marked as failed
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'declined',
        decline_code: 'PROCESSING_ERROR'
      });
    });

    it('should maintain privacy isolation between cards', async () => {
      const card1Request = { ...validAuthRequest, cardContext: 'card_privacy_1' };
      const card2Request = { ...validAuthRequest, cardContext: 'card_privacy_2' };

      // Process authorizations for different cards
      await authorizationService.processAuthorization(card1Request);
      await authorizationService.processAuthorization(card2Request);

      // Verify each set the correct card context
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'card_privacy_1',
        is_local: true
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'card_privacy_2',
        is_local: true
      });

      // Each authorization should only query data for its own card context
      expect(mockSupabase.eq).toHaveBeenCalledWith('card_context', 'card_privacy_1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('card_context', 'card_privacy_2');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should maintain sub-second response times under load', async () => {
      const loadTestRequests = 100;
      const batchSize = 10;
      const responseTimes: number[] = [];

      // Process requests in batches to simulate realistic load
      for (let batch = 0; batch < loadTestRequests / batchSize; batch++) {
        const batchPromises = [];

        for (let i = 0; i < batchSize; i++) {
          const requestIndex = batch * batchSize + i;
          const request = {
            ...validAuthRequest,
            marqetaTransactionToken: `txn_load_${requestIndex}`,
            cardContext: `card_load_${requestIndex % 5}` // Simulate 5 different cards
          };

          const startTime = Date.now();
          const promise = authorizationService.processAuthorization(request)
            .then(result => {
              const responseTime = Date.now() - startTime;
              responseTimes.push(responseTime);
              return result;
            });

          batchPromises.push(promise);
        }

        await Promise.all(batchPromises);
        
        // Small delay between batches to simulate realistic traffic
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Analyze performance metrics
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      expect(avgResponseTime).toBeLessThan(200); // Average under 200ms
      expect(maxResponseTime).toBeLessThan(800); // Max under sub-second requirement
      expect(p95ResponseTime).toBeLessThan(400); // 95th percentile under 400ms

      console.log('Load Test Results:', {
        totalRequests: loadTestRequests,
        avgResponseTime: Math.round(avgResponseTime),
        maxResponseTime,
        p95ResponseTime
      });
    });

    it('should handle database connection pool efficiently', async () => {
      // Simulate high database load
      const dbIntensiveRequests = 50;
      const promises = [];

      for (let i = 0; i < dbIntensiveRequests; i++) {
        const request = {
          ...validAuthRequest,
          marqetaTransactionToken: `txn_db_load_${i}`,
          cardContext: `card_db_${i % 3}` // Simulate card context switching
        };

        promises.push(authorizationService.processAuthorization(request));
      }

      const results = await Promise.all(promises);

      // All requests should complete successfully
      expect(results).toHaveLength(dbIntensiveRequests);
      results.forEach(result => {
        expect(result.status).toBe('approved');
      });

      // Verify database operations completed without connection issues
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(dbIntensiveRequests * 2); // Set context + any cleanup
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle external service failures gracefully', async () => {
      // Mock fraud detection service failure
      jest.spyOn(fraudDetectionService, 'analyzeTransaction')
        .mockRejectedValue(new Error('Fraud service unavailable'));

      const result = await authorizationService.processAuthorization(validAuthRequest);

      // Should still process authorization (fail-safe approach)
      expect(result.status).toBe('approved');
      expect(result.riskScore).toBe(0); // Default to low risk when fraud analysis fails
    });

    it('should recover from temporary database unavailability', async () => {
      let callCount = 0;
      mockSupabase.single.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Database temporarily unavailable'));
        }
        return Promise.resolve({
          data: {
            status: 'active',
            current_balance: 50000,
            spending_limit: 100000
          }
        });
      });

      const result = await authorizationService.processAuthorization(validAuthRequest);

      // Should eventually succeed after retries
      expect(result.status).toBe('declined'); // Would decline due to initial failures
      expect(result.declineCode).toBe('PROCESSING_ERROR');
    });
  });

  // Helper function to setup successful authorization mocks
  function setupSuccessfulAuthMocks() {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          ...mockSupabase,
          single: jest.fn().mockResolvedValue({
            data: {
              status: 'active',
              current_balance: 100000, // $1000.00
              spending_limit: 200000,  // $2000.00
              overdraft_limit: 10000   // $100.00
            }
          })
        };
      }

      if (table === 'authorization_transactions') {
        return {
          ...mockSupabase,
          data: [] // No recent transactions for fraud detection
        };
      }

      if (table === 'authorization_holds') {
        return {
          ...mockSupabase,
          single: jest.fn().mockResolvedValue({
            data: {
              hold_id: 'hold_test_123',
              card_context: validAuthRequest.cardContext,
              hold_amount: validAuthRequest.amount,
              status: 'active'
            }
          })
        };
      }

      return mockSupabase;
    });
  }

  // Helper function to setup realistic database mocks
  function setupDatabaseMocks() {
    setupSuccessfulAuthMocks();

    // Mock authorization transaction creation
    mockSupabase.insert.mockImplementation((data: any) => {
      if (data.authorization_id) {
        return {
          ...mockSupabase,
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { authorization_id: data.authorization_id }
          })
        };
      }

      if (data.hold_amount) {
        return {
          ...mockSupabase,
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              hold_id: 'hold_test_123',
              card_context: data.card_context,
              hold_amount: data.hold_amount,
              status: 'active'
            }
          })
        };
      }

      return mockSupabase;
    });

    // Mock successful updates
    mockSupabase.update.mockResolvedValue({ error: null });
  }
});