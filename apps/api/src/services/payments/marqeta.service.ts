import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';
import { createHash, createHmac } from 'crypto';

interface MarqetaCard {
  token: string;
  user_token: string;
  card_product_token: string;
  last_four: string;
  pan: string;
  cvv_number: string;
  expiration: string;
  expiration_time: string;
  barcode: string;
  pin_is_set: boolean;
  state: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'UNACTIVATED';
  state_reason: string;
  fulfillment_status: string;
  instrument_type: string;
  expedite: boolean;
  metadata: Record<string, any>;
  created_time: string;
  last_modified_time: string;
}

interface MarqetaTransaction {
  token: string;
  type: 'authorization' | 'clearing' | 'completion';
  state: 'PENDING' | 'COMPLETION' | 'DECLINED' | 'ERROR';
  identifier: string;
  user_token: string;
  card_token: string;
  amount: number;
  currency_code: string;
  merchant: {
    name: string;
    city: string;
    state: string;
    country: string;
    mcc: string;
  };
  response: {
    code: string;
    memo: string;
  };
  created_time: string;
}

interface MarqetaCardRequest {
  card_product_token: string;
  user_token: string;
  fulfillment?: {
    card_personalization?: {
      text?: {
        name_line_1?: {
          value: string;
        };
      };
    };
  };
  metadata?: Record<string, any>;
}

interface MarqetaUser {
  token: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  birth_date: string | null;
  ssn: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  metadata: Record<string, any>;
  created_time: string;
  last_modified_time: string;
}

interface MarqetaUserRequest {
  token?: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  birth_date?: string;
  ssn?: string;
  metadata?: Record<string, any>;
}

interface MarqetaWebhookEvent {
  token: string;
  type: string;
  object_type: string;
  object_token: string;
  created_time: string;
  data: MarqetaTransaction | MarqetaCard;
}

interface RateLimitState {
  requests: number[];
  resetTime: number;
}

export class MarqetaService {
  private client: AxiosInstance;
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('MarqetaService');
  private rateLimitState: RateLimitState = { requests: [], resetTime: 0 };
  private readonly MAX_REQUESTS_PER_MINUTE = 1000;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

  constructor() {
    const baseURL = process.env.MARQETA_BASE_URL || 'https://sandbox-api.marqeta.com/v3';
    const applicationToken = process.env.MARQETA_APPLICATION_TOKEN;
    const accessToken = process.env.MARQETA_ACCESS_TOKEN;

    if (!applicationToken || !accessToken) {
      throw new Error('Marqeta credentials not configured');
    }

    this.client = axios.create({
      baseURL,
      auth: {
        username: applicationToken,
        password: accessToken
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: parseInt(process.env.PAYMENT_PROCESSING_TIMEOUT || '5000')
    });

    // Request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      return config;
    });

