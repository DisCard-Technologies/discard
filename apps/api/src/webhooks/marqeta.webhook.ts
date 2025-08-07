import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger';
import { MarqetaService } from '../services/payments/marqeta.service';
import { AuthorizationService } from '../services/payments/authorization.service';
import { Server as SocketIOServer } from 'socket.io';

interface MarqetaWebhookEvent {
  token: string;
  type: string;
  object_type: string;
  object_token: string;
  created_time: string;
  data: {
    // Common fields
    token?: string;
    user_token?: string;
    card_token?: string;
    created_time?: string;
    last_modified_time?: string;
    
    // Transaction-specific data
    transaction_type?: 'authorization' | 'clearing' | 'completion';
    transaction_state?: 'PENDING' | 'COMPLETION' | 'DECLINED' | 'ERROR';
    identifier?: string;
    amount?: number;
    currency_code?: string;
    merchant?: {
      name: string;
      city: string;
      state: string;
      country: string;
      mcc: string;
    };
    response?: {
      code: string;
      memo: string;
    };
    
    // Card-specific data
    card_state?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'UNACTIVATED';
    last_four?: string;
    pan?: string;
    cvv_number?: string;
    expiration?: string;
  };
}

interface WebSocketNotification {
  type: 'transaction_update' | 'card_status_change' | 'authorization_result';
  cardContext: string;
  data: any;
  timestamp: string;
}

export class MarqetaWebhookHandler {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private marqetaService = new MarqetaService();
  private authorizationService = new AuthorizationService();
  private logger = new Logger('MarqetaWebhookHandler');
  private io?: SocketIOServer;

  constructor(io?: SocketIOServer) {
    this.io = io;
  }

