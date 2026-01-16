/**
 * Card Provider Abstraction Types
 *
 * Shared types and interfaces for card provider implementations.
 * Supports both Marqeta (KYC + JIT) and Starpay (no-KYC + prepaid).
 */

// ============================================================================
// Card Options
// ============================================================================

export interface CardOptions {
  /** User's display name or identifier */
  displayName: string;
  /** User's email (for notifications) */
  email?: string;
  /** Spending limit per transaction (cents) */
  spendingLimit: number;
  /** Daily spending limit (cents) */
  dailyLimit: number;
  /** Monthly spending limit (cents) */
  monthlyLimit: number;
  /** Card nickname for display */
  nickname?: string;
  /** Card color for UI */
  color?: string;
  /** Blocked MCC codes */
  blockedMccCodes?: string[];
  /** Blocked countries */
  blockedCountries?: string[];
}

// ============================================================================
// Card Results
// ============================================================================

export interface CardResult {
  /** Provider-specific card token/ID */
  providerCardToken: string;
  /** Provider-specific user token/ID */
  providerUserToken: string;
  /** Last 4 digits of card number */
  last4: string;
  /** Expiration month (1-12) */
  expirationMonth: number;
  /** Expiration year (4 digits) */
  expirationYear: number;
  /** Initial balance for prepaid cards (cents) */
  initialBalance?: number;
}

export interface CardDetails {
  /** Full card number (PAN) */
  pan: string;
  /** CVV/CVC code */
  cvv: string;
  /** Expiration month (1-12) */
  expirationMonth: number;
  /** Expiration year (4 digits) */
  expirationYear: number;
  /** Cardholder name */
  cardholderName?: string;
}

// ============================================================================
// Funding
// ============================================================================

export interface FundingRequest {
  /** Card token to fund */
  cardToken: string;
  /** Amount to fund (cents) */
  amount: number;
  /** Source of funds (for audit) */
  source: 'shielded_balance' | 'wallet' | 'external';
  /** Single-use address for privacy */
  singleUseAddress?: string;
}

export interface FundingResult {
  /** Whether funding succeeded */
  success: boolean;
  /** New card balance after funding (cents) */
  newBalance: number;
  /** Transaction/reference ID */
  transactionId?: string;
  /** Balance commitment hash */
  balanceCommitment?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Authorization (JIT Funding)
// ============================================================================

export interface AuthorizationRequest {
  /** Provider's card token */
  cardToken: string;
  /** Provider's transaction token */
  transactionToken: string;
  /** Amount in cents */
  amount: number;
  /** Currency code (USD, EUR, etc.) */
  currencyCode: string;
  /** Merchant name */
  merchantName: string;
  /** Merchant Category Code */
  merchantMcc: string;
  /** Merchant country code */
  merchantCountry?: string;
  /** Merchant city */
  merchantCity?: string;
}

export interface AuthorizationResponse {
  /** Whether authorization was approved */
  approved: boolean;
  /** Authorization code if approved */
  authorizationCode?: string;
  /** Decline reason if not approved */
  declineReason?: string;
  /** Response time in milliseconds */
  responseTimeMs: number;
}

// ============================================================================
// Provider Interface
// ============================================================================

export type ProviderName = 'marqeta' | 'starpay';
export type FundingModel = 'jit' | 'prepaid';

export interface CardProvider {
  /** Provider identifier */
  readonly name: ProviderName;
  /** Whether this provider requires KYC */
  readonly requiresKyc: boolean;
  /** Funding model (JIT or prepaid) */
  readonly fundingModel: FundingModel;

  // ============ Lifecycle ============

  /**
   * Create a new card for a user
   * @param userId - Internal user ID
   * @param options - Card creation options
   */
  createCard(userId: string, options: CardOptions): Promise<CardResult>;

  /**
   * Activate a card after creation
   * @param cardToken - Provider's card token
   */
  activateCard(cardToken: string): Promise<void>;

  /**
   * Freeze a card (temporary hold)
   * @param cardToken - Provider's card token
   */
  freezeCard(cardToken: string): Promise<void>;

  /**
   * Unfreeze a previously frozen card
   * @param cardToken - Provider's card token
   */
  unfreezeCard(cardToken: string): Promise<void>;

  /**
   * Permanently close a card
   * @param cardToken - Provider's card token
   */
  closeCard(cardToken: string): Promise<void>;

  // ============ Card Details ============

  /**
   * Get sensitive card details (PAN, CVV)
   * @param cardToken - Provider's card token
   */
  getCardDetails(cardToken: string): Promise<CardDetails>;

  /**
   * Get current card balance (for prepaid cards)
   * @param cardToken - Provider's card token
   */
  getCardBalance?(cardToken: string): Promise<number>;

  // ============ Funding (Prepaid only) ============

  /**
   * Fund a prepaid card
   * Only applicable for prepaid funding model
   * @param request - Funding request details
   */
  fundCard?(request: FundingRequest): Promise<FundingResult>;

  // ============ Authorization (JIT only) ============

  /**
   * Process an authorization request from the card network
   * Only applicable for JIT funding model
   * @param request - Authorization request from webhook
   */
  processAuthorization?(request: AuthorizationRequest): Promise<AuthorizationResponse>;
}

// ============================================================================
// Provider Configuration
// ============================================================================

export interface MarqetaConfig {
  baseUrl: string;
  applicationToken: string;
  accessToken: string;
  cardProductToken: string;
}

export interface StarpayConfig {
  apiUrl: string;
  apiKey: string;
  webhookSecret?: string;
}

export interface ProviderConfig {
  marqeta?: MarqetaConfig;
  starpay?: StarpayConfig;
}

// ============================================================================
// Balance Commitment (Privacy)
// ============================================================================

export interface BalanceCommitment {
  /** The commitment hash */
  commitment: string;
  /** Card ID this commitment is for */
  cardId: string;
  /** Timestamp when commitment was created */
  timestamp: number;
  /** Randomness used in commitment (stored locally only) */
  randomness: string;
}

/**
 * Create a balance commitment for privacy-preserving balance tracking
 * commitment = SHA256(cardId || amount || timestamp || randomness)
 */
export function createBalanceCommitment(
  cardId: string,
  amount: number,
  timestamp: number,
  randomness: string
): string {
  const data = `${cardId}||${amount}||${timestamp}||${randomness}`;
  // Note: Actual implementation should use crypto.subtle or @noble/hashes
  // This is a placeholder that will be replaced with proper implementation
  return `commitment_${Buffer.from(data).toString('base64')}`;
}

/**
 * Verify a balance commitment
 */
export function verifyBalanceCommitment(
  commitment: string,
  cardId: string,
  amount: number,
  timestamp: number,
  randomness: string
): boolean {
  const expected = createBalanceCommitment(cardId, amount, timestamp, randomness);
  return commitment === expected;
}
