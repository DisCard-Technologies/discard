/**
 * Card Management Module
 *
 * Provides CRUD operations for virtual disposable cards with:
 * - Privacy isolation via card context hashing
 * - Marqeta integration for card provisioning
 * - Balance management with authorization holds
 * - Self-healing card support
 */
import { mutation, query, action, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ============ QUERIES ============

/**
 * List all cards for the authenticated user
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("all"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("frozen"),
      v.literal("deleted")
    )),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    cards: Doc<"cards">[];
    total: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { cards: [], total: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return { cards: [], total: 0 };
    }

    // Build query based on status filter
    let cardsQuery = ctx.db
      .query("cards")
      .withIndex("by_user", (q) => q.eq("userId", user._id));

    // Filter by status if specified (and not "all")
    if (args.status && args.status !== "all") {
      const statusFilter = args.status as "pending" | "active" | "paused" | "frozen" | "reissuing" | "terminated" | "deleted";
      cardsQuery = ctx.db
        .query("cards")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", statusFilter)
        );
    }

    const allCards = await cardsQuery.collect();

    // Filter out deleted cards unless specifically requested
    const filteredCards = args.status === "deleted"
      ? allCards.filter(c => c.status === "deleted")
      : allCards.filter(c => c.status !== "deleted");

    // Apply pagination
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const paginatedCards = filteredCards.slice(offset, offset + limit);

    // Sort by creation date (newest first)
    paginatedCards.sort((a, b) => b.createdAt - a.createdAt);

    return {
      cards: paginatedCards,
      total: filteredCards.length,
    };
  },
});

/**
 * Get a single card by ID
 */
export const get = query({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<Doc<"cards"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return null;

    const card = await ctx.db.get(args.cardId);

    // Verify ownership
    if (!card || card.userId !== user._id) {
      return null;
    }

    return card;
  },
});

/**
 * Get card by card context (for webhook processing)
 */
