/**
 * Intent Verification Types
 *
 * Core types for the intent verification flow between
 * the external orchestrator (Brain) and elizaOS (Soul).
 */

/**
 * Actions that can be verified by the Financial Armor
 */
export type IntentAction =
  | "fund_card"
  | "transfer"
  | "swap"
  | "withdraw_defi"
  | "create_card"
  | "freeze_card"
  | "pay_bill";

/**
 * Source types for funds
 */
export type SourceType = "wallet" | "defi_position" | "card" | "external";

/**
 * Target types for funds
 */
export type TargetType = "card" | "wallet" | "external" | "merchant";

/**
 * Merchant information for transaction validation
 */
export interface MerchantInfo {
  merchantId: string;
  merchantName?: string;
  mccCode: string;
  countryCode?: string;
  visaMid?: string;
}

/**
 * Verification context containing user policies and session info
 */
export interface VerificationContext {
  userId: string;
  cardId?: string;
  walletAddress: string;
  subOrganizationId: string;
  policies: UserPolicies;
  attestationQuote?: string;
  sessionId?: string;
}

/**
 * User-defined policies for transaction validation
 */
export interface UserPolicies {
  merchantLocking: boolean;
  allowedMerchants?: string[];
  blockedMerchants?: string[];
  allowedMccCodes?: string[];
  blockedMccCodes?: string[];
  velocityLimits: VelocityLimits;
  requireBiometric: boolean;
  requireFraudClearance: boolean;
  require2FA: boolean;
  maxTransactionAmount?: number;
}

/**
 * Velocity limits configuration
 */
export interface VelocityLimits {
  perTransaction: number;
  daily: number;
  weekly: number;
  monthly: number;
  dailyTxCount?: number;
  weeklyTxCount?: number;
  monthlyTxCount?: number;
}

/**
 * Request to verify an intent from the orchestrator
 */
export interface VerificationRequest {
  requestId: string;
  intentId: string;
  action: IntentAction;
  amount?: number;
  currency?: string;
  merchant?: MerchantInfo;
  sourceType: SourceType;
  sourceId?: string;
  targetType: TargetType;
  targetId?: string;
  metadata?: Record<string, unknown>;
  orchestratorSignature?: string;
  timestamp: number;
}

/**
 * Result of intent verification
 */
export interface VerificationResult {
  requestId: string;
  approved: boolean;
  denialReason?: DenialReason;
  denialDetails?: string;
  requiresEscalation: boolean;
  escalationReason?: string;
  attestationQuote: string;
  signedIntent: string;
  processedAt: number;
  verificationTimeMs: number;
}

/**
 * Reasons for denying an intent
 */
export type DenialReason =
  | "MERCHANT_NOT_REGISTERED"
  | "MERCHANT_BLOCKED"
  | "MERCHANT_RISK_TOO_HIGH"
  | "MCC_BLOCKED"
  | "VELOCITY_DAILY_EXCEEDED"
  | "VELOCITY_WEEKLY_EXCEEDED"
  | "VELOCITY_MONTHLY_EXCEEDED"
  | "VELOCITY_PER_TX_EXCEEDED"
  | "VELOCITY_TX_COUNT_EXCEEDED"
  | "POLICY_VIOLATION"
  | "FRAUD_FLAGGED"
  | "INSUFFICIENT_BALANCE"
  | "BIOMETRIC_REQUIRED"
  | "2FA_REQUIRED"
  | "ATTESTATION_FAILED"
  | "INTERNAL_ERROR";

/**
 * Intent signed by elizaOS after verification
 */
export interface SignedIntent {
  intentId: string;
  action: IntentAction;
  amount?: number;
  attestationHash: string;
  verifiedAt: number;
  signature: string;
  publicKey: string;
}

/**
 * Escalation request when human review is needed
 */
export interface EscalationRequest {
  intentId: string;
  reason: string;
  riskScore: number;
  context: VerificationContext;
  request: VerificationRequest;
  createdAt: number;
  expiresAt: number;
}
