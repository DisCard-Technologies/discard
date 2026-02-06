/**
 * Push Notification Sending
 *
 * Actions for sending notifications via Expo Push API.
 * Handles formatting, delivery, and logging for all notification types.
 */
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

// Expo Push API configuration
const EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";

// ============================================================================
// Types
// ============================================================================

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error: string };
}

type NotificationType = "crypto_receipt" | "goal_milestone" | "agent_activity" | "fraud_alert" | "private_transfer" | "system";

// ============================================================================
// Internal Actions - Main Send Functions
// ============================================================================

/**
 * Send a notification to all active devices for a user
 * This is the main entry point for sending notifications
 */
export const sendToUser = internalAction({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("crypto_receipt"),
      v.literal("goal_milestone"),
      v.literal("agent_activity"),
      v.literal("fraud_alert"),
      v.literal("private_transfer"),
      v.literal("system")
    ),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    sourceType: v.optional(v.union(
      v.literal("transaction"),
      v.literal("funding"),
      v.literal("goal"),
      v.literal("fraud"),
      v.literal("agent"),
      v.literal("system")
    )),
    sourceId: v.optional(v.string()),
  },
  returns: v.object({
    sent: v.number(),
    failed: v.optional(v.number()),
    filtered: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<{ sent: number; failed?: number; filtered?: number }> => {
    // Get all active tokens for the user
    const tokens: Doc<"pushTokens">[] = await ctx.runQuery(internal.notifications.tokens.getActiveTokensForUser, {
      userId: args.userId,
    });

    if (tokens.length === 0) {
      console.log("[Notifications] No active tokens for user:", args.userId);
      // Log as filtered (no devices to send to)
      await ctx.runMutation(internal.notifications.send.logNotification, {
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        data: args.data,
        status: "filtered",
        sourceType: args.sourceType,
        sourceId: args.sourceId,
      });
      return { sent: 0, filtered: 1 };
    }

    // Check preferences and filter tokens
    const preferenceKey = getPreferenceKey(args.type);
    const eligibleTokens = tokens.filter((token) => {
      // Fraud alerts always go through
      if (args.type === "fraud_alert") return true;
      // Check user preference
      return token.preferences[preferenceKey as keyof typeof token.preferences];
    });

    if (eligibleTokens.length === 0) {
      console.log("[Notifications] All tokens filtered by preferences for:", args.type);
      await ctx.runMutation(internal.notifications.send.logNotification, {
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        data: args.data,
        status: "filtered",
        sourceType: args.sourceType,
        sourceId: args.sourceId,
      });
      return { sent: 0, filtered: tokens.length };
    }

    // Build notification messages
    const messages: ExpoPushMessage[] = eligibleTokens.map((token) => ({
      to: token.expoPushToken,
      title: args.title,
      body: args.body,
      data: args.data ?? {},
      sound: "default",
      channelId: args.type === "fraud_alert" ? "fraud_alerts" : "default",
      priority: args.type === "fraud_alert" ? "high" : "default",
      ttl: 86400, // 24 hours
    }));

    // Send to Expo Push API
    try {
      const response = await fetch(EXPO_PUSH_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Notifications] Expo API error:", response.status, errorText);

        // Log failure
        await ctx.runMutation(internal.notifications.send.logNotification, {
          userId: args.userId,
          type: args.type,
          title: args.title,
          body: args.body,
          data: args.data,
          status: "failed",
          errorMessage: `Expo API error: ${response.status}`,
          sourceType: args.sourceType,
          sourceId: args.sourceId,
        });

        return { sent: 0, failed: eligibleTokens.length };
      }

      const result = await response.json();
      const tickets: ExpoPushTicket[] = result.data || [];

      // Process tickets and log results
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const token = eligibleTokens[i];

        if (ticket.status === "ok" && ticket.id) {
          sent++;
          // Update last used timestamp
          await ctx.runMutation(internal.notifications.tokens.updateLastUsed, {
            tokenId: token._id,
          });
        } else {
          failed++;
          // Check for invalid token errors
          if (ticket.details?.error === "DeviceNotRegistered") {
            await ctx.runMutation(internal.notifications.tokens.markInvalid, {
              expoPushToken: token.expoPushToken,
            });
          }
        }
      }

      // Log the notification
      const firstTicket = tickets.find((t) => t.status === "ok");
      await ctx.runMutation(internal.notifications.send.logNotification, {
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        data: args.data,
        status: sent > 0 ? "sent" : "failed",
        expoTicketId: firstTicket?.id,
        errorMessage: sent === 0 ? "All deliveries failed" : undefined,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
      });

      console.log(`[Notifications] Sent: ${sent}, Failed: ${failed} for user:`, args.userId);
      return { sent, failed };
    } catch (error) {
      console.error("[Notifications] Send error:", error);

      await ctx.runMutation(internal.notifications.send.logNotification, {
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        data: args.data,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        sourceType: args.sourceType,
        sourceId: args.sourceId,
      });

      return { sent: 0, failed: eligibleTokens.length };
    }
  },
});

