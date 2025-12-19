/**
 * Stripe Payment Integration
 *
 * Handles Stripe payment processing for account funding.
 * Ported from: apps/api/src/services/funding/stripe.service.ts
 */
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API_VERSION = "2023-10-16";
const STRIPE_BASE_URL = "https://api.stripe.com/v1";

// ============ INTERNAL ACTIONS ============

/**
 * Create a Stripe payment intent for funding
 */
export const createPaymentIntent = internalAction({
  args: {
    transactionId: v.id("fundingTransactions"),
    userId: v.id("users"),
    amount: v.number(),
    paymentMethodId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      // Get or create Stripe customer
      const customerId = await getOrCreateStripeCustomer(ctx, args.userId);

      // Create payment intent
      const paymentIntent = await createStripePaymentIntent({
        amount: args.amount,
        currency: "usd",
        customerId,
        paymentMethodId: args.paymentMethodId,
        metadata: {
          convex_transaction_id: args.transactionId,
          convex_user_id: args.userId,
        },
      });

      // Update transaction with Stripe details
      await ctx.runMutation(internal.funding.funding.updateTransactionStatus, {
        transactionId: args.transactionId,
        status: "processing",
        stripePaymentIntentId: paymentIntent.id,
      });

      // If payment method was provided and auto-confirm is enabled
      if (args.paymentMethodId && paymentIntent.status === "succeeded") {
        await ctx.runMutation(internal.funding.funding.completeFunding, {
          transactionId: args.transactionId,
        });
      }

    } catch (error) {
      console.error("Failed to create payment intent:", error);

      await ctx.runMutation(internal.funding.funding.updateTransactionStatus, {
        transactionId: args.transactionId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Payment failed",
        errorCode: "STRIPE_ERROR",
      });
    }
  },
});

/**
 * Confirm a payment intent
 */
export const confirmPaymentIntent = internalAction({
  args: {
    paymentIntentId: v.string(),
    paymentMethodId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    try {
      const response = await stripeRequest(`/payment_intents/${args.paymentIntentId}/confirm`, {
        method: "POST",
        body: new URLSearchParams({
          payment_method: args.paymentMethodId,
        }),
      });

      return { success: response.status === "succeeded" };

    } catch (error) {
      console.error("Failed to confirm payment:", error);
      return { success: false };
    }
  },
});

/**
 * Refund a payment
 */
export const refundPayment = internalAction({
  args: {
    transactionId: v.id("fundingTransactions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    try {
      // Get transaction
      const transaction = await ctx.runQuery(internal.funding.funding.getByStripeIntentId, {
        stripePaymentIntentId: "", // This needs the actual intent ID
      });

      if (!transaction || !transaction.stripePaymentIntentId) {
        throw new Error("Transaction not found");
      }

      // Create refund
      await stripeRequest("/refunds", {
        method: "POST",
        body: new URLSearchParams({
          payment_intent: transaction.stripePaymentIntentId,
          reason: args.reason ?? "requested_by_customer",
        }),
      });

      // Update transaction status
      await ctx.runMutation(internal.funding.funding.updateTransactionStatus, {
        transactionId: args.transactionId,
        status: "refunded",
      });

      return { success: true };

    } catch (error) {
      console.error("Failed to refund payment:", error);
      return { success: false };
    }
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Make a request to Stripe API
 */
async function stripeRequest(
  endpoint: string,
  options: {
    method?: string;
    body?: URLSearchParams;
  } = {}
): Promise<any> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key not configured");
  }

  const response = await fetch(`${STRIPE_BASE_URL}${endpoint}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: options.body,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message ?? `Stripe API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get or create Stripe customer for user
 */
async function getOrCreateStripeCustomer(
  ctx: any,
  userId: Id<"users">
): Promise<string> {
  // In production, you would:
  // 1. Check if user already has a Stripe customer ID stored
  // 2. If not, create a new Stripe customer
  // 3. Store the customer ID with the user

  // For now, create a new customer each time
  // This is a placeholder - implement proper customer management

  const customer = await stripeRequest("/customers", {
    method: "POST",
    body: new URLSearchParams({
      metadata: JSON.stringify({
        convex_user_id: userId,
      }),
    }),
  });

  return customer.id;
}

/**
 * Create a Stripe payment intent
 */
async function createStripePaymentIntent(params: {
  amount: number;
  currency: string;
  customerId: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}): Promise<{
  id: string;
  client_secret: string;
  status: string;
}> {
  const body = new URLSearchParams({
    amount: params.amount.toString(),
    currency: params.currency,
    customer: params.customerId,
    automatic_payment_methods: JSON.stringify({ enabled: true }),
  });

  if (params.paymentMethodId) {
    body.append("payment_method", params.paymentMethodId);
    body.append("confirm", "true");
  }

  if (params.metadata) {
    for (const [key, value] of Object.entries(params.metadata)) {
      body.append(`metadata[${key}]`, value);
    }
  }

  return await stripeRequest("/payment_intents", {
    method: "POST",
    body,
  });
}
