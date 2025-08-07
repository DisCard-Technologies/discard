import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';
import { RestrictionsService } from './restrictions.service';

interface AuthorizationRequest {
  cardContext: string;
  marqetaTransactionToken: string;
  merchantName: string;
  merchantCategoryCode: string;
  amount: number; // Amount in cents
  currencyCode: string;
  merchantLocation?: {
    country: string;
    city: string;
    state: string;
  };
}

interface AuthorizationResponse {
  approved: boolean;
  authorizationCode?: string;
  declineReason?: string;
  declineCode?: string;
  holdId?: string;
  responseTimeMs: number;
}

interface AuthorizationHold {
  holdId: string;
  cardContext: string;
  marqetaTransactionToken: string;
  merchantName: string;
  merchantCategoryCode: string;
  authorizationAmount: number;
  holdAmount: number;
  currencyCode: string;
  authorizationCode: string;
  expiresAt: Date;
  status: 'active' | 'cleared' | 'expired' | 'reversed';
}

interface BalanceCheckResult {
  hasBalance: boolean;
  availableBalance: number;
  cardStatus: string;
  spendingLimit: number;
}

export class AuthorizationService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private restrictionsService = new RestrictionsService();
  private logger = new Logger('AuthorizationService');
  private readonly maxResponseTime = parseInt(process.env.PAYMENT_PROCESSING_TIMEOUT || '800');

  /**
   * Process authorization request with sub-second response time
   */
  async processAuthorization(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing authorization request', { 
        cardContext: request.cardContext,
        merchantName: request.merchantName,
        amount: request.amount 
      });

      // Set row-level security context
      await this.setCardContext(request.cardContext);

      // 1. Validate request format
      this.validateAuthorizationRequest(request);

      // 2. Check merchant restrictions (geographic and category)
      const restrictionCheck = await this.restrictionsService.validateTransaction(
        request.cardContext,
        request.merchantCategoryCode,
        request.merchantLocation?.country || 'US'
      );

      if (!restrictionCheck.allowed) {
        return this.createDeclinedResponse(
          startTime,
          'RESTRICTION_VIOLATION',
          restrictionCheck.reason || 'Transaction violates card restrictions'
        );
      }

      // 3. Check card status and balance
      const balanceCheck = await this.checkCardBalance(request.cardContext, request.amount);
      
      if (!balanceCheck.hasBalance) {
        return this.createDeclinedResponse(
          startTime,
          'INSUFFICIENT_FUNDS',
          'Insufficient balance for transaction'
        );
      }

      // 4. Fraud detection check
      const fraudCheck = await this.performFraudCheck(request);
      
      if (!fraudCheck.approved) {
        return this.createDeclinedResponse(
          startTime,
          'FRAUD_SUSPECTED',
          fraudCheck.reason || 'Transaction flagged for suspected fraud'
        );
      }

      // 5. Create authorization hold
      const authorizationCode = this.generateAuthorizationCode();
      const hold = await this.createAuthorizationHold(request, authorizationCode);

      // 6. Update card balance (reserve funds)
      await this.reserveFunds(request.cardContext, request.amount);

      const responseTime = Date.now() - startTime;
      
      // Ensure sub-second response
      if (responseTime > this.maxResponseTime) {
        this.logger.warn('Authorization response time exceeded threshold', { 
          responseTime, 
          threshold: this.maxResponseTime 
        });
      }

      const response: AuthorizationResponse = {
        approved: true,
        authorizationCode,
        holdId: hold.holdId,
        responseTimeMs: responseTime
      };

      this.logger.info('Authorization approved', { 
        cardContext: request.cardContext,
        authorizationCode,
        responseTime 
      });

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Authorization processing failed', { 
        error, 
        request,
        responseTime 
      });

      return this.createDeclinedResponse(
        startTime,
        'PROCESSING_ERROR',
        'Authorization processing failed'
      );
    }
  }

  /**
   * Clear authorization hold when transaction settles
   */
  async clearAuthorizationHold(holdId: string, settledAmount?: number): Promise<void> {
    try {
      this.logger.info('Clearing authorization hold', { holdId, settledAmount });

      // Get hold details
      const { data: hold } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('hold_id', holdId)
        .single();

      if (!hold) {
        throw new Error('Authorization hold not found');
      }

      // Set context for RLS
      await this.setCardContext(hold.card_context);

      // Calculate amount to release
      const holdAmount = hold.hold_amount;
      const actualAmount = settledAmount || hold.authorization_amount;
      const releaseAmount = holdAmount - actualAmount;

      // Update hold status
      await this.supabase
        .from('authorization_holds')
        .update({
          status: 'cleared',
          cleared_at: new Date().toISOString()
        })
        .eq('hold_id', holdId);

      // Release unused funds if any
      if (releaseAmount > 0) {
        await this.releaseFunds(hold.card_context, releaseAmount);
      }

      this.logger.info('Authorization hold cleared', { holdId, releaseAmount });
    } catch (error) {
      this.logger.error('Failed to clear authorization hold', { error, holdId });
      throw error;
    }
  }

  /**
   * Reverse authorization hold (full refund)
   */
  async reverseAuthorizationHold(holdId: string): Promise<void> {
    try {
      this.logger.info('Reversing authorization hold', { holdId });

      // Get hold details
      const { data: hold } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('hold_id', holdId)
        .single();

      if (!hold) {
        throw new Error('Authorization hold not found');
      }

      // Set context for RLS
      await this.setCardContext(hold.card_context);

      // Update hold status
      await this.supabase
        .from('authorization_holds')
        .update({
          status: 'reversed',
          cleared_at: new Date().toISOString()
        })
        .eq('hold_id', holdId);

      // Release full hold amount
      await this.releaseFunds(hold.card_context, hold.hold_amount);

      this.logger.info('Authorization hold reversed', { holdId, amount: hold.hold_amount });
    } catch (error) {
      this.logger.error('Failed to reverse authorization hold', { error, holdId });
      throw error;
    }
  }

  /**
   * Get active authorization holds for a card
   */
  async getActiveHolds(cardContext: string): Promise<AuthorizationHold[]> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data: holds } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('card_context', cardContext)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      return (holds || []).map(this.mapToAuthorizationHold);
    } catch (error) {
      this.logger.error('Failed to get active holds', { error, cardContext });
      throw error;
    }
  }

  /**
   * Expire old authorization holds
   */
  async expireOldHolds(): Promise<number> {
    try {
      this.logger.info('Expiring old authorization holds');

      const { data: expiredHolds } = await this.supabase
        .from('authorization_holds')
        .select('*')
        .eq('status', 'active')
        .lt('expires_at', new Date().toISOString());

      if (!expiredHolds || expiredHolds.length === 0) {
        return 0;
      }

      // Update expired holds
      const expiredHoldIds = expiredHolds.map(hold => hold.hold_id);
      
      await this.supabase
        .from('authorization_holds')
        .update({ status: 'expired' })
        .in('hold_id', expiredHoldIds);

      // Release funds for each expired hold
      for (const hold of expiredHolds) {
        try {
          await this.setCardContext(hold.card_context);
          await this.releaseFunds(hold.card_context, hold.hold_amount);
        } catch (error) {
          this.logger.error('Failed to release funds for expired hold', { 
            error, 
            holdId: hold.hold_id 
          });
        }
      }

      this.logger.info('Expired authorization holds processed', { count: expiredHolds.length });
      return expiredHolds.length;
    } catch (error) {
      this.logger.error('Failed to expire old holds', { error });
      throw error;
    }
  }

  /**
   * Private: Validate authorization request format
   */
  private validateAuthorizationRequest(request: AuthorizationRequest): void {
    if (!request.cardContext) {
      throw new Error('Card context is required');
    }
    
    if (!request.marqetaTransactionToken) {
      throw new Error('Transaction token is required');
    }
    
    if (!request.merchantName || request.merchantName.trim().length === 0) {
      throw new Error('Merchant name is required');
    }
    
    if (!request.merchantCategoryCode) {
      throw new Error('Merchant category code is required');
    }
    
    if (!request.amount || request.amount <= 0) {
      throw new Error('Valid transaction amount is required');
    }
    
    if (!request.currencyCode) {
      request.currencyCode = 'USD'; // Default currency
    }
  }

  /**
   * Private: Check card balance and status
   */
  private async checkCardBalance(cardContext: string, amount: number): Promise<BalanceCheckResult> {
    const { data: card } = await this.supabase
      .from('cards')
      .select('status, current_balance, spending_limit')
      .eq('card_context', cardContext)
      .single();

    if (!card) {
      return {
        hasBalance: false,
        availableBalance: 0,
        cardStatus: 'not_found',
        spendingLimit: 0
      };
    }

    if (card.status !== 'active') {
      return {
        hasBalance: false,
        availableBalance: card.current_balance,
        cardStatus: card.status,
        spendingLimit: card.spending_limit
      };
    }

    const hasBalance = card.current_balance >= amount;
    
    return {
      hasBalance,
      availableBalance: card.current_balance,
      cardStatus: card.status,
      spendingLimit: card.spending_limit
    };
  }

  /**
   * Private: Perform fraud detection checks
   */
  private async performFraudCheck(request: AuthorizationRequest): Promise<{ approved: boolean; reason?: string }> {
    try {
      // Basic fraud checks - in production, this would be more sophisticated
      
      // 1. Check for unusual spending patterns
      const recentTransactions = await this.getRecentTransactions(request.cardContext, 24); // Last 24 hours
      
      if (recentTransactions.length > 10) {
        this.logger.warn('High transaction frequency detected', { 
          cardContext: request.cardContext,
          transactionCount: recentTransactions.length 
        });
        return { approved: false, reason: 'High transaction frequency' };
      }

      // 2. Check for large amount compared to normal spending
      if (recentTransactions.length > 0) {
        const avgAmount = recentTransactions.reduce((sum, tx) => sum + tx.amount, 0) / recentTransactions.length;
        if (request.amount > avgAmount * 5) {
          this.logger.warn('Large amount compared to normal spending', { 
            cardContext: request.cardContext,
            requestAmount: request.amount,
            avgAmount 
          });
          return { approved: false, reason: 'Unusually large transaction amount' };
        }
      }

      return { approved: true };
    } catch (error) {
      this.logger.error('Fraud check failed', { error, request });
      // Fail open for now - approve transaction if fraud check fails
      return { approved: true };
    }
  }

  /**
   * Private: Get recent transactions for fraud analysis
   */
  private async getRecentTransactions(cardContext: string, hours: number): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data: transactions } = await this.supabase
      .from('payment_transactions')
      .select('amount, processed_at')
      .eq('card_context', cardContext)
      .gte('processed_at', since);

    return transactions || [];
  }

  /**
   * Private: Create authorization hold
   */
  private async createAuthorizationHold(
    request: AuthorizationRequest, 
    authorizationCode: string
  ): Promise<AuthorizationHold> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { data: hold } = await this.supabase
      .from('authorization_holds')
      .insert({
        card_context: request.cardContext,
        marqeta_transaction_token: request.marqetaTransactionToken,
        merchant_name: request.merchantName,
        merchant_category_code: request.merchantCategoryCode,
        authorization_amount: request.amount,
        hold_amount: request.amount,
        currency_code: request.currencyCode,
        authorization_code: authorizationCode,
        expires_at: expiresAt.toISOString(),
        status: 'active'
      })
      .select()
      .single();

    if (!hold) {
      throw new Error('Failed to create authorization hold');
    }

    return this.mapToAuthorizationHold(hold);
  }

  /**
   * Private: Reserve funds in card balance
   */
  private async reserveFunds(cardContext: string, amount: number): Promise<void> {
    await this.supabase
      .from('cards')
      .update({
        current_balance: this.supabase.raw(`current_balance - ${amount}`)
      })
      .eq('card_context', cardContext);
  }

  /**
   * Private: Release reserved funds
   */
  private async releaseFunds(cardContext: string, amount: number): Promise<void> {
    await this.supabase
      .from('cards')
      .update({
        current_balance: this.supabase.raw(`current_balance + ${amount}`)
      })
      .eq('card_context', cardContext);
  }

  /**
   * Private: Generate authorization code
   */
  private generateAuthorizationCode(): string {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  /**
   * Private: Create declined response
   */
  private createDeclinedResponse(startTime: number, declineCode: string, declineReason: string): AuthorizationResponse {
    return {
      approved: false,
      declineCode,
      declineReason,
      responseTimeMs: Date.now() - startTime
    };
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
      marqetaTransactionToken: dbRecord.marqeta_transaction_token,
      merchantName: dbRecord.merchant_name,
      merchantCategoryCode: dbRecord.merchant_category_code,
      authorizationAmount: dbRecord.authorization_amount,
      holdAmount: dbRecord.hold_amount,
      currencyCode: dbRecord.currency_code,
      authorizationCode: dbRecord.authorization_code,
      expiresAt: new Date(dbRecord.expires_at),
      status: dbRecord.status
    };
  }
}