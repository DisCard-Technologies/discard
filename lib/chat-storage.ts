/**
 * Chat Storage Service
 *
 * Handles persistent storage of chat history with LRU eviction.
 * Uses SecureStore on mobile, localStorage on web.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ChatSession, ChatMessage } from '@/types/chat';

// Storage key for chat history
const CHAT_HISTORY_KEY = 'discard_chat_history';
const MAX_CHATS = 5;

// Web-compatible storage wrapper (same pattern as lib/passkeys.ts)
const storage = {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a title from the first message (truncated to 30 chars)
 */
function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim();
  return cleaned.length > 30 ? cleaned.substring(0, 30) + '...' : cleaned;
}

/**
 * Sort sessions by updatedAt (most recent first) and keep only MAX_CHATS
 */
function enforceMaxChats(sessions: ChatSession[]): ChatSession[] {
  return [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS);
}

/**
 * Load all chat sessions from storage
 */
export async function loadChatHistory(): Promise<ChatSession[]> {
  try {
    const data = await storage.getItem(CHAT_HISTORY_KEY);
    if (!data) return [];

    const sessions = JSON.parse(data) as ChatSession[];
    // Ensure sorted by updatedAt on load
    return enforceMaxChats(sessions);
  } catch (error) {
    console.error('[ChatStorage] Failed to load chat history:', error);
    return [];
  }
}

/**
 * Save all chat sessions to storage
 */
export async function saveChatHistory(sessions: ChatSession[]): Promise<void> {
  try {
    // Enforce max chats before saving
    const trimmed = enforceMaxChats(sessions);
    await storage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('[ChatStorage] Failed to save chat history:', error);
  }
}

/**
 * Create a new chat session
 */
export function createChatSession(firstMessage: string): ChatSession {
  const now = Date.now();
  return {
    id: generateSessionId(),
    title: generateTitle(firstMessage),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Add a message to a session and update LRU timestamp
 */
export async function addMessageToSession(
  sessionId: string,
  message: Omit<ChatMessage, 'id' | 'timestamp'>
): Promise<ChatSession[]> {
  const sessions = await loadChatHistory();
  const sessionIndex = sessions.findIndex((s) => s.id === sessionId);

  if (sessionIndex === -1) {
    console.warn('[ChatStorage] Session not found:', sessionId);
    return sessions;
  }

  const newMessage: ChatMessage = {
    ...message,
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
  };

  sessions[sessionIndex].messages.push(newMessage);
  sessions[sessionIndex].updatedAt = Date.now();

  // Update title if this is the first user message
  if (message.type === 'user' && sessions[sessionIndex].messages.filter(m => m.type === 'user').length === 1) {
    sessions[sessionIndex].title = generateTitle(message.text);
  }

  const updated = enforceMaxChats(sessions);
  await saveChatHistory(updated);
  return updated;
}

/**
 * Touch a session (update LRU timestamp, moves to position 1)
 */
export async function touchSession(sessionId: string): Promise<ChatSession[]> {
  const sessions = await loadChatHistory();
  const sessionIndex = sessions.findIndex((s) => s.id === sessionId);

  if (sessionIndex === -1) {
    console.warn('[ChatStorage] Session not found:', sessionId);
    return sessions;
  }

  sessions[sessionIndex].updatedAt = Date.now();

  const updated = enforceMaxChats(sessions);
  await saveChatHistory(updated);
  return updated;
}

/**
 * Delete a specific session
 */
export async function deleteSession(sessionId: string): Promise<ChatSession[]> {
  const sessions = await loadChatHistory();
  const updated = sessions.filter((s) => s.id !== sessionId);
  await saveChatHistory(updated);
  return updated;
}

/**
 * Clear all chat history
 */
export async function clearChatHistory(): Promise<void> {
  await storage.deleteItem(CHAT_HISTORY_KEY);
}

/**
 * Get a single session by ID
 */
export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const sessions = await loadChatHistory();
  return sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Save a session (create or update)
 */
export async function saveSession(session: ChatSession): Promise<ChatSession[]> {
  const sessions = await loadChatHistory();
  const existingIndex = sessions.findIndex((s) => s.id === session.id);

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }

  const updated = enforceMaxChats(sessions);
  await saveChatHistory(updated);
  return updated;
}
