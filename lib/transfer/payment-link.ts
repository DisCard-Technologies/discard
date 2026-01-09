/**
 * DisCard 2035 - Payment Link Generator
 *
 * Generates shareable payment links:
 * - Solana Pay URIs (solana:address?amount=X&spl-token=mint)
 * - DisCard deep links (discard://pay?to=address&amount=X)
 * - Web links (https://discard.tech/pay/requestId)
 */

import { PublicKey } from "@solana/web3.js";
import * as Linking from "expo-linking";

// ============================================================================
// Types
// ============================================================================

export interface PaymentLinkParams {
  /** Recipient address */
  recipientAddress: string;
  /** Amount to request */
  amount?: number;
  /** Token symbol (e.g., "USDC", "SOL") */
  token?: string;
  /** Token mint address (for SPL tokens) */
  tokenMint?: string;
  /** Optional memo/message */
  memo?: string;
  /** Recipient label/name */
  label?: string;
  /** Request ID for web link tracking */
  requestId?: string;
}

export interface MerchantPaymentLinkParams {
  /** Merchant wallet address */
  merchantAddress: string;
  /** Amount in settlement currency */
  amount: number;
  /** Settlement token symbol (USDC, PYUSD, EURC, etc.) */
  settlementToken: string;
  /** Merchant display name */
  merchantName: string;
  /** Optional merchant logo URL */
  merchantLogo?: string;
  /** Optional order/invoice memo */
  memo?: string;
  /** Request ID for tracking */
  requestId?: string;
}

export interface MerchantPaymentLinkResult {
  /** DisCard merchant URI (primary for QR) */
  discardMerchantUri: string;
  /** Solana Pay URI (fallback for other wallets) */
  solanaPayUri: string;
  /** Web link for sharing */
  webLink?: string;
  /** QR code data (uses DisCard merchant format) */
  qrData: string;
}

export interface PaymentLinkResult {
  /** Solana Pay URI */
  solanaPayUri: string;
  /** DisCard deep link */
  discardDeepLink: string;
  /** Web link (requires requestId) */
  webLink?: string;
  /** QR code data (uses Solana Pay URI) */
  qrData: string;
}

export interface ParsedPaymentLink {
  /** Type of link */
  type: "solana_pay" | "discard" | "web" | "unknown";
  /** Recipient address */
  recipientAddress?: string;
  /** Amount if specified */
  amount?: number;
  /** Token symbol or mint */
  token?: string;
  /** Token mint address */
  tokenMint?: string;
  /** Memo */
  memo?: string;
  /** Label */
  label?: string;
  /** Request ID (for web links) */
  requestId?: string;
  /** Original URL */
  originalUrl: string;
}

// ============================================================================
// Constants
// ============================================================================

/** DisCard web domain */
const DISCARD_WEB_DOMAIN = "https://www.discard.tech";

/** DisCard app scheme */
const DISCARD_SCHEME = "discard";

/** Common token mints */
export const TOKEN_MINTS: Record<string, string> = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  SOL: "So11111111111111111111111111111111111111112",
};

/** Settlement token mints (currencies merchants can accept) */
export const SETTLEMENT_TOKEN_MINTS: Record<string, string> = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  PYUSD: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
  EURC: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
  BRZ: "FtgGSFADXBtroxq8VCausXRr2of47QBf5AS1NtZCu4GD",
  MXNE: "E77cpQ4VncGmcAXX16LHFFzNBEBb2U7Ar7LBmZNfCgwL",
  VCHF: "AhhdRu5YZdjVkKR3wbnUDaymVQL2ucjMQ63sZ3LFHsch",
  VGBP: "C2oEjBbrwaaAg9zpcMvd4VKKhqBjFFzGKybxPFQN9sBN",
};

// ============================================================================
// Link Generation
// ============================================================================

/**
 * Generate all payment link formats
 */
export function generatePaymentLinks(params: PaymentLinkParams): PaymentLinkResult {
  const solanaPayUri = generateSolanaPayUri(params);
  const discardDeepLink = generateDiscardDeepLink(params);
  const webLink = params.requestId
    ? `${DISCARD_WEB_DOMAIN}/pay/${params.requestId}`
    : undefined;

  return {
    solanaPayUri,
    discardDeepLink,
    webLink,
    qrData: solanaPayUri, // Use Solana Pay for QR (most compatible)
  };
}

