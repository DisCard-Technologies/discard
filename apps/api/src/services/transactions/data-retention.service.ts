import { supabase } from '../../utils/supabase';
import { logger } from '../../utils/logger';
import crypto from 'crypto';
import * as cron from 'node-cron';

interface RetentionConfig {
  standardRetentionDays: number;
  complianceRetentionDays: number;
}

interface DeletionProof {
  deletionId: string;
  contextHash: string;
  recordCount: number;
  deletionTimestamp: string;
  proofHash: string;
}

export class DataRetentionService {
  private retentionConfig: RetentionConfig;
  private retentionJob: cron.ScheduledTask | null = null;

  constructor() {
    this.retentionConfig = {
      standardRetentionDays: parseInt(process.env.TRANSACTION_RETENTION_DAYS || '365'),
      complianceRetentionDays: 2555 // 7 years
    };
  }

  /**
   * Initialize automated retention policy enforcement
   */
  initializeRetentionJob() {
    // Stop existing job if it exists
    if (this.retentionJob) {
      this.retentionJob.stop();
      this.retentionJob = null;
    }

    // Schedule daily retention job at 3 AM UTC
    this.retentionJob = cron.schedule('0 3 * * *', async () => {
      logger.info('Starting automated data retention enforcement');
      try {
        await this.enforceRetentionPolicies();
      } catch (error) {
        logger.error('Data retention job failed:', error);
      }
    });

    logger.info('Data retention job scheduled for daily execution at 3 AM UTC');
  }

  /**
   * Stop the retention job
   */
  stopRetentionJob() {
    if (this.retentionJob) {
      this.retentionJob.stop();
      this.retentionJob = null;
    }
  }

  /**
   * Enforce retention policies on transaction data
   */
  async enforceRetentionPolicies() {
    try {
      // Find transactions past standard retention period
      const standardRetentionDate = new Date();
      standardRetentionDate.setDate(
        standardRetentionDate.getDate() - this.retentionConfig.standardRetentionDays
      );

      // Get expired transactions
      const { data: expiredTransactions, error } = await supabase
        .from('payment_transactions')
        .select('transaction_id, card_context_hash')
        .lt('retention_until', new Date().toISOString())
        .limit(1000); // Process in batches

      if (error) {
        logger.error('Error fetching expired transactions:', error);
        throw error;
      }

      if (!expiredTransactions || expiredTransactions.length === 0) {
        logger.info('No expired transactions found');
        return;
      }

      // Group by card context for efficient deletion
      const cardContextGroups = this.groupByCardContext(expiredTransactions);

      // Process deletions by card context
      for (const [cardContextHash, transactions] of Object.entries(cardContextGroups)) {
        await this.cryptographicallyDeleteCardData(cardContextHash, transactions);
      }

      logger.info(`Processed retention for ${expiredTransactions.length} transactions`);
    } catch (error) {
      logger.error('Retention policy enforcement error:', error);
      throw error;
    }
  }

  /**
   * Cryptographically delete card transaction data
   */
  async cryptographicallyDeleteCardData(
    cardContextHash: string, 
    transactions: any[]
  ): Promise<DeletionProof> {
    try {
      // Get card's KMS key ID
      const { data: card } = await supabase
        .from('cards')
        .select('kms_key_id')
        .eq('card_context_hash', cardContextHash)
        .single();

      if (!card?.kms_key_id) {
        logger.warn(`No KMS key found for card context: ${cardContextHash}`);
        return this.generateDeletionProof(cardContextHash, transactions.length);
      }

      // Note: In production, this would interact with AWS KMS
      // For now, we'll simulate the key deletion process
      await this.scheduleKMSKeyDeletion(card.kms_key_id);

      // Generate deletion proof before removing data
      const deletionProof = this.generateDeletionProof(
        cardContextHash,
        transactions.length
      );

      // Archive compliance data if needed
      await this.archiveComplianceData(transactions);

      // Delete the transaction records
      const transactionIds = transactions.map(tx => tx.transaction_id);
      const { error: deleteError } = await supabase
        .from('payment_transactions')
        .delete()
        .in('transaction_id', transactionIds);

      if (deleteError) {
        logger.error('Error deleting transactions:', deleteError);
        throw deleteError;
      }

      // Record deletion in audit log
      await this.recordDeletionAudit(deletionProof);

      return deletionProof;
    } catch (error) {
      logger.error('Cryptographic deletion error:', error);
      throw error;
    }
  }

