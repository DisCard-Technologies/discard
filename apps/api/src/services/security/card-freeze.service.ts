import { supabase } from '../../utils/supabase';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { logger } from '../../utils/logger';
import axios from 'axios';
import { marqetaCircuitBreaker } from '../../utils/circuit-breaker';

export interface FreezeRequest {
  cardId: string;
  reason: 'fraud_detected' | 'user_requested' | 'suspicious_activity' | 'compliance_required' | 'system_initiated';
  relatedEventId?: string;
  metadata?: Record<string, any>;
}

export interface UnfreezeRequest {
  cardId: string;
  unfreezeBy: 'user' | 'system' | 'support' | 'timeout';
  reason?: string;
}

export interface FreezeStatus {
  isFrozen: boolean;
  freezeId?: string;
  frozenAt?: Date;
  reason?: string;
  canUnfreeze: boolean;
}

export interface FreezeResult {
  success: boolean;
  freezeId?: string;
  marqetaTransitionToken?: string;
  error?: string;
}

interface MarqetaCardTransition {
  token: string;
  card_token: string;
  state: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  reason: string;
  channel: string;
}

export class CardFreezeService {
  private isolationService: TransactionIsolationService;
  private marqetaBaseUrl: string;
  private marqetaAuth: string;
  
  // Freeze configuration
  private readonly FREEZE_CONFIG = {
    AUTO_UNFREEZE_HOURS: 24,
    MAX_FREEZE_ATTEMPTS: 3,
    FREEZE_TIMEOUT_MS: 5000,
    RISK_SCORE_THRESHOLD: 75,
    MANUAL_REVIEW_THRESHOLD: 50
  };

  constructor() {
    this.isolationService = new TransactionIsolationService(supabase);
    this.marqetaBaseUrl = process.env.MARQETA_BASE_URL || 'https://sandbox-api.marqeta.com';
    
    // Marqeta Basic Auth
    const appToken = process.env.MARQETA_APPLICATION_TOKEN || '';
    const accessToken = process.env.MARQETA_ACCESS_TOKEN || '';
    this.marqetaAuth = Buffer.from(`${appToken}:${accessToken}`).toString('base64');
  }

  async freezeCard(request: FreezeRequest): Promise<FreezeResult> {
    const startTime = Date.now();
    
    try {
      // Enforce isolation
      await this.isolationService.enforceTransactionIsolation(request.cardId);
      const isolationContext = await this.isolationService.getCardContext(request.cardId);
      
      // Check if card is already frozen
      const currentStatus = await this.getCardFreezeStatus(request.cardId);
      if (currentStatus.isFrozen) {
        return {
          success: false,
          error: 'Card is already frozen'
        };
      }
      
      // Get card token from database
      const cardToken = await this.getCardToken(request.cardId, isolationContext.cardContextHash);
      if (!cardToken) {
        throw new Error('Card not found');
      }
      
      // Create freeze record in database
      const freezeRecord = await this.createFreezeRecord(
        isolationContext.cardContextHash,
        request
      );
      
      // Call Marqeta API to suspend card
      const marqetaResult = await this.suspendCardInMarqeta(cardToken, request.reason);
      
      // Log performance
      const freezeTime = Date.now() - startTime;
      if (freezeTime > 1000) {
        logger.warn(`Card freeze took ${freezeTime}ms for card ${request.cardId}`);
      }
      
      return {
        success: true,
        freezeId: freezeRecord.freeze_id,
        marqetaTransitionToken: marqetaResult.token
      };
      
    } catch (error) {
      logger.error('Card freeze failed:', error);
      
      // Attempt to rollback freeze record if Marqeta call failed
      if (error.message.includes('Marqeta')) {
        await this.rollbackFreezeRecord(request.cardId);
      }
      
      return {
        success: false,
        error: error.message || 'Failed to freeze card'
      };
    }
  }

