// DisCard Shared Types

export interface PrivacySettings {
  dataRetention: number;
  analyticsOptOut: boolean;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  created_at: string;
  updated_at: string;
  emailVerified: boolean;
  lastActive: string;
  privacySettings: PrivacySettings;
  kyc_status?: 'pending' | 'approved' | 'rejected';
}

export interface Card {
  cardId: string; // UUID v4
  cardContext: string; // Cryptographic isolation key
  encryptedCardNumber: string; // AES-256 encrypted
  encryptedCVV: string; // AES-256 encrypted
  expirationDate: string; // MMYY
  status: 'active' | 'paused' | 'expired' | 'deleted';
  spendingLimit: number; // Cents
  currentBalance: number; // Cents
  createdAt: Date;
  expiresAt?: Date;
  merchantRestrictions?: string[]; // Category codes
  deletionKey: string; // Cryptographic deletion verification
}

export interface Transaction {
  id: string;
  user_id: string;
  card_id: string;
  amount_usd: number;
  currency: string;
  merchant_name: string;
  merchant_category: string;
  transaction_type: 'purchase' | 'refund' | 'fee';
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  metadata: Record<string, any>;
}

export interface FundingSource {
  id: string;
  user_id: string;
  source_type: 'crypto_wallet' | 'bank_account' | 'crypto_exchange';
  source_identifier: string;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CardFunding {
  id: string;
  card_id: string;
  funding_source_id: string;
  amount_usd: number;
  crypto_currency: string;
  crypto_amount: number;
  exchange_rate: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface EmailVerificationRequest {
  token: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// Card API Types
export interface CreateCardRequest {
  spendingLimit: number; // 100-500000 cents
  expirationDate?: string; // MMYY
  merchantRestrictions?: string[]; // Category codes
}

export interface CreateCardResponse {
  card: Card;
  cardNumber: string; // Temporary exposure for initial display
  cvv: string; // Temporary exposure for initial display
}

export interface CardListRequest {
  status?: 'active' | 'paused' | 'expired' | 'deleted';
  limit?: number; // max 50
}

export interface CardDetailsResponse {
  card: Card;
  transactionHistory: Transaction[];
}

export interface CardDeletionResponse {
  success: boolean;
  deletionProof: string; // Cryptographic verification
}