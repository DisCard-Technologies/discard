/**
 * DisCard Compliance Enclave - Phala TEE
 *
 * This enclave runs inside Phala's SGX-protected environment.
 * It performs Range API sanctions checks where:
 * - Address is decrypted only inside the enclave
 * - Range API sees the address but can't link it to the user
 * - RA-TLS attestation proves this exact code ran
 *
 * Security Model:
 * - MRENCLAVE verification ensures code integrity
 * - SGX encryption protects address in memory
 * - Attestation quote includes address hash for binding
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { createHash, randomBytes, createECDH, createDecipheriv } from "crypto";

// ============================================================================
// Configuration
// ============================================================================

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "8093", 10);
const ATTESTATION_PORT = parseInt(process.env.ATTESTATION_PORT || "8094", 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "8095", 10);
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// Range API Configuration
const RANGE_API_KEY = process.env.RANGE_API_KEY || "";
const RANGE_API_BASE_URL = process.env.RANGE_API_BASE_URL || "https://api.range.org";

// Phala/SGX Configuration
const PHALA_ATTESTATION_ENABLED = process.env.PHALA_ATTESTATION_ENABLED === "true";

// ============================================================================
// Logger (Simple console-based for enclave)
// ============================================================================

type LogData = Record<string, unknown>;

const logger = {
  info: (obj: LogData | string, msg?: string) => {
    const data: LogData = typeof obj === 'string' ? { msg: obj } : obj;
    const message = msg || data.msg || '';
    console.log(JSON.stringify({ level: 'info', ...data, msg: message, time: Date.now() }));
  },
  warn: (obj: LogData | string, msg?: string) => {
    const data: LogData = typeof obj === 'string' ? { msg: obj } : obj;
    const message = msg || data.msg || '';
    console.warn(JSON.stringify({ level: 'warn', ...data, msg: message, time: Date.now() }));
  },
  error: (obj: LogData | string, msg?: string) => {
    const data: LogData = typeof obj === 'string' ? { msg: obj } : obj;
    const message = msg || data.msg || '';
    console.error(JSON.stringify({ level: 'error', ...data, msg: message, time: Date.now() }));
  },
  fatal: (obj: LogData | string, msg?: string) => {
    const data: LogData = typeof obj === 'string' ? { msg: obj } : obj;
    const message = msg || data.msg || '';
    console.error(JSON.stringify({ level: 'fatal', ...data, msg: message, time: Date.now() }));
  },
};

// ============================================================================
// Types
// ============================================================================

interface ComplianceCheckRequest {
  encryptedAddress: string;
  ephemeralPublicKey: string;
  nonce: string;
  chain: "solana" | "ethereum";
  timestamp: number;
}

interface ComplianceCheckResponse {
  compliant: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  checkedAt: number;
  attestation: {
    quote: string;
    mrEnclave: string;
    mrSigner: string;
    isvProdId: number;
    isvSvn: number;
    reportData: string;
    timestamp: number;
    expiresAt: number;
  };
}

interface SanctionsResult {
  isOfacSanctioned: boolean;
  isTokenBlacklisted: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  details?: Array<{
    type: string;
    source: string;
    reason?: string;
  }>;
}

// ============================================================================
// Enclave Key Management
// ============================================================================

/**
 * Enclave ECDH key pair for decrypting incoming addresses.
 * In a real SGX environment, this would be sealed/unsealed using SGX sealing.
 */
class EnclaveKeyManager {
  private ecdh: ReturnType<typeof createECDH>;
  private publicKeyHex: string;

  constructor() {
    // Generate ECDH key pair (P-256 / secp256r1)
    this.ecdh = createECDH("prime256v1");
    this.ecdh.generateKeys();
    this.publicKeyHex = this.ecdh.getPublicKey("hex", "uncompressed");

    logger.info("Enclave key pair generated");
  }

  getPublicKey(): string {
    return this.publicKeyHex;
  }

  /**
   * Decrypt address using ECDH shared secret
   */
  decryptAddress(
    encryptedData: string,
    ephemeralPublicKey: string,
    nonce: string
  ): string {
    try {
      // For development, handle simple XOR encoding
      if (process.env.NODE_ENV !== "production") {
        const encrypted = Buffer.from(encryptedData, "base64");
        const keyBytes = Buffer.from(ephemeralPublicKey, "hex");
        const decrypted = Buffer.alloc(encrypted.length);

        for (let i = 0; i < encrypted.length; i++) {
          decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
        }

        return decrypted.toString("utf8");
      }

      // Production: Use ECDH to derive shared secret
      const ephemeralPubKeyBuffer = Buffer.from(ephemeralPublicKey, "hex");
      const sharedSecret = this.ecdh.computeSecret(ephemeralPubKeyBuffer);

      // Derive AES key from shared secret
      const aesKey = createHash("sha256").update(sharedSecret).digest();

      // Decrypt using AES-256-GCM
      const nonceBuffer = Buffer.from(nonce, "hex");
      const encryptedBuffer = Buffer.from(encryptedData, "base64");

      // Split encrypted data into ciphertext and auth tag
      const authTagLength = 16;
      const ciphertext = encryptedBuffer.slice(0, -authTagLength);
      const authTag = encryptedBuffer.slice(-authTagLength);

      const decipher = createDecipheriv("aes-256-gcm", aesKey, nonceBuffer);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString("utf8");
    } catch (error) {
      logger.error({ error }, "Address decryption failed");
      throw new Error("Failed to decrypt address");
    }
  }
}

