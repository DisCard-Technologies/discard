import { supabase } from '../../app';
import { stripeService } from './stripe.service';
import { balanceService } from './balance.service';
import { 
  FundingTransaction, 
  AccountFundingRequest, 
  CardAllocationRequest,
  CardTransferRequest,
  FundingRequestOptions
} from '@discard/shared/src/types/funding';
import { 
  FUNDING_CONSTANTS,
  FUNDING_STATUSES,
  FUNDING_TYPES
} from '@discard/shared/src/constants/funding';
import { 
  validateFundingAmount, 
  validateTransferAmount, 
  generateTransactionId,
  checkDailyFundingLimit,
  checkMonthlyFundingLimit,
  detectSuspiciousVelocity
} from '@discard/shared/src/utils/funding';
import { createHash } from 'crypto';

export class FundingService {
  /**
   * Fund user account with traditional payment methods
   */
  async fundAccount(userId: string, request: AccountFundingRequest): Promise<FundingTransaction> {
    try {
      // Validate funding amount
      const amountValidation = validateFundingAmount(request.amount);
      if (!amountValidation.isValid) {
        throw new Error(amountValidation.error);
      }

      // Check fraud protection limits
      await this.checkFraudLimits(userId);

      // Get or create Stripe customer
      const stripeCustomer = await this.getOrCreateStripeCustomer(userId);

      // Create payment intent with Stripe
      const paymentIntent = await stripeService.createPaymentIntent(
        request.amount,
        request.currency || FUNDING_CONSTANTS.DEFAULT_CURRENCY,
        request.paymentMethodId,
        stripeCustomer.stripe_customer_id,
        {
          userId,
          type: FUNDING_TYPES.ACCOUNT_FUNDING,
        }
      );

      // Create funding transaction record
      const transactionId = generateTransactionId();
      const contextHash = this.generateTransactionContextHash(userId, transactionId);

      const transaction = {
        transaction_id: transactionId,
        user_id: userId,
        transaction_context_hash: contextHash,
        type: FUNDING_TYPES.ACCOUNT_FUNDING,
        amount: request.amount,
        status: paymentIntent.status === 'succeeded' ? FUNDING_STATUSES.COMPLETED : FUNDING_STATUSES.PENDING,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_payment_method_id: request.paymentMethodId,
        stripe_customer_id: stripeCustomer.stripe_customer_id,
        processing_time: paymentIntent.estimatedProcessingTime,
        metadata: JSON.stringify({
          currency: request.currency || FUNDING_CONSTANTS.DEFAULT_CURRENCY,
          payment_intent_client_secret: paymentIntent.clientSecret,
        }),
      };

      const { data: createdTransaction, error } = await supabase
        .from('funding_transactions')
        .insert(transaction)
        .select()
        .single();

      if (error) {
        console.error('Error creating funding transaction:', error);
        throw new Error('Failed to create funding transaction');
      }

      return this.formatFundingTransaction(createdTransaction);
    } catch (error) {
      console.error('Account funding error:', error);
      throw error;
    }
  }

  /**
   * Allocate funds to a specific card
   */
  async allocateToCard(userId: string, request: CardAllocationRequest): Promise<FundingTransaction> {
    try {
      // Validate allocation amount
      const accountBalance = await balanceService.getAccountBalance(userId);
      const amountValidation = validateTransferAmount(request.amount, accountBalance.availableBalance);
      if (!amountValidation.isValid) {
        throw new Error(amountValidation.error);
      }

      // Verify card ownership
      await this.verifyCardOwnership(userId, request.cardId);

      // Create allocation transaction
      const transactionId = generateTransactionId();
      const contextHash = this.generateTransactionContextHash(userId, transactionId);

      const transaction = {
        transaction_id: transactionId,
        user_id: userId,
        transaction_context_hash: contextHash,
        type: FUNDING_TYPES.CARD_ALLOCATION,
        amount: request.amount,
        status: FUNDING_STATUSES.COMPLETED, // Card allocations are instant
        target_card_id: request.cardId,
        processing_time: 0,
      };

      const { data: createdTransaction, error } = await supabase
        .from('funding_transactions')
        .insert(transaction)
        .select()
        .single();

      if (error) {
        console.error('Error creating allocation transaction:', error);
        throw new Error('Failed to create allocation transaction');
      }

      // Create fund allocation record
      await this.createFundAllocation(userId, request.cardId, request.amount, createdTransaction.id);

      return this.formatFundingTransaction(createdTransaction);
    } catch (error) {
      console.error('Card allocation error:', error);
      throw error;
    }
  }

