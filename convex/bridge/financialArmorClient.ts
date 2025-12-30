/**
 * Financial Armor gRPC Client
 *
 * Client for calling the elizaOS Financial Armor service from Convex.
 * Verifies intents before Turnkey signing.
 */

/**
 * Configuration for the Financial Armor client
 */
export interface FinancialArmorConfig {
  /** gRPC endpoint URL */
  grpcUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Intent verification request
 */
export interface VerifyIntentRequest {
  intentId: string;
  userId: string;
  action: string;
  amount?: number;
  currency?: string;
  merchant?: {
    merchantId: string;
    merchantName?: string;
    mccCode: string;
    countryCode?: string;
  };
  sourceType: string;
  sourceId?: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  walletAddress?: string;
  subOrganizationId?: string;
  cardId?: string;
  policies?: UserPolicies;
}

/**
 * User policies for verification
 */
export interface UserPolicies {
  merchantLocking?: boolean;
  allowedMerchants?: string[];
  blockedMerchants?: string[];
  allowedMccCodes?: string[];
  blockedMccCodes?: string[];
  velocityLimits?: {
    perTransaction: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  requireBiometric?: boolean;
  requireFraudClearance?: boolean;
  require2FA?: boolean;
  maxTransactionAmount?: number;
}

/**
 * Intent verification result
 */
export interface VerifyIntentResult {
  approved: boolean;
  denialReason?: string;
  denialDetails?: string;
  requiresEscalation: boolean;
  escalationReason?: string;
  attestationQuote: string;
  signedIntent: string;
  verificationTimeMs: number;
}

/**
 * Velocity check result
 */
export interface VelocityCheckResult {
  withinLimits: boolean;
  denialReason?: string;
  details?: string;
  currentStatus: {
    dailySpent: number;
    dailyLimit: number;
    dailyRemaining: number;
    weeklySpent: number;
    weeklyLimit: number;
    weeklyRemaining: number;
    monthlySpent: number;
    monthlyLimit: number;
    monthlyRemaining: number;
  };
}

/**
 * Merchant validation result
 */
export interface MerchantValidationResult {
  isValid: boolean;
  isBlocked: boolean;
  riskTier: number;
  denialReason?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<FinancialArmorConfig> = {
  grpcUrl: process.env.FINANCIAL_ARMOR_GRPC_URL ?? "localhost:50051",
  timeoutMs: 5000,
  debug: false,
};

/**
 * Call the Financial Armor service to verify an intent
 *
 * Note: In production, this would use a proper gRPC client.
 * For Convex compatibility, we use HTTP/2 or REST bridge.
 */
export async function callFinancialArmor(
  request: VerifyIntentRequest,
  config?: Partial<FinancialArmorConfig>
): Promise<VerifyIntentResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const startTime = Date.now();

  try {
    // Build gRPC request payload
    const grpcRequest = {
      request_id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      user_id: request.userId,
      intent_id: request.intentId,
      intent: {
        action: request.action,
        source_type: request.sourceType,
        source_id: request.sourceId ?? "",
        target_type: request.targetType,
        target_id: request.targetId ?? "",
        amount_cents: request.amount ?? 0,
        currency: request.currency ?? "USD",
        merchant: request.merchant
          ? {
              merchant_id: request.merchant.merchantId,
              merchant_name: request.merchant.merchantName ?? "",
              mcc_code: request.merchant.mccCode,
              country_code: request.merchant.countryCode ?? "",
            }
          : undefined,
        metadata: request.metadata ?? {},
      },
      context: {
        wallet_address: request.walletAddress ?? "",
        sub_organization_id: request.subOrganizationId ?? "",
        card_id: request.cardId ?? "",
        policies: request.policies
          ? {
              merchant_locking: request.policies.merchantLocking ?? false,
              allowed_merchants: request.policies.allowedMerchants ?? [],
              blocked_merchants: request.policies.blockedMerchants ?? [],
              allowed_mcc_codes: request.policies.allowedMccCodes ?? [],
              blocked_mcc_codes: request.policies.blockedMccCodes ?? [],
              velocity_limits: request.policies.velocityLimits ?? {
                per_transaction: 10000000,
                daily: 50000000,
                weekly: 200000000,
                monthly: 500000000,
              },
              require_biometric: request.policies.requireBiometric ?? false,
              require_fraud_clearance:
                request.policies.requireFraudClearance ?? false,
              require_2fa: request.policies.require2FA ?? false,
              max_transaction_amount:
                request.policies.maxTransactionAmount ?? 0,
            }
          : undefined,
      },
      timestamp_ms: Date.now(),
    };

    if (finalConfig.debug) {
      console.log(
        "[FinancialArmor] Sending request:",
        JSON.stringify(grpcRequest, null, 2)
      );
    }

    // Call the gRPC service via HTTP bridge
    // In production, use proper gRPC-Web or gRPC client
    const response = await fetch(
      `http://${finalConfig.grpcUrl}/discard.financial_armor.v1.FinancialArmorService/VerifyIntent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(grpcRequest),
        signal: AbortSignal.timeout(finalConfig.timeoutMs ?? 5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Financial Armor service error: ${response.status}`);
    }

