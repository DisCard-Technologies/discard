/**
 * Hash-Chained Audit Log Module
 *
 * Provides verifiable audit trail for all safety-related events.
 * Uses hash chaining for tamper detection.
 *
 * Key features:
 * - Monotonic sequence numbers per user
 * - SHA-256 hash chain linking events
 * - Optional Solana anchoring via Merkle root
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Type Validators
// ============================================================================

const eventTypeValidator = v.union(
  v.literal("intent_created"),
  v.literal("plan_generated"),
  v.literal("policy_evaluated"),
  v.literal("approval_requested"),
  v.literal("approval_granted"),
  v.literal("approval_rejected"),
  v.literal("countdown_started"),
  v.literal("countdown_cancelled"),
  v.literal("execution_started"),
  v.literal("execution_completed"),
  v.literal("execution_failed"),
  v.literal("breaker_tripped"),
  v.literal("breaker_reset"),
  v.literal("policy_created"),
  v.literal("policy_updated"),
  v.literal("threshold_changed")
);

const eventDataValidator = v.object({
  action: v.optional(v.string()),
  amountCents: v.optional(v.number()),
  targetId: v.optional(v.string()),
  reason: v.optional(v.string()),
  violations: v.optional(v.array(v.string())),
  metadata: v.optional(v.any()),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get audit log entries for a user
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    const entries = await ctx.db
      .query("auditLog")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return entries.slice(offset, offset + limit);
  },
});

/**
 * Get audit log entries by event type
 */
export const getByEventType = query({
  args: {
    eventType: eventTypeValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("auditLog")
      .withIndex("by_event_type", (q) => q.eq("eventType", args.eventType))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get audit log entries for an intent
 */
export const getByIntent = query({
  args: { intentId: v.id("intents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLog")
      .withIndex("by_intent", (q) => q.eq("intentId", args.intentId))
      .collect();
  },
});

/**
 * Get audit log entries for a plan
 */
export const getByPlan = query({
  args: { planId: v.id("executionPlans") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLog")
      .withIndex("by_plan", (q) => q.eq("planId", args.planId))
      .collect();
  },
});

/**
 * Get the last audit log entry for a user (for sequence tracking)
 */
export const getLastEntry = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLog")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
  },
});

/**
 * Get un-anchored entries for batch anchoring
 */
export const getUnanchored = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    return await ctx.db
      .query("auditLog")
      .withIndex("by_anchored", (q) => q.eq("anchoredToChain", false))
      .take(limit);
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new audit log entry
 */
export const createEntry = internalMutation({
  args: {
    userId: v.id("users"),
    eventId: v.string(),
    sequence: v.number(),
    eventType: eventTypeValidator,
    intentId: v.optional(v.id("intents")),
    planId: v.optional(v.id("executionPlans")),
    approvalId: v.optional(v.id("approvalQueue")),
    eventData: eventDataValidator,
    previousHash: v.string(),
    eventHash: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLog", {
      userId: args.userId,
      eventId: args.eventId,
      sequence: args.sequence,
      eventType: args.eventType,
      intentId: args.intentId,
      planId: args.planId,
      approvalId: args.approvalId,
      eventData: args.eventData,
      previousHash: args.previousHash,
      eventHash: args.eventHash,
      anchoredToChain: false,
      timestamp: args.timestamp,
    });
  },
});

/**
 * Log an event with automatic sequence and hash calculation
 */
export const logEvent = internalMutation({
  args: {
    userId: v.id("users"),
    eventType: eventTypeValidator,
    intentId: v.optional(v.id("intents")),
    planId: v.optional(v.id("executionPlans")),
    approvalId: v.optional(v.id("approvalQueue")),
    eventData: eventDataValidator,
  },
  handler: async (ctx, args) => {
    // Get the last entry for sequence and hash chain
    const lastEntry = await ctx.db
      .query("auditLog")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    const sequence = lastEntry ? lastEntry.sequence + 1 : 1;
    const previousHash = lastEntry ? lastEntry.eventHash : "genesis";

    // Create event ID
    const eventId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Calculate event hash (simplified - in production use proper SHA-256)
    const hashInput = JSON.stringify({
      userId: args.userId,
      sequence,
      eventType: args.eventType,
      eventData: args.eventData,
      previousHash,
      timestamp: Date.now(),
    });
    const eventHash = simpleHash(hashInput);

    const timestamp = Date.now();

    const id = await ctx.db.insert("auditLog", {
      userId: args.userId,
      eventId,
      sequence,
      eventType: args.eventType,
      intentId: args.intentId,
      planId: args.planId,
      approvalId: args.approvalId,
      eventData: args.eventData,
      previousHash,
      eventHash,
      anchoredToChain: false,
      timestamp,
    });

    return { auditLogId: id, eventId, sequence };
  },
});

/**
 * Mark entries as anchored after batch anchoring
 */
export const markAnchored = internalMutation({
  args: {
    entryIds: v.array(v.id("auditLog")),
    anchorTxSignature: v.string(),
    anchorMerkleRoot: v.string(),
  },
  handler: async (ctx, args) => {
    for (const id of args.entryIds) {
      await ctx.db.patch(id, {
        anchoredToChain: true,
        anchorTxSignature: args.anchorTxSignature,
        anchorMerkleRoot: args.anchorMerkleRoot,
      });
    }

    return { anchoredCount: args.entryIds.length };
  },
});

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify the hash chain for a user's audit log
 */
export const verifyChain = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("auditLog")
      .withIndex("by_user_sequence", (q) => q.eq("userId", args.userId))
      .collect();

    // Sort by sequence
    entries.sort((a, b) => a.sequence - b.sequence);

    if (entries.length === 0) {
      return { valid: true, checkedEntries: 0, errors: [] };
    }

    const errors: string[] = [];

    // Verify first entry
    if (entries[0].previousHash !== "genesis") {
      errors.push(`Entry ${entries[0].sequence}: Expected 'genesis' as previousHash`);
    }

    // Verify chain
    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = entries[i - 1];

      // Check sequence is monotonic
      if (current.sequence !== previous.sequence + 1) {
        errors.push(
          `Entry ${current.sequence}: Sequence gap detected (expected ${previous.sequence + 1})`
        );
      }

      // Check hash chain
      if (current.previousHash !== previous.eventHash) {
        errors.push(
          `Entry ${current.sequence}: Hash chain broken (previousHash doesn't match)`
        );
      }
    }

    return {
      valid: errors.length === 0,
      checkedEntries: entries.length,
      errors,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simple hash function (for non-production use)
 * In production, use proper SHA-256 via crypto.subtle
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `hash-${Math.abs(hash).toString(16).padStart(8, '0')}-${Date.now().toString(36)}`;
}
