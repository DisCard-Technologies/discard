/**
 * Funding-related constants
 */

export const FUNDING_CONSTANTS = {
  // Minimum and maximum funding amounts (in cents)
  MIN_FUNDING_AMOUNT: 100, // $1.00
  MAX_FUNDING_AMOUNT: 1000000, // $10,000.00
  
  // Minimum and maximum transfer amounts (in cents)
  MIN_TRANSFER_AMOUNT: 100, // $1.00
  MAX_TRANSFER_AMOUNT: 500000, // $5,000.00
  
  // Default notification thresholds (in cents)
  DEFAULT_ACCOUNT_THRESHOLD: 1000, // $10.00
  DEFAULT_CARD_THRESHOLD: 500, // $5.00
  
  // Rate limiting
  FUNDING_RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 50, // 50 funding operations per window
  },
  
  ACCOUNT_FUNDING_RATE_LIMIT: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 10, // 10 account funding attempts per hour
  },
  
  // Processing time estimates (in seconds)
  PROCESSING_TIMES: {
    CARD: 0, // Instant
    ACH_DEBIT: 3 * 24 * 60 * 60, // 3 days
    BANK_ACCOUNT: 5 * 24 * 60 * 60, // 5 days
  },
  
  // Currency
  DEFAULT_CURRENCY: 'USD',
  
  // Fraud protection limits
  FRAUD_LIMITS: {
    DAILY_FUNDING_LIMIT: 500000, // $5,000 per day
    MONTHLY_FUNDING_LIMIT: 5000000, // $50,000 per month
    SUSPICIOUS_VELOCITY_THRESHOLD: 10, // Number of transactions in short period
  },
} as const;

export const FUNDING_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const FUNDING_TYPES = {
  ACCOUNT_FUNDING: 'account_funding',
  CARD_ALLOCATION: 'card_allocation',
  CARD_TRANSFER: 'card_transfer',
} as const;