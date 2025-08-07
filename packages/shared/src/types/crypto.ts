/**
 * Shared types for cryptocurrency wallet integration
 */

export interface CryptoWallet {
  walletId: string; // UUID v4
  walletType: 'metamask' | 'walletconnect' | 'hardware' | 'bitcoin';
  walletAddress: string; // Encrypted wallet address
  walletName?: string; // User-defined label
  connectionStatus: 'connected' | 'disconnected' | 'expired';
  permissions: string[]; // Scoped permissions
  sessionExpiry: Date;
  lastBalanceCheck: Date;
  supportedCurrencies: string[]; // BTC, ETH, USDT, etc.
}

export interface CryptoTransaction {
  transactionId: string; // UUID v4
  cryptoType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  cryptoAmount: string; // Decimal string for precision
  usdAmount: number; // Cents
  conversionRate: string; // Decimal string
  networkFee: number; // Cents
  status: 'pending' | 'confirmed' | 'failed' | 'expired';
  blockchainTxHash?: string; // External reference
  fundingContext: string; // Links to card without direct FK
}

export interface WalletConnectRequest {
  walletType: 'metamask' | 'walletconnect' | 'hardware' | 'bitcoin';
  walletAddress: string;
  walletName?: string;
  permissions: string[];
  sessionDuration?: number; // Duration in seconds, default 3600 (1 hour)
}

export interface WalletBalanceResponse {
  walletId: string;
  balances: CryptoBalance[];
  lastUpdated: string;
  totalUsdValue: number; // Total USD value in cents
}

export interface CryptoBalance {
  currency: string; // BTC, ETH, USDT, etc.
  balance: string; // Decimal string for precision
  usdValue: number; // USD value in cents
  conversionRate: string; // Current rate
}

export interface ConversionRates {
  [currency: string]: {
    usd: string; // Decimal string for precision
    lastUpdated: string;
  };
}

export interface WalletSessionInfo {
  sessionId: string;
  walletId: string;
  isActive: boolean;
  expiresAt: string;
  permissions: string[];
  lastActivity: string;
}

export interface MetaMaskConnectionRequest {
  requestedPermissions: string[];
  sessionDuration?: number;
}

// Bitcoin-specific interfaces
export interface BitcoinWalletRequest {
  address: string;
  walletName?: string;
  network?: string; // 'mainnet' | 'testnet'
}

export interface BitcoinWalletConnection {
  walletId: string;
  address: string;
  network: string;
  addressType: string;
  walletName: string;
  balance: {
    confirmed: number;
    unconfirmed: number;
    total: number;
  };
  connectionStatus: 'connected' | 'disconnected';
  qrCode: string; // Base64 data URL
  explorerUrl: string;
  supportedCurrencies: string[];
  createdAt: string;
}

export interface BitcoinTransactionRequest {
  fromAddress: string;
  toAddress: string;
  amount: number; // in BTC
  feeRate?: number; // satoshis per byte
  network?: string;
}

export interface BitcoinTransactionResponse {
  transactionHex: string;
  txid: string;
  size: number;
  fee: number; // in BTC
  inputs: BitcoinUTXO[];
}

export interface BitcoinUTXO {
  txid: string;
  vout: number;
  value: number; // in satoshis
  confirmations: number;
  scriptPubKey: string;
}

export interface BitcoinBroadcastRequest {
  transactionHex: string;
  network?: string;
}

export interface WalletConnectSessionRequest {
  bridgeUrl?: string;
  sessionDuration?: number;
  requiredNamespaces: string[];
}

export interface BitcoinWalletConnectionRequest {
  publicKey?: string;
  addressType: 'legacy' | 'segwit' | 'native_segwit';
  derivationPath?: string;
}

export interface HardwareWalletConnectionRequest {
  deviceType: 'ledger' | 'trezor';
  derivationPath: string;
  addressIndex: number;
  confirmOnDevice: boolean;
}

