/**
 * DisCard Financial Armor Plugin Types
 *
 * Core type definitions for the elizaOS verification layer.
 */

// Intent verification types
import type {
  IntentAction as _IntentAction,
  SourceType as _SourceType,
  TargetType as _TargetType,
  MerchantInfo as _MerchantInfo,
  VerificationContext as _VerificationContext,
  UserPolicies as _UserPolicies,
  VelocityLimits as _VelocityLimits,
  VerificationRequest as _VerificationRequest,
  VerificationResult as _VerificationResult,
  DenialReason as _DenialReason,
  SignedIntent as _SignedIntent,
  EscalationRequest as _EscalationRequest,
} from "./intent.js";

export type IntentAction = _IntentAction;
export type SourceType = _SourceType;
export type TargetType = _TargetType;
export type MerchantInfo = _MerchantInfo;
export type VerificationContext = _VerificationContext;
export type UserPolicies = _UserPolicies;
export type VelocityLimits = _VelocityLimits;
export type VerificationRequest = _VerificationRequest;
export type VerificationResult = _VerificationResult;
export type DenialReason = _DenialReason;
export type SignedIntent = _SignedIntent;
export type EscalationRequest = _EscalationRequest;

// Merchant registry types
export type {
  MerchantRiskTier,
  MerchantRecord,
  MerchantRegistryConfig,
  MerchantValidationResult,
  RegisterMerchantRequest,
  UpdateMerchantRequest,
  MCCMapping,
  MCCCategory,
} from "./merchant.js";

export {
  HIGH_RISK_MCC_CODES,
  BLOCKED_MCC_CODES,
  MERCHANT_SEEDS,
  MERCHANT_REGISTRY_PROGRAM_ID,
} from "./merchant.js";

// Velocity state types
export type {
  VelocityState,
  VelocityCheckResult,
  VelocityDenialReason,
  VelocitySnapshot,
  VelocityUpdateRequest,
  VelocityUpdateResult,
  CompressedVelocityAccount,
  PeriodResetConfig,
} from "./velocity.js";

export {
  DEFAULT_PERIOD_CONFIG,
  DEFAULT_VELOCITY_LIMITS,
  VELOCITY_SEEDS,
} from "./velocity.js";

// Attestation types
import type {
  PhalaAttestationQuote as _PhalaAttestationQuote,
  TurnkeyStampConfig as _TurnkeyStampConfig,
  AttestationStamper as _AttestationStamper,
  StampResult as _StampResult,
  AttestationStampPayload as _AttestationStampPayload,
  RemoteAttestationRequest as _RemoteAttestationRequest,
  RemoteAttestationResponse as _RemoteAttestationResponse,
  AttestationVerificationDetails as _AttestationVerificationDetails,
  TEEKeyPair as _TEEKeyPair,
  AttestationProviderConfig as _AttestationProviderConfig,
} from "./attestation.js";

export type PhalaAttestationQuote = _PhalaAttestationQuote;
export type TurnkeyStampConfig = _TurnkeyStampConfig;
export type AttestationStamper = _AttestationStamper;
export type StampResult = _StampResult;
export type AttestationStampPayload = _AttestationStampPayload;
export type RemoteAttestationRequest = _RemoteAttestationRequest;
export type RemoteAttestationResponse = _RemoteAttestationResponse;
export type AttestationVerificationDetails = _AttestationVerificationDetails;
export type TEEKeyPair = _TEEKeyPair;
export type AttestationProviderConfig = _AttestationProviderConfig;

export {
  DEFAULT_ATTESTATION_CONFIG,
  ATTESTATION_HEADERS,
} from "./attestation.js";

/**
 * Plugin configuration
 */
export interface FinancialArmorConfig {
  /** Solana RPC endpoint */
  solanaRpcUrl: string;
  /** Helius RPC endpoint (Firedancer-optimized) */
  heliusRpcUrl?: string;
  /** Light Protocol compression endpoint */
  compressionRpcUrl?: string;
  /** Turnkey organization ID */
  turnkeyOrganizationId: string;
  /** Turnkey API base URL */
  turnkeyApiBaseUrl?: string;
  /** gRPC server port */
  grpcPort: number;
  /** Attestation endpoint */
  attestationEndpoint?: string;
  /** Log level */
  logLevel?: "debug" | "info" | "warn" | "error";
  /** Enable metrics collection */
  metricsEnabled?: boolean;
}

/**
 * Plugin state
 */
export interface FinancialArmorState {
  /** Whether plugin is initialized */
  initialized: boolean;
  /** Current attestation quote */
  currentAttestation?: PhalaAttestationQuote;
  /** Active verification requests */
  activeRequests: Map<string, VerificationRequest>;
  /** Recent verification results (for caching) */
  recentResults: Map<string, VerificationResult>;
  /** Metrics */
  metrics: PluginMetrics;
}

/**
 * Plugin metrics
 */
export interface PluginMetrics {
  /** Total verifications processed */
  totalVerifications: number;
  /** Approved verifications */
  approvedCount: number;
  /** Denied verifications */
  deniedCount: number;
  /** Average verification time (ms) */
  avgVerificationTimeMs: number;
  /** Merchant validations */
  merchantValidations: number;
  /** Velocity checks */
  velocityChecks: number;
  /** Attestation refreshes */
  attestationRefreshes: number;
  /** Errors encountered */
  errorCount: number;
}

/**
 * Default plugin configuration
 */
export const DEFAULT_CONFIG: Partial<FinancialArmorConfig> = {
  turnkeyApiBaseUrl: "https://api.turnkey.com",
  grpcPort: 50051,
  logLevel: "info",
  metricsEnabled: true,
};
