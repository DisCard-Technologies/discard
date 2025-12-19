/**
 * Self-Healing Card Check
 *
 * Checks for breached merchants and triggers card reissue.
 * Runs hourly at :30.
 */
import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Main cron handler
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    // Get active cards that haven't been checked recently
    const cardsToCheck = await ctx.db
      .query("cards")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    if (cardsToCheck.length === 0) {
      return;
    }

    console.log(`Checking ${cardsToCheck.length} cards for breach exposure`);

    // Schedule breach check
    await ctx.scheduler.runAfter(0, internal.crons.selfHealingCheck.checkBreaches, {
      cardIds: cardsToCheck.map((c) => c._id),
    });
  },
});

/**
 * Check cards against breach database
 */
export const checkBreaches = internalAction({
  args: {
    cardIds: v.array(v.id("cards")),
  },
  handler: async (ctx, args): Promise<void> => {
    // Get recent transactions for each card
    const breachedCards: Array<{ cardId: string; breachSource: string }> = [];

    for (const cardId of args.cardIds) {
      try {
        // Get recent merchants for this card
        const recentAuths = await ctx.runQuery(internal.crons.selfHealingCheck.getRecentAuthorizations, {
          cardId,
        });

        if (recentAuths.length === 0) continue;

        // Check each merchant against breach database
        for (const auth of recentAuths) {
          const isBreached = await checkMerchantBreach(auth.merchantName, auth.merchantMcc);

          if (isBreached) {
            breachedCards.push({
              cardId: cardId.toString(),
              breachSource: `Merchant breach: ${auth.merchantName}`,
            });
            break; // One breach is enough to trigger reissue
          }
        }

      } catch (error) {
        console.error(`Failed to check card ${cardId} for breaches:`, error);
      }
    }

    // Trigger reissue for breached cards
    if (breachedCards.length > 0) {
      console.log(`Found ${breachedCards.length} cards exposed to breaches`);

      for (const { cardId, breachSource } of breachedCards) {
        await ctx.runMutation(internal.crons.selfHealingCheck.triggerReissue, {
          cardId: cardId as any,
          breachSource,
        });
      }
    }
  },
});

/**
 * Get recent authorizations for a card
 */
export const getRecentAuthorizations = internalQuery({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return await ctx.db
      .query("authorizations")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) =>
        q.and(
          q.gte(q.field("processedAt"), thirtyDaysAgo),
          q.eq(q.field("status"), "settled")
        )
      )
      .collect();
  },
});

/**
 * Trigger card reissue
 */
export const triggerReissue = internalMutation({
  args: {
    cardId: v.id("cards"),
    breachSource: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return;

    // Don't reissue if already being reissued
    if (card.status === "reissuing") return;

    console.log(`Triggering self-healing reissue for card ${args.cardId}`);

    // Mark card as reissuing
    await ctx.db.patch(args.cardId, {
      status: "reissuing",
      breachDetectedAt: Date.now(),
      breachSource: args.breachSource,
      updatedAt: Date.now(),
    });

    // Create new card with same limits
    const newCardId = await ctx.db.insert("cards", {
      userId: card.userId,
      cardContext: await generateNewCardContext(card.userId),
      last4: "0000",
      expirationMonth: 0,
      expirationYear: 0,
      cardType: "virtual",
      spendingLimit: card.spendingLimit,
      dailyLimit: card.dailyLimit,
      monthlyLimit: card.monthlyLimit,
      currentBalance: card.currentBalance, // Transfer balance
      reservedBalance: 0,
      overdraftLimit: card.overdraftLimit,
      status: "pending",
      blockedMccCodes: card.blockedMccCodes,
      blockedCountries: card.blockedCountries,
      privacyIsolated: card.privacyIsolated,
      nickname: card.nickname ? `${card.nickname} (Reissued)` : undefined,
      color: card.color,
      reissuedFrom: args.cardId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Link cards
    await ctx.db.patch(args.cardId, {
      reissuedTo: newCardId,
      currentBalance: 0, // Balance transferred to new card
    });

    // Schedule Marqeta provisioning for new card
    await ctx.scheduler.runAfter(0, internal.cards.marqeta.provisionCard, {
      cardId: newCardId,
      userId: card.userId,
    });

    console.log(`Created replacement card ${newCardId} for breached card ${args.cardId}`);
  },
});

/**
 * Check if merchant has been breached
 * This is a placeholder - actual implementation would check breach databases
 */
async function checkMerchantBreach(merchantName: string, _merchantMcc: string): Promise<boolean> {
  // Known breached merchants (example - in production, use actual breach database)
  const breachedMerchants: string[] = [
    // This would be populated from Have I Been Pwned API, vendor breach notifications, etc.
  ];

  // Check against breach list
  const normalizedName = merchantName.toLowerCase().trim();

  for (const breached of breachedMerchants) {
    if (normalizedName.includes(breached.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Generate new card context
 */
async function generateNewCardContext(userId: any): Promise<string> {
  const randomPart = Array.from(
    { length: 16 },
    () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");

  const timestamp = Date.now().toString(16);
  const userPart = userId.toString().slice(-8);

  return `ctx_${userPart}_${timestamp}_${randomPart}`;
}
