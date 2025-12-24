/**
 * DisCard 2035 - Civic Gateway Integration
 *
 * Integration with Civic's Solana Gateway for KYC/identity verification.
 * Provides privacy-preserving attestations for age, residency, and identity.
 */

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import type {
  AttestationType,
  AttestationData,
  AttestationStatus,
} from "./sas-client";

// ============================================================================
// Types
// ============================================================================

export type CivicGatekeeperNetwork =
  | "ignREusXmGrscGNUesoU9mxfds9AiYTezUKex2PsZV6"   // Civic CAPTCHA Pass
  | "ni1jXzPTq1yTqo67tUmVgnp22b1qGAAZCtPmHtskqYG"  // Uniqueness Pass
  | "bni1ewus6aMxTxBi5SAfzEmmXLf8KcVFRmTfproJuKw"  // ID Verification Pass
  | "gatbGF9DvLAw3kWyn1EmH5Nh1Sqp8sTukF7yaQpSc71"  // Liveness Pass
  | string;

export type CivicPassState =
  | "active"
  | "expired"
  | "revoked"
  | "frozen"
  | "not_found";

export interface CivicGatewayToken {
  /** Gatekeeper network */
  gatekeeperNetwork: CivicGatekeeperNetwork;
  /** Token owner (user's wallet) */
  owner: string;
  /** Token state */
  state: CivicPassState;
  /** Issue timestamp */
  issuedAt: number;
  /** Expiry timestamp (if applicable) */
  expiresAt?: number;
  /** Gateway token account address */
  gatewayTokenAddress: string;
}

export interface CivicVerificationRequest {
  /** User's wallet address */
  wallet: string;
  /** Gatekeeper network to verify against */
  gatekeeperNetwork: CivicGatekeeperNetwork;
  /** Optional redirect URL after verification */
  redirectUrl?: string;
  /** Optional callback for status updates */
  onStatusChange?: (status: CivicVerificationStatus) => void;
}

export type CivicVerificationStatus =
  | "checking"
  | "not_requested"
  | "requested"
  | "in_review"
  | "approved"
  | "rejected"
  | "revoked"
  | "expired";

export interface CivicVerificationResult {
  success: boolean;
  status: CivicVerificationStatus;
  gatewayToken?: CivicGatewayToken;
  error?: string;
}

export interface CivicClientConfig {
  rpcEndpoint: string;
  /** Civic Gateway program ID */
  gatewayProgramId?: string;
  /** Cluster (mainnet, devnet, localnet) */
  cluster?: "mainnet-beta" | "devnet" | "localnet";
}

// ============================================================================
// Constants
// ============================================================================

/** Official Civic Gateway program ID */
const CIVIC_GATEWAY_PROGRAM_ID = "gatem74V238djXdzWnJf94Wo1DcnuGkfijbf3AuBhfs";

/** Mapping from Civic networks to DisCard attestation types */
const CIVIC_TO_DISCARD_TYPE: Record<string, AttestationType> = {
  "ignREusXmGrscGNUesoU9mxfds9AiYTezUKex2PsZV6": "identity_verified",
  "ni1jXzPTq1yTqo67tUmVgnp22b1qGAAZCtPmHtskqYG": "identity_verified",
  "bni1ewus6aMxTxBi5SAfzEmmXLf8KcVFRmTfproJuKw": "kyc_basic",
  "gatbGF9DvLAw3kWyn1EmH5Nh1Sqp8sTukF7yaQpSc71": "biometric_verified",
};

/** Default gatekeeper networks for different verification levels */
export const CIVIC_NETWORKS = {
  captcha: "ignREusXmGrscGNUesoU9mxfds9AiYTezUKex2PsZV6" as CivicGatekeeperNetwork,
  uniqueness: "ni1jXzPTq1yTqo67tUmVgnp22b1qGAAZCtPmHtskqYG" as CivicGatekeeperNetwork,
  idVerification: "bni1ewus6aMxTxBi5SAfzEmmXLf8KcVFRmTfproJuKw" as CivicGatekeeperNetwork,
  liveness: "gatbGF9DvLAw3kWyn1EmH5Nh1Sqp8sTukF7yaQpSc71" as CivicGatekeeperNetwork,
};

// ============================================================================
// Civic Client Implementation
// ============================================================================

export class CivicClient {
  private connection: Connection;
  private gatewayProgramId: PublicKey;
  private cluster: "mainnet-beta" | "devnet" | "localnet";
  private tokenCache: Map<string, CivicGatewayToken> = new Map();

  constructor(config: CivicClientConfig) {
    this.connection = new Connection(config.rpcEndpoint, "confirmed");
    this.gatewayProgramId = new PublicKey(
      config.gatewayProgramId ?? CIVIC_GATEWAY_PROGRAM_ID
    );
    this.cluster = config.cluster ?? "mainnet-beta";
  }

