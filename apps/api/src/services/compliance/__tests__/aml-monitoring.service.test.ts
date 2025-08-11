import { AMLMonitoringService, AMLTransaction } from '../aml-monitoring.service';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'redis';

// Mock external dependencies
jest.mock('@supabase/supabase-js');
jest.mock('redis');
jest.mock('../../privacy/transaction-isolation.service');
jest.mock('../../security/fraud-detection.service');

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  rpc: jest.fn()
};

const mockRedis = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  zAdd: jest.fn(),
  expire: jest.fn(),
  zRangeByScore: jest.fn(),
  get: jest.fn(),
  setEx: jest.fn()
};

const mockIsolationService = {
  enforceTransactionIsolation: jest.fn()
};

const mockFraudDetectionService = {
  analyzeTransaction: jest.fn(),
  disconnect: jest.fn()
};

// Mock environment variables
process.env.REDIS_URL = 'redis://localhost:6379';

describe('AMLMonitoringService', () => {
  let amlService: AMLMonitoringService;
  let mockTransaction: AMLTransaction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    (createSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
    (createRedisClient as jest.Mock).mockReturnValue(mockRedis);
    
    amlService = new AMLMonitoringService('mock-url', 'mock-key');
    
    // Mock the private properties
    (amlService as any).isolationService = mockIsolationService;
    (amlService as any).fraudDetectionService = mockFraudDetectionService;

    mockTransaction = {
      transactionId: 'txn-123',
      cardContextHash: 'card-hash-456',
      amount: 9500,
      currency: 'USD',
      timestamp: new Date(),
      merchantName: 'Test Merchant',
      merchantCategory: '5411',
      transactionType: 'purchase'
    };
  });

  describe('analyzeTransaction', () => {
    it('should analyze transaction and return AML results', async () => {
      // Mock isolation service
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      
      // Mock no cached analysis
      mockRedis.get.mockResolvedValue(null);
      
      // Mock Redis operations for pattern detection
      mockRedis.zAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);
      mockRedis.zRangeByScore.mockResolvedValue([]);
      
      // Mock Supabase query for rapid movement
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      });

      const result = await amlService.analyzeTransaction(mockTransaction);

      expect(result).toBeDefined();
      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
      expect(['none', 'monitor', 'review', 'report_sar']).toContain(result.recommendedAction);
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-hash-456');
    });

    it('should return cached analysis if available', async () => {
      const cachedAnalysis = {
        suspiciousActivities: [],
        overallRiskScore: 25,
        riskLevel: 'medium',
        recommendedAction: 'monitor',
        analysisTimestamp: '2023-01-01T00:00:00.000Z'
      };
      
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedAnalysis));

      const result = await amlService.analyzeTransaction(mockTransaction);

      expect(result.overallRiskScore).toBe(25);
      expect(result.riskLevel).toBe('medium');
      expect(result.recommendedAction).toBe('monitor');
    });

    it('should detect structuring pattern', async () => {
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(null);
      
      // Mock structuring pattern detection
      const structuringTransactions = [
        JSON.stringify({ id: 'txn-1', amount: 9000, timestamp: Date.now() - 1000 }),
        JSON.stringify({ id: 'txn-2', amount: 8500, timestamp: Date.now() - 2000 }),
        JSON.stringify({ id: 'txn-3', amount: 9200, timestamp: Date.now() - 3000 })
      ];
      
      mockRedis.zAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);
      mockRedis.zRangeByScore.mockResolvedValue(structuringTransactions);
      
      // Mock other checks to return empty
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      });

      const result = await amlService.analyzeTransaction(mockTransaction);

      expect(result.suspiciousActivities).toHaveLength(1);
      expect(result.suspiciousActivities[0].patternType).toBe('structuring');
      expect(result.suspiciousActivities[0].riskScore).toBeGreaterThan(0);
      expect(result.overallRiskScore).toBeGreaterThan(0);
    });

    it('should detect high-risk merchant', async () => {
      const highRiskTransaction = {
        ...mockTransaction,
        merchantCategory: '7995' // Gambling
      };
      
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);
      mockRedis.zRangeByScore.mockResolvedValue([]);
      
      // Mock Supabase queries
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      });

      const result = await amlService.analyzeTransaction(highRiskTransaction);

      const highRiskActivity = result.suspiciousActivities.find(a => a.patternType === 'high_risk_merchant');
      expect(highRiskActivity).toBeDefined();
      expect(highRiskActivity?.riskScore).toBe(60);
    });

    it('should detect velocity anomaly', async () => {
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);
      
      // Mock high velocity - more than 10 transactions per hour
      const velocityTransactions = Array.from({ length: 12 }, (_, i) => 
        JSON.stringify({ id: `txn-${i}`, amount: 1000 })
      );
      mockRedis.zRangeByScore.mockResolvedValue(velocityTransactions);
      
      // Mock other checks
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      });

      const result = await amlService.analyzeTransaction(mockTransaction);

      const velocityActivity = result.suspiciousActivities.find(a => a.patternType === 'unusual_velocity');
      expect(velocityActivity).toBeDefined();
      expect(velocityActivity?.riskScore).toBeGreaterThan(0);
    });

    it('should detect round amount pattern', async () => {
      const roundAmountTransaction = {
        ...mockTransaction,
        amount: 5000 // Round amount
      };
      
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);
      
      // Mock multiple round amount transactions
      const roundTransactions = Array.from({ length: 6 }, (_, i) => 
        JSON.stringify({ id: `txn-${i}`, amount: (i + 1) * 1000 })
      );
      
      // Return empty for most calls, but round amounts for the specific key
      mockRedis.zRangeByScore.mockImplementation((key: string) => {
        if (key.includes('round')) {
          return Promise.resolve(roundTransactions);
        }
        return Promise.resolve([]);
      });
      
      // Mock other checks
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      });

      const result = await amlService.analyzeTransaction(roundAmountTransaction);

      const roundAmountActivity = result.suspiciousActivities.find(a => a.patternType === 'round_amount_pattern');
      expect(roundAmountActivity).toBeDefined();
      expect(roundAmountActivity?.riskScore).toBe(45);
    });
  });

  describe('risk calculation', () => {
    it('should calculate correct risk levels', async () => {
      // Test private methods through public interface
      const lowRiskTransaction = { ...mockTransaction, amount: 100 };
      const highRiskTransaction = { ...mockTransaction, merchantCategory: '7995', amount: 9000 };
      
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);
      mockRedis.zRangeByScore.mockResolvedValue([]);
      
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      });

      const lowRiskResult = await amlService.analyzeTransaction(lowRiskTransaction);
      const highRiskResult = await amlService.analyzeTransaction(highRiskTransaction);

      expect(lowRiskResult.overallRiskScore).toBeLessThan(highRiskResult.overallRiskScore);
    });
  });

  describe('integration with fraud detection', () => {
    it('should share pattern recognition with fraud detection service', async () => {
      const fraudAnalysis = {
        riskScore: 85,
        riskLevel: 'high' as const,
        anomalies: [],
        recommendedAction: 'freeze' as const,
        analysisTimestamp: new Date()
      };
      
      mockFraudDetectionService.analyzeTransaction.mockResolvedValue(fraudAnalysis);

      await amlService.sharePatternRecognition(mockTransaction);

      expect(mockFraudDetectionService.analyzeTransaction).toHaveBeenCalledWith({
        id: mockTransaction.transactionId,
        cardId: mockTransaction.cardContextHash,
        amount: mockTransaction.amount,
        merchantName: mockTransaction.merchantName,
        merchantCategory: mockTransaction.merchantCategory,
        timestamp: mockTransaction.timestamp,
        currency: mockTransaction.currency
      });
    });
  });

  describe('error handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      mockRedis.zAdd.mockRejectedValue(new Error('Redis connection failed'));
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(null);
      
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      });

      // Should not throw, but handle gracefully
      const result = await amlService.analyzeTransaction(mockTransaction);
      expect(result).toBeDefined();
    });

    it('should handle Supabase query errors gracefully', async () => {
      mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zAdd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(true);
      mockRedis.zRangeByScore.mockResolvedValue([]);
      
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                then: jest.fn().mockResolvedValue({ data: null, error: new Error('Database error') })
              })
            })
          })
        })
      });

      const result = await amlService.analyzeTransaction(mockTransaction);
      expect(result).toBeDefined();
      // Should still return some analysis even with database errors
    });
  });

  describe('cleanup', () => {
    it('should disconnect from Redis and fraud detection service', async () => {
      await amlService.disconnect();

      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockFraudDetectionService.disconnect).toHaveBeenCalled();
    });
  });
});