export const getByCardContext = internalQuery({
  args: {
    cardContext: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"cards"> | null> => {
    return await ctx.db
      .query("cards")
      .withIndex("by_card_context", (q) => q.eq("cardContext", args.cardContext))
      .first();
  },
});

/**
 * Get card by Marqeta token (for webhook processing)
 */
export const getByMarqetaToken = internalQuery({
  args: {
    marqetaCardToken: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"cards"> | null> => {
    return await ctx.db
      .query("cards")
      .withIndex("by_marqeta_token", (q) => q.eq("marqetaCardToken", args.marqetaCardToken))
      .first();
  },
});

/**
 * Get card by ID (internal - for use in internal actions)
 */
export const getCardById = internalQuery({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<Doc<"cards"> | null> => {
    return await ctx.db.get(args.cardId);
  },
});

/**
 * Get active authorization holds for a card
 */
export const getActiveHolds = query({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<Doc<"authorizationHolds">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      return [];
    }

    return await ctx.db
      .query("authorizationHolds")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

/**
 * Get recent transactions for a card
 */
export const getTransactions = query({
  args: {
    cardId: v.id("cards"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"authorizations">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      return [];
    }

    const transactions = await ctx.db
      .query("authorizations")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .order("desc")
      .take(args.limit ?? 50);

    return transactions;
  },
});

// ============ ACTIONS ============

/**
 * Get card secrets (PAN, CVV) from Marqeta
 * Requires authentication and card ownership verification
 */
export const getSecrets = action({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<{
    pan: string;
    cvv: string;
    expirationMonth: number;
    expirationYear: number;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify card ownership
    const card = await ctx.runQuery(internal.cards.cards.getCardById, {
      cardId: args.cardId,
    });

    if (!card) {
      throw new Error("Card not found");
    }

    // Get user to verify ownership
    const user = await ctx.runQuery(internal.auth.passkeys.getByCredentialId, {
      credentialId: identity.subject,
    });

    if (!user || card.userId !== user._id) {
      throw new Error("Unauthorized: card does not belong to user");
    }

    // Fetch secrets from Marqeta
    return await ctx.runAction(internal.cards.marqeta.getCardSecrets, {
      cardId: args.cardId,
    });
  },
});

// ============ MUTATIONS ============

/**
 * Create a new virtual card
 */
export const create = mutation({
  args: {
    spendingLimit: v.optional(v.number()),    // Max per transaction (cents)
    dailyLimit: v.optional(v.number()),       // Max per day (cents)
    monthlyLimit: v.optional(v.number()),     // Max per month (cents)
    nickname: v.optional(v.string()),
    color: v.optional(v.string()),
    blockedMccCodes: v.optional(v.array(v.string())),
    blockedCountries: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"cards">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Generate unique card context for privacy isolation
    const cardContext = await generateCardContext(user._id);

    // Set default limits
    const spendingLimit = args.spendingLimit ?? 100000;  // $1000 default
    const dailyLimit = args.dailyLimit ?? 500000;       // $5000 default
    const monthlyLimit = args.monthlyLimit ?? 2000000;  // $20000 default

    // Create card record in pending state
    const cardId = await ctx.db.insert("cards", {
      userId: user._id,
      cardContext,
      last4: "0000",  // Will be updated after Marqeta provisioning
      expirationMonth: 0,
      expirationYear: 0,
      cardType: "virtual",
      spendingLimit,
      dailyLimit,
      monthlyLimit,
      currentBalance: 0,
      reservedBalance: 0,
      overdraftLimit: 0,
      status: "pending",
      blockedMccCodes: args.blockedMccCodes,
      blockedCountries: args.blockedCountries,
      privacyIsolated: user.privacySettings.transactionIsolation,
      nickname: args.nickname,
      color: args.color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule Marqeta card provisioning
    await ctx.scheduler.runAfter(0, internal.cards.marqeta.provisionCard, {
      cardId,
      userId: user._id,
    });

    return cardId;
  },
});

/**
 * Update card status (pause/unpause)
 */
export const updateStatus = mutation({
  args: {
    cardId: v.id("cards"),
    status: v.union(
      v.literal("active"),
      v.literal("paused")
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const card = await ctx.db.get(args.cardId);

    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    // Cannot change status of terminated/deleted cards
    if (card.status === "terminated" || card.status === "deleted") {
      throw new Error("Cannot update status of terminated card");
    }

    // Cannot change status of cards being reissued
    if (card.status === "reissuing") {
      throw new Error("Cannot update status while card is being reissued");
    }

    await ctx.db.patch(args.cardId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    // Sync status with Marqeta if card is provisioned
    if (card.marqetaCardToken) {
      await ctx.scheduler.runAfter(0, internal.cards.marqeta.syncCardStatus, {
        cardId: args.cardId,
        status: args.status,
      });
    }
  },
});

/**
 * Freeze card (security action)
 */
export const freeze = mutation({
  args: {
    cardId: v.id("cards"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const card = await ctx.db.get(args.cardId);

    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    await ctx.db.patch(args.cardId, {
      status: "frozen",
      updatedAt: Date.now(),
    });

    // Sync with Marqeta
    if (card.marqetaCardToken) {
      await ctx.scheduler.runAfter(0, internal.cards.marqeta.suspendCard, {
        cardId: args.cardId,
        reason: args.reason,
      });
    }

    console.log(`Card ${args.cardId} frozen: ${args.reason}`);
  },
});

/**
 * Unfreeze card
 */
export const unfreeze = mutation({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const card = await ctx.db.get(args.cardId);

    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    if (card.status !== "frozen") {
      throw new Error("Card is not frozen");
    }

    await ctx.db.patch(args.cardId, {
      status: "active",
      updatedAt: Date.now(),
    });

    // Sync with Marqeta
    if (card.marqetaCardToken) {
      await ctx.scheduler.runAfter(0, internal.cards.marqeta.activateCard, {
        cardId: args.cardId,
      });
    }
  },
});

/**
 * Delete card (soft delete with cryptographic proof)
 */
export const deleteCard = mutation({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<{
    deletionProof: string;
    deletedAt: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const card = await ctx.db.get(args.cardId);

    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    // Cannot delete cards with active holds
    const activeHolds = await ctx.db
      .query("authorizationHolds")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    if (activeHolds.length > 0) {
      throw new Error("Cannot delete card with active authorization holds");
    }

    // Generate deletion proof
    const deletedAt = Date.now();
    const deletionProof = generateDeletionProof(card.cardContext, deletedAt);

    // Soft delete
    await ctx.db.patch(args.cardId, {
      status: "deleted",
      updatedAt: deletedAt,
    });

    // Terminate card in Marqeta
    if (card.marqetaCardToken) {
      await ctx.scheduler.runAfter(0, internal.cards.marqeta.terminateCard, {
        cardId: args.cardId,
      });
    }

    return {
      deletionProof,
      deletedAt,
    };
  },
});

/**
 * Update card restrictions (MCC codes, countries)
 */
export const updateRestrictions = mutation({
  args: {
    cardId: v.id("cards"),
    allowedMccCodes: v.optional(v.array(v.string())),
    blockedMccCodes: v.optional(v.array(v.string())),
    blockedCountries: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const card = await ctx.db.get(args.cardId);

    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    await ctx.db.patch(args.cardId, {
      ...(args.allowedMccCodes !== undefined && { allowedMccCodes: args.allowedMccCodes }),
      ...(args.blockedMccCodes !== undefined && { blockedMccCodes: args.blockedMccCodes }),
      ...(args.blockedCountries !== undefined && { blockedCountries: args.blockedCountries }),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update card limits
 */
export const updateLimits = mutation({
  args: {
    cardId: v.id("cards"),
    spendingLimit: v.optional(v.number()),
    dailyLimit: v.optional(v.number()),
    monthlyLimit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const card = await ctx.db.get(args.cardId);

    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    await ctx.db.patch(args.cardId, {
      ...(args.spendingLimit !== undefined && { spendingLimit: args.spendingLimit }),
      ...(args.dailyLimit !== undefined && { dailyLimit: args.dailyLimit }),
      ...(args.monthlyLimit !== undefined && { monthlyLimit: args.monthlyLimit }),
      updatedAt: Date.now(),
    });
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Create a card without auth context (for bulk provisioning scripts)
 */
export const createCardInternal = internalMutation({
  args: {
    userId: v.id("users"),
    spendingLimit: v.optional(v.number()),
    dailyLimit: v.optional(v.number()),
    monthlyLimit: v.optional(v.number()),
    nickname: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"cards">> => {
    // Get user to check privacy settings
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Generate unique card context for privacy isolation
    const cardContext = await generateCardContext(args.userId);

    // Set default limits
    const spendingLimit = args.spendingLimit ?? 100000;  // $1000 default
    const dailyLimit = args.dailyLimit ?? 500000;       // $5000 default
    const monthlyLimit = args.monthlyLimit ?? 2000000;  // $20000 default

    // Create card record in pending state
    const cardId = await ctx.db.insert("cards", {
      userId: args.userId,
      cardContext,
      last4: "0000",
      expirationMonth: 0,
      expirationYear: 0,
      cardType: "virtual",
      spendingLimit,
      dailyLimit,
      monthlyLimit,
      currentBalance: 0,
      reservedBalance: 0,
      overdraftLimit: 0,
      status: "pending",
      privacyIsolated: user.privacySettings?.transactionIsolation ?? true,
      nickname: args.nickname ?? "Default Card",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return cardId;
  },
});

/**
 * Update card after Marqeta provisioning
 */
export const updateFromMarqeta = internalMutation({
  args: {
    cardId: v.id("cards"),
    marqetaCardToken: v.string(),
    marqetaUserToken: v.string(),
    last4: v.string(),
    expirationMonth: v.number(),
    expirationYear: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.cardId, {
      marqetaCardToken: args.marqetaCardToken,
      marqetaUserToken: args.marqetaUserToken,
      last4: args.last4,
      expirationMonth: args.expirationMonth,
      expirationYear: args.expirationYear,
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update card balance (called by funding module)
 */
export const updateBalance = internalMutation({
  args: {
    cardId: v.id("cards"),
    amount: v.number(),        // Amount to add (can be negative)
  },
  handler: async (ctx, args): Promise<void> => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const newBalance = card.currentBalance + args.amount;
    if (newBalance < 0) {
      throw new Error("Insufficient balance");
    }

    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Reserve balance for authorization
 */
export const reserveBalance = internalMutation({
  args: {
    cardId: v.id("cards"),
    amount: v.number(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return false;

    const availableBalance = card.currentBalance + card.overdraftLimit - card.reservedBalance;
    if (availableBalance < args.amount) {
      return false;
    }

    await ctx.db.patch(args.cardId, {
      reservedBalance: card.reservedBalance + args.amount,
      currentBalance: card.currentBalance - args.amount,
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Release reserved balance
 */
export const releaseReservedBalance = internalMutation({
  args: {
    cardId: v.id("cards"),
    amount: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return;

    await ctx.db.patch(args.cardId, {
      reservedBalance: Math.max(0, card.reservedBalance - args.amount),
      currentBalance: card.currentBalance + args.amount,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark card as reissuing (self-healing)
 */
export const markReissuing = internalMutation({
  args: {
    cardId: v.id("cards"),
    breachSource: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.cardId, {
      status: "reissuing",
      breachDetectedAt: Date.now(),
      breachSource: args.breachSource,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Link reissued cards
 */
export const linkReissuedCard = internalMutation({
  args: {
    oldCardId: v.id("cards"),
    newCardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Update old card
    await ctx.db.patch(args.oldCardId, {
      reissuedTo: args.newCardId,
      status: "terminated",
      updatedAt: Date.now(),
    });

    // Update new card
    await ctx.db.patch(args.newCardId, {
      reissuedFrom: args.oldCardId,
    });
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Generate a unique card context for privacy isolation
 */
async function generateCardContext(userId: Id<"users">): Promise<string> {
  // Create a unique context by combining:
  // - User ID
  // - Current timestamp
  // - Random bytes

  const randomPart = Array.from(
    { length: 16 },
    () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");

  const timestamp = Date.now().toString(16);
  const userPart = userId.toString().slice(-8);

  // This would be SHA-256 hashed in production
  return `ctx_${userPart}_${timestamp}_${randomPart}`;
}

/**
 * Generate cryptographic deletion proof
 */
function generateDeletionProof(cardContext: string, deletedAt: number): string {
  // In production, this would be a proper cryptographic proof
  // using HMAC or digital signature

  const data = `${cardContext}:${deletedAt}`;
  const proofBytes = Array.from(data)
    .map((c, i) => ((c.charCodeAt(0) + i) % 256).toString(16).padStart(2, "0"))
    .join("");

  return `proof_${proofBytes.slice(0, 64)}`;
}