  // ==========================================================================
  // Gateway Token Operations
  // ==========================================================================

  /**
   * Check if user has a valid Civic gateway token
   */
  async hasValidGatewayToken(
    wallet: string,
    gatekeeperNetwork: CivicGatekeeperNetwork
  ): Promise<boolean> {
    const token = await this.getGatewayToken(wallet, gatekeeperNetwork);
    return token?.state === "active" && (!token.expiresAt || token.expiresAt > Date.now());
  }

  /**
   * Get gateway token for a wallet
   */
  async getGatewayToken(
    wallet: string,
    gatekeeperNetwork: CivicGatekeeperNetwork
  ): Promise<CivicGatewayToken | null> {
    const cacheKey = `${wallet}:${gatekeeperNetwork}`;

    // Check cache first
    const cached = this.tokenCache.get(cacheKey);
    if (cached && (cached.state === "active" || cached.state === "frozen")) {
      return cached;
    }

    try {
      // Derive gateway token PDA
      const walletPubkey = new PublicKey(wallet);
      const networkPubkey = new PublicKey(gatekeeperNetwork);

      const [gatewayTokenPda] = PublicKey.findProgramAddressSync(
        [
          walletPubkey.toBuffer(),
          Buffer.from("gateway"),
          Buffer.alloc(8), // Seed buffer
          networkPubkey.toBuffer(),
        ],
        this.gatewayProgramId
      );

      // Fetch account data
      const accountInfo = await this.connection.getAccountInfo(gatewayTokenPda);

      if (!accountInfo) {
        return null;
      }

      // Parse gateway token data
      // In production, use proper deserialization based on Civic's schema
      const token = this.parseGatewayTokenData(
        gatewayTokenPda.toBase58(),
        wallet,
        gatekeeperNetwork,
        accountInfo.data
      );

      // Cache the result
      this.tokenCache.set(cacheKey, token);

      return token;
    } catch (error) {
      console.error("Failed to fetch gateway token:", error);
      return null;
    }
  }

