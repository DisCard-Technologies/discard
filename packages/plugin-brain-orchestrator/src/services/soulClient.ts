/**
 * Soul CVM gRPC Client
 *
 * Client for communicating with the Soul (Financial Armor) CVM
 * for intent verification and attestation.
 *
 * Security: Uses mTLS with enclave-specific certificates for secure
 * communication between Brain and Soul TEE components.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import type {
  SoulVerificationRequest,
  SoulVerificationResponse,
} from "../types/intent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * TLS configuration for secure Brain-Soul communication
 */
export interface TlsConfig {
  /** Enable TLS (default: true in production) */
  enabled: boolean;
  /** Path to CA certificate for verifying Soul's certificate */
  caCertPath?: string;
  /** Path to Brain's client certificate (for mTLS) */
  clientCertPath?: string;
  /** Path to Brain's private key (for mTLS) */
  clientKeyPath?: string;
  /** Expected MRENCLAVE value for certificate pinning */
  expectedMrEnclave?: string;
  /** Skip certificate verification (DANGER: development only) */
  insecureSkipVerify?: boolean;
}

/**
 * Configuration for Soul client
 */
export interface SoulClientConfig {
  soulGrpcUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  /** TLS configuration for secure communication */
  tls?: TlsConfig;
}

/**
 * Attestation response from Soul
 */
export interface SoulAttestation {
  quote: Buffer;
  publicKey: string;
  mrEnclave: string;
  mrSigner: string;
  timestamp: number;
  expiresAt: number;
  isValid: boolean;
}

/**
 * Velocity status from Soul
 */
export interface VelocityStatus {
  dailySpent: number;
  dailyLimit: number;
  dailyRemaining: number;
  weeklySpent: number;
  weeklyLimit: number;
  weeklyRemaining: number;
  monthlySpent: number;
  monthlyLimit: number;
  monthlyRemaining: number;
}

/**
 * Soul CVM gRPC Client
 */
export class SoulClient {
  private client: any;
  private config: SoulClientConfig;
  private connected: boolean = false;
  private cachedAttestation: SoulAttestation | null = null;
  private attestationCacheExpiry: number = 0;
  private credentials: grpc.ChannelCredentials | null = null;

  constructor(config: Partial<SoulClientConfig> = {}) {
    this.config = {
      soulGrpcUrl: config.soulGrpcUrl || process.env.SOUL_GRPC_URL || "localhost:50051",
      timeoutMs: config.timeoutMs || 5000,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 1000,
      tls: config.tls || this.getDefaultTlsConfig(),
    };
  }

  /**
   * Get default TLS configuration based on environment
   */
  private getDefaultTlsConfig(): TlsConfig {
    const isProduction = process.env.NODE_ENV === "production";
    const certBasePath = process.env.TEE_CERT_PATH || "/etc/tee/certs";

    return {
      enabled: isProduction || process.env.SOUL_TLS_ENABLED === "true",
      caCertPath: process.env.SOUL_CA_CERT_PATH || `${certBasePath}/ca.crt`,
      clientCertPath: process.env.BRAIN_CLIENT_CERT_PATH || `${certBasePath}/brain-client.crt`,
      clientKeyPath: process.env.BRAIN_CLIENT_KEY_PATH || `${certBasePath}/brain-client.key`,
      expectedMrEnclave: process.env.SOUL_EXPECTED_MRENCLAVE,
      insecureSkipVerify: !isProduction && process.env.SOUL_TLS_INSECURE === "true",
    };
  }

