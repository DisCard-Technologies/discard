/**
 * MagicBlock Ephemeral Rollups Type Definitions
 *
 * Types for integrating with MagicBlock's Private Ephemeral Rollups (PER)
 * for sub-50ms card authorization decisions in Intel TDX TEE.
 */

import { PublicKey } from '@solana/web3.js';

// ============ SESSION TYPES ============

/**
 * Session status for ephemeral rollup sessions
 */
export type SessionStatus = 'creating' | 'active' | 'committing' | 'committed' | 'expired' | 'failed';

/**
 * Ephemeral rollup session configuration
 */
export interface EphemeralSessionConfig {
  /** Maximum session duration in milliseconds */
  maxDuration: number;
  /** Accounts to delegate to the rollup */
  delegatedAccounts: string[];
  /** Batch commit interval in milliseconds */
  commitInterval: number;
  /** Maximum transactions before forced commit */
  maxTransactionsPerBatch: number;
}

/**
 * Active ephemeral rollup session
 */
export interface EphemeralSession {
  /** Unique session identifier */
  sessionId: string;
  /** Associated card ID */
  cardId: string;
  /** User ID */
  userId: string;
  /** Session status */
  status: SessionStatus;
  /** Delegated account addresses */
  delegatedAccounts: string[];
  /** Session creation timestamp */
  createdAt: number;
  /** Session expiration timestamp */
  expiresAt: number;
  /** Last state commit timestamp */
  lastCommitAt?: number;
  /** Number of transactions processed */
  transactionCount: number;
  /** MagicBlock cluster endpoint */
  clusterEndpoint: string;
}

// ============ AUTHORIZATION TYPES ============

/**
 * Card authorization request
 */
