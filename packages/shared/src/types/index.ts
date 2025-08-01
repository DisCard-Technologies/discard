// DisCard Shared Types

export interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
  updated_at: string;
  is_verified: boolean;
  kyc_status: 'pending' | 'approved' | 'rejected';
}

export interface Card {
  id: string;
  user_id: string;
  card_number_encrypted: string;
  card_type: 'virtual' | 'physical';
  status: 'active' | 'frozen' | 'cancelled';
  balance_usd: number;
  spending_limit_daily: number;
  spending_limit_monthly: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
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
  username: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresIn: number;
}