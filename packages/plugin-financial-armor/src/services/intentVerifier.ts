/**
 * Intent Verifier Service
 *
 * Core verification logic that orchestrates merchant validation,
 * velocity checking, policy enforcement, and attestation generation.
 * This is the "Soul" that validates intents from the "Brain".
 */

import { createHash } from "crypto";
import type {
  VerificationRequest,
  VerificationResult,
  VerificationContext,
  DenialReason,
  UserPolicies,
} from "../types/index.js";
import { MerchantValidator } from "./merchantValidator.js";
import { VelocityChecker } from "./velocityChecker.js";
import { AttestationProvider } from "./attestationProvider.js";

/**
 * Configuration for intent verifier
 */
export interface IntentVerifierConfig {
  /** Fail open on velocity check errors */
  failOpenOnVelocityError?: boolean;
  /** Fail open on merchant validation errors */
  failOpenOnMerchantError?: boolean;
  /** Maximum verification time before timeout (ms) */
  maxVerificationTimeMs?: number;
  /** Enable logging */
  debug?: boolean;
}

/**
 * Service for verifying financial intents
 */
export class IntentVerifier {
  private merchantValidator: MerchantValidator;
  private velocityChecker: VelocityChecker;
  private attestationProvider: AttestationProvider;
  private config: IntentVerifierConfig;

  constructor(
    merchantValidator: MerchantValidator,
    velocityChecker: VelocityChecker,
    attestationProvider: AttestationProvider,
    config?: IntentVerifierConfig
  ) {
    this.merchantValidator = merchantValidator;
    this.velocityChecker = velocityChecker;
    this.attestationProvider = attestationProvider;
    this.config = {
      failOpenOnVelocityError: false,
      failOpenOnMerchantError: false,
      maxVerificationTimeMs: 5000,
      debug: false,
      ...config,
    };
  }

