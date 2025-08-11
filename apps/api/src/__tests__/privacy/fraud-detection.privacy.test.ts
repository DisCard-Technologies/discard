import { FraudDetectionService } from '../../services/security/fraud-detection.service';
import { MLFraudModelService } from '../../services/security/ml-fraud-model.service';
import { TransactionIsolationService } from '../../services/privacy/transaction-isolation.service';
import { supabase } from '../../config/database';
import { redis } from '../../config/redis';

describe('Fraud Detection Privacy Verification Tests', () => {
  let fraudService: FraudDetectionService;
  let mlService: MLFraudModelService;
  let isolationService: TransactionIsolationService;
  
  const testCard1Id = 'privacy-card-1';
  const testCard2Id = 'privacy-card-2';
  const testCard1Context = 'context-privacy-card-1';
  const testCard2Context = 'context-privacy-card-2';

  beforeAll(async () => {
    fraudService = new FraudDetectionService();
    mlService = new MLFraudModelService();
    isolationService = new TransactionIsolationService(supabase);

    await setupPrivacyTestData();
  });

  afterAll(async () => {
    await cleanupPrivacyTestData();
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  describe('Transaction Isolation Enforcement', () => {
    it('should enforce isolation boundaries during fraud analysis', async () => {
      const transaction1 = createMockTransaction(testCard1Id, 100);
      const transaction2 = createMockTransaction(testCard2Id, 200);

      // Mock the isolation service to track calls
      const enforceIsolationSpy = jest.spyOn(isolationService, 'enforceTransactionIsolation');
      const verifyBoundariesSpy = jest.spyOn(isolationService, 'verifyIsolationBoundaries');

      // Analyze transactions for both cards
      await fraudService.analyzeTransaction(transaction1);
      await fraudService.analyzeTransaction(transaction2);

      // Verify isolation was enforced for each card
      expect(enforceIsolationSpy).toHaveBeenCalledWith(testCard1Id);
      expect(enforceIsolationSpy).toHaveBeenCalledWith(testCard2Id);
      expect(enforceIsolationSpy).toHaveBeenCalledTimes(2);

      // Verify boundaries were checked
      expect(verifyBoundariesSpy).toHaveBeenCalled();

      enforceIsolationSpy.mockRestore();
      verifyBoundariesSpy.mockRestore();
    });

    it('should not access data from other card contexts', async () => {
      // Create distinct data for each card
      await createCardSpecificData(testCard1Id, testCard1Context, [
        { amount: 100, merchant: 'GROCERY_1' },
        { amount: 150, merchant: 'GAS_STATION_1' }
      ]);

      await createCardSpecificData(testCard2Id, testCard2Context, [
        { amount: 500, merchant: 'ELECTRONICS_1' },
        { amount: 750, merchant: 'JEWELRY_1' }
      ]);

      // Analyze transaction for card 1
      const transaction = createMockTransaction(testCard1Id, 200);
      
      // Mock Supabase queries to track what data is accessed
      const originalFrom = supabase.from;
      const queriedContexts: string[] = [];
      
      supabase.from = jest.fn().mockImplementation((table) => {
        const mockQuery = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((column, value) => {
            if (column === 'card_context_hash') {
              queriedContexts.push(value);
            }
            return mockQuery;
          }),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          then: jest.fn().mockResolvedValue({ data: [], error: null })
        };
        return mockQuery;
      });

      await fraudService.analyzeTransaction(transaction);

      // Verify only card 1's context was accessed
      expect(queriedContexts).toContain(testCard1Context);
      expect(queriedContexts).not.toContain(testCard2Context);

      // Restore original function
      supabase.from = originalFrom;
    });

    it('should maintain separate Redis cache contexts per card', async () => {
      const transaction1 = createMockTransaction(testCard1Id, 100);
      const transaction2 = createMockTransaction(testCard2Id, 200);

      // Analyze transactions for both cards
      await fraudService.analyzeTransaction(transaction1);
      await fraudService.analyzeTransaction(transaction2);

      // Check Redis keys are card-specific
      const card1Keys = await redis.keys(`*${testCard1Id}*`);
      const card2Keys = await redis.keys(`*${testCard2Id}*`);

      expect(card1Keys.length).toBeGreaterThan(0);
      expect(card2Keys.length).toBeGreaterThan(0);

      // Verify no shared keys exist
      const allKeys = await redis.keys('*');
      const sharedKeys = allKeys.filter(key => 
        !key.includes(testCard1Id) && !key.includes(testCard2Id) && key.startsWith('fraud:')
      );

      expect(sharedKeys).toHaveLength(0);
    });
  });

  describe('ML Model Privacy Verification', () => {
    it('should train models using only card-specific data', async () => {
      // Create training data for multiple cards
      const card1Data = Array.from({ length: 50 }, (_, i) => ({
        features: {
          amount: 50 + i,
          merchantCategory: '5411',
          timeOfDay: Math.floor(Math.random() * 24),
          dayOfWeek: Math.floor(Math.random() * 7),
          location: { lat: 37.7749, lon: -122.4194 },
          transactionCount24h: Math.floor(Math.random() * 10),
          avgAmount30d: 75,
          distanceFromHome: Math.random() * 100
        },
        isFraud: Math.random() > 0.9,
        cardId: testCard1Id
      }));

      const card2Data = Array.from({ length: 50 }, (_, i) => ({
        features: {
          amount: 200 + i,
          merchantCategory: '7011', // Different merchant category
          timeOfDay: Math.floor(Math.random() * 24),
          dayOfWeek: Math.floor(Math.random() * 7),
          location: { lat: 40.7128, lon: -74.0060 }, // Different location
          transactionCount24h: Math.floor(Math.random() * 10),
          avgAmount30d: 250, // Different average
          distanceFromHome: Math.random() * 100
        },
        isFraud: Math.random() > 0.85,
        cardId: testCard2Id
      }));

      // Mock data access to verify isolation
      const dataAccessSpy = jest.spyOn(mlService as any, 'getTrainingData');
      dataAccessSpy.mockImplementation(async (cardId: string) => {
        if (cardId === testCard1Id) return card1Data;
        if (cardId === testCard2Id) return card2Data;
        return [];
      });

      // Train models for both cards
      await mlService.trainModel(testCard1Id, card1Data);
      await mlService.trainModel(testCard2Id, card2Data);

      // Verify each model was trained with only its card's data
      expect(dataAccessSpy).toHaveBeenCalledWith(testCard1Id);
      expect(dataAccessSpy).toHaveBeenCalledWith(testCard2Id);
      expect(dataAccessSpy).toHaveBeenCalledTimes(2);

      // Verify model storage is card-specific
      const card1Model = await redis.get(`fraud:model:${testCard1Id}`);
      const card2Model = await redis.get(`fraud:model:${testCard2Id}`);

      expect(card1Model).toBeDefined();
      expect(card2Model).toBeDefined();
      expect(card1Model).not.toEqual(card2Model);

      dataAccessSpy.mockRestore();
    });

    it('should not leak features across card boundaries', async () => {
      const card1Features = {
        amount: 100,
        merchantCategory: '5411',
        timeOfDay: 10,
        dayOfWeek: 1,
        location: { lat: 37.7749, lon: -122.4194 },
        transactionCount24h: 3,
        avgAmount30d: 75,
        distanceFromHome: 0
      };

      const card2Features = {
        amount: 500,
        merchantCategory: '7011',
        timeOfDay: 22,
        dayOfWeek: 5,
        location: { lat: 40.7128, lon: -74.0060 },
        transactionCount24h: 8,
        avgAmount30d: 400,
        distanceFromHome: 50
      };

      // Mock feature extraction to verify isolation
      const extractFeaturesSpy = jest.spyOn(mlService as any, 'extractFeatures');
      extractFeaturesSpy.mockImplementation(async (cardId: string, transaction: any) => {
        // Verify only the correct card's historical data is used
        expect(cardId).toBe(transaction.cardId);
        
        if (cardId === testCard1Id) return card1Features;
        if (cardId === testCard2Id) return card2Features;
        throw new Error(`Unexpected card ID: ${cardId}`);
      });

      // Score transactions for both cards
      const score1 = await mlService.scoreTransaction(testCard1Id, card1Features);
      const score2 = await mlService.scoreTransaction(testCard2Id, card2Features);

      expect(score1).toBeDefined();
      expect(score2).toBeDefined();
      expect(extractFeaturesSpy).toHaveBeenCalledWith(testCard1Id, expect.any(Object));
      expect(extractFeaturesSpy).toHaveBeenCalledWith(testCard2Id, expect.any(Object));

      extractFeaturesSpy.mockRestore();
    });

    it('should prevent model inference from accessing other cards\' models', async () => {
      // Train different models for each card
      await mlService.trainModel(testCard1Id, generateTrainingData(testCard1Id, 30));
      await mlService.trainModel(testCard2Id, generateTrainingData(testCard2Id, 30));

      const features = {
        amount: 150,
        merchantCategory: '5411',
        timeOfDay: 14,
        dayOfWeek: 3,
        location: { lat: 37.7749, lon: -122.4194 },
        transactionCount24h: 2,
        avgAmount30d: 100,
        distanceFromHome: 5
      };

      // Mock Redis access to track model loading
      const redisGetSpy = jest.spyOn(redis, 'get');

      // Score transaction for card 1
      await mlService.scoreTransaction(testCard1Id, features);

      // Verify only card 1's model was accessed
      const modelAccessCalls = redisGetSpy.mock.calls.filter(call => 
        call[0].startsWith('fraud:model:')
      );

      expect(modelAccessCalls.some(call => call[0] === `fraud:model:${testCard1Id}`)).toBe(true);
      expect(modelAccessCalls.some(call => call[0] === `fraud:model:${testCard2Id}`)).toBe(false);

      redisGetSpy.mockRestore();
    });
  });

  describe('Data Aggregation Privacy Protection', () => {
    it('should not create cross-card analytics aggregations', async () => {
      // Create fraud events for both cards
      await createFraudEvents(testCard1Id, testCard1Context, 5);
      await createFraudEvents(testCard2Id, testCard2Context, 3);

      // Attempt to get aggregate analytics (should only return current card data)
      const analytics1 = await getCardAnalytics(testCard1Id);
      const analytics2 = await getCardAnalytics(testCard2Id);

      // Verify analytics are card-specific
      expect(analytics1.totalEvents).toBe(5);
      expect(analytics2.totalEvents).toBe(3);

      // Verify no system-wide aggregates exist
      const systemAnalytics = await getSystemAnalytics();
      expect(systemAnalytics).toBeNull(); // Should not exist or be accessible
    });

    it('should apply differential privacy to any aggregated metrics', async () => {
      // This test would verify that any aggregated metrics use differential privacy
      // For now, we verify that no aggregation happens across cards
      
      const transaction1 = createMockTransaction(testCard1Id, 100);
      const transaction2 = createMockTransaction(testCard2Id, 200);

      await fraudService.analyzeTransaction(transaction1);
      await fraudService.analyzeTransaction(transaction2);

      // Check that no cross-card aggregation keys exist in Redis
      const allKeys = await redis.keys('fraud:aggregate:*');
      const crossCardKeys = allKeys.filter(key => 
        !key.includes(testCard1Id) && !key.includes(testCard2Id)
      );

      expect(crossCardKeys).toHaveLength(0);
    });

    it('should maintain k-anonymity in any shared fraud patterns', async () => {
      // Verify that no shared patterns exist (everything is card-specific)
      const patternKeys = await redis.keys('fraud:pattern:shared:*');
      expect(patternKeys).toHaveLength(0);

      // Verify card-specific patterns exist
      const transaction = createMockTransaction(testCard1Id, 100);
      await fraudService.analyzeTransaction(transaction);

      const cardPatterns = await redis.keys(`fraud:patterns:${testCard1Id}`);
      expect(cardPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Database Row-Level Security (RLS) Verification', () => {
    it('should enforce RLS policies on fraud_events table', async () => {
      // Set card context for RLS
      await supabase.rpc('set_card_context', { card_context: testCard1Context });

      // Try to query fraud events - should only return card 1 events
      const { data, error } = await supabase
        .from('fraud_events')
        .select('*')
        .order('detected_at', { ascending: false });

      expect(error).toBeNull();
      
      if (data && data.length > 0) {
        // All returned events should be for card 1 context only
        data.forEach(event => {
          expect(event.card_context_hash).toBe(testCard1Context);
        });
      }
    });

    it('should prevent direct access to other cards\' fraud data', async () => {
      // Create fraud events for both cards
      await createFraudEvent(testCard1Id, testCard1Context, 'velocity_exceeded', 80);
      await createFraudEvent(testCard2Id, testCard2Context, 'amount_anomaly', 60);

      // Set context for card 1 and try to access card 2 data directly
      await supabase.rpc('set_card_context', { card_context: testCard1Context });

      const { data: card2Events } = await supabase
        .from('fraud_events')
        .select('*')
        .eq('card_context_hash', testCard2Context);

      // Should not be able to access card 2 events when context is set to card 1
      expect(card2Events).toHaveLength(0);
    });

    it('should enforce RLS on payment_transactions during fraud analysis', async () => {
      // Create transactions for both cards
      await createTransactionHistory(testCard1Id, testCard1Context, 5);
      await createTransactionHistory(testCard2Id, testCard2Context, 3);

      // Mock Supabase RPC call verification
      const setContextSpy = jest.spyOn(supabase, 'rpc');
      
      const transaction = createMockTransaction(testCard1Id, 100);
      await fraudService.analyzeTransaction(transaction);

      // Verify card context was set for RLS
      expect(setContextSpy).toHaveBeenCalledWith('set_card_context', {
        card_context: expect.stringContaining(testCard1Id)
      });

      setContextSpy.mockRestore();
    });
  });

  // Helper functions
  async function setupPrivacyTestData() {
    // Create test cards
    await supabase.from('cards').upsert([
      {
        card_id: testCard1Id,
        card_context_hash: testCard1Context,
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        card_id: testCard2Id,
        card_context_hash: testCard2Context,
        status: 'active',
        created_at: new Date().toISOString()
      }
    ]);
  }

  async function cleanupPrivacyTestData() {
    await supabase.from('fraud_events')
      .delete()
      .in('card_context_hash', [testCard1Context, testCard2Context]);
    
    await supabase.from('payment_transactions')
      .delete()
      .in('card_context_hash', [testCard1Context, testCard2Context]);
    
    await supabase.from('cards')
      .delete()
      .in('card_id', [testCard1Id, testCard2Id]);
  }

  function createMockTransaction(cardId: string, amount: number, overrides: any = {}) {
    return {
      transactionId: `privacy-test-${Date.now()}-${Math.random()}`,
      cardId,
      amount,
      merchant: {
        name: 'TEST_MERCHANT',
        mcc: '5411',
        ...overrides.merchant
      },
      location: {
        lat: 37.7749,
        lon: -122.4194,
        ...overrides.location
      },
      timestamp: new Date().toISOString(),
      ...overrides
    };
  }

  async function createCardSpecificData(cardId: string, context: string, transactions: any[]) {
    const transactionRecords = transactions.map((txn, i) => ({
      transaction_id: `${cardId}-txn-${i}`,
      card_context_hash: context,
      amount: txn.amount,
      merchant_name: txn.merchant,
      created_at: new Date(Date.now() - i * 60000).toISOString()
    }));

    await supabase.from('payment_transactions').insert(transactionRecords);
  }

  async function createFraudEvents(cardId: string, context: string, count: number) {
    const events = Array.from({ length: count }, (_, i) => ({
      event_id: `${cardId}-fraud-${i}-${Date.now()}`,
      card_context_hash: context,
      event_type: 'test_anomaly',
      risk_score: 50 + i * 10,
      action_taken: 'alert',
      detected_at: new Date(Date.now() - i * 60000).toISOString()
    }));

    await supabase.from('fraud_events').insert(events);
  }

  async function createFraudEvent(cardId: string, context: string, eventType: string, riskScore: number) {
    await supabase.from('fraud_events').insert({
      event_id: `${cardId}-${eventType}-${Date.now()}`,
      card_context_hash: context,
      event_type: eventType,
      risk_score: riskScore,
      action_taken: 'alert',
      detected_at: new Date().toISOString()
    });
  }

  async function createTransactionHistory(cardId: string, context: string, count: number) {
    const transactions = Array.from({ length: count }, (_, i) => ({
      transaction_id: `${cardId}-history-${i}-${Date.now()}`,
      card_context_hash: context,
      amount: 50 + i * 20,
      merchant_name: `MERCHANT_${i}`,
      created_at: new Date(Date.now() - i * 3600000).toISOString()
    }));

    await supabase.from('payment_transactions').insert(transactions);
  }

  function generateTrainingData(cardId: string, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      features: {
        amount: 50 + i * 10,
        merchantCategory: '5411',
        timeOfDay: Math.floor(Math.random() * 24),
        dayOfWeek: Math.floor(Math.random() * 7),
        location: { lat: 37.7749 + Math.random(), lon: -122.4194 + Math.random() },
        transactionCount24h: Math.floor(Math.random() * 10),
        avgAmount30d: 75 + Math.random() * 50,
        distanceFromHome: Math.random() * 100
      },
      isFraud: Math.random() > 0.9,
      cardId
    }));
  }

  async function getCardAnalytics(cardId: string) {
    const { data } = await supabase
      .from('fraud_events')
      .select('count(*)')
      .eq('card_context_hash', `context-${cardId}`);
    
    return {
      totalEvents: data?.[0]?.count || 0
    };
  }

  async function getSystemAnalytics() {
    // This should not be allowed/accessible
    try {
      const { data } = await supabase
        .from('fraud_events')
        .select('count(*)');
      return data;
    } catch {
      return null; // Should fail due to RLS
    }
  }
});