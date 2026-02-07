/**
 * gRPC Server Implementation
 *
 * Implements the FinancialArmorService for orchestrator communication.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { IntentVerifier } from "../services/intentVerifier.js";
import type { MerchantValidator } from "../services/merchantValidator.js";
import type { VelocityChecker } from "../services/velocityChecker.js";
import type { AttestationProvider } from "../services/attestationProvider.js";
import type {
  VerificationRequest,
  VerificationContext,
  UserPolicies,
  VelocityLimits,
  PluginMetrics,
} from "../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * gRPC Server configuration
 */
export interface GrpcServerConfig {
  port: number;
  host?: string;
  intentVerifier: IntentVerifier;
  merchantValidator: MerchantValidator;
  velocityChecker: VelocityChecker;
  attestationProvider: AttestationProvider;
}

/**
 * gRPC Server for Financial Armor Service
 */
export class FinancialArmorGrpcServer {
  private server: grpc.Server;
  private config: GrpcServerConfig;
  private startTime: number;
  private metrics: PluginMetrics;

  constructor(config: GrpcServerConfig) {
    this.config = config;
    this.server = new grpc.Server();
    this.startTime = Date.now();
    this.metrics = {
      totalVerifications: 0,
      approvedCount: 0,
      deniedCount: 0,
      avgVerificationTimeMs: 0,
      merchantValidations: 0,
      velocityChecks: 0,
      attestationRefreshes: 0,
      errorCount: 0,
    };

    this.setupService();
  }

  /**
   * Setup the gRPC service
   */
  private setupService(): void {
    // Proto file is at src/grpc/proto/ relative to package root
    // __dirname is dist/, so we go up one level to package root, then into src/grpc/proto
    const PROTO_PATH = join(__dirname, "..", "src", "grpc", "proto", "financial_armor.proto");

    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    const financialArmor = (protoDescriptor.discard as Record<string, Record<string, unknown>>)
      .financial_armor.v1 as Record<string, unknown>;

    // Add service implementation
    this.server.addService(
      (financialArmor.FinancialArmorService as any).service,
      {
        VerifyIntent: this.handleVerifyIntent.bind(this),
        ValidateMerchant: this.handleValidateMerchant.bind(this),
        CheckVelocity: this.handleCheckVelocity.bind(this),
        GetAttestation: this.handleGetAttestation.bind(this),
        StreamVerifications: this.handleStreamVerifications.bind(this),
        HealthCheck: this.handleHealthCheck.bind(this),
      }
    );
  }

