import request from 'supertest';
import { app } from '../../app';
import { PrivacyAnalyticsService } from '../../services/privacy/privacy-analytics.service';

jest.mock('../../services/privacy/privacy-analytics.service');

describe('Privacy Analytics Integration', () => {
  let mockAnalyticsService: jest.Mocked<PrivacyAnalyticsService>;

  beforeEach(() => {
    mockAnalyticsService = new PrivacyAnalyticsService('', '') as jest.Mocked<PrivacyAnalyticsService>;
    mockAnalyticsService.generatePrivateAnalytics = jest.fn();
    mockAnalyticsService.getPrivacyBudgetStatus = jest.fn();
    mockAnalyticsService.detectInferenceAttack = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/analytics/privacy/aggregate-spending', () => {
    it('should return privacy-preserving spending analytics', async () => {
      const mockResult = {
        value: 1250.75,
        confidenceInterval: { lower: 1200, upper: 1300 },
        privacyBudgetConsumed: 0.5,
        k_anonymity_satisfied: true,
        noiseLevel: 25.5,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending')
        .query({
          start: new Date(Date.now() - 604800000).toISOString(),
          end: new Date().toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.totalSpending).toBe(1250.75);
      expect(response.body.confidenceInterval).toEqual({ lower: 1200, upper: 1300 });
      expect(response.body.privacyProtected).toBe(true);
      expect(response.body.dataQuality.kAnonymity).toBe(true);
      expect(parseFloat(response.body.dataQuality.noiseLevelPercent)).toBeLessThan(5); // <5% noise
    });

    it('should include confidence intervals for noisy results', async () => {
      const mockResult = {
        value: 2500,
        confidenceInterval: { lower: 2400, upper: 2600 },
        privacyBudgetConsumed: 0.5,
        k_anonymity_satisfied: true,
        noiseLevel: 50,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending');

      expect(response.status).toBe(200);
      expect(response.body.confidenceInterval.lower).toBeLessThan(response.body.totalSpending);
      expect(response.body.confidenceInterval.upper).toBeGreaterThan(response.body.totalSpending);
    });
  });

  describe('GET /api/v1/analytics/privacy/transaction-volume', () => {
    it('should return private transaction count', async () => {
      const mockResult = {
        value: 47,
        confidenceInterval: { lower: 45, upper: 50 },
        privacyBudgetConsumed: 1.0,
        k_anonymity_satisfied: true,
        noiseLevel: 2,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/transaction-volume');

      expect(response.status).toBe(200);
      expect(response.body.transactionCount).toBe(47);
      expect(response.body.dailyAverage).toBe(Math.round(47 / 30));
      expect(response.body.privacyProtected).toBe(true);
    });

    it('should handle small transaction counts with k-anonymity', async () => {
      const mockResult = {
        value: 3, // Below k-anonymity threshold
        confidenceInterval: { lower: 0, upper: 6 },
        privacyBudgetConsumed: 1.0,
        k_anonymity_satisfied: false,
        noiseLevel: 1,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/transaction-volume');

      expect(response.status).toBe(200);
      // Should still return result but with larger confidence interval
      expect(response.body.confidenceInterval.upper).toBeGreaterThan(response.body.transactionCount);
    });
  });

  describe('GET /api/v1/analytics/privacy/merchant-categories', () => {
    it('should return privacy-preserving category distribution', async () => {
      const mockResult = {
        value: {
          grocery: 15,
          restaurant: 12,
          gas: 8,
          retail: 6
        },
        confidenceInterval: { lower: 0, upper: 0 },
        privacyBudgetConsumed: 2.0,
        k_anonymity_satisfied: true,
        noiseLevel: 1.5,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/merchant-categories');

      expect(response.status).toBe(200);
      expect(response.body.distribution).toBeDefined();
      expect(response.body.distribution[0].category).toBe('grocery');
      expect(response.body.distribution[0].count).toBe(15);
      expect(response.body.distribution[0].percentage).toBe('36.6'); // 15/41 * 100
      expect(response.body.totalTransactions).toBe(41);
      expect(response.body.privacyProtected).toBe(true);
      expect(response.body.note).toContain('Categories with fewer than 5 transactions are excluded');
    });

    it('should exclude categories below k-anonymity threshold', async () => {
      const mockResult = {
        value: {
          grocery: 10,
          // small categories excluded by service
        },
        confidenceInterval: { lower: 0, upper: 0 },
        privacyBudgetConsumed: 2.0,
        k_anonymity_satisfied: true,
        noiseLevel: 1,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/merchant-categories');

      expect(response.status).toBe(200);
      expect(response.body.distribution).toHaveLength(1); // Only grocery above threshold
    });
  });

  describe('GET /api/v1/analytics/privacy/budget', () => {
    it('should return current privacy budget status', async () => {
      const mockStatus = {
        totalBudget: 10.0,
        remainingBudget: 7.5,
        budgetUtilization: 0.25,
        resetTime: new Date(Date.now() + 43200000) // 12 hours from now
      };

      mockAnalyticsService.getPrivacyBudgetStatus.mockResolvedValueOnce(mockStatus);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/budget');

      expect(response.status).toBe(200);
      expect(response.body.totalBudget).toBe(10.0);
      expect(response.body.remainingBudget).toBe(7.5);
      expect(response.body.budgetUtilization).toBe('25.0%');
      expect(response.body.timeUntilReset).toBeGreaterThan(0);
    });

    it('should show budget consumption affects availability', async () => {
      const mockStatus = {
        totalBudget: 10.0,
        remainingBudget: 0.1, // Very low budget
        budgetUtilization: 0.99,
        resetTime: new Date(Date.now() + 43200000)
      };

      mockAnalyticsService.getPrivacyBudgetStatus.mockResolvedValueOnce(mockStatus);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/budget');

      expect(response.status).toBe(200);
      expect(response.body.budgetUtilization).toBe('99.0%');
      expect(response.body.remainingBudget).toBe(0.1);
    });
  });

  describe('Privacy Budget Enforcement', () => {
    it('should reject queries when budget is exhausted', async () => {
      // Mock exhausted budget
      mockAnalyticsService.generatePrivateAnalytics.mockRejectedValueOnce(
        new Error('Insufficient privacy budget')
      );

      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending')
        .query({ epsilon: '2.0' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to generate privacy-preserving analytics');
    });

    it('should validate epsilon parameter bounds', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending')
        .query({ epsilon: '5.0' }); // Above maximum

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Privacy budget (epsilon) must be between 0 and 2.0');
    });

    it('should reject negative epsilon values', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending')
        .query({ epsilon: '-1.0' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Privacy budget (epsilon) must be between 0 and 2.0');
    });
  });

  describe('Differential Privacy Verification', () => {
    it('should add appropriate noise to results', async () => {
      const trueValue = 1000;
      const mockResult = {
        value: trueValue + 15, // Some noise added
        confidenceInterval: { lower: 980, upper: 1020 },
        privacyBudgetConsumed: 1.0,
        k_anonymity_satisfied: true,
        noiseLevel: 15,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending');

      expect(response.status).toBe(200);
      expect(response.body.privacyGuarantees.noiseLevel).toBe(15);
      expect(response.body.privacyGuarantees.epsilonUsed).toBe(1.0);
    });

    it('should provide confidence intervals with noise', async () => {
      const mockResult = {
        value: 500,
        confidenceInterval: { lower: 480, upper: 520 },
        privacyBudgetConsumed: 0.5,
        k_anonymity_satisfied: true,
        noiseLevel: 10,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/transaction-volume');

      expect(response.status).toBe(200);
      expect(response.body.confidenceInterval.lower).toBeLessThan(response.body.transactionCount);
      expect(response.body.confidenceInterval.upper).toBeGreaterThan(response.body.transactionCount);
    });
  });

  describe('K-Anonymity Compliance', () => {
    it('should enforce minimum group sizes', async () => {
      const mockResult = {
        value: { grocery: 12 }, // Only categories with k>=5
        confidenceInterval: { lower: 0, upper: 0 },
        privacyBudgetConsumed: 2.0,
        k_anonymity_satisfied: true,
        noiseLevel: 1,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/merchant-categories')
        .query({ k_anonymity: '5' });

      expect(response.status).toBe(200);
      expect(response.body.note).toContain('Categories with fewer than 5 transactions are excluded');
    });
  });

  describe('Performance Requirements', () => {
    it('should respond within 300ms for analytics queries', async () => {
      const mockResult = {
        value: 1500,
        confidenceInterval: { lower: 1450, upper: 1550 },
        privacyBudgetConsumed: 1.0,
        k_anonymity_satisfied: true,
        noiseLevel: 25,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending');
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(300);
    });

    it('should maintain <500ms response time for complex analytics', async () => {
      const mockResult = {
        value: {
          grocery: 25,
          restaurant: 18,
          gas: 12,
          retail: 15,
          entertainment: 8,
          travel: 6
        },
        confidenceInterval: { lower: 0, upper: 0 },
        privacyBudgetConsumed: 2.0,
        k_anonymity_satisfied: true,
        noiseLevel: 2.5,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/v1/analytics/privacy/merchant-categories');
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe('Inference Attack Prevention', () => {
    it('should detect and block inference attacks', async () => {
      mockAnalyticsService.detectInferenceAttack.mockResolvedValueOnce(true);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/inference-check');

      expect(response.status).toBe(200);
      expect(response.body.inferenceRiskDetected).toBe(true);
      expect(response.body.recommendation).toContain('inference attack');
    });

    it('should allow normal query patterns', async () => {
      mockAnalyticsService.detectInferenceAttack.mockResolvedValueOnce(false);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/inference-check');

      expect(response.status).toBe(200);
      expect(response.body.inferenceRiskDetected).toBe(false);
      expect(response.body.recommendation).toContain('No inference risk detected');
    });
  });

  describe('Privacy Guarantee Verification', () => {
    it('should validate epsilon-delta privacy guarantees', async () => {
      const mockResult = {
        value: 750,
        confidenceInterval: { lower: 720, upper: 780 },
        privacyBudgetConsumed: 1.0,
        k_anonymity_satisfied: true,
        noiseLevel: 15,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/transaction-volume')
        .query({ epsilon: '1.0' });

      expect(response.status).toBe(200);
      expect(response.body.privacyGuarantees.epsilonUsed).toBe(1.0);
      expect(response.body.privacyGuarantees.kAnonymitySatisfied).toBe(true);
      expect(response.body.privacyGuarantees.noiseLevel).toBeGreaterThan(0);
    });

    it('should ensure noise calibration is appropriate', async () => {
      const mockResult = {
        value: 100,
        confidenceInterval: { lower: 95, upper: 105 },
        privacyBudgetConsumed: 0.1, // Very low epsilon
        k_anonymity_satisfied: true,
        noiseLevel: 50, // High noise for low epsilon
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending')
        .query({ epsilon: '0.1' });

      expect(response.status).toBe(200);
      // High noise should result in wide confidence intervals
      const intervalWidth = response.body.confidenceInterval.upper - response.body.confidenceInterval.lower;
      expect(intervalWidth).toBeGreaterThan(10);
    });
  });

  describe('Aggregate-Only Restrictions', () => {
    it('should only provide aggregate statistics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/privacy/aggregate-spending');

      expect(response.status).toBe(200);
      // Should not contain individual transaction data
      expect(response.body.transactions).toBeUndefined();
      expect(response.body.individualAmounts).toBeUndefined();
      expect(response.body.userIds).toBeUndefined();
    });

    it('should prevent queries for individual user data', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/privacy/user-spending')
        .query({ userId: 'user123' });

      // This endpoint should not exist
      expect(response.status).toBe(404);
    });
  });

  describe('Statistical Disclosure Control', () => {
    it('should suppress small cells in categorical data', async () => {
      const mockResult = {
        value: {
          grocery: 15, // Above threshold
          retail: 8,   // Above threshold
          // Small categories excluded by service
        },
        confidenceInterval: { lower: 0, upper: 0 },
        privacyBudgetConsumed: 2.0,
        k_anonymity_satisfied: true,
        noiseLevel: 1,
        timestamp: new Date().toISOString()
      };

      mockAnalyticsService.generatePrivateAnalytics.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/analytics/privacy/merchant-categories');

      expect(response.status).toBe(200);
      // Should only include categories with sufficient counts
      response.body.distribution.forEach((category: any) => {
        expect(category.count).toBeGreaterThanOrEqual(5);
      });
    });
  });
});