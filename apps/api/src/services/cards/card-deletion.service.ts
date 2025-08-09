import crypto from 'crypto';
import { supabase } from '../../utils/supabase';
import { privacyService } from './privacy.service';
import { Logger } from '../../utils/logger';
import { marqetaService } from '../payments/marqeta.service';

interface DeletionProofData {
  cardContextHash: string;
  kmsKeyDeleted: boolean;
  dataOverwritten: boolean;
  networkCancelled: boolean;
  deletionTimestamp: Date;
  verificationSalt: string;
}

interface CardDeletionResult {
  deleted: boolean;
  deletionProof: string;
  deletedAt: string;
  networkNotificationStatus: 'pending' | 'confirmed' | 'failed';
  deletionId: string;
}

interface BulkDeletionRequest {
  cardIds: string[];
  confirmationPhrase: string;
  scheduledDeletion?: Date;
}

interface BulkDeletionResult {
  batchId: string;
  totalCards: number;
  status: 'in_progress' | 'completed' | 'partially_failed' | 'failed';
  deletionResults: Array<{
    cardId: string;
    status: 'completed' | 'failed';
    deletionProof?: string;
    error?: string;
  }>;
}

interface DeletionVerification {
  deletionId: string;
  cardContextHash: string;
  verificationHash: string;
  isValid: boolean;
  completedSteps: {
    cardDeactivated: boolean;
    dataOverwritten: boolean;
    kmsKeyDeleted: boolean;
    networkCancelled: boolean;
  };
}

export class CardDeletionService {
  private logger = new Logger('CardDeletionService');
  private readonly AWS_KMS_CLIENT = this.initializeKMS();
  private readonly DELETION_TIMEOUT_MS = 30000; // 30 seconds for immediate deactivation

  /**
   * Initialize AWS KMS client for cryptographic deletion
   */
  private initializeKMS() {
    // In a real implementation, this would initialize AWS KMS client
    // For now, we'll simulate the KMS operations
    return {
      scheduleKeyDeletion: async (keyId: string) => ({ scheduledDeletion: true }),
      generateDataKey: async (keyId: string) => ({ dataKey: 'mock-key' })
    };
  }

  /**
   * Delete a single card with immediate deactivation and cryptographic deletion
   */
  async deleteCard(userId: string, cardId: string, confirmationPhrase?: string): Promise<CardDeletionResult> {
    this.logger.info('Starting card deletion process', { userId, cardId });

    try {
      // Phase 1: Immediate deactivation (0-30 seconds)
      const card = await this.getCardForDeletion(userId, cardId);
      await this.immediateCardDeactivation(card);

      // Phase 2: Parallel network notification and data destruction
      const [networkResult, deletionProof] = await Promise.all([
        this.scheduleNetworkCancellation(card),
        this.performCryptographicDeletion(card)
      ]);

      // Phase 3: Generate final deletion proof and audit
      const deletionId = crypto.randomUUID();
      await this.recordDeletionAudit(deletionId, card, deletionProof, networkResult);

      return {
        deleted: true,
        deletionProof: deletionProof.hash,
        deletedAt: new Date().toISOString(),
        networkNotificationStatus: networkResult.status,
        deletionId
      };

    } catch (error) {
      this.logger.error('Card deletion failed', { userId, cardId, error });
      throw new Error(`Failed to delete card: ${error.message}`);
    }
  }

  /**
   * Delete multiple cards in a coordinated batch operation
   */
  async deleteBulkCards(userId: string, request: BulkDeletionRequest): Promise<BulkDeletionResult> {
    this.logger.info('Starting bulk card deletion', { 
      userId, 
      cardCount: request.cardIds.length,
      scheduled: !!request.scheduledDeletion 
    });

    // Create bulk deletion batch
    const batchId = crypto.randomUUID();
    await this.createBulkDeletionBatch(userId, batchId, request);

    const deletionResults: BulkDeletionResult['deletionResults'] = [];

    // Process each card with proper error isolation
    for (const cardId of request.cardIds) {
      try {
        await this.updateBulkItemStatus(batchId, cardId, 'in_progress');
        
        const result = await this.deleteCard(userId, cardId, request.confirmationPhrase);
        
        deletionResults.push({
          cardId,
          status: 'completed',
          deletionProof: result.deletionProof
        });

        await this.updateBulkItemStatus(batchId, cardId, 'completed', result.deletionProof);

      } catch (error) {
        this.logger.error('Individual card deletion failed in bulk', { cardId, error });
        
        deletionResults.push({
          cardId,
          status: 'failed',
          error: error.message
        });

        await this.updateBulkItemStatus(batchId, cardId, 'failed', undefined, error.message);
      }
    }

    // Determine final batch status
    const completed = deletionResults.filter(r => r.status === 'completed').length;
    const failed = deletionResults.filter(r => r.status === 'failed').length;
    
    let finalStatus: BulkDeletionResult['status'];
    if (completed === request.cardIds.length) finalStatus = 'completed';
    else if (failed === request.cardIds.length) finalStatus = 'failed';
    else finalStatus = 'partially_failed';

    await this.updateBulkBatchStatus(batchId, finalStatus);

    return {
      batchId,
      totalCards: request.cardIds.length,
      status: finalStatus,
      deletionResults
    };
  }

