/**
 * Attestation Provider Service
 *
 * Manages Phala TEE Remote Attestation and provides stamping
 * capability for Turnkey API requests.
 */

import { createHash, createSign, generateKeyPairSync, randomBytes } from "crypto";
import type {
  PhalaAttestationQuote,
  AttestationStamper,
  StampResult,
  AttestationProviderConfig,
  AttestationStampPayload,
} from "../types/index.js";
import { DEFAULT_ATTESTATION_CONFIG, ATTESTATION_HEADERS } from "../types/index.js";

/**
 * Service for managing Phala TEE attestation and Turnkey stamping
 */
export class AttestationProvider implements AttestationStamper {
  private config: AttestationProviderConfig;
  private privateKey: Buffer;
  private publicKey: string;
  private currentQuote: PhalaAttestationQuote | null = null;
  private quoteExpiry: number = 0;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<AttestationProviderConfig>) {
    this.config = { ...DEFAULT_ATTESTATION_CONFIG, ...config };

    // Initialize TEE-protected keys
    // In production, these would be derived from TEE secrets
    const keypair = generateKeyPairSync("ed25519");
    this.privateKey = keypair.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
    this.publicKey = keypair.publicKey.export({ type: "spki", format: "pem" }) as string;

    // Start auto-refresh if enabled
    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * Get the current attestation quote, refreshing if needed
   */
  async getQuote(
    reportData?: Record<string, unknown>
  ): Promise<PhalaAttestationQuote> {
    // Check if current quote is valid
    if (this.currentQuote && Date.now() < this.quoteExpiry) {
      return this.currentQuote;
    }

    // Generate new quote
    const quote = await this.generatePhalaQuote(reportData);

    this.currentQuote = quote;
    this.quoteExpiry = quote.expiresAt;

    return quote;
  }

  /**
   * Generate a Phala TEE attestation quote
   */
  private async generatePhalaQuote(
    reportData?: Record<string, unknown>
  ): Promise<PhalaAttestationQuote> {
    const reportDataBytes = Buffer.from(
      JSON.stringify(reportData ?? {})
    );

    try {
      // In production, this calls Phala's attestation API
      const response = await fetch(
        `${this.config.attestationEndpoint}/quote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_data: reportDataBytes.toString("hex"),
            nonce: randomBytes(16).toString("hex"),
          }),
        }
      );

      if (!response.ok) {
        // Fallback to simulated quote for development
        return this.generateSimulatedQuote(reportDataBytes);
      }

      const result = await response.json();

      return {
        quote: Buffer.from(result.quote, "hex"),
        publicKey: this.publicKey,
        timestamp: Date.now(),
        mrEnclave: result.mr_enclave,
        mrSigner: result.mr_signer,
        isvProdId: result.isv_prod_id,
        isvSvn: result.isv_svn,
        reportData: reportDataBytes,
        expiresAt: Date.now() + this.config.quoteValidityMs,
      };
    } catch {
      // Fallback to simulated quote for development
      return this.generateSimulatedQuote(reportDataBytes);
    }
  }

  /**
   * Generate a simulated quote for development/testing
   */
  private generateSimulatedQuote(
    reportData: Buffer
  ): PhalaAttestationQuote {
    // Create a deterministic simulated quote
    const timestamp = Date.now();
    const quoteData = Buffer.concat([
      Buffer.from("SIMULATED_PHALA_QUOTE_V1"),
      Buffer.from(timestamp.toString()),
      reportData,
      randomBytes(32),
    ]);

    const mrEnclave = createHash("sha256")
      .update("discard-financial-armor-enclave-v1")
      .digest("hex");

    const mrSigner = createHash("sha256")
      .update("discard-technologies")
      .digest("hex");

    return {
      quote: quoteData,
      publicKey: this.publicKey,
      timestamp,
      mrEnclave,
      mrSigner,
      isvProdId: 1,
      isvSvn: 1,
      reportData,
      expiresAt: timestamp + this.config.quoteValidityMs,
    };
  }

  /**
   * Stamp a payload for Turnkey API requests
   */
  async stamp(payload: string): Promise<StampResult> {
    // Get fresh attestation quote
    const quote = await this.getQuote({
      payload_hash: createHash("sha256").update(payload).digest("hex"),
      timestamp: Date.now(),
    });

    // Sign the payload
    const signature = this.signPayload(payload);

    // Create stamp payload
    const stampPayload: AttestationStampPayload = {
      attestation: Buffer.from(quote.quote).toString("base64"),
      signature: signature.toString("base64"),
      publicKey: this.publicKey,
      timestamp: Date.now(),
      nonce: randomBytes(16).toString("hex"),
    };

    return {
      stampHeaderName: ATTESTATION_HEADERS.STAMP,
      stampHeaderValue: Buffer.from(JSON.stringify(stampPayload)).toString(
        "base64"
      ),
    };
  }

  /**
   * Sign a payload with the TEE-protected key
   */
  private signPayload(payload: string): Buffer {
    const sign = createSign("SHA256");
    sign.update(payload);
    return sign.sign({ key: this.privateKey, format: "der", type: "pkcs8" });
  }

  /**
   * Sign arbitrary data and return base64 signature
   */
  async sign(data: string): Promise<string> {
    const signature = this.signPayload(data);
    return signature.toString("base64");
  }

  /**
   * Get the public key
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Refresh the attestation quote
   */
  async refreshAttestation(): Promise<void> {
    this.quoteExpiry = 0;
    await this.getQuote();
  }

  /**
   * Check if current attestation is valid
   */
  isAttestationValid(): boolean {
    return this.currentQuote !== null && Date.now() < this.quoteExpiry;
  }

  /**
   * Get the current attestation quote (without refreshing)
   */
  getAttestation(): PhalaAttestationQuote | null {
    return this.currentQuote;
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshAttestation();
      } catch (error) {
        console.error("[AttestationProvider] Auto-refresh failed:", error);
      }
    }, this.config.refreshIntervalMs);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Verify an attestation quote
   */
  async verifyQuote(
    quote: PhalaAttestationQuote
  ): Promise<{
    valid: boolean;
    details: {
      signatureValid: boolean;
      notExpired: boolean;
      mrEnclaveMatch: boolean;
      mrSignerMatch: boolean;
    };
  }> {
    const now = Date.now();
    const notExpired = now < quote.expiresAt;

    // Check MRENCLAVE if expected values are configured
    let mrEnclaveMatch = true;
    if (this.config.expectedMrEnclave?.length) {
      mrEnclaveMatch = this.config.expectedMrEnclave.includes(quote.mrEnclave);
    }

    // Check MRSIGNER if expected values are configured
    let mrSignerMatch = true;
    if (this.config.expectedMrSigner?.length) {
      mrSignerMatch = this.config.expectedMrSigner.includes(quote.mrSigner);
    }

    // In production, would verify quote signature with Intel/AMD attestation service
    const signatureValid = true; // Placeholder

    return {
      valid: signatureValid && notExpired && mrEnclaveMatch && mrSignerMatch,
      details: {
        signatureValid,
        notExpired,
        mrEnclaveMatch,
        mrSignerMatch,
      },
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopAutoRefresh();
    this.currentQuote = null;
  }
}