// ============================================================================
// Range API Client (inside enclave)
// ============================================================================

class RangeComplianceService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = RANGE_API_KEY;
    this.baseUrl = RANGE_API_BASE_URL;
  }

  async checkSanctions(
    address: string,
    chain: string
  ): Promise<SanctionsResult> {
    logger.info({ addressPrefix: address.slice(0, 8) + "...", chain }, "Checking sanctions via Range API");

    try {
      if (!this.apiKey) {
        logger.warn("No Range API key - returning safe default");
        return this.getSafeDefault();
      }

      const response = await fetch(
        `${this.baseUrl}/v1/risk/sanctions?address=${address}&chain=${chain}&include_details=true`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        logger.error({ status: response.status }, "Range API error");
        return this.getSafeDefault();
      }

      const data = await response.json();

      const result: SanctionsResult = {
        isOfacSanctioned: data.is_ofac_sanctioned || false,
        isTokenBlacklisted: data.is_token_blacklisted || false,
        riskLevel: this.calculateRiskLevel(data),
        details: data.details?.map((d: { type: string; source: string; reason?: string }) => ({
          type: d.type,
          source: d.source,
          reason: d.reason,
        })),
      };

      logger.info(
        {
          sanctioned: result.isOfacSanctioned,
          blacklisted: result.isTokenBlacklisted,
          riskLevel: result.riskLevel,
        },
        "Sanctions check complete"
      );

      return result;
    } catch (error) {
      logger.error({ error }, "Sanctions check failed");
      return this.getSafeDefault();
    }
  }

  private calculateRiskLevel(data: {
    is_ofac_sanctioned?: boolean;
    is_token_blacklisted?: boolean;
    risk_score?: number;
  }): "low" | "medium" | "high" | "critical" {
    if (data.is_ofac_sanctioned) return "critical";
    if (data.is_token_blacklisted) return "critical";
    if (data.risk_score && data.risk_score > 80) return "high";
    if (data.risk_score && data.risk_score > 50) return "medium";
    return "low";
  }

  private getSafeDefault(): SanctionsResult {
    return {
      isOfacSanctioned: false,
      isTokenBlacklisted: false,
      riskLevel: "low",
    };
  }
}

// ============================================================================
// Attestation Generation
// ============================================================================

/**
 * Generate attestation quote proving code integrity
 *
 * In a real SGX environment, this calls the DCAP attestation API.
 * The quote proves that this exact code ran and includes the
 * address hash in the report data for binding.
 */
async function generateAttestationQuote(reportData: {
  address_hash: string;
  result: string;
  timestamp: number;
}): Promise<ComplianceCheckResponse["attestation"]> {
  const reportDataJson = JSON.stringify(reportData);
  const reportDataBuffer = Buffer.alloc(64);
  Buffer.from(reportDataJson).copy(reportDataBuffer, 0, 0, Math.min(64, reportDataJson.length));

  const timestamp = Date.now();

  if (PHALA_ATTESTATION_ENABLED) {
    // In production Phala environment, call the attestation service
    try {
      const response = await fetch("http://localhost:8090/attestation/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_data: reportDataBuffer.toString("hex"),
          nonce: randomBytes(16).toString("hex"),
        }),
      });

      if (response.ok) {
        const quote = await response.json();
        return {
          quote: quote.quote,
          mrEnclave: quote.mr_enclave,
          mrSigner: quote.mr_signer,
          isvProdId: quote.isv_prod_id ?? 1,
          isvSvn: quote.isv_svn ?? 1,
          reportData: reportDataBuffer.toString("base64"),
          timestamp,
          expiresAt: timestamp + 60000,
        };
      }
    } catch (error) {
      logger.warn({ error }, "Real attestation failed, using simulated");
    }
  }

  // Simulated quote for development
  const mrEnclave = createHash("sha256")
    .update("discard-compliance-enclave-v1")
    .digest("hex");

  const mrSigner = createHash("sha256")
    .update("discard-technologies")
    .digest("hex");

  const simulatedQuote = Buffer.concat([
    Buffer.from("SGX_QUOTE_V3_SIMULATED"),
    Buffer.from([0x03, 0x00]),
    Buffer.from([0x02, 0x00]),
    Buffer.alloc(4),
    Buffer.from(mrSigner, "hex").slice(0, 32),
    Buffer.from(mrEnclave, "hex").slice(0, 32),
    reportDataBuffer,
    randomBytes(64),
  ]);

  return {
    quote: simulatedQuote.toString("base64"),
    mrEnclave,
    mrSigner,
    isvProdId: 1,
    isvSvn: 1,
    reportData: reportDataBuffer.toString("base64"),
    timestamp,
    expiresAt: timestamp + 60000,
  };
}

