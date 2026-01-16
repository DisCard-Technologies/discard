/**
 * MagicBlock Authorization Hook
 *
 * React hook for managing MagicBlock ephemeral rollup sessions
 * and processing card authorizations with sub-50ms latency.
 */

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id, Doc } from '@/convex/_generated/dataModel';
import { getMagicBlockService, isMagicBlockConfigured } from '@/services/magicblockClient';
import type { AuthorizationRequest, AuthorizationResponse, EphemeralSession } from '@/lib/tee/magicblock-types';

// ============ TYPES ============

export interface UseMagicBlockAuthOptions {
  /** Card ID to manage sessions for */
  cardId?: Id<"cards">;
  /** Auto-create session when card is selected */
  autoCreateSession?: boolean;
  /** Session duration in milliseconds */
  sessionDuration?: number;
}

export interface UseMagicBlockAuthResult {
  /** Current session state */
  session: Doc<"magicblockSessions"> | null | undefined;
  /** Whether session is loading */
  isLoading: boolean;
  /** Whether MagicBlock is configured */
  isConfigured: boolean;
  /** Create a new session for the card */
  createSession: () => Promise<Id<"magicblockSessions"> | null>;
  /** End the current session */
  endSession: () => Promise<boolean>;
  /** Process an authorization request */
  authorize: (request: Omit<AuthorizationRequest, 'cardId' | 'timestamp'>) => Promise<AuthorizationResponse | null>;
  /** Error state */
  error: string | null;
  /** Clear error */
  clearError: () => void;
}

// ============ HOOK ============

/**
 * Hook for managing MagicBlock card authorization sessions
 *
 * @example
 * ```tsx
 * const { session, authorize, createSession } = useMagicBlockAuth({
 *   cardId: selectedCard._id,
 *   autoCreateSession: true,
 * });
 *
 * // Authorize a transaction
 * const result = await authorize({
 *   transactionId: 'txn_123',
 *   amount: 5000, // $50.00
 *   merchantMcc: '5411',
 *   merchantName: 'Grocery Store',
 * });
 *
 * if (result?.decision === 'approved') {
 *   // Transaction approved in <50ms
 * }
 * ```
 */
export function useMagicBlockAuth(options: UseMagicBlockAuthOptions = {}): UseMagicBlockAuthResult {
  const { cardId, autoCreateSession = false, sessionDuration } = options;

  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Check if MagicBlock is configured
  const isConfigured = isMagicBlockConfigured();

  // Get current session for card
  const session = useQuery(
    api.tee.magicblock.getActiveSession,
    cardId ? { cardId } : 'skip'
  );

  // Mutations
  const createSessionMutation = useMutation(api.tee.magicblock.createSession);
  const activateSessionMutation = useMutation(api.tee.magicblock.activateSession);
  const completeSessionMutation = useMutation(api.tee.magicblock.completeSession);
  const failSessionMutation = useMutation(api.tee.magicblock.failSession);

  // Action for authorization
  const processAuthorizationAction = useAction(api.tee.magicblock.processAuthorization);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Create a new MagicBlock session for the card
   */
  const createSession = useCallback(async (): Promise<Id<"magicblockSessions"> | null> => {
    if (!cardId) {
      setError('No card selected');
      return null;
    }

    if (!isConfigured) {
      setError('MagicBlock not configured');
      return null;
    }

    if (session) {
      // Already have an active session
      return session._id;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create session in Convex
      const result = await createSessionMutation({
        cardId,
        maxDuration: sessionDuration,
      });

      // Get MagicBlock service and create actual session
      const magicBlockService = getMagicBlockService();
      const mbSession = await magicBlockService.createSession(
        cardId,
        '', // userId will be filled by service
        {
          maxDuration: sessionDuration || 3600000,
          delegatedAccounts: [],
          commitInterval: 5000,
          maxTransactionsPerBatch: 100,
        }
      );

      // Activate session with MagicBlock session ID
      await activateSessionMutation({
        sessionId: result.sessionId as Id<"magicblockSessions">,
        magicblockSessionId: mbSession.sessionId,
        clusterEndpoint: mbSession.clusterEndpoint,
      });

      console.log('[useMagicBlockAuth] Session created:', result.sessionId);
      return result.sessionId as Id<"magicblockSessions">;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      console.error('[useMagicBlockAuth] Create session error:', err);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [cardId, isConfigured, session, sessionDuration, createSessionMutation, activateSessionMutation]);

  /**
   * End the current session
   */
  const endSession = useCallback(async (): Promise<boolean> => {
    if (!session) {
      return false;
    }

    try {
      // Get MagicBlock service and undelegate
      const magicBlockService = getMagicBlockService();
      await magicBlockService.undelegateAccounts({
        sessionId: session.sessionId,
        forceCommit: true,
      });

      // Complete session in Convex
      await completeSessionMutation({
        sessionId: session._id,
      });

      console.log('[useMagicBlockAuth] Session ended:', session._id);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end session';
      setError(message);
      console.error('[useMagicBlockAuth] End session error:', err);

      // Mark session as failed
      try {
        await failSessionMutation({
          sessionId: session._id,
          error: message,
        });
      } catch {
        // Ignore cleanup error
      }

      return false;
    }
  }, [session, completeSessionMutation, failSessionMutation]);

  /**
   * Process an authorization request through MagicBlock PER
   */
  const authorize = useCallback(async (
    request: Omit<AuthorizationRequest, 'cardId' | 'timestamp'>
  ): Promise<AuthorizationResponse | null> => {
    if (!cardId) {
      setError('No card selected');
      return null;
    }

    if (!session) {
      setError('No active session');
      return null;
    }

    try {
      const result = await processAuthorizationAction({
        cardId,
        transactionId: request.transactionId,
        amount: request.amount,
        merchantMcc: request.merchantMcc,
        merchantName: request.merchantName,
        merchantCountry: request.merchantCountry,
      });

      console.log(`[useMagicBlockAuth] Authorization ${request.transactionId}: ${result.decision} in ${result.processingTimeMs}ms`);

      return {
        transactionId: request.transactionId,
        decision: result.decision as AuthorizationResponse['decision'],
        declineReason: result.declineReason as AuthorizationResponse['declineReason'],
        authorizationCode: result.authorizationCode,
        processingTimeMs: result.processingTimeMs,
        sessionId: session.sessionId,
        timestamp: Date.now(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authorization failed';
      setError(message);
      console.error('[useMagicBlockAuth] Authorization error:', err);
      return null;
    }
  }, [cardId, session, processAuthorizationAction]);

  // Auto-create session when card is selected
  useEffect(() => {
    if (autoCreateSession && cardId && isConfigured && session === null && !isCreating) {
      createSession();
    }
  }, [autoCreateSession, cardId, isConfigured, session, isCreating, createSession]);

  return {
    session,
    isLoading: session === undefined || isCreating,
    isConfigured,
    createSession,
    endSession,
    authorize,
    error,
    clearError,
  };
}

// ============ UTILITY HOOKS ============

/**
 * Hook to get all user's MagicBlock sessions
 */
export function useMagicBlockSessions(limit?: number) {
  const sessions = useQuery(api.tee.magicblock.getUserSessions, { limit });
  return {
    sessions: sessions || [],
    isLoading: sessions === undefined,
  };
}

/**
 * Hook to get batches for a session
 */
export function useSessionBatches(sessionId?: string) {
  const batches = useQuery(
    api.tee.magicblock.getSessionBatches,
    sessionId ? { sessionId } : 'skip'
  );
  return {
    batches: batches || [],
    isLoading: batches === undefined,
  };
}

export default useMagicBlockAuth;
