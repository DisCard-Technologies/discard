/**
 * Server-Side Timing Obfuscation Service
 *
 * Provides request queuing, batching, and timing randomization
 * to prevent timing-based correlation attacks.
 *
 * Features:
 * - Request queuing with randomized flush intervals
 * - Dummy traffic injection for high-privacy users
 * - Batch execution with shuffled order
 * - Inter-request random delays
 */

import { action, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// ============================================================================
// Types
// ============================================================================

interface QueuedRequest {
  id: string;
  userId: string;
  endpoint: string;
  method: string;
  params: unknown;
  privacyLevel: "basic" | "enhanced" | "maximum";
  queuedAt: number;
  executeAfter: number;
}

interface TimingConfig {
  /** Minimum flush interval in ms */
  minFlushInterval: number;
  /** Maximum flush interval in ms */
  maxFlushInterval: number;
  /** Inter-request delay range [min, max] in ms */
  interRequestDelay: [number, number];
  /** Whether to inject dummy requests */
  injectDummyRequests: boolean;
  /** Probability of injecting a dummy request (0-1) */
  dummyRequestProbability: number;
}

// ============================================================================
// Configuration
// ============================================================================

const TIMING_CONFIGS: Record<"basic" | "enhanced" | "maximum", TimingConfig> = {
  basic: {
    minFlushInterval: 0,
    maxFlushInterval: 0,
    interRequestDelay: [0, 0],
    injectDummyRequests: false,
    dummyRequestProbability: 0,
  },
  enhanced: {
    minFlushInterval: 100,
    maxFlushInterval: 500,
    interRequestDelay: [10, 50],
    injectDummyRequests: false,
    dummyRequestProbability: 0,
  },
  maximum: {
    minFlushInterval: 200,
    maxFlushInterval: 1000,
    interRequestDelay: [20, 100],
    injectDummyRequests: true,
    dummyRequestProbability: 0.1,
  },
};

// Dummy endpoints for traffic injection
const DUMMY_ENDPOINTS = [
  { endpoint: "solana", method: "getHealth", params: [] },
  { endpoint: "solana", method: "getSlot", params: [] },
  { endpoint: "solana", method: "getBlockHeight", params: [] },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate random value in range using crypto
 */
function randomInRange(min: number, max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + (array[0] % (max - min + 1));
}

/**
 * Generate random UUID for request tracking
 */
function generateRequestId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  // Set version (4) and variant bits
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;

  const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Request Queue Management (In-Memory for Convex)
// ============================================================================

// Note: In a production Convex deployment, you would store queued requests
// in the database and use scheduled functions for delayed execution.
// This implementation demonstrates the timing obfuscation logic.

/**
 * Queue a request for delayed execution
 *
 * Returns a request ID that can be used to retrieve the result.
 */
export const enqueueRequest = action({
  args: {
    userId: v.string(),
    endpoint: v.string(),
    method: v.string(),
    params: v.any(),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
  },
  handler: async (ctx, args) => {
    const { privacyLevel } = args;
    const config = TIMING_CONFIGS[privacyLevel];

    // For basic privacy, execute immediately
    if (privacyLevel === "basic") {
      return {
        immediate: true,
        requestId: null,
      };
    }

    // Calculate delayed execution time
    const delay = randomInRange(config.minFlushInterval, config.maxFlushInterval);
    const requestId = generateRequestId();

    // Store in database for scheduled execution
    await ctx.runMutation(internal.network.timingService.storeQueuedRequest, {
      id: requestId,
      userId: args.userId,
      endpoint: args.endpoint,
      method: args.method,
      params: args.params,
      privacyLevel,
      executeAfter: Date.now() + delay,
    });

    return {
      immediate: false,
      requestId,
      estimatedDelayMs: delay,
    };
  },
});

/**
 * Store a queued request in the database
 */
export const storeQueuedRequest = internalMutation({
  args: {
    id: v.string(),
    userId: v.string(),
    endpoint: v.string(),
    method: v.string(),
    params: v.any(),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
    executeAfter: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("requestQueue", {
      requestId: args.id,
      userId: args.userId,
      endpoint: args.endpoint,
      method: args.method,
      params: args.params,
      privacyLevel: args.privacyLevel,
      executeAfter: args.executeAfter,
      status: "queued",
      createdAt: Date.now(),
    });
  },
});

/**
 * Get pending requests ready for execution
 */
export const getPendingRequests = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit || 10;

    return await ctx.db
      .query("requestQueue")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "queued"),
          q.lte(q.field("executeAfter"), now)
        )
      )
      .order("asc")
      .take(limit);
  },
});

