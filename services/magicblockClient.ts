/**
 * MagicBlock Ephemeral Rollups Client
 *
 * SDK wrapper for MagicBlock's Private Ephemeral Rollups (PER) providing:
 * - Sub-50ms card authorization decisions
 * - Private velocity state in Intel TDX TEE
 * - Batch settlement to Solana L1
 *
 * @see https://docs.magicblock.gg/
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  MagicBlockConfig,
  EphemeralSession,
  EphemeralSessionConfig,
  SessionStatus,
  AuthorizationRequest,
  AuthorizationResponse,
  AuthorizationDecision,
  VelocityState,
  BatchCommitment,
  DelegationRequest,
  DelegationResult,
  UndelegationRequest,
  UndelegationResult,
  WebhookPayload,
  WebhookEventType,
  DEFAULT_SESSION_CONFIG,
  CLUSTER_ENDPOINTS,
  AUTHORIZATION_TIMEOUT_MS,
  MAX_BATCH_SIZE,
} from '@/lib/tee/magicblock-types';

// ============ CONFIGURATION ============

const MAGICBLOCK_API_URL = process.env.EXPO_PUBLIC_MAGICBLOCK_API_URL || CLUSTER_ENDPOINTS.devnet;
const MAGICBLOCK_API_KEY = process.env.MAGICBLOCK_API_KEY;
const MAGICBLOCK_CLUSTER = (process.env.EXPO_PUBLIC_MAGICBLOCK_CLUSTER || 'devnet') as 'devnet' | 'mainnet';
const DEFAULT_TIMEOUT = 30000; // 30 seconds for API calls

// ============ SERVICE CLASS ============

/**
 * MagicBlock Ephemeral Rollups Service
 *
 * Manages ephemeral rollup sessions for card authorization:
 * 1. Delegate card state accounts to PER
 * 2. Process authorization requests in <50ms
 * 3. Batch commit decisions to Solana L1
 * 4. Undelegate and finalize state
 */
export class MagicBlockService {
  private config: MagicBlockConfig;
  private connection: Connection;
  private activeSessions: Map<string, EphemeralSession> = new Map();
  private webhookCallbacks: Map<WebhookEventType, ((payload: WebhookPayload) => void)[]> = new Map();

  constructor(config?: Partial<MagicBlockConfig>) {
    this.config = {
      apiUrl: config?.apiUrl || MAGICBLOCK_API_URL,
      apiKey: config?.apiKey || MAGICBLOCK_API_KEY,
      cluster: config?.cluster || MAGICBLOCK_CLUSTER,
      webhookUrl: config?.webhookUrl,
      timeout: config?.timeout || DEFAULT_TIMEOUT,
    };

    // Initialize Solana connection
    const rpcUrl = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');

    console.log(`[MagicBlock] Initialized with cluster: ${this.config.cluster}`);
  }

  // ============ CONFIGURATION ============

  /**
   * Check if MagicBlock is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiUrl);
  }

  /**
   * Get current configuration
   */
  getConfig(): MagicBlockConfig {
    return { ...this.config };
  }

  // ============ SESSION MANAGEMENT ============

  /**
   * Create a new ephemeral rollup session for card authorization
   */
  async createSession(
    cardId: string,
    userId: string,
    config: Partial<EphemeralSessionConfig> = {}
  ): Promise<EphemeralSession> {
    console.log(`[MagicBlock] Creating session for card ${cardId}`);

    const sessionConfig: EphemeralSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      ...config,
    };

