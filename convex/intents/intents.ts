/**
 * Intent Management Module
 *
 * Handles the Command Bar UX where users submit natural language intents
 * that are parsed by Claude AI and executed as blockchain transactions.
 *
 * Pipeline:
 * User Input → Create Intent → Parse (Claude) → Preview → Approve → Build Tx → Sign → Submit
 */
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ============ QUERIES ============

/**
 * List intents for the authenticated user
 * Accepts optional userId for apps without Convex auth configured
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("all"),
      v.literal("pending"),
      v.literal("clarifying"),
      v.literal("ready"),
      v.literal("completed"),
      v.literal("failed")
    )),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<Doc<"intents">[]> => {
    // Try Convex auth first
    const identity = await ctx.auth.getUserIdentity();
    let user: Doc<"users"> | null = null;

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
    }

    // Fallback to userId argument if auth not available
    if (!user && args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) return [];

    let intentsQuery = ctx.db
      .query("intents")
      .withIndex("by_user", (q) => q.eq("userId", user._id));

    const allIntents = await intentsQuery.collect();

    // Filter by status if specified
    let filtered = allIntents;
    if (args.status && args.status !== "all") {
      filtered = allIntents.filter((i) => i.status === args.status);
    }

    // Sort by creation date (newest first) and apply limit
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    return filtered.slice(0, args.limit ?? 50);
  },
});

/**
 * Get a single intent by ID
 * Accepts optional userId for apps without Convex auth configured
 */
export const get = query({
  args: {
    intentId: v.id("intents"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<Doc<"intents"> | null> => {
    // Try Convex auth first
    const identity = await ctx.auth.getUserIdentity();
    let user: Doc<"users"> | null = null;

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
    }

    // Fallback to userId argument if auth not available
    if (!user && args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) return null;

    const intent = await ctx.db.get(args.intentId);

    if (!intent || intent.userId !== user._id) {
      return null;
    }

    return intent;
  },
});

/**
 * Get intents that need user clarification
 */
export const pending = query({
  args: {},
  handler: async (ctx): Promise<Doc<"intents">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    return await ctx.db
      .query("intents")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "clarifying")
      )
      .collect();
  },
});

/**
 * Get intents ready for approval
 */
export const ready = query({
  args: {},
  handler: async (ctx): Promise<Doc<"intents">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    return await ctx.db
      .query("intents")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "ready")
      )
      .collect();
  },
});

// ============ INTERNAL QUERIES ============

/**
 * Get intent by ID (internal)
 */
export const getById = internalQuery({
  args: {
    intentId: v.id("intents"),
  },
  handler: async (ctx, args): Promise<Doc<"intents"> | null> => {
    return await ctx.db.get(args.intentId);
  },
});

/**
 * Get recent intents for conversation history (internal)
 * Returns the most recent completed/clarifying intents for context
 */