  /**
   * Transfer funds between cards
   */
  async transferBetweenCards(userId: string, request: CardTransferRequest): Promise<FundingTransaction> {
    try {
      // Verify card ownership for both cards
      await this.verifyCardOwnership(userId, request.fromCardId);
      await this.verifyCardOwnership(userId, request.toCardId);

      // Get source card balance and validate transfer amount
      const sourceCardBalance = await balanceService.getCardBalance(request.fromCardId);
      const amountValidation = validateTransferAmount(request.amount, sourceCardBalance.balance);
      if (!amountValidation.isValid) {
        throw new Error(amountValidation.error);
      }

      // Create transfer transaction
      const transactionId = generateTransactionId();
      const contextHash = this.generateTransactionContextHash(userId, transactionId);

      const transaction = {
        transaction_id: transactionId,
        user_id: userId,
        transaction_context_hash: contextHash,
        type: FUNDING_TYPES.CARD_TRANSFER,
        amount: request.amount,
        status: FUNDING_STATUSES.COMPLETED, // Card transfers are instant
        source_card_id: request.fromCardId,
        target_card_id: request.toCardId,
        processing_time: 0,
      };

      const { data: createdTransaction, error } = await supabase
        .from('funding_transactions')
        .insert(transaction)
        .select()
        .single();

      if (error) {
        console.error('Error creating transfer transaction:', error);
        throw new Error('Failed to create transfer transaction');
      }

      return this.formatFundingTransaction(createdTransaction);
    } catch (error) {
      console.error('Card transfer error:', error);
      throw error;
    }
  }

