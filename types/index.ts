/**
 * DisCard Type Definitions
 *
 * Local types that replace the @discard/shared package.
 * These types are used by both legacy and Convex-based code.
 */

// ============ CARDS ============

export interface Card {
  id: string;
  cardId: string;
  userId: string;
  last4: string;
  expirationDate: string;
  status: 'active' | 'paused' | 'frozen' | 'terminated' | 'deleted';
  spendingLimit: number;
  currentBalance: number;
  nickname?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCardRequest {
  spendingLimit: number;
  nickname?: string;
  color?: string;
  blockedMccCodes?: string[];
  blockedCountries?: string[];
}

export interface CardListRequest {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface CardDetailsResponse extends Card {
  cardNumber?: string;
  cvv?: string;
}

// ============ FUNDING ============

export interface AccountBalance {
  totalBalance: number;
  allocatedBalance: number;
  availableBalance: number;
  lastUpdated: string;
}

export interface CardBalance {
  cardId: string;
  currentBalance: number;
  reservedBalance: number;
  availableBalance: number;
  lastUpdated: string;
}

export interface FundingTransaction {
  id: string;
  transactionId: string;
  userId: string;
  type: 'account_funding' | 'card_allocation' | 'card_transfer' | 'refund';
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  sourceCardId?: string;
  targetCardId?: string;
  stripePaymentIntentId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AccountFundingRequest {
  amount: number;
  paymentMethodId?: string;
}

export interface CardAllocationRequest {
  cardId: string;
  amount: number;
}

export interface CardTransferRequest {
  sourceCardId: string;
  targetCardId: string;
  amount: number;
}

export interface BalanceNotificationThreshold {
  accountThreshold: number;
  cardThreshold: number;
  enableNotifications: boolean;
  notificationMethods: string[];
}

export interface FundingRequestOptions {
  idempotencyKey?: string;
}

// ============ CRYPTO ============

export interface CryptoWallet {
  id: string;
  walletId: string;
  userId: string;
  walletType: 'metamask' | 'walletconnect' | 'hardware' | 'bitcoin';
  walletAddress: string;
  walletName?: string;
  connectionStatus: 'connected' | 'disconnected' | 'expired';
  supportedCurrencies: string[];
  createdAt: string;
}

export interface WalletBalanceResponse {
  walletId: string;
  balances: Array<{
    currency: string;
    amount: string;
    usdValue: number;
  }>;
  lastUpdated: string;
}

export interface CryptoRate {
  symbol: string;
  name: string;
  usdPrice: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: string;
}

export interface ConversionRates {
  rates: Record<string, CryptoRate>;
  lastUpdated: string;
}

export interface WalletSessionInfo {
  sessionId: string;
  walletId: string;
  isActive: boolean;
  expiresAt: string;
  permissions: string[];
}

export interface ConversionQuote {
  quoteId: string;
  fromCrypto: string;
  toCrypto: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  slippageLimit: number;
  networkFee: number;
  conversionFee: number;
  platformFee: number;
  totalFee: number;
  expiresAt: string;
  status: 'active' | 'expired' | 'used';
}

export interface ConversionCalculatorRequest {
  fromCrypto: string;
  toCrypto: string;
  amount: number;
}

export interface ConversionCalculatorResponse {
  quote: ConversionQuote;
  breakdown: {
    baseAmount: number;
    fees: {
      network: number;
      conversion: number;
      platform: number;
    };
    finalAmount: number;
  };
}

export interface RateComparisonRequest {
  symbols: string[];
  baseCurrency?: string;
}

export interface RateComparisonResponse {
  rates: Record<string, CryptoRate>;
  comparison: Array<{
    symbol: string;
    change24h: number;
    performance: 'up' | 'down' | 'stable';
  }>;
}

export interface HistoricalRateRequest {
  symbol: string;
  period: '1h' | '24h' | '7d' | '30d';
  interval?: string;
}

export interface HistoricalRateResponse {
  symbol: string;
  period: string;
  dataPoints: Array<{
    timestamp: string;
    price: number;
    volume: number;
  }>;
}

export interface CryptoWalletError {
  code: string;
  message: string;
  details?: any;
}

export const CRYPTO_ERROR_CODES = {
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

// ============ UTILITIES ============

/**
 * Format a number as USD currency
 */
export function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Mask a card number for display
 */
export function maskCardNumber(cardNumber: string): string {
  if (!cardNumber || cardNumber.length < 4) return '****';
  return `**** **** **** ${cardNumber.slice(-4)}`;
}

/**
 * Securely copy text to clipboard (placeholder)
 */
export async function copySecurely(text: string): Promise<boolean> {
  try {
    // In React Native, use expo-clipboard
    // This is a placeholder for the actual implementation
    return true;
  } catch {
    return false;
  }
}

/**
 * Card clipboard utility interface
 */
export interface CardClipboard {
  copy: (text: string) => Promise<boolean>;
  clear: () => Promise<void>;
}
