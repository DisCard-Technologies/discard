/**
 * DisCard 2035 - Turnkey TEE Client
 *
 * Wrapper for Turnkey SDK to manage sub-organizations, wallets,
 * and transaction signing within AWS Nitro Enclaves.
 */

import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { WebauthnStamper } from "@turnkey/webauthn-stamper";
import bs58 from "bs58";

// ============================================================================
// Types
// ============================================================================

export interface TurnkeyConfig {
  apiBaseUrl?: string;
  organizationId: string;
  rpId: string; // Relying Party ID for WebAuthn (e.g., "discard.app")
}

export interface SubOrganization {
  subOrganizationId: string;
  rootUserId: string;
  serviceUserId: string;
  walletId: string;
  walletAddress: string;        // Solana address
  walletPublicKey: string;      // Solana public key
  ethereumAddress?: string;     // Ethereum address (0x...)
}

export interface PolicyConfig {
  merchantLocking: boolean;
  allowedMerchants?: string[];
  allowedMccCodes?: string[];
  blockedMerchants?: string[];
  blockedMccCodes?: string[];
  velocityLimits: {
    perTransaction: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  requireBiometric: boolean;
  requireStep2FA: boolean;
  requireFraudClearance: boolean;
}

export interface TransactionProposal {
  proposalId: string;
  transaction: Transaction | VersionedTransaction;
  status: "pending" | "approved" | "rejected" | "signed" | "expired";
  createdAt: number;
  expiresAt: number;
}

export interface SignatureResult {
  signature: Uint8Array;
  signatureBase58: string;
  publicKey: string;
}

// ============================================================================
// Turnkey Manager Class
// ============================================================================

export class TurnkeyManager {
  private config: Required<TurnkeyConfig>;
  private stamper: WebauthnStamper | null = null;

  constructor(config: TurnkeyConfig) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl ?? "https://api.turnkey.com",
      organizationId: config.organizationId,
      rpId: config.rpId,
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the Turnkey client with WebAuthn stamper
   */
  async initialize(): Promise<void> {
    this.stamper = new WebauthnStamper({
      rpId: this.config.rpId,
    });
  }

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.stamper !== null;
  }

  // ==========================================================================
  // Sub-Organization Management
  // ==========================================================================

