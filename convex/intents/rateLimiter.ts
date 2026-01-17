/**
 * DisCard Rate Limiter
 *
 * Rate limiting and request queuing for the intent system.
 * Prevents abuse while providing good UX via queuing.
 *
 * Limits (Generous):
 * - 30 requests per minute
 * - 500 requests per hour
 * - 150,000 tokens per day
 *
 * When rate limited:
 * - Request is queued
 * - User sees estimated wait time
 * - Queue processes FIFO as limits recover
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export interface RateLimitStatus {
  allowed: boolean;
  currentMinuteRequests: number;
  currentHourRequests: number;
  currentDayTokens: number;
  queuePosition?: number;
  estimatedWaitMs?: number;
  reason?: string;
}

export interface QueuedRequest {
  id: string;
  userId: Id<"users">;
  rawText: string;
  queuedAt: number;
  estimatedWaitMs: number;
  position: number;
  status: "queued" | "processing" | "completed" | "expired";
}

export interface UsageStats {
  userId: Id<"users">;
  date: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  cacheHits: number;
  llmCalls: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Rate limits (generous) */
export const RATE_LIMITS = {
  requestsPerMinute: 30,
  requestsPerHour: 500,
  tokensPerDay: 150_000,
  maxInputTokens: 500,
  maxOutputTokens: 1024,
};

/** Queue limits */
const QUEUE_LIMITS = {
  maxQueueDepthPerUser: 10,
  maxQueueAge: 5 * 60 * 1000, // 5 minutes
  processingTimeout: 30 * 1000, // 30 seconds
};

/** Time windows */
const TIME_WINDOWS = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get current date string for daily tracking
 */
function getCurrentDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Estimate tokens from text (rough approximation)
 * ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate estimated wait time based on queue position
 */
function calculateEstimatedWait(position: number): number {
  // Assume ~2 seconds per request processing
  return position * 2000;
}

// ============================================================================
// Rate Limit Queries
// ============================================================================

/**
 * Check if user can make a request
 */
export const checkRateLimit = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<RateLimitStatus> => {
    const now = Date.now();
    const today = getCurrentDateString();

    // Get today's usage
    const usage = await ctx.db
      .query("userTokenUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", today)
      )
      .first();

    // Get recent requests from intents table
    const oneMinuteAgo = now - TIME_WINDOWS.minute;
    const oneHourAgo = now - TIME_WINDOWS.hour;

    const recentIntents = await ctx.db
      .query("intents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gte(q.field("_creationTime"), oneHourAgo))
      .collect();

    const minuteRequests = recentIntents.filter(
      (i) => i._creationTime >= oneMinuteAgo
    ).length;
    const hourRequests = recentIntents.length;
    const dayTokens = usage?.inputTokens ?? 0 + (usage?.outputTokens ?? 0);

    // Check limits
    if (minuteRequests >= RATE_LIMITS.requestsPerMinute) {
      return {
        allowed: false,
        currentMinuteRequests: minuteRequests,
        currentHourRequests: hourRequests,
        currentDayTokens: dayTokens,
        reason: "Minute limit reached",
        estimatedWaitMs: TIME_WINDOWS.minute - (now - oneMinuteAgo),
      };
    }

    if (hourRequests >= RATE_LIMITS.requestsPerHour) {
      return {
        allowed: false,
        currentMinuteRequests: minuteRequests,
        currentHourRequests: hourRequests,
        currentDayTokens: dayTokens,
        reason: "Hour limit reached",
        estimatedWaitMs: TIME_WINDOWS.hour - (now - oneHourAgo),
      };
    }

    if (dayTokens >= RATE_LIMITS.tokensPerDay) {
      return {
        allowed: false,
        currentMinuteRequests: minuteRequests,
        currentHourRequests: hourRequests,
        currentDayTokens: dayTokens,
        reason: "Daily token limit reached",
      };
    }

    return {
      allowed: true,
      currentMinuteRequests: minuteRequests,
      currentHourRequests: hourRequests,
      currentDayTokens: dayTokens,
    };
  },
});

/**
 * Get user's current queue
 */
export const getUserQueue = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Doc<"intentQueue">[]> => {
    return await ctx.db
      .query("intentQueue")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "queued")
      )
      .collect();
  },
});

/**
 * Get usage stats for a user
 */
export const getUserUsageStats = query({
  args: {
    userId: v.id("users"),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"userTokenUsage"> | null> => {
    const date = args.date ?? getCurrentDateString();

    return await ctx.db
      .query("userTokenUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", date)
      )
      .first();
  },
});

// ============================================================================
// Rate Limit Mutations
// ============================================================================

