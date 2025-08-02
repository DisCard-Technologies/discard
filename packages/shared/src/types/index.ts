/**
 * Shared types for DisCard application
 */

export interface CreateCardRequest {
  spendingLimit: number;
  expirationDate?: string;
  merchantRestrictions?: string[];
}

export interface CardListRequest {
  status?: 'active' | 'paused' | 'deleted';
  limit?: number;
  offset?: number;
}

export interface Card {
  cardId: string;
  userId: string;
  status: 'active' | 'paused' | 'deleted';
  spendingLimit: number;
  currentBalance: number;
  merchantRestrictions?: string[];
  createdAt: string;
  expiresAt: string;
}

export interface CardDetailsResponse {
  card: Card;
  transactionHistory: Transaction[];
}

export interface Transaction {
  id: string;
  cardId: string;
  amount: number;
  merchant: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
}