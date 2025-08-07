import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';
import { RestrictionsService } from './restrictions.service';
import { FraudDetectionService } from './fraud-detection.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { DeclineReasonsService } from './decline-reasons.service';
import { AuthorizationHoldsService } from './authorization-holds.service';

interface AuthorizationRequest {
  cardContext: string;
  marqetaTransactionToken: string;
  merchantName: string;
  merchantCategoryCode: string;
  amount: number; // Amount in cents
  currencyCode: string;
  merchantLocation?: {
    country: string;
    city?: string;
    coordinates?: { lat: number; lng: number; };
  };
}

interface AuthorizationTransaction {
  authorizationId: string;
  cardContext: string;
  marqetaTransactionToken: string;
  merchantName: string;
  merchantCategoryCode: string;
  authorizationAmount: number;
  currencyCode: string;
  exchangeRate?: number;
  convertedAmount?: number;
  authorizationCode?: string;
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'reversed';
  declineReason?: string;
  declineCode?: string;
  responseTimeMs: number;
  riskScore: number;
  processedAt: Date;
  expiresAt: Date;
  merchantLocationCountry?: string;
  merchantLocationCity?: string;
  retryCount: number;
}

interface AuthorizationResponse {
  authorizationId: string;
  status: 'approved' | 'declined' | 'pending';
  authorizationCode?: string;
  declineReason?: string;
  declineCode?: string;
  holdId?: string;
  responseTimeMs: number;
  riskScore: number;
  currencyConversion?: {
    originalAmount: number;
    originalCurrency: string;
    convertedAmount: number;
    exchangeRate: number;
    conversionFee: number;
  };
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
  private fraudDetectionService = new FraudDetectionService();
  private currencyConversionService = new CurrencyConversionService();
  private declineReasonsService = new DeclineReasonsService();
  private authorizationHoldsService = new AuthorizationHoldsService();
  private logger = new Logger('AuthorizationService');
  private readonly maxResponseTime = parseInt(process.env.AUTHORIZATION_RESPONSE_TIMEOUT_MS || '800');
  private readonly maxRetries = parseInt(process.env.MAX_AUTHORIZATION_RETRIES || '3');
  private readonly retryDelayMs = parseInt(process.env.AUTHORIZATION_RETRY_DELAY_MS || '1000');