  /**
   * Generate cryptographic proof of card deletion
   */
  async generateDeletionProof(cardContextHash: string): Promise<string> {
    try {
      const { data: proof, error } = await supabase
        .from('deletion_proofs')
        .select('*')
        .eq('card_context_hash', cardContextHash)
        .single();

      if (error || !proof) {
        throw new Error('Deletion proof not found');
      }

      return proof.deletion_proof_hash;
    } catch (error) {
      this.logger.error('Failed to generate deletion proof', { cardContextHash, error });
      throw new Error('Failed to generate deletion proof');
    }
  }

  /**
   * Verify deletion proof cryptographic integrity
   */
  async verifyDeletionProof(deletionId: string): Promise<DeletionVerification> {
    try {
      const { data: proof, error } = await supabase
        .from('deletion_proofs')
        .select('*')
        .eq('deletion_id', deletionId)
        .single();

      if (error || !proof) {
        throw new Error('Deletion proof not found');
      }

      const verificationData = proof.verification_data as DeletionProofData;
      
      // Recreate the proof hash to verify integrity
      const expectedHash = this.computeDeletionProofHash(verificationData);
      const isValid = expectedHash === proof.deletion_proof_hash;

      return {
        deletionId,
        cardContextHash: proof.card_context_hash,
        verificationHash: proof.deletion_proof_hash,
        isValid,
        completedSteps: {
          cardDeactivated: true, // Must be true if we have a proof
          dataOverwritten: verificationData.dataOverwritten,
          kmsKeyDeleted: verificationData.kmsKeyDeleted,
          networkCancelled: verificationData.networkCancelled
        }
      };

    } catch (error) {
      this.logger.error('Deletion proof verification failed', { deletionId, error });
      throw new Error('Failed to verify deletion proof');
    }
  }

  /**
   * Get card for deletion with ownership verification
   */
  private async getCardForDeletion(userId: string, cardId: string) {
    const { data: card, error } = await supabase
      .from('cards')
      .select(`
        card_id,
        user_id,
        card_context_hash,
        status,
        deletion_key,
        visa_card_details (
          marqeta_card_token,
          provisioning_status
        )
      `)
      .eq('card_id', cardId)
      .eq('user_id', userId)
      .single();

    if (error || !card) {
      throw new Error('Card not found');
    }

    if (card.status === 'deleted') {
      throw new Error('Card is already deleted');
    }

    return card;
  }

  /**
   * Immediate card deactivation (must complete within 30 seconds)
   */
  private async immediateCardDeactivation(card: any) {
    const startTime = Date.now();

    try {
      // Update card status to deleted with timestamp
      const { error } = await supabase
        .from('cards')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          network_cancellation_status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('card_id', card.card_id);

      if (error) {
        throw new Error('Failed to deactivate card in database');
      }

      // Broadcast deactivation to active services (cache invalidation, etc.)
      await this.broadcastDeactivation(card.card_id);

      const elapsed = Date.now() - startTime;
      if (elapsed > this.DELETION_TIMEOUT_MS) {
        this.logger.warn('Card deactivation exceeded 30s timeout', { 
          cardId: card.card_id, 
          elapsed 
        });
      }

      this.logger.info('Card immediately deactivated', { 
        cardId: card.card_id, 
        elapsed: `${elapsed}ms` 
      });

    } catch (error) {
      throw new Error(`Immediate deactivation failed: ${error.message}`);
    }
  }