  /**
   * Handle VerifyIntent RPC
   */
  private async handleVerifyIntent(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const req = call.request;

      // Convert gRPC request to internal format
      const request: VerificationRequest = {
        requestId: req.request_id as string,
        intentId: req.intent_id as string,
        action: (req.intent as Record<string, unknown>)?.action as string as VerificationRequest["action"],
        amount: Number((req.intent as Record<string, unknown>)?.amount_cents ?? 0),
        currency: ((req.intent as Record<string, unknown>)?.currency as string) ?? "USD",
        merchant: (req.intent as Record<string, unknown>)?.merchant
          ? {
              merchantId: ((req.intent as Record<string, unknown>).merchant as Record<string, string>).merchant_id,
              merchantName: ((req.intent as Record<string, unknown>).merchant as Record<string, string>).merchant_name,
              mccCode: ((req.intent as Record<string, unknown>).merchant as Record<string, string>).mcc_code,
              countryCode: ((req.intent as Record<string, unknown>).merchant as Record<string, string>).country_code,
            }
          : undefined,
        sourceType: ((req.intent as Record<string, unknown>)?.source_type as string) as VerificationRequest["sourceType"],
        sourceId: (req.intent as Record<string, unknown>)?.source_id as string,
        targetType: ((req.intent as Record<string, unknown>)?.target_type as string) as VerificationRequest["targetType"],
        targetId: (req.intent as Record<string, unknown>)?.target_id as string,
        metadata: (req.intent as Record<string, unknown>)?.metadata as Record<string, unknown>,
        orchestratorSignature: req.orchestrator_signature as string,
        timestamp: Number(req.timestamp_ms ?? Date.now()),
      };

      // Build context
      const context = this.buildContext(req.context as Record<string, unknown>, req.user_id as string);

      // Verify intent
      const result = await this.config.intentVerifier.verify(request, context);

      // Update metrics
      this.metrics.totalVerifications++;
      if (result.approved) {
        this.metrics.approvedCount++;
      } else {
        this.metrics.deniedCount++;
      }
      this.updateAvgVerificationTime(result.verificationTimeMs);

      // Convert to gRPC response
      callback(null, {
        request_id: result.requestId,
        result: result.approved ? "APPROVED" : this.mapDenialReason(result.denialReason),
        denial_reason: result.denialReason ?? "",
        denial_details: result.denialDetails ?? "",
        requires_escalation: result.requiresEscalation,
        escalation_reason: result.escalationReason ?? "",
        attestation_quote: result.attestationQuote,
        signed_intent: result.signedIntent,
        processed_at_ms: result.processedAt.toString(),
        verification_time_ms: result.verificationTimeMs,
      });
    } catch (error) {
      this.metrics.errorCount++;
      console.error("[gRPC] VerifyIntent error:", error);
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle ValidateMerchant RPC
   */
  private async handleValidateMerchant(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;

      this.metrics.merchantValidations++;

      const result = await this.config.merchantValidator.validate(
        req.merchant_id as string,
        req.mcc_code as string,
        {} as UserPolicies // Use empty policies for direct validation
      );

      callback(null, {
        is_valid: result.isValid,
        is_blocked: result.blocked,
        risk_tier: result.riskTier,
        denial_reason: result.reason ?? "",
        validation_time_ms: result.validationTimeMs,
      });
    } catch (error) {
      this.metrics.errorCount++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle CheckVelocity RPC
   */
  private async handleCheckVelocity(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;

      this.metrics.velocityChecks++;

      const limits = this.buildVelocityLimits(req.limits as Record<string, unknown>);

      const result = await this.config.velocityChecker.check(
        req.user_id as string,
        req.card_id as string,
        Number(req.amount_cents ?? 0),
        limits
      );

      callback(null, {
        within_limits: result.withinLimits,
        denial_reason: result.denialReason ?? "",
        denial_details: result.details ?? "",
        current_status: {
          daily_spent: result.currentState.dailySpent.toString(),
          daily_limit: result.currentState.dailyLimit.toString(),
          daily_remaining: result.currentState.dailyRemaining.toString(),
          daily_percent_used: result.currentState.dailyPercentUsed,
          weekly_spent: result.currentState.weeklySpent.toString(),
          weekly_limit: result.currentState.weeklyLimit.toString(),
          weekly_remaining: result.currentState.weeklyRemaining.toString(),
          weekly_percent_used: result.currentState.weeklyPercentUsed,
          monthly_spent: result.currentState.monthlySpent.toString(),
          monthly_limit: result.currentState.monthlyLimit.toString(),
          monthly_remaining: result.currentState.monthlyRemaining.toString(),
          monthly_percent_used: result.currentState.monthlyPercentUsed,
          daily_tx_count: result.currentState.dailyTxCount,
          weekly_tx_count: result.currentState.weeklyTxCount,
          monthly_tx_count: result.currentState.monthlyTxCount,
        },
        check_time_ms: result.checkTimeMs,
      });
    } catch (error) {
      this.metrics.errorCount++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle GetAttestation RPC
   */
  private async handleGetAttestation(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;

      this.metrics.attestationRefreshes++;

      const quote = await this.config.attestationProvider.getQuote({
        nonce: req.nonce as string,
        ...((req.report_data as Record<string, unknown>) ?? {}),
      });

      callback(null, {
        quote: Buffer.from(quote.quote).toString("base64"),
        public_key: quote.publicKey,
        timestamp: quote.timestamp.toString(),
        mr_enclave: quote.mrEnclave,
        mr_signer: quote.mrSigner,
        isv_prod_id: quote.isvProdId,
        isv_svn: quote.isvSvn,
        expires_at: quote.expiresAt.toString(),
        is_valid: this.config.attestationProvider.isAttestationValid(),
      });
    } catch (error) {
      this.metrics.errorCount++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle StreamVerifications RPC
   */
  private handleStreamVerifications(
    call: grpc.ServerWritableStream<Record<string, unknown>, Record<string, unknown>>
  ): void {
    // For now, just send a placeholder - in production this would stream real events
    const interval = setInterval(() => {
      if (call.cancelled) {
        clearInterval(interval);
        return;
      }

      // Stream would send real verification events here
    }, 1000);

    call.on("cancelled", () => {
      clearInterval(interval);
    });
  }

  /**
   * Handle HealthCheck RPC
   */
  private async handleHealthCheck(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const includeDetails = call.request.include_details as boolean;

      const isHealthy =
        this.config.attestationProvider.isAttestationValid();

      const response: Record<string, unknown> = {
        status: isHealthy ? "HEALTHY" : "DEGRADED",
        version: "1.0.0",
        uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000).toString(),
      };

      if (includeDetails) {
        const attestation = this.config.attestationProvider.getAttestation();

        response.details = {
          solana_connected: true, // Would check actual connection
          attestation_valid: this.config.attestationProvider.isAttestationValid(),
          turnkey_reachable: true, // Would check actual connection
          attestation_expires_at: attestation?.expiresAt.toString() ?? "0",
          metrics: {
            total_verifications: this.metrics.totalVerifications.toString(),
            approved_count: this.metrics.approvedCount.toString(),
            denied_count: this.metrics.deniedCount.toString(),
            avg_verification_time_ms: Math.round(this.metrics.avgVerificationTimeMs),
            merchant_validations: this.metrics.merchantValidations.toString(),
            velocity_checks: this.metrics.velocityChecks.toString(),
            error_count: this.metrics.errorCount.toString(),
          },
        };
      }

      callback(null, response);
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Build verification context from gRPC request
   */
  private buildContext(
    ctx: Record<string, unknown> | undefined,
    userId: string
  ): VerificationContext {
    if (!ctx) {
      return {
        userId,
        walletAddress: "",
        subOrganizationId: "",
        policies: this.getDefaultPolicies(),
      };
    }

    return {
      userId,
      walletAddress: ctx.wallet_address as string ?? "",
      subOrganizationId: ctx.sub_organization_id as string ?? "",
      cardId: ctx.card_id as string,
      policies: this.buildPolicies(ctx.policies as Record<string, unknown>),
    };
  }

  /**
   * Build policies from gRPC request
   */
  private buildPolicies(policies: Record<string, unknown> | undefined): UserPolicies {
    if (!policies) {
      return this.getDefaultPolicies();
    }

    return {
      merchantLocking: policies.merchant_locking as boolean ?? false,
      allowedMerchants: policies.allowed_merchants as string[],
      blockedMerchants: policies.blocked_merchants as string[],
      allowedMccCodes: policies.allowed_mcc_codes as string[],
      blockedMccCodes: policies.blocked_mcc_codes as string[],
      velocityLimits: this.buildVelocityLimits(policies.velocity_limits as Record<string, unknown>),
      requireBiometric: policies.require_biometric as boolean ?? false,
      requireFraudClearance: policies.require_fraud_clearance as boolean ?? false,
      require2FA: policies.require_2fa as boolean ?? false,
      maxTransactionAmount: Number(policies.max_transaction_amount ?? 0) || undefined,
    };
  }

  /**
   * Build velocity limits from gRPC request
   */
  private buildVelocityLimits(limits: Record<string, unknown> | undefined): VelocityLimits {
    if (!limits) {
      return {
        perTransaction: 10000000, // $100,000 default
        daily: 50000000,
        weekly: 200000000,
        monthly: 500000000,
      };
    }

    return {
      perTransaction: Number(limits.per_transaction ?? 10000000),
      daily: Number(limits.daily ?? 50000000),
      weekly: Number(limits.weekly ?? 200000000),
      monthly: Number(limits.monthly ?? 500000000),
      dailyTxCount: Number(limits.daily_tx_count) || undefined,
      weeklyTxCount: Number(limits.weekly_tx_count) || undefined,
      monthlyTxCount: Number(limits.monthly_tx_count) || undefined,
    };
  }

  /**
   * Get default policies
   */
  private getDefaultPolicies(): UserPolicies {
    return {
      merchantLocking: false,
      velocityLimits: {
        perTransaction: 10000000,
        daily: 50000000,
        weekly: 200000000,
        monthly: 500000000,
      },
      requireBiometric: false,
      requireFraudClearance: false,
      require2FA: false,
    };
  }

  /**
   * Map denial reason to gRPC enum
   */
  private mapDenialReason(reason?: string): string {
    if (!reason) return "INTERNAL_ERROR";

    const mapping: Record<string, string> = {
      MERCHANT_NOT_REGISTERED: "DENIED_MERCHANT",
      MERCHANT_BLOCKED: "DENIED_MERCHANT",
      MERCHANT_RISK_TOO_HIGH: "DENIED_MERCHANT",
      MCC_BLOCKED: "DENIED_MERCHANT",
      VELOCITY_DAILY_EXCEEDED: "DENIED_VELOCITY",
      VELOCITY_WEEKLY_EXCEEDED: "DENIED_VELOCITY",
      VELOCITY_MONTHLY_EXCEEDED: "DENIED_VELOCITY",
      VELOCITY_PER_TX_EXCEEDED: "DENIED_VELOCITY",
      POLICY_VIOLATION: "DENIED_POLICY",
      FRAUD_FLAGGED: "DENIED_FRAUD",
      ATTESTATION_FAILED: "DENIED_ATTESTATION",
    };

    return mapping[reason] ?? "INTERNAL_ERROR";
  }

  /**
   * Update average verification time
   */
  private updateAvgVerificationTime(timeMs: number): void {
    const total = this.metrics.totalVerifications;
    const currentAvg = this.metrics.avgVerificationTimeMs;
    this.metrics.avgVerificationTimeMs =
      (currentAvg * (total - 1) + timeMs) / total;
  }

  /**
   * Start the gRPC server
   */
  async start(): Promise<void> {
    const host = this.config.host ?? "0.0.0.0";
    const address = `${host}:${this.config.port}`;

    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        address,
        grpc.ServerCredentials.createInsecure(), // Use TLS in production
        (error, port) => {
          if (error) {
            reject(error);
            return;
          }
          console.log(`[gRPC] Financial Armor server listening on ${address}`);
          resolve();
        }
      );
    });
  }

  /**
   * Stop the gRPC server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        console.log("[gRPC] Server stopped");
        resolve();
      });
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): PluginMetrics {
    return { ...this.metrics };
  }
}
