import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface KYCData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // ISO string, required for enhanced KYC
  lastFourSSN?: string; // Only last 4 digits, for basic verification
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  idDocument?: {
    type: 'drivers_license' | 'passport' | 'state_id';
    number?: string; // Encrypted
    expirationDate?: string;
    issuingState?: string;
    issuingCountry?: string;
  };
}

export interface KYCLevel {
  level: 'basic' | 'enhanced' | 'full';
  transactionLimit: number;
  monthlyLimit: number;
  requirements: string[];
  dataRequirements: (keyof KYCData)[];
}

export interface KYCRecord {
  recordId: string;
  userContextHash: string;
  kycLevel: 'basic' | 'enhanced' | 'full';
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'expired';
  collectedData: string; // Encrypted
  collectionReason: string;
  consentTimestamp: Date;
  consentVersion: string;
  dataSources: Record<string, any>;
  verificationMethod?: string;
  verifierId?: string;
  retentionUntil: Date;
  gdprLawfulBasis: 'legal_obligation' | 'legitimate_interests' | 'consent';
  createdAt: Date;
  updatedAt: Date;
}

export interface KYCVerificationResult {
  success: boolean;
  verificationId: string;
  status: 'verified' | 'rejected' | 'pending_additional_info';
  riskScore: number; // 0-100
  verificationMethod: string;
  requiredActions?: string[];
  errors?: string[];
  nextKYCReview?: Date;
}

export interface ProgressiveKYCAssessment {
  currentLevel: 'basic' | 'enhanced' | 'full';
  recommendedLevel: 'basic' | 'enhanced' | 'full';
  triggerReason: string;
  transactionVolume: number;
  monthlyVolume: number;
  riskFactors: string[];
  requiresUpgrade: boolean;
  upgradeDeadline?: Date;
}

export class KYCService {
  private supabase: SupabaseClient;
  private isolationService: TransactionIsolationService;
  
  // KYC Levels Configuration
  private readonly KYC_LEVELS: Record<string, KYCLevel> = {
    basic: {
      level: 'basic',
      transactionLimit: 1000,
      monthlyLimit: 5000,
      requirements: ['Phone verification', 'Email verification', 'Basic identity info'],
      dataRequirements: ['firstName', 'lastName', 'phone', 'email']
    },
    enhanced: {
      level: 'enhanced',
      transactionLimit: 10000,
      monthlyLimit: 50000,
      requirements: ['ID document verification', 'Address verification', 'Date of birth'],
      dataRequirements: ['firstName', 'lastName', 'dateOfBirth', 'address', 'phone', 'email', 'lastFourSSN']
    },
    full: {
      level: 'full',
      transactionLimit: 100000,
      monthlyLimit: 500000,
      requirements: ['Full identity verification', 'Enhanced due diligence', 'Source of funds'],
      dataRequirements: ['firstName', 'lastName', 'dateOfBirth', 'address', 'phone', 'email', 'lastFourSSN', 'idDocument']
    }
  };