  /**
   * Extend retention for specific transaction (emergency/legal hold)
   */
  async extendRetention(transactionId: string, additionalDays: number): Promise<boolean> {
    try {
      const newRetentionDate = new Date();
      newRetentionDate.setDate(newRetentionDate.getDate() + additionalDays);

      const { error } = await supabase
        .from('payment_transactions')
        .update({ retention_until: newRetentionDate.toISOString() })
        .eq('transaction_id', transactionId);

      if (error) {
        logger.error('Error extending retention:', error);
        return false;
      }

      // Log retention extension
      await supabase
        .from('data_deletion_audit')
        .insert({
          action_type: 'retention_extended',
          target_id: transactionId,
          metadata: {
            additional_days: additionalDays,
            new_retention_date: newRetentionDate.toISOString()
          }
        });

      return true;
    } catch (error) {
      logger.error('Retention extension error:', error);
      return false;
    }
  }

  /**
   * Group transactions by card context
   */
  private groupByCardContext(transactions: any[]): { [key: string]: any[] } {
    return transactions.reduce((groups, tx) => {
      const key = tx.card_context_hash;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(tx);
      return groups;
    }, {});
  }

  /**
   * Schedule KMS key deletion (simulated)
   */
  private async scheduleKMSKeyDeletion(kmsKeyId: string) {
    // In production, this would call AWS KMS scheduleKeyDeletion
    logger.info(`Scheduled KMS key deletion: ${kmsKeyId}`);
    
    // Record the scheduled deletion
    await supabase
      .from('kms_deletion_schedule')
      .insert({
        kms_key_id: kmsKeyId,
        scheduled_deletion_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending'
      });
  }

  /**
   * Generate cryptographic proof of deletion
   */
  private generateDeletionProof(
    contextHash: string, 
    recordCount: number
  ): DeletionProof {
    const deletionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    
    const proofData = `${deletionId}:${contextHash}:${recordCount}:${timestamp}`;
    const proofHash = crypto.createHash('sha256').update(proofData).digest('hex');

    return {
      deletionId,
      contextHash,
      recordCount,
      deletionTimestamp: timestamp,
      proofHash
    };
  }

  /**
   * Archive compliance-required data before deletion
   */
  private async archiveComplianceData(transactions: any[]) {
    // Extract minimal compliance data
    const complianceRecords = transactions.map(tx => ({
      transaction_id: tx.transaction_id,
      amount: tx.amount,
      processed_at: tx.processed_at,
      compliance_ref: crypto.createHash('sha256')
        .update(`${tx.transaction_id}:${tx.amount}`)
        .digest('hex'),
      archived_at: new Date().toISOString()
    }));

    if (complianceRecords.length > 0) {
      const { error } = await supabase
        .from('compliance_archive')
        .insert(complianceRecords);

      if (error) {
        logger.error('Error archiving compliance data:', error);
        throw error;
      }
    }
  }

  /**
   * Record deletion in audit log
   */
  private async recordDeletionAudit(deletionProof: DeletionProof) {
    const { error } = await supabase
      .from('data_deletion_audit')
      .insert({
        deletion_id: deletionProof.deletionId,
        context_hash: deletionProof.contextHash,
        deletion_proof: deletionProof.proofHash,
        deleted_at: deletionProof.deletionTimestamp,
        verification_hash: deletionProof.proofHash,
        metadata: {
          record_count: deletionProof.recordCount
        }
      });

    if (error) {
      logger.error('Error recording deletion audit:', error);
      throw error;
    }
  }
}

export const dataRetentionService = new DataRetentionService();