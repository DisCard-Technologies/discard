/**
 * Cleanup Old Metrics
 *
 * Removes old fraud records, authorizations, and logs based on retention policy.
 * Runs weekly on Sunday at 3:00 AM UTC.
 */
import { internalMutation } from "../_generated/server";

/**
 * Main cron handler
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    console.log("Starting weekly metrics cleanup");

    const stats = {
      fraudRecords: 0,
      authorizations: 0,
      completedIntents: 0,
    };

    // Cleanup fraud records older than 90 days (unless confirmed fraud)
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const oldFraudRecords = await ctx.db
      .query("fraud")
      .filter((q) =>
        q.and(
          q.lt(q.field("analyzedAt"), ninetyDaysAgo),
          q.neq(q.field("userFeedback"), "confirmed_fraud")
        )
      )
      .take(1000); // Process in batches

    for (const record of oldFraudRecords) {
      await ctx.db.delete(record._id);
      stats.fraudRecords++;
    }

    // Cleanup settled authorizations older than 365 days
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

    const oldAuthorizations = await ctx.db
      .query("authorizations")
      .filter((q) =>
        q.and(
          q.lt(q.field("processedAt"), oneYearAgo),
          q.eq(q.field("status"), "settled")
        )
      )
      .take(1000);

    for (const auth of oldAuthorizations) {
      // Also delete associated holds
      const holds = await ctx.db
        .query("authorizationHolds")
        .withIndex("by_authorization", (q) => q.eq("authorizationId", auth._id))
        .collect();

      for (const hold of holds) {
        await ctx.db.delete(hold._id);
      }

      await ctx.db.delete(auth._id);
      stats.authorizations++;
    }

    // Cleanup completed intents older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const oldIntents = await ctx.db
      .query("intents")
      .filter((q) =>
        q.and(
          q.lt(q.field("createdAt"), thirtyDaysAgo),
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "cancelled"),
            q.eq(q.field("status"), "failed")
          )
        )
      )
      .take(1000);

    for (const intent of oldIntents) {
      await ctx.db.delete(intent._id);
      stats.completedIntents++;
    }

    console.log("Metrics cleanup completed:", stats);
  },
});