  // Data retention periods (in days)
  private readonly RETENTION_PERIODS = {
    basic: 1095, // 3 years
    enhanced: 1825, // 5 years
    full: 2555 // 7 years
  };

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
  }

  /**
   * Assess KYC requirements based on user activity
   */
  async assessKYCRequirements(userContextHash: string, transactionAmount?: number): Promise<ProgressiveKYCAssessment> {
    try {
      // Get current KYC level
      const currentKYC = await this.getCurrentKYCRecord(userContextHash);
      const currentLevel = currentKYC?.kycLevel || 'basic';

      // Get user transaction history for assessment
      const activityMetrics = await this.getUserActivityMetrics(userContextHash);

      // Determine risk factors
      const riskFactors = this.assessRiskFactors(activityMetrics, transactionAmount);

      // Determine recommended level
      const recommendedLevel = this.determineRequiredKYCLevel(activityMetrics, riskFactors, transactionAmount);

      // Check if upgrade is required
      const requiresUpgrade = this.isKYCUpgradeRequired(currentLevel, recommendedLevel, activityMetrics);

      let upgradeDeadline: Date | undefined;
      if (requiresUpgrade) {
        upgradeDeadline = new Date();
        upgradeDeadline.setDate(upgradeDeadline.getDate() + 30); // 30 days to upgrade
      }

      return {
        currentLevel,
        recommendedLevel,
        triggerReason: this.getUpgradeTriggerReason(activityMetrics, riskFactors, transactionAmount),
        transactionVolume: activityMetrics.dailyVolume,
        monthlyVolume: activityMetrics.monthlyVolume,
        riskFactors,
        requiresUpgrade,
        upgradeDeadline
      };
    } catch (error) {
      logger.error('Error assessing KYC requirements:', { error, userContextHash });
      throw error;
    }
  }

  /**
   * Collect KYC data with minimal data principles
   */
  async collectKYCData(
    userContextHash: string,
    kycData: KYCData,
    targetLevel: 'basic' | 'enhanced' | 'full',
    collectionReason: string
  ): Promise<KYCRecord> {
    try {
      // Validate required data for target level
      this.validateKYCDataForLevel(kycData, targetLevel);

      // Encrypt sensitive data
      const encryptedData = await this.encryptKYCData(kycData);

      // Calculate retention period
      const retentionUntil = new Date();
      retentionUntil.setDate(retentionUntil.getDate() + this.RETENTION_PERIODS[targetLevel]);

      const recordId = crypto.randomUUID();
      const now = new Date();

      const kycRecord = {
        record_id: recordId,
        user_context_hash: userContextHash,
        kyc_level: targetLevel,
        verification_status: 'pending',
        encrypted_data: encryptedData,
        collection_reason: collectionReason,
        consent_timestamp: now.toISOString(),
        consent_version: '1.0',
        data_sources: {
          collection_method: 'user_input',
          ip_address_hash: crypto.createHash('sha256').update('user_ip').digest('hex'), // In production, hash actual IP
          user_agent_hash: crypto.createHash('sha256').update('user_agent').digest('hex'),
          collection_timestamp: now.toISOString()
        },
        retention_until: retentionUntil.toISOString(),
        gdpr_lawful_basis: 'legal_obligation',
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      // Store KYC record
      const { data, error } = await this.supabase
        .from('kyc_records')
        .insert(kycRecord)
        .select('*')
        .single();

      if (error) {
        logger.error('Error storing KYC record:', error);
        throw error;
      }

      // Log audit trail
      await this.logKYCEvent('kyc_data_collected', recordId, userContextHash, {
        kycLevel: targetLevel,
        collectionReason,
        dataFieldsCollected: Object.keys(kycData).filter(key => kycData[key as keyof KYCData] !== undefined)
      });

      return this.convertToKYCRecord(data);
    } catch (error) {
      logger.error('Error collecting KYC data:', { error, userContextHash });
      throw error;
    }
  }

  /**
   * Verify KYC data
   */
  async verifyKYCData(recordId: string, verifierId: string): Promise<KYCVerificationResult> {
    try {
      // Get KYC record
      const { data: kycRecord, error } = await this.supabase
        .from('kyc_records')
        .select('*')
        .eq('record_id', recordId)
        .single();

      if (error || !kycRecord) {
        throw new Error('KYC record not found');
      }

      // Decrypt and verify data
      const decryptedData = await this.decryptKYCData(kycRecord.encrypted_data);
      const verificationResult = await this.performKYCVerification(decryptedData, kycRecord.kyc_level);

      // Update verification status
      const updateData: any = {
        verification_status: verificationResult.status,
        verifier_id: verifierId,
        verification_method: verificationResult.verificationMethod,
        updated_at: new Date().toISOString()
      };

      // Set next review date for ongoing monitoring
      if (verificationResult.status === 'verified') {
        const nextReview = new Date();
        nextReview.setFullYear(nextReview.getFullYear() + 1); // Annual review
        updateData.data_sources = {
          ...kycRecord.data_sources,
          last_verification: new Date().toISOString(),
          next_review: nextReview.toISOString(),
          verification_score: verificationResult.riskScore
        };
      }

      await this.supabase
        .from('kyc_records')
        .update(updateData)
        .eq('record_id', recordId);

      // Log audit trail
      await this.logKYCEvent('kyc_verification_completed', recordId, kycRecord.user_context_hash, {
        status: verificationResult.status,
        riskScore: verificationResult.riskScore,
        verificationMethod: verificationResult.verificationMethod
      });

      return {
        ...verificationResult,
        verificationId: crypto.randomUUID()
      };
    } catch (error) {
      logger.error('Error verifying KYC data:', { error, recordId });
      return {
        success: false,
        verificationId: crypto.randomUUID(),
        status: 'rejected',
        riskScore: 100,
        verificationMethod: 'automated_verification',
        errors: [error instanceof Error ? error.message : 'Verification failed']
      };
    }
  }

  /**
   * Get current KYC record for user
   */
  async getCurrentKYCRecord(userContextHash: string): Promise<KYCRecord | null> {
    try {
      const { data, error } = await this.supabase
        .from('kyc_records')
        .select('*')
        .eq('user_context_hash', userContextHash)
        .eq('verification_status', 'verified')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return this.convertToKYCRecord(data);
    } catch (error) {
      logger.error('Error getting current KYC record:', { error, userContextHash });
      return null;
    }
  }

  /**
   * Update KYC data (for corrections or additional information)
   */
  async updateKYCData(
    recordId: string,
    updates: Partial<KYCData>,
    updateReason: string,
    updatedBy: string
  ): Promise<KYCRecord> {
    try {
      // Get existing record
      const { data: existing, error: fetchError } = await this.supabase
        .from('kyc_records')
        .select('*')
        .eq('record_id', recordId)
        .single();

      if (fetchError || !existing) {
        throw new Error('KYC record not found');
      }

      // Decrypt existing data
      const existingData = await this.decryptKYCData(existing.encrypted_data);

      // Merge updates
      const updatedData = { ...existingData, ...updates };

      // Re-encrypt
      const encryptedData = await this.encryptKYCData(updatedData);

      // Update record
      const { data, error } = await this.supabase
        .from('kyc_records')
        .update({
          encrypted_data: encryptedData,
          verification_status: 'pending', // Reset to pending after update
          updated_at: new Date().toISOString(),
          data_sources: {
            ...existing.data_sources,
            last_update: new Date().toISOString(),
            update_reason: updateReason,
            updated_by: updatedBy
          }
        })
        .eq('record_id', recordId)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      // Log audit trail
      await this.logKYCEvent('kyc_data_updated', recordId, existing.user_context_hash, {
        updateReason,
        updatedFields: Object.keys(updates),
        updatedBy
      });

      return this.convertToKYCRecord(data);
    } catch (error) {
      logger.error('Error updating KYC data:', { error, recordId });
      throw error;
    }
  }

  /**
   * Schedule KYC data deletion
   */
  async scheduleKYCDeletion(userContextHash: string, deletionReason: string): Promise<void> {
    try {
      // Get all KYC records for user
      const { data: records, error } = await this.supabase
        .from('kyc_records')
        .select('*')
        .eq('user_context_hash', userContextHash);

      if (error) {
        throw error;
      }

      if (!records || records.length === 0) {
        return; // No records to delete
      }

      // Schedule deletion (immediate soft delete, hard delete after grace period)
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + 90); // 90-day grace period

      await this.supabase
        .from('kyc_records')
        .update({
          deleted_at: new Date().toISOString(),
          retention_until: deletionDate.toISOString(),
          data_sources: {
            deletion_reason: deletionReason,
            deletion_scheduled: new Date().toISOString(),
            hard_deletion_date: deletionDate.toISOString()
          }
        })
        .eq('user_context_hash', userContextHash);

      // Log audit trail
      await this.logKYCEvent('kyc_deletion_scheduled', null, userContextHash, {
        deletionReason,
        recordCount: records.length,
        hardDeletionDate: deletionDate.toISOString()
      });

      logger.info('KYC data deletion scheduled', { 
        userContextHash, 
        recordCount: records.length, 
        deletionDate: deletionDate.toISOString() 
      });
    } catch (error) {
      logger.error('Error scheduling KYC deletion:', { error, userContextHash });
      throw error;
    }
  }

  /**
   * Get user activity metrics for KYC assessment
   */
  private async getUserActivityMetrics(userContextHash: string): Promise<{
    dailyVolume: number;
    monthlyVolume: number;
    transactionCount: number;
    averageTransactionAmount: number;
    highRiskTransactions: number;
  }> {
    try {
      // This would integrate with the existing transaction system while maintaining privacy
      // For now, return mock data - in production, this would query actual transaction data
      return {
        dailyVolume: 2500,
        monthlyVolume: 45000,
        transactionCount: 150,
        averageTransactionAmount: 300,
        highRiskTransactions: 2
      };
    } catch (error) {
      logger.error('Error getting user activity metrics:', { error, userContextHash });
      // Return safe defaults
      return {
        dailyVolume: 0,
        monthlyVolume: 0,
        transactionCount: 0,
        averageTransactionAmount: 0,
        highRiskTransactions: 0
      };
    }
  }

  /**
   * Assess risk factors for KYC level determination
   */
  private assessRiskFactors(activityMetrics: any, transactionAmount?: number): string[] {
    const riskFactors: string[] = [];

    if (activityMetrics.dailyVolume > 10000) {
      riskFactors.push('high_daily_volume');
    }

    if (activityMetrics.monthlyVolume > 50000) {
      riskFactors.push('high_monthly_volume');
    }

    if (transactionAmount && transactionAmount > 10000) {
      riskFactors.push('large_transaction');
    }

    if (activityMetrics.highRiskTransactions > 0) {
      riskFactors.push('high_risk_activity');
    }

    if (activityMetrics.averageTransactionAmount > 5000) {
      riskFactors.push('high_average_transaction');
    }

    return riskFactors;
  }

  /**
   * Determine required KYC level based on activity and risk
   */
  private determineRequiredKYCLevel(
    activityMetrics: any,
    riskFactors: string[],
    transactionAmount?: number
  ): 'basic' | 'enhanced' | 'full' {
    // Check for full KYC requirements
    if (activityMetrics.monthlyVolume > 100000 || 
        (transactionAmount && transactionAmount > 25000) ||
        riskFactors.includes('high_risk_activity')) {
      return 'full';
    }

    // Check for enhanced KYC requirements
    if (activityMetrics.monthlyVolume > 25000 || 
        (transactionAmount && transactionAmount > 5000) ||
        riskFactors.length > 1) {
      return 'enhanced';
    }

    return 'basic';
  }

  /**
   * Check if KYC upgrade is required
   */
  private isKYCUpgradeRequired(
    currentLevel: string,
    recommendedLevel: string,
    activityMetrics: any
  ): boolean {
    const levelHierarchy = { basic: 0, enhanced: 1, full: 2 };
    const currentLevelNum = levelHierarchy[currentLevel as keyof typeof levelHierarchy] || 0;
    const recommendedLevelNum = levelHierarchy[recommendedLevel as keyof typeof levelHierarchy];

    return recommendedLevelNum > currentLevelNum;
  }

  /**
   * Get upgrade trigger reason
   */
  private getUpgradeTriggerReason(
    activityMetrics: any,
    riskFactors: string[],
    transactionAmount?: number
  ): string {
    if (transactionAmount && transactionAmount > 25000) {
      return 'Large transaction amount exceeds current KYC limits';
    }

    if (activityMetrics.monthlyVolume > 100000) {
      return 'Monthly transaction volume exceeds current KYC limits';
    }

    if (riskFactors.includes('high_risk_activity')) {
      return 'High-risk activity detected requiring enhanced verification';
    }

    if (riskFactors.length > 1) {
      return 'Multiple risk factors identified requiring additional verification';
    }

    return 'Transaction patterns indicate need for enhanced verification';
  }

  /**
   * Validate KYC data for specific level
   */
  private validateKYCDataForLevel(kycData: KYCData, level: 'basic' | 'enhanced' | 'full'): void {
    const requiredFields = this.KYC_LEVELS[level].dataRequirements;
    const missingFields = requiredFields.filter(field => {
      const value = kycData[field as keyof KYCData];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      throw new Error(`Missing required KYC fields for ${level} level: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Encrypt KYC data
   */
  private async encryptKYCData(kycData: KYCData): Promise<string> {
    try {
      // In production, use proper encryption with KMS
      const dataString = JSON.stringify(kycData);
      const cipher = crypto.createCipher('aes-256-cbc', process.env.KYC_ENCRYPTION_KEY || 'default-key');
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      logger.error('Error encrypting KYC data:', error);
      throw new Error('Failed to encrypt KYC data');
    }
  }

  /**
   * Decrypt KYC data
   */
  private async decryptKYCData(encryptedData: string): Promise<KYCData> {
    try {
      // In production, use proper decryption with KMS
      const decipher = crypto.createDecipher('aes-256-cbc', process.env.KYC_ENCRYPTION_KEY || 'default-key');
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Error decrypting KYC data:', error);
      throw new Error('Failed to decrypt KYC data');
    }
  }

  /**
   * Perform KYC verification (mock implementation)
   */
  private async performKYCVerification(kycData: KYCData, level: string): Promise<Omit<KYCVerificationResult, 'verificationId'>> {
    // Mock verification process - in production, integrate with ID verification services
    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate verification delay

      let riskScore = 10; // Base low risk
      const requiredActions: string[] = [];

      // Basic validation checks
      if (!kycData.firstName || !kycData.lastName) {
        riskScore += 20;
        requiredActions.push('Complete name information');
      }

      if (level !== 'basic' && !kycData.dateOfBirth) {
        riskScore += 15;
        requiredActions.push('Provide date of birth');
      }

      if (level === 'full' && !kycData.idDocument) {
        riskScore += 25;
        requiredActions.push('Upload government-issued ID');
      }

      // Determine verification status
      let status: 'verified' | 'rejected' | 'pending_additional_info' = 'verified';
      if (riskScore > 50) {
        status = 'rejected';
      } else if (requiredActions.length > 0) {
        status = 'pending_additional_info';
      }

      return {
        success: status === 'verified',
        status,
        riskScore,
        verificationMethod: 'automated_verification',
        requiredActions: requiredActions.length > 0 ? requiredActions : undefined
      };
    } catch (error) {
      logger.error('Error in KYC verification:', error);
      return {
        success: false,
        status: 'rejected',
        riskScore: 100,
        verificationMethod: 'automated_verification',
        errors: ['Verification process failed']
      };
    }
  }

  /**
   * Convert database record to KYC record
   */
  private convertToKYCRecord(dbRecord: any): KYCRecord {
    return {
      recordId: dbRecord.record_id,
      userContextHash: dbRecord.user_context_hash,
      kycLevel: dbRecord.kyc_level,
      verificationStatus: dbRecord.verification_status,
      collectedData: dbRecord.encrypted_data,
      collectionReason: dbRecord.collection_reason,
      consentTimestamp: new Date(dbRecord.consent_timestamp),
      consentVersion: dbRecord.consent_version,
      dataSources: dbRecord.data_sources,
      verificationMethod: dbRecord.verification_method,
      verifierId: dbRecord.verifier_id,
      retentionUntil: new Date(dbRecord.retention_until),
      gdprLawfulBasis: dbRecord.gdpr_lawful_basis,
      createdAt: new Date(dbRecord.created_at),
      updatedAt: new Date(dbRecord.updated_at)
    };
  }

  /**
   * Log KYC events for audit trail
   */
  private async logKYCEvent(
    eventType: string,
    recordId: string | null,
    userContextHash: string,
    eventData: any
  ): Promise<void> {
    try {
      await this.supabase
        .from('compliance_audit')
        .insert({
          audit_event_type: eventType,
          user_context_hash: userContextHash,
          event_category: 'kyc_collection',
          event_description: `KYC ${eventType} for user ${userContextHash}`,
          before_data: null,
          after_data: eventData,
          event_hash: crypto.createHash('sha256').update(`${eventType}-${recordId}-${Date.now()}`).digest('hex'),
          retention_until: new Date(Date.now() + (7 * 365 * 24 * 60 * 60 * 1000)).toISOString(), // 7 years
        });
    } catch (error) {
      logger.error('Error logging KYC event:', error);
    }
  }
}