    try {
      const response = await this.apiRequest<{
        session_id: string;
        cluster_endpoint: string;
        expires_at: number;
      }>('POST', '/sessions', {
        card_id: cardId,
        user_id: userId,
        max_duration: sessionConfig.maxDuration,
        commit_interval: sessionConfig.commitInterval,
        max_transactions: sessionConfig.maxTransactionsPerBatch,
      });

      const session: EphemeralSession = {
        sessionId: response.session_id,
        cardId,
        userId,
        status: 'creating',
        delegatedAccounts: sessionConfig.delegatedAccounts,
        createdAt: Date.now(),
        expiresAt: response.expires_at,
        transactionCount: 0,
        clusterEndpoint: response.cluster_endpoint,
      };

      this.activeSessions.set(session.sessionId, session);

      console.log(`[MagicBlock] Session created: ${session.sessionId}`);
      return session;
    } catch (error) {
      console.error('[MagicBlock] Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Delegate card state accounts to the ephemeral rollup
   */
  async delegateAccounts(request: DelegationRequest): Promise<DelegationResult> {
    console.log(`[MagicBlock] Delegating account ${request.account.toBase58()}`);

    try {
      const response = await this.apiRequest<{
        success: boolean;
        session_id: string;
        tx_signature: string;
      }>('POST', '/delegate', {
        account: request.account.toBase58(),
        program_id: request.programId.toBase58(),
        duration: request.duration,
        config: request.config,
      });

      if (response.success && response.session_id) {
        const session = this.activeSessions.get(response.session_id);
        if (session) {
          session.status = 'active';
          session.delegatedAccounts.push(request.account.toBase58());
        }
      }

      return {
        success: response.success,
        sessionId: response.session_id,
        delegatedAccounts: [request.account.toBase58()],
        txSignature: response.tx_signature,
      };
    } catch (error) {
      console.error('[MagicBlock] Delegation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Undelegate accounts and commit final state
   */
  async undelegateAccounts(request: UndelegationRequest): Promise<UndelegationResult> {
    console.log(`[MagicBlock] Undelegating session ${request.sessionId}`);

    try {
      const response = await this.apiRequest<{
        success: boolean;
        final_commitment: {
          batch_id: string;
          merkle_root: string;
          decision_count: number;
          tx_signature: string;
        };
      }>('POST', `/sessions/${request.sessionId}/undelegate`, {
        force_commit: request.forceCommit,
      });

      const session = this.activeSessions.get(request.sessionId);
      if (session) {
        session.status = 'committed';
      }

      const finalCommitment: BatchCommitment = {
        batchId: response.final_commitment.batch_id,
        sessionId: request.sessionId,
        merkleRoot: response.final_commitment.merkle_root,
        decisionCount: response.final_commitment.decision_count,
        startTimestamp: session?.createdAt || Date.now(),
        endTimestamp: Date.now(),
        txSignature: response.final_commitment.tx_signature,
        status: 'confirmed',
        confirmedAt: Date.now(),
      };

      this.activeSessions.delete(request.sessionId);

      return {
        success: response.success,
        finalCommitment,
        txSignature: response.final_commitment.tx_signature,
      };
    } catch (error) {
      console.error('[MagicBlock] Undelegation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): EphemeralSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active sessions for a card
   */
  getSessionsForCard(cardId: string): EphemeralSession[] {
    return Array.from(this.activeSessions.values()).filter(
      (session) => session.cardId === cardId && session.status === 'active'
    );
  }

  // ============ AUTHORIZATION ============

  /**
   * Process card authorization request in PER
   * Target: <50ms processing time
   */
  async authorize(
    sessionId: string,
    request: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    const startTime = Date.now();
    console.log(`[MagicBlock] Processing authorization ${request.transactionId}`);

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return {
        transactionId: request.transactionId,
        decision: 'declined',
        declineReason: 'policy_violation',
        processingTimeMs: Date.now() - startTime,
        sessionId,
        timestamp: Date.now(),
      };
    }

    if (session.status !== 'active') {
      return {
        transactionId: request.transactionId,
        decision: 'declined',
        declineReason: 'policy_violation',
        processingTimeMs: Date.now() - startTime,
        sessionId,
        timestamp: Date.now(),
      };
    }

    try {
      // Call PER for authorization decision
      const response = await this.apiRequest<{
        decision: AuthorizationDecision;
        decline_reason?: string;
        authorization_code?: string;
        risk_score?: number;
      }>(
        'POST',
        `/sessions/${sessionId}/authorize`,
        {
          transaction_id: request.transactionId,
          card_id: request.cardId,
          amount: request.amount,
          merchant_mcc: request.merchantMcc,
          merchant_name: request.merchantName,
          merchant_country: request.merchantCountry,
          timestamp: request.timestamp,
          metadata: request.metadata,
        },
        AUTHORIZATION_TIMEOUT_MS
      );

      const processingTime = Date.now() - startTime;
      session.transactionCount++;

      const result: AuthorizationResponse = {
        transactionId: request.transactionId,
        decision: response.decision,
        declineReason: response.decline_reason as AuthorizationResponse['declineReason'],
        authorizationCode: response.authorization_code,
        processingTimeMs: processingTime,
        sessionId,
        timestamp: Date.now(),
        riskScore: response.risk_score,
      };

      console.log(
        `[MagicBlock] Authorization ${request.transactionId}: ${result.decision} in ${processingTime}ms`
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('[MagicBlock] Authorization failed:', error);

      return {
        transactionId: request.transactionId,
        decision: 'declined',
        declineReason: 'policy_violation',
        processingTimeMs: processingTime,
        sessionId,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Update velocity state in PER
   */
  async updateVelocityState(
    sessionId: string,
    updates: Partial<VelocityState>
  ): Promise<boolean> {
    console.log(`[MagicBlock] Updating velocity state for session ${sessionId}`);

    try {
      await this.apiRequest('PATCH', `/sessions/${sessionId}/velocity`, updates);
      return true;
    } catch (error) {
      console.error('[MagicBlock] Failed to update velocity state:', error);
      return false;
    }
  }

  /**
   * Get current velocity state from PER
   * Note: This returns encrypted/committed state, actual values stay in TEE
   */
  async getVelocityCommitment(sessionId: string): Promise<string | null> {
    try {
      const response = await this.apiRequest<{ commitment: string }>(
        'GET',
        `/sessions/${sessionId}/velocity/commitment`
      );
      return response.commitment;
    } catch (error) {
      console.error('[MagicBlock] Failed to get velocity commitment:', error);
      return null;
    }
  }

  // ============ BATCH COMMITS ============

  /**
   * Force commit current batch to Solana L1
   */
  async commitBatch(sessionId: string): Promise<BatchCommitment | null> {
    console.log(`[MagicBlock] Committing batch for session ${sessionId}`);

    try {
      const response = await this.apiRequest<{
        batch_id: string;
        merkle_root: string;
        decision_count: number;
        start_timestamp: number;
        end_timestamp: number;
        tx_signature: string;
      }>('POST', `/sessions/${sessionId}/commit`);

      const commitment: BatchCommitment = {
        batchId: response.batch_id,
        sessionId,
        merkleRoot: response.merkle_root,
        decisionCount: response.decision_count,
        startTimestamp: response.start_timestamp,
        endTimestamp: response.end_timestamp,
        txSignature: response.tx_signature,
        status: 'confirmed',
        confirmedAt: Date.now(),
      };

      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.lastCommitAt = Date.now();
      }

      console.log(`[MagicBlock] Batch committed: ${commitment.batchId}`);
      return commitment;
    } catch (error) {
      console.error('[MagicBlock] Batch commit failed:', error);
      return null;
    }
  }

  /**
   * Get batch commitment by ID
   */
  async getBatchCommitment(batchId: string): Promise<BatchCommitment | null> {
    try {
      const response = await this.apiRequest<{
        batch_id: string;
        session_id: string;
        merkle_root: string;
        decision_count: number;
        start_timestamp: number;
        end_timestamp: number;
        tx_signature: string;
        status: string;
        confirmed_at?: number;
      }>('GET', `/batches/${batchId}`);

      return {
        batchId: response.batch_id,
        sessionId: response.session_id,
        merkleRoot: response.merkle_root,
        decisionCount: response.decision_count,
        startTimestamp: response.start_timestamp,
        endTimestamp: response.end_timestamp,
        txSignature: response.tx_signature,
        status: response.status as BatchCommitment['status'],
        confirmedAt: response.confirmed_at,
      };
    } catch (error) {
      console.error('[MagicBlock] Failed to get batch:', error);
      return null;
    }
  }

  // ============ WEBHOOKS ============

  /**
   * Register webhook callback for events
   */
  onEvent(eventType: WebhookEventType, callback: (payload: WebhookPayload) => void): void {
    if (!this.webhookCallbacks.has(eventType)) {
      this.webhookCallbacks.set(eventType, []);
    }
    this.webhookCallbacks.get(eventType)!.push(callback);
  }

  /**
   * Handle incoming webhook payload
   */
  handleWebhook(payload: WebhookPayload): void {
    // Verify signature
    if (!this.verifyWebhookSignature(payload)) {
      console.error('[MagicBlock] Invalid webhook signature');
      return;
    }

    console.log(`[MagicBlock] Webhook received: ${payload.type}`);

    // Update session state based on event
    if (payload.sessionId) {
      const session = this.activeSessions.get(payload.sessionId);
      if (session) {
        switch (payload.type) {
          case 'session.active':
            session.status = 'active';
            break;
          case 'session.committed':
            session.status = 'committed';
            break;
          case 'session.expired':
            session.status = 'expired';
            break;
          case 'session.failed':
            session.status = 'failed';
            break;
        }
      }
    }

    // Call registered callbacks
    const callbacks = this.webhookCallbacks.get(payload.type) || [];
    callbacks.forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        console.error('[MagicBlock] Webhook callback error:', error);
      }
    });
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(payload: WebhookPayload): boolean {
    // TODO: Implement HMAC verification with MAGICBLOCK_WEBHOOK_SECRET
    // For now, accept all webhooks in development
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    return Boolean(payload.signature);
  }

  // ============ API HELPERS ============

  /**
   * Make authenticated API request to MagicBlock
   */
  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    timeout: number = this.config.timeout
  ): Promise<T> {
    const url = `${this.config.apiUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`MagicBlock API error: ${response.status} - ${error}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MagicBlock API timeout after ${timeout}ms`);
      }
      throw error;
    }
  }
}

// ============ SINGLETON EXPORT ============

let magicBlockInstance: MagicBlockService | null = null;

/**
 * Get MagicBlock service instance (singleton)
 */
export function getMagicBlockService(): MagicBlockService {
  if (!magicBlockInstance) {
    magicBlockInstance = new MagicBlockService();
  }
  return magicBlockInstance;
}

/**
 * Check if MagicBlock is available
 */
export function isMagicBlockConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_MAGICBLOCK_API_URL || MAGICBLOCK_API_URL);
}
