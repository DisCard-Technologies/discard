import { TransactionIsolationService } from '../transaction-isolation.service';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger');

describe('TransactionIsolationService', () => {
  let service: TransactionIsolationService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      rpc: jest.fn(),
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        insert: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        like: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      })),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new TransactionIsolationService('http://test.supabase.co', 'test-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enforceTransactionIsolation', () => {
    it('should successfully enforce transaction isolation', async () => {
      const cardId = 'test-card-123';
      
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null }) // set_app_context
        .mockResolvedValueOnce({ data: true, error: null }) // set_isolation_context
        .mockResolvedValueOnce({ data: true, error: null }) // verify_isolation_boundaries
        .mockResolvedValueOnce({ data: [], error: null }); // detect_correlation_patterns

      await service.enforceTransactionIsolation(cardId);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_app_context', expect.any(Object));
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_isolation_context', expect.any(Object));
      expect(mockSupabase.rpc).toHaveBeenCalledWith('verify_isolation_boundaries', expect.any(Object));
    });

    it('should throw error when isolation verification fails', async () => {
      const cardId = 'test-card-123';
      
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: false, error: null });

      await expect(service.enforceTransactionIsolation(cardId))
        .rejects.toThrow('Isolation verification failed');
    });

    it('should handle correlation patterns detection', async () => {
      const cardId = 'test-card-123';
      const correlationPatterns = [
        {
          pattern_type: 'temporal_correlation',
          risk_level: 'high',
          contexts_involved: ['context1', 'context2']
        }
      ];
      
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: correlationPatterns, error: null });

      const fromMock = mockSupabase.from();
      fromMock.upsert.mockResolvedValueOnce({ error: null });

      await expect(service.enforceTransactionIsolation(cardId))
        .rejects.toThrow('Isolation verification failed');
    });
  });

  describe('verifyIsolation', () => {
    it('should return isolated status when no violations detected', async () => {
      const contextHash = 'test-context-hash';
      const mockMetrics = {
        isolation_id: 'test-id',
        isolation_verified: true,
        privacy_violation_detected: false,
        correlation_attempts: 0,
        last_verification_time: new Date().toISOString()
      };

      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ data: mockMetrics, error: null });

      const result = await service.verifyIsolation(contextHash);

      expect(result.isolated).toBe(true);
      expect(result.contextHash).toBe(contextHash);
      expect(result.correlationAttempts).toBe(0);
      expect(result.privacyViolations).toBe(false);
      expect(result.verificationProof).toBeTruthy();
    });

    it('should return non-isolated status when violations detected', async () => {
      const contextHash = 'test-context-hash';
      const mockMetrics = {
        isolation_id: 'test-id',
        isolation_verified: false,
        privacy_violation_detected: true,
        correlation_attempts: 5,
        last_verification_time: new Date().toISOString()
      };

      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ data: mockMetrics, error: null });

      const result = await service.verifyIsolation(contextHash);

      expect(result.isolated).toBe(false);
      expect(result.correlationAttempts).toBe(5);
      expect(result.privacyViolations).toBe(true);
    });

    it('should handle missing metrics', async () => {
      const contextHash = 'test-context-hash';

      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

      const result = await service.verifyIsolation(contextHash);

      expect(result.isolated).toBe(false);
      expect(result.privacyViolations).toBe(true);
    });
  });

  describe('switchContext', () => {
    it('should successfully switch context between cards', async () => {
      const fromCardId = 'card-1';
      const toCardId = 'card-2';

      // Mock successful context switch
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null }) // clear context
        .mockResolvedValueOnce({ data: true, error: null }) // clear isolation
        .mockResolvedValueOnce({ data: true, error: null }) // set new context
        .mockResolvedValueOnce({ data: true, error: null }) // set new isolation
        .mockResolvedValueOnce({ data: true, error: null }) // verify boundaries
        .mockResolvedValueOnce({ data: [], error: null }); // detect patterns

      const fromMock = mockSupabase.from();
      fromMock.limit.mockResolvedValueOnce({ data: [], error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      await service.switchContext(fromCardId, toCardId);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_app_context', { context_value: '' });
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_isolation_context', { context_value: '' });
    });

    it('should add timing randomization', async () => {
      const fromCardId = 'card-1';
      const toCardId = 'card-2';

      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
      const fromMock = mockSupabase.from();
      fromMock.limit.mockResolvedValueOnce({ data: [], error: null });

      const startTime = Date.now();
      await service.switchContext(fromCardId, toCardId);
      const endTime = Date.now();

      // Should take at least 500ms due to randomization
      expect(endTime - startTime).toBeGreaterThanOrEqual(500);
    });

    it('should detect cross-context access attempts', async () => {
      const fromCardId = 'card-1';
      const toCardId = 'card-2';

      const accessPatterns = [
        { context_hash: 'hash1' },
        { context_hash: 'hash2' }
      ];

      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
      const fromMock = mockSupabase.from();
      fromMock.limit.mockResolvedValueOnce({ data: accessPatterns, error: null });

      await expect(service.switchContext(fromCardId, toCardId))
        .rejects.toThrow('Context switch verification failed');
    });
  });

  describe('getIsolationStatus', () => {
    it('should return correct isolation status', async () => {
      const cardId = 'test-card';
      const mockMetrics = {
        isolation_verified: true,
        privacy_violation_detected: false,
        correlation_attempts: 1,
        last_verification_time: new Date().toISOString()
      };

      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ data: mockMetrics, error: null });

      const status = await service.getIsolationStatus(cardId);

      expect(status.isolated).toBe(true);
      expect(status.violationCount).toBe(1);
      expect(status.riskLevel).toBe('low');
    });

    it('should calculate risk levels correctly', async () => {
      const cardId = 'test-card';
      
      // Test high risk
      const highRiskMetrics = {
        isolation_verified: false,
        privacy_violation_detected: true,
        correlation_attempts: 10,
        last_verification_time: new Date().toISOString()
      };

      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ data: highRiskMetrics, error: null });

      let status = await service.getIsolationStatus(cardId);
      expect(status.riskLevel).toBe('high');

      // Test medium risk
      const mediumRiskMetrics = {
        isolation_verified: true,
        privacy_violation_detected: false,
        correlation_attempts: 3,
        last_verification_time: new Date().toISOString()
      };

      fromMock.single.mockResolvedValueOnce({ data: mediumRiskMetrics, error: null });

      status = await service.getIsolationStatus(cardId);
      expect(status.riskLevel).toBe('medium');
    });
  });

  describe('startIsolationMonitoring', () => {
    it('should start periodic monitoring', () => {
      jest.useFakeTimers();
      const detectPatternsSpy = jest.spyOn(service as any, 'detectCorrelationPatterns');

      service.startIsolationMonitoring();

      // Fast-forward time
      jest.advanceTimersByTime(60000); // 1 minute

      expect(detectPatternsSpy).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('verifyIsolationBoundaries', () => {
    it('should verify boundaries successfully', async () => {
      const context = {
        contextId: 'test-context',
        cardContextHash: 'test-hash',
        sessionBoundary: 'test-boundary',
        correlationResistance: {
          ipObfuscation: true,
          timingRandomization: true,
          behaviorMasking: true
        }
      };

      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.verifyIsolationBoundaries(context);

      expect(result).toBe(true);
    });

    it('should handle boundary verification errors', async () => {
      const context = {
        contextId: 'test-context',
        cardContextHash: 'test-hash',
        sessionBoundary: 'test-boundary',
        correlationResistance: {
          ipObfuscation: true,
          timingRandomization: true,
          behaviorMasking: true
        }
      };

      mockSupabase.rpc.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Verification failed' } 
      });

      const result = await service.verifyIsolationBoundaries(context);

      expect(result).toBe(false);
    });
  });
});