  /**
   * Get all gateway tokens for a wallet
   */
  async getAllGatewayTokens(wallet: string): Promise<CivicGatewayToken[]> {
    const tokens: CivicGatewayToken[] = [];

    // Check each known network
    for (const network of Object.values(CIVIC_NETWORKS)) {
      const token = await this.getGatewayToken(wallet, network);
      if (token) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  // ==========================================================================
  // Verification Flow
  // ==========================================================================

  /**
   * Initiate Civic verification process
   */
  async initiateVerification(
    request: CivicVerificationRequest
  ): Promise<{ verificationUrl: string; requestId: string }> {
    // Generate unique request ID
    const requestId = `civic_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Build Civic Pass URL
    // In production, use Civic's SDK or API to generate proper verification URL
    const baseUrl = this.cluster === "mainnet-beta"
      ? "https://getpass.civic.com"
      : "https://getpass.civic.com/staging";

    const params = new URLSearchParams({
      network: request.gatekeeperNetwork,
      wallet: request.wallet,
      requestId,
      cluster: this.cluster,
      ...(request.redirectUrl && { redirect: request.redirectUrl }),
    });

    const verificationUrl = `${baseUrl}?${params.toString()}`;

    return { verificationUrl, requestId };
  }

  /**
   * Check verification status
   */
  async checkVerificationStatus(
    wallet: string,
    gatekeeperNetwork: CivicGatekeeperNetwork
  ): Promise<CivicVerificationResult> {
    try {
      const token = await this.getGatewayToken(wallet, gatekeeperNetwork);

      if (!token) {
        return {
          success: false,
          status: "not_requested",
        };
      }

      switch (token.state) {
        case "active":
          return {
            success: true,
            status: "approved",
            gatewayToken: token,
          };
        case "expired":
          return {
            success: false,
            status: "expired",
            gatewayToken: token,
          };
        case "revoked":
          return {
            success: false,
            status: "revoked",
            gatewayToken: token,
          };
        case "frozen":
          return {
            success: false,
            status: "in_review",
            gatewayToken: token,
          };
        default:
          return {
            success: false,
            status: "not_requested",
          };
      }
    } catch (error) {
      return {
        success: false,
        status: "not_requested",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==========================================================================
  // Convert to DisCard Attestations
  // ==========================================================================

  /**
   * Convert Civic gateway token to DisCard attestation
   */
  civicTokenToAttestation(
    token: CivicGatewayToken,
    subjectDid: string
  ): AttestationData {
    const attestationType = CIVIC_TO_DISCARD_TYPE[token.gatekeeperNetwork] ?? "identity_verified";
    const status = this.civicStateToAttestationStatus(token.state);

    return {
      id: `civic_${token.gatewayTokenAddress}`,
      type: attestationType,
      issuer: "civic",
      subjectDid,
      onChainAddress: token.gatewayTokenAddress,
      status,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
      metadata: {
        gatekeeperNetwork: token.gatekeeperNetwork,
        owner: token.owner,
      },
    };
  }

  /**
   * Get all DisCard attestations from Civic for a user
   */
  async getAttestationsForUser(
    wallet: string,
    subjectDid: string
  ): Promise<AttestationData[]> {
    const tokens = await this.getAllGatewayTokens(wallet);
    return tokens.map((token) => this.civicTokenToAttestation(token, subjectDid));
  }

  // ==========================================================================
  // Verification Requirements
  // ==========================================================================

  /**
   * Get required Civic verifications for DisCard tier
   */
  getRequiredVerifications(
    tier: "basic" | "standard" | "premium" | "institutional"
  ): CivicGatekeeperNetwork[] {
    switch (tier) {
      case "basic":
        return [CIVIC_NETWORKS.captcha];
      case "standard":
        return [CIVIC_NETWORKS.captcha, CIVIC_NETWORKS.uniqueness];
      case "premium":
        return [
          CIVIC_NETWORKS.uniqueness,
          CIVIC_NETWORKS.idVerification,
          CIVIC_NETWORKS.liveness,
        ];
      case "institutional":
        return [
          CIVIC_NETWORKS.uniqueness,
          CIVIC_NETWORKS.idVerification,
          CIVIC_NETWORKS.liveness,
        ];
      default:
        return [];
    }
  }

  /**
   * Check if user meets tier requirements
   */
  async meetsTierRequirements(
    wallet: string,
    tier: "basic" | "standard" | "premium" | "institutional"
  ): Promise<{ meets: boolean; missing: CivicGatekeeperNetwork[] }> {
    const required = this.getRequiredVerifications(tier);
    const missing: CivicGatekeeperNetwork[] = [];

    for (const network of required) {
      const hasValid = await this.hasValidGatewayToken(wallet, network);
      if (!hasValid) {
        missing.push(network);
      }
    }

    return {
      meets: missing.length === 0,
      missing,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Parse gateway token data from account
   */
  private parseGatewayTokenData(
    address: string,
    owner: string,
    network: CivicGatekeeperNetwork,
    data: Buffer
  ): CivicGatewayToken {
    // In production, properly deserialize based on Civic's account structure
    // For now, extract basic fields

    // Gateway token layout (simplified):
    // 0: is_initialized (1 byte)
    // 1: state (1 byte) - 0: active, 1: frozen, 2: revoked
    // 2-9: issue_time (8 bytes, i64)
    // 10-17: expiry_time (8 bytes, i64, optional)

    const stateMap: Record<number, CivicPassState> = {
      0: "active",
      1: "frozen",
      2: "revoked",
      3: "expired",
    };

    const stateValue = data[1] ?? 0;
    const state = stateMap[stateValue] ?? "not_found";

    // Parse timestamps (little-endian i64)
    const issuedAt = Number(data.readBigInt64LE(2)) * 1000;
    const expiresAtRaw = Number(data.readBigInt64LE(10));
    const expiresAt = expiresAtRaw > 0 ? expiresAtRaw * 1000 : undefined;

    return {
      gatekeeperNetwork: network,
      owner,
      state,
      issuedAt,
      expiresAt,
      gatewayTokenAddress: address,
    };
  }

  /**
   * Convert Civic state to attestation status
   */
  private civicStateToAttestationStatus(state: CivicPassState): AttestationStatus {
    switch (state) {
      case "active":
        return "active";
      case "expired":
        return "expired";
      case "revoked":
        return "revoked";
      case "frozen":
        return "pending";
      default:
        return "pending";
    }
  }

  /**
   * Get human-readable name for network
   */
  getNetworkDisplayName(network: CivicGatekeeperNetwork): string {
    switch (network) {
      case CIVIC_NETWORKS.captcha:
        return "Bot Prevention";
      case CIVIC_NETWORKS.uniqueness:
        return "Uniqueness Verification";
      case CIVIC_NETWORKS.idVerification:
        return "ID Verification";
      case CIVIC_NETWORKS.liveness:
        return "Liveness Check";
      default:
        return "Custom Verification";
    }
  }

  /**
   * Clear token cache
   */
  clearCache(): void {
    this.tokenCache.clear();
  }
}

// ============================================================================
// Singleton Access
// ============================================================================

let civicClientInstance: CivicClient | null = null;

export function getCivicClient(config?: CivicClientConfig): CivicClient {
  if (!civicClientInstance && config) {
    civicClientInstance = new CivicClient(config);
  }
  if (!civicClientInstance) {
    throw new Error("Civic client not initialized. Call initializeCivicClient first.");
  }
  return civicClientInstance;
}

export function initializeCivicClient(config: CivicClientConfig): CivicClient {
  civicClientInstance = new CivicClient(config);
  return civicClientInstance;
}

export default CivicClient;
