/**
 * DisCard 2035 - Convex Agent Registry Functions
 *
 * Server-side queries and mutations for AI agent CRUD.
 * All sensitive data arrives pre-encrypted from the client.
 * Convex only sees opaque E2EE blobs, commitment hashes, and status.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";

// ============================================================================
// Validators
// ============================================================================

const agentStatusValidator = v.union(
  v.literal("creating"),
  v.literal("active"),
  v.literal("suspended"),
  v.literal("revoked")
);

const sessionStatusValidator = v.union(
  v.literal("completed"),
  v.literal("failed"),
  v.literal("reverted")
);

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all agents for a user
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get active agents for a user
 */
export const getActiveByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .collect();
  },
});

/**
 * Get a single agent by agentId
 */
export const getByAgentId = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});

/**
 * Verify a commitment hash exists in the registry
 */
export const verifyCommitment = query({
  args: {
    commitmentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_commitment", (q) =>
        q.eq("commitmentHash", args.commitmentHash)
      )
      .first();
    return agent !== null;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new agent record
 *
 * Called during agent creation flow. Record is pre-encrypted on client.
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    agentId: v.string(),
    encryptedRecord: v.string(),
    commitmentHash: v.string(),
    permissionsHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate agentId
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (existing) {
      throw new Error(`Agent ${args.agentId} already exists`);
    }

    const now = Date.now();

    const id = await ctx.db.insert("agents", {
      userId: args.userId,
      agentId: args.agentId,
      encryptedRecord: args.encryptedRecord,
      commitmentHash: args.commitmentHash,
      permissionsHash: args.permissionsHash,
      status: "creating",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Activate an agent after setup is complete
 *
 * Called after compressed account and session key are created.
 */
export const activate = mutation({
  args: {
    agentId: v.string(),
    compressedAccountId: v.optional(v.id("compressedAccounts")),
    sessionKeyId: v.optional(v.string()),
    turnkeyPolicyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error(`Agent ${args.agentId} not found`);
    }

    if (agent.status !== "creating") {
      throw new Error(`Agent ${args.agentId} is not in creating state`);
    }

    await ctx.db.patch(agent._id, {
      status: "active",
      compressedAccountId: args.compressedAccountId,
      sessionKeyId: args.sessionKeyId,
      turnkeyPolicyId: args.turnkeyPolicyId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update an agent's encrypted record and commitment
 *
 * Called when permissions change. Invalidates cached proof.
 */
export const updateRecord = mutation({
  args: {
    agentId: v.string(),
    encryptedRecord: v.string(),
    commitmentHash: v.string(),
    permissionsHash: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error(`Agent ${args.agentId} not found`);
    }

    await ctx.db.patch(agent._id, {
      encryptedRecord: args.encryptedRecord,
      commitmentHash: args.commitmentHash,
      permissionsHash: args.permissionsHash,
      // Invalidate cached proof on permission change
      cachedProof: undefined,
      cachedProofMerkleRoot: undefined,
      proofGeneratedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Cache a pre-computed Groth16 proof
 */
export const cacheProof = mutation({
  args: {
    agentId: v.string(),
    cachedProof: v.string(),
    merkleRoot: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error(`Agent ${args.agentId} not found`);
    }

    await ctx.db.patch(agent._id, {
      cachedProof: args.cachedProof,
      cachedProofMerkleRoot: args.merkleRoot,
      proofGeneratedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Suspend an agent (temporarily disable)
 */
export const suspend = mutation({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error(`Agent ${args.agentId} not found`);
    }

    if (agent.status === "revoked") {
      throw new Error(`Cannot suspend a revoked agent`);
    }

    await ctx.db.patch(agent._id, {
      status: "suspended",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Revoke an agent (permanently disable)
 */
export const revoke = mutation({
  args: {
    agentId: v.string(),
    revocationNullifier: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error(`Agent ${args.agentId} not found`);
    }

    await ctx.db.patch(agent._id, {
      status: "revoked",
      revocationNullifier: args.revocationNullifier,
      // Clear sensitive references
      sessionKeyId: undefined,
      turnkeyPolicyId: undefined,
      cachedProof: undefined,
      cachedProofMerkleRoot: undefined,
      proofGeneratedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Log an agent operation to the encrypted audit trail
 *
 * Checks nullifier uniqueness to prevent replay.
 */
export const logOperation = mutation({
  args: {
    agentId: v.string(),
    userId: v.id("users"),
    encryptedOperation: v.string(),
    operationNullifier: v.string(),
    status: sessionStatusValidator,
  },
  handler: async (ctx, args) => {
    // Check for nullifier replay
    const existing = await ctx.db
      .query("agentSessions")
      .withIndex("by_nullifier", (q) =>
        q.eq("operationNullifier", args.operationNullifier)
      )
      .first();

    if (existing) {
      throw new Error("Replay detected: nullifier already used");
    }

    await ctx.db.insert("agentSessions", {
      agentId: args.agentId,
      userId: args.userId,
      encryptedOperation: args.encryptedOperation,
      operationNullifier: args.operationNullifier,
      status: args.status,
      createdAt: Date.now(),
    });
  },
});

// ============================================================================
// Internal Queries (for server-side use)
// ============================================================================

/**
 * Internal: get agent by agentId (for actions)
 */
export const getAgentInternal = internalQuery({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});

/**
 * Internal: update agent status
 */
export const updateStatusInternal = internalMutation({
  args: {
    agentId: v.string(),
    status: agentStatusValidator,
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error(`Agent ${args.agentId} not found`);
    }

    await ctx.db.patch(agent._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
