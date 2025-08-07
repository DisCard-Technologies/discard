import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';

interface CreateHoldRequest {
  cardContext: string;
  authorizationId: string;
  marqetaTransactionToken: string;
  merchantName: string;
  merchantCategoryCode: string;
  authorizationAmount: number; // Amount in cents
  holdAmount: number; // Amount to hold (may differ from authorization)
  currencyCode: string;
  authorizationCode: string;
  riskScore: number;
  responseTimeMs: number;
}

interface AuthorizationHold {
  holdId: string;
  cardContext: string;
  authorizationId: string;
  marqetaTransactionToken: string;
  merchantName: string;
  merchantCategoryCode: string;
  authorizationAmount: number;
  holdAmount: number;
  releasedAmount?: number;
  currencyCode: string;
  authorizationCode: string;
  networkReferenceId?: string;
  status: 'active' | 'partially_released' | 'released' | 'expired' | 'reversed';
  riskScore: number;
  responseTimeMs: number;
  createdAt: Date;
  expiresAt: Date;
  releasedAt?: Date;
  releaseReason?: string;
}

interface HoldReleaseRequest {
  holdId: string;
  releaseAmount?: number; // If not provided, releases full hold
  releaseReason?: string;
}

interface HoldMetrics {
  totalActiveHolds: number;
  totalHoldAmount: number;
  averageHoldDuration: number; // In hours
  expiredHoldsCount: number;
  releasedHoldsCount: number;
}

