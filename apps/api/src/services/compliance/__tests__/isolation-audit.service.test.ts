import { IsolationAuditService } from '../isolation-audit.service';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger');

describe('IsolationAuditService', () => {
  let service: IsolationAuditService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn(() => ({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        like: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
      })),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new IsolationAuditService('http://test.supabase.co', 'test-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logAuditEvent', () => {
    it('should successfully log audit event', async () => {
      const event = {
        eventType: 'data_access' as const,
        contextHash: 'test-context',
        accessPattern: 'read_transaction',
        timestamp: new Date(),
        violationDetected: false,
        metadata: { source: 'test' }
      };

      const fromMock = mockSupabase.from();
      fromMock.insert.mockResolvedValueOnce({ error: null });

      await service.logAuditEvent(event);

      expect(fromMock.insert).toHaveBeenCalledWith({
        audit_event_type: 'isolation_data_access',
        isolation_event_data: {
          contextHash: event.contextHash,
          accessPattern: event.accessPattern,
          violationDetected: event.violationDetected,
          metadata: event.metadata
        },
        correlation_detection_result: event.violationDetected,
        event_timestamp: event.timestamp.toISOString(),
        retention_period_years: 7
      });
    });

    it('should handle violations and trigger alerts', async () => {
      const violationEvent = {
        eventType: 'correlation_attempt' as const,
        contextHash: 'test-context',
        accessPattern: 'cross_context_query',
        timestamp: new Date(),
        violationDetected: true,
        metadata: { severity: 'high' }
      };

      const fromMock = mockSupabase.from();
      fromMock.insert.mockResolvedValueOnce({ error: null });

      await service.logAuditEvent(violationEvent);

      expect(fromMock.insert).toHaveBeenCalled();
    });

    it('should throw error when database insert fails', async () => {
      const event = {
        eventType: 'data_access' as const,
        contextHash: 'test-context',
        accessPattern: 'test',
        timestamp: new Date(),
        violationDetected: false
      };

      const fromMock = mockSupabase.from();
      fromMock.insert.mockResolvedValueOnce({ 
        error: { message: 'Database error' } 
      });

      await expect(service.logAuditEvent(event))
        .rejects.toThrow();
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate isolation verification report', async () => {
      const reportType = 'isolation_verification';
      const period = {
        start: new Date(Date.now() - 86400000),
        end: new Date()
      };

      const mockAuditData = [
        {
          audit_event_type: 'isolation_data_access',
          correlation_detection_result: false,
          event_timestamp: new Date().toISOString()
        },
        {
          audit_event_type: 'isolation_context_switch',
          correlation_detection_result: false,
          event_timestamp: new Date().toISOString()
        }
      ];

      const mockBreaches = [];

      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValueOnce({ data: mockAuditData, error: null });
      fromMock.lte.mockResolvedValueOnce({ data: mockBreaches, error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const report = await service.generateComplianceReport(reportType, period);

      expect(report.reportType).toBe(reportType);
      expect(report.isolationMaintained).toBe(true);
      expect(report.violationCount).toBe(0);
      expect(report.complianceScore).toBeGreaterThan(99);
      expect(report.details.metrics.totalAccessAttempts).toBe(2);
      expect(report.details.metrics.complianceRate).toBe(1);
    });

    it('should calculate correct compliance score with violations', async () => {
      const reportType = 'privacy_audit';
      const period = {
        start: new Date(Date.now() - 86400000),
        end: new Date()
      };

      const mockAuditData = [
        {
          audit_event_type: 'isolation_data_access',
          correlation_detection_result: false,
          event_timestamp: new Date().toISOString()
        },
        {
          audit_event_type: 'isolation_correlation_attempt',
          correlation_detection_result: true,
          event_timestamp: new Date().toISOString()
        }
      ];

      const mockBreaches = [
        {
          card_context_hash: 'context1',
          privacy_violation_detected: true
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValueOnce({ data: mockAuditData, error: null });
      fromMock.lte.mockResolvedValueOnce({ data: mockBreaches, error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const report = await service.generateComplianceReport(reportType, period);

      expect(report.isolationMaintained).toBe(false);
      expect(report.violationCount).toBe(1);
      expect(report.complianceScore).toBeLessThan(99);
      expect(report.details.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle database errors gracefully', async () => {
      const reportType = 'regulatory_compliance';
      const period = {
        start: new Date(Date.now() - 86400000),
        end: new Date()
      };

      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      await expect(service.generateComplianceReport(reportType, period))
        .rejects.toThrow();
    });
  });

  describe('monitorInternalAccess', () => {
    it('should authorize valid employee access', async () => {
      const employeeId = 'emp123';
      const cardContextHash = 'context123';

      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ 
        data: { 
          employee_id: 'hashed_emp123',
          access_granted: true,
          revoked_at: null
        }, 
        error: null 
      });
      fromMock.select.mockResolvedValueOnce({ data: [], error: null });
      fromMock.update.mockResolvedValueOnce({ error: null });

      const authorized = await service.monitorInternalAccess(employeeId, cardContextHash);

      expect(authorized).toBe(true);
      expect(fromMock.update).toHaveBeenCalledWith({ 
        accessed_at: expect.any(String) 
      });
    });

    it('should deny unauthorized access', async () => {
      const employeeId = 'emp123';
      const cardContextHash = 'context123';

      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Not found' } 
      });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const authorized = await service.monitorInternalAccess(employeeId, cardContextHash);

      expect(authorized).toBe(false);
      expect(fromMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          audit_event_type: 'isolation_data_access',
          isolation_event_data: expect.objectContaining({
            accessPattern: 'unauthorized_internal_access'
          })
        })
      );
    });

    it('should detect suspicious access patterns', async () => {
      const employeeId = 'emp123';
      const cardContextHash = 'context123';

      // Mock authorized access
      const fromMock = mockSupabase.from();
      fromMock.single.mockResolvedValueOnce({ 
        data: { access_granted: true, revoked_at: null }, 
        error: null 
      });

      // Mock multiple recent accesses (suspicious pattern)
      const multipleAccesses = Array(6).fill(null).map((_, i) => ({
        card_context_hash: `context${i}`,
        accessed_at: new Date().toISOString()
      }));

      fromMock.select.mockResolvedValueOnce({ data: multipleAccesses, error: null });
      fromMock.update
        .mockResolvedValueOnce({ error: null }) // Log access
        .mockResolvedValueOnce({ error: null }); // Mark suspicious

      const authorized = await service.monitorInternalAccess(employeeId, cardContextHash);

      expect(authorized).toBe(true);
      expect(fromMock.update).toHaveBeenCalledWith({ 
        suspicious_activity_detected: true 
      });
    });
  });

  describe('verifyContinuousIsolation', () => {
    it('should verify isolation when no violations exist', async () => {
      const fromMock = mockSupabase.from();
      fromMock.gte.mockResolvedValueOnce({ data: [], error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const result = await service.verifyContinuousIsolation();

      expect(result.verified).toBe(true);
      expect(result.violations).toBe(0);
      expect(result.lastCheck).toBeInstanceOf(Date);
      expect(result.nextCheck).toBeInstanceOf(Date);
    });

    it('should detect violations', async () => {
      const mockViolations = [
        {
          card_context_hash: 'context1',
          privacy_violation_detected: true
        },
        {
          card_context_hash: 'context2',
          privacy_violation_detected: true
        }
      ];

      const fromMock = mockSupabase.from();
      fromMock.gte.mockResolvedValueOnce({ data: mockViolations, error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const result = await service.verifyContinuousIsolation();

      expect(result.verified).toBe(false);
      expect(result.violations).toBe(2);
    });
  });

  describe('generateQuarterlyPrivacyAudit', () => {
    it('should generate quarterly audit report', async () => {
      const fromMock = mockSupabase.from();
      fromMock.lte.mockResolvedValueOnce({ data: [], error: null });
      fromMock.lte.mockResolvedValueOnce({ data: [], error: null });
      fromMock.insert.mockResolvedValueOnce({ error: null });

      const report = await service.generateQuarterlyPrivacyAudit();

      expect(report.reportType).toBe('privacy_audit');
      expect(report.period.start).toBeInstanceOf(Date);
      expect(report.period.end).toBeInstanceOf(Date);
      expect(report.details.metrics).toBeDefined();
    });
  });
});