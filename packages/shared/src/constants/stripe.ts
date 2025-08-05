/**
 * Stripe-related constants
 */

export const STRIPE_CONSTANTS = {
  // API Version
  API_VERSION: '2023-10-16',
  
  // Payment method types
  PAYMENT_METHOD_TYPES: {
    CARD: 'card',
    BANK_ACCOUNT: 'bank_account',
    ACH_DEBIT: 'ach_debit',
  },
  
  // Payment intent statuses
  PAYMENT_INTENT_STATUSES: {
    REQUIRES_PAYMENT_METHOD: 'requires_payment_method',
    REQUIRES_CONFIRMATION: 'requires_confirmation',
    REQUIRES_ACTION: 'requires_action',
    PROCESSING: 'processing',
    SUCCEEDED: 'succeeded',
    CANCELED: 'canceled',
  },
  
  // Webhook event types we handle
  WEBHOOK_EVENTS: {
    PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
    PAYMENT_INTENT_FAILED: 'payment_intent.payment_failed',
    PAYMENT_INTENT_PROCESSING: 'payment_intent.processing',
    PAYMENT_METHOD_ATTACHED: 'payment_method.attached',
    CUSTOMER_UPDATED: 'customer.updated',
  },
  
  // Risk levels for fraud detection
  RISK_LEVELS: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
  },
  
  // Processing times by payment method (in seconds)
  PROCESSING_TIMES: {
    CARD: 0, // Instant
    ACH_DEBIT: 3 * 24 * 60 * 60, // 3 business days
    BANK_ACCOUNT: 5 * 24 * 60 * 60, // 5 business days
  },
  
  // Fraud protection thresholds
  FRAUD_THRESHOLDS: {
    HIGH_RISK_SCORE: 75,
    MEDIUM_RISK_SCORE: 50,
    MAX_DAILY_ATTEMPTS: 10,
  },
} as const;

export const STRIPE_ERROR_CODES = {
  CARD_DECLINED: 'card_declined',
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  EXPIRED_CARD: 'expired_card',
  INCORRECT_CVC: 'incorrect_cvc',
  PROCESSING_ERROR: 'processing_error',
  RATE_LIMIT: 'rate_limit',
} as const;