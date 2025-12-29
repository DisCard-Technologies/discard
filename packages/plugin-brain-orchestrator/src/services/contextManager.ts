/**
 * Context Manager Service
 *
 * Manages conversation context and session state
 * for multi-turn conversations.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  SessionContext,
  ConversationTurn,
  UserState,
  ContextConfig,
  ContextSummary,
  UserPreferences,
} from "../types/context.js";
import type { ParsedIntent } from "../types/intent.js";

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ContextConfig = {
  maxTurns: 50,
  ttlSeconds: 3600, // 1 hour
  persistUserState: true,
  summarizeThreshold: 40,
};

/**
 * Default user preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  language: "en",
  timezone: "UTC",
  confirmationMode: "high_risk",
  verbosity: "normal",
};

/**
 * Context Manager Service
 */
export class ContextManager {
  private config: ContextConfig;
  private sessions: Map<string, SessionContext>;
  private userStates: Map<string, UserState>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessions = new Map();
    this.userStates = new Map();

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Get or create a session
   */
  getOrCreateSession(sessionId: string, userId: string): SessionContext {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = this.createSession(sessionId, userId);
      this.sessions.set(sessionId, session);
    } else {
      // Update last activity
      session.lastActivityAt = Date.now();
      session.expiresAt = Date.now() + this.config.ttlSeconds * 1000;
    }

