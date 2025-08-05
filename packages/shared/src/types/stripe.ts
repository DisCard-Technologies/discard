/**
 * Shared types for Stripe payment integration
 */

export interface StripePaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'ach_debit';
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    country: string;
  };
  bank_account?: {
    bank_name: string;
    last4: string;
    account_type: 'checking' | 'savings';
    routing_number: string;
  };
  isDefault: boolean;
  created: string;
}

export interface StripePaymentIntent {
  id: string;
  amount: number; // Amount in cents
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'succeeded' | 'canceled';
  paymentMethodId: string;
  clientSecret: string;
  estimatedProcessingTime: number; // In seconds
  created: string;
}

export interface StripeCustomer {
  id: string;
  userId: string;
  email: string;
  defaultPaymentMethodId?: string;
  created: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
  processed: boolean;
}

export interface StripePaymentProcessingTime {
  paymentMethodType: 'card' | 'bank_account' | 'ach_debit';
  estimatedTime: number; // In seconds
  description: string;
}

export interface StripeFraudCheck {
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number; // 0-100
  checks: {
    cvc_check: 'pass' | 'fail' | 'unavailable';
    address_line1_check: 'pass' | 'fail' | 'unavailable';
    address_postal_code_check: 'pass' | 'fail' | 'unavailable';
  };
  recommendations: string[];
}