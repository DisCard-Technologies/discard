import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface DataRetentionSchedule {
  scheduleId: string;
  dataCategory: 'kyc_records' | 'compliance_events' | 'sar_reports' | 'privacy_requests' | 'audit_logs' | 'transaction_data';
  retentionPeriodDays: number;
  legalBasisForRetention: string;
  automaticDeletion: boolean;
  deletionMethod: 'soft_delete' | 'hard_delete' | 'cryptographic_deletion' | 'anonymization';
  approvalRequiredForDeletion: boolean;
  regulatoryRequirements: Record<string, any>;
  exceptions: Record<string, any>;
  lastPolicyReview: Date;
  nextPolicyReview: Date;
  policyVersion: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataDeletionRequest {
  requestId: string;
  userContextHash: string;
  requestType: 'user_requested' | 'legal_requirement' | 'data_breach' | 'account_closure' | 'retention_expired';
  dataCategories: string[];
  deletionMethod: 'soft_delete' | 'hard_delete' | 'cryptographic_deletion';
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  scheduledDeletionDate: Date;
  completedAt?: Date;
  verificationHash?: string;
  auditTrail: DeletionAuditEvent[];
}

export interface DeletionAuditEvent {
  eventId: string;
  timestamp: Date;
  eventType: 'deletion_requested' | 'deletion_approved' | 'deletion_started' | 'deletion_completed' | 'verification_performed';
  performedBy: string;
  details: Record<string, any>;
  cryptographicProof?: string;
}

export interface DataExportRequest {
  exportId: string;
  userContextHash: string;
  requestType: 'gdpr_access' | 'ccpa_access' | 'data_portability' | 'legal_discovery';
  dataCategories: string[];
  exportFormat: 'json' | 'csv' | 'xml' | 'pdf';
  requestedBy: string;
  approvedBy?: string;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  encryptionKey?: string;
}

export interface CryptographicDeletionResult {
  success: boolean;
  deletionId: string;
  cryptographicProof: string;
  deletedDataHashes: string[];
  verificationHash: string;
  deletionTimestamp: Date;
  keyDestructionProof?: string;
}

export class DataRetentionService {
  private supabase: SupabaseClient;
  private isolationService: TransactionIsolationService;
  
  // Retention periods by category (in days)
  private readonly DEFAULT_RETENTION_PERIODS = {
    kyc_records: 1825, // 5 years
    compliance_events: 2555, // 7 years
    sar_reports: 1825, // 5 years
    privacy_requests: 1095, // 3 years
    audit_logs: 2555, // 7 years
    transaction_data: 2555 // 7 years
  };

  // Grace periods for different deletion types (in days)
  private readonly GRACE_PERIODS = {
    user_requested: 30, // 30 days to reverse user deletion
    legal_requirement: 0, // Immediate
    data_breach: 0, // Immediate
    account_closure: 90, // 90 days for account recovery
    retention_expired: 30 // 30 days for retention policy changes
  };

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
  }

  /**
   * Schedule automated data deletion based on retention policies
   */
  async scheduleDataDeletion(
    userContextHash: string,
    dataCategories: string[],
    requestType: DataDeletionRequest['requestType'],
    reason: string,
    requestedBy: string,
    forceDeletionDate?: Date
  ): Promise<DataDeletionRequest> {
    try {
      const requestId = crypto.randomUUID();
      const gracePeriod = this.GRACE_PERIODS[requestType];
      const scheduledDeletionDate = forceDeletionDate || new Date(Date.now() + (gracePeriod * 24 * 60 * 60 * 1000));

      // Create deletion request
      const deletionRequest: DataDeletionRequest = {
        requestId,
        userContextHash,
        requestType,
        dataCategories,
        deletionMethod: this.determineDeletionMethod(dataCategories, requestType),
        reason,
        requestedBy,
        scheduledDeletionDate,
        auditTrail: [{
          eventId: crypto.randomUUID(),
          timestamp: new Date(),
          eventType: 'deletion_requested',
          performedBy: requestedBy,
          details: { reason, dataCategories, requestType }
        }]
      };

      // Store deletion request
      await this.storeDeletionRequest(deletionRequest);

      // If immediate deletion required, execute now
      if (gracePeriod === 0) {
        await this.executeDeletion(requestId);
      }

      // Log audit trail
      await this.logDataRetentionEvent('deletion_scheduled', requestId, userContextHash, {
        dataCategories,
        scheduledDate: scheduledDeletionDate.toISOString(),
        requestType
      });

      return deletionRequest;
    } catch (error) {
      logger.error('Error scheduling data deletion:', { error, userContextHash });
      throw error;
    }
  }

  /**
   * Execute scheduled data deletion
   */
  async executeDeletion(requestId: string): Promise<CryptographicDeletionResult> {
    try {
      // Get deletion request
      const deletionRequest = await this.getDeletionRequest(requestId);
      if (!deletionRequest) {
        throw new Error('Deletion request not found');
      }

      // Verify deletion is scheduled for now or past
      if (deletionRequest.scheduledDeletionDate > new Date()) {
        throw new Error('Deletion not yet scheduled to execute');
      }

      // Perform isolation-aware deletion
      const deletionResult = await this.performIsolationAwareDeletion(deletionRequest);

      // Update deletion request as completed
      await this.markDeletionCompleted(requestId, deletionResult);

      // Add audit event
      const auditEvent: DeletionAuditEvent = {
        eventId: crypto.randomUUID(),
        timestamp: new Date(),
        eventType: 'deletion_completed',
        performedBy: 'system',
        details: {
          deletedRecords: deletionResult.deletedDataHashes.length,
          verificationHash: deletionResult.verificationHash
        },
        cryptographicProof: deletionResult.cryptographicProof
      };

      await this.addAuditEvent(requestId, auditEvent);

      return deletionResult;
    } catch (error) {
      logger.error('Error executing deletion:', { error, requestId });
      throw error;
    }
  }

  /**
   * Perform cryptographic deletion with privacy preservation
   */
  async performCryptographicDeletion(
    userContextHash: string,
    dataCategories: string[]
  ): Promise<CryptographicDeletionResult> {
    try {
      const deletionId = crypto.randomUUID();
      const deletedDataHashes: string[] = [];

      // For each data category, perform cryptographic deletion
      for (const category of dataCategories) {
        const categoryHashes = await this.deleteCategoryData(userContextHash, category);
        deletedDataHashes.push(...categoryHashes);
      }

      // Generate cryptographic proof of deletion
      const proofData = {
        deletionId,
        userContextHash,
        dataCategories,
        deletedHashes: deletedDataHashes,
        timestamp: Date.now()
      };

      const cryptographicProof = crypto
        .createHash('sha256')
        .update(JSON.stringify(proofData))
        .digest('hex');

      // Generate verification hash
      const verificationHash = crypto
        .createHash('sha256')
        .update(`${deletionId}:${cryptographicProof}:${deletedDataHashes.join(':')}`)
        .digest('hex');

      const result: CryptographicDeletionResult = {
        success: true,
        deletionId,
        cryptographicProof,
        deletedDataHashes,
        verificationHash,
        deletionTimestamp: new Date()
      };

      // Log the cryptographic deletion
      await this.logDataRetentionEvent('cryptographic_deletion', deletionId, userContextHash, {
        dataCategories,
        deletedRecordCount: deletedDataHashes.length,
        verificationHash
      });

      return result;
    } catch (error) {
      logger.error('Error performing cryptographic deletion:', { error, userContextHash });
      return {
        success: false,
        deletionId: crypto.randomUUID(),
        cryptographicProof: '',
        deletedDataHashes: [],
        verificationHash: '',
        deletionTimestamp: new Date()
      };
    }
  }

  /**
   * Export user data for portability or access requests
   */
  async exportUserData(
    userContextHash: string,
    requestType: DataExportRequest['requestType'],
    dataCategories: string[],
    exportFormat: DataExportRequest['exportFormat'],
    requestedBy: string
  ): Promise<DataExportRequest> {
    try {
      const exportId = crypto.randomUUID();
      
      // Create export request
      const exportRequest: DataExportRequest = {
        exportId,
        userContextHash,
        requestType,
        dataCategories,
        exportFormat,
        requestedBy,
        completedAt: undefined,
        downloadUrl: undefined,
        expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)), // 7 days expiry
        encryptionKey: crypto.randomBytes(32).toString('hex')
      };

      // Store export request
      await this.storeExportRequest(exportRequest);

      // Generate export data
      const exportData = await this.generateExportData(userContextHash, dataCategories);
      
      // Encrypt export data
      const encryptedExport = await this.encryptExportData(exportData, exportRequest.encryptionKey);
      
      // Store encrypted export and generate download URL
      const downloadUrl = await this.storeEncryptedExport(exportId, encryptedExport, exportFormat);
      
      // Update export request with completion
      exportRequest.completedAt = new Date();
      exportRequest.downloadUrl = downloadUrl;
      
      await this.updateExportRequest(exportRequest);

      // Log export activity
      await this.logDataRetentionEvent('data_export_completed', exportId, userContextHash, {
        dataCategories,
        exportFormat,
        requestType
      });

      return exportRequest;
    } catch (error) {
      logger.error('Error exporting user data:', { error, userContextHash });
      throw error;
    }
  }

  /**
   * Get active retention schedules
   */
  async getRetentionSchedules(): Promise<DataRetentionSchedule[]> {
    try {
      const { data, error } = await this.supabase
        .from('data_retention_schedules')
        .select('*')
        .eq('active', true)
        .order('data_category');

      if (error) {
        throw error;
      }

      return (data || []).map(schedule => this.convertToRetentionSchedule(schedule));
    } catch (error) {
      logger.error('Error getting retention schedules:', error);
      throw error;
    }
  }

  /**
   * Update retention schedule
   */
  async updateRetentionSchedule(
    dataCategory: string,
    updates: Partial<DataRetentionSchedule>,
    updatedBy: string
  ): Promise<DataRetentionSchedule> {
    try {
      const { data, error } = await this.supabase
        .from('data_retention_schedules')
        .update({
          ...updates,
          last_policy_review: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('data_category', dataCategory)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      // Log policy update
      await this.logDataRetentionEvent('retention_policy_updated', null, null, {
        dataCategory,
        updates,
        updatedBy
      });

      return this.convertToRetentionSchedule(data);
    } catch (error) {
      logger.error('Error updating retention schedule:', { error, dataCategory });
      throw error;
    }
  }

  /**
   * Cleanup expired data based on retention policies
   */
  async cleanupExpiredData(): Promise<{
    processedCategories: string[];
    totalRecordsDeleted: number;
    errors: string[];
  }> {
    try {
      const schedules = await this.getRetentionSchedules();
      const results = {
        processedCategories: [] as string[],
        totalRecordsDeleted: 0,
        errors: [] as string[]
      };

      for (const schedule of schedules) {
        if (schedule.automaticDeletion) {
          try {
            const deletedCount = await this.cleanupCategoryData(schedule);
            results.processedCategories.push(schedule.dataCategory);
            results.totalRecordsDeleted += deletedCount;
          } catch (error) {
            const errorMessage = `Failed to cleanup ${schedule.dataCategory}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            results.errors.push(errorMessage);
            logger.error('Category cleanup failed:', { error, category: schedule.dataCategory });
          }
        }
      }

      // Log cleanup summary
      await this.logDataRetentionEvent('automated_cleanup_completed', null, null, {
        processedCategories: results.processedCategories,
        totalRecordsDeleted: results.totalRecordsDeleted,
        errors: results.errors
      });

      return results;
    } catch (error) {
      logger.error('Error in cleanup expired data:', error);
      throw error;
    }
  }

  /**
   * Verify data deletion integrity
   */
  async verifyDeletionIntegrity(deletionId: string): Promise<{
    verified: boolean;
    verificationProof: string;
    integrityChecks: Record<string, boolean>;
    errors?: string[];
  }> {
    try {
      // Get deletion record
      const deletionRequest = await this.getDeletionRequest(deletionId);
      if (!deletionRequest || !deletionRequest.verificationHash) {
        return {
          verified: false,
          verificationProof: '',
          integrityChecks: {},
          errors: ['Deletion record not found']
        };
      }

      const integrityChecks: Record<string, boolean> = {};

      // Verify data is actually deleted
      for (const category of deletionRequest.dataCategories) {
        const dataExists = await this.checkCategoryDataExists(deletionRequest.userContextHash, category);
        integrityChecks[`${category}_deleted`] = !dataExists;
      }

      // Verify cryptographic proof
      const proofValid = await this.verifyCryptographicProof(deletionRequest);
      integrityChecks.cryptographic_proof_valid = proofValid;

      // Generate verification proof
      const verificationData = {
        deletionId,
        verifiedAt: Date.now(),
        integrityChecks,
        verifier: 'system'
      };

      const verificationProof = crypto
        .createHash('sha256')
        .update(JSON.stringify(verificationData))
        .digest('hex');

      const allChecksPass = Object.values(integrityChecks).every(check => check);

      // Log verification
      await this.logDataRetentionEvent('deletion_integrity_verified', deletionId, deletionRequest.userContextHash, {
        verified: allChecksPass,
        integrityChecks,
        verificationProof
      });

      return {
        verified: allChecksPass,
        verificationProof,
        integrityChecks,
        errors: allChecksPass ? undefined : ['One or more integrity checks failed']
      };
    } catch (error) {
      logger.error('Error verifying deletion integrity:', { error, deletionId });
      return {
        verified: false,
        verificationProof: '',
        integrityChecks: {},
        errors: [error instanceof Error ? error.message : 'Verification failed']
      };
    }
  }

  /**
   * Perform isolation-aware deletion
   */
  private async performIsolationAwareDeletion(deletionRequest: DataDeletionRequest): Promise<CryptographicDeletionResult> {
    // Enforce isolation context
    await this.isolationService.enforceTransactionIsolation(deletionRequest.userContextHash);
    
    // Perform cryptographic deletion within isolation boundaries
    return await this.performCryptographicDeletion(
      deletionRequest.userContextHash,
      deletionRequest.dataCategories
    );
  }

  /**
   * Delete category data and return hashes of deleted records
   */
  private async deleteCategoryData(userContextHash: string, category: string): Promise<string[]> {
    const deletedHashes: string[] = [];
    const tableName = this.getCategoryTableName(category);

    if (!tableName) {
      return deletedHashes;
    }

    try {
      // Get records to be deleted first (for hash generation)
      const { data: records, error: selectError } = await this.supabase
        .from(tableName)
        .select('*')
        .eq('user_context_hash', userContextHash);

      if (selectError) {
        throw selectError;
      }

      // Generate hashes for records being deleted
      if (records && records.length > 0) {
        for (const record of records) {
          const recordHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(record))
            .digest('hex');
          deletedHashes.push(recordHash);
        }

        // Perform deletion
        const { error: deleteError } = await this.supabase
          .from(tableName)
          .delete()
          .eq('user_context_hash', userContextHash);

        if (deleteError) {
          throw deleteError;
        }
      }

      return deletedHashes;
    } catch (error) {
      logger.error(`Error deleting ${category} data:`, { error, userContextHash });
      return [];
    }
  }

  /**
   * Get table name for data category
   */
  private getCategoryTableName(category: string): string | null {
    const tableMap: Record<string, string> = {
      kyc_records: 'kyc_records',
      compliance_events: 'compliance_events',
      sar_reports: 'suspicious_activity_reports',
      privacy_requests: 'privacy_rights_requests',
      audit_logs: 'compliance_audit'
    };

    return tableMap[category] || null;
  }

  /**
   * Determine appropriate deletion method based on data category and request type
   */
  private determineDeletionMethod(
    dataCategories: string[],
    requestType: DataDeletionRequest['requestType']
  ): DataDeletionRequest['deletionMethod'] {
    // High-security categories always use cryptographic deletion
    const highSecurityCategories = ['kyc_records', 'compliance_events', 'sar_reports'];
    
    if (dataCategories.some(cat => highSecurityCategories.includes(cat))) {
      return 'cryptographic_deletion';
    }

    // Legal requirements often need hard deletion
    if (requestType === 'legal_requirement' || requestType === 'data_breach') {
      return 'hard_delete';
    }

    // Default to soft delete for user requests (allows recovery)
    return 'soft_delete';
  }

  /**
   * Store deletion request in database
   */
  private async storeDeletionRequest(deletionRequest: DataDeletionRequest): Promise<void> {
    // Implementation would store to a deletion_requests table
    // For now, just log the request
    logger.info('Deletion request stored:', {
      requestId: deletionRequest.requestId,
      userContextHash: deletionRequest.userContextHash,
      dataCategories: deletionRequest.dataCategories
    });
  }

  /**
   * Get deletion request from database
   */
  private async getDeletionRequest(requestId: string): Promise<DataDeletionRequest | null> {
    // Implementation would retrieve from deletion_requests table
    // For now, return null
    return null;
  }

  /**
   * Mark deletion as completed
   */
  private async markDeletionCompleted(requestId: string, deletionResult: CryptographicDeletionResult): Promise<void> {
    // Implementation would update deletion_requests table
    logger.info('Deletion marked as completed:', {
      requestId,
      deletionId: deletionResult.deletionId,
      success: deletionResult.success
    });
  }

  /**
   * Add audit event to deletion request
   */
  private async addAuditEvent(requestId: string, auditEvent: DeletionAuditEvent): Promise<void> {
    // Implementation would add to deletion request audit trail
    logger.info('Audit event added:', {
      requestId,
      eventType: auditEvent.eventType,
      eventId: auditEvent.eventId
    });
  }

  /**
   * Cleanup category data based on retention schedule
   */
  private async cleanupCategoryData(schedule: DataRetentionSchedule): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - schedule.retentionPeriodDays);

    const tableName = this.getCategoryTableName(schedule.dataCategory);
    if (!tableName) {
      return 0;
    }

    const { data, error } = await this.supabase
      .from(tableName)
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('count', { head: true });

    if (error) {
      throw error;
    }

    return data ? (data as any).count : 0;
  }

  /**
   * Check if category data exists for user
   */
  private async checkCategoryDataExists(userContextHash: string, category: string): Promise<boolean> {
    const tableName = this.getCategoryTableName(category);
    if (!tableName) {
      return false;
    }

    const { count, error } = await this.supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .eq('user_context_hash', userContextHash);

    if (error) {
      logger.error('Error checking data existence:', error);
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Generate export data for user
   */
  private async generateExportData(userContextHash: string, dataCategories: string[]): Promise<Record<string, any>> {
    const exportData: Record<string, any> = {};

    for (const category of dataCategories) {
      const tableName = this.getCategoryTableName(category);
      if (tableName) {
        const { data, error } = await this.supabase
          .from(tableName)
          .select('*')
          .eq('user_context_hash', userContextHash);

        if (!error && data) {
          exportData[category] = data;
        }
      }
    }

    return exportData;
  }

  /**
   * Encrypt export data
   */
  private async encryptExportData(data: Record<string, any>, encryptionKey: string): Promise<string> {
    const dataString = JSON.stringify(data);
    const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    let encrypted = cipher.update(dataString, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Store encrypted export and return download URL
   */
  private async storeEncryptedExport(exportId: string, encryptedData: string, format: string): Promise<string> {
    // In production, this would store to secure file storage (S3, etc.)
    // For now, return a mock URL
    return `https://secure-downloads.discard.app/exports/${exportId}.${format}`;
  }

  /**
   * Store export request
   */
  private async storeExportRequest(exportRequest: DataExportRequest): Promise<void> {
    // Implementation would store to export_requests table
    logger.info('Export request stored:', {
      exportId: exportRequest.exportId,
      userContextHash: exportRequest.userContextHash
    });
  }

  /**
   * Update export request
   */
  private async updateExportRequest(exportRequest: DataExportRequest): Promise<void> {
    // Implementation would update export_requests table
    logger.info('Export request updated:', {
      exportId: exportRequest.exportId,
      completed: !!exportRequest.completedAt
    });
  }

  /**
   * Verify cryptographic proof of deletion
   */
  private async verifyCryptographicProof(deletionRequest: DataDeletionRequest): Promise<boolean> {
    // Implementation would verify the cryptographic proof
    // For now, return true if verification hash exists
    return !!deletionRequest.verificationHash;
  }

  /**
   * Convert database record to retention schedule
   */
  private convertToRetentionSchedule(dbRecord: any): DataRetentionSchedule {
    return {
      scheduleId: dbRecord.schedule_id,
      dataCategory: dbRecord.data_category,
      retentionPeriodDays: dbRecord.retention_period_days,
      legalBasisForRetention: dbRecord.legal_basis_for_retention,
      automaticDeletion: dbRecord.automatic_deletion,
      deletionMethod: dbRecord.deletion_method,
      approvalRequiredForDeletion: dbRecord.approval_required_for_deletion,
      regulatoryRequirements: dbRecord.regulatory_requirements,
      exceptions: dbRecord.exceptions,
      lastPolicyReview: new Date(dbRecord.last_policy_review),
      nextPolicyReview: new Date(dbRecord.next_policy_review),
      policyVersion: dbRecord.policy_version,
      active: dbRecord.active,
      createdAt: new Date(dbRecord.created_at),
      updatedAt: new Date(dbRecord.updated_at)
    };
  }

  /**
   * Log data retention events
   */
  private async logDataRetentionEvent(
    eventType: string,
    relatedId: string | null,
    userContextHash: string | null,
    eventData: any
  ): Promise<void> {
    try {
      await this.supabase
        .from('compliance_audit')
        .insert({
          audit_event_type: eventType,
          user_context_hash: userContextHash,
          event_category: 'data_deletion',
          event_description: `Data retention ${eventType}`,
          before_data: null,
          after_data: eventData,
          event_hash: crypto.createHash('sha256').update(`${eventType}-${relatedId}-${Date.now()}`).digest('hex'),
          retention_until: new Date(Date.now() + (7 * 365 * 24 * 60 * 60 * 1000)).toISOString(), // 7 years
        });
    } catch (error) {
      logger.error('Error logging data retention event:', error);
    }
  }
}