/**
 * Context Types for Brain Orchestrator
 *
 * Types for managing conversation context and session state.
 * The Brain maintains context across multi-turn conversations.
 */

import type { ParsedIntent } from "./intent.js";

/**
 * Conversation turn in history
 */
export interface ConversationTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  intent?: ParsedIntent;
  toolCalls?: ToolCallRecord[];
}

/**
 * Record of a tool call made during conversation
 */
export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

/**
 * Session context for a user conversation
 */
export interface SessionContext {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  history: ConversationTurn[];
  userState: UserState;
  activeIntents: string[];
  pendingClarifications: string[];
}

/**
 * User state persisted across sessions
 */
export interface UserState {
  walletAddress?: string;
  cardId?: string;
  preferredCurrency: string;
  recentMerchants: string[];
  frequentActions: ActionFrequency[];
  preferences: UserPreferences;
}

/**
 * Action frequency tracking for personalization
 */
export interface ActionFrequency {
  action: string;
  count: number;
  lastUsed: number;
}

/**
 * User preferences
 */
export interface UserPreferences {
  language: string;
  timezone: string;
  confirmationMode: "always" | "high_risk" | "never";
  verbosity: "minimal" | "normal" | "detailed";
}

/**
 * Context window configuration
 */
export interface ContextConfig {
  maxTurns: number;
  ttlSeconds: number;
  persistUserState: boolean;
  summarizeThreshold: number;
  /** Differential privacy settings for behavioral data protection */
  dpConfig?: {
    enabled: boolean;
    epsilon: number;
    delta: number;
  };
}

/**
 * Context summary when window is exceeded
 */
export interface ContextSummary {
  keyTopics: string[];
  recentIntents: string[];
  importantEntities: Record<string, string>;
  summarizedAt: number;
  originalTurnCount: number;
}