  /**
   * Handle incoming Marqeta webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Validate webhook signature
      const signature = req.headers['x-marqeta-signature'] as string;
      const payload = JSON.stringify(req.body);

      if (!this.marqetaService.validateWebhookSignature(payload, signature)) {
        this.logger.error('Invalid webhook signature', { 
          signature: signature?.substring(0, 20) + '...' 
        });
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const event: MarqetaWebhookEvent = req.body;
      
      this.logger.info('Processing Marqeta webhook', {
        type: event.type,
        objectType: event.object_type,
        objectToken: event.object_token
      });

      // Process event based on type
      await this.processWebhookEvent(event);

      res.status(200).json({ received: true });
    } catch (error) {
      this.logger.error('Webhook processing failed', { error, body: req.body });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Process webhook event based on type
   */
  private async processWebhookEvent(event: MarqetaWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'transaction.authorization':
        await this.handleAuthorizationEvent(event);
        break;
      
      case 'transaction.clearing':
        await this.handleClearingEvent(event);
        break;
      
      case 'transaction.completion':
        await this.handleCompletionEvent(event);
        break;
      
      case 'transaction.declined':
        await this.handleDeclinedEvent(event);
        break;
      
      case 'card.created':
        await this.handleCardCreatedEvent(event);
        break;
      
      case 'card.activated':
        await this.handleCardActivatedEvent(event);
        break;
      
      case 'card.suspended':
        await this.handleCardSuspendedEvent(event);
        break;
      
      case 'card.terminated':
        await this.handleCardTerminatedEvent(event);
        break;
      
      default:
        this.logger.info('Unhandled webhook event type', { type: event.type });
    }
  }

  /**
   * Handle transaction authorization event
   */
  private async handleAuthorizationEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const transactionData = event.data;
      
      if (!transactionData.card_token || !transactionData.token) {
        this.logger.error('Missing required transaction data', { event });
        return;
      }

      // Get card context from our database
      const cardContext = await this.getCardContextFromMarqetaToken(transactionData.card_token);
      
      if (!cardContext) {
        this.logger.error('Card context not found for Marqeta token', { 
          cardToken: transactionData.card_token 
        });
        return;
      }

      // Store transaction record
      await this.storeTransactionRecord({
        transactionId: transactionData.token,
        merchantName: transactionData.merchant?.name || 'Unknown Merchant',
        merchantCategory: transactionData.merchant?.mcc || 'UNKNOWN',
        amount: transactionData.amount || 0,
        status: 'authorized',
        authorizationCode: transactionData.response?.code || '',
        processedAt: new Date().toISOString(),
        cardContext,
        marqetaTransactionToken: transactionData.token
      });

      // Send WebSocket notification
      await this.sendWebSocketNotification({
        type: 'transaction_update',
        cardContext,
        data: {
          type: 'authorization',
          transactionId: transactionData.token,
          merchantName: transactionData.merchant?.name,
          amount: transactionData.amount,
          status: 'authorized',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Authorization event processed', { 
        transactionToken: transactionData.token,
        cardContext
      });
    } catch (error) {
      this.logger.error('Failed to process authorization event', { error, event });
    }
  }

  /**
   * Handle transaction clearing event
   */
  private async handleClearingEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const transactionData = event.data;
      
      if (!transactionData.card_token || !transactionData.token) {
        return;
      }

      const cardContext = await this.getCardContextFromMarqetaToken(transactionData.card_token);
      
      if (!cardContext) {
        this.logger.error('Card context not found for clearing', { 
          cardToken: transactionData.card_token 
        });
        return;
      }

      // Update transaction status
      await this.updateTransactionStatus(
        transactionData.token,
        'settled'
      );

      // Find and clear authorization hold
      const authHolds = await this.authorizationService.getActiveHolds(cardContext);
      const matchingHold = authHolds.find(hold => 
        hold.marqetaTransactionToken === transactionData.token
      );

      if (matchingHold) {
        await this.authorizationService.clearAuthorizationHold(
          matchingHold.holdId,
          transactionData.amount
        );
      }

      // Send WebSocket notification
      await this.sendWebSocketNotification({
        type: 'transaction_update',
        cardContext,
        data: {
          type: 'clearing',
          transactionId: transactionData.token,
          amount: transactionData.amount,
          status: 'settled',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Clearing event processed', { 
        transactionToken: transactionData.token,
        cardContext
      });
    } catch (error) {
      this.logger.error('Failed to process clearing event', { error, event });
    }
  }

  /**
   * Handle transaction completion event
   */
  private async handleCompletionEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const transactionData = event.data;
      
      if (!transactionData.token) {
        return;
      }

      // Update transaction status to completed
      await this.updateTransactionStatus(
        transactionData.token,
        'settled'
      );

      this.logger.info('Completion event processed', { 
        transactionToken: transactionData.token
      });
    } catch (error) {
      this.logger.error('Failed to process completion event', { error, event });
    }
  }

  /**
   * Handle transaction declined event
   */
  private async handleDeclinedEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const transactionData = event.data;
      
      if (!transactionData.card_token || !transactionData.token) {
        return;
      }

      const cardContext = await this.getCardContextFromMarqetaToken(transactionData.card_token);
      
      if (!cardContext) {
        return;
      }

      // Store declined transaction record
      await this.storeTransactionRecord({
        transactionId: transactionData.token,
        merchantName: transactionData.merchant?.name || 'Unknown Merchant',
        merchantCategory: transactionData.merchant?.mcc || 'UNKNOWN',
        amount: transactionData.amount || 0,
        status: 'declined',
        authorizationCode: '',
        processedAt: new Date().toISOString(),
        cardContext,
        marqetaTransactionToken: transactionData.token,
        declineReason: transactionData.response?.memo
      });

      // Send WebSocket notification
      await this.sendWebSocketNotification({
        type: 'transaction_update',
        cardContext,
        data: {
          type: 'declined',
          transactionId: transactionData.token,
          merchantName: transactionData.merchant?.name,
          amount: transactionData.amount,
          status: 'declined',
          declineReason: transactionData.response?.memo,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Declined event processed', { 
        transactionToken: transactionData.token,
        cardContext,
        reason: transactionData.response?.memo
      });
    } catch (error) {
      this.logger.error('Failed to process declined event', { error, event });
    }
  }

  /**
   * Handle card created event
   */
  private async handleCardCreatedEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const cardData = event.data;
      
      if (!cardData.card_token) {
        return;
      }

      this.logger.info('Card created event received', { 
        cardToken: cardData.card_token 
      });

      // Card creation is handled in the visa service
      // This webhook just confirms the creation
    } catch (error) {
      this.logger.error('Failed to process card created event', { error, event });
    }
  }

  /**
   * Handle card activated event
   */
  private async handleCardActivatedEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const cardData = event.data;
      
      if (!cardData.card_token) {
        return;
      }

      const cardContext = await this.getCardContextFromMarqetaToken(cardData.card_token);
      
      if (!cardContext) {
        return;
      }

      // Send WebSocket notification
      await this.sendWebSocketNotification({
        type: 'card_status_change',
        cardContext,
        data: {
          status: 'active',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Card activated event processed', { 
        cardToken: cardData.card_token,
        cardContext
      });
    } catch (error) {
      this.logger.error('Failed to process card activated event', { error, event });
    }
  }

  /**
   * Handle card suspended event
   */
  private async handleCardSuspendedEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const cardData = event.data;
      
      if (!cardData.card_token) {
        return;
      }

      const cardContext = await this.getCardContextFromMarqetaToken(cardData.card_token);
      
      if (!cardContext) {
        return;
      }

      // Send WebSocket notification
      await this.sendWebSocketNotification({
        type: 'card_status_change',
        cardContext,
        data: {
          status: 'suspended',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Card suspended event processed', { 
        cardToken: cardData.card_token,
        cardContext
      });
    } catch (error) {
      this.logger.error('Failed to process card suspended event', { error, event });
    }
  }

  /**
   * Handle card terminated event
   */
  private async handleCardTerminatedEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      const cardData = event.data;
      
      if (!cardData.card_token) {
        return;
      }

      const cardContext = await this.getCardContextFromMarqetaToken(cardData.card_token);
      
      if (!cardContext) {
        return;
      }

      // Send WebSocket notification
      await this.sendWebSocketNotification({
        type: 'card_status_change',
        cardContext,
        data: {
          status: 'terminated',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Card terminated event processed', { 
        cardToken: cardData.card_token,
        cardContext
      });
    } catch (error) {
      this.logger.error('Failed to process card terminated event', { error, event });
    }
  }

  /**
   * Get card context from Marqeta token
   */
  private async getCardContextFromMarqetaToken(marqetaCardToken: string): Promise<string | null> {
    try {
      const { data: visaCard } = await this.supabase
        .from('visa_card_details')
        .select('card_context')
        .eq('marqeta_card_token', marqetaCardToken)
        .single();

      return visaCard?.card_context || null;
    } catch (error) {
      this.logger.error('Failed to get card context', { error, marqetaCardToken });
      return null;
    }
  }

  /**
   * Store transaction record in database
   */
  private async storeTransactionRecord(transaction: {
    transactionId: string;
    merchantName: string;
    merchantCategory: string;
    amount: number;
    status: string;
    authorizationCode: string;
    processedAt: string;
    cardContext: string;
    marqetaTransactionToken: string;
    declineReason?: string;
  }): Promise<void> {
    try {
      await this.supabase
        .from('payment_transactions')
        .insert({
          transaction_id: transaction.transactionId,
          merchant_name: transaction.merchantName,
          merchant_category: transaction.merchantCategory,
          amount: transaction.amount,
          status: transaction.status,
          authorization_code: transaction.authorizationCode,
          processed_at: transaction.processedAt,
          card_context: transaction.cardContext,
          marqeta_transaction_token: transaction.marqetaTransactionToken,
          decline_reason: transaction.declineReason
        });

      this.logger.info('Transaction record stored', { 
        transactionId: transaction.transactionId 
      });
    } catch (error) {
      this.logger.error('Failed to store transaction record', { error, transaction });
    }
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(transactionId: string, status: string): Promise<void> {
    try {
      await this.supabase
        .from('payment_transactions')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('marqeta_transaction_token', transactionId);

      this.logger.info('Transaction status updated', { transactionId, status });
    } catch (error) {
      this.logger.error('Failed to update transaction status', { error, transactionId, status });
    }
  }

  /**
   * Send WebSocket notification to connected clients
   */
  private async sendWebSocketNotification(notification: WebSocketNotification): Promise<void> {
    if (!this.io) {
      this.logger.warn('WebSocket server not available');
      return;
    }

    try {
      // Send to specific card context room
      this.io.to(`card_${notification.cardContext}`).emit('transaction_event', notification);

      this.logger.info('WebSocket notification sent', {
        type: notification.type,
        cardContext: notification.cardContext
      });
    } catch (error) {
      this.logger.error('Failed to send WebSocket notification', { error, notification });
    }
  }

  /**
   * Monitor network connectivity for fallback mechanisms
   */
  async checkNetworkConnectivity(): Promise<{ isHealthy: boolean; lastChecked: string }> {
    try {
      const healthResult = await this.marqetaService.checkNetworkHealth();
      
      // Log connectivity status
      await this.supabase
        .from('network_status_log')
        .insert({
          network_name: 'marqeta',
          endpoint_url: '/ping',
          response_time_ms: healthResult.responseTime,
          status_code: healthResult.isHealthy ? 200 : 500,
          is_healthy: healthResult.isHealthy,
          error_message: healthResult.isHealthy ? null : healthResult.status
        });

      return {
        isHealthy: healthResult.isHealthy,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Network connectivity check failed', { error });
      
      // Log the failure
      await this.supabase
        .from('network_status_log')
        .insert({
          network_name: 'marqeta',
          endpoint_url: '/ping',
          response_time_ms: 0,
          status_code: 0,
          is_healthy: false,
          error_message: error instanceof Error ? error.message : 'Network check failed'
        });

      return {
        isHealthy: false,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * Handle fallback mechanisms when network is unavailable
   */
  async handleNetworkFallback(): Promise<void> {
    this.logger.warn('Activating network fallback mechanisms');

    try {
      // 1. Switch to cached transaction processing
      // 2. Queue webhooks for replay when network recovers
      // 3. Send offline notifications to users
      
      // For now, just log the fallback activation
      this.logger.info('Network fallback mechanisms activated');
      
      // Send broadcast notification about network issues
      if (this.io) {
        this.io.emit('network_status', {
          isHealthy: false,
          message: 'Transaction processing may be delayed due to network issues',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      this.logger.error('Failed to activate network fallback', { error });
    }
  }
}

export default MarqetaWebhookHandler;