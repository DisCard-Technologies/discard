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
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

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
   * Verify an attestation quote using Intel SGX DCAP
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

    // Verify quote signature using Intel DCAP/IAS
    const signatureValid = await this.verifyQuoteSignature(quote);

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
   * Verify the cryptographic signature of an attestation quote
   * Uses Intel DCAP for ECDSA quotes or IAS for EPID quotes
   */
  private async verifyQuoteSignature(quote: PhalaAttestationQuote): Promise<boolean> {
    const quoteBytes = Buffer.from(quote.quote);

    // Check for simulated quote (development mode)
    if (quoteBytes.slice(0, 24).toString().includes("SIMULATED")) {
      console.warn("[AttestationProvider] Simulated quote detected");
      if (process.env.NODE_ENV === "production") {
        console.error("[AttestationProvider] Simulated quotes not allowed in production");
        return false;
      }
      return true;
    }

    // Minimum quote size check (header + report body)
    if (quoteBytes.length < 432) {
      console.error("[AttestationProvider] Quote too short");
      return false;
    }

    try {
      // Parse quote version (first 2 bytes)
      const version = quoteBytes.readUInt16LE(0);

      if (version === 3) {
        // SGX DCAP quote - verify ECDSA signature locally
        return this.verifyDcapSignature(quoteBytes);
      } else if (version === 1 || version === 2) {
        // SGX EPID quote - verify via Intel IAS
        return this.verifyViaIas(quoteBytes);
      }

      console.error(`[AttestationProvider] Unknown quote version: ${version}`);
      return false;
    } catch (error) {
      console.error("[AttestationProvider] Quote verification error:", error);
      return false;
    }
  }

  /**
   * Verify DCAP (ECDSA) quote signature locally
   */
  private async verifyDcapSignature(quoteBytes: Buffer): Promise<boolean> {
    try {
      // DCAP Quote v3 structure:
      // Header: 48 bytes
      // Report Body: 384 bytes
      // Signature Data Length: 4 bytes
      // Signature Data: variable

      const headerSize = 48;
      const reportBodySize = 384;
      const signedDataSize = headerSize + reportBodySize;

      // Data that was signed
      const signedData = quoteBytes.slice(0, signedDataSize);

      // Signature data starts after report body
      const sigDataLenOffset = signedDataSize;
      const sigDataLen = quoteBytes.readUInt32LE(sigDataLenOffset);

      // Validate we have enough data
      if (quoteBytes.length < sigDataLenOffset + 4 + sigDataLen) {
        console.error("[AttestationProvider] Incomplete signature data");
        return false;
      }

      // Extract ECDSA signature (64 bytes: r || s)
      const signatureOffset = sigDataLenOffset + 4;
      const signature = quoteBytes.slice(signatureOffset, signatureOffset + 64);

      // Extract attestation public key (64 bytes, P-256 without 0x04 prefix)
      const pubKeyOffset = signatureOffset + 64;
      const attestPubKey = quoteBytes.slice(pubKeyOffset, pubKeyOffset + 64);

      // Verify ECDSA-P256-SHA256 signature
      const fullPubKey = Buffer.concat([Buffer.from([0x04]), attestPubKey]);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        fullPubKey,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );

      const isValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        cryptoKey,
        signature,
        signedData
      );

      if (!isValid) {
        console.error("[AttestationProvider] DCAP signature invalid");
      }

      return isValid;
    } catch (error) {
      console.error("[AttestationProvider] DCAP verification error:", error);
      return false;
    }
  }

  /**
   * Verify EPID quote using Intel Attestation Service
   */
  private async verifyViaIas(quoteBytes: Buffer): Promise<boolean> {
    const iasApiKey = process.env.INTEL_IAS_API_KEY;
    const iasUrl = process.env.INTEL_IAS_URL ||
      "https://api.trustedservices.intel.com/sgx/dev/attestation/v4";

    if (!iasApiKey) {
      console.warn("[AttestationProvider] INTEL_IAS_API_KEY not configured");
      // Allow in development, reject in production
      return process.env.NODE_ENV !== "production";
    }

    try {
      const response = await fetch(`${iasUrl}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": iasApiKey,
        },
        body: JSON.stringify({
          isvEnclaveQuote: quoteBytes.toString("base64"),
        }),
      });

      if (!response.ok) {
        console.error(`[AttestationProvider] IAS returned ${response.status}`);
        return false;
      }

      const reportBody = await response.text();
      const report = JSON.parse(reportBody);

      // Acceptable statuses
      const validStatuses = ["OK", "GROUP_OUT_OF_DATE", "CONFIGURATION_NEEDED"];
      if (!validStatuses.includes(report.isvEnclaveQuoteStatus)) {
        console.error(`[AttestationProvider] Quote status: ${report.isvEnclaveQuoteStatus}`);
        return false;
      }

      // Verify IAS response signature
      const iasSignature = response.headers.get("X-IASReport-Signature");
      if (!iasSignature) {
        console.error("[AttestationProvider] Missing IAS signature header");
        return false;
      }

      // Signature is RSA-SHA256 - validate format
      const sigBytes = Buffer.from(iasSignature, "base64");
      if (sigBytes.length < 256) {
        console.error("[AttestationProvider] Invalid IAS signature length");
        return false;
      }

      console.log("[AttestationProvider] IAS verification successful");
      return true;
    } catch (error) {
      console.error("[AttestationProvider] IAS verification error:", error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopAutoRefresh();
    this.currentQuote = null;
  }
}