// ============================================================================
// Notification Type Actions - Formatted notifications
// ============================================================================

/**
 * Send a crypto receipt notification (inbound funds)
 */
export const sendCryptoReceipt = internalAction({
  args: {
    userId: v.id("users"),
    transactionType: v.union(
      v.literal("receive"),
      v.literal("deposit"),
      v.literal("funding")
    ),
    tokenSymbol: v.string(),
    amount: v.number(),
    amountUsd: v.optional(v.number()),
    signature: v.optional(v.string()),
    source: v.optional(v.string()), // "moonpay", "iban", "wallet"
  },
  returns: v.object({
    sent: v.number(),
    failed: v.optional(v.number()),
    filtered: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<{ sent: number; failed?: number; filtered?: number }> => {
    // Format amount for display
    const formattedAmount = formatAmount(args.amount, args.tokenSymbol);
    const usdDisplay = args.amountUsd
      ? ` ($${(args.amountUsd / 100).toFixed(2)})`
      : "";

    // Build title and body based on transaction type
    let title: string;
    let body: string;

    switch (args.transactionType) {
      case "receive":
        title = `Received ${args.tokenSymbol}`;
        body = `You received ${formattedAmount}${usdDisplay}`;
        break;
      case "deposit":
        title = "Deposit Completed";
        body = `${formattedAmount}${usdDisplay} has been added to your wallet`;
        break;
      case "funding":
        title = "Funds Added";
        body = `${formattedAmount}${usdDisplay} from ${args.source ?? "external source"}`;
        break;
    }

    return await ctx.runAction(internal.notifications.send.sendToUser, {
      userId: args.userId,
      type: "crypto_receipt",
      title,
      body,
      data: {
        screen: "wallet",
        signature: args.signature,
        tokenSymbol: args.tokenSymbol,
      },
      sourceType: "transaction",
      sourceId: args.signature,
    });
  },
});

/**
 * Send a goal milestone notification
 */
export const sendGoalMilestone = internalAction({
  args: {
    userId: v.id("users"),
    goalId: v.id("goals"),
    goalTitle: v.string(),
    milestonePercentage: v.number(), // 25, 50, 75, 90, 100
    currentAmount: v.number(),
    targetAmount: v.number(),
    isComplete: v.boolean(),
  },
  returns: v.object({
    sent: v.number(),
    failed: v.optional(v.number()),
    filtered: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<{ sent: number; failed?: number; filtered?: number }> => {
    let title: string;
    let body: string;

    if (args.isComplete) {
      title = "Goal Achieved! 🎉";
      body = `Congratulations! You've completed "${args.goalTitle}"`;
    } else {
      title = `${args.milestonePercentage}% Progress`;
      body = `"${args.goalTitle}" is ${args.milestonePercentage}% complete`;
    }

    return await ctx.runAction(internal.notifications.send.sendToUser, {
      userId: args.userId,
      type: "goal_milestone",
      title,
      body,
      data: {
        screen: "goal-detail",
        goalId: args.goalId,
        milestone: args.milestonePercentage,
      },
      sourceType: "goal",
      sourceId: args.goalId,
    });
  },
});

/**
 * Send an agent activity notification
 */
export const sendAgentActivity = internalAction({
  args: {
    userId: v.id("users"),
    activityType: v.union(
      v.literal("dca_executed"),
      v.literal("yield_harvested"),
      v.literal("strategy_paused"),
      v.literal("strategy_resumed"),
      v.literal("strategy_completed")
    ),
    title: v.string(),
    details: v.string(),
    goalId: v.optional(v.id("goals")),
    amount: v.optional(v.number()),
    tokenSymbol: v.optional(v.string()),
  },
  returns: v.object({
    sent: v.number(),
    failed: v.optional(v.number()),
    filtered: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<{ sent: number; failed?: number; filtered?: number }> => {
    return await ctx.runAction(internal.notifications.send.sendToUser, {
      userId: args.userId,
      type: "agent_activity",
      title: args.title,
      body: args.details,
      data: {
        screen: args.goalId ? "goal-detail" : "activity",
        goalId: args.goalId,
        activityType: args.activityType,
        amount: args.amount,
        tokenSymbol: args.tokenSymbol,
      },
      sourceType: "agent",
      sourceId: args.goalId,
    });
  },
});

/**
 * Send a fraud alert notification (high priority)
 */
export const sendFraudAlert = internalAction({
  args: {
    userId: v.id("users"),
    cardId: v.id("cards"),
    fraudId: v.id("fraud"),
    riskLevel: v.union(
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    merchantName: v.optional(v.string()),
    amount: v.number(), // In cents
    action: v.union(
      v.literal("alert"),
      v.literal("freeze"),
      v.literal("decline")
    ),
  },
  returns: v.object({
    sent: v.number(),
    failed: v.optional(v.number()),
    filtered: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<{ sent: number; failed?: number; filtered?: number }> => {
    const amountDisplay = `$${(args.amount / 100).toFixed(2)}`;
    const merchant = args.merchantName ?? "Unknown merchant";

    let title: string;
    let body: string;

    switch (args.action) {
      case "decline":
        title = "Transaction Blocked";
        body = `A suspicious ${amountDisplay} charge at ${merchant} was declined`;
        break;
      case "freeze":
        title = "Card Frozen - Review Required";
        body = `Your card was frozen after a ${amountDisplay} charge at ${merchant}. Please review.`;
        break;
      case "alert":
        title = "Unusual Activity Detected";
        body = `Please verify: ${amountDisplay} at ${merchant}`;
        break;
    }

    return await ctx.runAction(internal.notifications.send.sendToUser, {
      userId: args.userId,
      type: "fraud_alert",
      title,
      body,
      data: {
        screen: "fraud-alert",
        cardId: args.cardId,
        fraudId: args.fraudId,
        action: args.action,
        requiresAction: args.action !== "alert",
      },
      sourceType: "fraud",
      sourceId: args.fraudId,
    });
  },
});

// ============================================================================
// Internal Mutations - Logging
// ============================================================================

/**
 * Log a notification to history
 */
export const logNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("crypto_receipt"),
      v.literal("goal_milestone"),
      v.literal("agent_activity"),
      v.literal("fraud_alert"),
      v.literal("private_transfer"),
      v.literal("system")
    ),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("filtered")
    ),
    expoTicketId: v.optional(v.string()),
    expoReceiptId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    sourceType: v.optional(v.union(
      v.literal("transaction"),
      v.literal("funding"),
      v.literal("goal"),
      v.literal("fraud"),
      v.literal("agent"),
      v.literal("system")
    )),
    sourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("notificationHistory", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      data: args.data,
      status: args.status,
      expoTicketId: args.expoTicketId,
      expoReceiptId: args.expoReceiptId,
      errorMessage: args.errorMessage,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      createdAt: now,
      sentAt: args.status === "sent" ? now : undefined,
    });
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

/**
 * Get user for sending notification
 */
export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the preference key for a notification type
 */
function getPreferenceKey(type: NotificationType): string {
  switch (type) {
    case "crypto_receipt":
      return "cryptoReceipts";
    case "goal_milestone":
      return "goalMilestones";
    case "agent_activity":
      return "agentActivity";
    case "fraud_alert":
      return "fraudAlerts";
    case "private_transfer":
      return "cryptoReceipts"; // Private transfers use crypto receipt preference
    case "system":
      return "cryptoReceipts"; // System uses crypto receipt preference
  }
}

/**
 * Format an amount for display
 */
function formatAmount(amount: number, symbol: string): string {
  // Handle different token decimals
  const decimals: Record<string, number> = {
    SOL: 9,
    USDC: 6,
    USDT: 6,
    ETH: 18,
    BTC: 8,
  };

  const tokenDecimals = decimals[symbol.toUpperCase()] ?? 6;

  // If amount is already in human-readable form (< 1000), display as-is
  if (amount < 1000) {
    return `${amount.toFixed(amount < 1 ? 4 : 2)} ${symbol}`;
  }

  // Otherwise assume it's in smallest units
  const humanAmount = amount / Math.pow(10, tokenDecimals);
  return `${humanAmount.toFixed(humanAmount < 1 ? 4 : 2)} ${symbol}`;
}
