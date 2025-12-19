/**
 * Webhook Handler Mutations
 *
 * Internal mutations called by HTTP webhook handlers
 * for processing Marqeta and Stripe events.
 */
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// ============ MARQETA HANDLERS ============

/**
 * Handle transaction clearing (settlement)
 */
export const handleClearing = internalMutation({
  args: {
    marqetaTransactionToken: v.string(),
    settledAmount: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find the authorization
    const auth = await ctx.db
      .query("authorizations")
      .withIndex("by_marqeta_token", (q) =>
        q.eq("marqetaTransactionToken", args.marqetaTransactionToken)
      )
      .first();

    if (!auth) {
      console.warn(`Authorization not found for token: ${args.marqetaTransactionToken}`);
      return;
    }

    // Update authorization status
    await ctx.db.patch(auth._id, {
      status: "settled",
      settledAt: Date.now(),
    });

    // Find and clear the hold
    const hold = await ctx.db
      .query("authorizationHolds")
      .withIndex("by_authorization", (q) => q.eq("authorizationId", auth._id))
      .first();

    if (hold && hold.status === "active") {
      // Calculate any difference between hold and settlement
      const releasedAmount = hold.holdAmount - args.settledAmount;

      await ctx.db.patch(hold._id, {
        status: "cleared",
        clearedAt: Date.now(),
      });

      // If settlement was less than hold, release the difference
      if (releasedAmount > 0) {
        await ctx.runMutation(internal.cards.cards.releaseReservedBalance, {
          cardId: auth.cardId,
          amount: releasedAmount,
        });
      }
    }

    console.log(`Transaction cleared: ${args.marqetaTransactionToken}, settled: $${(args.settledAmount / 100).toFixed(2)}`);
  },
});

/**
 * Handle transaction completion
 */
export const handleCompletion = internalMutation({
  args: {
    marqetaTransactionToken: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const auth = await ctx.db
      .query("authorizations")
      .withIndex("by_marqeta_token", (q) =>
        q.eq("marqetaTransactionToken", args.marqetaTransactionToken)
      )
      .first();

    if (!auth) {
      console.warn(`Authorization not found for completion: ${args.marqetaTransactionToken}`);
      return;
    }

    // Update to settled if not already
    if (auth.status !== "settled") {
      await ctx.db.patch(auth._id, {
        status: "settled",
        settledAt: Date.now(),
      });
    }

    // Update card's last used timestamp
    const card = await ctx.db.get(auth.cardId);
    if (card) {
      await ctx.db.patch(auth.cardId, {
        lastUsedAt: Date.now(),
      });
    }

    console.log(`Transaction completed: ${args.marqetaTransactionToken}`);
  },
});

/**
 * Handle transaction decline
 */
export const handleDecline = internalMutation({
  args: {
    marqetaTransactionToken: v.string(),
    declineReason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const auth = await ctx.db
      .query("authorizations")
      .withIndex("by_marqeta_token", (q) =>
        q.eq("marqetaTransactionToken", args.marqetaTransactionToken)
      )
      .first();

    if (!auth) {
      console.warn(`Authorization not found for decline: ${args.marqetaTransactionToken}`);
      return;
    }

    // Update authorization status
    await ctx.db.patch(auth._id, {
      status: "declined",
      declineReason: args.declineReason,
    });

    // Release any hold
    const hold = await ctx.db
      .query("authorizationHolds")
      .withIndex("by_authorization", (q) => q.eq("authorizationId", auth._id))
      .first();

    if (hold && hold.status === "active") {
      await ctx.db.patch(hold._id, {
        status: "reversed",
        clearedAt: Date.now(),
      });

      // Release reserved balance
      await ctx.runMutation(internal.cards.cards.releaseReservedBalance, {
        cardId: auth.cardId,
        amount: hold.holdAmount,
      });
    }

    console.log(`Transaction declined: ${args.marqetaTransactionToken}, reason: ${args.declineReason}`);
  },
});

/**
 * Handle fraud detection alert
 */