// Error types for crypto operations
export interface CryptoWalletError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export const CRYPTO_ERROR_CODES = {
  WALLET_CONNECTION_FAILED: 'WALLET_CONNECTION_FAILED',
  WALLET_DISCONNECTION_FAILED: 'WALLET_DISCONNECTION_FAILED',
  BALANCE_FETCH_FAILED: 'BALANCE_FETCH_FAILED',
  RATE_FETCH_FAILED: 'RATE_FETCH_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_WALLET_ADDRESS: 'INVALID_WALLET_ADDRESS',
  UNSUPPORTED_WALLET_TYPE: 'UNSUPPORTED_WALLET_TYPE',
  HARDWARE_WALLET_ERROR: 'HARDWARE_WALLET_ERROR',
  METAMASK_NOT_DETECTED: 'METAMASK_NOT_DETECTED',
  WALLETCONNECT_SESSION_FAILED: 'WALLETCONNECT_SESSION_FAILED',
} as const;

export type CryptoErrorCode = typeof CRYPTO_ERROR_CODES[keyof typeof CRYPTO_ERROR_CODES];

// Real-time rate and conversion types for Story 2.2
export interface CryptoRate {
  rateId: string; // UUID v4
  symbol: string; // BTC, ETH, USDT, USDC, XRP
  usdPrice: string; // Decimal string for precision
  change24h: number; // Percentage
  volume24h: string; // Decimal string
  source: 'chainlink' | 'coingecko' | '0x' | 'backup';
  timestamp: Date;
  isActive: boolean;
}

export interface ConversionQuote {
  quoteId: string; // UUID v4
  fromCrypto: string; // Source cryptocurrency
  toCrypto: string; // Target (usually USD equivalent)
  fromAmount: string; // Input amount
  toAmount: string; // Expected output amount
  rate: string; // Conversion rate at quote time
  slippageLimit: number; // Maximum acceptable slippage
  networkFee: number; // Cents
  conversionFee: number; // Cents
  platformFee: number; // Cents
  totalFee: number; // Cents
  expiresAt: Date; // Quote expiration
  status: 'active' | 'expired' | 'used';
}

export interface ConversionCalculatorRequest {
  fromCrypto: string; // BTC, ETH, USDT, USDC, XRP
  toUsd: number; // Desired USD amount in cents
  slippageLimit?: number; // Optional, default 2%
}

export interface ConversionCalculatorResponse {
  fromAmount: string; // Required crypto amount
  toAmount: number; // USD amount in cents
  rate: string; // Current conversion rate
  fees: {
    networkFee: number; // Cents
    conversionFee: number; // Cents
    platformFee: number; // Cents
    totalFee: number; // Cents
  };
  slippageProtection: {
    maxSlippage: number; // Percentage
    guaranteedMinOutput: string; // Minimum guaranteed output
  };
  quoteId: string; // For slippage protection
  expiresAt: Date;
}

export interface RateComparisonRequest {
  targetUsdAmount: number; // Desired USD amount in cents
  cryptoSymbols?: string[]; // Optional filter, defaults to all supported
}

export interface RateComparisonResponse {
  targetUsdAmount: number;
  comparisons: CryptoRateComparison[];
  bestOption: string; // Symbol of the most cost-effective option
}

export interface CryptoRateComparison {
  symbol: string;
  requiredAmount: string; // Crypto amount needed
  currentRate: string;
  totalCost: number; // Including all fees, in cents
  fees: {
    networkFee: number;
    conversionFee: number;
    platformFee: number;
    totalFee: number;
  };
  costEfficiency: number; // Lower is better
}

export interface HistoricalRateRequest {
  symbol: string;
  timeframe: '1h' | '24h' | '7d';
  resolution?: '1m' | '5m' | '1h'; // Data point resolution
}

export interface HistoricalRateResponse {
  symbol: string;
  timeframe: string;
  resolution: string;
  dataPoints: HistoricalRatePoint[];
}

export interface HistoricalRatePoint {
  timestamp: Date;
  price: string; // Decimal string
  volume?: string; // Optional volume data
}