/**
 * Generate Solana Pay URI
 * Format: solana:<address>?amount=X&spl-token=<mint>&memo=<msg>&label=<name>
 */
export function generateSolanaPayUri(params: PaymentLinkParams): string {
  const { recipientAddress, amount, tokenMint, memo, label } = params;

  // Start with base URI
  let uri = `solana:${recipientAddress}`;

  // Add query params
  const queryParams: string[] = [];

  if (amount !== undefined && amount > 0) {
    queryParams.push(`amount=${amount}`);
  }

  // Add SPL token if not native SOL
  if (tokenMint && tokenMint !== TOKEN_MINTS.SOL) {
    queryParams.push(`spl-token=${tokenMint}`);
  }

  if (memo) {
    queryParams.push(`memo=${encodeURIComponent(memo)}`);
  }

  if (label) {
    queryParams.push(`label=${encodeURIComponent(label)}`);
  }

  if (queryParams.length > 0) {
    uri += `?${queryParams.join("&")}`;
  }

  return uri;
}

/**
 * Generate DisCard deep link
 * Format: discard://pay?to=<address>&amount=X&token=<symbol>&memo=<msg>
 */
export function generateDiscardDeepLink(params: PaymentLinkParams): string {
  const { recipientAddress, amount, token, memo } = params;

  const queryParams: Record<string, string> = {
    to: recipientAddress,
  };

  if (amount !== undefined && amount > 0) {
    queryParams.amount = amount.toString();
  }

  if (token) {
    queryParams.token = token;
  }

  if (memo) {
    queryParams.memo = memo;
  }

  return Linking.createURL("pay", {
    scheme: DISCARD_SCHEME,
    queryParams,
  });
}

/**
 * Generate web payment link
 */
export function generateWebLink(requestId: string): string {
  return `${DISCARD_WEB_DOMAIN}/pay/${requestId}`;
}

// ============================================================================
// Merchant Payment Link Generation
// ============================================================================

/**
 * Generate all merchant payment link formats
 * Creates QR codes that specify the settlement currency for cross-currency payments
 */
export function generateMerchantPaymentLinks(params: MerchantPaymentLinkParams): MerchantPaymentLinkResult {
  const discardMerchantUri = generateDiscardMerchantUri(params);
  const solanaPayUri = generateMerchantSolanaPayUri(params);
  const webLink = params.requestId
    ? `${DISCARD_WEB_DOMAIN}/merchant/${params.requestId}`
    : undefined;

  return {
    discardMerchantUri,
    solanaPayUri,
    webLink,
    qrData: discardMerchantUri, // Use DisCard format for rich merchant data
  };
}

/**
 * Generate DisCard merchant URI
 * Format: discard://merchant?to=<address>&amount=X&settlement=<symbol>&name=<name>&logo=<url>&memo=<memo>
 */
export function generateDiscardMerchantUri(params: MerchantPaymentLinkParams): string {
  const { merchantAddress, amount, settlementToken, merchantName, merchantLogo, memo } = params;

  const queryParams: string[] = [
    `to=${merchantAddress}`,
    `amount=${amount}`,
    `settlement=${settlementToken}`,
    `name=${encodeURIComponent(merchantName)}`,
  ];

  if (merchantLogo) {
    queryParams.push(`logo=${encodeURIComponent(merchantLogo)}`);
  }

  if (memo) {
    queryParams.push(`memo=${encodeURIComponent(memo)}`);
  }

  return `discard://merchant?${queryParams.join("&")}`;
}

/**
 * Generate Solana Pay URI for merchant payment (fallback for other wallets)
 * Uses the settlement token mint so other wallets can pay directly
 */
export function generateMerchantSolanaPayUri(params: MerchantPaymentLinkParams): string {
  const { merchantAddress, amount, settlementToken, merchantName, memo } = params;

  const settlementMint = SETTLEMENT_TOKEN_MINTS[settlementToken];
  if (!settlementMint) {
    throw new Error(`Unknown settlement token: ${settlementToken}`);
  }

  const queryParams: string[] = [
    `amount=${amount}`,
    `spl-token=${settlementMint}`,
    `label=${encodeURIComponent(merchantName)}`,
  ];

  if (memo) {
    queryParams.push(`memo=${encodeURIComponent(memo)}`);
  }

  return `solana:${merchantAddress}?${queryParams.join("&")}`;
}

/**
 * Check if a token symbol is a valid settlement token
 */
