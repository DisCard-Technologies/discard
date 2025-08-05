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