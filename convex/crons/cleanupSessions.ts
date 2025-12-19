/**
 * Cleanup Wallet Sessions
 *
 * Removes expired wallet connection sessions.
 * Runs daily at 4:00 AM UTC.
 */
import { internalMutation } from "../_generated/server";

/**
 * Main cron handler
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();

    // Find expired wallet sessions
    const expiredSessions = await ctx.db
      .query("wallets")
      .filter((q) =>
        q.and(
          q.eq(q.field("connectionStatus"), "connected"),
          q.neq(q.field("sessionExpiry"), undefined),
          q.lt(q.field("sessionExpiry"), now)
        )
      )
      .collect();

    if (expiredSessions.length === 0) {
      console.log("No expired wallet sessions to cleanup");
      return;
    }

    console.log(`Cleaning up ${expiredSessions.length} expired wallet sessions`);

    for (const wallet of expiredSessions) {
      try {
        await ctx.db.patch(wallet._id, {
          connectionStatus: "expired",
          encryptedPrivateData: undefined, // Clear session data
          wcTopic: undefined, // Clear WalletConnect topic
        });

        console.log(`Expired wallet session ${wallet._id} (${wallet.walletType})`);

      } catch (error) {
        console.error(`Failed to cleanup wallet ${wallet._id}:`, error);
      }
    }

    // Also cleanup wallets that have been disconnected for over 30 days
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const oldDisconnectedWallets = await ctx.db
      .query("wallets")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("connectionStatus"), "disconnected"),
            q.eq(q.field("connectionStatus"), "expired")
          ),
          q.lt(q.field("lastUsedAt"), thirtyDaysAgo)
        )
      )
      .collect();

    if (oldDisconnectedWallets.length > 0) {
      console.log(`Found ${oldDisconnectedWallets.length} old disconnected wallets`);
      // Note: We don't delete these, just log them
      // Actual deletion would require user consent
    }

    console.log("Session cleanup completed");
  },
});