export function isValidSettlementToken(symbol: string): boolean {
  return symbol in SETTLEMENT_TOKEN_MINTS;
}

/**
 * Get settlement token mint from symbol
 */
export function getSettlementTokenMint(symbol: string): string | undefined {
  return SETTLEMENT_TOKEN_MINTS[symbol];
}

/**
 * Get settlement token symbol from mint
 */
export function getSettlementTokenSymbol(mint: string): string | undefined {
  for (const [symbol, tokenMint] of Object.entries(SETTLEMENT_TOKEN_MINTS)) {
    if (tokenMint === mint) {
      return symbol;
    }
  }
  return undefined;
}

// ============================================================================
// Link Parsing
// ============================================================================

/**
 * Parse any payment link format
 */
export function parsePaymentLink(url: string): ParsedPaymentLink {
  const trimmed = url.trim();

  // Try Solana Pay
  if (trimmed.startsWith("solana:")) {
    return parseSolanaPayUri(trimmed);
  }

  // Try DisCard deep link
  if (trimmed.startsWith("discard://pay") || trimmed.startsWith("discard:pay")) {
    return parseDiscardDeepLink(trimmed);
  }

  // Try web link
  if (trimmed.includes("discard.tech/pay/")) {
    return parseWebLink(trimmed);
  }

  return {
    type: "unknown",
    originalUrl: url,
  };
}

/**
 * Parse Solana Pay URI
 */
function parseSolanaPayUri(uri: string): ParsedPaymentLink {
  try {
    // Remove solana: prefix and parse
    const withoutPrefix = uri.replace(/^solana:/, "");
    const [address, queryString] = withoutPrefix.split("?");

    const result: ParsedPaymentLink = {
      type: "solana_pay",
      recipientAddress: address,
      originalUrl: uri,
    };

    if (queryString) {
      const params = new URLSearchParams(queryString);

      if (params.has("amount")) {
        result.amount = parseFloat(params.get("amount")!);
      }

      if (params.has("spl-token")) {
        result.tokenMint = params.get("spl-token")!;
        // Try to find token symbol
        for (const [symbol, mint] of Object.entries(TOKEN_MINTS)) {
          if (mint === result.tokenMint) {
            result.token = symbol;
            break;
          }
        }
      }

      if (params.has("memo")) {
        result.memo = decodeURIComponent(params.get("memo")!);
      }

      if (params.has("label")) {
        result.label = decodeURIComponent(params.get("label")!);
      }
    }

    return result;
  } catch {
    return { type: "unknown", originalUrl: uri };
  }
}

/**
 * Parse DisCard deep link
 */
function parseDiscardDeepLink(link: string): ParsedPaymentLink {
  try {
    const parsed = Linking.parse(link);

    const result: ParsedPaymentLink = {
      type: "discard",
      originalUrl: link,
    };

    if (parsed.queryParams) {
      if (parsed.queryParams.to) {
        result.recipientAddress = parsed.queryParams.to as string;
      }
      if (parsed.queryParams.amount) {
        result.amount = parseFloat(parsed.queryParams.amount as string);
      }
      if (parsed.queryParams.token) {
        result.token = parsed.queryParams.token as string;
        // Try to find mint
        result.tokenMint = TOKEN_MINTS[result.token] || undefined;
      }
      if (parsed.queryParams.memo) {
        result.memo = parsed.queryParams.memo as string;
      }
    }

    return result;
  } catch {
    return { type: "unknown", originalUrl: link };
  }
}

/**
 * Parse web payment link
 */
function parseWebLink(link: string): ParsedPaymentLink {
  try {
    const match = link.match(/discard\.tech\/pay\/([a-zA-Z0-9-]+)/);
    if (match) {
      return {
        type: "web",
        requestId: match[1],
        originalUrl: link,
      };
    }
    return { type: "unknown", originalUrl: link };
  } catch {
    return { type: "unknown", originalUrl: link };
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Validate if a string is a valid Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get token mint from symbol
 */
export function getTokenMint(symbol: string): string | undefined {
  return TOKEN_MINTS[symbol.toUpperCase()];
}

/**
 * Get token symbol from mint
 */
export function getTokenSymbol(mint: string): string | undefined {
  for (const [symbol, tokenMint] of Object.entries(TOKEN_MINTS)) {
    if (tokenMint === mint) {
      return symbol;
    }
  }
  return undefined;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}
