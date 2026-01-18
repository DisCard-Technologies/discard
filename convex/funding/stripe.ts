/**
 * Stripe Payment Integration
 *
 * Handles Stripe payment processing for account funding.
 * Ported from: apps/api/src/services/funding/stripe.service.ts
 */
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
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
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get transaction by ID to retrieve the Stripe payment intent ID
      const transaction = await ctx.runQuery(internal.funding.stripe.getTransactionById, {
        transactionId: args.transactionId,
      });

      if (!transaction) {
        console.error("[Stripe] Transaction not found:", args.transactionId);
        return { success: false, error: "Transaction not found" };
      }

      if (!transaction.stripePaymentIntentId) {
        console.error("[Stripe] Transaction has no Stripe payment intent:", args.transactionId);
        return { success: false, error: "No Stripe payment intent associated with transaction" };
      }

      // Verify transaction is in a refundable state
      if (transaction.status !== "completed" && transaction.status !== "processing") {
        console.error("[Stripe] Transaction not refundable, status:", transaction.status);
        return { success: false, error: `Cannot refund transaction in ${transaction.status} status` };
      }

      console.log("[Stripe] Initiating refund for payment intent:", transaction.stripePaymentIntentId);

      // Create refund with Stripe
      const refundResult = await stripeRequest("/refunds", {
        method: "POST",
        body: new URLSearchParams({
          payment_intent: transaction.stripePaymentIntentId,
          reason: args.reason ?? "requested_by_customer",
        }),
      });

      console.log("[Stripe] Refund created:", refundResult.id);

      // Update transaction status
      await ctx.runMutation(internal.funding.funding.updateTransactionStatus, {
        transactionId: args.transactionId,
        status: "refunded",
      });

      return { success: true };

    } catch (error) {
      console.error("[Stripe] Failed to refund payment:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Refund failed"
      };
    }
  },
});

/**
 * Get transaction by ID (for refund lookup)
 */
export const getTransactionById = internalQuery({
  args: {
    transactionId: v.id("fundingTransactions"),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) return null;

    return {
      _id: transaction._id,
      status: transaction.status,
      stripePaymentIntentId: (transaction as any).stripePaymentIntentId,
      amount: transaction.amount,
      userId: transaction.userId,
    };
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
 *
 * Properly reuses existing Stripe customer IDs to:
 * 1. Avoid creating duplicate customers in Stripe
 * 2. Allow saved payment methods to persist
 * 3. Enable better analytics and fraud detection
 */
async function getOrCreateStripeCustomer(
  ctx: any,
  userId: Id<"users">
): Promise<string> {
  // Check if user already has a Stripe customer ID stored
  const user = await ctx.runQuery(internal.funding.stripe.getUserStripeCustomer, {
    userId,
  });

  if (user?.stripeCustomerId) {
    console.log("[Stripe] Using existing customer:", user.stripeCustomerId);
    return user.stripeCustomerId;
  }

  // Create a new Stripe customer
  console.log("[Stripe] Creating new customer for user:", userId);

  const body = new URLSearchParams();
  body.append("metadata[convex_user_id]", userId);

  // Add user email if available
  if (user?.email) {
    body.append("email", user.email);
  }

  // Add user name if available
  if (user?.displayName) {
    body.append("name", user.displayName);
  }

  const customer = await stripeRequest("/customers", {
    method: "POST",
    body,
  });

  // Store the customer ID with the user
  await ctx.runMutation(internal.funding.stripe.storeStripeCustomerId, {
    userId,
    stripeCustomerId: customer.id,
  });

  console.log("[Stripe] Created new customer:", customer.id);

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

// ============ INTERNAL QUERIES ============

/**
 * Get user's Stripe customer ID
 */
export const getUserStripeCustomer = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    return {
      stripeCustomerId: (user as any).stripeCustomerId,
      email: user.email,
      displayName: user.displayName,
    };
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Store Stripe customer ID for user
 */
export const storeStripeCustomerId = internalMutation({
  args: {
    userId: v.id("users"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeCustomerId: args.stripeCustomerId,
    } as any);
  },
});
