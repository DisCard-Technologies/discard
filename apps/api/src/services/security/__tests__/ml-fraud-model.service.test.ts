import { MLFraudModelService, TransactionFeatures, FraudScore } from '../ml-fraud-model.service';
import { createClient } from 'redis';
import { TransactionIsolationService } from '../../privacy/transaction-isolation.service';
import { PrivacyAnalyticsService } from '../../privacy/privacy-analytics.service';

// Mock dependencies
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK')
  }))
}));

jest.mock('../../privacy/transaction-isolation.service');
jest.mock('../../privacy/privacy-analytics.service');
jest.mock('../../../utils/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null })
  }
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

describe('MLFraudModelService', () => {
  let service: MLFraudModelService;
  let mockRedis: any;
  let mockIsolationService: jest.Mocked<TransactionIsolationService>;
  let mockPrivacyAnalytics: jest.Mocked<PrivacyAnalyticsService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MLFraudModelService();
    mockRedis = (createClient as jest.Mock).mock.results[0].value;
    mockIsolationService = (TransactionIsolationService as jest.MockedClass<typeof TransactionIsolationService>).mock.instances[0] as any;
    mockPrivacyAnalytics = (PrivacyAnalyticsService as jest.MockedClass<typeof PrivacyAnalyticsService>).mock.instances[0] as any;
    
    // Set up default mock implementations
    mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
    mockIsolationService.getCardContext.mockResolvedValue({
      contextId: 'test-context',
      cardContextHash: 'test-hash',
      sessionBoundary: 'test-boundary',
      correlationResistance: {
        ipObfuscation: true,
        timingRandomization: true,
        behaviorMasking: true
      }
    });
    
    mockPrivacyAnalytics.generatePrivateAnalytics.mockResolvedValue({
      value: 0.92,
      confidenceInterval: { lower: 0.90, upper: 0.94 },
      privacyBudgetConsumed: 0.1,
      k_anonymity_satisfied: true
    });
  });

  afterEach(async () => {
    await service.disconnect();
  });

  describe('scoreTransaction', () => {
    const baseFeatures: TransactionFeatures = {
      cardId: 'card-123',
      amount: 50,
      merchantCategory: '5411',
      timeOfDay: 14,
      dayOfWeek: 2,
      isWeekend: false,
      velocityScore: 2,
      amountDeviation: 0.5,
      merchantRiskScore: 0.2,
      geographicRiskScore: 0.1,
      previousDeclineRate: 0.05
    };

    it('should calculate low fraud score for normal transaction', async () => {
      const result = await service.scoreTransaction(baseFeatures);
      
      expect(result.score).toBeLessThan(30);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.modelVersion).toBe('1.0.0');
      expect(result.contributingFactors).toBeInstanceOf(Array);
    });

    it('should detect high velocity transactions', async () => {
      const highVelocityFeatures = {
        ...baseFeatures,
        velocityScore: 10
      };
      
      const result = await service.scoreTransaction(highVelocityFeatures);
      
      const velocityFactor = result.contributingFactors.find(f => f.ruleName === 'high_velocity');
      expect(velocityFactor?.triggered).toBe(true);
      expect(velocityFactor?.impact).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(baseFeatures.amount);
    });

    it('should detect excessive amount deviation', async () => {
      const highAmountFeatures = {
        ...baseFeatures,
        amountDeviation: 4
      };
      
      const result = await service.scoreTransaction(highAmountFeatures);
      
      const amountFactor = result.contributingFactors.find(f => f.ruleName === 'excessive_amount');
      expect(amountFactor?.triggered).toBe(true);
      expect(result.score).toBeGreaterThan(30);
    });

    it('should detect high-risk merchants', async () => {
      const riskyMerchantFeatures = {
        ...baseFeatures,
        merchantRiskScore: 0.8
      };
      
      const result = await service.scoreTransaction(riskyMerchantFeatures);
      
      const merchantFactor = result.contributingFactors.find(f => f.ruleName === 'high_risk_merchant');
      expect(merchantFactor?.triggered).toBe(true);
    });

    it('should detect unusual time transactions', async () => {
      const lateNightFeatures = {
        ...baseFeatures,
        timeOfDay: 3
      };
      
      const result = await service.scoreTransaction(lateNightFeatures);
      
      const timeFactor = result.contributingFactors.find(f => f.ruleName === 'unusual_time');
      expect(timeFactor?.triggered).toBe(true);
    });

    it('should detect geographic anomalies', async () => {
      const geoRiskFeatures = {
        ...baseFeatures,
        geographicRiskScore: 0.9
      };
      
      const result = await service.scoreTransaction(geoRiskFeatures);
      
      const geoFactor = result.contributingFactors.find(f => f.ruleName === 'geographic_risk');
      expect(geoFactor?.triggered).toBe(true);
    });

    it('should consider decline history', async () => {
      const highDeclineFeatures = {
        ...baseFeatures,
        previousDeclineRate: 0.4
      };
      
      const result = await service.scoreTransaction(highDeclineFeatures);
      
      const declineFactor = result.contributingFactors.find(f => f.ruleName === 'decline_history');
      expect(declineFactor?.triggered).toBe(true);
    });

    it('should detect weekend high amount pattern', async () => {
      const weekendHighFeatures = {
        ...baseFeatures,
        isWeekend: true,
        amount: 600
      };
      
      const result = await service.scoreTransaction(weekendHighFeatures);
      
      const weekendFactor = result.contributingFactors.find(f => f.ruleName === 'weekend_high_amount');
      expect(weekendFactor?.triggered).toBe(true);
    });

    it('should detect rapid small transactions', async () => {
      const rapidSmallFeatures = {
        ...baseFeatures,
        velocityScore: 4,
        amount: 5
      };
      
      const result = await service.scoreTransaction(rapidSmallFeatures);
      
      const rapidFactor = result.contributingFactors.find(f => f.ruleName === 'rapid_small_transactions');
      expect(rapidFactor?.triggered).toBe(true);
    });

    it('should enforce transaction isolation', async () => {
      await service.scoreTransaction(baseFeatures);
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
    });

    it('should handle errors gracefully', async () => {
      mockIsolationService.enforceTransactionIsolation.mockRejectedValue(new Error('Isolation failed'));
      
      await expect(service.scoreTransaction(baseFeatures)).rejects.toThrow('Failed to calculate fraud score');
    });

    it('should enrich features from cache when available', async () => {
      const cachedFeatures = {
        previousDeclineRate: 0.15,
        avgVelocity: 3,
        lastUpdate: new Date().toISOString()
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedFeatures));
      
      const result = await service.scoreTransaction(baseFeatures);
      
      expect(mockRedis.get).toHaveBeenCalledWith(expect.stringContaining('fraud:ml:features:card-123'));
      expect(result).toBeDefined();
    });
  });

  describe('trainModel', () => {
    it('should skip training with insufficient data', async () => {
      const { supabase } = require('../../../utils/supabase');
      supabase.from().select().eq().not().order().limit.mockResolvedValueOnce({
        data: new Array(50), // Less than 100 required
        error: null
      });
      
      await service.trainModel('card-123');
      
      // Should not update model version
      expect(mockRedis.setEx).not.toHaveBeenCalledWith(
        expect.stringContaining('fraud:ml:model:version'),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should update rule weights based on feedback', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock training data with feedback
      const trainingData = new Array(200).fill(null).map((_, i) => ({
        event_id: `event-${i}`,
        card_context_hash: 'test-hash',
        false_positive: i % 10 === 0, // 10% false positive
        event_data: {
          features: {
            ...baseFeatures,
            velocityScore: i % 20 === 0 ? 10 : 2 // Some high velocity
          }
        }
      }));
      
      supabase.from().select().eq().not().order().limit.mockResolvedValueOnce({
        data: trainingData,
        error: null
      });
      
      await service.trainModel('card-123');
      
      // Should version the updated model
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.stringContaining('fraud:ml:model:version'),
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('recordFeedback', () => {
    it('should store feedback in Redis', async () => {
      await service.recordFeedback('card-123', 'event-456', true);
      
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.stringContaining('fraud:ml:feedback:card-123:event-456'),
        expect.any(Number),
        expect.stringContaining('"falsePositive":true')
      );
    });

    it('should update model performance metrics', async () => {
      await service.recordFeedback('card-123', 'event-789', false);
      
      expect(mockPrivacyAnalytics.generatePrivateAnalytics).toHaveBeenCalledWith({
        metricType: 'model_performance',
        data: {
          falsePositive: 0,
          truePositive: 1
        },
        privacyBudget: 0.1,
        k_anonymity_threshold: 10
      });
    });

    it('should enforce isolation when recording feedback', async () => {
      await service.recordFeedback('card-123', 'event-999', true);
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
    });
  });

  describe('getModelPerformance', () => {
    it('should return privacy-preserved performance metrics', async () => {
      const performance = await service.getModelPerformance();
      
      expect(performance).toEqual({
        accuracy: 0.92,
        falsePositiveRate: 0.018,
        version: '1.0.0'
      });
      
      expect(mockPrivacyAnalytics.generatePrivateAnalytics).toHaveBeenCalledWith({
        metricType: 'model_performance_summary',
        privacyBudget: 0.5,
        k_anonymity_threshold: 100
      });
    });
  });

  describe('score calculation', () => {
    it('should normalize scores to 0-100 range', async () => {
      // Test with all rules triggered
      const extremeFeatures: TransactionFeatures = {
        cardId: 'card-extreme',
        amount: 10000,
        merchantCategory: '7995',
        timeOfDay: 3,
        dayOfWeek: 6,
        isWeekend: true,
        velocityScore: 20,
        amountDeviation: 10,
        merchantRiskScore: 1.0,
        geographicRiskScore: 1.0,
        previousDeclineRate: 0.8
      };
      
      const result = await service.scoreTransaction(extremeFeatures);
      
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0.8); // High confidence with many triggers
    });

    it('should calculate appropriate confidence levels', async () => {
      // Test with mixed signals
      const mixedFeatures: TransactionFeatures = {
        ...baseFeatures,
        velocityScore: 6, // High
        merchantRiskScore: 0.1, // Low
        timeOfDay: 3, // Unusual
        previousDeclineRate: 0.01 // Low
      };
      
      const result = await service.scoreTransaction(mixedFeatures);
      
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });
  });
});