export class AuthorizationHoldsService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('AuthorizationHoldsService');
  
  // Configuration from environment variables
  private readonly defaultHoldExpiryHours = parseInt(process.env.AUTHORIZATION_HOLD_EXPIRY_HOURS || '24');

  /**
   * Create authorization hold
   */
  async createHold(request: CreateHoldRequest): Promise<AuthorizationHold> {
    try {
      this.logger.info('Creating authorization hold', {
        cardContext: request.cardContext,
        authorizationId: request.authorizationId,
        holdAmount: request.holdAmount
      });

      // Set row-level security context
      await this.setCardContext(request.cardContext);

      const holdId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + this.defaultHoldExpiryHours * 60 * 60 * 1000);

      const { data, error } = await this.supabase
        .from('authorization_holds')
        .insert({
          hold_id: holdId,
          card_context: request.cardContext,
          authorization_id: request.authorizationId,
          marqeta_transaction_token: request.marqetaTransactionToken,
          merchant_name: request.merchantName,
          merchant_category_code: request.merchantCategoryCode,
          authorization_amount: request.authorizationAmount,
          hold_amount: request.holdAmount,
          currency_code: request.currencyCode,
          authorization_code: request.authorizationCode,
          risk_score: request.riskScore,
          response_time_ms: request.responseTimeMs,
          expires_at: expiresAt.toISOString(),
          status: 'active'
        })
        .select()
        .single();

      if (error || !data) {
        this.logger.error('Failed to create authorization hold', { error, request });
        throw new Error(`Failed to create authorization hold: ${error?.message}`);
      }

      this.logger.info('Authorization hold created successfully', { holdId });
      
      return this.mapToAuthorizationHold(data);
    } catch (error) {
      this.logger.error('Error creating authorization hold', { error, request });
      throw error;
    }
  }

  /**
   * Release authorization hold (full or partial)
   */
  async releaseHold(request: HoldReleaseRequest): Promise<AuthorizationHold> {
    try {
      this.logger.info('Releasing authorization hold', {
        holdId: request.holdId,
        releaseAmount: request.releaseAmount,
        reason: request.releaseReason
      });

      // Get current hold details
      const { data: holdData } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('hold_id', request.holdId)
        .single();

      if (!holdData) {
        throw new Error('Authorization hold not found');
      }

      // Set context for RLS
      await this.setCardContext(holdData.card_context);

      const currentReleased = holdData.released_amount || 0;
      const remainingHold = holdData.hold_amount - currentReleased;

      if (remainingHold <= 0) {
        throw new Error('Hold is already fully released');
      }

      // Determine release amount
      const releaseAmount = request.releaseAmount || remainingHold;
      
      if (releaseAmount > remainingHold) {
        throw new Error(`Release amount (${releaseAmount}) exceeds remaining hold (${remainingHold})`);
      }

      const newReleasedAmount = currentReleased + releaseAmount;
      const isFullyReleased = newReleasedAmount >= holdData.hold_amount;

      // Update hold record
      const updateData: any = {
        released_amount: newReleasedAmount,
        release_reason: request.releaseReason || 'Manual release',
        status: isFullyReleased ? 'released' : 'partially_released'
      };

      if (isFullyReleased) {
        updateData.released_at = new Date().toISOString();
      }

      const { data: updatedHold, error } = await this.supabase
        .from('authorization_holds')
        .update(updateData)
        .eq('hold_id', request.holdId)
        .select()
        .single();

      if (error || !updatedHold) {
        throw new Error(`Failed to release hold: ${error?.message}`);
      }

      // Release funds back to card balance
      await this.releaseFundsToCard(holdData.card_context, releaseAmount);

      this.logger.info('Authorization hold released successfully', {
        holdId: request.holdId,
        releaseAmount,
        isFullyReleased,
        newStatus: updateData.status
      });

      return this.mapToAuthorizationHold(updatedHold);
    } catch (error) {
      this.logger.error('Error releasing authorization hold', { error, request });
      throw error;
    }
  }

  /**
   * Reverse authorization hold (full reversal/refund)
   */
  async reverseHold(holdId: string, reverseReason?: string): Promise<AuthorizationHold> {
    try {
      this.logger.info('Reversing authorization hold', { holdId, reverseReason });

      // Get current hold details
      const { data: holdData } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('hold_id', holdId)
        .single();

      if (!holdData) {
        throw new Error('Authorization hold not found');
      }

      // Set context for RLS
      await this.setCardContext(holdData.card_context);

      if (holdData.status === 'reversed') {
        throw new Error('Hold is already reversed');
      }

      // Calculate amount to reverse (full remaining hold)
      const currentReleased = holdData.released_amount || 0;
      const amountToReverse = holdData.hold_amount - currentReleased;

      if (amountToReverse <= 0) {
        // Already fully released, just mark as reversed
        const { data: updatedHold, error } = await this.supabase
          .from('authorization_holds')
          .update({
            status: 'reversed',
            release_reason: reverseReason || 'Authorization reversal',
            released_at: new Date().toISOString()
          })
          .eq('hold_id', holdId)
          .select()
          .single();

        if (error || !updatedHold) {
          throw new Error(`Failed to reverse hold: ${error?.message}`);
        }

        return this.mapToAuthorizationHold(updatedHold);
      }

      // Update hold status to reversed
      const { data: updatedHold, error } = await this.supabase
        .from('authorization_holds')
        .update({
          status: 'reversed',
          released_amount: holdData.hold_amount,
          release_reason: reverseReason || 'Authorization reversal',
          released_at: new Date().toISOString()
        })
        .eq('hold_id', holdId)
        .select()
        .single();

      if (error || !updatedHold) {
        throw new Error(`Failed to reverse hold: ${error?.message}`);
      }

      // Release funds back to card balance
      await this.releaseFundsToCard(holdData.card_context, amountToReverse);

      this.logger.info('Authorization hold reversed successfully', {
        holdId,
        amountReversed: amountToReverse
      });

      return this.mapToAuthorizationHold(updatedHold);
    } catch (error) {
      this.logger.error('Error reversing authorization hold', { error, holdId });
      throw error;
    }
  }

  /**
   * Get authorization hold by ID
   */
  async getHold(holdId: string): Promise<AuthorizationHold | null> {
    try {
      const { data } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('hold_id', holdId)
        .single();

      if (!data) return null;

      // Set context for RLS
      await this.setCardContext(data.card_context);

      return this.mapToAuthorizationHold(data);
    } catch (error) {
      this.logger.error('Error getting authorization hold', { error, holdId });
      return null;
    }
  }

  /**
   * Get active holds for a card
   */
  async getActiveHolds(cardContext: string): Promise<AuthorizationHold[]> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('card_context', cardContext)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (!data) return [];

      return data.map(this.mapToAuthorizationHold);
    } catch (error) {
      this.logger.error('Error getting active holds', { error, cardContext });
      return [];
    }
  }

  /**
   * Get hold history for a card
   */
  async getHoldHistory(
    cardContext: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AuthorizationHold[]> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('card_context', cardContext)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!data) return [];

      return data.map(this.mapToAuthorizationHold);
    } catch (error) {
      this.logger.error('Error getting hold history', { error, cardContext });
      return [];
    }
  }

  /**
   * Expire old authorization holds (maintenance function)
   */
  async expireOldHolds(): Promise<number> {
    try {
      this.logger.info('Expiring old authorization holds');

      // Find active holds that have expired
      const { data: expiredHolds } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('status', 'active')
        .lt('expires_at', new Date().toISOString());

      if (!expiredHolds || expiredHolds.length === 0) {
        this.logger.info('No expired holds found');
        return 0;
      }

      let expiredCount = 0;

      // Process each expired hold
      for (const hold of expiredHolds) {
        try {
          // Set context for each hold
          await this.setCardContext(hold.card_context);

          // Calculate amount to release
          const currentReleased = hold.released_amount || 0;
          const amountToRelease = hold.hold_amount - currentReleased;

          // Update hold status to expired
          await this.supabase
            .from('authorization_holds')
            .update({
              status: 'expired',
              released_amount: hold.hold_amount,
              release_reason: 'Automatic expiry',
              released_at: new Date().toISOString()
            })
            .eq('hold_id', hold.hold_id);

          // Release funds if any remaining
          if (amountToRelease > 0) {
            await this.releaseFundsToCard(hold.card_context, amountToRelease);
          }

          expiredCount++;
        } catch (error) {
          this.logger.error('Failed to expire hold', {
            error,
            holdId: hold.hold_id
          });
          // Continue with other holds
        }
      }

      this.logger.info('Expired authorization holds processed', { expiredCount });
      return expiredCount;
    } catch (error) {
      this.logger.error('Failed to expire old holds', { error });
      throw error;
    }
  }

  /**
   * Get hold metrics for a card
   */
  async getHoldMetrics(cardContext: string, hoursBack: number = 24): Promise<HoldMetrics> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const { data: holds } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('card_context', cardContext)
        .gte('created_at', since.toISOString());

      if (!holds || holds.length === 0) {
        return {
          totalActiveHolds: 0,
          totalHoldAmount: 0,
          averageHoldDuration: 0,
          expiredHoldsCount: 0,
          releasedHoldsCount: 0
        };
      }

      const activeHolds = holds.filter(h => h.status === 'active');
      const expiredHolds = holds.filter(h => h.status === 'expired');
      const releasedHolds = holds.filter(h => h.status === 'released' || h.status === 'reversed');

      const totalActiveHoldAmount = activeHolds.reduce((sum, hold) => {
        const remainingAmount = hold.hold_amount - (hold.released_amount || 0);
        return sum + remainingAmount;
      }, 0);

      // Calculate average hold duration for completed holds
      const completedHolds = holds.filter(h => h.released_at);
      let averageHoldDuration = 0;

      if (completedHolds.length > 0) {
        const totalDuration = completedHolds.reduce((sum, hold) => {
          const created = new Date(hold.created_at);
          const released = new Date(hold.released_at);
          const durationHours = (released.getTime() - created.getTime()) / (1000 * 60 * 60);
          return sum + durationHours;
        }, 0);

        averageHoldDuration = totalDuration / completedHolds.length;
      }

      return {
        totalActiveHolds: activeHolds.length,
        totalHoldAmount: totalActiveHoldAmount,
        averageHoldDuration: Math.round(averageHoldDuration * 10) / 10,
        expiredHoldsCount: expiredHolds.length,
        releasedHoldsCount: releasedHolds.length
      };
    } catch (error) {
      this.logger.error('Error getting hold metrics', { error, cardContext });
      throw error;
    }
  }

  /**
   * Private: Release funds back to card balance
   */
  private async releaseFundsToCard(cardContext: string, amount: number): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('increment_card_balance', {
        p_card_context: cardContext,
        p_amount: amount
      });

      if (error) {
        throw new Error(`Failed to release funds to card: ${error.message}`);
      }

      this.logger.debug('Funds released to card balance', { cardContext, amount });
    } catch (error) {
      this.logger.error('Error releasing funds to card', { error, cardContext, amount });
      throw error;
    }
  }

  /**
   * Private: Set row-level security context
   */
  private async setCardContext(cardContext: string): Promise<void> {
    await this.supabase.rpc('set_config', {
      setting_name: 'app.current_card_context',
      new_value: cardContext,
      is_local: true
    });
  }

  /**
   * Private: Map database record to AuthorizationHold interface
   */
  private mapToAuthorizationHold(dbRecord: any): AuthorizationHold {
    return {
      holdId: dbRecord.hold_id,
      cardContext: dbRecord.card_context,
      authorizationId: dbRecord.authorization_id,
      marqetaTransactionToken: dbRecord.marqeta_transaction_token,
      merchantName: dbRecord.merchant_name,
      merchantCategoryCode: dbRecord.merchant_category_code,
      authorizationAmount: dbRecord.authorization_amount,
      holdAmount: dbRecord.hold_amount,
      releasedAmount: dbRecord.released_amount,
      currencyCode: dbRecord.currency_code,
      authorizationCode: dbRecord.authorization_code,
      networkReferenceId: dbRecord.network_reference_id,
      status: dbRecord.status,
      riskScore: dbRecord.risk_score || 0,
      responseTimeMs: dbRecord.response_time_ms || 0,
      createdAt: new Date(dbRecord.created_at),
      expiresAt: new Date(dbRecord.expires_at),
      releasedAt: dbRecord.released_at ? new Date(dbRecord.released_at) : undefined,
      releaseReason: dbRecord.release_reason
    };
  }
}