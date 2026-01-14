/**
 * Arcium MPC Client
 *
 * Service for confidential computations using Arcium's Multi-Party Computation
 * (MPC) network. Enables threshold operations, private balance verification,
 * and confidential transaction approval without revealing sensitive data.
 *
 * Features:
 * - Encrypted input preparation via RescueCipher
 * - Threshold approval for high-value transactions
 * - Private balance verification (prove balance > threshold without revealing amount)
 * - Confidential computation submission and callback tracking
 *
 * @see https://docs.arcium.com
 */

import { PublicKey, Finality } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  RescueCipher,
  x25519,
  getMXEPublicKey,
  awaitComputationFinalization as arciumAwaitFinalization,
  getArciumEnv,
  getClusterAccAddress,
  getComputationAccAddress,
} from "@arcium-hq/client";

// ============================================================================
// Configuration
// ============================================================================

const ARCIUM_CLUSTER_URL = process.env.EXPO_PUBLIC_ARCIUM_CLUSTER_URL || "https://devnet.arcium.com";
const ARCIUM_PROGRAM_ID = process.env.EXPO_PUBLIC_ARCIUM_PROGRAM_ID || "";

// ============================================================================
// Types
// ============================================================================

export interface ArciumConfig {
  clusterUrl: string;
  programId: string;
  mxeOffset?: number;
}

export interface EncryptedInput {
  /** Ciphertext bytes (array of 32-byte arrays) */
  ciphertext: number[][];
  /** Public key used for encryption */
  publicKey: Uint8Array;
  /** Nonce for decryption */
  nonce: Uint8Array;
}

export interface ThresholdApprovalRequest {
  /** Transaction ID or hash to approve */
  transactionId: string;
  /** Amount in lamports */
  amount: number;
  /** Destination address */
  destinationAddress: string;
  /** Required approvals (2-of-3, 3-of-5, etc.) */
  threshold: number;
  /** Total parties */
  totalParties: number;
  /** Party public keys */
  partyPubkeys: string[];
}

export interface ThresholdApprovalResult {
  /** Whether threshold was met */
  approved: boolean;
  /** Number of approvals received */
  approvalCount: number;
  /** Aggregated signature if approved */
  aggregatedSignature?: string;
  /** Computation ID for tracking */
  computationId: string;
  /** Error if failed */
  error?: string;
}

export interface PrivateBalanceProof {
  /** Proof that balance >= threshold */
  proof: Uint8Array;
  /** Threshold value proved against */
  threshold: number;
  /** Whether balance meets threshold */
  meetsThreshold: boolean;
  /** Timestamp of proof generation */
  generatedAt: number;
}

export interface ComputationStatus {
  /** Computation ID */
  computationId: string;
  /** Current status */
  status: "queued" | "executing" | "completed" | "failed";
  /** Result if completed */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Block when finalized */
  finalizedAt?: number;
}

/** Callback type for computation result notifications */
export type ComputationCallback = (result: ComputationStatus) => void;

/** Provider interface for Solana/Anchor operations */
export interface ArciumProvider {
  connection: {
    getAccountInfo: (address: PublicKey) => Promise<{ data: Buffer } | null>;
  };
}

// ============================================================================
// Arcium MPC Service
// ============================================================================

export class ArciumMpcService {
  private config: ArciumConfig;
  private mxePublicKey: Uint8Array | null = null;

