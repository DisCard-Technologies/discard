import { CorrelationDetectionService } from '../correlation-detection.service';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger');

describe('CorrelationDetectionService', () => {
  let service: CorrelationDetectionService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      })),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new CorrelationDetectionService('http://test.supabase.co', 'test-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectCrossCardCorrelation', () => {
    it('should detect temporal correlation patterns', async () => {
      const mockAccessPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          session_hash: 'session1',
          potential_correlation: false
        },
        {
          tracking_id: '2',
          context_hash: 'context2',
          access_timestamp: new Date(Date.now() + 30000).toISOString(), // 30 seconds later
          access_type: 'read',
          session_hash: 'session1',
          potential_correlation: false
        },
        {
          tracking_id: '3',
          context_hash: 'context3',
          access_timestamp: new Date(Date.now() + 45000).toISOString(), // 45 seconds later
          access_type: 'read',
          session_hash: 'session1',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      const correlations = await service.detectCrossCardCorrelation();

      expect(correlations.length).toBeGreaterThan(0);
      const temporalCorrelation = correlations.find(c => c.correlationType === 'temporal');
      expect(temporalCorrelation).toBeDefined();
    });

    it('should detect IP-based correlation patterns', async () => {
      const mockAccessPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip_hash_1',
          potential_correlation: false
        },
        {
          tracking_id: '2',
          context_hash: 'context2',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip_hash_1',
          potential_correlation: false
        },
        {
          tracking_id: '3',
          context_hash: 'context3',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip_hash_1',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      const correlations = await service.detectCrossCardCorrelation();

      const ipCorrelation = correlations.find(c => c.correlationType === 'ip_based');
      expect(ipCorrelation).toBeDefined();
      expect(ipCorrelation?.riskLevel).toBe('medium');
    });

    it('should detect behavioral correlation patterns', async () => {
      const mockAccessPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'query',
          query_signature: 'query_sig_1',
          potential_correlation: false
        },
        {
          tracking_id: '2',
          context_hash: 'context2',
          access_timestamp: new Date().toISOString(),
          access_type: 'query',
          query_signature: 'query_sig_1',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      const correlations = await service.detectCrossCardCorrelation();

      const behavioralCorrelation = correlations.find(c => c.correlationType === 'behavioral');
      expect(behavioralCorrelation).toBeDefined();
    });

    it('should handle empty access patterns', async () => {
      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: [], error: null });

      const correlations = await service.detectCrossCardCorrelation();

      expect(correlations).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      const correlations = await service.detectCrossCardCorrelation();

      expect(correlations).toEqual([]);
    });
  });

  describe('monitorAccessPatterns', () => {
    it('should retrieve recent access patterns', async () => {
      const mockPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockPatterns, error: null });

      const patterns = await service.monitorAccessPatterns();

      expect(patterns.length).toBe(1);
      expect(patterns[0].trackingId).toBe('1');
      expect(patterns[0].contextHash).toBe('context1');
    });

    it('should filter patterns by time window', async () => {
      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: [], error: null });

      await service.monitorAccessPatterns();

      expect(fromMock.gte).toHaveBeenCalledWith(
        'access_timestamp',
        expect.any(String)
      );
    });
  });

  describe('identifyPrivacyViolations', () => {
    it('should identify high-risk correlations as violations', async () => {
      const mockAccessPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        },
        {
          tracking_id: '2',
          context_hash: 'context2',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        },
        {
          tracking_id: '3',
          context_hash: 'context3',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        },
        {
          tracking_id: '4',
          context_hash: 'context4',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        },
        {
          tracking_id: '5',
          context_hash: 'context5',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        },
        {
          tracking_id: '6',
          context_hash: 'context6',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      const violations = await service.identifyPrivacyViolations();

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('high');
      expect(violations[0].violationType).toContain('cross_card');
    });

    it('should identify high confidence correlations as violations', async () => {
      const mockAccessPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'query',
          query_signature: 'sig1',
          potential_correlation: false
        },
        {
          tracking_id: '2',
          context_hash: 'context2',
          access_timestamp: new Date().toISOString(),
          access_type: 'query',
          query_signature: 'sig1',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      const violations = await service.identifyPrivacyViolations();

      expect(violations.some(v => v.violationType.includes('behavioral'))).toBe(true);
    });
  });

  describe('detectPotentialCorrelation', () => {
    it('should calculate overall risk level correctly', async () => {
      const mockAccessPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          session_hash: 'session1',
          potential_correlation: false
        },
        {
          tracking_id: '2',
          context_hash: 'context2',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          session_hash: 'session1',
          potential_correlation: false
        },
        {
          tracking_id: '3',
          context_hash: 'context3',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          session_hash: 'session1',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      const risk = await service.detectPotentialCorrelation(mockAccessPatterns);

      expect(risk.overallRiskLevel).toBeDefined();
      expect(risk.violationDetected).toBeDefined();
      expect(risk.mitigationRequired).toBeDefined();
      expect(risk.correlationTypes).toBeDefined();
    });

    it('should detect high risk when multiple correlations exist', async () => {
      // Create patterns that will trigger multiple correlation types
      const now = Date.now();
      const mockAccessPatterns = Array(6).fill(null).map((_, i) => ({
        tracking_id: `${i}`,
        context_hash: `context${i}`,
        access_timestamp: new Date(now + i * 1000).toISOString(), // Sequential timestamps
        access_type: 'read',
        ip_hash: 'same_ip', // Same IP for all
        session_hash: 'same_session', // Same session
        query_signature: 'same_query', // Same query pattern
        potential_correlation: false
      }));

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      const risk = await service.detectPotentialCorrelation(mockAccessPatterns);

      expect(risk.overallRiskLevel).toBe('high');
      expect(risk.violationDetected).toBe(true);
      expect(risk.mitigationRequired).toBe(true);
    });
  });

  describe('startCorrelationMonitoring', () => {
    it('should call callback when mitigation is required', async () => {
      jest.useFakeTimers();

      const mockCallback = jest.fn();
      const mockAccessPatterns = [
        {
          tracking_id: '1',
          context_hash: 'context1',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        },
        {
          tracking_id: '2',
          context_hash: 'context2',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        },
        {
          tracking_id: '3',
          context_hash: 'context3',
          access_timestamp: new Date().toISOString(),
          access_type: 'read',
          ip_hash: 'ip1',
          potential_correlation: false
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ data: mockAccessPatterns, error: null });
      fromMock.insert.mockResolvedValue({ error: null });

      await service.startCorrelationMonitoring(mockCallback);

      // Fast-forward 30 seconds
      jest.advanceTimersByTime(30000);

      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));

      expect(mockCallback).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle monitoring errors gracefully', async () => {
      jest.useFakeTimers();

      const mockCallback = jest.fn();
      const fromMock = mockSupabase.from();
      fromMock.order.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      await service.startCorrelationMonitoring(mockCallback);

      // Fast-forward 30 seconds
      jest.advanceTimersByTime(30000);

      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));

      // Callback should not be called on error
      expect(mockCallback).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});