/**
 * Record token usage for a request
 */
export const recordUsage = mutation({
  args: {
    userId: v.id("users"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    wasLLMCall: v.boolean(),
    wasCacheHit: v.boolean(),
  },
  handler: async (ctx, args): Promise<void> => {
    const today = getCurrentDateString();

    const existing = await ctx.db
      .query("userTokenUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", today)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        inputTokens: existing.inputTokens + args.inputTokens,
        outputTokens: existing.outputTokens + args.outputTokens,
        requestCount: existing.requestCount + 1,
        cacheHits: existing.cacheHits + (args.wasCacheHit ? 1 : 0),
        llmCalls: existing.llmCalls + (args.wasLLMCall ? 1 : 0),
      });
    } else {
      await ctx.db.insert("userTokenUsage", {
        userId: args.userId,
        date: today,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        requestCount: 1,
        cacheHits: args.wasCacheHit ? 1 : 0,
        llmCalls: args.wasLLMCall ? 1 : 0,
      });
    }
  },
});

/**
 * Add request to queue when rate limited
 */
export const queueRequest = mutation({
  args: {
    userId: v.id("users"),
    rawText: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ queued: boolean; queueId?: Id<"intentQueue">; position?: number; estimatedWaitMs?: number; error?: string }> => {
    // Check existing queue depth
    const existingQueue = await ctx.db
      .query("intentQueue")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "queued")
      )
      .collect();

    if (existingQueue.length >= QUEUE_LIMITS.maxQueueDepthPerUser) {
      return {
        queued: false,
        error: "Queue is full. Please wait for pending requests to complete.",
      };
    }

    const position = existingQueue.length + 1;
    const estimatedWaitMs = calculateEstimatedWait(position);
    const now = Date.now();

    const queueId = await ctx.db.insert("intentQueue", {
      userId: args.userId,
      rawText: args.rawText,
      queuedAt: now,
      estimatedWaitMs,
      position,
      status: "queued",
      expiresAt: now + QUEUE_LIMITS.maxQueueAge,
    });

    return {
      queued: true,
      queueId,
      position,
      estimatedWaitMs,
    };
  },
});

/**
 * Process next item in queue
 */
export const processNextInQueue = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Doc<"intentQueue"> | null> => {
    const now = Date.now();

    // Get next queued item
    const nextItem = await ctx.db
      .query("intentQueue")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "queued")
      )
      .order("asc")
      .first();

    if (!nextItem) {
      return null;
    }

    // Check if expired
    if (nextItem.expiresAt < now) {
      await ctx.db.patch(nextItem._id, { status: "expired" });
      return null;
    }

    // Mark as processing
    await ctx.db.patch(nextItem._id, { status: "processing" });

    return nextItem;
  },
});

/**
 * Mark queue item as completed
 */
export const completeQueueItem = mutation({
  args: {
    queueId: v.id("intentQueue"),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.queueId, { status: "completed" });
  },
});

/**
 * Clean up expired queue items
 */
export const cleanupQueue = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();

    // Find expired items
    const expired = await ctx.db
      .query("intentQueue")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "queued"),
          q.lt(q.field("expiresAt"), now)
        )
      )
      .collect();

    // Find stale processing items (stuck)
    const staleProcessing = await ctx.db
      .query("intentQueue")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "processing"),
          q.lt(q.field("queuedAt"), now - QUEUE_LIMITS.processingTimeout)
        )
      )
      .collect();

    // Mark all as expired
    for (const item of [...expired, ...staleProcessing]) {
      await ctx.db.patch(item._id, { status: "expired" });
    }

    return expired.length + staleProcessing.length;
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Truncate input text to max token limit
 */
export function truncateToMaxTokens(text: string): string {
  const maxChars = RATE_LIMITS.maxInputTokens * 4; // ~4 chars per token
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + "...";
}

/**
 * Format rate limit message for user
 */
export function formatRateLimitMessage(status: RateLimitStatus): string {
  if (status.allowed) {
    return "";
  }

  if (status.estimatedWaitMs) {
    const seconds = Math.ceil(status.estimatedWaitMs / 1000);
    if (seconds < 60) {
      return `Please wait ${seconds} seconds before trying again.`;
    }
    const minutes = Math.ceil(seconds / 60);
    return `Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} before trying again.`;
  }

  if (status.reason === "Daily token limit reached") {
    return "You've reached your daily usage limit. It will reset at midnight UTC.";
  }

  return "You're making requests too quickly. Please slow down.";
}

// ============================================================================
// Exports
// ============================================================================

export default {
  RATE_LIMITS,
  estimateTokens,
  truncateToMaxTokens,
  formatRateLimitMessage,
};
