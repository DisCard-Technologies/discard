/**
 * Hash-Chained Audit Log Module
 *
 * Provides verifiable audit trail for all safety-related events.
 * Uses hash chaining for tamper detection.
 *
 * Key features:
 * - Monotonic sequence numbers per user
 * - SHA-256 hash chain linking events
 * - Deterministic event hashing with canonical serialization
 * - On-chain Solana anchoring via Merkle root
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
  v.literal("threshold_changed"),
  // Multi-sig approval events
  v.literal("multisig_vote_submitted"),
  v.literal("multisig_threshold_reached"),
  v.literal("multisig_escalated"),
  // Organization membership events
  v.literal("member_added"),
  v.literal("member_removed"),
  v.literal("role_changed")
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
 * Log an event with automatic sequence and hash calculation.
 * Uses deterministic SHA-256 hashing with canonicalized inputs.
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

    const timestamp = Date.now();

    // Calculate deterministic SHA-256 event hash
    const eventHash = await computeEventHash({
      userId: args.userId,
      sequence,
      eventType: args.eventType,
      eventData: args.eventData,
      previousHash,
      timestamp,
    });

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
 * Verify the hash chain for a user's audit log.
 * Recomputes each entry's SHA-256 hash and validates chain integrity.
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

    // Verify each entry's hash and chain linkage
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];

      // Recompute hash to detect tampering
      const recomputedHash = await computeEventHash({
        userId: current.userId,
        sequence: current.sequence,
        eventType: current.eventType,
        eventData: current.eventData,
        previousHash: current.previousHash,
        timestamp: current.timestamp,
      });

      if (recomputedHash !== current.eventHash) {
        errors.push(
          `Entry ${current.sequence}: Hash mismatch (stored hash doesn't match recomputed hash — possible tampering)`
        );
      }

      // Check chain linkage for non-first entries
      if (i > 0) {
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
 * Canonicalize an object for deterministic serialization.
 * Sorts keys recursively so JSON.stringify produces identical output
 * regardless of property insertion order.
 */
function canonicalize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute a deterministic SHA-256 hash for an audit event.
 * Uses canonicalized JSON serialization with sorted keys for reproducibility.
 * Returns a hex-encoded SHA-256 digest.
 */
async function computeEventHash(input: {
  userId: string;
  sequence: number;
  eventType: string;
  eventData: Record<string, unknown>;
  previousHash: string;
  timestamp: number;
}): Promise<string> {
  const canonical = JSON.stringify(canonicalize(input));
  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
