/**
 * DisCard 2035 - Settlement Tokens
 *
 * Supported tokens for cross-currency settlement.
 * These are the currencies that recipients can receive.
 */

// ============================================================================
// Types
// ============================================================================

export interface SettlementToken {
  /** Token symbol (e.g., "USDC") */
  symbol: string;
  /** Full token name */
  name: string;
  /** Solana token mint address */
  mint: string;
  /** Token decimals */
  decimals: number;
  /** Currency symbol for display */
  currencySymbol?: string;
  /** ISO currency code (for fiat-pegged tokens) */
  isoCurrency?: string;
}

// ============================================================================
// Settlement Token Constants
// ============================================================================

export const SETTLEMENT_TOKENS: SettlementToken[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    currencySymbol: "$",
    isoCurrency: "USD",
  },
  {
    symbol: "PYUSD",
    name: "PayPal USD",
    mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    decimals: 6,
    currencySymbol: "$",
    isoCurrency: "USD",
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
    decimals: 6,
    currencySymbol: "€",
    isoCurrency: "EUR",
  },
  {
    symbol: "BRZ",
    name: "Brazilian Real",
    mint: "FtgGSFADXBtroxq8VCausXRr2of47QBf5AS1NtZCu4GD",
    decimals: 4,
    currencySymbol: "R$",
    isoCurrency: "BRL",
  },
  {
    symbol: "MXNE",
    name: "Mexican Peso",
    mint: "E77cpQ4VncGmcAXX16LHFFzNBEBb2U7Ar7LBmZNfCgwL",
    decimals: 6,
    currencySymbol: "$",
    isoCurrency: "MXN",
  },
  {
    symbol: "VCHF",
    name: "Swiss Franc",
    mint: "AhhdRu5YZdjVkKR3wbnUDaymVQL2ucjMQ63sZ3LFHsch",
    decimals: 6,
    currencySymbol: "CHF",
    isoCurrency: "CHF",
  },
  {
    symbol: "VGBP",
    name: "British Pound",
    mint: "C2oEjBbrwaaAg9zpcMvd4VKKhqBjFFzGKybxPFQN9sBN",
    decimals: 6,
    currencySymbol: "£",
    isoCurrency: "GBP",
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get settlement token by symbol
 */
export function getSettlementToken(symbol: string): SettlementToken | undefined {
  return SETTLEMENT_TOKENS.find((t) => t.symbol === symbol);
}

/**
 * Get settlement token by mint address
 */
export function getSettlementTokenByMint(mint: string): SettlementToken | undefined {
  return SETTLEMENT_TOKENS.find((t) => t.mint === mint);
}

/**
 * Format amount for display with currency symbol
 */
export function formatSettlementAmount(
  amount: number,
  token: SettlementToken
): string {
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return token.currencySymbol
    ? `${token.currencySymbol}${formatted}`
    : `${formatted} ${token.symbol}`;
}

/**
 * Get default settlement token (USDC)
 */
export function getDefaultSettlementToken(): SettlementToken {
  return SETTLEMENT_TOKENS[0]; // USDC
}

/**
 * Check if a token is a supported settlement token
 */
export function isSettlementToken(mintOrSymbol: string): boolean {
  return SETTLEMENT_TOKENS.some(
    (t) => t.mint === mintOrSymbol || t.symbol === mintOrSymbol
  );
}

export default SETTLEMENT_TOKENS;