  /**
   * Verify an intent from the orchestrator
   */
  async verify(
    request: VerificationRequest,
    context: VerificationContext
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      this.log(`Verifying intent ${request.intentId}: ${request.action}`);

      // Step 1: Merchant Validation (if applicable)
      if (request.merchant) {
        const merchantResult = await this.validateMerchant(
          request.merchant.merchantId,
          request.merchant.mccCode,
          context.policies
        );

        if (!merchantResult.approved) {
          return this.createDenialResult(
            request.requestId,
            merchantResult.reason as DenialReason,
            merchantResult.details,
            startTime
          );
        }
      }

      // Step 2: Velocity Check (if amount-based action)
      if (request.amount && this.isAmountBasedAction(request.action)) {
        const velocityResult = await this.checkVelocity(
          context.userId,
          context.cardId ?? "",
          request.amount,
          context.policies.velocityLimits
        );

        if (!velocityResult.approved) {
          return this.createDenialResult(
            request.requestId,
            velocityResult.reason as DenialReason,
            velocityResult.details,
            startTime
          );
        }
      }

      // Step 3: Policy Compliance Check
      const policyResult = await this.checkPolicyCompliance(request, context);
      if (!policyResult.compliant) {
        return this.createDenialResult(
          request.requestId,
          "POLICY_VIOLATION",
          policyResult.reason,
          startTime
        );
      }

      // Step 4: Fraud Clearance (if required)
      if (context.policies.requireFraudClearance) {
        const fraudResult = await this.checkFraudClearance(request, context);
        if (fraudResult.flagged) {
          return this.createDenialResult(
            request.requestId,
            "FRAUD_FLAGGED",
            fraudResult.reason,
            startTime
          );
        }
      }

      // Step 5: Biometric/2FA Requirements
      if (context.policies.requireBiometric || context.policies.require2FA) {
        const authResult = this.checkAuthRequirements(request, context);
        if (!authResult.satisfied) {
          return this.createDenialResult(
            request.requestId,
            authResult.reason as DenialReason,
            authResult.details,
            startTime,
            true, // Requires escalation
            "Authentication required"
          );
        }
      }

      // Step 6: Generate attestation and signed intent
      const attestationQuote = await this.attestationProvider.getQuote({
        intentId: request.intentId,
        action: request.action,
        amount: request.amount,
        timestamp: startTime,
        userId: context.userId,
      });

      const signedIntent = await this.signIntent(request, attestationQuote);

      this.log(`Intent ${request.intentId} approved in ${Date.now() - startTime}ms`);

      return {
        requestId: request.requestId,
        approved: true,
        requiresEscalation: false,
        attestationQuote: Buffer.from(attestationQuote.quote).toString("base64"),
        signedIntent,
        processedAt: Date.now(),
        verificationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[IntentVerifier] Verification error:", error);
      return this.createDenialResult(
        request.requestId,
        "INTERNAL_ERROR",
        `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        startTime
      );
    }
  }

  /**
   * Validate merchant
   */
  private async validateMerchant(
    merchantId: string,
    mccCode: string,
    policies: UserPolicies
  ): Promise<{ approved: boolean; reason?: string; details?: string }> {
    try {
      const result = await this.merchantValidator.validate(
        merchantId,
        mccCode,
        policies
      );

      if (!result.isValid) {
        return {
          approved: false,
          reason: result.blocked ? "MERCHANT_BLOCKED" : "MERCHANT_NOT_REGISTERED",
          details: result.reason,
        };
      }

      // Check risk tier
      if (result.riskTier === 3) {
        this.log(`High-risk merchant ${merchantId} (tier 3) - proceeding with caution`);
      }

      return { approved: true };
    } catch (error) {
      if (this.config.failOpenOnMerchantError) {
        this.log(`Merchant validation failed, failing open: ${error}`);
        return { approved: true };
      }
      return {
        approved: false,
        reason: "MERCHANT_NOT_REGISTERED",
        details: `Validation error: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  }

  /**
   * Check velocity limits
   */
  private async checkVelocity(
    userId: string,
    cardId: string,
    amountCents: number,
    limits: UserPolicies["velocityLimits"]
  ): Promise<{ approved: boolean; reason?: string; details?: string }> {
    try {
      const result = await this.velocityChecker.check(
        userId,
        cardId,
        amountCents,
        limits
      );

      if (!result.withinLimits) {
        return {
          approved: false,
          reason: result.denialReason,
          details: result.details,
        };
      }

      return { approved: true };
    } catch (error) {
      if (this.config.failOpenOnVelocityError) {
        this.log(`Velocity check failed, failing open: ${error}`);
        return { approved: true };
      }
      return {
        approved: false,
        reason: "VELOCITY_CHECK_ERROR",
        details: `Check error: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  }

  /**
   * Check policy compliance
   */
  private async checkPolicyCompliance(
    request: VerificationRequest,
    context: VerificationContext
  ): Promise<{ compliant: boolean; reason?: string }> {
    const policies = context.policies;

    // Check max transaction amount
    if (
      policies.maxTransactionAmount &&
      request.amount &&
      request.amount > policies.maxTransactionAmount
    ) {
      return {
        compliant: false,
        reason: `Amount exceeds maximum of $${(policies.maxTransactionAmount / 100).toFixed(2)}`,
      };
    }

    // Check MCC blocklist
    if (request.merchant?.mccCode) {
      const blockedMcc = policies.blockedMccCodes ?? [];
      if (blockedMcc.includes(request.merchant.mccCode)) {
        return { compliant: false, reason: "MCC code is blocked by user policy" };
      }
    }

    // Check merchant blocklist
    if (request.merchant?.merchantId) {
      const blockedMerchants = policies.blockedMerchants ?? [];
      if (blockedMerchants.includes(request.merchant.merchantId)) {
        return { compliant: false, reason: "Merchant is blocked by user policy" };
      }
    }

    // Check whitelist if merchant locking enabled
    if (policies.merchantLocking && request.merchant) {
      const allowedMerchants = policies.allowedMerchants ?? [];
      if (!allowedMerchants.includes(request.merchant.merchantId)) {
        return {
          compliant: false,
          reason: "Merchant not in whitelist (locking enabled)",
        };
      }
    }

    return { compliant: true };
  }

  /**
   * Check fraud clearance status
   */
  private async checkFraudClearance(
    _request: VerificationRequest,
    _context: VerificationContext
  ): Promise<{ flagged: boolean; reason?: string }> {
    // In production, this would query the fraud detection system
    // For now, we return cleared
    return { flagged: false };
  }

  /**
   * Check authentication requirements
   */
  private checkAuthRequirements(
    request: VerificationRequest,
    context: VerificationContext
  ): { satisfied: boolean; reason?: string; details?: string } {
    // Check if biometric attestation is provided in metadata
    if (context.policies.requireBiometric) {
      const biometricProof = request.metadata?.biometricProof;
      if (!biometricProof) {
        return {
          satisfied: false,
          reason: "BIOMETRIC_REQUIRED",
          details: "Transaction requires biometric authentication",
        };
      }
    }

    // Check if 2FA is provided
    if (context.policies.require2FA) {
      const twoFactorProof = request.metadata?.twoFactorProof;
      if (!twoFactorProof) {
        return {
          satisfied: false,
          reason: "2FA_REQUIRED",
          details: "Transaction requires two-factor authentication",
        };
      }
    }

    return { satisfied: true };
  }

  /**
   * Check if action involves fund movement
   */
  private isAmountBasedAction(action: string): boolean {
    return [
      "fund_card",
      "transfer",
      "swap",
      "withdraw_defi",
      "pay_bill",
    ].includes(action);
  }

  /**
   * Sign the verified intent
   */
  private async signIntent(
    request: VerificationRequest,
    attestation: { quote: Uint8Array }
  ): Promise<string> {
    const payload = {
      intentId: request.intentId,
      action: request.action,
      amount: request.amount,
      attestationHash: createHash("sha256")
        .update(Buffer.from(attestation.quote))
        .digest("hex")
        .slice(0, 64),
      verifiedAt: Date.now(),
    };

    const payloadString = JSON.stringify(payload);
    const signature = await this.attestationProvider.sign(payloadString);

    return JSON.stringify({
      ...payload,
      signature,
      publicKey: this.attestationProvider.getPublicKey(),
    });
  }

  /**
   * Create a denial result
   */
  private createDenialResult(
    requestId: string,
    reason: DenialReason,
    details?: string,
    startTime?: number,
    requiresEscalation: boolean = false,
    escalationReason?: string
  ): VerificationResult {
    return {
      requestId,
      approved: false,
      denialReason: reason,
      denialDetails: details,
      requiresEscalation,
      escalationReason,
      attestationQuote: "",
      signedIntent: "",
      processedAt: Date.now(),
      verificationTimeMs: startTime ? Date.now() - startTime : 0,
    };
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[IntentVerifier] ${message}`);
    }
  }
}
