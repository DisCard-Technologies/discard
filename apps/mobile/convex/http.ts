/**
 * HTTP Routes - Webhook Handlers
 *
 * Defines HTTP endpoints for external webhook integrations:
 * - Marqeta authorization and transaction webhooks
 * - Stripe payment webhooks
 */
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// ============ MARQETA WEBHOOKS ============

/**
 * Marqeta transaction authorization webhook
 * Called in real-time when a card is used for a transaction
 * Must respond within 800ms for sub-second authorization
 */
http.route({
  path: "/webhooks/marqeta/authorization",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const startTime = Date.now();

    try {
      // Verify Marqeta webhook signature
      const signature = request.headers.get("x-marqeta-signature");
      const body = await request.text();

      if (!verifyMarqetaSignature(body, signature)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = JSON.parse(body);

      // Process authorization
      const result = await ctx.runAction(internal.cards.marqeta.processAuthorization, {
        marqetaCardToken: event.card_token,
        marqetaTransactionToken: event.token,
        amount: Math.round(event.gpa_order?.amount * 100 || event.amount * 100), // Convert to cents
        currencyCode: event.currency_code || "USD",
        merchantName: event.merchant?.name || "Unknown",
        merchantMcc: event.merchant?.mcc || "0000",
        merchantCountry: event.merchant?.country,
        merchantCity: event.merchant?.city,
      });

      const responseTime = Date.now() - startTime;

      // Log response time
      if (responseTime > 800) {
        console.warn(`Marqeta authorization took ${responseTime}ms - exceeds 800ms threshold`);
      }

      // Return JIT response
      return new Response(
        JSON.stringify({
          jit_funding: {
            token: event.token,
            method: "pgfs.authorization",
            user_token: event.user_token,
            acting_user_token: event.user_token,
            amount: event.gpa_order?.amount || event.amount,
            state: result.approved ? "COMPLETION" : "DECLINED",
            decline_reason: result.declineReason,
            memo: result.authorizationCode,
          },
        }),
        {
          status: result.approved ? 200 : 402,
          headers: {
            "Content-Type": "application/json",
            "X-Response-Time": `${responseTime}ms`,
          },
        }
      );

    } catch (error) {
      console.error("Marqeta authorization webhook error:", error);

      return new Response(
        JSON.stringify({
          jit_funding: {
            state: "DECLINED",
            decline_reason: "PROCESSING_ERROR",
          },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

/**
 * Marqeta transaction events webhook
 * Handles clearing, completion, refund events
 */
http.route({
  path: "/webhooks/marqeta/transactions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const signature = request.headers.get("x-marqeta-signature");
      const body = await request.text();

      if (!verifyMarqetaSignature(body, signature)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = JSON.parse(body);

      // Route based on event type
      switch (event.type) {
        case "transaction.clearing":
          // Transaction has settled - clear the authorization hold
          await ctx.runMutation(internal.http.webhooks.handleClearing, {
            marqetaTransactionToken: event.token,
            settledAmount: Math.round(event.amount * 100),
          });
          break;

        case "transaction.completion":
          // Full transaction lifecycle complete
          await ctx.runMutation(internal.http.webhooks.handleCompletion, {
            marqetaTransactionToken: event.token,
          });
          break;

        case "transaction.declined":
          // Transaction was declined
          await ctx.runMutation(internal.http.webhooks.handleDecline, {
            marqetaTransactionToken: event.token,
            declineReason: event.decline_reason,
          });
          break;

        case "card.fraud.detected":
          // Fraud detected on card
          await ctx.runMutation(internal.http.webhooks.handleFraudDetected, {
            marqetaCardToken: event.card_token,
            breachSource: event.source || "marqeta_fraud_detection",
          });
          break;

        default:
          console.log(`Unhandled Marqeta event type: ${event.type}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Marqeta transaction webhook error:", error);
      return new Response(
        JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// ============ STRIPE WEBHOOKS ============

/**
 * Stripe payment webhook
 * Handles payment intent events
 */
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const signature = request.headers.get("stripe-signature");
      const body = await request.text();

      // Verify Stripe webhook signature
      if (!verifyStripeSignature(body, signature)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = JSON.parse(body);

      // Route based on event type
      switch (event.type) {
        case "payment_intent.succeeded":
          await ctx.runMutation(internal.http.webhooks.handlePaymentSuccess, {
            paymentIntentId: event.data.object.id,
            chargeId: event.data.object.latest_charge,
          });
          break;

        case "payment_intent.payment_failed":
          await ctx.runMutation(internal.http.webhooks.handlePaymentFailure, {
            paymentIntentId: event.data.object.id,
            errorMessage: event.data.object.last_payment_error?.message,
            errorCode: event.data.object.last_payment_error?.code,
          });
          break;

        case "payment_intent.processing":
          await ctx.runMutation(internal.http.webhooks.handlePaymentProcessing, {
            paymentIntentId: event.data.object.id,
          });
          break;

        case "charge.refunded":
          await ctx.runMutation(internal.http.webhooks.handleRefund, {
            paymentIntentId: event.data.object.payment_intent,
            refundAmount: event.data.object.amount_refunded,
          });
          break;

        default:
          console.log(`Unhandled Stripe event type: ${event.type}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Stripe webhook error:", error);
      return new Response(
        JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// ============ HEALTH CHECK ============

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "2035.1.0",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }),
});

// ============ SIGNATURE VERIFICATION ============

/**
 * Verify Marqeta webhook signature
 */
function verifyMarqetaSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;

  const secret = process.env.MARQETA_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("MARQETA_WEBHOOK_SECRET not configured - skipping verification");
    return true; // Allow in development
  }

  // In production, implement HMAC SHA-256 verification
  // const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  // return signature === expectedSignature;

  return true; // Placeholder - implement proper verification
}

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("STRIPE_WEBHOOK_SECRET not configured - skipping verification");
    return true; // Allow in development
  }

  // In production, implement Stripe signature verification
  // Stripe uses a specific format: t=timestamp,v1=signature
  // Use the stripe-js library or implement manually

  return true; // Placeholder - implement proper verification
}

export default http;
