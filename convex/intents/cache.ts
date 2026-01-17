/**
 * DisCard Intent Cache
 *
 * Caching layer to reduce LLM calls for repeated or similar intents.
 * Stores parsed intents and responses for quick retrieval.
 *
 * Cache types:
 * - Intent patterns: Common phrases → parsed intent
 * - Q&A responses: FAQ-type questions → responses
 * - User context: Recent cards/wallets (short TTL)
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry {
  inputHash: string;
  inputText: string;
  responseType: "question" | "conversation" | "action";
  response: unknown;
  hitCount: number;
  createdAt: number;
  expiresAt: number;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default cache TTL: 1 hour */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Q&A cache TTL: 24 hours (FAQ answers don't change often) */
const QA_TTL_MS = 24 * 60 * 60 * 1000;

/** Action cache TTL: 30 minutes (more dynamic) */
const ACTION_TTL_MS = 30 * 60 * 1000;

/** Maximum cache entries per type */
const MAX_CACHE_ENTRIES = 1000;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a hash for cache key from input text
 * Normalizes text before hashing for better cache hits
 */
export function generateCacheKey(input: string): string {
  // Normalize: lowercase, trim, collapse whitespace, remove punctuation
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s$]/g, "");

  // Simple hash function (good enough for cache keys)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `cache_${Math.abs(hash).toString(36)}`;
}

/**
 * Get TTL based on response type
 */
function getTTL(responseType: string): number {
  switch (responseType) {
    case "question":
      return QA_TTL_MS;
    case "action":
      return ACTION_TTL_MS;
    default:
      return DEFAULT_TTL_MS;
  }
}

// ============================================================================
// Cache Queries
// ============================================================================

/**
 * Check cache for a matching entry
 */
export const checkCache = query({
  args: {
    inputHash: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"intentCache"> | null> => {
    const entry = await ctx.db
      .query("intentCache")
      .withIndex("by_hash", (q) => q.eq("inputHash", args.inputHash))
      .first();

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      return null;
    }

    return entry;
  },
});

/**
 * Get cache statistics
 */
export const getCacheStats = query({
  args: {},
  handler: async (ctx): Promise<CacheStats> => {
    const entries = await ctx.db.query("intentCache").collect();

    const now = Date.now();
    const validEntries = entries.filter((e) => e.expiresAt > now);

    const totalHits = validEntries.reduce((sum, e) => sum + e.hitCount, 0);
    const timestamps = validEntries.map((e) => e.createdAt);

    return {
      totalEntries: validEntries.length,
      totalHits,
      hitRate: validEntries.length > 0 ? totalHits / validEntries.length : 0,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    };
  },
});

// ============================================================================
// Cache Mutations
// ============================================================================

/**
 * Store a response in cache
 */
export const cacheResponse = mutation({
  args: {
    inputHash: v.string(),
    inputText: v.string(),
    responseType: v.string(),
    response: v.any(),
  },
  handler: async (ctx, args): Promise<Id<"intentCache">> => {
    const now = Date.now();
    const ttl = getTTL(args.responseType);

    // Check if entry already exists
    const existing = await ctx.db
      .query("intentCache")
      .withIndex("by_hash", (q) => q.eq("inputHash", args.inputHash))
      .first();

    if (existing) {
      // Update existing entry
      await ctx.db.patch(existing._id, {
        response: args.response,
        expiresAt: now + ttl,
      });
      return existing._id;
    }

    // Create new entry
    return await ctx.db.insert("intentCache", {
      inputHash: args.inputHash,
      inputText: args.inputText,
      responseType: args.responseType,
      response: args.response,
      hitCount: 0,
      createdAt: now,
      expiresAt: now + ttl,
    });
  },
});

/**
 * Increment hit count for cache entry
 */
export const recordCacheHit = mutation({
  args: {
    cacheId: v.id("intentCache"),
  },
  handler: async (ctx, args): Promise<void> => {
    const entry = await ctx.db.get(args.cacheId);
    if (entry) {
      await ctx.db.patch(args.cacheId, {
        hitCount: entry.hitCount + 1,
      });
    }
  },
});

