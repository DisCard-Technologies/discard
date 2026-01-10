/**
 * Chat history types for persistent conversation storage
 */

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: number;
  intentId?: string; // Optional link to intent that was created from this message
}

export interface ChatSession {
  id: string;
  title: string; // Auto-generated from first user message
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number; // Used for LRU ordering - updated on every interaction
}
