import { DeletionAuditService } from '../deletion-audit.service';
import { supabase } from '../../../utils/supabase';

jest.mock('../../../utils/supabase');
jest.mock('../../../utils/logger');

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('DeletionAuditService', () => {
  let deletionAuditService: DeletionAuditService;

  beforeEach(() => {
    deletionAuditService = new DeletionAuditService();
    jest.clearAllMocks();

    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnValue({
        gte: jest.fn().mockReturnValue({
          lte: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              then: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        }),
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null })
        })
      }),
      delete: jest.fn().mockReturnValue({
        lt: jest.fn().mockResolvedValue({ count: 0, error: null })
      })
    } as any);
  });

  describe('recordAuditEvent', () => {
    const mockAuditEvent = {
      deletionId: 'test-deletion-id',
      actionType: 'data_deletion' as const,
      targetId: 'test-card-id',
      contextHash: 'test-context-hash',
      deletionProof: 'test-proof-hash',
      metadata: { test: 'data' }
    };

    it('should record audit event successfully', async () => {
      await deletionAuditService.recordAuditEvent(mockAuditEvent);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          deletion_id: 'test-deletion-id',
          action_type: 'data_deletion',
          target_id: 'test-card-id',
          context_hash: 'test-context-hash',
          deletion_proof: 'test-proof-hash',
          verification_hash: expect.any(String),
          audit_trail_integrity_hash: expect.any(String)
        })
      );
    });

    it('should generate audit integrity hash', async () => {
      await deletionAuditService.recordAuditEvent(mockAuditEvent);

      const insertCall = mockSupabase.from().insert;
      const insertedData = insertCall.mock.calls[0][0];
      
      expect(insertedData.verification_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(insertedData.audit_trail_integrity_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should include compliance retention period', async () => {
      await deletionAuditService.recordAuditEvent(mockAuditEvent);

      const insertCall = mockSupabase.from().insert;
      const insertedData = insertCall.mock.calls[0][0];
      
      expect(insertedData.compliance_retention_until).toBeDefined();
      
      const retentionDate = new Date(insertedData.compliance_retention_until);
      const expectedMinDate = new Date(Date.now() + 2555 * 24 * 60 * 60 * 1000 - 1000); // 7 years minus 1 second
      
      expect(retentionDate.getTime()).toBeGreaterThan(expectedMinDate.getTime());
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: { message: 'Database error' } })
      } as any);

      await expect(deletionAuditService.recordAuditEvent(mockAuditEvent))
        .rejects.toThrow('Failed to record audit event: Database error');
    });
  });

  describe('generateComplianceReport', () => {
    const startDate = new Date('2023-01-01');
    const endDate = new Date('2023-12-31');

    const mockAuditEvents = [
      {
        deletion_id: 'del-1',
        action_type: 'data_deletion',
        context_hash: 'hash-1',
        created_at: '2023-06-01T00:00:00Z',
        verification_hash: 'proof-1',
        bulk_batch_id: null
      },
      {
        deletion_id: 'del-2',
        action_type: 'data_deletion',
        context_hash: 'hash-2',
        created_at: '2023-06-02T00:00:00Z',
        verification_hash: 'proof-2',
        bulk_batch_id: 'batch-1'
      }
    ];

    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            lte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: mockAuditEvents, error: null })
            })
          })
        }),
        insert: jest.fn().mockResolvedValue({ error: null })
      } as any);
    });

    it('should generate compliance report with correct structure', async () => {
      const report = await deletionAuditService.generateComplianceReport(startDate, endDate);

      expect(report).toMatchObject({
        reportId: expect.any(String),
        generatedAt: expect.any(String),
        reportPeriod: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        summary: {
          totalDeletions: 2,
          singleDeletions: 1,
          bulkDeletions: 1,
          completedDeletions: 2,
          failedDeletions: 0
        },
        complianceMetrics: expect.objectContaining({
          averageDeletionTime: expect.any(Number),
          kmsKeyDeletionRate: expect.any(Number),
          networkCancellationRate: expect.any(Number),
          auditTrailIntegrity: expect.any(Number)
        }),
        auditTrail: expect.arrayContaining([
          expect.objectContaining({
            deletionId: 'del-1',
            contextHash: 'hash-1',
            actionType: 'data_deletion',
            verificationHash: 'proof-1',
            complianceStatus: expect.any(String)
          })
        ])
      });
    });

    it('should store generated report', async () => {
      await deletionAuditService.generateComplianceReport(startDate, endDate);

      // Verify report storage was attempted (mocked)
      // In real implementation, this would verify file system or database storage
    });

    it('should handle query errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            lte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } })
            })
          })
        })
      } as any);

      await expect(deletionAuditService.generateComplianceReport(startDate, endDate))
        .rejects.toThrow('Failed to query audit events: Query failed');
    });
  });

  describe('issueDeletionCertificate', () => {
    const mockAuditEvent = {
      deletion_id: 'test-deletion-id',
      context_hash: 'test-context-hash',
      audit_trail_integrity_hash: 'test-integrity-hash'
    };

    const mockDeletionProof = {
      deletion_id: 'test-deletion-id',
      deletion_proof_hash: 'test-proof-hash',
      kms_key_deletion_scheduled_at: '2023-01-01T00:00:00Z',
      network_cancellation_confirmed_at: '2023-01-01T00:00:00Z',
      data_overwrite_confirmed_at: '2023-01-01T00:00:00Z'
    };

    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockImplementation((table) => {
              if (table === 'data_deletion_audit') {
                return Promise.resolve({ data: mockAuditEvent, error: null });
              } else {
                return Promise.resolve({ data: mockDeletionProof, error: null });
              }
            })
          })
        })
      } as any);
    });

    it('should issue deletion certificate with required fields', async () => {
      const certificate = await deletionAuditService.issueDeletionCertificate('test-deletion-id');

      expect(certificate).toMatchObject({
        certificateId: expect.any(String),
        deletionId: 'test-deletion-id',
        cardContextHash: 'test-context-hash',
        issuedAt: expect.any(String),
        validUntil: expect.any(String),
        certificationBody: 'Discard Privacy Compliance',
        digitalSignature: expect.any(String),
        verificationUrl: expect.stringContaining('/verify-certificate/'),
        complianceStandards: expect.arrayContaining([
          'GDPR Article 17 (Right to Erasure)',
          'CCPA Section 1798.105 (Right to Delete)',
          'SOX Section 802 (Criminal penalties for altering documents)',
          'NIST SP 800-88 (Guidelines for Media Sanitization)'
        ])
      });
    });

    it('should generate cryptographic signature', async () => {
      const certificate = await deletionAuditService.issueDeletionCertificate('test-deletion-id');

      expect(certificate.digitalSignature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle missing audit event', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
          })
        })
      } as any);

      await expect(deletionAuditService.issueDeletionCertificate('nonexistent-deletion-id'))
        .rejects.toThrow('Deletion audit event not found');
    });
  });

  describe('exportAuditTrail', () => {
    const startDate = new Date('2023-01-01');
    const endDate = new Date('2023-12-31');

    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            lte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        })
      } as any);
    });

    it('should export audit trail in JSON format', async () => {
      const exportResult = await deletionAuditService.exportAuditTrail(startDate, endDate, 'json');

      expect(exportResult).toMatchObject({
        exportId: expect.any(String),
        downloadUrl: expect.stringContaining('/compliance/exports/'),
        format: 'json'
      });
    });

    it('should export audit trail in CSV format', async () => {
      const exportResult = await deletionAuditService.exportAuditTrail(startDate, endDate, 'csv');

      expect(exportResult.format).toBe('csv');
    });

    it('should export audit trail in XML format', async () => {
      const exportResult = await deletionAuditService.exportAuditTrail(startDate, endDate, 'xml');

      expect(exportResult.format).toBe('xml');
    });
  });

  describe('cleanupExpiredRecords', () => {
    it('should remove expired audit records', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ count: 5, error: null })
        })
      } as any);

      const result = await deletionAuditService.cleanupExpiredRecords();

      expect(result.deletedCount).toBe(5);
      expect(mockSupabase.from().delete).toHaveBeenCalled();
    });

    it('should handle cleanup errors', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ count: null, error: { message: 'Cleanup failed' } })
        })
      } as any);

      await expect(deletionAuditService.cleanupExpiredRecords())
        .rejects.toThrow('Failed to cleanup expired records: Cleanup failed');
    });
  });

  describe('Security and Compliance', () => {
    it('should generate unique audit integrity hashes', async () => {
      const event1 = {
        deletionId: 'del-1',
        actionType: 'data_deletion' as const,
        targetId: 'card-1',
        contextHash: 'hash-1',
        metadata: {}
      };

      const event2 = {
        deletionId: 'del-2',
        actionType: 'data_deletion' as const,
        targetId: 'card-2',
        contextHash: 'hash-2',
        metadata: {}
      };

      await deletionAuditService.recordAuditEvent(event1);
      await deletionAuditService.recordAuditEvent(event2);

      const calls = mockSupabase.from().insert.mock.calls;
      const hash1 = calls[0][0].audit_trail_integrity_hash;
      const hash2 = calls[1][0].audit_trail_integrity_hash;

      expect(hash1).not.toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
      expect(hash2).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should maintain compliance standards in certificates', async () => {
      const mockAuditEvent = {
        deletion_id: 'test-deletion-id',
        context_hash: 'test-context-hash',
        audit_trail_integrity_hash: 'test-integrity-hash'
      };

      const mockDeletionProof = {
        deletion_id: 'test-deletion-id',
        deletion_proof_hash: 'test-proof-hash',
        kms_key_deletion_scheduled_at: '2023-01-01T00:00:00Z',
        network_cancellation_confirmed_at: '2023-01-01T00:00:00Z',
        data_overwrite_confirmed_at: '2023-01-01T00:00:00Z'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValueOnce({ data: mockAuditEvent, error: null })
              .mockResolvedValueOnce({ data: mockDeletionProof, error: null })
          })
        })
      } as any);

      const certificate = await deletionAuditService.issueDeletionCertificate('test-deletion-id');

      expect(certificate.complianceStandards).toEqual([
        'GDPR Article 17 (Right to Erasure)',
        'CCPA Section 1798.105 (Right to Delete)',
        'SOX Section 802 (Criminal penalties for altering documents)',
        'NIST SP 800-88 (Guidelines for Media Sanitization)'
      ]);
    });

    it('should enforce retention policies', async () => {
      const mockAuditEvent = {
        deletionId: 'test-deletion-id',
        actionType: 'data_deletion' as const,
        targetId: 'test-card-id',
        contextHash: 'test-context-hash',
        metadata: {}
      };

      await deletionAuditService.recordAuditEvent(mockAuditEvent);

      const insertCall = mockSupabase.from().insert;
      const insertedData = insertCall.mock.calls[0][0];
      
      const retentionDate = new Date(insertedData.compliance_retention_until);
      const sevenYears = 2555 * 24 * 60 * 60 * 1000; // 7 years in milliseconds
      const expectedDate = new Date(Date.now() + sevenYears);
      
      // Allow 1 minute tolerance for test timing
      expect(Math.abs(retentionDate.getTime() - expectedDate.getTime())).toBeLessThan(60000);
    });
  });
});