  /**
   * Create a new sub-organization for a user
   * This creates an isolated cryptographic environment in AWS Nitro Enclave
   */
  async createSubOrganization(
    userId: string,
    displayName: string
  ): Promise<SubOrganization> {
    if (!this.stamper) {
      throw new Error("Turnkey client not initialized");
    }

    // Generate attestation for passkey
    const attestation = await this.getPasskeyAttestation(displayName);

    // Create sub-organization via Turnkey API
    const response = await fetch(`${this.config.apiBaseUrl}/public/v1/submit/create_sub_organization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stamp": attestation.stamp,
      },
      body: JSON.stringify({
        type: "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V4",
        timestampMs: Date.now().toString(),
        organizationId: this.config.organizationId,
        parameters: {
          subOrganizationName: `DisCard User ${userId}`,
          rootUsers: [
            {
              userName: displayName,
              userEmail: `${userId}@users.discard.app`,
              authenticators: [
                {
                  authenticatorName: "Passkey",
                  challenge: attestation.challenge,
                  attestation: {
                    credentialId: attestation.credentialId,
                    clientDataJson: attestation.clientDataJson,
                    attestationObject: attestation.attestationObject,
                    transports: ["internal", "hybrid"],
                  },
                },
              ],
            },
          ],
          rootQuorumThreshold: 1,
          wallet: {
            walletName: "Financial Persona Wallet",
            accounts: [
              {
                curve: "CURVE_ED25519",
                pathFormat: "PATH_FORMAT_BIP32",
                path: "m/44'/501'/0'/0'", // Solana derivation path
                addressFormat: "ADDRESS_FORMAT_SOLANA",
              },
              {
                curve: "CURVE_SECP256K1",
                pathFormat: "PATH_FORMAT_BIP32",
                path: "m/44'/60'/0'/0/0", // Ethereum derivation path
                addressFormat: "ADDRESS_FORMAT_ETHEREUM",
              },
            ],
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create sub-organization: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const activity = result.activity;

    // Extract created resources from activity result
    const subOrgResult = activity.result.createSubOrganizationResultV4;

    // Addresses: [0] = Solana, [1] = Ethereum
    const solanaAddress = subOrgResult.wallet.addresses[0];
    const ethereumAddress = subOrgResult.wallet.addresses[1];

    return {
      subOrganizationId: subOrgResult.subOrganizationId,
      rootUserId: subOrgResult.rootUserIds[0],
      serviceUserId: "", // Will be created separately
      walletId: subOrgResult.wallet.walletId,
      walletAddress: solanaAddress,
      walletPublicKey: this.addressToPublicKey(solanaAddress),
      ethereumAddress: ethereumAddress,
    };
  }

  /**
   * Get passkey attestation for sub-organization creation
   */
  private async getPasskeyAttestation(displayName: string): Promise<{
    challenge: string;
    credentialId: string;
    clientDataJson: string;
    attestationObject: string;
    stamp: string;
  }> {
    if (!this.stamper) {
      throw new Error("WebAuthn stamper not initialized");
    }

    // Generate random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const challengeBase64 = btoa(String.fromCharCode(...challenge));

    // Create credential via WebAuthn
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: "DisCard",
          id: this.config.rpId,
        },
        user: {
          id: new TextEncoder().encode(displayName),
          name: displayName,
          displayName: displayName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256 (P-256)
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        attestation: "direct",
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error("Failed to create passkey credential");
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    return {
      challenge: challengeBase64,
      credentialId: credential.id,
      clientDataJson: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
      attestationObject: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))),
      stamp: await this.createStamp(JSON.stringify({
        organizationId: this.config.organizationId,
        timestampMs: Date.now().toString(),
      })),
    };
  }

  /**
   * Create a stamp for API authentication
   */
  private async createStamp(payload: string): Promise<string> {
    if (!this.stamper) {
      throw new Error("WebAuthn stamper not initialized");
    }

    const stamp = await this.stamper.stamp(payload);
    return JSON.stringify(stamp);
  }

  // ==========================================================================
  // Transaction Signing
  // ==========================================================================

  /**
   * Sign a Solana transaction using the TEE-protected key
   */
  async signTransaction(
    subOrganizationId: string,
    walletAddress: string,
    transaction: Transaction | VersionedTransaction
  ): Promise<SignatureResult> {
    if (!this.stamper) {
      throw new Error("Turnkey client not initialized");
    }

    // Serialize the transaction message
    const message = "serializeMessage" in transaction
      ? transaction.serializeMessage()
      : transaction.message.serialize();

    // Create the signing request
    const signPayload = {
      type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
      timestampMs: Date.now().toString(),
      organizationId: subOrganizationId,
      parameters: {
        signWith: walletAddress,
        payload: Buffer.from(message).toString("hex"),
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
      },
    };

    // Get biometric authentication via WebAuthn
    const stamp = await this.createStamp(JSON.stringify(signPayload));

    // Submit to Turnkey API
    const response = await fetch(`${this.config.apiBaseUrl}/public/v1/submit/sign_raw_payload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stamp": stamp,
      },
      body: JSON.stringify(signPayload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to sign transaction: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const signResult = result.activity.result.signRawPayloadResult;

    // Convert signature from hex to bytes
    const signatureHex = signResult.r + signResult.s;
    const signatureBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
    );

    return {
      signature: signatureBytes,
      signatureBase58: bs58.encode(signatureBytes),
      publicKey: walletAddress,
    };
  }

