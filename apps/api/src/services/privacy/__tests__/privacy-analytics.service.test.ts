import { PrivacyAnalyticsService } from '../privacy-analytics.service';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger');

describe('PrivacyAnalyticsService', () => {
  let service: PrivacyAnalyticsService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      rpc: jest.fn(),
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      })),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new PrivacyAnalyticsService('http://test.supabase.co', 'test-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePrivateAnalytics', () => {
    it('should generate private aggregate spend analytics', async () => {
      const request = {
        metricType: 'aggregate_spend' as const,
        timeRange: {
          start: new Date(Date.now() - 86400000).toISOString(),
          end: new Date().toISOString()
        },
        privacyBudget: 1.0,
        k_anonymity_threshold: 5
      };

      mockSupabase.rpc.mockResolvedValueOnce({ data: 1000, error: null });
      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValueOnce({ count: 10, error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const result = await service.generatePrivateAnalytics(request);

      expect(result.value).toBeGreaterThan(0);
      expect(result.privacyBudgetConsumed).toBe(1.0);
      expect(result.k_anonymity_satisfied).toBe(true);
      expect(result.confidenceInterval).toBeDefined();
      expect(result.noiseLevel).toBeGreaterThan(0);
    });

    it('should generate private transaction count analytics', async () => {
      const request = {
        metricType: 'transaction_count' as const,
        timeRange: {
          start: new Date(Date.now() - 86400000).toISOString(),
          end: new Date().toISOString()
        },
        privacyBudget: 1.0,
        k_anonymity_threshold: 5
      };

      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValueOnce({ count: 15, error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const result = await service.generatePrivateAnalytics(request);

      expect(typeof result.value).toBe('number');
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.k_anonymity_satisfied).toBe(true);
    });

    it('should generate private merchant category analytics', async () => {
      const request = {
        metricType: 'merchant_categories' as const,
        timeRange: {
          start: new Date(Date.now() - 86400000).toISOString(),
          end: new Date().toISOString()
        },
        privacyBudget: 2.0,
        k_anonymity_threshold: 5
      };

      const mockTransactions = [
        { merchant_category: 'grocery' },
        { merchant_category: 'grocery' },
        { merchant_category: 'grocery' },
        { merchant_category: 'grocery' },
        { merchant_category: 'grocery' },
        { merchant_category: 'restaurant' },
        { merchant_category: 'restaurant' },
        { merchant_category: 'restaurant' },
        { merchant_category: 'restaurant' },
        { merchant_category: 'restaurant' },
      ];

      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValueOnce({ data: mockTransactions, error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const result = await service.generatePrivateAnalytics(request);

      expect(typeof result.value).toBe('object');
      expect(result.k_anonymity_satisfied).toBe(true);
      
      const categories = result.value as Record<string, number>;
      expect(categories.grocery).toBeGreaterThan(0);
      expect(categories.restaurant).toBeGreaterThan(0);
    });

    it('should reject queries exceeding privacy budget', async () => {
      const request = {
        metricType: 'aggregate_spend' as const,
        timeRange: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        },
        privacyBudget: 5.0, // Exceeds maximum
        k_anonymity_threshold: 5
      };

      await expect(service.generatePrivateAnalytics(request))
        .rejects.toThrow('Insufficient privacy budget');
    });

    it('should throw error for unsupported metric type', async () => {
      const request = {
        metricType: 'unsupported_metric' as any,
        timeRange: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        },
        privacyBudget: 1.0,
        k_anonymity_threshold: 5
      };

      await expect(service.generatePrivateAnalytics(request))
        .rejects.toThrow('Unsupported metric type');
    });
  });

  describe('getPrivacyBudgetStatus', () => {
    it('should return correct budget status', async () => {
      const status = await service.getPrivacyBudgetStatus();

      expect(status.totalBudget).toBe(10.0);
      expect(status.remainingBudget).toBeGreaterThanOrEqual(0);
      expect(status.budgetUtilization).toBeGreaterThanOrEqual(0);
      expect(status.budgetUtilization).toBeLessThanOrEqual(1);
      expect(status.resetTime).toBeInstanceOf(Date);
    });

    it('should reset budget at midnight UTC', async () => {
      // Mock a service with consumed budget
      const consumedService = new PrivacyAnalyticsService('http://test.supabase.co', 'test-key');
      
      // Consume some budget
      await consumedService.generatePrivateAnalytics({
        metricType: 'transaction_count',
        timeRange: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        },
        privacyBudget: 2.0,
        k_anonymity_threshold: 5
      }).catch(() => {}); // Ignore error for this test

      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValue({ count: 10, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      // Set reset time to past
      (consumedService as any).privacyConfig.budgetResetTime = new Date(Date.now() - 1000);

      const status = await consumedService.getPrivacyBudgetStatus();

      expect(status.remainingBudget).toBe(10.0); // Should be reset
    });
  });

  describe('detectInferenceAttack', () => {
    it('should detect repeated queries as potential inference attack', async () => {
      const queryHistory = [
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '2023-01-01', end: '2023-01-02' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        },
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '2023-01-01', end: '2023-01-02' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        },
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '2023-01-01', end: '2023-01-02' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        }
      ];

      const isAttack = await service.detectInferenceAttack(queryHistory);

      expect(isAttack).toBe(true);
    });

    it('should not flag diverse queries as attack', async () => {
      const queryHistory = [
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '2023-01-01', end: '2023-01-02' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        },
        {
          metricType: 'transaction_count' as const,
          timeRange: { start: '2023-01-02', end: '2023-01-03' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        },
        {
          metricType: 'merchant_categories' as const,
          timeRange: { start: '2023-01-03', end: '2023-01-04' },
          privacyBudget: 2.0,
          k_anonymity_threshold: 5
        }
      ];

      const isAttack = await service.detectInferenceAttack(queryHistory);

      expect(isAttack).toBe(false);
    });

    it('should detect overlapping time ranges', async () => {
      const queryHistory = [
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '2023-01-01', end: '2023-01-15' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        },
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '2023-01-10', end: '2023-01-20' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        },
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '2023-01-05', end: '2023-01-25' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        }
      ];

      const isAttack = await service.detectInferenceAttack(queryHistory);
      expect(isAttack).toBe(true);
    });

    it('should detect small time windows', async () => {
      const queryHistory = [
        {
          metricType: 'transaction_count' as const,
          timeRange: { 
            start: new Date('2023-01-01T10:00:00').toISOString(), 
            end: new Date('2023-01-01T10:30:00').toISOString() 
          },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        },
        {
          metricType: 'transaction_count' as const,
          timeRange: { 
            start: new Date('2023-01-01T11:00:00').toISOString(), 
            end: new Date('2023-01-01T11:45:00').toISOString() 
          },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        }
      ];

      const isAttack = await service.detectInferenceAttack(queryHistory);
      expect(isAttack).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid time ranges', async () => {
      const request = {
        metricType: 'transaction_count' as const,
        timeRange: { start: '2023-01-31', end: '2023-01-01' },
        privacyBudget: 1.0,
        k_anonymity_threshold: 5
      };

      await expect(service.generatePrivateAnalytics(request))
        .rejects.toThrow('Start date must be before end date');
    });

    it('should reject invalid privacy budget', async () => {
      const request = {
        metricType: 'transaction_count' as const,
        timeRange: { start: '2023-01-01', end: '2023-01-31' },
        privacyBudget: -1,
        k_anonymity_threshold: 5
      };

      await expect(service.generatePrivateAnalytics(request))
        .rejects.toThrow('Privacy budget must be between');
    });

    it('should reject k-anonymity below threshold', async () => {
      const request = {
        metricType: 'transaction_count' as const,
        timeRange: { start: '2023-01-01', end: '2023-01-31' },
        privacyBudget: 1.0,
        k_anonymity_threshold: 2
      };

      await expect(service.generatePrivateAnalytics(request))
        .rejects.toThrow('K-anonymity threshold must be at least');
    });
  });

  describe('Noise Generation', () => {
    it('should reject invalid epsilon', () => {
      expect(() => (service as any).generateLaplaceNoise(0, 1))
        .toThrow('Epsilon must be positive');
    });

    it('should reject negative sensitivity', () => {
      expect(() => (service as any).generateLaplaceNoise(1, -1))
        .toThrow('Sensitivity must be non-negative');
    });

    it('should generate noise with expected properties', () => {
      const noiseValues = [];
      for (let i = 0; i < 1000; i++) {
        noiseValues.push((service as any).generateLaplaceNoise(1, 1));
      }

      // Check mean is close to 0
      const mean = noiseValues.reduce((a, b) => a + b, 0) / noiseValues.length;
      expect(Math.abs(mean)).toBeLessThan(0.5);
    });
  });
});