  /**
   * Create gRPC credentials based on TLS configuration
   */
  private createCredentials(): grpc.ChannelCredentials {
    const tlsConfig = this.config.tls;

    // Use insecure credentials only in development with explicit flag
    if (!tlsConfig?.enabled) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("[SoulClient] TLS must be enabled in production");
      }
      console.warn("[SoulClient] WARNING: Using insecure credentials (development only)");
      return grpc.credentials.createInsecure();
    }

    try {
      // Load certificates
      const caCert = this.loadCertificate(tlsConfig.caCertPath, "CA certificate");
      const clientCert = this.loadCertificate(tlsConfig.clientCertPath, "client certificate");
      const clientKey = this.loadCertificate(tlsConfig.clientKeyPath, "client key");

      // Create SSL credentials with mutual TLS (mTLS)
      const sslCredentials = grpc.credentials.createSsl(
        caCert,
        clientKey,
        clientCert,
        {
          // Custom certificate verification for MRENCLAVE pinning
          checkServerIdentity: (hostname, cert) => {
            if (tlsConfig.insecureSkipVerify) {
              console.warn("[SoulClient] Skipping server identity verification (DANGEROUS)");
              return undefined;
            }

            // Verify MRENCLAVE if configured
            if (tlsConfig.expectedMrEnclave) {
              const mrEnclaveMatch = this.verifyMrEnclaveInCert(cert, tlsConfig.expectedMrEnclave);
              if (!mrEnclaveMatch) {
                return new Error(
                  `MRENCLAVE mismatch: expected ${tlsConfig.expectedMrEnclave}`
                );
              }
            }

            return undefined; // No error
          },
        }
      );

      console.log("[SoulClient] mTLS credentials created successfully");
      return sslCredentials;
    } catch (error) {
      console.error("[SoulClient] Failed to create TLS credentials:", error);

      // In development, fall back to insecure if certs not found
      if (process.env.NODE_ENV !== "production") {
        console.warn("[SoulClient] Falling back to insecure credentials");
        return grpc.credentials.createInsecure();
      }

      throw error;
    }
  }

  /**
   * Load a certificate file
   */
  private loadCertificate(path: string | undefined, name: string): Buffer {
    if (!path) {
      throw new Error(`[SoulClient] ${name} path not configured`);
    }

    if (!existsSync(path)) {
      throw new Error(`[SoulClient] ${name} not found at: ${path}`);
    }

    return readFileSync(path);
  }

  /**
   * Verify MRENCLAVE value in certificate's SAN extension
   *
   * TEE certificates should include the MRENCLAVE value in a custom
   * Subject Alternative Name (SAN) extension or in the CN field.
   */
  private verifyMrEnclaveInCert(cert: any, expectedMrEnclave: string): boolean {
    try {
      // Check Subject CN for MRENCLAVE
      const subject = cert.subject;
      if (subject?.CN?.includes(expectedMrEnclave)) {
        return true;
      }

      // Check SAN extensions for MRENCLAVE URI
      // Format: URI:urn:mrenclave:<hex-value>
      const sanExtension = cert.subjectaltname;
      if (sanExtension) {
        const mrEnclaveUri = `urn:mrenclave:${expectedMrEnclave}`;
        if (sanExtension.includes(mrEnclaveUri)) {
          return true;
        }
      }

      console.warn("[SoulClient] MRENCLAVE not found in certificate");
      return false;
    } catch (error) {
      console.error("[SoulClient] Error verifying MRENCLAVE in cert:", error);
      return false;
    }
  }

  /**
   * Initialize connection to Soul CVM with TLS
   */
  async connect(): Promise<void> {
    const protoPath = resolve(
      __dirname,
      "../../node_modules/@discard/plugin-financial-armor/src/grpc/proto/financial_armor.proto"
    );

    // Fallback to relative path if node_modules path doesn't work
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const FinancialArmorService =
      proto.discard.financial_armor.v1.FinancialArmorService;

    // Create secure credentials
    this.credentials = this.createCredentials();

    // Create client with TLS credentials
    this.client = new FinancialArmorService(
      this.config.soulGrpcUrl,
      this.credentials
    );

    // Wait for connection
    await this.waitForReady();
    this.connected = true;

    console.log(`[SoulClient] Connected to Soul CVM at ${this.config.soulGrpcUrl}`);
  }

  /**
   * Wait for gRPC channel to be ready
   */
  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + this.config.timeoutMs;
      this.client.waitForReady(deadline, (error: Error | null) => {
        if (error) {
          reject(new Error(`Failed to connect to Soul CVM: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Verify an intent with the Soul CVM
   */
  async verifyIntent(
    request: SoulVerificationRequest,
    context: {
      userId: string;
      walletAddress: string;
      subOrganizationId: string;
      cardId?: string;
    }
  ): Promise<SoulVerificationResponse> {
    if (!this.connected) {
      await this.connect();
    }

    const grpcRequest = {
      requestId: request.requestId,
      userId: context.userId,
      intentId: request.intentId,
      intent: {
        action: request.action,
        sourceType: request.sourceType,
        sourceId: request.sourceId || "",
        targetType: request.targetType,
        targetId: request.targetId || "",
        amountCents: request.amount ? Math.round(request.amount * 100) : 0,
        currency: request.currency || "USDC",
        merchant: request.merchant
          ? {
              merchantId: request.merchant.merchantId,
              merchantName: request.merchant.merchantName || "",
              mccCode: request.merchant.mccCode,
              countryCode: request.merchant.countryCode || "",
              visaMid: request.merchant.visaMid || "",
            }
          : undefined,
        metadata: request.metadata || {},
      },
      orchestratorSignature: request.brainAttestationQuote || "",
      timestampMs: request.timestamp,
      context: {
        walletAddress: context.walletAddress,
        subOrganizationId: context.subOrganizationId,
        cardId: context.cardId || "",
      },
    };

    return this.callWithRetry("verifyIntent", grpcRequest);
  }

  /**
   * Get Soul's TEE attestation
   */
  async getAttestation(
    nonce: string,
    forceRefresh: boolean = false
  ): Promise<SoulAttestation> {
    // Return cached attestation if valid
    if (
      !forceRefresh &&
      this.cachedAttestation &&
      Date.now() < this.attestationCacheExpiry
    ) {
      return this.cachedAttestation;
    }

    if (!this.connected) {
      await this.connect();
    }

    const response = await this.callWithRetry<any>("getAttestation", {
      nonce,
      reportData: {},
    });

    this.cachedAttestation = {
      quote: Buffer.from(response.quote || [], "base64"),
      publicKey: response.publicKey,
      mrEnclave: response.mrEnclave,
      mrSigner: response.mrSigner,
      timestamp: parseInt(response.timestamp) || Date.now(),
      expiresAt: parseInt(response.expiresAt) || Date.now() + 60000,
      isValid: response.isValid,
    };

    // Cache for 50 seconds (attestation typically valid for 60s)
    this.attestationCacheExpiry = Date.now() + 50000;

    return this.cachedAttestation;
  }

  /**
   * Check velocity limits with Soul
   */
  async checkVelocity(
    userId: string,
    cardId: string,
    amountCents: number
  ): Promise<{
    withinLimits: boolean;
    denialReason?: string;
    status: VelocityStatus;
  }> {
    if (!this.connected) {
      await this.connect();
    }

    const response = await this.callWithRetry<any>("checkVelocity", {
      userId,
      cardId,
      amountCents,
    });

    return {
      withinLimits: response.withinLimits,
      denialReason: response.denialReason,
      status: {
        dailySpent: parseInt(response.currentStatus?.dailySpent) || 0,
        dailyLimit: parseInt(response.currentStatus?.dailyLimit) || 0,
        dailyRemaining: parseInt(response.currentStatus?.dailyRemaining) || 0,
        weeklySpent: parseInt(response.currentStatus?.weeklySpent) || 0,
        weeklyLimit: parseInt(response.currentStatus?.weeklyLimit) || 0,
        weeklyRemaining: parseInt(response.currentStatus?.weeklyRemaining) || 0,
        monthlySpent: parseInt(response.currentStatus?.monthlySpent) || 0,
        monthlyLimit: parseInt(response.currentStatus?.monthlyLimit) || 0,
        monthlyRemaining:
          parseInt(response.currentStatus?.monthlyRemaining) || 0,
      },
    };
  }

  /**
   * Validate merchant with Soul
   */
  async validateMerchant(
    merchantId: string,
    mccCode: string,
    countryCode?: string
  ): Promise<{
    isValid: boolean;
    isBlocked: boolean;
    riskTier: number;
    denialReason?: string;
  }> {
    if (!this.connected) {
      await this.connect();
    }

    const response = await this.callWithRetry<any>("validateMerchant", {
      merchantId,
      mccCode,
      countryCode: countryCode || "",
    });

    return {
      isValid: response.isValid,
      isBlocked: response.isBlocked,
      riskTier: response.riskTier,
      denialReason: response.denialReason,
    };
  }

  /**
   * Check if Soul is healthy
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    version: string;
    attestationValid: boolean;
  }> {
    if (!this.connected) {
      try {
        await this.connect();
      } catch {
        return {
          healthy: false,
          version: "unknown",
          attestationValid: false,
        };
      }
    }

    try {
      const response = await this.callWithRetry<any>("healthCheck", {
        includeDetails: true,
      });

      return {
        healthy: response.status === "HEALTHY",
        version: response.version || "unknown",
        attestationValid: response.details?.attestationValid || false,
      };
    } catch {
      return {
        healthy: false,
        version: "unknown",
        attestationValid: false,
      };
    }
  }

  /**
   * Call gRPC method with retry logic
   */
  private async callWithRetry<T>(
    method: string,
    request: any
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.callGrpc<T>(method, request);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (
          error instanceof Error &&
          (error.message.includes("INVALID_ARGUMENT") ||
            error.message.includes("NOT_FOUND"))
        ) {
          throw error;
        }

        // Wait before retrying
        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError || new Error(`Failed to call ${method} after retries`);
  }

  /**
   * Make a gRPC call
   */
  private callGrpc<T>(method: string, request: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + this.config.timeoutMs);

      this.client[method](
        request,
        { deadline },
        (error: grpc.ServiceError | null, response: T) => {
          if (error) {
            reject(
              new Error(`Soul ${method} failed: ${error.message} (${error.code})`)
            );
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if connected to Soul
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close connection and cleanup resources
   */
  close(): void {
    if (this.client) {
      this.client.close();
      this.connected = false;
      this.credentials = null;
      this.cachedAttestation = null;
      console.log("[SoulClient] Connection closed");
    }
  }

  /**
   * Reconnect with fresh TLS credentials
   * Use this after certificate rotation
   */
  async reconnect(): Promise<void> {
    console.log("[SoulClient] Reconnecting with fresh credentials...");
    this.close();
    await this.connect();
  }

  /**
   * Get current TLS configuration (for debugging)
   */
  getTlsConfig(): TlsConfig | undefined {
    return this.config.tls;
  }

  /**
   * Check if connection is using TLS
   */
  isSecure(): boolean {
    return this.config.tls?.enabled === true;
  }
}