  /**
   * Sign a message (for authentication)
   */
  async signMessage(
    subOrganizationId: string,
    walletAddress: string,
    message: Uint8Array
  ): Promise<SignatureResult> {
    if (!this.stamper) {
      throw new Error("Turnkey client not initialized");
    }

    const signPayload = {
      type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
      timestampMs: Date.now().toString(),
      organizationId: subOrganizationId,
      parameters: {
        signWith: walletAddress,
        payload: Buffer.from(message).toString("hex"),
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
      },
    };

    const stamp = await this.createStamp(JSON.stringify(signPayload));

    const response = await fetch(`${this.config.apiBaseUrl}/public/v1/submit/sign_raw_payload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stamp": stamp,
      },
      body: JSON.stringify(signPayload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to sign message: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const signResult = result.activity.result.signRawPayloadResult;

    const signatureHex = signResult.r + signResult.s;
    const signatureBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
    );

    return {
      signature: signatureBytes,
      signatureBase58: bs58.encode(signatureBytes),
      publicKey: walletAddress,
    };
  }

  // ==========================================================================
  // Policy Management
  // ==========================================================================

  /**
   * Update policies for a sub-organization
   * These policies are enforced in the AWS Nitro Enclave
   */
  async updatePolicies(
    subOrganizationId: string,
    policies: PolicyConfig
  ): Promise<void> {
    if (!this.stamper) {
      throw new Error("Turnkey client not initialized");
    }

    // Convert policies to Turnkey policy format
    const turnkeyPolicy = this.convertToTurnkeyPolicy(policies);

    const updatePayload = {
      type: "ACTIVITY_TYPE_SET_ORGANIZATION_FEATURE",
      timestampMs: Date.now().toString(),
      organizationId: subOrganizationId,
      parameters: {
        name: "FEATURE_NAME_POLICY_ENGINE",
        value: JSON.stringify(turnkeyPolicy),
      },
    };

    const stamp = await this.createStamp(JSON.stringify(updatePayload));

    const response = await fetch(`${this.config.apiBaseUrl}/public/v1/submit/set_organization_feature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stamp": stamp,
      },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to update policies: ${JSON.stringify(error)}`);
    }
  }

  /**
   * Convert DisCard policies to Turnkey policy format
   */
  private convertToTurnkeyPolicy(policies: PolicyConfig): object {
    return {
      effect: "EFFECT_ALLOW",
      consensus: "CONSENSUS_TYPE_SINGLE",
      condition: JSON.stringify({
        and: [
          // Biometric requirement
          ...(policies.requireBiometric
            ? [{ authenticator_type: { eq: "AUTHENTICATOR_TYPE_WEBAUTHN" } }]
            : []),
          // Transaction amount limit
          {
            or: [
              { action: { neq: "SIGN_RAW_PAYLOAD" } },
              {
                and: [
                  { action: { eq: "SIGN_RAW_PAYLOAD" } },
                  // Note: Actual amount validation would be done via custom logic
                ],
              },
            ],
          },
        ],
      }),
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Convert Solana address to public key
   */
  private addressToPublicKey(address: string): string {
    try {
      const publicKey = new PublicKey(address);
      return publicKey.toBase58();
    } catch {
      return address;
    }
  }

  /**
   * Get wallet address for a sub-organization
   */
  async getWalletAddress(subOrganizationId: string, walletId: string): Promise<string> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/public/v1/query/get_wallet?organizationId=${subOrganizationId}&walletId=${walletId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to get wallet");
    }

    const result = await response.json();
    return result.wallet.accounts[0].address;
  }

  /**
   * Export public key (for verification)
   */
  async exportPublicKey(
    subOrganizationId: string,
    walletId: string
  ): Promise<string> {
    return this.getWalletAddress(subOrganizationId, walletId);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let turnkeyManagerInstance: TurnkeyManager | null = null;

export function getTurnkeyManager(config?: TurnkeyConfig): TurnkeyManager {
  if (!turnkeyManagerInstance && config) {
    turnkeyManagerInstance = new TurnkeyManager(config);
  }
  if (!turnkeyManagerInstance) {
    throw new Error("TurnkeyManager not initialized. Call with config first.");
  }
  return turnkeyManagerInstance;
}

export function initializeTurnkeyManager(config: TurnkeyConfig): TurnkeyManager {
  turnkeyManagerInstance = new TurnkeyManager(config);
  return turnkeyManagerInstance;
}