  async unfreezeCard(request: UnfreezeRequest): Promise<FreezeResult> {
    try {
      // Enforce isolation
      await this.isolationService.enforceTransactionIsolation(request.cardId);
      const isolationContext = await this.isolationService.getCardContext(request.cardId);
      
      // Get current freeze status
      const currentStatus = await this.getCardFreezeStatus(request.cardId);
      if (!currentStatus.isFrozen) {
        return {
          success: false,
          error: 'Card is not frozen'
        };
      }
      
      // Check if user is allowed to unfreeze
      if (!currentStatus.canUnfreeze && request.unfreezeBy === 'user') {
        return {
          success: false,
          error: 'Card cannot be unfrozen by user due to security restrictions'
        };
      }
      
      // Get card token
      const cardToken = await this.getCardToken(request.cardId, isolationContext.cardContextHash);
      if (!cardToken) {
        throw new Error('Card not found');
      }
      
      // Call Marqeta API to activate card
      const marqetaResult = await this.activateCardInMarqeta(cardToken, request.reason || 'Manual unfreeze');
      
      // Update freeze record
      await this.updateFreezeRecord(
        currentStatus.freezeId!,
        request.unfreezeBy
      );
      
      return {
        success: true,
        freezeId: currentStatus.freezeId,
        marqetaTransitionToken: marqetaResult.token
      };
      
    } catch (error) {
      logger.error('Card unfreeze failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to unfreeze card'
      };
    }
  }

  async getCardFreezeStatus(cardId: string): Promise<FreezeStatus> {
    try {
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      // Query active freezes
      const { data, error } = await supabase
        .from('card_freeze_history')
        .select('*')
        .eq('card_context_hash', isolationContext.cardContextHash)
        .is('unfrozen_at', null)
        .order('frozen_at', { ascending: false })
        .limit(1);
      
      if (error) {
        throw error;
      }
      
      if (!data || data.length === 0) {
        return {
          isFrozen: false,
          canUnfreeze: true
        };
      }
      
      const freeze = data[0];
      const frozenHours = (Date.now() - new Date(freeze.frozen_at).getTime()) / (1000 * 60 * 60);
      
      // Determine if card can be unfrozen
      const canUnfreeze = this.canCardBeUnfrozen(freeze, frozenHours);
      
      return {
        isFrozen: true,
        freezeId: freeze.freeze_id,
        frozenAt: new Date(freeze.frozen_at),
        reason: freeze.freeze_reason,
        canUnfreeze
      };
      
    } catch (error) {
      logger.error('Failed to get freeze status:', error);
      throw error;
    }
  }

  async applyRuleBasedFreezing(cardId: string, riskScore: number, eventId: string): Promise<FreezeResult | null> {
    // Only freeze automatically for high risk scores
    if (riskScore < this.FREEZE_CONFIG.RISK_SCORE_THRESHOLD) {
      return null;
    }
    
    const freezeRequest: FreezeRequest = {
      cardId,
      reason: 'fraud_detected',
      relatedEventId: eventId,
      metadata: {
        riskScore,
        autoFreeze: true,
        threshold: this.FREEZE_CONFIG.RISK_SCORE_THRESHOLD
      }
    };
    
    return this.freezeCard(freezeRequest);
  }

  async processAutomaticUnfreezing(): Promise<void> {
    try {
      // Query freezes eligible for automatic unfreezing
      const cutoffTime = new Date(Date.now() - (this.FREEZE_CONFIG.AUTO_UNFREEZE_HOURS * 60 * 60 * 1000));
      
      const { data: eligibleFreezes, error } = await supabase
        .from('card_freeze_history')
        .select('freeze_id, card_context_hash, freeze_type')
        .eq('freeze_type', 'temporary')
        .is('unfrozen_at', null)
        .lte('frozen_at', cutoffTime.toISOString())
        .limit(100);
      
      if (error) {
        logger.error('Failed to query eligible freezes:', error);
        return;
      }
      
      // Process each eligible freeze
      for (const freeze of eligibleFreezes || []) {
        try {
          // Get card ID from context (would need reverse lookup in real implementation)
          const cardId = await this.getCardIdFromContext(freeze.card_context_hash);
          
          if (cardId) {
            await this.unfreezeCard({
              cardId,
              unfreezeBy: 'timeout',
              reason: 'Automatic unfreeze after timeout'
            });
          }
        } catch (unfreezeError) {
          logger.error(`Failed to auto-unfreeze ${freeze.freeze_id}:`, unfreezeError);
        }
      }
      
    } catch (error) {
      logger.error('Automatic unfreezing process failed:', error);
    }
  }

