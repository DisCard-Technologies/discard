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
      // Verify Marqeta webhook Basic Auth
      const authHeader = request.headers.get("authorization");
      const body = await request.text();

      if (!verifyMarqetaAuth(authHeader)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
      // Verify Marqeta webhook Basic Auth
      const authHeader = request.headers.get("authorization");
      const body = await request.text();

      if (!verifyMarqetaAuth(authHeader)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
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

// ============ MOONPAY WEBHOOKS ============

/**
 * MoonPay transaction webhook
 * Handles crypto on-ramp transaction status updates
 */
http.route({
  path: "/webhooks/moonpay",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const signature = request.headers.get("moonpay-signature");
      const body = await request.text();

      // Verify MoonPay webhook signature
      if (!await verifyMoonPaySignature(body, signature)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = JSON.parse(body);

      // Route based on event type
      switch (event.type) {
        case "transaction_created":
          await ctx.runMutation(internal.funding.moonpay.handleTransactionCreated, {
            externalTransactionId: event.data.externalTransactionId,
            moonpayTransactionId: event.data.id,
            fiatCurrency: event.data.baseCurrencyCode,
            fiatAmount: Math.round(event.data.baseCurrencyAmount * 100),
            cryptoCurrency: event.data.currencyCode,
            walletAddress: event.data.walletAddress,
          });
          break;

        case "transaction_updated":
          await ctx.runMutation(internal.funding.moonpay.handleTransactionUpdated, {
            moonpayTransactionId: event.data.id,
            status: event.data.status,
            cryptoAmount: event.data.quoteCurrencyAmount,
            moonpayFee: event.data.feeAmount,
            networkFee: event.data.networkFeeAmount,
            failureReason: event.data.failureReason,
          });
          break;

        case "transaction_completed":
          // Calculate USD value from crypto amount and rate
          const usdAmount = event.data.usdRate
            ? Math.round(event.data.quoteCurrencyAmount * event.data.usdRate * 100)
            : Math.round(event.data.baseCurrencyAmount * 100); // Fallback to fiat amount

          await ctx.runMutation(internal.funding.moonpay.handleTransactionCompleted, {
            moonpayTransactionId: event.data.id,
            cryptoAmount: event.data.quoteCurrencyAmount,
            usdAmount,
          });
          break;

        case "transaction_failed":
          await ctx.runMutation(internal.funding.moonpay.handleTransactionFailed, {
            moonpayTransactionId: event.data.id,
            failureReason: event.data.failureReason || "Transaction failed",
          });
          break;

        default:
          console.log(`Unhandled MoonPay event type: ${event.type}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("MoonPay webhook error:", error);
      return new Response(
        JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// ============ IBAN WEBHOOKS ============

/**
 * Virtual IBAN deposit webhook
 * Handles incoming bank transfer notifications from banking provider
 * Supports: Stripe Treasury, Railsr, Wise
 */
http.route({
  path: "/webhooks/iban",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const signature = request.headers.get("stripe-signature") ||
                       request.headers.get("x-railsr-signature") ||
                       request.headers.get("x-wise-signature");
      const body = await request.text();

      // Determine provider from headers or body
      const provider = request.headers.get("x-provider") ||
                      (request.headers.get("stripe-signature") ? "stripe_treasury" : "unknown");

      // Verify signature based on provider
      if (provider === "stripe_treasury") {
        if (!await verifyIbanStripeSignature(body, signature)) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const event = JSON.parse(body);

      // Handle Stripe Treasury events
      if (provider === "stripe_treasury") {
        switch (event.type) {
          case "treasury.received_credit.created":
          case "treasury.received_credit.succeeded":
            const credit = event.data.object;

            // Get currency conversion rate if needed
            const currency = credit.currency.toUpperCase();
            let usdAmount = credit.amount; // Already in cents

            if (currency !== "USD") {
              // Convert to USD using current rate
              // In production, fetch actual rate from forex API
              const rates: Record<string, number> = {
                EUR: 1.08,
                GBP: 1.26,
              };
              const rate = rates[currency] || 1;
              usdAmount = Math.round(credit.amount * rate);
            }

            await ctx.runMutation(internal.funding.iban.processDeposit, {
              externalAccountId: credit.financial_account,
              amount: credit.amount,
              currency,
              usdAmount,
              senderName: credit.initiating_payment_method_details?.billing_details?.name,
              senderIban: credit.initiating_payment_method_details?.iban,
              reference: credit.description,
              providerTransactionId: credit.id,
            });
            break;

          case "treasury.financial_account.status_updated":
            // Handle account status changes
            console.log("IBAN account status updated:", event.data.object.id);
            break;

          default:
            console.log(`Unhandled Stripe Treasury event: ${event.type}`);
        }
      }

      // Handle Railsr events (placeholder)
      if (provider === "railsr") {
        // TODO: Implement Railsr webhook handling
        console.log("Railsr webhook received:", event.type);
      }

      // Handle Wise events (placeholder)
      if (provider === "wise") {
        // TODO: Implement Wise webhook handling
        console.log("Wise webhook received:", event.type);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("IBAN webhook error:", error);
      return new Response(
        JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// ============ TURNKEY WEBHOOKS ============

/**
 * Turnkey activity webhook
 * Handles signing activity completion from Turnkey TEE
 * Called when user approves/rejects signing via passkey
 */
http.route({
  path: "/webhooks/turnkey",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const startTime = Date.now();

    try {
      // Verify Turnkey webhook signature
      const signature = request.headers.get("x-turnkey-signature");
      const timestamp = request.headers.get("x-turnkey-timestamp");
      const body = await request.text();

      if (!await verifyTurnkeySignature(body, signature, timestamp)) {
        console.error("[Turnkey Webhook] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = JSON.parse(body);

      // Route based on activity type and status
      const activityId = event.activityId;
      const activityType = event.activityType;
      const status = event.status;

      console.log(`[Turnkey Webhook] Activity ${activityId}: ${activityType} -> ${status}`);

      switch (activityType) {
        case "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD":
        case "ACTIVITY_TYPE_SIGN_TRANSACTION":
          // Handle signing activity completion
          await ctx.runMutation(internal.bridge.turnkeyBridge.handleActivityCompletion, {
            activityId,
            status,
            result: event.result,
            error: event.error?.message,
          });
          break;

        case "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION":
          // Handle sub-org creation completion
          if (status === "ACTIVITY_STATUS_COMPLETED") {
            await ctx.runMutation(internal.tee.turnkey.handleSubOrgCreated, {
              activityId,
              subOrganizationId: event.result?.createSubOrganizationResult?.subOrganizationId,
              rootUserId: event.result?.createSubOrganizationResult?.rootUserId,
            });
          }
          break;

        case "ACTIVITY_TYPE_CREATE_WALLET":
          // Handle wallet creation completion
          if (status === "ACTIVITY_STATUS_COMPLETED") {
            await ctx.runMutation(internal.tee.turnkey.handleWalletCreated, {
              activityId,
              walletId: event.result?.createWalletResult?.walletId,
              addresses: event.result?.createWalletResult?.addresses,
            });
          }
          break;

        case "ACTIVITY_TYPE_DELETE_USERS":
        case "ACTIVITY_TYPE_UPDATE_USER":
          // Handle user management events
          console.log(`[Turnkey Webhook] User management activity: ${activityType}`);
          break;

        case "ACTIVITY_TYPE_EXPORT_WALLET":
        case "ACTIVITY_TYPE_EXPORT_WALLET_ACCOUNT":
          // Log export attempts for audit (security event)
          console.warn(`[Turnkey Webhook] Wallet export detected: ${activityId}`);
          await ctx.runMutation(internal.tee.turnkey.logSecurityEvent, {
            eventType: "wallet_export",
            activityId,
            status,
          });
          break;

        default:
          console.log(`[Turnkey Webhook] Unhandled activity type: ${activityType}`);
      }

      const responseTime = Date.now() - startTime;

      return new Response(
        JSON.stringify({
          received: true,
          activityId,
          responseTimeMs: responseTime,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Response-Time": `${responseTime}ms`,
          },
        }
      );

    } catch (error) {
      console.error("[Turnkey Webhook] Error:", error);
      return new Response(
        JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

/**
 * Turnkey policy engine webhook
 * Handles policy evaluation results and notifications
 */
http.route({
  path: "/webhooks/turnkey/policy",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const signature = request.headers.get("x-turnkey-signature");
      const timestamp = request.headers.get("x-turnkey-timestamp");
      const body = await request.text();

      if (!await verifyTurnkeySignature(body, signature, timestamp)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = JSON.parse(body);

      switch (event.type) {
        case "policy.evaluation.denied":
          // Transaction blocked by policy
          console.log(`[Turnkey Policy] Transaction denied: ${event.policyId}`);
          await ctx.runMutation(internal.tee.turnkey.handlePolicyDenial, {
            activityId: event.activityId,
            policyId: event.policyId,
            reason: event.reason,
          });
          break;

        case "policy.consensus.required":
          // Multi-sig approval required
          console.log(`[Turnkey Policy] Consensus required: ${event.activityId}`);
          await ctx.runMutation(internal.tee.turnkey.handleConsensusRequired, {
            activityId: event.activityId,
            requiredApprovers: event.requiredApprovers,
            currentApprovers: event.currentApprovers,
          });
          break;

        case "policy.limit.exceeded":
          // Velocity limit exceeded
          console.log(`[Turnkey Policy] Limit exceeded: ${event.limitType}`);
          await ctx.runMutation(internal.tee.turnkey.handleLimitExceeded, {
            activityId: event.activityId,
            limitType: event.limitType,
            currentValue: event.currentValue,
            limitValue: event.limitValue,
          });
          break;

        default:
          console.log(`[Turnkey Policy] Unhandled event: ${event.type}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("[Turnkey Policy Webhook] Error:", error);
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
 * Verify Turnkey webhook signature
 * Uses ECDSA P-256 signature verification
 */
async function verifyTurnkeySignature(
  body: string,
  signature: string | null,
  timestamp: string | null
): Promise<boolean> {
  if (!signature || !timestamp) return false;

  const publicKey = process.env.TURNKEY_WEBHOOK_PUBLIC_KEY;
  if (!publicKey) {
    console.warn("TURNKEY_WEBHOOK_PUBLIC_KEY not configured - skipping verification");
    return true; // Allow in development
  }

  // Check timestamp to prevent replay attacks (5 minute window)
  const timestampMs = parseInt(timestamp, 10);
  const now = Date.now();
  if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    console.error("[Turnkey] Webhook timestamp too old");
    return false;
  }

  try {
    // Payload format: timestamp.body
    const payload = `${timestamp}.${body}`;
    const encoder = new TextEncoder();

    // Import the public key (P-256/secp256r1)
    const keyData = Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    // Verify the signature
    const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      signatureBytes,
      encoder.encode(payload)
    );

    return isValid;
  } catch (error) {
    console.error("[Turnkey] Signature verification error:", error);
    return false;
  }
}

/**
 * Verify Marqeta webhook Basic Auth
 * Marqeta sends Authorization header with Basic Auth (base64 encoded username:password)
 */
function verifyMarqetaAuth(authHeader: string | null): boolean {
  if (!authHeader) {
    console.warn("No Authorization header in Marqeta webhook");
    return false;
  }

  const secret = process.env.MARQETA_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("MARQETA_WEBHOOK_SECRET not configured - skipping verification");
    return true; // Allow in development
  }

  // Check if it's Basic Auth
  if (!authHeader.startsWith("Basic ")) {
    console.warn("Marqeta webhook: Expected Basic Auth");
    return false;
  }

  // Decode the base64 credentials
  const base64Credentials = authHeader.slice(6); // Remove "Basic "
  const expectedBase64 = btoa(secret); // secret should be "username:password"

  const isValid = base64Credentials === expectedBase64;
  if (!isValid) {
    console.warn("Marqeta webhook: Invalid credentials");
  }

  return isValid;
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

/**
 * Verify MoonPay webhook signature
 */
async function verifyMoonPaySignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;

  const secret = process.env.MOONPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("MOONPAY_WEBHOOK_SECRET not configured - skipping verification");
    return true; // Allow in development
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(body)
    );

    const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(expectedSignature)));
    return signature === expectedBase64;
  } catch {
    return false;
  }
}

/**
 * Verify IBAN Stripe Treasury webhook signature
 */
async function verifyIbanStripeSignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("STRIPE_WEBHOOK_SECRET not configured - skipping verification");
    return true; // Allow in development
  }

  // Stripe signature format: t=timestamp,v1=signature
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sig = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!timestamp || !sig) return false;

  const payload = `${timestamp}.${body}`;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return sig === expectedHex;
  } catch {
    return false;
  }
}

export default http;