    const result = await response.json();

    if (finalConfig.debug) {
      console.log(
        "[FinancialArmor] Received response:",
        JSON.stringify(result, null, 2)
      );
    }

    return {
      approved: result.result === "APPROVED",
      denialReason:
        result.result !== "APPROVED" ? result.denial_reason : undefined,
      denialDetails: result.denial_details,
      requiresEscalation: result.requires_escalation ?? false,
      escalationReason: result.escalation_reason,
      attestationQuote: result.attestation_quote ?? "",
      signedIntent: result.signed_intent ?? "",
      verificationTimeMs: result.verification_time_ms ?? Date.now() - startTime,
    };
  } catch (error) {
    console.error("[FinancialArmor] Error calling service:", error);

    // Return denial on error (fail closed)
    return {
      approved: false,
      denialReason: "INTERNAL_ERROR",
      denialDetails: `Service error: ${error instanceof Error ? error.message : "Unknown error"}`,
      requiresEscalation: false,
      attestationQuote: "",
      signedIntent: "",
      verificationTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Check velocity limits via Financial Armor
 */
export async function checkVelocity(
  userId: string,
  cardId: string,
  amountCents: number,
  limits: UserPolicies["velocityLimits"],
  config?: Partial<FinancialArmorConfig>
): Promise<VelocityCheckResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    const response = await fetch(
      `http://${finalConfig.grpcUrl}/discard.financial_armor.v1.FinancialArmorService/CheckVelocity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          card_id: cardId,
          amount_cents: amountCents,
          limits: {
            per_transaction: limits?.perTransaction ?? 10000000,
            daily: limits?.daily ?? 50000000,
            weekly: limits?.weekly ?? 200000000,
            monthly: limits?.monthly ?? 500000000,
          },
        }),
        signal: AbortSignal.timeout(finalConfig.timeoutMs ?? 5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Velocity check error: ${response.status}`);
    }

    const result = await response.json();

    return {
      withinLimits: result.within_limits,
      denialReason: result.denial_reason,
      details: result.denial_details,
      currentStatus: {
        dailySpent: Number(result.current_status?.daily_spent ?? 0),
        dailyLimit: Number(result.current_status?.daily_limit ?? 0),
        dailyRemaining: Number(result.current_status?.daily_remaining ?? 0),
        weeklySpent: Number(result.current_status?.weekly_spent ?? 0),
        weeklyLimit: Number(result.current_status?.weekly_limit ?? 0),
        weeklyRemaining: Number(result.current_status?.weekly_remaining ?? 0),
        monthlySpent: Number(result.current_status?.monthly_spent ?? 0),
        monthlyLimit: Number(result.current_status?.monthly_limit ?? 0),
        monthlyRemaining: Number(result.current_status?.monthly_remaining ?? 0),
      },
    };
  } catch (error) {
    console.error("[FinancialArmor] Velocity check error:", error);
    return {
      withinLimits: false,
      denialReason: "VELOCITY_CHECK_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
      currentStatus: {
        dailySpent: 0,
        dailyLimit: 0,
        dailyRemaining: 0,
        weeklySpent: 0,
        weeklyLimit: 0,
        weeklyRemaining: 0,
        monthlySpent: 0,
        monthlyLimit: 0,
        monthlyRemaining: 0,
      },
    };
  }
}

/**
 * Validate merchant via Financial Armor
 */
export async function validateMerchant(
  merchantId: string,
  mccCode: string,
  countryCode?: string,
  config?: Partial<FinancialArmorConfig>
): Promise<MerchantValidationResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    const response = await fetch(
      `http://${finalConfig.grpcUrl}/discard.financial_armor.v1.FinancialArmorService/ValidateMerchant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          mcc_code: mccCode,
          country_code: countryCode ?? "",
        }),
        signal: AbortSignal.timeout(finalConfig.timeoutMs ?? 5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Merchant validation error: ${response.status}`);
    }

    const result = await response.json();

    return {
      isValid: result.is_valid,
      isBlocked: result.is_blocked,
      riskTier: result.risk_tier ?? 2,
      denialReason: result.denial_reason,
    };
  } catch (error) {
    console.error("[FinancialArmor] Merchant validation error:", error);
    return {
      isValid: false,
      isBlocked: false,
      riskTier: 3,
      denialReason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Health check for Financial Armor service
 */
export async function healthCheck(
  config?: Partial<FinancialArmorConfig>
): Promise<{ healthy: boolean; details?: Record<string, unknown> }> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    const response = await fetch(
      `http://${finalConfig.grpcUrl}/discard.financial_armor.v1.FinancialArmorService/HealthCheck`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ include_details: true }),
        signal: AbortSignal.timeout(2000),
      }
    );

    if (!response.ok) {
      return { healthy: false };
    }

    const result = await response.json();

    return {
      healthy: result.status === "HEALTHY",
      details: result.details,
    };
  } catch {
    return { healthy: false };
  }
}
