/**
 * Chat History Hook
 *
 * React hook for managing chat sessions with persistent storage.
 * Implements LRU ordering - most recently used chat is always first.
 */
import { useState, useEffect, useCallback } from 'react';
import type { ChatSession, ChatMessage } from '@/types/chat';
import {
  loadChatHistory,
  saveChatHistory,
  createChatSession,
  touchSession,
  deleteSession as deleteSessionFromStorage,
  saveSession,
} from '@/lib/chat-storage';

export interface UseChatHistoryReturn {
  // State
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  isLoading: boolean;

  // Actions
  createNewChat: (firstMessage?: string) => ChatSession;
  loadChat: (sessionId: string) => Promise<void>;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => Promise<void>;
  updateMessages: (messages: ChatMessage[]) => Promise<void>;
  deleteChat: (sessionId: string) => Promise<void>;
  clearActiveChat: () => void;

  // Utilities
  getChatPreview: (session: ChatSession) => {
    title: string;
    lastMessage: string;
    timestamp: number;
  };
}

export function useChatHistory(): UseChatHistoryReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Compute active session from sessions array
  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId) || null
    : null;

  // Load sessions from storage on mount
  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadChatHistory();
        setSessions(loaded);
      } catch (error) {
        console.error('[useChatHistory] Failed to load:', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  /**
   * Create a new chat session
   */
  const createNewChat = useCallback(
    (firstMessage?: string): ChatSession => {
      const session = createChatSession(firstMessage || 'New conversation');

      // Add to sessions and persist
      setSessions((prev) => {
        const updated = [session, ...prev].slice(0, 5); // Enforce max
        saveChatHistory(updated);
        return updated;
      });

      setActiveSessionId(session.id);
      return session;
    },
    []
  );

  /**
   * Load a chat session (also updates LRU timestamp)
   */
  const loadChat = useCallback(async (sessionId: string): Promise<void> => {
    setActiveSessionId(sessionId);

    // Touch the session to update LRU
    const updated = await touchSession(sessionId);
    setSessions(updated);
  }, []);

  /**
   * Add a message to the active session
   */
  const addMessage = useCallback(
    async (message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<void> => {
      if (!activeSessionId) {
        console.warn('[useChatHistory] No active session to add message to');
        return;
      }

      const newMessage: ChatMessage = {
        ...message,
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: Date.now(),
      };

      setSessions((prev) => {
        const updated = prev.map((session) => {
          if (session.id !== activeSessionId) return session;

          const updatedSession = {
            ...session,
            messages: [...session.messages, newMessage],
            updatedAt: Date.now(),
            // Update title if this is the first user message
            title:
              message.type === 'user' &&
              session.messages.filter((m) => m.type === 'user').length === 0
                ? message.text.length > 30
                  ? message.text.substring(0, 30) + '...'
                  : message.text
                : session.title,
          };
          return updatedSession;
        });

        // Sort by updatedAt and enforce max
        const sorted = [...updated]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 5);

        saveChatHistory(sorted);
        return sorted;
      });
    },
    [activeSessionId]
  );

  /**
   * Update all messages for the active session (used for syncing with CommandBar)
   */
  const updateMessages = useCallback(
    async (messages: ChatMessage[]): Promise<void> => {
      if (!activeSessionId) return;

      setSessions((prev) => {
        const updated = prev.map((session) => {
          if (session.id !== activeSessionId) return session;

          // Find first user message for title
          const firstUserMessage = messages.find((m) => m.type === 'user');
          const title = firstUserMessage
            ? firstUserMessage.text.length > 30
              ? firstUserMessage.text.substring(0, 30) + '...'
              : firstUserMessage.text
            : session.title;

          return {
            ...session,
            messages,
            updatedAt: Date.now(),
            title,
          };
        });

        // Sort by updatedAt and enforce max
        const sorted = [...updated]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 5);

        saveChatHistory(sorted);
        return sorted;
      });
    },
    [activeSessionId]
  );

  /**
   * Delete a chat session
   */
  const deleteChat = useCallback(
    async (sessionId: string): Promise<void> => {
      const updated = await deleteSessionFromStorage(sessionId);
      setSessions(updated);

      // Clear active if we deleted the active session
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    },
    [activeSessionId]
  );

  /**
   * Clear the active chat (deselect, does NOT delete)
   */
  const clearActiveChat = useCallback((): void => {
    setActiveSessionId(null);
  }, []);

  /**
   * Get preview info for a session (for history list)
   */
  const getChatPreview = useCallback(
    (session: ChatSession): { title: string; lastMessage: string; timestamp: number } => {
      const lastMessage =
        session.messages.length > 0
          ? session.messages[session.messages.length - 1].text
          : 'No messages yet';

      return {
        title: session.title,
        lastMessage:
          lastMessage.length > 50 ? lastMessage.substring(0, 50) + '...' : lastMessage,
        timestamp: session.updatedAt,
      };
    },
    []
  );

  return {
    sessions,
    activeSession,
    isLoading,
    createNewChat,
    loadChat,
    addMessage,
    updateMessages,
    deleteChat,
    clearActiveChat,
    getChatPreview,
  };
}
