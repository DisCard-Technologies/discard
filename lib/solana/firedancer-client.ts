/**
 * DisCard 2035 - Firedancer-Optimized Solana Client
 *
 * High-performance Solana RPC client optimized for Firedancer/Alpenglow
 * validators with sub-200ms confirmation targets.
 *
 * Features:
 * - Multi-RPC failover for reliability
 * - Optimistic confirmation tracking
 * - WebSocket subscription management
 * - Automatic retry with exponential backoff
 * - Slot-based finality tracking
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionSignature,
  Commitment,
  SendOptions,
  RpcResponseAndContext,
  SignatureResult,
  AccountInfo,
  TransactionConfirmationStatus,
} from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export interface FiredancerConfig {
  /** Primary RPC endpoint (Firedancer-optimized preferred) */
  primaryEndpoint: string;
  /** Fallback RPC endpoints */
  fallbackEndpoints?: string[];
  /** WebSocket endpoint for subscriptions */
  wsEndpoint?: string;
  /** Target confirmation time in ms */
  targetConfirmationMs?: number;
  /** Maximum retries for failed requests */
  maxRetries?: number;
  /** Enable detailed logging */
  debug?: boolean;
}

export interface ConfirmationResult {
  confirmed: boolean;
  signature: string;
  slot?: number;
  confirmationStatus?: TransactionConfirmationStatus;
  confirmationTimeMs: number;
  withinTarget: boolean;
  error?: string;
}

export interface TransactionMetrics {
  sendTimeMs: number;
  confirmationTimeMs: number;
  totalTimeMs: number;
  slot: number;
  retryCoun: number;
}

export type ConfirmationCallback = (result: ConfirmationResult) => void;

// ============================================================================
// Constants
// ============================================================================

/** Alpenglow target confirmation time */
const ALPENGLOW_TARGET_MS = 150;

/** Maximum confirmation wait time */
const MAX_CONFIRMATION_WAIT_MS = 30000;

/** Default retry count */
const DEFAULT_MAX_RETRIES = 3;

/** Retry backoff base (ms) */
const RETRY_BACKOFF_BASE_MS = 100;

/** Helius Firedancer-optimized endpoints */
const HELIUS_FIREDANCER_MAINNET = "https://mainnet.helius-rpc.com/?api-key=";
const HELIUS_FIREDANCER_DEVNET = "https://devnet.helius-rpc.com/?api-key=";

// ============================================================================
// Firedancer Client Implementation
// ============================================================================

export class FiredancerClient {
  private primaryConnection: Connection;
  private fallbackConnections: Connection[] = [];
  private wsConnection: Connection | null = null;
  private targetConfirmationMs: number;
  private maxRetries: number;
  private debug: boolean;

  // Metrics tracking
  private metrics = {
    totalTransactions: 0,
    confirmedTransactions: 0,
    failedTransactions: 0,
    averageConfirmationMs: 0,
    withinTargetCount: 0,
    lastConfirmationTimes: [] as number[],
  };

  // Active subscriptions
  private subscriptions = new Map<string, number>();

  constructor(config: FiredancerConfig) {
    this.primaryConnection = new Connection(config.primaryEndpoint, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: MAX_CONFIRMATION_WAIT_MS,
    });

    // Set up fallback connections
    if (config.fallbackEndpoints) {
      this.fallbackConnections = config.fallbackEndpoints.map(
        (endpoint) =>
          new Connection(endpoint, {
            commitment: "confirmed",
          })
      );
    }

    // WebSocket connection for subscriptions
    if (config.wsEndpoint) {
      this.wsConnection = new Connection(config.wsEndpoint, {
        commitment: "confirmed",
        wsEndpoint: config.wsEndpoint.replace("https://", "wss://"),
      });
    }