// ============================================================================
// Timing Obfuscation Actions
// ============================================================================

/**
 * Execute a request with timing obfuscation
 *
 * Applies privacy-level-appropriate delays and optionally
 * injects dummy traffic.
 */
export const executeWithObfuscation = action({
  args: {
    requests: v.array(
      v.object({
        endpoint: v.string(),
        method: v.string(),
        params: v.any(),
      })
    ),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
  },
  handler: async (ctx, args) => {
    const { requests, privacyLevel } = args;
    const config = TIMING_CONFIGS[privacyLevel];

    // For basic privacy, execute directly
    if (privacyLevel === "basic") {
      return {
        obfuscated: false,
        requestCount: requests.length,
      };
    }

    // Initial random delay
    const initialDelay = randomInRange(
      config.minFlushInterval,
      config.maxFlushInterval
    );
    await sleep(initialDelay);

    // Shuffle request order for maximum privacy
    const orderedRequests = privacyLevel === "maximum"
      ? shuffleArray(requests)
      : requests;

    // Optionally inject dummy requests
    const finalRequests = [...orderedRequests];
    if (config.injectDummyRequests) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      const shouldInject = (arr[0] / 0xffffffff) < config.dummyRequestProbability;

      if (shouldInject) {
        const dummyIdx = arr[0] % DUMMY_ENDPOINTS.length;
        const dummy = DUMMY_ENDPOINTS[dummyIdx];
        // Insert dummy at random position
        const insertPos = arr[0] % (finalRequests.length + 1);
        finalRequests.splice(insertPos, 0, {
          ...dummy,
          _isDummy: true,
        } as any);
      }
    }

    // Execute with inter-request delays
    const results = [];
    for (const req of finalRequests) {
      // Inter-request delay
      if (config.interRequestDelay[1] > 0) {
        const delay = randomInRange(
          config.interRequestDelay[0],
          config.interRequestDelay[1]
        );
        await sleep(delay);
      }

      // Skip actually executing dummy requests (they're just for timing)
      if ((req as any)._isDummy) {
        continue;
      }

      results.push({
        endpoint: req.endpoint,
        method: req.method,
        // Actual execution would happen here via privateRpcCall
      });
    }

    return {
      obfuscated: true,
      requestCount: requests.length,
      totalDelay: initialDelay,
      dummyInjected: finalRequests.length > requests.length,
    };
  },
});

/**
 * Add random padding to response times
 *
 * Ensures all responses take approximately the same time,
 * preventing timing analysis.
 */
export const padResponseTime = action({
  args: {
    targetDuration: v.number(),
    actualStartTime: v.number(),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
  },
  handler: async (ctx, args) => {
    const { targetDuration, actualStartTime, privacyLevel } = args;

    // Only pad for enhanced/maximum privacy
    if (privacyLevel === "basic") {
      return { padded: false };
    }

    const elapsed = Date.now() - actualStartTime;
    const remaining = targetDuration - elapsed;

    if (remaining > 0) {
      // Add some randomness to the padding
      const config = TIMING_CONFIGS[privacyLevel];
      const jitter = randomInRange(0, config.interRequestDelay[1]);
      await sleep(remaining + jitter);
    }

    return {
      padded: true,
      actualElapsed: elapsed,
      totalDuration: Date.now() - actualStartTime,
    };
  },
});

/**
 * Generate cover traffic
 *
 * Periodically sends dummy requests to mask real user activity patterns.
 * Should be called by a scheduled function.
 */
export const generateCoverTraffic = action({
  args: {
    intensity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
  },
  handler: async (ctx, args) => {
    const requestCounts = {
      low: 1,
      medium: 3,
      high: 5,
    };

    const count = requestCounts[args.intensity];
    const generatedRequests = [];

    for (let i = 0; i < count; i++) {
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);

      const dummyIdx = arr[0] % DUMMY_ENDPOINTS.length;
      const delay = randomInRange(100, 2000);

      generatedRequests.push({
        ...DUMMY_ENDPOINTS[dummyIdx],
        scheduledDelay: delay,
      });

      // Add delay between cover requests
      await sleep(delay);
    }

    return {
      generated: count,
      requests: generatedRequests,
    };
  },
});