export interface AuthorizationRequest {
  /** Card ID being authorized */
  cardId: string;
  /** Transaction amount in cents */
  amount: number;
  /** Merchant category code */
  merchantMcc: string;
  /** Merchant name */
  merchantName: string;
  /** Merchant country code */
  merchantCountry?: string;
  /** Transaction timestamp */
  timestamp: number;
  /** Unique transaction identifier */
  transactionId: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Authorization decision from PER
 */
export type AuthorizationDecision = 'approved' | 'declined' | 'pending' | 'challenge';

/**
 * Decline reason codes
 */
export type DeclineReason =
  | 'insufficient_balance'
  | 'velocity_limit_exceeded'
  | 'daily_limit_exceeded'
  | 'monthly_limit_exceeded'
  | 'mcc_blocked'
  | 'country_blocked'
  | 'card_frozen'
  | 'card_expired'
  | 'fraud_detected'
  | 'policy_violation';

/**
 * Authorization response from PER
 */
export interface AuthorizationResponse {
  /** Transaction ID */
  transactionId: string;
  /** Authorization decision */
  decision: AuthorizationDecision;
  /** Decline reason if declined */
  declineReason?: DeclineReason;
  /** Authorization code if approved */
  authorizationCode?: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Session ID that processed this */
  sessionId: string;
  /** Timestamp of decision */
  timestamp: number;
  /** Risk score (0-100) */
  riskScore?: number;
  /** Additional response data */
  metadata?: Record<string, unknown>;
}

// ============ VELOCITY STATE TYPES ============

/**
 * Private velocity state maintained in PER
 * This state never leaves the TEE
 */
export interface VelocityState {
  /** Card ID */
  cardId: string;
  /** Current balance in cents */
  currentBalance: number;
  /** Today's spending in cents */
  dailySpent: number;
  /** This month's spending in cents */
  monthlySpent: number;
  /** Transaction count today */
  dailyTransactionCount: number;
  /** Daily limit in cents */
  dailyLimit: number;
  /** Monthly limit in cents */
  monthlyLimit: number;
  /** Single transaction limit in cents */
  singleTransactionLimit: number;
  /** Blocked MCC codes */
  blockedMccCodes: string[];
  /** Blocked countries */
  blockedCountries: string[];
  /** Card frozen status */
  isFrozen: boolean;
  /** Last reset timestamp for daily counters */
  lastDailyReset: number;
  /** Last reset timestamp for monthly counters */
  lastMonthlyReset: number;
}

// ============ BATCH COMMIT TYPES ============

/**
 * Authorization decision for batch commitment
 */
export interface BatchDecision {
  transactionId: string;
  cardId: string;
  decision: AuthorizationDecision;
  amount: number;
  timestamp: number;
  authorizationCode?: string;
}

/**
 * Batch commitment to Solana L1
 */
export interface BatchCommitment {
  /** Batch identifier */
  batchId: string;
  /** Session that created this batch */
  sessionId: string;
  /** Merkle root of all decisions */
  merkleRoot: string;
  /** Number of decisions in batch */
  decisionCount: number;
  /** First decision timestamp */
  startTimestamp: number;
  /** Last decision timestamp */
  endTimestamp: number;
  /** Solana transaction signature */
  txSignature?: string;
  /** Commitment status */
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  /** Submission timestamp */
  submittedAt?: number;
  /** Confirmation timestamp */
  confirmedAt?: number;
}

// ============ DELEGATION TYPES ============

/**
 * Account delegation request
 */
export interface DelegationRequest {
  /** Account public key to delegate */
  account: PublicKey;
  /** Program ID that owns the account */
  programId: PublicKey;
  /** Delegation duration in seconds */
  duration: number;
  /** Session configuration */
  config: EphemeralSessionConfig;
}

/**
 * Delegation result
 */
export interface DelegationResult {
  /** Whether delegation succeeded */
  success: boolean;
  /** Session ID if successful */
  sessionId?: string;
  /** Delegated accounts */
  delegatedAccounts?: string[];
  /** Error message if failed */
  error?: string;
  /** Transaction signature */
  txSignature?: string;
}

/**
 * Undelegation request
 */
export interface UndelegationRequest {
  /** Session ID to undelegate */
  sessionId: string;
  /** Force commit pending state */
  forceCommit: boolean;
}

/**
 * Undelegation result
 */
export interface UndelegationResult {
  /** Whether undelegation succeeded */
  success: boolean;
  /** Final batch commitment */
  finalCommitment?: BatchCommitment;
  /** Error message if failed */
  error?: string;
  /** Transaction signature */
  txSignature?: string;
}

// ============ API TYPES ============

/**
 * MagicBlock API configuration
 */
export interface MagicBlockConfig {
  /** API base URL */
  apiUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Cluster to use (devnet, mainnet) */
  cluster: 'devnet' | 'mainnet';
  /** Webhook URL for callbacks */
  webhookUrl?: string;
  /** Request timeout in milliseconds */
  timeout: number;
}

/**
 * MagicBlock API error
 */
export interface MagicBlockError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============ WEBHOOK TYPES ============

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'session.created'
  | 'session.active'
  | 'session.committed'
  | 'session.expired'
  | 'session.failed'
  | 'authorization.processed'
  | 'batch.committed'
  | 'batch.failed';

/**
 * Webhook payload
 */
export interface WebhookPayload {
  /** Event type */
  type: WebhookEventType;
  /** Event timestamp */
  timestamp: number;
  /** Session ID */
  sessionId: string;
  /** Event data */
  data: Record<string, unknown>;
  /** Webhook signature for verification */
  signature: string;
}

// ============ CONSTANTS ============

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: EphemeralSessionConfig = {
  maxDuration: 3600000, // 1 hour
  delegatedAccounts: [],
  commitInterval: 5000, // 5 seconds
  maxTransactionsPerBatch: 100,
};

/**
 * MagicBlock cluster endpoints
 */
export const CLUSTER_ENDPOINTS = {
  devnet: 'https://tee.magicblock.app',
  mainnet: 'https://mainnet.tee.magicblock.app',
} as const;

/**
 * Authorization timeout in milliseconds
 * Target: <50ms for PER processing
 */
export const AUTHORIZATION_TIMEOUT_MS = 100;

/**
 * Maximum batch size before forced commit
 */
export const MAX_BATCH_SIZE = 100;