  /**
   * Perform cryptographic deletion with KMS key deletion
   */
  private async performCryptographicDeletion(card: any): Promise<{ hash: string; data: DeletionProofData }> {
    try {
      // Schedule KMS key deletion (7-day window for compliance)
      await this.scheduleKMSKeyDeletion(card.card_context_hash);

      // Overwrite sensitive data in database
      await this.overwriteCardData(card.card_id);

      // Generate cryptographic deletion proof
      const proofData: DeletionProofData = {
        cardContextHash: card.card_context_hash,
        kmsKeyDeleted: true,
        dataOverwritten: true,
        networkCancelled: false, // Will be updated by network cancellation
        deletionTimestamp: new Date(),
        verificationSalt: crypto.randomUUID()
      };

      const proofHash = this.computeDeletionProofHash(proofData);

      return { hash: proofHash, data: proofData };

    } catch (error) {
      this.logger.error('Cryptographic deletion failed', { cardId: card.card_id, error });
      throw new Error(`Cryptographic deletion failed: ${error.message}`);
    }
  }

  /**
   * Schedule network cancellation with Marqeta
   */
  private async scheduleNetworkCancellation(card: any): Promise<{ status: 'pending' | 'confirmed' | 'failed' }> {
    try {
      if (!card.visa_card_details?.marqeta_card_token) {
        this.logger.warn('No Marqeta token found, skipping network cancellation', { 
          cardId: card.card_id 
        });
        return { status: 'confirmed' }; // Not applicable
      }

      // Create network cancellation log entry
      const cancellationId = crypto.randomUUID();
      await supabase
        .from('network_cancellation_log')
        .insert({
          cancellation_id: cancellationId,
          card_context_hash: card.card_context_hash,
          marqeta_card_token: card.visa_card_details.marqeta_card_token,
          status: 'pending'
        });

      // Schedule actual network cancellation (async)
      this.performNetworkCancellation(cancellationId, card.visa_card_details.marqeta_card_token)
        .catch(error => {
          this.logger.error('Network cancellation failed', { 
            cancellationId, 
            cardId: card.card_id, 
            error 
          });
        });

      return { status: 'pending' };

    } catch (error) {
      this.logger.error('Failed to schedule network cancellation', { cardId: card.card_id, error });
      return { status: 'failed' };
    }
  }

  /**
   * Perform actual network cancellation with retry logic
   */
  private async performNetworkCancellation(cancellationId: string, marqetaToken: string): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Call Marqeta API to cancel card
        await marqetaService.cancelCard(marqetaToken);

        // Update cancellation log as confirmed
        await supabase
          .from('network_cancellation_log')
          .update({
            status: 'confirmed',
            cancellation_confirmed_at: new Date().toISOString()
          })
          .eq('cancellation_id', cancellationId);