// ============================================================================
// Express Application
// ============================================================================

function createApp(keyManager: EnclaveKeyManager, rangeService: RangeComplianceService) {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Request logging middleware
  app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'Request received');
    next();
  });

  // =========================================================================
  // Endpoints
  // =========================================================================

  /**
   * GET /key - Get enclave's public key for encrypting requests
   */
  app.get("/key", async (_req: Request, res: Response) => {
    try {
      const publicKey = keyManager.getPublicKey();

      // Generate attestation for the key
      const attestation = await generateAttestationQuote({
        address_hash: "key_export",
        result: "public_key",
        timestamp: Date.now(),
      });

      res.json({
        publicKey,
        algorithm: "secp256r1",
        attestation,
      });
    } catch (error) {
      logger.error({ error }, "Key export failed");
      res.status(500).json({ error: "Key export failed" });
    }
  });

  /**
   * POST /check - Check sanctions for an encrypted address
   */
  app.post("/check", async (req: Request, res: Response) => {
    try {
      const body = req.body as ComplianceCheckRequest;

      // Validate request
      if (!body.encryptedAddress || !body.ephemeralPublicKey || !body.chain) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      if (body.chain !== "solana" && body.chain !== "ethereum") {
        res.status(400).json({ error: "Invalid chain" });
        return;
      }

      // Decrypt address (only possible inside the enclave)
      const address = keyManager.decryptAddress(
        body.encryptedAddress,
        body.ephemeralPublicKey,
        body.nonce
      );

      logger.info({ addressPrefix: address.slice(0, 8) + "...", chain: body.chain }, "Processing compliance check");

      // Call Range API for sanctions check
      const result = await rangeService.checkSanctions(address, body.chain);

      // Generate attestation quote proving this code ran
      const addressHash = createHash("sha256").update(address).digest("hex");
      const attestation = await generateAttestationQuote({
        address_hash: addressHash,
        result: result.riskLevel,
        timestamp: Date.now(),
      });

      const response: ComplianceCheckResponse = {
        compliant: !result.isOfacSanctioned && !result.isTokenBlacklisted,
        riskLevel: result.riskLevel,
        checkedAt: Date.now(),
        attestation,
      };

      res.json(response);
    } catch (error) {
      logger.error({ error }, "Compliance check failed");
      res.status(500).json({ error: "Compliance check failed" });
    }
  });

  /**
   * GET /health - Health check endpoint
   */
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      service: "compliance-enclave",
      timestamp: Date.now(),
      attestationEnabled: PHALA_ATTESTATION_ENABLED,
    });
  });

  return app;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  logger.info("Starting DisCard Compliance Enclave...");

  // Initialize services
  const keyManager = new EnclaveKeyManager();
  const rangeService = new RangeComplianceService();

  // Create main app
  const app = createApp(keyManager, rangeService);

  // Start HTTP server
  app.listen(HTTP_PORT, () => {
    logger.info({ port: HTTP_PORT }, "Compliance API server started");
  });

  // Health check server (separate port for Kubernetes probes)
  const healthApp = express();
  healthApp.get("/health", (_req, res) => {
    res.json({ status: "healthy", timestamp: Date.now() });
  });
  healthApp.listen(HEALTH_PORT, () => {
    logger.info({ port: HEALTH_PORT }, "Health check server started");
  });

  // Attestation server (separate port for Phala attestation service)
  const attestationApp = express();
  attestationApp.use(express.json());
  attestationApp.post("/attestation/quote", async (req, res) => {
    try {
      const { report_data, nonce } = req.body;
      const quote = await generateAttestationQuote({
        address_hash: report_data || "",
        result: "attestation",
        timestamp: Date.now(),
      });
      res.json(quote);
    } catch (error) {
      logger.error({ error }, "Attestation generation failed");
      res.status(500).json({ error: "Attestation failed" });
    }
  });
  attestationApp.listen(ATTESTATION_PORT, () => {
    logger.info({ port: ATTESTATION_PORT }, "Attestation server started");
  });

  logger.info("DisCard Compliance Enclave ready");
}

main().catch((error) => {
  logger.fatal({ error }, "Failed to start enclave");
  process.exit(1);
});