  /**
   * Get funding transaction history
   */
  async getFundingTransactions(
    userId: string, 
    options: FundingRequestOptions = {}
  ): Promise<FundingTransaction[]> {
    try {
      let query = supabase
        .from('funding_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (options.status) {
        query = query.eq('status', options.status);
      }

      if (options.type) {
        query = query.eq('type', options.type);
      }

      if (options.startDate) {
        query = query.gte('created_at', options.startDate);
      }

      if (options.endDate) {
        query = query.lte('created_at', options.endDate);
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, (options.offset + (options.limit || 50)) - 1);
      }

      const { data: transactions, error } = await query;

      if (error) {
        console.error('Error fetching funding transactions:', error);
        throw new Error('Failed to fetch funding transactions');
      }

      return transactions.map(tx => this.formatFundingTransaction(tx));
    } catch (error) {
      console.error('Funding transactions fetch error:', error);
      throw error;
    }
  }

  /**
   * Get funding transaction by ID
   */
  async getFundingTransaction(userId: string, transactionId: string): Promise<FundingTransaction> {
    try {
      const { data: transaction, error } = await supabase
        .from('funding_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('transaction_id', transactionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Transaction not found');
        }
        console.error('Error fetching funding transaction:', error);
        throw new Error('Failed to fetch funding transaction');
      }

      return this.formatFundingTransaction(transaction);
    } catch (error) {
      console.error('Funding transaction fetch error:', error);
      throw error;
    }
  }

  /**
   * Process Stripe webhook for payment updates
   */
  async processStripeWebhook(event: any): Promise<void> {
    try {
      // Check if event has already been processed for idempotency
      const { data: existingEvent } = await supabase
        .from('stripe_webhook_events')
        .select('processed')
        .eq('stripe_event_id', event.id)
        .single();

      if (existingEvent?.processed) {
        console.log('Webhook event already processed:', event.id);
        return;
      }

      // Store webhook event
      await supabase
        .from('stripe_webhook_events')
        .upsert({
          stripe_event_id: event.id,
          event_type: event.type,
          event_data: event.data,
        });

      // Process based on event type
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;
        case 'payment_intent.processing':
          await this.handlePaymentIntentProcessing(event.data.object);
          break;
        default:
          console.log('Unhandled webhook event type:', event.type);
      }

      // Mark as processed
      await supabase
        .from('stripe_webhook_events')
        .update({ 
          processed: true, 
          processed_at: new Date().toISOString() 
        })
        .eq('stripe_event_id', event.id);

    } catch (error) {
      console.error('Webhook processing error:', error);
      
      // Store error for debugging
      await supabase
        .from('stripe_webhook_events')
        .update({ 
          processing_error: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('stripe_event_id', event.id);
      
      throw error;
    }
  }

  /**
   * Check fraud protection limits
   */
  private async checkFraudLimits(userId: string): Promise<void> {
    try {
      // Get recent transactions for fraud checks
      const { data: recentTransactions, error } = await supabase
        .from('funding_transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching transactions for fraud check:', error);
        return; // Don't block on fraud check errors
      }

      const transactions = recentTransactions.map(tx => this.formatFundingTransaction(tx));

      // Check daily limits
      if (checkDailyFundingLimit(transactions)) {
        throw new Error('Daily funding limit exceeded');
      }

      // Check monthly limits
      if (checkMonthlyFundingLimit(transactions)) {
        throw new Error('Monthly funding limit exceeded');
      }

      // Check transaction velocity
      if (detectSuspiciousVelocity(transactions)) {
        throw new Error('Too many recent transactions. Please try again later.');
      }
    } catch (error) {
      console.error('Fraud check error:', error);
      throw error;
    }
  }

  /**
   * Get or create Stripe customer
   */
  private async getOrCreateStripeCustomer(userId: string): Promise<any> {
    try {
      // Try to get existing customer
      const { data: existingCustomer } = await supabase
        .from('stripe_customers')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existingCustomer) {
        return existingCustomer;
      }

      // Get user email
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Create Stripe customer
      const stripeCustomer = await stripeService.createCustomer(userId, user.email);

      // Store customer in database
      const customerData = {
        user_id: userId,
        stripe_customer_id: stripeCustomer.id,
      };

      const { data: createdCustomer, error } = await supabase
        .from('stripe_customers')
        .insert(customerData)
        .select()
        .single();

      if (error) {
        console.error('Error storing Stripe customer:', error);
        throw new Error('Failed to store customer data');
      }

      return createdCustomer;
    } catch (error) {
      console.error('Stripe customer error:', error);
      throw error;
    }
  }

  /**
   * Verify card ownership
   */
  private async verifyCardOwnership(userId: string, cardId: string): Promise<void> {
    const { data: card, error } = await supabase
      .from('cards')
      .select('user_id, status')
      .eq('card_id', cardId)
      .single();

    if (error || !card) {
      throw new Error('Card not found');
    }

    if (card.user_id !== userId) {
      throw new Error('Card does not belong to user');
    }

    if (card.status === 'deleted') {
      throw new Error('Cannot operate on deleted card');
    }
  }

  /**
   * Create fund allocation record
   */
  private async createFundAllocation(
    userId: string, 
    cardId: string, 
    amount: number, 
    transactionId: string
  ): Promise<void> {
    const allocationContextHash = this.generateAllocationContextHash(userId, cardId, transactionId);

    const allocation = {
      user_id: userId,
      card_id: cardId,
      allocation_context_hash: allocationContextHash,
      amount,
      transaction_id: transactionId,
    };

    const { error } = await supabase
      .from('fund_allocations')
      .insert(allocation);

    if (error) {
      console.error('Error creating fund allocation:', error);
      throw new Error('Failed to create fund allocation record');
    }
  }

  /**
   * Handle successful payment intent
   */
  private async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    try {
      const { data: transaction, error } = await supabase
        .from('funding_transactions')
        .update({ 
          status: FUNDING_STATUSES.COMPLETED,
          completed_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating transaction status:', error);
        return;
      }

      console.log('Payment intent succeeded for transaction:', transaction.transaction_id);
    } catch (error) {
      console.error('Handle payment success error:', error);
    }
  }

  /**
   * Handle failed payment intent
   */
  private async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('funding_transactions')
        .update({ 
          status: FUNDING_STATUSES.FAILED,
          error_message: paymentIntent.last_payment_error?.message || 'Payment failed',
          error_code: paymentIntent.last_payment_error?.code,
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (error) {
        console.error('Error updating failed transaction:', error);
      }
    } catch (error) {
      console.error('Handle payment failure error:', error);
    }
  }

  /**
   * Handle processing payment intent
   */
  private async handlePaymentIntentProcessing(paymentIntent: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('funding_transactions')
        .update({ status: FUNDING_STATUSES.PROCESSING })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (error) {
        console.error('Error updating processing transaction:', error);
      }
    } catch (error) {
      console.error('Handle payment processing error:', error);
    }
  }

  /**
   * Generate transaction context hash for privacy isolation
   */
  private generateTransactionContextHash(userId: string, transactionId: string): string {
    const contextData = `funding_${userId}_${transactionId}_${Date.now()}`;
    return createHash('sha256').update(contextData).digest('hex');
  }

  /**
   * Generate allocation context hash for privacy isolation
   */
  private generateAllocationContextHash(userId: string, cardId: string, transactionId: string): string {
    const contextData = `allocation_${userId}_${cardId}_${transactionId}_${Date.now()}`;
    return createHash('sha256').update(contextData).digest('hex');
  }

  /**
   * Format funding transaction for API response
   */
  private formatFundingTransaction(dbTransaction: any): FundingTransaction {
    return {
      id: dbTransaction.id,
      userId: dbTransaction.user_id,
      type: dbTransaction.type,
      amount: dbTransaction.amount,
      status: dbTransaction.status,
      paymentMethodId: dbTransaction.stripe_payment_method_id,
      sourceCardId: dbTransaction.source_card_id,
      targetCardId: dbTransaction.target_card_id,
      stripePaymentIntentId: dbTransaction.stripe_payment_intent_id,
      errorMessage: dbTransaction.error_message,
      processingTime: dbTransaction.processing_time,
      createdAt: dbTransaction.created_at,
      updatedAt: dbTransaction.updated_at,
    };
  }
}

export const fundingService = new FundingService();