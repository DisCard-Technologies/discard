/**
 * Turnkey Bridge Service
 *
 * Bridges elizaOS to Turnkey TEE for transaction signing.
 * Uses Phala attestation as the stamper for Turnkey API requests.
 */

import { Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { AttestationStamper } from "../types/index.js";

/**
 * Configuration for Turnkey bridge
 */
export interface TurnkeyBridgeConfig {
  apiBaseUrl: string;
  organizationId: string;
  stamper: AttestationStamper;
}

/**
 * Result of a signing operation
 */
export interface SigningResult {
  signature: Uint8Array;
  signatureBase58: string;
  activityId: string;
  r: string;
  s: string;
}

/**
 * Wallet information from Turnkey
 */
export interface WalletInfo {
  walletId: string;
  walletAddress: string;
  publicKey: string;
}

/**
 * Sub-organization information
 */
export interface SubOrganizationInfo {
  subOrganizationId: string;
  rootUserId: string;
  wallets: WalletInfo[];
}

/**
 * Service for bridging elizaOS to Turnkey TEE
 */
export class TurnkeyBridge {
  private config: TurnkeyBridgeConfig;

  constructor(config: TurnkeyBridgeConfig) {
    this.config = config;
  }

  /**
   * Sign a Solana transaction via Turnkey
   */
  async signTransaction(
    subOrganizationId: string,
    walletAddress: string,
    transaction: Transaction | VersionedTransaction
  ): Promise<SigningResult> {
    // Serialize the transaction message
    let transactionMessage: Uint8Array;

    if (transaction instanceof VersionedTransaction) {
      transactionMessage = transaction.message.serialize();
    } else {
      transactionMessage = transaction.serializeMessage();
    }

    // Create signing request
    const signPayload = {
      type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
      timestampMs: Date.now().toString(),
      organizationId: subOrganizationId,
      parameters: {
        signWith: walletAddress,
        payload: Buffer.from(transactionMessage).toString("hex"),
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
      },
    };

    // Get attestation stamp
    const stamp = await this.config.stamper.stamp(JSON.stringify(signPayload));

    // Submit to Turnkey API
    const response = await fetch(
      `${this.config.apiBaseUrl}/public/v1/submit/sign_raw_payload`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [stamp.stampHeaderName]: stamp.stampHeaderValue,
        },
        body: JSON.stringify(signPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Turnkey signing failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Check activity status
    if (result.activity.status !== "ACTIVITY_STATUS_COMPLETED") {
      throw new Error(
        `Turnkey signing not completed: ${result.activity.status}`
      );
    }

    const signResult = result.activity.result.signRawPayloadResult;

    // Combine r and s to form signature
    const signatureHex = signResult.r + signResult.s;
    const signatureBytes = Buffer.from(signatureHex, "hex");

    return {
      signature: new Uint8Array(signatureBytes),
      signatureBase58: bs58.encode(signatureBytes),
      activityId: result.activity.id,
      r: signResult.r,
      s: signResult.s,
    };
  }

  /**
   * Sign a raw message via Turnkey
   */
  async signMessage(
    subOrganizationId: string,
    walletAddress: string,
    message: Uint8Array
  ): Promise<SigningResult> {
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

    const stamp = await this.config.stamper.stamp(JSON.stringify(signPayload));

    const response = await fetch(
      `${this.config.apiBaseUrl}/public/v1/submit/sign_raw_payload`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [stamp.stampHeaderName]: stamp.stampHeaderValue,
        },
        body: JSON.stringify(signPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Turnkey message signing failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.activity.status !== "ACTIVITY_STATUS_COMPLETED") {
      throw new Error(
        `Turnkey signing not completed: ${result.activity.status}`
      );
    }

    const signResult = result.activity.result.signRawPayloadResult;
    const signatureHex = signResult.r + signResult.s;
    const signatureBytes = Buffer.from(signatureHex, "hex");

    return {
      signature: new Uint8Array(signatureBytes),
      signatureBase58: bs58.encode(signatureBytes),
      activityId: result.activity.id,
      r: signResult.r,
      s: signResult.s,
    };
  }

  /**
   * Get wallet information from a sub-organization
   */
  async getWallet(
    subOrganizationId: string,
    walletId: string
  ): Promise<WalletInfo | null> {
    const queryPayload = {
      organizationId: subOrganizationId,
      walletId,
    };

    const stamp = await this.config.stamper.stamp(JSON.stringify(queryPayload));

    const response = await fetch(
      `${this.config.apiBaseUrl}/public/v1/query/get_wallet`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [stamp.stampHeaderName]: stamp.stampHeaderValue,
        },
        body: JSON.stringify(queryPayload),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get wallet: ${response.status}`);
    }

    const result = await response.json();
    const wallet = result.wallet;

    // Find Solana account
    const solanaAccount = wallet.accounts?.find(
      (acc: { addressFormat: string }) => acc.addressFormat === "ADDRESS_FORMAT_SOLANA"
    );

    if (!solanaAccount) {
      return null;
    }

    return {
      walletId: wallet.walletId,
      walletAddress: solanaAccount.address,
      publicKey: solanaAccount.publicKey,
    };
  }

  /**
   * Get sub-organization information
   */
  async getSubOrganization(
    subOrganizationId: string
  ): Promise<SubOrganizationInfo | null> {
    const queryPayload = {
      organizationId: subOrganizationId,
    };

    const stamp = await this.config.stamper.stamp(JSON.stringify(queryPayload));

    const response = await fetch(
      `${this.config.apiBaseUrl}/public/v1/query/get_organization`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [stamp.stampHeaderName]: stamp.stampHeaderValue,
        },
        body: JSON.stringify(queryPayload),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get sub-organization: ${response.status}`);
    }

    const result = await response.json();
    const org = result.organizationData;

    return {
      subOrganizationId: org.organizationId,
      rootUserId: org.rootUserId,
      wallets: [], // Would need separate wallet queries
    };
  }

  /**
   * Check if Turnkey API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get the organization ID
   */
  getOrganizationId(): string {
    return this.config.organizationId;
  }

  /**
   * Get the API base URL
   */
  getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }
}