  /**
   * Process authorization request with sub-second response time and comprehensive fraud detection
   */
  async processAuthorization(request: AuthorizationRequest, retryCount: number = 0): Promise<AuthorizationResponse> {
    const startTime = Date.now();
    let authorizationId: string | null = null;
    
    try {
      this.logger.info('Processing authorization request', { 
        cardContext: request.cardContext,
        merchantName: request.merchantName,
        amount: request.amount,
        retryCount
      });

      // Set row-level security context
      await this.setCardContext(request.cardContext);

      // 1. Validate request format
      this.validateAuthorizationRequest(request);

      // 2. Handle multi-currency conversion if needed
      let conversionResult = null;
      let processedAmount = request.amount;
      
      if (request.currencyCode !== 'USD') {
        conversionResult = await this.currencyConversionService.convertCurrency(
          request.amount,
          request.currencyCode,
          'USD'
        );
        processedAmount = conversionResult.convertedAmount;
      }

      // 3. Check merchant restrictions (geographic and category)
      const restrictionCheck = await this.restrictionsService.validateTransaction(
        request.cardContext,
        request.merchantCategoryCode,
        request.merchantLocation?.country || 'US'
      );

      if (!restrictionCheck.allowed) {
        authorizationId = await this.createAuthorizationTransaction(
          request, startTime, 'declined', 'RESTRICTION_VIOLATION', 0, retryCount, conversionResult
        );
        return this.createDeclinedResponse(
          startTime,
          authorizationId,
          'RESTRICTION_VIOLATION',
          restrictionCheck.reason || 'Transaction violates card restrictions',
          0
        );
      }

      // 4. Check card status and balance with overdraft protection
      const balanceCheck = await this.checkCardBalanceWithOverdraft(request.cardContext, processedAmount);
      
      if (!balanceCheck.hasBalance) {
        authorizationId = await this.createAuthorizationTransaction(
          request, startTime, 'declined', 'INSUFFICIENT_FUNDS', 0, retryCount, conversionResult
        );
        return this.createDeclinedResponse(
          startTime,
          authorizationId,
          'INSUFFICIENT_FUNDS',
          'Insufficient balance for transaction',
          0
        );
      }

      // 5. Comprehensive fraud detection with privacy isolation
      const fraudAnalysis = await this.fraudDetectionService.analyzeTransaction({
        cardContext: request.cardContext,
        amount: processedAmount,
        merchantName: request.merchantName,
        merchantCategoryCode: request.merchantCategoryCode,
        merchantCountry: request.merchantLocation?.country || 'US',
        transactionTime: new Date()
      });

      // 6. Create authorization transaction record
      authorizationId = await this.createAuthorizationTransaction(
        request, startTime, 'pending', null, fraudAnalysis.riskScore, retryCount, conversionResult
      );

      // 7. Make authorization decision based on risk score
      if (fraudAnalysis.action === 'decline') {
        await this.updateAuthorizationStatus(authorizationId, 'declined', 'FRAUD_SUSPECTED');
        return this.createDeclinedResponse(
          startTime,
          authorizationId,
          'FRAUD_SUSPECTED',
          'Transaction flagged for suspected fraud',
          fraudAnalysis.riskScore
        );
      }

      // 8. Create authorization hold
      const authorizationCode = this.generateAuthorizationCode();
      const hold = await this.authorizationHoldsService.createHold({
        cardContext: request.cardContext,
        authorizationId,
        marqetaTransactionToken: request.marqetaTransactionToken,
        merchantName: request.merchantName,
        merchantCategoryCode: request.merchantCategoryCode,
        authorizationAmount: request.amount,
        holdAmount: processedAmount,
        currencyCode: request.currencyCode,
        authorizationCode,
        riskScore: fraudAnalysis.riskScore,
        responseTimeMs: Date.now() - startTime
      });

      // 9. Reserve funds with balance update
      await this.reserveFunds(request.cardContext, processedAmount);

      // 10. Update authorization status to approved
      await this.updateAuthorizationStatus(authorizationId, 'approved', null, authorizationCode);

      const responseTime = Date.now() - startTime;
      
      // Ensure sub-second response time monitoring
      if (responseTime > this.maxResponseTime) {
        this.logger.warn('Authorization response time exceeded threshold', { 
          responseTime, 
          threshold: this.maxResponseTime,
          authorizationId
        });
      }

      // 11. Record authorization metrics
      await this.recordAuthorizationMetrics(request.cardContext, responseTime, true, fraudAnalysis.riskScore);

      const response: AuthorizationResponse = {
        authorizationId,
        status: 'approved',
        authorizationCode,
        holdId: hold.holdId,
        responseTimeMs: responseTime,
        riskScore: fraudAnalysis.riskScore,
        currencyConversion: conversionResult || undefined
      };

      this.logger.info('Authorization approved', { 
        cardContext: request.cardContext,
        authorizationId,
        authorizationCode,
        responseTime,
        riskScore: fraudAnalysis.riskScore
      });

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Authorization processing failed', { 
        error, 
        request,
        responseTime,
        authorizationId,
        retryCount
      });

      // Update authorization status if we have an ID
      if (authorizationId) {
        await this.updateAuthorizationStatus(authorizationId, 'declined', 'PROCESSING_ERROR');
      } else {
        // Create a failed authorization record
        authorizationId = await this.createAuthorizationTransaction(
          request, startTime, 'declined', 'PROCESSING_ERROR', 0, retryCount
        );
      }

      // Record failed authorization metrics
      await this.recordAuthorizationMetrics(request.cardContext, responseTime, false, 0);