        this.logger.info('Network cancellation confirmed', { cancellationId, marqetaToken });
        return;

      } catch (error) {
        attempt++;
        this.logger.warn('Network cancellation attempt failed', { 
          cancellationId, 
          attempt, 
          maxRetries, 
          error: error.message 
        });

        if (attempt >= maxRetries) {
          await supabase
            .from('network_cancellation_log')
            .update({
              status: 'failed',
              error_message: error.message,
              retry_count: attempt
            })
            .eq('cancellation_id', cancellationId);
          
          throw error;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  /**
   * Schedule KMS key deletion for cryptographic destruction
   */
  private async scheduleKMSKeyDeletion(cardContextHash: string): Promise<void> {
    try {
      // In real implementation, this would call AWS KMS
      const kmsKeyId = this.deriveKMSKeyId(cardContextHash);
      
      await this.AWS_KMS_CLIENT.scheduleKeyDeletion(kmsKeyId);

      // Record KMS deletion schedule
      await supabase
        .from('kms_deletion_schedule')
        .insert({
          kms_key_id: kmsKeyId,
          scheduled_deletion_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          status: 'pending'
        });

      this.logger.info('KMS key deletion scheduled', { cardContextHash, kmsKeyId });

    } catch (error) {
      this.logger.error('Failed to schedule KMS key deletion', { cardContextHash, error });
      throw error;
    }
  }

  /**
   * Overwrite card data with random data for secure deletion
   */
  private async overwriteCardData(cardId: string): Promise<void> {
    try {
      // Overwrite encrypted card data with random data
      const randomData = crypto.randomBytes(256).toString('hex');

      await supabase
        .from('visa_card_details')
        .update({
          encrypted_card_number: randomData.substring(0, 100),
          encrypted_cvv: randomData.substring(100, 150),
          deletion_scheduled_at: new Date().toISOString()
        })
        .eq('card_id', cardId);

      this.logger.info('Card data overwritten', { cardId });

    } catch (error) {
      this.logger.error('Failed to overwrite card data', { cardId, error });
      throw error;
    }
  }

  /**
   * Broadcast card deactivation to all active services
   */
  private async broadcastDeactivation(cardId: string): Promise<void> {
    // In real implementation, this would notify:
    // - Redis cache to invalidate card data
    // - Real-time services via WebSocket
    // - Transaction authorization services
    // - Mobile app push notifications
    
    this.logger.info('Card deactivation broadcasted', { cardId });
  }

  /**
   * Record comprehensive deletion audit trail
   */
  private async recordDeletionAudit(
    deletionId: string, 
    card: any, 
    deletionProof: { hash: string; data: DeletionProofData },
    networkResult: { status: string }
  ): Promise<void> {
    try {
      // Insert deletion proof record
      await supabase
        .from('deletion_proofs')
        .insert({
          deletion_id: deletionId,
          card_context_hash: card.card_context_hash,
          card_id: card.card_id,
          deletion_proof_hash: deletionProof.hash,
          kms_key_deletion_scheduled_at: new Date().toISOString(),
          data_overwrite_confirmed_at: new Date().toISOString(),
          verification_data: deletionProof.data,
          deletion_type: 'single',
          deletion_initiated_by: card.user_id
        });

      // Record in compliance audit trail
      await supabase
        .from('data_deletion_audit')
        .insert({
          deletion_id: deletionId,
          action_type: 'data_deletion',
          target_id: card.card_id,
          context_hash: card.card_context_hash,
          deletion_proof: deletionProof.hash,
          verification_hash: crypto.createHash('sha256')
            .update(`${deletionId}:${deletionProof.hash}`)
            .digest('hex'),
          metadata: {
            network_cancellation_status: networkResult.status,
            deletion_method: 'cryptographic',
            compliance_retention_required: true
          }
        });

      this.logger.info('Deletion audit recorded', { deletionId, cardId: card.card_id });

    } catch (error) {
      this.logger.error('Failed to record deletion audit', { deletionId, error });
      throw error;
    }
  }

  /**
   * Create bulk deletion batch coordination record
   */
  private async createBulkDeletionBatch(userId: string, batchId: string, request: BulkDeletionRequest): Promise<void> {
    await supabase
      .from('bulk_deletion_batches')
      .insert({
        batch_id: batchId,
        initiated_by: userId,
        total_cards: request.cardIds.length,
        batch_status: 'in_progress',
        deletion_scheduled_for: request.scheduledDeletion?.toISOString(),
        confirmation_phrase: request.confirmationPhrase,
        impact_summary: {
          cardIds: request.cardIds,
          scheduledDeletion: request.scheduledDeletion
        }
      });

    // Create individual items
    const items = request.cardIds.map(cardId => ({
      batch_id: batchId,
      card_id: cardId,
      card_context_hash: '', // Will be filled when processing
      status: 'pending'
    }));

    await supabase
      .from('bulk_deletion_items')
      .insert(items);
  }

  /**
   * Update bulk deletion item status
   */
  private async updateBulkItemStatus(
    batchId: string, 
    cardId: string, 
    status: string, 
    deletionProofHash?: string,
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      [status === 'in_progress' ? 'started_at' : 'completed_at']: new Date().toISOString()
    };

    if (deletionProofHash) updateData.deletion_proof_hash = deletionProofHash;
    if (errorMessage) updateData.error_message = errorMessage;

    await supabase
      .from('bulk_deletion_items')
      .update(updateData)
      .eq('batch_id', batchId)
      .eq('card_id', cardId);
  }

  /**
   * Update bulk deletion batch final status
   */
  private async updateBulkBatchStatus(batchId: string, status: string): Promise<void> {
    await supabase
      .from('bulk_deletion_batches')
      .update({
        batch_status: status,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId);
  }

  /**
   * Compute cryptographic deletion proof hash
   */
  private computeDeletionProofHash(proofData: DeletionProofData): string {
    const dataString = JSON.stringify({
      cardContextHash: proofData.cardContextHash,
      deletionTimestamp: proofData.deletionTimestamp.toISOString(),
      kmsKeyDeleted: proofData.kmsKeyDeleted,
      dataOverwritten: proofData.dataOverwritten,
      networkCancelled: proofData.networkCancelled,
      verificationSalt: proofData.verificationSalt
    });

    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Derive KMS key ID from card context hash
   */
  private deriveKMSKeyId(cardContextHash: string): string {
    return `card-key-${cardContextHash.substring(0, 16)}`;
  }
}

export const cardDeletionService = new CardDeletionService();