import Stripe from 'stripe';
import { 
  StripePaymentMethod, 
  StripePaymentIntent, 
  StripeCustomer,
  StripeFraudCheck
} from '@discard/shared/src/types/stripe';
import { 
  STRIPE_CONSTANTS,
  STRIPE_ERROR_CODES 
} from '@discard/shared/src/constants/stripe';

export class StripeService {
  private stripe: Stripe;

  constructor() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: STRIPE_CONSTANTS.API_VERSION as Stripe.LatestApiVersion,
      typescript: true,
    });
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(userId: string, email: string): Promise<StripeCustomer> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        metadata: {
          userId,
        },
      });

      return {
        id: customer.id,
        userId,
        email,
        created: new Date(customer.created * 1000).toISOString(),
      };
    } catch (error) {
      console.error('Stripe customer creation error:', error);
      throw new Error('Failed to create Stripe customer');
    }
  }

  /**
   * Create a payment intent for account funding
   */
  async createPaymentIntent(
    amount: number,
    currency: string,
    paymentMethodId: string,
    customerId: string,
    metadata: Record<string, string> = {}
  ): Promise<StripePaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency: currency.toLowerCase(),
        payment_method: paymentMethodId,
        customer: customerId,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          ...metadata,
          source: 'discard_funding',
        },
        return_url: process.env.APP_BASE_URL + '/dashboard/funding',
      });

      // Get payment method details for processing time calculation
      const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
      const processingTime = this.getProcessingTime(paymentMethod.type);

      return {
        id: paymentIntent.id,
        amount,
        currency,
        status: paymentIntent.status as StripePaymentIntent['status'],
        paymentMethodId,
        clientSecret: paymentIntent.client_secret || '',
        estimatedProcessingTime: processingTime,
        created: new Date(paymentIntent.created * 1000).toISOString(),
      };
    } catch (error) {
      console.error('Stripe payment intent creation error:', error);
      this.handleStripeError(error);
    }
  }

  /**
   * Confirm a payment intent
   */
  async confirmPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);

      // Get payment method details for processing time
      const paymentMethod = await this.stripe.paymentMethods.retrieve(
        paymentIntent.payment_method as string
      );
      const processingTime = this.getProcessingTime(paymentMethod.type);

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status as StripePaymentIntent['status'],
        paymentMethodId: paymentIntent.payment_method as string,
        clientSecret: paymentIntent.client_secret || '',
        estimatedProcessingTime: processingTime,
        created: new Date(paymentIntent.created * 1000).toISOString(),
      };
    } catch (error) {
      console.error('Stripe payment intent confirmation error:', error);
      this.handleStripeError(error);
    }
  }

  /**
   * Retrieve payment intent
   */
  async getPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      // Get payment method details for processing time
      const paymentMethod = await this.stripe.paymentMethods.retrieve(
        paymentIntent.payment_method as string
      );
      const processingTime = this.getProcessingTime(paymentMethod.type);

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status as StripePaymentIntent['status'],
        paymentMethodId: paymentIntent.payment_method as string,
        clientSecret: paymentIntent.client_secret || '',
        estimatedProcessingTime: processingTime,
        created: new Date(paymentIntent.created * 1000).toISOString(),
      };
    } catch (error) {
      console.error('Stripe payment intent retrieval error:', error);
      this.handleStripeError(error);
    }
  }

  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<StripePaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      return this.formatPaymentMethod(paymentMethod);
    } catch (error) {
      console.error('Stripe payment method attachment error:', error);
      this.handleStripeError(error);
    }
  }

  /**
   * List customer payment methods
   */
  async listPaymentMethods(customerId: string): Promise<StripePaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return paymentMethods.data.map(pm => this.formatPaymentMethod(pm));
    } catch (error) {
      console.error('Stripe payment methods listing error:', error);
      throw new Error('Failed to retrieve payment methods');
    }
  }

  /**
   * Perform fraud check using Stripe Radar
   */
  async performFraudCheck(paymentIntentId: string): Promise<StripeFraudCheck> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.outcome'],
      });

      const charge = paymentIntent.latest_charge as Stripe.Charge;
      const outcome = charge?.outcome;

      if (!outcome) {
        return {
          riskLevel: 'low',
          riskScore: 0,
          checks: {
            cvc_check: 'unavailable',
            address_line1_check: 'unavailable',
            address_postal_code_check: 'unavailable',
          },
          recommendations: [],
        };
      }

      // Calculate risk score based on Stripe outcome
      let riskScore = 0;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      if (outcome.risk_level === 'high') {
        riskScore = 85;
        riskLevel = 'high';
      } else if (outcome.risk_level === 'elevated') {
        riskScore = 60;
        riskLevel = 'medium';
      } else {
        riskScore = 25;
        riskLevel = 'low';
      }

      const recommendations: string[] = [];
      if (riskLevel === 'high') {
        recommendations.push('Consider additional verification');
        recommendations.push('Monitor transaction closely');
      } else if (riskLevel === 'medium') {
        recommendations.push('Review transaction details');
      }

      return {
        riskLevel,
        riskScore,
        checks: {
          cvc_check: (charge.payment_method_details?.card?.checks?.cvc_check || 'unavailable') as 'pass' | 'fail' | 'unavailable',
          address_line1_check: (charge.payment_method_details?.card?.checks?.address_line1_check || 'unavailable') as 'pass' | 'fail' | 'unavailable',
          address_postal_code_check: (charge.payment_method_details?.card?.checks?.address_postal_code_check || 'unavailable') as 'pass' | 'fail' | 'unavailable',
        },
        recommendations,
      };
    } catch (error) {
      console.error('Stripe fraud check error:', error);
      throw new Error('Failed to perform fraud check');
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('Stripe webhook signature validation error:', error);
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Calculate processing time based on payment method type
   */
  private getProcessingTime(paymentMethodType: string): number {
    switch (paymentMethodType) {
      case 'card':
        return STRIPE_CONSTANTS.PROCESSING_TIMES.CARD;
      case 'us_bank_account':
        return STRIPE_CONSTANTS.PROCESSING_TIMES.ACH_DEBIT;
      default:
        return STRIPE_CONSTANTS.PROCESSING_TIMES.CARD;
    }
  }

  /**
   * Format Stripe payment method to our interface
   */
  private formatPaymentMethod(stripePaymentMethod: Stripe.PaymentMethod): StripePaymentMethod {
    const paymentMethod: StripePaymentMethod = {
      id: stripePaymentMethod.id,
      type: stripePaymentMethod.type as 'card' | 'bank_account' | 'ach_debit',
      isDefault: false, // We'll set this based on customer default
      created: new Date(stripePaymentMethod.created * 1000).toISOString(),
    };

    if (stripePaymentMethod.card) {
      paymentMethod.card = {
        brand: stripePaymentMethod.card.brand,
        last4: stripePaymentMethod.card.last4,
        exp_month: stripePaymentMethod.card.exp_month,
        exp_year: stripePaymentMethod.card.exp_year,
        country: stripePaymentMethod.card.country || 'US',
      };
    }

    if (stripePaymentMethod.us_bank_account) {
      paymentMethod.bank_account = {
        bank_name: stripePaymentMethod.us_bank_account.bank_name || 'Unknown',
        last4: stripePaymentMethod.us_bank_account.last4 || '',
        account_type: stripePaymentMethod.us_bank_account.account_type as 'checking' | 'savings',
        routing_number: stripePaymentMethod.us_bank_account.routing_number || '',
      };
    }

    return paymentMethod;
  }

  /**
   * Handle Stripe errors and throw appropriate errors
   */
  private handleStripeError(error: any): never {
    console.error('Stripe error details:', error);
    
    if (error instanceof Stripe.errors.StripeCardError) {
      switch (error.code) {
        case 'card_declined':
          throw new Error(`Card was declined: ${error.decline_code || 'Unknown reason'}`);
        case 'insufficient_funds':
          throw new Error('Insufficient funds on payment method');
        case 'expired_card':
          throw new Error('Payment method has expired');
        case 'incorrect_cvc':
          throw new Error('Incorrect security code (CVC)');
        case 'processing_error':
          throw new Error('Payment processing error, please try again');
        case 'incorrect_number':
          throw new Error('Invalid card number');
        default:
          throw new Error(`Payment error: ${error.message}`);
      }
    } else if (error instanceof Stripe.errors.StripeRateLimitError) {
      throw new Error('Too many payment requests, please try again later');
    } else if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      throw new Error(`Invalid payment request: ${error.message}`);
    } else if (error instanceof Stripe.errors.StripeAPIError) {
      throw new Error('Payment service temporarily unavailable, please try again');
    } else if (error instanceof Stripe.errors.StripeConnectionError) {
      throw new Error('Network error, please check your connection and try again');
    } else if (error instanceof Stripe.errors.StripeAuthenticationError) {
      throw new Error('Payment service configuration error');
    } else {
      throw new Error('Payment processing failed, please try again');
    }
  }
}

export const stripeService = new StripeService();