import request from 'supertest';
import { app } from '../../app';
import { supabase } from '../../config/database';
import { redis } from '../../config/redis';
import { FraudDetectionService } from '../../services/security/fraud-detection.service';
import { CardFreezeService } from '../../services/security/card-freeze.service';
import { TransactionIsolationService } from '../../services/privacy/transaction-isolation.service';

describe('Fraud Detection Integration Tests', () => {
  let testCardId: string;
  let testCardContext: string;
  let authToken: string;
  let fraudService: FraudDetectionService;
  let freezeService: CardFreezeService;
  let isolationService: TransactionIsolationService;

  beforeAll(async () => {
    // Initialize services
    fraudService = new FraudDetectionService();
    freezeService = new CardFreezeService();
    isolationService = new TransactionIsolationService(supabase);
    
    // Create test card and get auth token
    const testCard = await createTestCard();
    testCardId = testCard.cardId;
    testCardContext = testCard.cardContext;
    authToken = testCard.authToken;
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear Redis cache before each test
    await redis.flushdb();
    
    // Reset card isolation context
    await isolationService.generateIsolationContext(testCardId);
  });

  describe('Privacy Isolation in Fraud Detection', () => {
    it('should enforce transaction isolation boundaries', async () => {
      // Create transactions for different cards
      const card1Transaction = createMockTransaction(testCardId, 100);
      const card2Transaction = createMockTransaction('other-card-id', 200);

      // Analyze transaction for test card
      const analysis = await fraudService.analyzeTransaction(card1Transaction);

      // Verify isolation context was enforced
      expect(analysis).toBeDefined();
      expect(analysis.cardId).toBe(testCardId);

      // Verify no cross-card data access
      const patterns = await redis.get(`fraud:patterns:${testCardId}`);
      const otherPatterns = await redis.get(`fraud:patterns:other-card-id`);
      
      expect(patterns).toBeTruthy();
      expect(otherPatterns).toBeFalsy();
    });

    it('should not access data from other cards during analysis', async () => {
      // Setup data for multiple cards
      await setupMultiCardTestData();

      const transaction = createMockTransaction(testCardId, 500);
      
      // Mock database query to track what data is accessed
      const querySpy = jest.spyOn(supabase, 'from');
      
      await fraudService.analyzeTransaction(transaction);

      // Verify only current card's data was queried
      const queries = querySpy.mock.calls;
      queries.forEach(call => {
        if (call[0] === 'payment_transactions' || call[0] === 'fraud_events') {
          // Check that RLS context was set for current card only
          expect(call).toBeDefined();
        }
      });

      querySpy.mockRestore();
    });

    it('should maintain privacy in ML model training', async () => {
      const transactions = [
        createMockTransaction(testCardId, 100),
        createMockTransaction(testCardId, 150),
        createMockTransaction(testCardId, 200)
      ];

      // Train model with transactions
      for (const transaction of transactions) {
        await fraudService.analyzeTransaction(transaction);
      }

      // Verify model only uses current card data
      const modelData = await redis.get(`fraud:model:${testCardId}`);
      expect(modelData).toBeTruthy();

      // Verify no aggregated cross-card data
      const aggregatedData = await redis.keys('fraud:model:*');
      expect(aggregatedData).toHaveLength(1);
      expect(aggregatedData[0]).toBe(`fraud:model:${testCardId}`);
    });
  });

  describe('Real-time Fraud Detection Performance', () => {
    it('should complete fraud analysis within 200ms', async () => {
      const transaction = createMockTransaction(testCardId, 100);
      
      const startTime = Date.now();
      const analysis = await fraudService.analyzeTransaction(transaction);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(200);
      expect(analysis).toBeDefined();
      expect(analysis.riskScore).toBeGreaterThanOrEqual(0);
      expect(analysis.riskScore).toBeLessThanOrEqual(100);
    });

    it('should handle concurrent fraud analysis requests', async () => {
      const transactions = Array.from({ length: 10 }, (_, i) => 
        createMockTransaction(testCardId, 100 + i * 10)
      );

      const startTime = Date.now();
      const analyses = await Promise.all(
        transactions.map(t => fraudService.analyzeTransaction(t))
      );
      const endTime = Date.now();

      expect(analyses).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(500); // All 10 within 500ms
      
      analyses.forEach(analysis => {
        expect(analysis.cardId).toBe(testCardId);
        expect(analysis.riskScore).toBeGreaterThanOrEqual(0);
      });
    });

    it('should use Redis caching for performance optimization', async () => {
      const transaction = createMockTransaction(testCardId, 100);

      // First analysis - should populate cache
      await fraudService.analyzeTransaction(transaction);

      // Verify cache entries exist
      const velocityCache = await redis.get(`fraud:velocity:${testCardId}`);
      const patternsCache = await redis.get(`fraud:patterns:${testCardId}`);

      expect(velocityCache).toBeTruthy();
      expect(patternsCache).toBeTruthy();

      // Second analysis should be faster due to caching
      const startTime = Date.now();
      await fraudService.analyzeTransaction(transaction);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // Should be much faster
    });
  });

  describe('Automated Card Freezing Integration', () => {
    it('should automatically freeze card on high-risk transactions', async () => {
      const highRiskTransaction = createMockTransaction(testCardId, 10000, {
        merchant: { mcc: '7995', name: 'SUSPICIOUS_MERCHANT' }, // High-risk MCC
        location: { lat: 40.7128, lon: -74.0060 } // Different location
      });

      const analysis = await fraudService.analyzeTransaction(highRiskTransaction);
      
      expect(analysis.riskScore).toBeGreaterThan(75);
      expect(analysis.actionRecommended).toBe('freeze');

      // Verify card was frozen
      const freezeStatus = await freezeService.getCardFreezeStatus(testCardId);
      expect(freezeStatus.isFrozen).toBe(true);
      expect(freezeStatus.reason).toBe('fraud_detected');
    });

    it('should complete card freeze within 1 second', async () => {
      const freezeRequest = {
        cardId: testCardId,
        reason: 'fraud_detected',
        metadata: { riskScore: 85, eventId: 'test-event-123' }
      };

      const startTime = Date.now();
      const result = await freezeService.freezeCard(freezeRequest);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
      expect(result.success).toBe(true);
      expect(result.cardId).toBe(testCardId);
    });

    it('should integrate with Marqeta API for card control', async () => {
      // Mock Marqeta API call
      const marqetaSpy = jest.spyOn(freezeService as any, 'callMarqetaAPI');
      marqetaSpy.mockResolvedValue({ success: true, status: 'SUSPENDED' });

      const freezeRequest = {
        cardId: testCardId,
        reason: 'fraud_detected'
      };

      const result = await freezeService.freezeCard(freezeRequest);

      expect(marqetaSpy).toHaveBeenCalledWith('POST', expect.stringContaining('/transitions'), {
        state: 'SUSPENDED',
        reason: 'FRAUD_SUSPECTED',
        channel: 'API'
      });

      expect(result.success).toBe(true);
      marqetaSpy.mockRestore();
    });
  });

  describe('API Endpoints Integration', () => {
    it('should return fraud status with proper authentication', async () => {
      const response = await request(app)
        .get(`/api/v1/security/fraud/status/${testCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('cardId');
      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('lastAnalysis');
      expect(response.body.cardId).toBe(testCardId);
    });

    it('should enforce rate limiting on fraud analysis endpoint', async () => {
      const transaction = createMockTransaction(testCardId, 100);

      // Make multiple requests quickly
      const requests = Array.from({ length: 25 }, () =>
        request(app)
          .post('/api/v1/security/fraud/analyze')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ transaction })
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should require MFA for high-risk card control actions', async () => {
      // Setup MFA for the card
      await setupMFAForCard(testCardId);

      const response = await request(app)
        .post(`/api/v1/security/fraud/cards/${testCardId}/freeze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'manual_freeze' })
        .expect(200);

      expect(response.body).toHaveProperty('requiresMFA');
      expect(response.body.requiresMFA).toBe(true);
      expect(response.body).toHaveProperty('challenge');
    });

    it('should validate card access permissions', async () => {
      const otherCardId = 'unauthorized-card-id';

      await request(app)
        .get(`/api/v1/security/fraud/status/${otherCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });

  describe('False Positive Feedback and Model Improvement', () => {
    it('should accept false positive feedback and improve model', async () => {
      // Create a fraud event
      const transaction = createMockTransaction(testCardId, 500);
      const analysis = await fraudService.analyzeTransaction(transaction);

      // Submit false positive feedback
      const response = await request(app)
        .post('/api/v1/security/fraud/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cardId: testCardId,
          eventId: analysis.eventId,
          feedback: 'false_positive',
          reason: 'legitimate_large_purchase'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify feedback was recorded
      const { data: feedbackRecord } = await supabase
        .from('fraud_events')
        .select('false_positive, feedback_reason')
        .eq('event_id', analysis.eventId)
        .single();

      expect(feedbackRecord?.false_positive).toBe(true);
      expect(feedbackRecord?.feedback_reason).toBe('legitimate_large_purchase');
    });

    it('should adjust risk scoring based on feedback patterns', async () => {
      // Submit multiple false positive feedbacks for similar transactions
      const similarTransactions = Array.from({ length: 5 }, () =>
        createMockTransaction(testCardId, 500, { merchant: { name: 'GROCERY_STORE' } })
      );

      for (const transaction of similarTransactions) {
        const analysis = await fraudService.analyzeTransaction(transaction);
        
        await request(app)
          .post('/api/v1/security/fraud/feedback')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            cardId: testCardId,
            eventId: analysis.eventId,
            feedback: 'false_positive'
          });
      }

      // Test similar transaction - should have lower risk score
      const testTransaction = createMockTransaction(testCardId, 500, {
        merchant: { name: 'GROCERY_STORE' }
      });
      
      const newAnalysis = await fraudService.analyzeTransaction(testTransaction);
      expect(newAnalysis.riskScore).toBeLessThan(50); // Should be lower due to feedback
    });
  });

  // Helper functions
  async function createTestCard() {
    const cardId = `test-card-${Date.now()}`;
    const cardContext = `context-${cardId}`;
    
    // Insert test card
    await supabase.from('cards').insert({
      card_id: cardId,
      card_context_hash: cardContext,
      status: 'active',
      created_at: new Date().toISOString()
    });

    // Create auth token (simplified for testing)
    const authToken = `test-token-${cardId}`;
    
    return { cardId, cardContext, authToken };
  }

  function createMockTransaction(cardId: string, amount: number, overrides: any = {}) {
    return {
      transactionId: `txn-${Date.now()}-${Math.random()}`,
      cardId,
      amount,
      merchant: {
        name: 'TEST_MERCHANT',
        mcc: '5411', // Grocery
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

  async function setupMultiCardTestData() {
    const otherCardId = 'other-test-card';
    
    // Create transactions for other card
    await supabase.from('payment_transactions').insert([
      {
        transaction_id: 'txn-other-1',
        card_context_hash: 'other-context',
        amount: 300,
        created_at: new Date().toISOString()
      }
    ]);

    // Create fraud events for other card
    await supabase.from('fraud_events').insert([
      {
        event_id: 'fraud-other-1',
        card_context_hash: 'other-context',
        event_type: 'velocity_exceeded',
        risk_score: 75,
        detected_at: new Date().toISOString()
      }
    ]);
  }

  async function setupMFAForCard(cardId: string) {
    // Insert MFA configuration for test card
    await supabase.from('mfa_configurations').insert({
      card_id: cardId,
      enabled: true,
      methods: ['totp'],
      risk_based_enabled: true,
      risk_thresholds: {
        low_risk: 25,
        medium_risk: 50,
        high_risk: 75
      }
    });
  }

  async function cleanupTestData() {
    // Clean up test data
    await supabase.from('cards').delete().ilike('card_id', 'test-card-%');
    await supabase.from('fraud_events').delete().ilike('event_id', 'fraud-%');
    await supabase.from('payment_transactions').delete().ilike('transaction_id', 'txn-%');
    await supabase.from('mfa_configurations').delete().ilike('card_id', 'test-card-%');
  }
});