    // Response interceptor for error handling and retries
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        return this.handleResponseError(error);
      }
    );
  }

  /**
   * Create or get a user in Marqeta system
   */
  async createUser(userToken: string, userData?: Partial<MarqetaUserRequest>): Promise<MarqetaUser> {
    try {
      this.logger.info('Creating Marqeta user', { userToken });

      // Try to get existing user first
      try {
        const existingUser = await this.getUser(userToken);
        this.logger.info('User already exists in Marqeta', { userToken });
        return existingUser;
      } catch (error) {
        this.logger.info('User not found, creating new user', { 
          userToken,
          getUserError: this.extractErrorMessage(error),
          getUserErrorCode: this.extractErrorCode(error)
        });
      }

      const userRequest: MarqetaUserRequest = {
        token: userToken,
        email: userData?.email || `user-${userToken}@discard.app`,
        first_name: userData?.first_name || 'Discard',
        last_name: userData?.last_name || 'User',
        phone: userData?.phone,
        address1: userData?.address1,
        address2: userData?.address2,
        city: userData?.city,
        state: userData?.state,
        zip: userData?.zip,
        country: userData?.country || 'US',
        birth_date: userData?.birth_date,
        ssn: userData?.ssn,
        metadata: {
          created_by: 'discard_app',
          user_context: userToken,
          ...userData?.metadata
        }
      };

      this.logger.info('Attempting user creation with request', { 
        userToken,
        email: userRequest.email,
        country: userRequest.country
      });

      const response = await this.client.post<MarqetaUser>('/users', userRequest);
      
      this.logger.info('Marqeta user created successfully', { 
        userToken: response.data.token,
        email: response.data.email
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Marqeta user', { 
        error: this.extractErrorMessage(error),
        errorCode: this.extractErrorCode(error),
        userToken,
        statusCode: (error as any)?.response?.status,
        responseData: (error as any)?.response?.data
      });
      throw error;
    }
  }

  /**
   * Get user details from Marqeta
   */
  async getUser(userToken: string): Promise<MarqetaUser> {
    try {
      const response = await this.client.get<MarqetaUser>(`/users/${userToken}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get Marqeta user', { error, userToken });
      throw error;
    }
  }

  /**
   * Create a new card in Marqeta system (ensures user exists first)
   */
  async createCard(cardContext: string, userToken: string, metadata?: Record<string, any>, userData?: Partial<MarqetaUserRequest>): Promise<MarqetaCard> {
    try {
      this.logger.info('Creating Marqeta card', { cardContext, userToken });

      // Try to ensure user exists before creating card, but continue if it fails
      try {
        await this.createUser(userToken, userData);
        this.logger.info('User creation/verification completed', { userToken });
      } catch (userError) {
        this.logger.warn('User creation failed, attempting card creation anyway', { 
          userToken, 
          userError: this.extractErrorMessage(userError),
          errorCode: this.extractErrorCode(userError)
        });
        // Continue with card creation - maybe user already exists but API doesn't have read permissions
      }

      const cardRequest: MarqetaCardRequest = {
        card_product_token: process.env.MARQETA_CARD_PRODUCT_TOKEN!,
        user_token: userToken,
        fulfillment: {
          card_personalization: {
            text: {
              name_line_1: {
                value: "DISCARD"
              }
            }
          }
        },
        metadata: {
          card_context: cardContext,
          created_by: 'discard_app',
          ...metadata
        }
      };

      this.logger.info('Attempting card creation with request', { 
        cardProductToken: process.env.MARQETA_CARD_PRODUCT_TOKEN,
        userToken,
        metadata: cardRequest.metadata
      });

      const response = await this.client.post<MarqetaCard>('/cards', cardRequest);
      
      // Log provisioning status
      await this.updateProvisioningStatus(
        cardContext,
        response.data.token,
        'card_creation',
        'completed'
      );

      this.logger.info('Marqeta card created successfully', { 
        cardToken: response.data.token,
        lastFour: response.data.last_four 
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Marqeta card', { 
        error: this.extractErrorMessage(error),
        errorCode: this.extractErrorCode(error),
        cardContext,
        userToken,
        statusCode: (error as any)?.response?.status,
        responseData: (error as any)?.response?.data
      });
      
      await this.updateProvisioningStatus(
        cardContext,
        '',
        'card_creation',
        'failed',
        this.extractErrorCode(error),
        this.extractErrorMessage(error)
      );
      
      throw error;
    }
  }

  /**
   * Retrieve full card details including PAN and CVV
   */
  async getCardDetails(cardToken: string, retryCount: number = 0): Promise<{
    pan: string;
    cvv: string;
    expiration: string;
    expiration_time: string;
  }> {
    try {
      this.logger.info('Retrieving card PAN and CVV', { cardToken, retryCount });

      const response = await this.client.get(`/cards/${cardToken}/showpan?show_cvv_number=true&show_pan=true`);
      
      this.logger.info('Showpan API response', { 
        cardToken,
        responseData: response.data,
        responseKeys: Object.keys(response.data || {})
      });
      
      // Check if card details are available - try multiple CVV field names
      const cvvValue = response.data?.cvv_number || response.data?.cvv || response.data?.cvv2;
      if (!response.data.pan || !cvvValue) {
        this.logger.warn('Card details not immediately available', {
          hasData: !!response.data,
          hasPan: !!response.data?.pan,
          hasCvv: !!cvvValue,
          cvvFieldChecked: ['cvv_number', 'cvv', 'cvv2'],
          actualKeys: Object.keys(response.data || {}),
          responseData: response.data,
          retryCount
        });
        
        // Retry up to 3 times with exponential backoff for virtual card processing
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          this.logger.info(`Retrying card details retrieval in ${delay}ms`, { cardToken, retryCount });
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.getCardDetails(cardToken, retryCount + 1);
        }
        
        this.logger.error('Card details validation failed after retries', {
          hasData: !!response.data,
          hasPan: !!response.data?.pan,
          hasCvv: !!cvvValue,
          cvvFieldChecked: ['cvv_number', 'cvv', 'cvv2'],
          actualKeys: Object.keys(response.data || {}),
          responseData: response.data,
          finalRetryCount: retryCount
        });
        throw new Error('Card details incomplete: PAN or CVV not returned after retries');
      }

      this.logger.info('Card details retrieved successfully', { 
        cardToken,
        hasPan: !!response.data.pan,
        hasCvv: !!cvvValue,
        retryCount
      });

      return {
        pan: response.data.pan,
        cvv: cvvValue,
        expiration: response.data.expiration,
        expiration_time: response.data.expiration_time
      };
    } catch (error) {
      this.logger.error('Failed to retrieve card details', {
        error: this.extractErrorMessage(error),
        errorCode: this.extractErrorCode(error),
        cardToken,
        statusCode: (error as any)?.response?.status,
        retryCount
      });
      throw error;
    }
  }

  /**
   * Activate a card in Marqeta system
   */
  async activateCard(cardContext: string, marqetaCardToken: string): Promise<MarqetaCard> {
    try {
      this.logger.info('Activating Marqeta card', { cardContext, marqetaCardToken });

      await this.updateProvisioningStatus(
        cardContext,
        marqetaCardToken,
        'activation',
        'in_progress'
      );

      const response = await this.client.put<MarqetaCard>(`/cards/${marqetaCardToken}`, {
        state: 'ACTIVE'
      });

      await this.updateProvisioningStatus(
        cardContext,
        marqetaCardToken,
        'activation',
        'completed'
      );

      // Update network registration status
      await this.updateProvisioningStatus(
        cardContext,
        marqetaCardToken,
        'network_registration',
        'completed'
      );

      this.logger.info('Marqeta card activated successfully', { 
        cardToken: marqetaCardToken,
        state: response.data.state 
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to activate Marqeta card', { error, cardContext, marqetaCardToken });
      
      await this.updateProvisioningStatus(
        cardContext,
        marqetaCardToken,
        'activation',
        'failed',
        this.extractErrorCode(error),
        this.extractErrorMessage(error)
      );
      
      throw error;
    }
  }

  /**
   * Get card details from Marqeta
   */
  async getCard(cardToken: string): Promise<MarqetaCard> {
    try {
      const response = await this.client.get<MarqetaCard>(`/cards/${cardToken}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get Marqeta card', { error, cardToken });
      throw error;
    }
  }

  /**
   * Suspend a card
   */
  async suspendCard(cardContext: string, marqetaCardToken: string): Promise<MarqetaCard> {
    try {
      this.logger.info('Suspending Marqeta card', { cardContext, marqetaCardToken });

      const response = await this.client.put<MarqetaCard>(`/cards/${marqetaCardToken}`, {
        state: 'SUSPENDED'
      });

      this.logger.info('Marqeta card suspended successfully', { 
        cardToken: marqetaCardToken,
        state: response.data.state 
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to suspend Marqeta card', { error, cardContext, marqetaCardToken });
      throw error;
    }
  }

  /**
   * Terminate a card (permanent)
   */
  async terminateCard(cardContext: string, marqetaCardToken: string): Promise<MarqetaCard> {
    try {
      this.logger.info('Terminating Marqeta card', { cardContext, marqetaCardToken });

      const response = await this.client.put<MarqetaCard>(`/cards/${marqetaCardToken}`, {
        state: 'TERMINATED'
      });

      this.logger.info('Marqeta card terminated successfully', { 
        cardToken: marqetaCardToken,
        state: response.data.state 
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to terminate Marqeta card', { error, cardContext, marqetaCardToken });
      throw error;
    }
  }

  /**
   * Cancel a card for secure deletion (alias for terminate with additional logging)
   */
  async cancelCard(marqetaCardToken: string): Promise<MarqetaCard> {
    try {
      this.logger.info('Cancelling Marqeta card for deletion', { marqetaCardToken });

      // Use terminate state for permanent cancellation
      const response = await this.client.put<MarqetaCard>(`/cards/${marqetaCardToken}`, {
        state: 'TERMINATED',
        state_reason: 'CARD_DELETION_REQUEST'
      });

      // Log network cancellation confirmation
      await this.logNetworkCancellation(marqetaCardToken, response.data);

      this.logger.info('Marqeta card cancelled successfully for deletion', { 
        cardToken: marqetaCardToken,
        state: response.data.state,
        stateReason: response.data.state_reason
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to cancel Marqeta card', { error, marqetaCardToken });
      throw new Error(`Network card cancellation failed: ${this.extractErrorMessage(error)}`);
    }
  }

  /**
   * Verify card cancellation status with network
   */
  async verifyCardCancellation(marqetaCardToken: string): Promise<{ cancelled: boolean; status: string }> {
    try {
      const card = await this.getCard(marqetaCardToken);
      
      const cancelled = card.state === 'TERMINATED';
      
      this.logger.info('Card cancellation status verified', { 
        marqetaCardToken, 
        cancelled, 
        status: card.state 
      });

      return { 
        cancelled, 
        status: card.state 
      };
    } catch (error) {
      this.logger.error('Failed to verify card cancellation', { error, marqetaCardToken });
      throw error;
    }
  }

  /**
   * Get transactions for a card
   */
  async getCardTransactions(cardToken: string, count: number = 50): Promise<MarqetaTransaction[]> {
    try {
      const response = await this.client.get<{ data: MarqetaTransaction[] }>(
        `/cards/${cardToken}/transactions?count=${count}&sort_by=-created_time`
      );
      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to get card transactions', { error, cardToken });
      throw error;
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      const webhookSecret = process.env.MARQETA_WEBHOOK_SECRET;
      if (!webhookSecret) {
        this.logger.error('Webhook secret not configured');
        return false;
      }

      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const providedSignature = signature.replace('sha256=', '');
      
      return createHash('sha256')
        .update(expectedSignature)
        .digest('hex') === createHash('sha256')
        .update(providedSignature)
        .digest('hex');
    } catch (error) {
      this.logger.error('Failed to validate webhook signature', { error });
      return false;
    }
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(event: MarqetaWebhookEvent): Promise<void> {
    try {
      this.logger.info('Processing Marqeta webhook event', { 
        type: event.type,
        objectType: event.object_type,
        objectToken: event.object_token 
      });

      switch (event.type) {
        case 'transaction.authorization':
        case 'transaction.clearing':
        case 'transaction.completion':
          await this.handleTransactionEvent(event.data as MarqetaTransaction);
          break;
        
        case 'card.created':
        case 'card.activated':
        case 'card.suspended':
        case 'card.terminated':
          await this.handleCardStateChange(event.data as MarqetaCard);
          break;
        
        default:
          this.logger.info('Unhandled webhook event type', { type: event.type });
      }
    } catch (error) {
      this.logger.error('Failed to process webhook event', { error, event });
      throw error;
    }
  }

  /**
   * Check network connectivity and health
   */
  async checkNetworkHealth(): Promise<{ isHealthy: boolean; responseTime: number; status: string }> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.get('/ping');
      const responseTime = Date.now() - startTime;
      
      const result = {
        isHealthy: response.status === 200,
        responseTime,
        status: `HTTP ${response.status}`
      };

      // Log network status
      await this.logNetworkStatus('marqeta', '/ping', responseTime, response.status, true);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result = {
        isHealthy: false,
        responseTime,
        status: this.extractErrorMessage(error)
      };

      // Log network status
      await this.logNetworkStatus('marqeta', '/ping', responseTime, 0, false, this.extractErrorMessage(error));

      return result;
    }
  }

  /**
   * Private: Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old requests
    this.rateLimitState.requests = this.rateLimitState.requests.filter(time => time > oneMinuteAgo);

    if (this.rateLimitState.requests.length >= this.MAX_REQUESTS_PER_MINUTE) {
      const oldestRequest = this.rateLimitState.requests[0];
      const waitTime = oldestRequest + 60000 - now;
      
      this.logger.warn('Rate limit reached, waiting', { waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.rateLimitState.requests.push(now);
  }

  /**
   * Private: Handle response errors with retry logic
   */
  private async handleResponseError(error: any): Promise<never> {
    const config = error.config;
    const retryCount = config._retryCount || 0;

    // Don't retry client errors (4xx) except 429
    if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
      throw error;
    }

    // Retry for server errors (5xx) and rate limits (429)
    if (retryCount < this.RETRY_DELAYS.length && (
      !error.response || 
      error.response.status >= 500 || 
      error.response.status === 429
    )) {
      config._retryCount = retryCount + 1;
      const delay = this.RETRY_DELAYS[retryCount];
      
      this.logger.warn('Retrying request', { retryCount: retryCount + 1, delay });
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.client.request(config);
    }

    throw error;
  }

  /**
   * Private: Update provisioning status in database
   */
  private async updateProvisioningStatus(
    cardContext: string,
    marqetaCardToken: string,
    step: string,
    status: string,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('card_provisioning_status')
        .insert({
          card_context: cardContext,
          marqeta_card_token: marqetaCardToken,
          provisioning_step: step,
          status,
          error_code: errorCode,
          error_message: errorMessage,
          completed_at: status === 'completed' ? new Date().toISOString() : null
        });
    } catch (error) {
      this.logger.error('Failed to update provisioning status', { error, cardContext, step });
    }
  }

  /**
   * Private: Handle transaction events
   */
  private async handleTransactionEvent(transaction: MarqetaTransaction): Promise<void> {
    // This will be implemented by the transaction processing service
    this.logger.info('Transaction event received', { 
      token: transaction.token,
      type: transaction.type,
      state: transaction.state,
      amount: transaction.amount
    });
  }

  /**
   * Private: Handle card state changes
   */
  private async handleCardStateChange(card: MarqetaCard): Promise<void> {
    try {
      // Update visa_card_details table with new state
      await this.supabase
        .from('visa_card_details')
        .update({
          provisioning_status: card.state.toLowerCase(),
          activation_date: card.state === 'ACTIVE' ? new Date().toISOString() : null,
          deactivation_date: ['SUSPENDED', 'TERMINATED'].includes(card.state) ? new Date().toISOString() : null
        })
        .eq('marqeta_card_token', card.token);

      this.logger.info('Card state updated', { 
        token: card.token,
        state: card.state 
      });
    } catch (error) {
      this.logger.error('Failed to update card state', { error, cardToken: card.token });
    }
  }

  /**
   * Private: Log network status
   */
  private async logNetworkStatus(
    networkName: string,
    endpointUrl: string,
    responseTime: number,
    statusCode: number,
    isHealthy: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('network_status_log')
        .insert({
          network_name: networkName,
          endpoint_url: endpointUrl,
          response_time_ms: responseTime,
          status_code: statusCode,
          is_healthy: isHealthy,
          error_message: errorMessage
        });
    } catch (error) {
      this.logger.error('Failed to log network status', { error });
    }
  }

  /**
   * Private: Extract error code from error object
   */
  private extractErrorCode(error: any): string {
    return error.response?.data?.error_code || 
           error.response?.status?.toString() || 
           'UNKNOWN_ERROR';
  }

  /**
   * Private: Extract error message from error object
   */
  private extractErrorMessage(error: any): string {
    return error.response?.data?.error_message || 
           error.response?.data?.message || 
           error.message || 
           'Unknown error occurred';
  }

  /**
   * Private: Log network cancellation for audit trail
   */
  private async logNetworkCancellation(marqetaCardToken: string, cardData: MarqetaCard): Promise<void> {
    try {
      // Log the successful network cancellation
      await this.supabase
        .from('network_status_log')
        .insert({
          network_name: 'marqeta',
          endpoint_url: `/cards/${marqetaCardToken}`,
          response_time_ms: 0, // Not tracked for cancellation
          status_code: 200,
          is_healthy: true,
          error_message: `Card cancelled for deletion: ${cardData.state}`
        });

      // Update card details with cancellation timestamp
      await this.supabase
        .from('visa_card_details')
        .update({
          provisioning_status: 'terminated',
          deactivation_date: new Date().toISOString(),
          network_cancellation_confirmed_at: new Date().toISOString()
        })
        .eq('marqeta_card_token', marqetaCardToken);

      this.logger.info('Network cancellation logged', { marqetaCardToken });
    } catch (error) {
      this.logger.error('Failed to log network cancellation', { error, marqetaCardToken });
      // Don't throw - cancellation was successful even if logging failed
    }
  }
}