      return this.createDeclinedResponse(
        startTime,
        authorizationId,
        'PROCESSING_ERROR',
        'Authorization processing failed',
        0
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
   * Private: Check card balance with overdraft protection
   */
  private async checkCardBalanceWithOverdraft(cardContext: string, amount: number): Promise<BalanceCheckResult> {
    const { data: card } = await this.supabase
      .from('cards')
      .select('status, current_balance, spending_limit, overdraft_limit')
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

    // Calculate available balance including overdraft protection
    const overdraftLimit = card.overdraft_limit || 0;
    const totalAvailable = card.current_balance + overdraftLimit;
    const hasBalance = totalAvailable >= amount;
    
    return {
      hasBalance,
      availableBalance: totalAvailable,
      cardStatus: card.status,
      spendingLimit: card.spending_limit
    };
  }

  /**
   * Private: Check card balance and status (legacy method)
   */
  private async checkCardBalance(cardContext: string, amount: number): Promise<BalanceCheckResult> {
    return this.checkCardBalanceWithOverdraft(cardContext, amount);
  }

  /**
   * Private: Create authorization transaction record
   */
  private async createAuthorizationTransaction(
    request: AuthorizationRequest,
    startTime: number,
    status: 'pending' | 'approved' | 'declined',
    declineCode?: string | null,
    riskScore: number = 0,
    retryCount: number = 0,
    conversionResult?: any
  ): Promise<string> {
    const authorizationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hour expiry

    const { error } = await this.supabase
      .from('authorization_transactions')
      .insert({
        authorization_id: authorizationId,
        card_context: request.cardContext,
        marqeta_transaction_token: request.marqetaTransactionToken,
        merchant_name: request.merchantName,
        merchant_category_code: request.merchantCategoryCode,
        authorization_amount: request.amount,
        currency_code: request.currencyCode,
        exchange_rate: conversionResult?.exchangeRate,
        converted_amount: conversionResult?.convertedAmount,
        status,
        decline_code: declineCode,
        response_time_ms: Date.now() - startTime,
        risk_score: riskScore,
        expires_at: expiresAt.toISOString(),
        merchant_location_country: request.merchantLocation?.country,
        merchant_location_city: request.merchantLocation?.city,
        retry_count: retryCount
      });

    if (error) {
      this.logger.error('Failed to create authorization transaction', { error, authorizationId });
      throw error;
    }

    return authorizationId;
  }

  /**
   * Private: Update authorization transaction status
   */
  private async updateAuthorizationStatus(
    authorizationId: string,
    status: 'approved' | 'declined' | 'expired',
    declineCode?: string | null,
    authorizationCode?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('authorization_transactions')
      .update({
        status,
        decline_code: declineCode,
        authorization_code: authorizationCode
      })
      .eq('authorization_id', authorizationId);

    if (error) {
      this.logger.error('Failed to update authorization status', { error, authorizationId, status });
      throw error;
    }
  }

  /**
   * Private: Record authorization metrics for monitoring
   */
  private async recordAuthorizationMetrics(
    cardContext: string,
    responseTime: number,
    success: boolean,
    riskScore: number
  ): Promise<void> {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 60000); // 1-minute window

      await this.supabase
        .from('authorization_metrics')
        .insert([
          {
            card_context: cardContext,
            metric_type: 'response_time',
            metric_value: responseTime,
            measurement_window_start: windowStart.toISOString(),
            measurement_window_end: now.toISOString()
          },
          {
            card_context: cardContext,
            metric_type: success ? 'success_rate' : 'decline_rate',
            metric_value: 1,
            measurement_window_start: windowStart.toISOString(),
            measurement_window_end: now.toISOString()
          },
          {
            card_context: cardContext,
            metric_type: 'fraud_detection',
            metric_value: riskScore,
            measurement_window_start: windowStart.toISOString(),
            measurement_window_end: now.toISOString()
          }
        ]);
    } catch (error) {
      // Don't fail authorization processing if metrics recording fails
      this.logger.warn('Failed to record authorization metrics', { error, cardContext });
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
    const { error } = await this.supabase.rpc('decrement_card_balance', {
      p_card_context: cardContext,
      p_amount: amount
    });
    
    if (error) {
      throw new Error(`Failed to reserve funds: ${error.message}`);
    }
  }