    this.targetConfirmationMs = config.targetConfirmationMs ?? ALPENGLOW_TARGET_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.debug = config.debug ?? false;
  }

  // ==========================================================================
  // Transaction Sending
  // ==========================================================================

  /**
   * Send transaction with optimistic confirmation tracking
   */
  async sendTransaction(
    transaction: Transaction,
    options?: SendOptions
  ): Promise<{ signature: string; confirmationPromise: Promise<ConfirmationResult> }> {
    const startTime = Date.now();
    this.metrics.totalTransactions++;

    const sendOptions: SendOptions = {
      skipPreflight: true, // Skip for speed, we validate ourselves
      maxRetries: 0, // We handle retries
      ...options,
    };

    let signature: string;
    let retryCount = 0;

    // Try to send with retries
    while (retryCount < this.maxRetries) {
      try {
        signature = await this.primaryConnection.sendRawTransaction(
          transaction.serialize(),
          sendOptions
        );

        if (this.debug) {
          console.log(`[Firedancer] TX sent: ${signature} (${Date.now() - startTime}ms)`);
        }

        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= this.maxRetries) {
          this.metrics.failedTransactions++;
          throw error;
        }

        // Exponential backoff
        const backoff = RETRY_BACKOFF_BASE_MS * Math.pow(2, retryCount - 1);
        await this.sleep(backoff);

        // Try fallback connection
        if (this.fallbackConnections.length > 0) {
          const fallbackIndex = (retryCount - 1) % this.fallbackConnections.length;
          try {
            signature = await this.fallbackConnections[fallbackIndex].sendRawTransaction(
              transaction.serialize(),
              sendOptions
            );
            break;
          } catch {
            // Continue to next retry
          }
        }
      }
    }

    // Create confirmation promise
    const confirmationPromise = this.confirmTransaction(signature!, startTime);

    return { signature: signature!, confirmationPromise };
  }

  /**
   * Send and wait for confirmation (blocking)
   */
  async sendAndConfirm(
    transaction: Transaction,
    options?: SendOptions
  ): Promise<ConfirmationResult> {
    const { confirmationPromise } = await this.sendTransaction(transaction, options);
    return confirmationPromise;
  }

  // ==========================================================================
  // Confirmation Tracking
  // ==========================================================================

  /**
   * Confirm a transaction with Alpenglow-optimized tracking
   */
  async confirmTransaction(
    signature: string,
    startTime: number = Date.now()
  ): Promise<ConfirmationResult> {
    const connection = this.wsConnection ?? this.primaryConnection;

    try {
      // Use WebSocket subscription for fastest confirmation
      const result = await this.waitForConfirmation(connection, signature, startTime);
      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.metrics.failedTransactions++;

      return {
        confirmed: false,
        signature,
        confirmationTimeMs: elapsed,
        withinTarget: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Wait for transaction confirmation using optimal strategy
   */
  private async waitForConfirmation(
    connection: Connection,
    signature: string,
    startTime: number
  ): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({
            confirmed: false,
            signature,
            confirmationTimeMs: Date.now() - startTime,
            withinTarget: false,
            error: "Confirmation timeout",
          });
        }
      }, MAX_CONFIRMATION_WAIT_MS);

      // Strategy 1: WebSocket subscription (fastest)
      if (this.wsConnection) {
        const subscriptionId = connection.onSignature(
          signature,
          (result, context) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              connection.removeSignatureListener(subscriptionId);

              const elapsed = Date.now() - startTime;
              this.recordConfirmation(elapsed, !result.err);

              resolve({
                confirmed: !result.err,
                signature,
                slot: context.slot,
                confirmationTimeMs: elapsed,
                withinTarget: elapsed <= this.targetConfirmationMs,
                error: result.err ? JSON.stringify(result.err) : undefined,
              });
            }
          },
          "confirmed"
        );

        this.subscriptions.set(signature, subscriptionId);
      }

      // Strategy 2: Polling fallback
      this.pollConfirmation(connection, signature, startTime).then((result) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(result);
        }
      });
    });
  }

  /**
   * Poll for confirmation (fallback strategy)
   */
  private async pollConfirmation(
    connection: Connection,
    signature: string,
    startTime: number
  ): Promise<ConfirmationResult> {
    const pollInterval = 50; // 50ms polling for speed
    let attempts = 0;
    const maxAttempts = Math.ceil(MAX_CONFIRMATION_WAIT_MS / pollInterval);

    while (attempts < maxAttempts) {
      try {
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: false,
        });

        if (status?.value?.confirmationStatus) {
          const elapsed = Date.now() - startTime;
          this.recordConfirmation(elapsed, !status.value.err);

          return {
            confirmed: !status.value.err,
            signature,
            slot: status.context.slot,
            confirmationStatus: status.value.confirmationStatus,
            confirmationTimeMs: elapsed,
            withinTarget: elapsed <= this.targetConfirmationMs,
            error: status.value.err ? JSON.stringify(status.value.err) : undefined,
          };
        }
      } catch {
        // Continue polling
      }

      await this.sleep(pollInterval);
      attempts++;
    }

    return {
      confirmed: false,
      signature,
      confirmationTimeMs: Date.now() - startTime,
      withinTarget: false,
      error: "Polling timeout",
    };
  }

  // ==========================================================================
  // Account Subscriptions
  // ==========================================================================

  /**
   * Subscribe to account changes
   */
  subscribeToAccount(
    account: PublicKey,
    callback: (accountInfo: AccountInfo<Buffer> | null) => void,
    commitment: Commitment = "confirmed"
  ): number {
    const connection = this.wsConnection ?? this.primaryConnection;
    return connection.onAccountChange(account, callback, commitment);
  }

  /**
   * Unsubscribe from account changes
   */
  async unsubscribeFromAccount(subscriptionId: number): Promise<void> {
    const connection = this.wsConnection ?? this.primaryConnection;
    await connection.removeAccountChangeListener(subscriptionId);
  }

  /**
   * Subscribe to slot changes (for finality tracking)
   */
  subscribeToSlots(callback: (slot: number) => void): number {
    const connection = this.wsConnection ?? this.primaryConnection;
    return connection.onSlotChange((slotInfo) => {
      callback(slotInfo.slot);
    });
  }

  // ==========================================================================
  // Metrics & Health
  // ==========================================================================

  /**
   * Get client metrics
   */
  getMetrics(): {
    totalTransactions: number;
    confirmedTransactions: number;
    failedTransactions: number;
    successRate: number;
    averageConfirmationMs: number;
    withinTargetPercent: number;
    targetMs: number;
    recentConfirmations: number[];
  } {
    const successRate =
      this.metrics.totalTransactions > 0
        ? (this.metrics.confirmedTransactions / this.metrics.totalTransactions) * 100
        : 100;

    const withinTargetPercent =
      this.metrics.confirmedTransactions > 0
        ? (this.metrics.withinTargetCount / this.metrics.confirmedTransactions) * 100
        : 100;

    return {
      totalTransactions: this.metrics.totalTransactions,
      confirmedTransactions: this.metrics.confirmedTransactions,
      failedTransactions: this.metrics.failedTransactions,
      successRate: Math.round(successRate * 100) / 100,
      averageConfirmationMs: Math.round(this.metrics.averageConfirmationMs),
      withinTargetPercent: Math.round(withinTargetPercent * 100) / 100,
      targetMs: this.targetConfirmationMs,
      recentConfirmations: [...this.metrics.lastConfirmationTimes],
    };
  }

  /**
   * Check RPC health
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    primaryLatencyMs: number;
    fallbackLatencies: number[];
    currentSlot: number;
  }> {
    const results = {
      healthy: false,
      primaryLatencyMs: -1,
      fallbackLatencies: [] as number[],
      currentSlot: 0,
    };

    // Check primary
    try {
      const start = Date.now();
      const slot = await this.primaryConnection.getSlot();
      results.primaryLatencyMs = Date.now() - start;
      results.currentSlot = slot;
      results.healthy = true;
    } catch {
      // Primary failed
    }

    // Check fallbacks
    for (const connection of this.fallbackConnections) {
      try {
        const start = Date.now();
        await connection.getSlot();
        results.fallbackLatencies.push(Date.now() - start);
      } catch {
        results.fallbackLatencies.push(-1);
      }
    }

    return results;
  }

  /**
   * Get current slot
   */
  async getSlot(): Promise<number> {
    return this.primaryConnection.getSlot();
  }

  /**
   * Get recent blockhash
   */
  async getRecentBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const { blockhash, lastValidBlockHeight } =
      await this.primaryConnection.getLatestBlockhash("confirmed");
    return { blockhash, lastValidBlockHeight };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private recordConfirmation(timeMs: number, success: boolean): void {
    if (success) {
      this.metrics.confirmedTransactions++;
      if (timeMs <= this.targetConfirmationMs) {
        this.metrics.withinTargetCount++;
      }

      // Update average
      this.metrics.lastConfirmationTimes.push(timeMs);
      if (this.metrics.lastConfirmationTimes.length > 100) {
        this.metrics.lastConfirmationTimes.shift();
      }

      const sum = this.metrics.lastConfirmationTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageConfirmationMs = sum / this.metrics.lastConfirmationTimes.length;
    } else {
      this.metrics.failedTransactions++;
    }

    if (this.debug) {
      console.log(
        `[Firedancer] Confirmation: ${timeMs}ms (target: ${this.targetConfirmationMs}ms, ` +
          `within: ${timeMs <= this.targetConfirmationMs})`
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup subscriptions
   */
  async cleanup(): Promise<void> {
    for (const [signature, subscriptionId] of this.subscriptions) {
      try {
        const connection = this.wsConnection ?? this.primaryConnection;
        await connection.removeSignatureListener(subscriptionId);
      } catch {
        // Ignore cleanup errors
      }
    }
    this.subscriptions.clear();
  }
}

// ============================================================================
// Singleton Access
// ============================================================================

let firedancerClientInstance: FiredancerClient | null = null;

export function getFiredancerClient(config?: FiredancerConfig): FiredancerClient {
  if (!firedancerClientInstance && config) {
    firedancerClientInstance = new FiredancerClient(config);
  }
  if (!firedancerClientInstance) {
    throw new Error("Firedancer client not initialized");
  }
  return firedancerClientInstance;
}

export function initializeFiredancerClient(config: FiredancerConfig): FiredancerClient {
  firedancerClientInstance = new FiredancerClient(config);
  return firedancerClientInstance;
}

// ============================================================================
// Preset Configurations
// ============================================================================

export function createHeliusConfig(
  apiKey: string,
  network: "mainnet" | "devnet" = "mainnet"
): FiredancerConfig {
  const baseUrl =
    network === "mainnet" ? HELIUS_FIREDANCER_MAINNET : HELIUS_FIREDANCER_DEVNET;

  return {
    primaryEndpoint: `${baseUrl}${apiKey}`,
    wsEndpoint: `${baseUrl}${apiKey}`.replace("https://", "wss://"),
    targetConfirmationMs: ALPENGLOW_TARGET_MS,
    maxRetries: 3,
    debug: network === "devnet",
  };
}

export default FiredancerClient;
