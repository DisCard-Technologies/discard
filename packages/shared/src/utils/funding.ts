/**
 * Utility functions for funding operations
 */

import { FUNDING_CONSTANTS } from '../constants/funding';
import { AccountBalance, FundingTransaction } from '../types/funding';

/**
 * Calculate available balance for allocation
 */
export function calculateAvailableBalance(accountBalance: AccountBalance): number {
  return accountBalance.totalBalance - accountBalance.allocatedBalance;
}

/**
 * Validate funding amount
 */
export function validateFundingAmount(amount: number): { isValid: boolean; error?: string } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { isValid: false, error: 'Amount must be a positive integer in cents' };
  }
  
  if (amount < FUNDING_CONSTANTS.MIN_FUNDING_AMOUNT) {
    return { 
      isValid: false, 
      error: `Minimum funding amount is $${(FUNDING_CONSTANTS.MIN_FUNDING_AMOUNT / 100).toFixed(2)}` 
    };
  }
  
  if (amount > FUNDING_CONSTANTS.MAX_FUNDING_AMOUNT) {
    return { 
      isValid: false, 
      error: `Maximum funding amount is $${(FUNDING_CONSTANTS.MAX_FUNDING_AMOUNT / 100).toFixed(2)}` 
    };
  }
  
  return { isValid: true };
}

/**
 * Validate transfer amount
 */
export function validateTransferAmount(amount: number, availableBalance: number): { isValid: boolean; error?: string } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { isValid: false, error: 'Amount must be a positive integer in cents' };
  }
  
  if (amount < FUNDING_CONSTANTS.MIN_TRANSFER_AMOUNT) {
    return { 
      isValid: false, 
      error: `Minimum transfer amount is $${(FUNDING_CONSTANTS.MIN_TRANSFER_AMOUNT / 100).toFixed(2)}` 
    };
  }
  
  if (amount > FUNDING_CONSTANTS.MAX_TRANSFER_AMOUNT) {
    return { 
      isValid: false, 
      error: `Maximum transfer amount is $${(FUNDING_CONSTANTS.MAX_TRANSFER_AMOUNT / 100).toFixed(2)}` 
    };
  }
  
  if (amount > availableBalance) {
    return { 
      isValid: false, 
      error: `Insufficient balance. Available: $${(availableBalance / 100).toFixed(2)}` 
    };
  }
  
  return { isValid: true };
}

/**
 * Format amount from cents to currency string
 */
export function formatCurrency(amountInCents: number, currency: string = 'USD'): string {
  const amount = amountInCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

/**
 * Parse currency string to cents
 */
export function parseCurrencyToCents(currencyString: string): number {
  // Remove currency symbols and parse
  const cleanString = currencyString.replace(/[$,\s]/g, '');
  const amount = parseFloat(cleanString);
  return Math.round(amount * 100);
}

/**
 * Calculate processing time based on payment method type
 */
export function getProcessingTime(paymentMethodType: string): number {
  switch (paymentMethodType.toLowerCase()) {
    case 'card':
      return FUNDING_CONSTANTS.PROCESSING_TIMES.CARD;
    case 'ach_debit':
      return FUNDING_CONSTANTS.PROCESSING_TIMES.ACH_DEBIT;
    case 'bank_account':
      return FUNDING_CONSTANTS.PROCESSING_TIMES.BANK_ACCOUNT;
    default:
      return FUNDING_CONSTANTS.PROCESSING_TIMES.CARD;
  }
}

/**
 * Format processing time to human readable string
 */
export function formatProcessingTime(seconds: number): string {
  if (seconds === 0) {
    return 'Instant';
  }
  
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  
  if (days > 0) {
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  
  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  
  return 'Less than 1 hour';
}

/**
 * Check if user has exceeded daily funding limits
 */
export function checkDailyFundingLimit(transactions: FundingTransaction[]): boolean {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const dailyTotal = transactions
    .filter(tx => 
      tx.type === 'account_funding' && 
      tx.status === 'completed' &&
      new Date(tx.createdAt) > oneDayAgo
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
  
  return dailyTotal >= FUNDING_CONSTANTS.FRAUD_LIMITS.DAILY_FUNDING_LIMIT;
}

/**
 * Check if user has exceeded monthly funding limits  
 */
export function checkMonthlyFundingLimit(transactions: FundingTransaction[]): boolean {
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const monthlyTotal = transactions
    .filter(tx => 
      tx.type === 'account_funding' && 
      tx.status === 'completed' &&
      new Date(tx.createdAt) > oneMonthAgo
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
  
  return monthlyTotal >= FUNDING_CONSTANTS.FRAUD_LIMITS.MONTHLY_FUNDING_LIMIT;
}

/**
 * Detect suspicious transaction velocity
 */
export function detectSuspiciousVelocity(transactions: FundingTransaction[]): boolean {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const recentTransactions = transactions.filter(tx => 
    new Date(tx.createdAt) > oneHourAgo
  );
  
  return recentTransactions.length >= FUNDING_CONSTANTS.FRAUD_LIMITS.SUSPICIOUS_VELOCITY_THRESHOLD;
}

/**
 * Generate a unique transaction ID
 */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 5);
  return `funding_${timestamp}_${randomPart}`;
}

/**
 * Sanitize and validate card ID format
 */
export function validateCardId(cardId: string): { isValid: boolean; error?: string } {
  if (!cardId || typeof cardId !== 'string') {
    return { isValid: false, error: 'Card ID is required and must be a string' };
  }
  
  // Basic UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(cardId)) {
    return { isValid: false, error: 'Invalid card ID format' };
  }
  
  return { isValid: true };
}