  /**
   * Private: Release reserved funds
   */
  private async releaseFunds(cardContext: string, amount: number): Promise<void> {
    const { error } = await this.supabase.rpc('increment_card_balance', {
      p_card_context: cardContext,
      p_amount: amount
    });
    
    if (error) {
      throw new Error(`Failed to release funds: ${error.message}`);
    }
  }

  /**
   * Private: Generate authorization code
   */
  private generateAuthorizationCode(): string {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  /**
   * Process authorization retry with exponential backoff
   */
  async retryAuthorization(originalRequest: AuthorizationRequest, previousAuthorizationId: string): Promise<AuthorizationResponse> {
    try {
      // Get the previous authorization attempt
      const { data: prevAuth } = await this.supabase
        .from('authorization_transactions')
        .select('retry_count')
        .eq('authorization_id', previousAuthorizationId)
        .single();

      const currentRetryCount = (prevAuth?.retry_count || 0) + 1;

      if (currentRetryCount > this.maxRetries) {
        this.logger.warn('Maximum retry attempts exceeded', { 
          previousAuthorizationId, 
          retryCount: currentRetryCount 
        });
        
        return this.createDeclinedResponse(
          Date.now(),
          previousAuthorizationId,
          'MAX_RETRIES_EXCEEDED',
          'Maximum retry attempts exceeded',
          0
        );
      }

      // Apply exponential backoff delay
      const delay = this.retryDelayMs * Math.pow(2, currentRetryCount - 1);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Process retry
      return await this.processAuthorization(originalRequest, currentRetryCount);
    } catch (error) {
      this.logger.error('Authorization retry failed', { error, previousAuthorizationId });
      throw error;
    }
  }

  /**
   * Get authorization status
   */
  async getAuthorizationStatus(authorizationId: string): Promise<AuthorizationTransaction | null> {
    try {
      const { data } = await this.supabase
        .from('authorization_transactions')
        .select('*')
        .eq('authorization_id', authorizationId)
        .single();

      if (!data) return null;

      return this.mapToAuthorizationTransaction(data);
    } catch (error) {
      this.logger.error('Failed to get authorization status', { error, authorizationId });
      throw error;
    }
  }

  /**
   * Private: Create declined response with enhanced data
   */
  private createDeclinedResponse(
    startTime: number, 
    authorizationId: string,
    declineCode: string, 
    declineReason: string,
    riskScore: number
  ): AuthorizationResponse {
    const responseTime = Date.now() - startTime;
    
    return {
      authorizationId,
      status: 'declined',
      declineCode,
      declineReason,
      responseTimeMs: responseTime,
      riskScore
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

  /**
   * Private: Map database record to AuthorizationTransaction interface
   */
  private mapToAuthorizationTransaction(dbRecord: any): AuthorizationTransaction {
    return {
      authorizationId: dbRecord.authorization_id,
      cardContext: dbRecord.card_context,
      marqetaTransactionToken: dbRecord.marqeta_transaction_token,
      merchantName: dbRecord.merchant_name,
      merchantCategoryCode: dbRecord.merchant_category_code,
      authorizationAmount: dbRecord.authorization_amount,
      currencyCode: dbRecord.currency_code,
      exchangeRate: dbRecord.exchange_rate,
      convertedAmount: dbRecord.converted_amount,
      authorizationCode: dbRecord.authorization_code,
      status: dbRecord.status,
      declineReason: dbRecord.decline_reason,
      declineCode: dbRecord.decline_code,
      responseTimeMs: dbRecord.response_time_ms,
      riskScore: dbRecord.risk_score,
      processedAt: new Date(dbRecord.processed_at),
      expiresAt: new Date(dbRecord.expires_at),
      merchantLocationCountry: dbRecord.merchant_location_country,
      merchantLocationCity: dbRecord.merchant_location_city,
      retryCount: dbRecord.retry_count
    };
  }
}