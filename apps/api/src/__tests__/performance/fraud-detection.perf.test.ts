import { performance } from 'perf_hooks';
import { FraudDetectionService } from '../../services/security/fraud-detection.service';
import { MLFraudModelService } from '../../services/security/ml-fraud-model.service';
import { CardFreezeService } from '../../services/security/card-freeze.service';
import { redis } from '../../config/redis';
import { supabase } from '../../config/database';

describe('Fraud Detection Performance Tests', () => {
  let fraudService: FraudDetectionService;
  let mlService: MLFraudModelService;
  let freezeService: CardFreezeService;
  
  const testCardId = 'perf-test-card-123';

  beforeAll(async () => {
    fraudService = new FraudDetectionService();
    mlService = new MLFraudModelService();
    freezeService = new CardFreezeService();

    // Setup test data
    await setupPerformanceTestData();
  });

  afterAll(async () => {
    // Cleanup
    await cleanupPerformanceTestData();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear Redis cache for consistent test conditions
    await redis.flushdb();
  });

  describe('Real-time Analysis Performance (<200ms requirement)', () => {
    it('should analyze single transaction under 200ms', async () => {
      const transaction = createTestTransaction(testCardId, 100);
      
      const startTime = performance.now();
      const result = await fraudService.analyzeTransaction(transaction);
      const endTime = performance.now();

      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(200);
      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);

      console.log(`Single transaction analysis: ${duration.toFixed(2)}ms`);
    });

    it('should handle burst of transactions within performance limits', async () => {
      const transactions = Array.from({ length: 50 }, (_, i) => 
        createTestTransaction(testCardId, 100 + i)
      );

      const results: number[] = [];
      
      for (const transaction of transactions) {
        const startTime = performance.now();
        await fraudService.analyzeTransaction(transaction);
        const endTime = performance.now();
        results.push(endTime - startTime);
      }

      // Check that 95% of transactions are under 200ms
      const sortedResults = results.sort((a, b) => a - b);
      const p95Index = Math.floor(sortedResults.length * 0.95);
      const p95Time = sortedResults[p95Index];

      expect(p95Time).toBeLessThan(200);

      const avgTime = results.reduce((sum, time) => sum + time, 0) / results.length;
      const maxTime = Math.max(...results);

      console.log(`Burst analysis results:`);
      console.log(`- Average: ${avgTime.toFixed(2)}ms`);
      console.log(`- P95: ${p95Time.toFixed(2)}ms`);
      console.log(`- Max: ${maxTime.toFixed(2)}ms`);
    });

    it('should maintain performance with populated Redis cache', async () => {
      // Pre-populate cache with transaction history
      await populateRedisCache(testCardId);

      const transaction = createTestTransaction(testCardId, 250);
      
      const startTime = performance.now();
      const result = await fraudService.analyzeTransaction(transaction);
      const endTime = performance.now();

      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(150); // Should be faster with cache
      expect(result.riskScore).toBeDefined();

      console.log(`Cached transaction analysis: ${duration.toFixed(2)}ms`);
    });

    it('should handle concurrent analysis requests efficiently', async () => {
      const concurrentRequests = 20;
      const transactions = Array.from({ length: concurrentRequests }, (_, i) => 
        createTestTransaction(testCardId, 100 + i * 10)
      );

      const startTime = performance.now();
      
      const promises = transactions.map(transaction => 
        fraudService.analyzeTransaction(transaction)
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalDuration = endTime - startTime;
      const avgDurationPerRequest = totalDuration / concurrentRequests;

      expect(avgDurationPerRequest).toBeLessThan(200);
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result.riskScore).toBeGreaterThanOrEqual(0);
        expect(result.riskScore).toBeLessThanOrEqual(100);
      });

      console.log(`Concurrent analysis (${concurrentRequests} requests):`);
      console.log(`- Total time: ${totalDuration.toFixed(2)}ms`);
      console.log(`- Avg per request: ${avgDurationPerRequest.toFixed(2)}ms`);
    });
  });

  describe('ML Model Performance', () => {
    it('should complete model scoring under 50ms', async () => {
      const features = {
        amount: 100,
        merchantCategory: '5411',
        timeOfDay: 14,
        dayOfWeek: 3,
        location: { lat: 37.7749, lon: -122.4194 },
        transactionCount24h: 5,
        avgAmount30d: 75,
        distanceFromHome: 0
      };

      const startTime = performance.now();
      const score = await mlService.scoreTransaction(testCardId, features);
      const endTime = performance.now();

      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(50);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);

      console.log(`ML model scoring: ${duration.toFixed(2)}ms`);
    });

    it('should handle model training efficiently', async () => {
      const trainingData = Array.from({ length: 100 }, (_, i) => ({
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
        isFraud: Math.random() > 0.95 // 5% fraud rate
      }));

      const startTime = performance.now();
      await mlService.trainModel(testCardId, trainingData);
      const endTime = performance.now();

      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      console.log(`ML model training (100 samples): ${duration.toFixed(2)}ms`);
    });
  });

  describe('Card Freeze Performance (<1 second requirement)', () => {
    it('should complete card freeze under 1 second', async () => {
      const freezeRequest = {
        cardId: testCardId,
        reason: 'fraud_detected',
        metadata: { riskScore: 85, eventId: 'perf-test-event-123' }
      };

      // Mock Marqeta API to avoid external dependency
      jest.spyOn(freezeService as any, 'callMarqetaAPI')
        .mockResolvedValue({ success: true, status: 'SUSPENDED' });

      const startTime = performance.now();
      const result = await freezeService.freezeCard(freezeRequest);
      const endTime = performance.now();

      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000);
      expect(result.success).toBe(true);

      console.log(`Card freeze operation: ${duration.toFixed(2)}ms`);
    });

    it('should handle multiple freeze requests efficiently', async () => {
      const cardIds = Array.from({ length: 10 }, (_, i) => `perf-card-${i}`);
      
      // Mock Marqeta API
      jest.spyOn(freezeService as any, 'callMarqetaAPI')
        .mockResolvedValue({ success: true, status: 'SUSPENDED' });

      const startTime = performance.now();
      
      const promises = cardIds.map(cardId => 
        freezeService.freezeCard({
          cardId,
          reason: 'fraud_detected',
          metadata: { riskScore: 80 }
        })
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalDuration = endTime - startTime;
      const avgDurationPerFreeze = totalDuration / cardIds.length;

      expect(avgDurationPerFreeze).toBeLessThan(1000);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      console.log(`Multiple card freeze operations (${cardIds.length} cards):`);
      console.log(`- Total time: ${totalDuration.toFixed(2)}ms`);
      console.log(`- Avg per operation: ${avgDurationPerFreeze.toFixed(2)}ms`);
    });
  });

  describe('Database Performance', () => {
    it('should query fraud events efficiently', async () => {
      const startTime = performance.now();
      
      const { data } = await supabase
        .from('fraud_events')
        .select('*')
        .eq('card_context_hash', `context-${testCardId}`)
        .order('detected_at', { ascending: false })
        .limit(100);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
      expect(data).toBeDefined();

      console.log(`Fraud events query: ${duration.toFixed(2)}ms`);
    });

    it('should insert fraud events quickly', async () => {
      const fraudEvent = {
        event_id: `perf-event-${Date.now()}`,
        card_context_hash: `context-${testCardId}`,
        event_type: 'velocity_exceeded',
        risk_score: 75,
        event_data: JSON.stringify({ amount: 500, merchant: 'TEST_MERCHANT' }),
        action_taken: 'alert',
        detected_at: new Date().toISOString()
      };

      const startTime = performance.now();
      
      const { error } = await supabase
        .from('fraud_events')
        .insert([fraudEvent]);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(error).toBeNull();
      expect(duration).toBeLessThan(50);

      console.log(`Fraud event insert: ${duration.toFixed(2)}ms`);
    });

    it('should handle batch inserts efficiently', async () => {
      const events = Array.from({ length: 50 }, (_, i) => ({
        event_id: `perf-batch-event-${i}-${Date.now()}`,
        card_context_hash: `context-${testCardId}`,
        event_type: 'pattern_anomaly',
        risk_score: 60 + i,
        event_data: JSON.stringify({ 
          amount: 100 + i * 10, 
          merchant: `TEST_MERCHANT_${i}` 
        }),
        action_taken: 'none',
        detected_at: new Date().toISOString()
      }));

      const startTime = performance.now();
      
      const { error } = await supabase
        .from('fraud_events')
        .insert(events);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(error).toBeNull();
      expect(duration).toBeLessThan(500); // 500ms for 50 records

      console.log(`Batch fraud events insert (${events.length} records): ${duration.toFixed(2)}ms`);
    });
  });

  describe('Redis Cache Performance', () => {
    it('should write to Redis cache quickly', async () => {
      const cacheData = {
        velocity: { count: 5, window: 300 },
        patterns: { merchant_categories: ['5411', '5812'], avg_amount: 125 },
        risk_factors: { geographic: false, velocity: true, amount: false }
      };

      const startTime = performance.now();
      
      await redis.setex(
        `fraud:patterns:${testCardId}`,
        3600,
        JSON.stringify(cacheData)
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10);

      console.log(`Redis cache write: ${duration.toFixed(2)}ms`);
    });

    it('should read from Redis cache quickly', async () => {
      // Pre-populate cache
      await redis.setex(
        `fraud:patterns:${testCardId}`,
        3600,
        JSON.stringify({ test: 'data' })
      );

      const startTime = performance.now();
      const cachedData = await redis.get(`fraud:patterns:${testCardId}`);
      const endTime = performance.now();

      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10);
      expect(cachedData).toBeDefined();
      expect(JSON.parse(cachedData!)).toHaveProperty('test');

      console.log(`Redis cache read: ${duration.toFixed(2)}ms`);
    });
  });

  // Helper functions
  async function setupPerformanceTestData() {
    // Create test card
    await supabase.from('cards').upsert({
      card_id: testCardId,
      card_context_hash: `context-${testCardId}`,
      status: 'active',
      created_at: new Date().toISOString()
    });

    // Create some historical transactions
    const transactions = Array.from({ length: 100 }, (_, i) => ({
      transaction_id: `perf-txn-${i}`,
      card_context_hash: `context-${testCardId}`,
      amount: 50 + Math.floor(Math.random() * 200),
      merchant_name: `MERCHANT_${i % 10}`,
      merchant_category: ['5411', '5812', '5999', '7011'][i % 4],
      created_at: new Date(Date.now() - i * 60000).toISOString()
    }));

    await supabase.from('payment_transactions').insert(transactions);
  }

  async function cleanupPerformanceTestData() {
    await supabase.from('payment_transactions')
      .delete()
      .like('transaction_id', 'perf-%');
    
    await supabase.from('fraud_events')
      .delete()
      .like('event_id', 'perf-%');
    
    await supabase.from('cards')
      .delete()
      .eq('card_id', testCardId);
  }

  async function populateRedisCache(cardId: string) {
    const cacheData = {
      velocity: { count: 3, firstTransaction: Date.now() - 300000 },
      patterns: {
        merchantCategories: ['5411', '5812'],
        avgAmount: 125,
        avgTimeOfDay: 14,
        commonLocations: [{ lat: 37.7749, lon: -122.4194 }]
      },
      riskFactors: {
        geographic: false,
        velocity: false,
        amount: false,
        merchant: false,
        pattern: false
      }
    };

    await redis.setex(
      `fraud:patterns:${cardId}`,
      3600,
      JSON.stringify(cacheData)
    );

    await redis.setex(
      `fraud:velocity:${cardId}`,
      300,
      JSON.stringify(cacheData.velocity)
    );
  }

  function createTestTransaction(cardId: string, amount: number) {
    return {
      transactionId: `perf-test-${Date.now()}-${Math.random()}`,
      cardId,
      amount,
      merchant: {
        name: 'TEST_MERCHANT',
        mcc: '5411',
        location: { lat: 37.7749, lon: -122.4194 }
      },
      timestamp: new Date().toISOString(),
      location: { lat: 37.7749, lon: -122.4194 }
    };
  }
});