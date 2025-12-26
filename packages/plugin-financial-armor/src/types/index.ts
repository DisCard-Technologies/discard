/**
 * DisCard Financial Armor Plugin Types
 *
 * Core type definitions for the elizaOS verification layer.
 */

// Intent verification types
export type {
  IntentAction,
  SourceType,
  TargetType,
  MerchantInfo,
  VerificationContext,
  UserPolicies,
  VelocityLimits,
  VerificationRequest,
  VerificationResult,
  DenialReason,
  SignedIntent,
  EscalationRequest,
} from "./intent.js";

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
export type {
  PhalaAttestationQuote,
  TurnkeyStampConfig,
  AttestationStamper,
  StampResult,
  AttestationStampPayload,
  RemoteAttestationRequest,
  RemoteAttestationResponse,
  AttestationVerificationDetails,
  TEEKeyPair,
  AttestationProviderConfig,
} from "./attestation.js";

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
