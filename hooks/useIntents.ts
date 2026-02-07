/**
 * Intents Hook
 *
 * Provides intent-centric AI middleware integration for the Command Bar.
 * Handles natural language processing, intent parsing, and Solana transaction execution.
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isMockUserId } from "@/stores/authConvex";
import { converseWithBrain } from "@/services/brainClient";

type IntentStatus =
  | "pending"
  | "parsing"
  | "clarifying"
  | "ready"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

interface ParsedIntent {
  action: "fund_card" | "swap" | "transfer" | "withdraw_defi" | "create_card" | "pay_bill" | "unknown";
  sourceType?: "wallet" | "defi_position" | "card";
  sourceId?: string;
  targetType?: "card" | "wallet" | "external";
  targetId?: string;
  amount?: number;
  currency?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
  confidence: number;
}

interface Intent {
  _id: Id<"intents">;
  userId: Id<"users">;
  rawText: string;
  parsedIntent?: ParsedIntent;
  status: IntentStatus;
  clarificationQuestion?: string;
  clarificationResponse?: string;
  responseText?: string; // AI's conversational response
  solanaTransactionSignature?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface UseIntentsReturn {
  intents: Intent[] | undefined;
  activeIntent: Intent | null;
  isLoading: boolean;
  isProcessing: boolean;
  submitIntent: (rawText: string) => Promise<Id<"intents">>;
  clarifyIntent: (intentId: Id<"intents">, clarification: string) => Promise<void>;
  approveIntent: (intentId: Id<"intents">) => Promise<void>;
  cancelIntent: (intentId: Id<"intents">) => Promise<void>;
  getIntentPreview: (intentId: Id<"intents">) => Intent | undefined;
}

export function useIntents(userId: Id<"users"> | null): UseIntentsReturn {
  const [activeIntentId, setActiveIntentId] = useState<Id<"intents"> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mockIntents, setMockIntents] = useState<Intent[]>([]);

  // Check if using mock auth (development mode without biometrics)
  const isMockAuth = isMockUserId(userId);

  // Real-time subscription to user's intents
  // Skip for mock auth since Convex won't recognize the user
  // Don't pass userId - the server gets it from the auth context
  const intents = useQuery(
    api.intents.intents.list,
    userId && !isMockAuth ? {} : "skip"
  );

  // Get active intent
  // Pass userId for apps without Convex auth configured
  const activeIntent = useQuery(
    api.intents.intents.get,
    activeIntentId && !isMockAuth ? { intentId: activeIntentId, userId: userId! } : "skip"
  );

  // Mutations (will be skipped in mock mode)
  // Note: parseIntent and executeIntent are scheduled internally by these mutations
  const createIntentMutation = useMutation(api.intents.intents.create);
  const clarifyIntentMutation = useMutation(api.intents.intents.clarify);
  const approveIntentMutation = useMutation(api.intents.intents.approve);
  const cancelIntentMutation = useMutation(api.intents.intents.cancel);

  // For mock mode, use local mock intents; otherwise use Convex data
  const isLoading = isMockAuth ? false : intents === undefined;

  /**
   * Submit a new intent from natural language
   */
  const submitIntent = useCallback(
    async (rawText: string): Promise<Id<"intents">> => {
      console.log('[useIntents] submitIntent called');
      console.log('[useIntents] rawText:', rawText);
      console.log('[useIntents] userId:', userId);
      console.log('[useIntents] isMockAuth:', isMockAuth);

      if (!userId) {
        console.error('[useIntents] No userId - throwing error');
        throw new Error("User not authenticated");
      }

      setIsProcessing(true);
      console.log('[useIntents] isProcessing set to true');

      try {
        // DEV MODE: Call Brain Orchestrator directly (bypasses Convex auth)
        if (isMockAuth) {
          console.log('[useIntents] DEV MODE - calling Brain directly');
          const mockIntentId = `mock_intent_${Date.now()}` as Id<"intents">;

          // Create initial pending intent
          const mockIntent: Intent = {
            _id: mockIntentId,
            userId: userId,
            rawText,
            status: "parsing",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setMockIntents((prev) => [mockIntent, ...prev]);
          setActiveIntentId(mockIntentId);

          // Call Brain Orchestrator for AI parsing
          console.log("[DEV] Calling Brain Orchestrator...");
          const brainResponse = await converseWithBrain({
            sessionId: `session_${userId}`,
            userId: userId as string,
            message: rawText,
          });

          // Update intent with Brain response
          const updatedIntent: Intent = {
            ...mockIntent,
            status: brainResponse.success
              ? brainResponse.needsClarification
                ? "clarifying"
                : "completed"
              : "failed",
            parsedIntent: brainResponse.intent
              ? {
                  action: brainResponse.intent.action as ParsedIntent["action"],
                  needsClarification: brainResponse.needsClarification,
                  clarificationQuestion: brainResponse.clarificationQuestion,
                  confidence: brainResponse.confidence,
                }
              : undefined,
            error: brainResponse.error,
            updatedAt: Date.now(),
          };

          setMockIntents((prev) =>
            prev.map((i) => (i._id === mockIntentId ? updatedIntent : i))
          );

          console.log("[DEV] Brain response:", brainResponse.responseText);
          return mockIntentId;
        }

        // PRODUCTION: Create the intent via Convex
        // The mutation automatically schedules AI parsing internally
        console.log('[useIntents] PRODUCTION MODE - calling Convex mutation');
        console.log('[useIntents] Creating intent with userId:', userId);
        const intentId = await createIntentMutation({
          rawText,
          userId,
        });
        console.log('[useIntents] Convex mutation returned intentId:', intentId);

        setActiveIntentId(intentId);
        return intentId;
      } catch (error) {
        console.error('[useIntents] Error in submitIntent:', error);
        throw error;
      } finally {
        console.log('[useIntents] Setting isProcessing to false');
        setIsProcessing(false);
      }
    },
    [userId, isMockAuth, createIntentMutation]
  );

  /**
   * Provide clarification for an ambiguous intent
   */
  const clarifyIntent = useCallback(
    async (intentId: Id<"intents">, clarification: string): Promise<void> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      setIsProcessing(true);

      try {
        // Update intent with clarification
        // The mutation automatically schedules re-parsing internally
        await clarifyIntentMutation({
          intentId,
          clarificationResponse: clarification,
          userId,
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [userId, clarifyIntentMutation]
  );

  /**
   * Approve an intent for execution
   */
  const approveIntent = useCallback(
    async (intentId: Id<"intents">): Promise<void> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      setIsProcessing(true);

      try {
        // Mark as approved
        // The mutation automatically schedules execution internally
        await approveIntentMutation({ intentId, userId });
      } finally {
        setIsProcessing(false);
        setActiveIntentId(null);
      }
    },
    [userId, approveIntentMutation]
  );

  /**
   * Cancel an intent
   */
  const cancelIntent = useCallback(
    async (intentId: Id<"intents">): Promise<void> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      await cancelIntentMutation({ intentId, userId });
      setActiveIntentId(null);
    },
    [userId, cancelIntentMutation]
  );

  /**
   * Get intent preview for display
   */
  const getIntentPreview = useCallback(
    (intentId: Id<"intents">): Intent | undefined => {
      // Check mock intents first (for dev mode)
      const mockIntent = mockIntents.find((intent) => intent._id === intentId);
      if (mockIntent) return mockIntent;
      // Then check Convex intents
      return intents?.find((intent: any) => intent._id === intentId) as Intent | undefined;
    },
    [intents, mockIntents]
  );

  // Get the active intent from either mock or Convex data
  const resolvedActiveIntent = isMockAuth
    ? mockIntents.find((i) => i._id === activeIntentId) || null
    : (activeIntent as Intent | null);

  return {
    intents: isMockAuth ? mockIntents : (intents as Intent[] | undefined),
    activeIntent: resolvedActiveIntent,
    isLoading,
    isProcessing,
    submitIntent,
    clarifyIntent,
    approveIntent,
    cancelIntent,
    getIntentPreview,
  };
}

/**
 * Hook for getting recent intents (for history display)
 */
export function useRecentIntents(userId: Id<"users"> | null, limit: number = 10) {
  // Skip Convex for mock auth
  const isMockAuth = isMockUserId(userId);

  // Uses the list query with limit (query uses auth identity, not userId param)
  const intents = useQuery(
    api.intents.intents.list,
    userId && !isMockAuth ? { limit } : "skip"
  );

  return {
    // Return empty array for mock mode (intents are managed in useIntents hook)
    intents: isMockAuth ? [] : intents,
    isLoading: isMockAuth ? false : intents === undefined,
  };
}

/**
 * Hook for getting a single intent with real-time updates
 */
export function useIntent(intentId: Id<"intents"> | null) {
  // Check if this is a mock intent ID
  const isMockIntent = intentId?.startsWith?.("mock_intent_");

  const intent = useQuery(
    api.intents.intents.get,
    intentId && !isMockIntent ? { intentId } : "skip"
  );

  return {
    // For mock intents, return null (use getIntentPreview from useIntents instead)
    intent: isMockIntent ? null : intent,
    isLoading: isMockIntent ? false : intent === undefined,
  };
}
