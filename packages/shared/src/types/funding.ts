/**
 * Shared types for funding and balance management
 */

export interface AccountFundingRequest {
  amount: number; // Amount in cents
  paymentMethodId: string; // Stripe payment method ID
  currency?: string; // Default USD
}

export interface CardAllocationRequest {
  cardId: string;
  amount: number; // Amount in cents to allocate to the card
}

export interface CardTransferRequest {
  fromCardId: string;
  toCardId: string;
  amount: number; // Amount in cents to transfer
}

export interface AccountBalance {
  userId: string;
  totalBalance: number; // Total account balance in cents
  allocatedBalance: number; // Total allocated to cards in cents
  availableBalance: number; // Available for allocation in cents
  lastUpdated: string;
}

export interface CardBalance {
  cardId: string;
  balance: number; // Current balance in cents
  lastUpdated: string;
}

export interface FundingTransaction {
  id: string;
  userId: string;
  type: 'account_funding' | 'card_allocation' | 'card_transfer';
  amount: number; // Amount in cents
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paymentMethodId?: string; // For account funding
  sourceCardId?: string; // For transfers
  targetCardId?: string; // For allocations and transfers
  stripePaymentIntentId?: string;
  errorMessage?: string;
  processingTime?: number; // Estimated processing time in seconds
  createdAt: string;
  updatedAt: string;
}

export interface FundAllocation {
  id: string;
  userId: string;
  cardId: string;
  amount: number; // Amount allocated in cents
  transactionId: string;
  createdAt: string;
}

export interface BalanceNotificationThreshold {
  userId: string;
  accountThreshold: number; // Threshold for account balance in cents
  cardThreshold: number; // Threshold for individual card balance in cents
  enableNotifications: boolean;
  notificationMethods: ('email' | 'push' | 'sms')[];
}

export interface FundingRequestOptions {
  limit?: number;
  offset?: number;
  status?: FundingTransaction['status'];
  type?: FundingTransaction['type'];
  startDate?: string;
  endDate?: string;
}