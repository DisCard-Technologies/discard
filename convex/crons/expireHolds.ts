/**
 * Expire Authorization Holds
 *
 * Releases reserved funds from expired authorization holds.
 * Runs every 5 minutes.
 */
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Main cron handler
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();

    // Find expired active holds
    const expiredHolds = await ctx.db
      .query("authorizationHolds")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    if (expiredHolds.length === 0) {
      return;
    }

    console.log(`Expiring ${expiredHolds.length} authorization holds`);

    for (const hold of expiredHolds) {
      try {
        // Update hold status to expired
        await ctx.db.patch(hold._id, {
          status: "expired",
          clearedAt: now,
        });

        // Release reserved balance back to card
        await ctx.runMutation(internal.cards.cards.releaseReservedBalance, {
          cardId: hold.cardId,
          amount: hold.holdAmount,
        });

        // Update associated authorization
        const auth = await ctx.db.get(hold.authorizationId);
        if (auth && auth.status === "approved") {
          await ctx.db.patch(hold.authorizationId, {
            status: "expired",
          });
        }

        console.log(`Expired hold ${hold._id}, released $${(hold.holdAmount / 100).toFixed(2)}`);

      } catch (error) {
        console.error(`Failed to expire hold ${hold._id}:`, error);
      }
    }

    console.log(`Completed expiring ${expiredHolds.length} holds`);
  },
});