    return session;
  }

  /**
   * Create a new session
   */
  private createSession(sessionId: string, userId: string): SessionContext {
    const now = Date.now();

    // Get or create user state
    let userState = this.userStates.get(userId);
    if (!userState) {
      userState = this.createDefaultUserState();
      if (this.config.persistUserState) {
        this.userStates.set(userId, userState);
      }
    }

    return {
      sessionId,
      userId,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + this.config.ttlSeconds * 1000,
      history: [],
      userState,
      activeIntents: [],
      pendingClarifications: [],
    };
  }

  /**
   * Create default user state
   */
  private createDefaultUserState(): UserState {
    return {
      preferredCurrency: "USDC",
      recentMerchants: [],
      frequentActions: [],
      preferences: { ...DEFAULT_PREFERENCES },
    };
  }

  /**
   * Add a turn to the conversation
   */
  addTurn(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    intent?: ParsedIntent
  ): ConversationTurn {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const turn: ConversationTurn = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      intent,
    };

    session.history.push(turn);
    session.lastActivityAt = Date.now();

    // Track intent if provided
    if (intent && intent.action !== "unknown") {
      if (!session.activeIntents.includes(intent.intentId)) {
        session.activeIntents.push(intent.intentId);
      }

      // Update action frequency
      this.updateActionFrequency(session.userState, intent.action);
    }

    // Check if we need to summarize
    if (session.history.length >= this.config.summarizeThreshold) {
      this.summarizeOldTurns(session);
    }

    return turn;
  }

  /**
   * Get conversation history
   */
  getHistory(
    sessionId: string,
    limit?: number
  ): ConversationTurn[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const history = session.history;
    if (limit && limit < history.length) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Get context for LLM prompt
   */
  getContextForPrompt(
    sessionId: string,
    maxTurns: number = 10
  ): string {
    const history = this.getHistory(sessionId, maxTurns);

    return history
      .map((turn) => {
        const role = turn.role === "user" ? "User" : "Assistant";
        return `${role}: ${turn.content}`;
      })
      .join("\n");
  }

  /**
   * Update action frequency for personalization
   */
  private updateActionFrequency(userState: UserState, action: string): void {
    const existing = userState.frequentActions.find((f) => f.action === action);

    if (existing) {
      existing.count++;
      existing.lastUsed = Date.now();
    } else {
      userState.frequentActions.push({
        action,
        count: 1,
        lastUsed: Date.now(),
      });
    }

    // Sort by frequency
    userState.frequentActions.sort((a, b) => b.count - a.count);

    // Keep only top 10
    if (userState.frequentActions.length > 10) {
      userState.frequentActions = userState.frequentActions.slice(0, 10);
    }
  }

  /**
   * Summarize old conversation turns
   */
  private summarizeOldTurns(session: SessionContext): void {
    const turnsToSummarize = session.history.slice(
      0,
      session.history.length - 10
    );

    if (turnsToSummarize.length === 0) return;

    // Create summary
    const summary: ContextSummary = {
      keyTopics: this.extractTopics(turnsToSummarize),
      recentIntents: turnsToSummarize
        .filter((t) => t.intent)
        .map((t) => t.intent!.action)
        .filter((v, i, a) => a.indexOf(v) === i),
      importantEntities: this.extractImportantEntities(turnsToSummarize),
      summarizedAt: Date.now(),
      originalTurnCount: turnsToSummarize.length,
    };

    // Create summary turn
    const summaryTurn: ConversationTurn = {
      id: uuidv4(),
      role: "system",
      content: `[Context Summary: ${summary.originalTurnCount} turns summarized. Topics: ${summary.keyTopics.join(", ")}. Recent actions: ${summary.recentIntents.join(", ")}]`,
      timestamp: Date.now(),
    };

    // Replace old turns with summary
    session.history = [summaryTurn, ...session.history.slice(-10)];
  }

  /**
   * Extract topics from turns
   */
  private extractTopics(turns: ConversationTurn[]): string[] {
    const topics = new Set<string>();

    for (const turn of turns) {
      if (turn.intent) {
        topics.add(turn.intent.action);
      }
      // Simple keyword extraction
      const content = turn.content.toLowerCase();
      if (content.includes("card")) topics.add("card");
      if (content.includes("transfer")) topics.add("transfer");
      if (content.includes("balance")) topics.add("balance");
      if (content.includes("limit")) topics.add("limit");
    }

    return Array.from(topics).slice(0, 5);
  }

  /**
   * Extract important entities from turns
   */
  private extractImportantEntities(
    turns: ConversationTurn[]
  ): Record<string, string> {
    const entities: Record<string, string> = {};

    for (const turn of turns) {
      if (turn.intent?.merchant?.merchantName) {
        entities["last_merchant"] = turn.intent.merchant.merchantName;
      }
      if (turn.intent?.amount) {
        entities["last_amount"] = turn.intent.amount.toString();
      }
    }

    return entities;
  }

  /**
   * Add pending clarification
   */
  addPendingClarification(sessionId: string, intentId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.pendingClarifications.includes(intentId)) {
      session.pendingClarifications.push(intentId);
    }
  }

  /**
   * Resolve pending clarification
   */
  resolveClarification(sessionId: string, intentId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pendingClarifications = session.pendingClarifications.filter(
        (id) => id !== intentId
      );
    }
  }

  /**
   * Get session
   */
  getSession(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Reset session (clear history but optionally keep user state)
   */
  resetSession(sessionId: string, preserveUserState: boolean = true): string {
    const session = this.sessions.get(sessionId);
    const userId = session?.userId;
    const userState = session?.userState;

    // Delete old session
    this.sessions.delete(sessionId);

    // Create new session
    const newSessionId = uuidv4();
    const newSession = this.createSession(
      newSessionId,
      userId || uuidv4()
    );

    if (preserveUserState && userState) {
      newSession.userState = userState;
    }

    this.sessions.set(newSessionId, newSession);
    return newSessionId;
  }

  /**
   * Update user preferences
   */
  updateUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>
  ): void {
    let userState = this.userStates.get(userId);
    if (!userState) {
      userState = this.createDefaultUserState();
      this.userStates.set(userId, userState);
    }

    userState.preferences = { ...userState.preferences, ...preferences };
  }

  /**
   * Set user wallet address
   */
  setUserWallet(userId: string, walletAddress: string): void {
    let userState = this.userStates.get(userId);
    if (!userState) {
      userState = this.createDefaultUserState();
      this.userStates.set(userId, userState);
    }

    userState.walletAddress = walletAddress;
  }

  /**
   * Add recent merchant
   */
  addRecentMerchant(userId: string, merchantId: string): void {
    const userState = this.userStates.get(userId);
    if (userState) {
      userState.recentMerchants = [
        merchantId,
        ...userState.recentMerchants.filter((m) => m !== merchantId),
      ].slice(0, 10);
    }
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Cleanup every minute
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeSessions: number;
    totalUsers: number;
    avgHistoryLength: number;
  } {
    let totalHistory = 0;
    for (const session of this.sessions.values()) {
      totalHistory += session.history.length;
    }

    return {
      activeSessions: this.sessions.size,
      totalUsers: this.userStates.size,
      avgHistoryLength:
        this.sessions.size > 0 ? totalHistory / this.sessions.size : 0,
    };
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
    this.userStates.clear();
  }
}