/**
 * Invalidate a specific cache entry
 */
export const invalidateCache = mutation({
  args: {
    inputHash: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const entry = await ctx.db
      .query("intentCache")
      .withIndex("by_hash", (q) => q.eq("inputHash", args.inputHash))
      .first();

    if (entry) {
      await ctx.db.delete(entry._id);
      return true;
    }

    return false;
  },
});

/**
 * Clear all expired cache entries (scheduled cleanup)
 */
export const cleanupExpiredCache = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const expired = await ctx.db
      .query("intentCache")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const entry of expired) {
      await ctx.db.delete(entry._id);
    }

    return expired.length;
  },
});

/**
 * Evict least-used entries if cache is too large
 */
export const evictLeastUsed = internalMutation({
  args: {
    maxEntries: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<number> => {
    const maxEntries = args.maxEntries ?? MAX_CACHE_ENTRIES;

    const entries = await ctx.db.query("intentCache").collect();

    if (entries.length <= maxEntries) {
      return 0;
    }

    // Sort by hit count (ascending) and creation time (oldest first)
    const sorted = entries.sort((a, b) => {
      if (a.hitCount !== b.hitCount) {
        return a.hitCount - b.hitCount;
      }
      return a.createdAt - b.createdAt;
    });

    // Delete entries until we're under the limit
    const toDelete = sorted.slice(0, entries.length - maxEntries);

    for (const entry of toDelete) {
      await ctx.db.delete(entry._id);
    }

    return toDelete.length;
  },
});

// ============================================================================
// Template Responses (No LLM needed)
// ============================================================================

/**
 * Get template response for common queries
 * These are stored in code, not database, for instant access
 */
export function getTemplateResponse(
  templateKey: string,
  context?: {
    cardCount?: number;
    balance?: number;
    currency?: string;
  }
): string | null {
  const templates: Record<string, string | ((ctx: typeof context) => string)> = {
    balance_query: (ctx) =>
      ctx?.balance !== undefined
        ? `Your current balance is ${ctx.balance} ${ctx.currency || "USDC"}.`
        : "Let me check your balance for you.",

    cards_query: (ctx) =>
      ctx?.cardCount !== undefined
        ? ctx.cardCount === 0
          ? "You don't have any cards yet. Would you like to create one?"
          : `You have ${ctx.cardCount} card${ctx.cardCount === 1 ? "" : "s"}. Would you like to see the details?`
        : "Let me check your cards for you.",

    help_query: `Here's what I can help you with:
• Fund a card - Add money to your virtual card
• Send/Transfer - Send funds to another wallet
• Swap - Exchange tokens (e.g., USDC to SOL)
• Create card - Get a new virtual card
• Check balance - View your current balance
• View transactions - See your transaction history

Just tell me what you'd like to do!`,

    help_funding: `To fund your card, just say something like:
• "Fund my card with $100"
• "Add $50 to my travel card"
• "Top up my card with 25 USDC"

I'll guide you through the process!`,

    help_transfer: `To send funds, you can say:
• "Send $50 to alice.sol"
• "Transfer 100 USDC to 0x..."
• "Pay @username $25"

I'll help you complete the transfer securely.`,

    help_swap: `To swap tokens, try:
• "Swap 100 USDC for SOL"
• "Exchange my SOL for USDC"
• "Buy $50 worth of SOL"

I'll find the best rate for you via Jupiter!`,

    transaction_query: "Let me pull up your recent transactions.",

    greeting: "Hello! How can I help you today?",

    thanks: "You're welcome! Let me know if you need anything else.",

    goodbye: "Goodbye! Have a great day!",
  };

  const template = templates[templateKey];

  if (!template) {
    return null;
  }

  if (typeof template === "function") {
    return template(context);
  }

  return template;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  generateCacheKey,
  getTemplateResponse,
};