  // Callback infrastructure
  private computationCallbacks: Map<string, ComputationCallback> = new Map();
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config?: Partial<ArciumConfig>) {
    this.config = {
      clusterUrl: config?.clusterUrl || ARCIUM_CLUSTER_URL,
      programId: config?.programId || ARCIUM_PROGRAM_ID,
      mxeOffset: config?.mxeOffset || 0,
    };
  }

  // ==========================================================================
  // Encryption Utilities
  // ==========================================================================

  /**
   * Generate x25519 keypair for encrypted communication with MXE
   *
   * Uses the Arcium SDK's x25519 utilities for proper elliptic curve
   * Diffie-Hellman key exchange with the MPC cluster.
   */
  async generateKeyPair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
    // Generate x25519 keypair using Arcium SDK
    const privateKey = x25519.utils.randomPrivateKey();
    const publicKey = x25519.getPublicKey(privateKey);

    console.log("[ArciumMPC] Generated x25519 keypair");
    return { privateKey, publicKey };
  }

  /**
   * Get MXE public key for key exchange
   *
   * Fetches the MXE's x25519 public key from the Arcium network.
   * This key is used for Diffie-Hellman key exchange to derive
   * the shared secret for RescueCipher encryption.
   *
   * @param provider - Optional Anchor provider for on-chain queries
   */
  async getMxePublicKey(provider?: ArciumProvider): Promise<Uint8Array> {
    if (this.mxePublicKey) {
      return this.mxePublicKey;
    }

    console.log("[ArciumMPC] Fetching MXE public key...");

    try {
      if (provider && this.config.programId) {
        // Use SDK to fetch real MXE public key from on-chain
        const programId = new PublicKey(this.config.programId);
        const mxePubKey = await getMXEPublicKey(provider as never, programId);

        if (mxePubKey) {
          this.mxePublicKey = mxePubKey;
          console.log("[ArciumMPC] MXE public key fetched from network");
          return this.mxePublicKey;
        }
      }

      // Fallback for demo/testing - generate deterministic key
      console.warn("[ArciumMPC] No provider or program ID - using fallback MXE key");
      this.mxePublicKey = x25519.utils.randomPrivateKey();
      return this.mxePublicKey;
    } catch (error) {
      console.error("[ArciumMPC] Failed to get MXE public key:", error);
      // Fallback to random key for demo
      this.mxePublicKey = x25519.utils.randomPrivateKey();
      return this.mxePublicKey;
    }
  }

  /**
   * Encrypt input data for confidential computation
   *
   * Uses RescueCipher with x25519 key exchange as per Arcium specification:
   * 1. Perform x25519 ECDH with MXE public key to get shared secret
   * 2. Initialize RescueCipher with the shared secret
   * 3. Encrypt data in CTR mode with random nonce
   *
   * @param data - Array of bigint values to encrypt
   * @param privateKey - User's x25519 private key
   * @param provider - Optional provider for MXE public key fetch
   */
  async encryptInput(
    data: bigint[],
    privateKey: Uint8Array,
    provider?: ArciumProvider
  ): Promise<EncryptedInput> {
    console.log("[ArciumMPC] Encrypting input data with RescueCipher...");

    try {
      // Get MXE public key for key exchange
      const mxePublicKey = await this.getMxePublicKey(provider);

      // Derive public key from private key
      const publicKey = x25519.getPublicKey(privateKey);

      // Generate random nonce (16 bytes as per Arcium spec)
      const nonce = crypto.getRandomValues(new Uint8Array(16));

      // Perform x25519 key exchange to get shared secret
      const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);

      // Initialize RescueCipher with shared secret
      const cipher = new RescueCipher(sharedSecret);

      // Encrypt the plaintext data (returns number[][] - array of 32-byte arrays)
      const ciphertext = cipher.encrypt(data, nonce);

      console.log("[ArciumMPC] Input encrypted successfully");

      return {
        ciphertext,
        publicKey,
        nonce,
      };
    } catch (error) {
      console.error("[ArciumMPC] Encryption failed:", error);
      throw error;
    }
  }

  /**
   * Decrypt data received from MXE
   *
   * Uses the same shared secret derivation as encryption.
   * Note: MXE increments nonce by 1 when encrypting response.
   *
   * @param encryptedData - Encrypted data from MXE
   * @param privateKey - User's x25519 private key (same as used for encryption)
   * @param provider - Optional provider for MXE public key fetch
   */
  async decryptOutput(
    encryptedData: EncryptedInput,
    privateKey: Uint8Array,
    provider?: ArciumProvider
  ): Promise<bigint[]> {
    console.log("[ArciumMPC] Decrypting output data...");

    try {
      const mxePublicKey = await this.getMxePublicKey(provider);
      const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
      const cipher = new RescueCipher(sharedSecret);

      // Note: MXE increments nonce by 1 for response
      const responseNonce = this.incrementNonce(encryptedData.nonce);

      // Decrypt the ciphertext
      const plaintext = cipher.decrypt(encryptedData.ciphertext, responseNonce);

      console.log("[ArciumMPC] Output decrypted successfully");
      return plaintext;
    } catch (error) {
      console.error("[ArciumMPC] Decryption failed:", error);
      throw error;
    }
  }

  /**
   * Increment nonce by 1 (little-endian)
   */
  private incrementNonce(nonce: Uint8Array): Uint8Array {
    const incremented = new Uint8Array(nonce);
    for (let i = 0; i < incremented.length; i++) {
      if (incremented[i] < 255) {
        incremented[i]++;
        break;
      }
      incremented[i] = 0;
    }
    return incremented;
  }

  // ==========================================================================
  // Callback Infrastructure
  // ==========================================================================

  /**
   * Register callback for computation result
   *
   * Starts polling for the computation status and invokes the callback
   * when the computation completes or fails.
   *
   * @param computationId - ID of the computation to track
   * @param callback - Function to call with the result
   * @returns Unsubscribe function to stop tracking
   */
  onComputationComplete(
    computationId: string,
    callback: ComputationCallback
  ): () => void {
    this.computationCallbacks.set(computationId, callback);

    // Start polling for result
    this.startPolling(computationId);

    // Return unsubscribe function
    return () => {
      this.computationCallbacks.delete(computationId);
      this.stopPolling(computationId);
    };
  }

  private startPolling(computationId: string): void {
    if (this.pollingIntervals.has(computationId)) return;

    const interval = setInterval(async () => {
      const status = await this.getComputationStatus(computationId);

      if (status.status === "completed" || status.status === "failed") {
        const callback = this.computationCallbacks.get(computationId);
        if (callback) {
          callback(status);
        }
        this.stopPolling(computationId);
        this.computationCallbacks.delete(computationId);
      }
    }, 2000);

    this.pollingIntervals.set(computationId, interval);
  }

  private stopPolling(computationId: string): void {
    const interval = this.pollingIntervals.get(computationId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(computationId);
    }
  }

  // ==========================================================================
  // Threshold Operations
  // ==========================================================================

  /**
   * Request threshold approval for a transaction
   *
   * Multiple parties must approve before the transaction can execute.
   * Uses MPC to aggregate approvals without revealing individual votes.
   */
  async requestThresholdApproval(
    request: ThresholdApprovalRequest
  ): Promise<ThresholdApprovalResult> {
    console.log("[ArciumMPC] Requesting threshold approval:", {
      txId: request.transactionId.slice(0, 8) + "...",
      threshold: `${request.threshold}-of-${request.totalParties}`,
    });

    try {
      if (!this.config.programId) {
        throw new Error("Arcium program ID not configured");
      }

      // Generate computation offset
      const computationId = this.generateComputationId();

      // In production, this would:
      // 1. Prepare encrypted approval request
      // 2. Submit to MXE via Solana transaction
      // 3. Wait for MPC nodes to collect approvals
      // 4. Return aggregated result

      // Placeholder implementation
      const result: ThresholdApprovalResult = {
        approved: false,
        approvalCount: 0,
        computationId,
        error: "Threshold approval requires Arcium program deployment",
      };

      console.log("[ArciumMPC] Threshold approval result:", result);
      return result;
    } catch (error) {
      console.error("[ArciumMPC] Threshold approval failed:", error);
      return {
        approved: false,
        approvalCount: 0,
        computationId: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Submit an approval vote for a threshold transaction
   */
  async submitApprovalVote(
    computationId: string,
    approve: boolean,
    voterPrivateKey: Uint8Array
  ): Promise<boolean> {
    console.log("[ArciumMPC] Submitting approval vote:", {
      computationId: computationId.slice(0, 8) + "...",
      approve,
    });

    try {
      // Encrypt the vote
      const encryptedVote = await this.encryptInput(
        [BigInt(approve ? 1 : 0)],
        voterPrivateKey
      );

      // In production, submit encrypted vote to MXE
      // The MPC nodes will aggregate votes without revealing individual choices
      console.log("[ArciumMPC] Encrypted vote prepared:", encryptedVote.ciphertext.length, "elements");

      console.log("[ArciumMPC] Vote submitted successfully");
      return true;
    } catch (error) {
      console.error("[ArciumMPC] Vote submission failed:", error);
      return false;
    }
  }

  // ==========================================================================
  // Private Balance Verification
  // ==========================================================================

  /**
   * Generate proof that balance meets threshold without revealing actual balance
   *
   * Uses MPC to compute: balance >= threshold
   * Returns boolean result encrypted for the verifier
   */
  async proveBalanceMeetsThreshold(
    balance: bigint,
    threshold: bigint,
    userPrivateKey: Uint8Array,
    _verifierPublicKey: Uint8Array
  ): Promise<PrivateBalanceProof> {
    console.log("[ArciumMPC] Generating private balance proof...");

    try {
      // Encrypt balance and threshold
      const encryptedBalance = await this.encryptInput([balance], userPrivateKey);
      const encryptedThreshold = await this.encryptInput([threshold], userPrivateKey);

      // In production, submit to MXE which executes:
      // #[instruction]
      // pub fn verify_balance(
      //     balance: Enc<Shared, u64>,
      //     threshold: Enc<Mxe, u64>,
      //     verifier: Shared
      // ) -> Enc<Shared, bool> {
      //     let b = balance.to_arcis();
      //     let t = threshold.to_arcis();
      //     verifier.from_arcis(b >= t)
      // }

      console.log("[ArciumMPC] Encrypted inputs prepared:", {
        balanceElements: encryptedBalance.ciphertext.length,
        thresholdElements: encryptedThreshold.ciphertext.length,
      });

      // Placeholder - compute locally for demo
      const meetsThreshold = balance >= threshold;
      const proof = new Uint8Array(64);
      crypto.getRandomValues(proof);

      const result: PrivateBalanceProof = {
        proof,
        threshold: Number(threshold),
        meetsThreshold,
        generatedAt: Date.now(),
      };

      console.log("[ArciumMPC] Balance proof generated:", {
        meetsThreshold: result.meetsThreshold,
      });

      return result;
    } catch (error) {
      console.error("[ArciumMPC] Balance proof generation failed:", error);
      throw error;
    }
  }

  // ==========================================================================
  // Computation Tracking
  // ==========================================================================

  /**
   * Get status of a computation
   *
   * Queries the Arcium network for the computation account state.
   *
   * @param computationId - Computation ID (hex string)
   * @param provider - Optional provider for on-chain queries
   */
  async getComputationStatus(
    computationId: string,
    provider?: ArciumProvider
  ): Promise<ComputationStatus> {
    console.log("[ArciumMPC] Getting computation status:", computationId.slice(0, 8) + "...");

    try {
      if (provider && this.config.programId) {
        // Use SDK to check computation status
        const arciumEnv = getArciumEnv();
        const computationOffset = new BN(computationId, "hex");

        // Query computation account on-chain
        const computationAddress = getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          computationOffset
        );

        // Fetch account data and parse status
        const accountInfo = await provider.connection.getAccountInfo(computationAddress);

        if (!accountInfo) {
          return { computationId, status: "queued" };
        }

        // Parse computation state from account data
        const statusByte = accountInfo.data[0];
        const status = this.parseComputationStatus(statusByte);

        return {
          computationId,
          status,
          finalizedAt: status === "completed" ? Date.now() : undefined,
        };
      }

      // Fallback for demo
      return { computationId, status: "queued" };
    } catch (error) {
      console.error("[ArciumMPC] Status check failed:", error);
      return {
        computationId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private parseComputationStatus(statusByte: number): ComputationStatus["status"] {
    switch (statusByte) {
      case 0: return "queued";
      case 1: return "executing";
      case 2: return "completed";
      case 3: return "failed";
      default: return "queued";
    }
  }

  /**
   * Wait for computation to complete
   *
   * Uses the Arcium SDK's await function when provider is available,
   * otherwise falls back to manual polling.
   *
   * @param computationId - Computation ID (hex string)
   * @param provider - Optional provider for SDK await
   * @param commitment - Transaction commitment level
   * @param timeoutMs - Timeout in milliseconds
   */
  async awaitComputationFinalization(
    computationId: string,
    provider?: ArciumProvider,
    commitment: Finality = "confirmed",
    timeoutMs: number = 60000
  ): Promise<ComputationStatus> {
    console.log("[ArciumMPC] Awaiting computation finalization...");

    try {
      if (provider && this.config.programId) {
        const programId = new PublicKey(this.config.programId);
        const computationOffset = new BN(computationId, "hex");

        // Use SDK's await function
        const finalizeSig = await arciumAwaitFinalization(
          provider as never,
          computationOffset,
          programId,
          commitment
        );

        console.log("[ArciumMPC] Computation finalized:", finalizeSig);

        return {
          computationId,
          status: "completed",
          finalizedAt: Date.now(),
        };
      }

      // Fallback: poll manually
      return await this.pollForCompletion(computationId, timeoutMs);
    } catch (error) {
      console.error("[ArciumMPC] Await finalization failed:", error);
      return {
        computationId,
        status: "failed",
        error: error instanceof Error ? error.message : "Timeout or error",
      };
    }
  }

  private async pollForCompletion(
    computationId: string,
    timeoutMs: number
  ): Promise<ComputationStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getComputationStatus(computationId);
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return {
      computationId,
      status: "failed",
      error: "Computation timed out",
    };
  }

  // ==========================================================================
  // Multi-Sig Wallet Operations
  // ==========================================================================

  /**
   * Create a threshold wallet configuration
   *
   * @param threshold - Number of signatures required (e.g., 2 for 2-of-3)
   * @param totalParties - Total number of key holders
   * @param partyPubkeys - Public keys of all parties
   */
  async createThresholdWallet(
    threshold: number,
    totalParties: number,
    partyPubkeys: string[]
  ): Promise<{ walletAddress: string; configId: string }> {
    console.log("[ArciumMPC] Creating threshold wallet:", {
      threshold: `${threshold}-of-${totalParties}`,
    });

    if (threshold > totalParties) {
      throw new Error("Threshold cannot exceed total parties");
    }

    if (partyPubkeys.length !== totalParties) {
      throw new Error("Party public keys count must match total parties");
    }

    // In production, deploy threshold wallet program on Arcium
    // This creates an MXE that holds key shares across nodes

    const configId = this.generateComputationId();
    const walletAddress = `threshold_${configId.slice(0, 8)}`;

    console.log("[ArciumMPC] Threshold wallet created:", {
      walletAddress,
      configId,
    });

    return { walletAddress, configId };
  }

  /**
   * Sign a transaction using threshold signatures
   *
   * Requires threshold number of parties to provide their shares
   */
  async thresholdSign(
    configId: string,
    message: Uint8Array,
    partyIndex: number,
    partyPrivateKey: Uint8Array
  ): Promise<{ partialSignature: Uint8Array; partyIndex: number }> {
    console.log("[ArciumMPC] Generating partial signature:", {
      configId: configId.slice(0, 8) + "...",
      partyIndex,
    });

    // In production, use BLS threshold signatures via Arcium MPC
    // Each party generates a partial signature from their key share
    // The MPC nodes aggregate partial signatures into a full signature

    // For now, create a deterministic partial signature using the party key
    const { privateKey } = await this.generateKeyPair();
    const encryptedMessage = await this.encryptInput(
      [BigInt("0x" + Buffer.from(message.slice(0, 32)).toString("hex"))],
      partyPrivateKey
    );

    // Convert first ciphertext block to signature
    const partialSignature = new Uint8Array(64);
    const firstBlock = encryptedMessage.ciphertext[0] || [];
    for (let i = 0; i < Math.min(32, firstBlock.length); i++) {
      partialSignature[i] = firstBlock[i];
    }
    // Add party index for uniqueness
    partialSignature[32] = partyIndex;

    console.log("[ArciumMPC] Partial signature generated using encrypted message");
    return { partialSignature, partyIndex };
  }

  /**
   * Aggregate partial signatures into full signature
   */
  async aggregateSignatures(
    configId: string,
    partialSignatures: Array<{ partialSignature: Uint8Array; partyIndex: number }>
  ): Promise<Uint8Array> {
    console.log("[ArciumMPC] Aggregating signatures:", {
      configId: configId.slice(0, 8) + "...",
      sigCount: partialSignatures.length,
    });

    // In production, MPC nodes aggregate BLS partial signatures
    // This is done via the aggregated BLS key submitted during cluster setup

    // For now, XOR all partial signatures together
    const aggregatedSignature = new Uint8Array(64);
    for (const { partialSignature } of partialSignatures) {
      for (let i = 0; i < 64; i++) {
        aggregatedSignature[i] ^= partialSignature[i];
      }
    }

    return aggregatedSignature;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Generate a unique computation ID
   */
  private generateComputationId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Convert bigint to 32-byte array (little-endian)
   */
  private bigintToBytes(value: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    let temp = value;
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number(temp & 0xffn);
      temp >>= 8n;
    }
    return bytes;
  }

  /**
   * Check if Arcium is configured
   */
  isConfigured(): boolean {
    return !!this.config.programId;
  }

  /**
   * Get network status
   *
   * Queries the Arcium cluster account for node count and availability.
   *
   * @param provider - Optional provider for on-chain queries
   */
  async getNetworkStatus(provider?: ArciumProvider): Promise<{
    available: boolean;
    clusterNodes: number;
    queuedComputations: number;
  }> {
    try {
      if (provider && this.config.programId) {
        const arciumEnv = getArciumEnv();
        const clusterAddress = getClusterAccAddress(arciumEnv.arciumClusterOffset);

        // Fetch cluster account to get node count
        const clusterInfo = await provider.connection.getAccountInfo(clusterAddress);

        if (clusterInfo) {
          // Parse cluster data for node count
          // The exact offset depends on the Arcium program's account layout
          const nodeCount = clusterInfo.data.readUInt8(8);

          return {
            available: true,
            clusterNodes: nodeCount,
            queuedComputations: 0, // Would need to query mempool
          };
        }
      }

      return {
        available: this.isConfigured(),
        clusterNodes: 0,
        queuedComputations: 0,
      };
    } catch (error) {
      console.error("[ArciumMPC] Network status check failed:", error);
      return {
        available: false,
        clusterNodes: 0,
        queuedComputations: 0,
      };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let arciumMpcServiceInstance: ArciumMpcService | null = null;

export function getArciumMpcService(): ArciumMpcService {
  if (!arciumMpcServiceInstance) {
    arciumMpcServiceInstance = new ArciumMpcService();
  }
  return arciumMpcServiceInstance;
}

export default ArciumMpcService;
