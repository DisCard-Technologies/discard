/**
 * Intents Hook
 *
 * Provides intent-centric AI middleware integration for the Command Bar.
 * Handles natural language processing, intent parsing, and Solana transaction execution.
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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

  // Real-time subscription to user's intents
  const intents = useQuery(
    api.intents.intents.list,
    userId ? { userId } : "skip"
  );

  // Get active intent
  const activeIntent = useQuery(
    api.intents.intents.get,
    activeIntentId ? { intentId: activeIntentId } : "skip"
  );

  // Mutations
  const createIntentMutation = useMutation(api.intents.intents.create);
  const clarifyIntentMutation = useMutation(api.intents.intents.clarify);
  const approveIntentMutation = useMutation(api.intents.intents.approve);
  const cancelIntentMutation = useMutation(api.intents.intents.cancel);

  // Actions
  const parseIntentAction = useAction(api.intents.solver.parseIntent);
  const executeIntentAction = useAction(api.intents.executor.executeIntent);

  const isLoading = intents === undefined;

  /**
   * Submit a new intent from natural language
   */
  const submitIntent = useCallback(
    async (rawText: string): Promise<Id<"intents">> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      setIsProcessing(true);

      try {
        // Create the intent
        const intentId = await createIntentMutation({
          userId,
          rawText,
        });

        setActiveIntentId(intentId);

        // Parse the intent with Claude AI
        await parseIntentAction({ intentId });

        return intentId;
      } finally {
        setIsProcessing(false);
      }
    },
    [userId, createIntentMutation, parseIntentAction]
  );

  /**
   * Provide clarification for an ambiguous intent
   */
  const clarifyIntent = useCallback(
    async (intentId: Id<"intents">, clarification: string): Promise<void> => {
      setIsProcessing(true);

      try {
        // Update intent with clarification
        await clarifyIntentMutation({
          intentId,
          clarification,
        });

        // Re-parse with additional context
        await parseIntentAction({ intentId });
      } finally {
        setIsProcessing(false);
      }
    },
    [clarifyIntentMutation, parseIntentAction]
  );

  /**
   * Approve an intent for execution
   */
  const approveIntent = useCallback(
    async (intentId: Id<"intents">): Promise<void> => {
      setIsProcessing(true);

      try {
        // Mark as approved
        await approveIntentMutation({ intentId });

        // Execute the intent
        await executeIntentAction({ intentId });
      } finally {
        setIsProcessing(false);
        setActiveIntentId(null);
      }
    },
    [approveIntentMutation, executeIntentAction]
  );

  /**
   * Cancel an intent
   */
  const cancelIntent = useCallback(
    async (intentId: Id<"intents">): Promise<void> => {
      await cancelIntentMutation({ intentId });
      setActiveIntentId(null);
    },
    [cancelIntentMutation]
  );

  /**
   * Get intent preview for display
   */
  const getIntentPreview = useCallback(
    (intentId: Id<"intents">): Intent | undefined => {
      return intents?.find((intent) => intent._id === intentId) as Intent | undefined;
    },
    [intents]
  );

  return {
    intents: intents as Intent[] | undefined,
    activeIntent: activeIntent as Intent | null,
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
  const intents = useQuery(
    api.intents.intents.listRecent,
    userId ? { userId, limit } : "skip"
  );

  return {
    intents,
    isLoading: intents === undefined,
  };
}

/**
 * Hook for getting a single intent with real-time updates
 */
export function useIntent(intentId: Id<"intents"> | null) {
  const intent = useQuery(
    api.intents.intents.get,
    intentId ? { intentId } : "skip"
  );

  return {
    intent,
    isLoading: intent === undefined,
  };
}
