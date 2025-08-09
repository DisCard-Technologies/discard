// Mock environment variables first
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.TRANSACTION_RETENTION_DAYS = '365';

import { DataRetentionService } from '../../../../services/transactions/data-retention.service';
import { supabase } from '../../../../utils/supabase';

// Mock dependencies
jest.mock('../../../../utils/supabase');
jest.mock('../../../../utils/logger');

// Mock node-cron module
jest.mock('node-cron', () => ({
  schedule: jest.fn()
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

// Get the mocked cron module
const mockCron = require('node-cron');

describe('DataRetentionService', () => {
  let service: DataRetentionService;
  let mockScheduledTask: any;

  beforeEach(() => {
    service = new DataRetentionService();
    mockScheduledTask = {
      stop: jest.fn()
    };
    mockCron.schedule.mockReturnValue(mockScheduledTask);
    jest.clearAllMocks();
  });

  afterEach(() => {
    service.stopRetentionJob();
  });

  describe('initializeRetentionJob', () => {
    it('should schedule daily retention job at 3 AM UTC', () => {
      service.initializeRetentionJob();

      expect(mockCron.schedule).toHaveBeenCalledWith(
        '0 3 * * *',
        expect.any(Function)
      );
    });

    it('should stop existing job when called multiple times', () => {
      // First call creates the job
      service.initializeRetentionJob();
      
      // Second call should stop the existing job
      const firstTask = mockScheduledTask;
      service.initializeRetentionJob();

      expect(firstTask.stop).toHaveBeenCalled();
    });
  });

  describe('enforceRetentionPolicies', () => {
    const mockExpiredTransactions = [
      {
        transaction_id: 'tx-1',
        card_context_hash: 'context-1'
      },
      {
        transaction_id: 'tx-2', 
        card_context_hash: 'context-1'
      },
      {
        transaction_id: 'tx-3',
        card_context_hash: 'context-2'
      }
    ];

    it('should process expired transactions and group by card context', async () => {
      // Mock expired transactions query
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockExpiredTransactions,
          error: null
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockTransactionQuery as any);

      // Mock card KMS key lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { kms_key_id: 'kms-key-1' }
        })
      };

      // Mock KMS deletion schedule insert
      const mockKMSInsertQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      // Mock compliance archiving
      const mockArchiveInsertQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      // Mock transaction deletion
      const mockDeleteQuery = {
        delete: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      // Mock audit log insert
      const mockAuditInsertQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      // Setup mocks for multiple calls
      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        switch (table) {
          case 'cards':
            return mockCardQuery as any;
          case 'kms_deletion_schedule':
            return mockKMSInsertQuery as any;
          case 'compliance_archive':
            return mockArchiveInsertQuery as any;
          case 'payment_transactions':
            return mockDeleteQuery as any;
          case 'data_deletion_audit':
            return mockAuditInsertQuery as any;
          default:
            return mockTransactionQuery as any;
        }
      });

      await service.enforceRetentionPolicies();

      // Verify expired transactions were queried
      expect(mockTransactionQuery.lt).toHaveBeenCalled();

      // Verify transactions were grouped by card context and processed
      expect(mockSupabase.from).toHaveBeenCalledWith('cards');
      expect(mockSupabase.from).toHaveBeenCalledWith('kms_deletion_schedule');
      expect(mockSupabase.from).toHaveBeenCalledWith('compliance_archive');
      expect(mockSupabase.from).toHaveBeenCalledWith('payment_transactions');
      expect(mockSupabase.from).toHaveBeenCalledWith('data_deletion_audit');
    });

    it('should handle no expired transactions gracefully', async () => {
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockTransactionQuery as any);

      await service.enforceRetentionPolicies();

      // Should not proceed to deletion if no expired transactions
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });

    it('should handle database errors in expired transaction query', async () => {
      const mockTransactionQuery = {
        select: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Database error')
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockTransactionQuery as any);

      await expect(service.enforceRetentionPolicies()).rejects.toThrow('Database error');
    });
  });

  describe('cryptographicallyDeleteCardData', () => {
    const mockTransactions = [
      { transaction_id: 'tx-1' },
      { transaction_id: 'tx-2' }
    ];

    it('should schedule KMS key deletion and generate deletion proof', async () => {
      // Mock card KMS key lookup
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { kms_key_id: 'kms-key-123' }
        })
      };

      // Mock KMS deletion schedule insert
      const mockKMSInsertQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      // Mock compliance archiving
      const mockArchiveInsertQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      // Mock transaction deletion
      const mockDeleteQuery = {
        delete: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      // Mock audit log insert
      const mockAuditInsertQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        switch (table) {
          case 'cards':
            return mockCardQuery as any;
          case 'kms_deletion_schedule':
            return mockKMSInsertQuery as any;
          case 'compliance_archive':
            return mockArchiveInsertQuery as any;
          case 'payment_transactions':
            return mockDeleteQuery as any;
          case 'data_deletion_audit':
            return mockAuditInsertQuery as any;
          default:
            return mockCardQuery as any;
        }
      });

      const result = await service.cryptographicallyDeleteCardData(
        'context-hash-123',
        mockTransactions
      );

      // Verify deletion proof structure
      expect(result).toEqual(expect.objectContaining({
        deletionId: expect.any(String),
        contextHash: 'context-hash-123',
        recordCount: 2,
        deletionTimestamp: expect.any(String),
        proofHash: expect.any(String)
      }));

      // Verify KMS key deletion was scheduled
      expect(mockKMSInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          kms_key_id: 'kms-key-123',
          scheduled_deletion_date: expect.any(Date),
          status: 'pending'
        })
      );

      // Verify compliance data was archived
      expect(mockArchiveInsertQuery.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            transaction_id: 'tx-1',
            compliance_ref: expect.any(String),
            archived_at: expect.any(String)
          })
        ])
      );

      // Verify transactions were deleted
      expect(mockDeleteQuery.in).toHaveBeenCalledWith('transaction_id', ['tx-1', 'tx-2']);

      // Verify audit log was updated
      expect(mockAuditInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          deletion_id: result.deletionId,
          context_hash: 'context-hash-123',
          deletion_proof: result.proofHash,
          verification_hash: result.proofHash,
          metadata: {
            record_count: 2
          }
        })
      );
    });

    it('should handle missing KMS key gracefully', async () => {
      const mockCardQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockCardQuery as any);

      const result = await service.cryptographicallyDeleteCardData(
        'context-hash-no-key',
        mockTransactions
      );

      // Should still generate deletion proof even without KMS key
      expect(result).toEqual(expect.objectContaining({
        contextHash: 'context-hash-no-key',
        recordCount: 2,
        proofHash: expect.any(String)
      }));
    });
  });

  describe('extendRetention', () => {
    it('should extend retention period for specific transaction', async () => {
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      const mockAuditInsertQuery = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      mockSupabase.from.mockReturnValueOnce(mockUpdateQuery as any);
      mockSupabase.from.mockReturnValueOnce(mockAuditInsertQuery as any);

      const result = await service.extendRetention('tx-123', 30);

      expect(result).toBe(true);

      // Verify retention was extended
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        retention_until: expect.any(String)
      });
      expect(mockUpdateQuery.eq).toHaveBeenCalledWith('transaction_id', 'tx-123');

      // Verify audit log was updated
      expect(mockAuditInsertQuery.insert).toHaveBeenCalledWith({
        action_type: 'retention_extended',
        target_id: 'tx-123',
        metadata: {
          additional_days: 30,
          new_retention_date: expect.any(String)
        }
      });
    });

    it('should return false on database errors', async () => {
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Database error' } 
        })
      };

      mockSupabase.from.mockReturnValueOnce(mockUpdateQuery as any);

      const result = await service.extendRetention('tx-123', 30);

      expect(result).toBe(false);
    });
  });

  describe('retention configuration', () => {
    it('should use default retention periods', () => {
      const service = new DataRetentionService();
      
      // Access private property for testing
      const config = (service as any).retentionConfig;
      
      expect(config.standardRetentionDays).toBe(365);
      expect(config.complianceRetentionDays).toBe(2555);
    });

    it('should use environment variable for standard retention', () => {
      process.env.TRANSACTION_RETENTION_DAYS = '90';
      
      const service = new DataRetentionService();
      const config = (service as any).retentionConfig;
      
      expect(config.standardRetentionDays).toBe(90);
      
      // Reset
      process.env.TRANSACTION_RETENTION_DAYS = '365';
    });
  });
});