export const handleFraudDetected = internalMutation({
  args: {
    marqetaCardToken: v.string(),
    breachSource: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find the card
    const card = await ctx.db
      .query("cards")
      .withIndex("by_marqeta_token", (q) =>
        q.eq("marqetaCardToken", args.marqetaCardToken)
      )
      .first();

    if (!card) {
      console.warn(`Card not found for fraud detection: ${args.marqetaCardToken}`);
      return;
    }

    // Mark card for reissuing (self-healing cards feature)
    await ctx.runMutation(internal.cards.cards.markReissuing, {
      cardId: card._id,
      breachSource: args.breachSource,
    });

    // Create fraud record
    await ctx.runMutation(internal.fraud.detection.recordAnalysis, {
      cardId: card._id,
      cardContext: card.cardContext,
      riskScore: 100,
      riskLevel: "critical",
      riskFactors: {
        velocityScore: 0,
        amountScore: 0,
        locationScore: 0,
        timeScore: 0,
        merchantScore: 100,
      },
      anomalies: [{
        type: "merchant",
        severity: "high",
        details: `Fraud detected by ${args.breachSource}`,
        confidence: 1.0,
      }],
      action: "freeze",
      amount: 0,
    });

    console.log(`Fraud detected on card ${card._id}, initiating self-healing reissue`);
  },
});

// ============ STRIPE HANDLERS ============

/**
 * Handle successful payment
 */
export const handlePaymentSuccess = internalMutation({
  args: {
    paymentIntentId: v.string(),
    chargeId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find the transaction
    const transaction = await ctx.db
      .query("fundingTransactions")
      .withIndex("by_stripe_intent", (q) =>
        q.eq("stripePaymentIntentId", args.paymentIntentId)
      )
      .first();

    if (!transaction) {
      console.warn(`Transaction not found for payment intent: ${args.paymentIntentId}`);
      return;
    }

    // Update transaction
    await ctx.db.patch(transaction._id, {
      status: "completed",
      stripeChargeId: args.chargeId,
      completedAt: Date.now(),
    });

    // If this was funding to a specific card, update the balance
    if (transaction.targetCardId) {
      const card = await ctx.db.get(transaction.targetCardId);
      if (card) {
        await ctx.db.patch(transaction.targetCardId, {
          currentBalance: card.currentBalance + transaction.amount,
          updatedAt: Date.now(),
        });
      }
    }

    console.log(`Payment succeeded: ${args.paymentIntentId}, amount: $${(transaction.amount / 100).toFixed(2)}`);
  },
});

/**
 * Handle failed payment
 */
export const handlePaymentFailure = internalMutation({
  args: {
    paymentIntentId: v.string(),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const transaction = await ctx.db
      .query("fundingTransactions")
      .withIndex("by_stripe_intent", (q) =>
        q.eq("stripePaymentIntentId", args.paymentIntentId)
      )
      .first();

    if (!transaction) {
      console.warn(`Transaction not found for failed payment: ${args.paymentIntentId}`);
      return;
    }

    await ctx.db.patch(transaction._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      errorCode: args.errorCode,
    });

    console.log(`Payment failed: ${args.paymentIntentId}, error: ${args.errorMessage}`);
  },
});

/**
 * Handle payment processing
 */
export const handlePaymentProcessing = internalMutation({
  args: {
    paymentIntentId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const transaction = await ctx.db
      .query("fundingTransactions")
      .withIndex("by_stripe_intent", (q) =>
        q.eq("stripePaymentIntentId", args.paymentIntentId)
      )
      .first();

    if (!transaction) {
      console.warn(`Transaction not found for processing: ${args.paymentIntentId}`);
      return;
    }

    await ctx.db.patch(transaction._id, {
      status: "processing",
    });

    console.log(`Payment processing: ${args.paymentIntentId}`);
  },
});

/**
 * Handle refund
 */
export const handleRefund = internalMutation({
  args: {
    paymentIntentId: v.string(),
    refundAmount: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const transaction = await ctx.db
      .query("fundingTransactions")
      .withIndex("by_stripe_intent", (q) =>
        q.eq("stripePaymentIntentId", args.paymentIntentId)
      )
      .first();

    if (!transaction) {
      console.warn(`Transaction not found for refund: ${args.paymentIntentId}`);
      return;
    }

    // Update original transaction
    await ctx.db.patch(transaction._id, {
      status: "refunded",
    });

    // If funds were added to a card, deduct the refund amount
    if (transaction.targetCardId) {
      const card = await ctx.db.get(transaction.targetCardId);
      if (card) {
        const newBalance = Math.max(0, card.currentBalance - args.refundAmount);
        await ctx.db.patch(transaction.targetCardId, {
          currentBalance: newBalance,
          updatedAt: Date.now(),
        });
      }
    }

    // Create refund transaction record
    await ctx.db.insert("fundingTransactions", {
      userId: transaction.userId,
      transactionType: "refund",
      amount: args.refundAmount,
      currency: "USD",
      sourceType: "stripe",
      targetCardId: transaction.targetCardId,
      status: "completed",
      stripePaymentIntentId: args.paymentIntentId,
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    console.log(`Refund processed: ${args.paymentIntentId}, amount: $${(args.refundAmount / 100).toFixed(2)}`);
  },
});
