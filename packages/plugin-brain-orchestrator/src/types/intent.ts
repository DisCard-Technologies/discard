/**
 * Intent Types for Brain Orchestrator
 *
 * Types for parsed intents from natural language input.
 * The Brain parses user requests and forwards structured
 * intents to the Soul for verification.
 */

/**
 * Actions that can be parsed by the Brain
 */
export type IntentAction =
  | "fund_card"
  | "transfer"
  | "swap"
  | "withdraw_defi"
  | "create_card"
  | "freeze_card"
  | "pay_bill"
  | "check_balance"
  | "view_transactions"
  | "set_limit"
  | "unknown";

/**
 * Source types for funds
 */
export type SourceType = "wallet" | "defi_position" | "card" | "external";

/**
 * Target types for funds
 */
export type TargetType = "card" | "wallet" | "external" | "merchant";

/**
 * Parsed merchant information from user input
 */
export interface ParsedMerchant {
  merchantId?: string;
  merchantName?: string;
  mccCode?: string;
  inferredFromText: boolean;
}

/**
 * Raw intent parsed from natural language
 */
export interface ParsedIntent {
  intentId: string;
  action: IntentAction;
  confidence: number;
  sourceType?: SourceType;
  sourceId?: string;
  targetType?: TargetType;
  targetId?: string;
  amount?: number;
  currency?: string;
  merchant?: ParsedMerchant;
  rawText: string;
  entities: ExtractedEntity[];
  parsedAt: number;
}

/**
 * Entity extracted from natural language
 */
export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Types of entities that can be extracted
 */
export type EntityType =
  | "amount"
  | "currency"
  | "merchant"
  | "action"
  | "account"
  | "date"
  | "time"
  | "location";

/**
 * Intent clarification needed from user
 */
export interface IntentClarification {
  intentId: string;
  question: string;
  options?: ClarificationOption[];
  missingFields: string[];
  ambiguousFields: string[];
}

/**
 * Option for clarification
 */
export interface ClarificationOption {
  label: string;
  value: string;
  confidence: number;
}

/**
 * Request to verify an intent (sent to Soul)
 */
export interface SoulVerificationRequest {
  requestId: string;
  intentId: string;
  action: IntentAction;
  amount?: number;
  currency?: string;
  merchant?: {
    merchantId: string;
    merchantName?: string;
    mccCode: string;
    countryCode?: string;
    visaMid?: string;
  };
  sourceType: SourceType;
  sourceId?: string;
  targetType: TargetType;
  targetId?: string;
  metadata?: Record<string, unknown>;
  brainAttestationQuote?: string;
  timestamp: number;
}

/**
 * Response from Soul verification
 */
export interface SoulVerificationResponse {
  requestId: string;
  approved: boolean;
  denialReason?: string;
  denialDetails?: string;
  requiresEscalation: boolean;
  escalationReason?: string;
  attestationQuote: string;
  signedIntent: string;
  processedAt: number;
  verificationTimeMs: number;
}