  private async createFreezeRecord(
    cardContextHash: string,
    request: FreezeRequest
  ): Promise<any> {
    const { data, error } = await supabase
      .from('card_freeze_history')
      .insert({
        card_context_hash: cardContextHash,
        freeze_reason: request.reason,
        freeze_type: request.reason === 'user_requested' ? 'temporary' : 'permanent',
        related_event_id: request.relatedEventId,
        metadata: request.metadata
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create freeze record: ${error.message}`);
    }
    
    return data;
  }

  private async updateFreezeRecord(
    freezeId: string,
    unfreezeBy: string
  ): Promise<void> {
    const { error } = await supabase
      .from('card_freeze_history')
      .update({
        unfrozen_at: new Date().toISOString(),
        unfrozen_by: unfreezeBy
      })
      .eq('freeze_id', freezeId);
    
    if (error) {
      throw new Error(`Failed to update freeze record: ${error.message}`);
    }
  }

  private async rollbackFreezeRecord(cardId: string): Promise<void> {
    try {
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      // Delete the most recent freeze record
      await supabase
        .from('card_freeze_history')
        .delete()
        .eq('card_context_hash', isolationContext.cardContextHash)
        .is('unfrozen_at', null)
        .order('frozen_at', { ascending: false })
        .limit(1);
        
    } catch (error) {
      logger.error('Failed to rollback freeze record:', error);
    }
  }

  private async suspendCardInMarqeta(cardToken: string, reason: string): Promise<MarqetaCardTransition> {
    return await marqetaCircuitBreaker.execute(async () => {
      try {
        const response = await axios.post(
          `${this.marqetaBaseUrl}/cards/${cardToken}/transitions`,
          {
            state: 'SUSPENDED',
            reason: reason.toUpperCase().replace(/ /g, '_'),
            channel: 'API'
          },
          {
            headers: {
              'Authorization': `Basic ${this.marqetaAuth}`,
              'Content-Type': 'application/json'
            },
            timeout: this.FREEZE_CONFIG.FREEZE_TIMEOUT_MS
          }
        );
        
        return response.data;
        
      } catch (error) {
        logger.error('Marqeta card suspension failed:', error);
        
        // Enhance error with circuit breaker context
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to suspend card in Marqeta: ${errorMessage}`);
      }
    });
  }

  private async activateCardInMarqeta(cardToken: string, reason: string): Promise<MarqetaCardTransition> {
    return await marqetaCircuitBreaker.execute(async () => {
      try {
        const response = await axios.post(
          `${this.marqetaBaseUrl}/cards/${cardToken}/transitions`,
          {
            state: 'ACTIVE',
            reason: reason.toUpperCase().replace(/ /g, '_'),
            channel: 'API'
          },
          {
            headers: {
              'Authorization': `Basic ${this.marqetaAuth}`,
              'Content-Type': 'application/json'
            },
            timeout: this.FREEZE_CONFIG.FREEZE_TIMEOUT_MS
          }
        );
        
        return response.data;
        
      } catch (error) {
        logger.error('Marqeta card activation failed:', error);
        
        // Enhance error with circuit breaker context
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to activate card in Marqeta: ${errorMessage}`);
      }
    });
  }

  private async getCardToken(cardId: string, cardContextHash: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('cards')
      .select('marqeta_card_token')
      .eq('card_id', cardId)
      .eq('card_context_hash', cardContextHash)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return data.marqeta_card_token;
  }

  private async getCardIdFromContext(cardContextHash: string): Promise<string | null> {
    // In real implementation, this would need a secure reverse lookup
    // For now, returning null to indicate this needs proper implementation
    logger.warn('Card ID reverse lookup not implemented');
    return null;
  }

  private canCardBeUnfrozen(freeze: any, frozenHours: number): boolean {
    // User-requested freezes can always be unfrozen by user
    if (freeze.freeze_reason === 'user_requested') {
      return true;
    }
    
    // Fraud-detected freezes require support or timeout
    if (freeze.freeze_reason === 'fraud_detected') {
      return frozenHours >= this.FREEZE_CONFIG.AUTO_UNFREEZE_HOURS;
    }
    
    // Compliance freezes cannot be unfrozen by user
    if (freeze.freeze_reason === 'compliance_required') {
      return false;
    }
    
    // Default to allowing unfreeze after timeout
    return frozenHours >= this.FREEZE_CONFIG.AUTO_UNFREEZE_HOURS;
  }
}