export const getRecentForContext = internalQuery({
  args: {
    userId: v.id("users"),
    excludeIntentId: v.optional(v.id("intents")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"intents">[]> => {
    const allIntents = await ctx.db
      .query("intents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Filter to only include intents with useful context
    // (completed conversations or clarifying interactions)
    const relevantIntents = allIntents.filter((intent) => {
      // Exclude the current intent being processed
      if (args.excludeIntentId && intent._id === args.excludeIntentId) {
        return false;
      }
      // Include completed intents (have responses)
      if (intent.status === "completed" && intent.responseText) {
        return true;
      }
      // Include clarifying intents (have questions)
      if (intent.status === "clarifying" && intent.clarificationQuestion) {
        return true;
      }
      return false;
    });

    // Sort by creation date (newest first) and limit
    relevantIntents.sort((a, b) => b.createdAt - a.createdAt);
    return relevantIntents.slice(0, args.limit ?? 5);
  },
});

// ============ MUTATIONS ============

/**
 * Create a new intent from natural language input
 */
export const create = mutation({
  args: {
    rawText: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Id<"intents">> => {
    // Look up user directly by ID
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Validate input
    const trimmedText = args.rawText.trim();
    if (trimmedText.length < 3) {
      throw new Error("Intent text too short");
    }

    if (trimmedText.length > 500) {
      throw new Error("Intent text too long");
    }

    // Create intent in pending state
    const intentId = await ctx.db.insert("intents", {
      userId: user._id,
      rawText: trimmedText,
      status: "pending",
      createdAt: Date.now(),
    });

    // Schedule AI parsing
    await ctx.scheduler.runAfter(0, internal.intents.solver.parseIntent, {
      intentId,
    });

    return intentId;
  },
});

/**
 * Provide clarification for an intent
 */
export const clarify = mutation({
  args: {
    intentId: v.id("intents"),
    clarificationResponse: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const intent = await ctx.db.get(args.intentId);

    if (!intent || intent.userId !== user._id) {
      throw new Error("Intent not found");
    }

    if (intent.status !== "clarifying") {
      throw new Error("Intent is not awaiting clarification");
    }

    // Update with clarification and re-parse
    await ctx.db.patch(args.intentId, {
      clarificationResponse: args.clarificationResponse,
      status: "pending", // Back to pending for re-parsing
    });

    // Schedule re-parsing with clarification
    await ctx.scheduler.runAfter(0, internal.intents.solver.parseIntent, {
      intentId: args.intentId,
    });
  },
});

/**
 * Approve an intent for execution
 */
export const approve = mutation({
  args: {
    intentId: v.id("intents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const intent = await ctx.db.get(args.intentId);

    if (!intent || intent.userId !== user._id) {
      throw new Error("Intent not found");
    }

    if (intent.status !== "ready") {
      throw new Error("Intent is not ready for approval");
    }

    // Mark as approved
    await ctx.db.patch(args.intentId, {
      status: "approved",
      approvedAt: Date.now(),
    });

    // Schedule execution
    await ctx.scheduler.runAfter(0, internal.intents.executor.execute, {
      intentId: args.intentId,
    });
  },
});

/**
 * Cancel an intent
 */
export const cancel = mutation({
  args: {
    intentId: v.id("intents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const intent = await ctx.db.get(args.intentId);

    if (!intent || intent.userId !== user._id) {
      throw new Error("Intent not found");
    }

    // Can't cancel while executing
    if (intent.status === "executing") {
      throw new Error("Cannot cancel intent while executing");
    }

    // For completed/cancelled/failed intents, just return silently (no-op)
    if (intent.status === "completed" || intent.status === "cancelled" || intent.status === "failed") {
      return;
    }

    await ctx.db.patch(args.intentId, {
      status: "cancelled",
    });
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Update intent status (called by solver and executor)
 */
export const updateStatus = internalMutation({
  args: {
    intentId: v.id("intents"),
    status: v.union(
      v.literal("pending"),
      v.literal("parsing"),
      v.literal("clarifying"),
      v.literal("ready"),
      v.literal("approved"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    parsedIntent: v.optional(v.object({
      action: v.union(
        v.literal("fund_card"),
        v.literal("swap"),
        v.literal("transfer"),
        v.literal("withdraw_defi"),
        v.literal("create_card"),
        v.literal("freeze_card"),
        v.literal("delete_card"),
        v.literal("pay_bill")
      ),
      sourceType: v.union(
        v.literal("wallet"),
        v.literal("defi_position"),
        v.literal("card"),
        v.literal("external")
      ),
      sourceId: v.optional(v.string()),
      targetType: v.union(
        v.literal("card"),
        v.literal("wallet"),
        v.literal("external")
      ),
      targetId: v.optional(v.string()),
      amount: v.optional(v.number()),
      currency: v.optional(v.string()),
      metadata: v.optional(v.any()),
    })),
    clarificationQuestion: v.optional(v.string()),
    responseText: v.optional(v.string()),
    solanaTransactionSignature: v.optional(v.string()),
    solanaInstructions: v.optional(v.array(v.any())),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const updates: any = {
      status: args.status,
    };

    if (args.parsedIntent !== undefined) {
      updates.parsedIntent = args.parsedIntent;
      updates.parsedAt = Date.now();
    }

    if (args.clarificationQuestion !== undefined) {
      updates.clarificationQuestion = args.clarificationQuestion;
    }

    if (args.responseText !== undefined) {
      updates.responseText = args.responseText;
    }

    if (args.solanaTransactionSignature !== undefined) {
      updates.solanaTransactionSignature = args.solanaTransactionSignature;
    }

    if (args.solanaInstructions !== undefined) {
      updates.solanaInstructions = args.solanaInstructions;
    }

    if (args.errorMessage !== undefined) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.errorCode !== undefined) {
      updates.errorCode = args.errorCode;
    }

    if (args.status === "completed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(args.intentId, updates);
  },
});
