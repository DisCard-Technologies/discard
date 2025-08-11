import { FraudDetectionService, Transaction, FraudAnalysisResult } from '../fraud-detection.service';
import { createClient } from 'redis';
import { TransactionIsolationService } from '../../privacy/transaction-isolation.service';

// Mock dependencies
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK'),
    zAdd: jest.fn().mockResolvedValue(1),
    zCount: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1)
  }))
}));

jest.mock('../../privacy/transaction-isolation.service');
jest.mock('../../../utils/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
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

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;
  let mockRedis: any;
  let mockIsolationService: jest.Mocked<TransactionIsolationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FraudDetectionService();
    mockRedis = (createClient as jest.Mock).mock.results[0].value;
    mockIsolationService = (TransactionIsolationService as jest.MockedClass<typeof TransactionIsolationService>).mock.instances[0] as any;
    
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
  });

  afterEach(async () => {
    await service.disconnect();
  });

  describe('analyzeTransaction', () => {
    const baseTransaction: Transaction = {
      id: 'txn-123',
      cardId: 'card-123',
      amount: 50.00,
      merchantName: 'Test Merchant',
      merchantCategory: '5411', // Grocery
      merchantLocation: { lat: 40.7128, lon: -74.0060 },
      timestamp: new Date(),
      currency: 'USD'
    };

    it('should return low risk for normal transaction', async () => {
      mockRedis.zCount.mockResolvedValue(2); // Normal velocity
      
      const result = await service.analyzeTransaction(baseTransaction);
      
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBeLessThan(25);
      expect(result.anomalies).toHaveLength(0);
      expect(result.recommendedAction).toBe('none');
    });

    it('should detect velocity anomaly', async () => {
      mockRedis.zCount.mockResolvedValue(10); // High velocity
      
      const result = await service.analyzeTransaction(baseTransaction);
      
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({
          type: 'velocity',
          severity: 'high'
        })
      );
      expect(result.riskScore).toBeGreaterThan(50);
      expect(result.recommendedAction).toBe('alert');
    });

    it('should detect amount anomaly', async () => {
      // Mock transaction pattern with low average
      const pattern = {
        avgAmount: 20,
        stdDevAmount: 5,
        commonMerchantCategories: [['5411', 10]],
        lastLocation: { lat: 40.7128, lon: -74.0060 },
        lastTransactionTime: new Date().toISOString(),
        transactionCount: 50
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(pattern));
      
      const highAmountTxn = { ...baseTransaction, amount: 200 };
      const result = await service.analyzeTransaction(highAmountTxn);
      
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({
          type: 'amount',
          severity: expect.stringMatching(/medium|high/)
        })
      );
    });

    it('should detect geographic anomaly', async () => {
      // Mock pattern with different location
      const pattern = {
        avgAmount: 50,
        stdDevAmount: 10,
        commonMerchantCategories: [['5411', 10]],
        lastLocation: { lat: 34.0522, lon: -118.2437 }, // LA
        lastTransactionTime: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        transactionCount: 50
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(pattern));
      
      const result = await service.analyzeTransaction(baseTransaction); // NY location
      
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({
          type: 'geographic',
          severity: 'high' // Impossible travel speed
        })
      );
    });

    it('should detect high-risk merchant category', async () => {
      const riskyTxn = { ...baseTransaction, merchantCategory: '7995' }; // Gambling
      
      const result = await service.analyzeTransaction(riskyTxn);
      
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({
          type: 'merchant',
          severity: 'medium',
          details: expect.stringContaining('High-risk merchant category')
        })
      );
    });

    it('should detect pattern anomaly for late night transaction', async () => {
      const lateNightTxn = {
        ...baseTransaction,
        timestamp: new Date('2024-01-01T03:30:00')
      };
      
      const result = await service.analyzeTransaction(lateNightTxn);
      
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({
          type: 'pattern',
          severity: 'low',
          details: expect.stringContaining('unusual hours')
        })
      );
    });

    it('should recommend decline for critical risk score', async () => {
      // Set up multiple high-severity anomalies
      mockRedis.zCount.mockResolvedValue(15); // Very high velocity
      const pattern = {
        avgAmount: 20,
        stdDevAmount: 5,
        commonMerchantCategories: [['5411', 10]],
        lastLocation: { lat: 34.0522, lon: -118.2437 },
        lastTransactionTime: new Date(Date.now() - 60000).toISOString(),
        transactionCount: 50
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(pattern));
      
      const riskyTxn = {
        ...baseTransaction,
        amount: 500,
        merchantCategory: '7995'
      };
      
      const result = await service.analyzeTransaction(riskyTxn);
      
      expect(result.riskLevel).toBe('critical');
      expect(result.recommendedAction).toBe('decline');
    });

    it('should use cached score when available', async () => {
      const cachedResult: FraudAnalysisResult = {
        riskScore: 30,
        riskLevel: 'medium',
        anomalies: [],
        recommendedAction: 'none',
        analysisTimestamp: new Date()
      };
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedResult));
      
      const result = await service.analyzeTransaction(baseTransaction);
      
      expect(result).toEqual(cachedResult);
      expect(mockRedis.zAdd).not.toHaveBeenCalled(); // Velocity check skipped
    });

    it('should enforce transaction isolation', async () => {
      await service.analyzeTransaction(baseTransaction);
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
    });

    it('should handle errors gracefully', async () => {
      mockIsolationService.enforceTransactionIsolation.mockRejectedValue(new Error('Isolation failed'));
      
      await expect(service.analyzeTransaction(baseTransaction)).rejects.toThrow('Failed to analyze transaction for fraud');
    });
  });

  describe('risk score calculation', () => {
    it('should calculate risk score based on anomaly weights', async () => {
      // Test with multiple anomalies
      mockRedis.zCount.mockResolvedValue(8); // Velocity anomaly
      const pattern = {
        avgAmount: 30,
        stdDevAmount: 10,
        commonMerchantCategories: [['5411', 10]],
        transactionCount: 50
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(pattern));
      
      const transaction: Transaction = {
        id: 'txn-456',
        cardId: 'card-456',
        amount: 150, // 5x average
        merchantName: 'Test',
        merchantCategory: '7995', // High risk
        timestamp: new Date('2024-01-01T04:00:00'), // Late night
        currency: 'USD'
      };
      
      const result = await service.analyzeTransaction(transaction);
      
      expect(result.anomalies.length).toBeGreaterThan(2);
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('pattern management', () => {
    it('should update transaction patterns after analysis', async () => {
      const transaction = {
        id: 'txn-789',
        cardId: 'card-789',
        amount: 75,
        merchantName: 'Store',
        merchantCategory: '5411',
        merchantLocation: { lat: 40.7, lon: -74.0 },
        timestamp: new Date(),
        currency: 'USD'
      };
      
      await service.analyzeTransaction(transaction);
      
      // Verify pattern was cached
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.stringContaining('fraud:patterns:card-789'),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should load patterns from database when not cached', async () => {
      const { supabase } = require('../../../utils/supabase');
      supabase.from().select().eq().order().limit.mockResolvedValueOnce({
        data: [
          {
            amount: 40,
            merchant_category: '5411',
            merchant_location: { lat: 40.7, lon: -74.0 },
            created_at: new Date().toISOString()
          },
          {
            amount: 60,
            merchant_category: '5411',
            merchant_location: { lat: 40.7, lon: -74.0 },
            created_at: new Date(Date.now() - 3600000).toISOString()
          }
        ],
        error: null
      });
      
      const transaction = {
        id: 'txn-db',
        cardId: 'card-db',
        amount: 200,
        merchantName: 'Store',
        merchantCategory: '5411',
        timestamp: new Date(),
        currency: 'USD'
      };
      
      const result = await service.analyzeTransaction(transaction);
      
      // Should detect amount anomaly based on loaded pattern
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({
          type: 'amount'
        })
      );
    });
  });

  describe('geographic calculations', () => {
    it('should calculate distance correctly', async () => {
      // New York to Los Angeles (~2450 miles)
      const pattern = {
        avgAmount: 50,
        stdDevAmount: 10,
        commonMerchantCategories: [['5411', 10]],
        lastLocation: { lat: 34.0522, lon: -118.2437 }, // LA
        lastTransactionTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        transactionCount: 50
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(pattern));
      
      const nyTransaction = {
        ...baseTransaction,
        merchantLocation: { lat: 40.7128, lon: -74.0060 } // NY
      };
      
      const result = await service.analyzeTransaction(nyTransaction);
      
      const geoAnomaly = result.anomalies.find(a => a.type === 'geographic');
      expect(geoAnomaly).toBeDefined();
      expect(geoAnomaly?.details).toContain('miles from last location');
    });
  });
});