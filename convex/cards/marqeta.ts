/**
 * Marqeta Card Issuing Integration
 *
 * Convex actions for interacting with the Marqeta API to:
 * - Create virtual cards
 * - Retrieve card details (PAN/CVV)
 * - Manage card lifecycle (activate, suspend, terminate)
 * - Handle authorization webhooks
 *
 * Ported from: apps/api/src/services/payments/marqeta.service.ts
 */
import { action, internalAction, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// Marqeta API configuration
const MARQETA_BASE_URL = process.env.MARQETA_BASE_URL ?? "https://sandbox-api.marqeta.com/v3";
const MARQETA_APP_TOKEN = process.env.MARQETA_APP_TOKEN;
const MARQETA_ADMIN_TOKEN = process.env.MARQETA_ADMIN_TOKEN;
const MARQETA_CARD_PRODUCT_TOKEN = process.env.MARQETA_CARD_PRODUCT_TOKEN;

// Rate limiting and retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RATE_LIMIT_REQUESTS = 1000;
const RATE_LIMIT_WINDOW_MS = 60000;

// ============ INTERNAL ACTIONS ============

/**
 * Provision a new card in Marqeta
 */
export const provisionCard = internalAction({
  args: {
    cardId: v.id("cards"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      // Get user details (use internal query since we don't have auth context)
      const user = await ctx.runQuery(internal.auth.passkeys.getUserById, {
        userId: args.userId,
      });
      if (!user) {
        throw new Error("User not found");
      }

      // Step 1: Create or get Marqeta user
      const marqetaUserToken = await createOrGetMarqetaUser(ctx, args.userId, user);

      // Step 2: Create virtual card
      const cardResponse = await createMarqetaCard(marqetaUserToken);

      // Step 3: Retrieve card details (with retries)
      const cardDetails = await getMarqetaCardDetails(cardResponse.token);

      // Step 4: Activate the card
      await activateMarqetaCard(cardResponse.token);

      // Step 5: Update card record in Convex
      await ctx.runMutation(internal.cards.cards.updateFromMarqeta, {
        cardId: args.cardId,
        marqetaCardToken: cardResponse.token,
        marqetaUserToken,
        last4: cardDetails.pan.slice(-4),
        expirationMonth: cardDetails.expiration_month,
        expirationYear: cardDetails.expiration_year,
      });

      console.log(`Card ${args.cardId} provisioned successfully with Marqeta token ${cardResponse.token}`);
    } catch (error) {
      console.error(`Failed to provision card ${args.cardId}:`, error);

      // Update card status to indicate provisioning failure
      // In production, you might want to retry or notify the user
      throw error;
    }
  },
});

/**
 * Sync card status with Marqeta
 */
export const syncCardStatus = internalAction({
  args: {
    cardId: v.id("cards"),
    status: v.union(v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args): Promise<void> => {
    const card = await ctx.runQuery(internal.cards.cards.getByCardContext, {
      cardContext: "", // We need to get by ID
    });

    // This is a placeholder - we'd need to add a getById internal query
    // For now, just log the sync request
    console.log(`Syncing card ${args.cardId} status to ${args.status}`);

    // In production, call Marqeta API to update card state
  },
});

/**
 * Suspend a card in Marqeta
 */
export const suspendCard = internalAction({
  args: {
    cardId: v.id("cards"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    console.log(`Suspending card ${args.cardId} in Marqeta: ${args.reason}`);

    // In production:
    // 1. Get card's Marqeta token
    // 2. Call Marqeta PUT /cards/{token}/transitions with state: SUSPENDED
  },
});

/**
 * Activate a card in Marqeta
 */
export const activateCard = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<void> => {
    console.log(`Activating card ${args.cardId} in Marqeta`);

    // In production:
    // 1. Get card's Marqeta token
    // 2. Call Marqeta PUT /cards/{token}/transitions with state: ACTIVE
  },
});

/**
 * Terminate a card in Marqeta
 */
export const terminateCard = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<void> => {
    console.log(`Terminating card ${args.cardId} in Marqeta`);

    // In production:
    // 1. Get card's Marqeta token
    // 2. Call Marqeta PUT /cards/{token}/transitions with state: TERMINATED
  },
});

/**
 * Get card sensitive details (PAN, CVV) from Marqeta
 * Only used when user explicitly requests to view card details
 */
export const getCardSecrets = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<{
    pan: string;
    cvv: string;
    expirationMonth: number;
    expirationYear: number;
  } | null> => {
    // In production:
    // 1. Get card's Marqeta token
    // 2. Call Marqeta GET /cards/{token}/showpan
    // 3. Return decrypted details

    // Placeholder response
    return null;
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Create Marqeta API request with authentication
 */
async function marqetaRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  // Use btoa instead of Buffer for Convex runtime compatibility
  const auth = btoa(`${MARQETA_APP_TOKEN}:${MARQETA_ADMIN_TOKEN}`);

  const response = await fetch(`${MARQETA_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Marqeta API error: ${response.status} - ${error}`);
  }

  return response;
}

/**
 * Create or retrieve Marqeta user
 */
async function createOrGetMarqetaUser(
  ctx: any,
  userId: Id<"users">,
  user: any
): Promise<string> {
  // Generate a short token (max 36 chars) from the userId
  // Take the last 32 chars of the userId to stay under limit
  const shortId = userId.toString().slice(-32);
  const userToken = `u_${shortId}`;

  // First, try to find existing Marqeta user
  const getResponse = await fetch(`${MARQETA_BASE_URL}/users/${userToken}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`${MARQETA_APP_TOKEN}:${MARQETA_ADMIN_TOKEN}`)}`,
    },
  });

  if (getResponse.ok) {
    const existingUser = await getResponse.json();
    console.log(`Found existing Marqeta user: ${existingUser.token}`);
    return existingUser.token;
  }

  // User doesn't exist (404), create new one
  console.log(`Creating new Marqeta user with token: ${userToken}`);

  const createResponse = await fetch(`${MARQETA_BASE_URL}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`${MARQETA_APP_TOKEN}:${MARQETA_ADMIN_TOKEN}`)}`,
    },
    body: JSON.stringify({
      token: userToken,
      first_name: user.displayName || "DisCard",
      last_name: "User",
      email: user.email || undefined,
      active: true,
      metadata: {
        convex_user_id: userId,
      },
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create Marqeta user: ${createResponse.status} - ${error}`);
  }

  const data = await createResponse.json();
  console.log(`Created Marqeta user: ${data.token}`);
  return data.token;
}

/**
 * Create virtual card in Marqeta
 */
async function createMarqetaCard(userToken: string): Promise<{
  token: string;
  state: string;
}> {
  console.log(`Creating Marqeta card for user ${userToken} with product ${MARQETA_CARD_PRODUCT_TOKEN}`);

  const response = await marqetaRequest("/cards", {
    method: "POST",
    body: JSON.stringify({
      user_token: userToken,
      card_product_token: MARQETA_CARD_PRODUCT_TOKEN,
      metadata: {
        created_via: "discard_convex",
      },
    }),
  });

  const data = await response.json();
  console.log(`Created Marqeta card: ${data.token}`);
  return data;
}

/**
 * Get card details from Marqeta with retry logic
 */
async function getMarqetaCardDetails(
  cardToken: string,
  retryCount: number = 0
): Promise<{
  pan: string;
  cvv_number: string;
  expiration_month: number;
  expiration_year: number;
}> {
  console.log(`Getting card details for ${cardToken} (attempt ${retryCount + 1})`);
  try {
    // Virtual cards may take a moment to be ready for PAN retrieval
    const response = await marqetaRequest(`/cards/${cardToken}/showpan`);
    const data = await response.json();
    console.log(`Got card details: PAN ending ${data.pan?.slice(-4)}, expiration: ${JSON.stringify(data)}`);
    // Marqeta returns expiration as "expiration" in format "MMYY" or separate month/year fields
    return {
      pan: data.pan,
      cvv_number: data.cvv_number,
      expiration_month: data.exp_month ?? parseInt(data.expiration?.slice(0, 2) ?? "0"),
      expiration_year: data.exp_year ?? (2000 + parseInt(data.expiration?.slice(2, 4) ?? "0")),
    };
  } catch (error) {
    console.log(`Failed to get card details: ${error}`);
    if (retryCount < MAX_RETRIES) {
      // Exponential backoff
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return getMarqetaCardDetails(cardToken, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Activate card in Marqeta
 */
async function activateMarqetaCard(cardToken: string): Promise<void> {
  console.log(`Activating Marqeta card: ${cardToken}`);
  await marqetaRequest("/cardtransitions", {
    method: "POST",
    body: JSON.stringify({
      card_token: cardToken,
      state: "ACTIVE",
      channel: "API",
      reason_code: "00",
    }),
  });
  console.log(`Activated Marqeta card: ${cardToken}`);
}

// ============ AUTHORIZATION HANDLING ============

/**
 * Process authorization request from Marqeta webhook
 * This is called by the HTTP webhook handler
 *
 * Critical: Must respond within 800ms for sub-second authorization
 */
export const processAuthorization = internalAction({
  args: {
    marqetaCardToken: v.string(),
    marqetaTransactionToken: v.string(),
    amount: v.number(),                    // In cents
    currencyCode: v.string(),
    merchantName: v.string(),
    merchantMcc: v.string(),
    merchantCountry: v.optional(v.string()),
    merchantCity: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    approved: boolean;
    declineReason?: string;
    authorizationCode?: string;
    responseTimeMs: number;
  }> => {
    const startTime = Date.now();

    try {
      // Step 1: Find card by Marqeta token
      const card = await ctx.runQuery(internal.cards.cards.getByMarqetaToken, {
        marqetaCardToken: args.marqetaCardToken,
      });

      if (!card) {
        return {
          approved: false,
          declineReason: "CARD_NOT_FOUND",
          responseTimeMs: Date.now() - startTime,
        };
      }

      // Step 2: Check card status
      if (card.status !== "active") {
        return {
          approved: false,
          declineReason: `CARD_${card.status.toUpperCase()}`,
          responseTimeMs: Date.now() - startTime,
        };
      }

      // Step 3: Check balance
      const availableBalance = card.currentBalance + card.overdraftLimit - card.reservedBalance;
      if (availableBalance < args.amount) {
        return {
          approved: false,
          declineReason: "INSUFFICIENT_FUNDS",
          responseTimeMs: Date.now() - startTime,
        };
      }

      // Step 4: Check merchant restrictions
      if (card.blockedMccCodes?.includes(args.merchantMcc)) {
        return {
          approved: false,
          declineReason: "MCC_BLOCKED",
          responseTimeMs: Date.now() - startTime,
        };
      }

      if (args.merchantCountry && card.blockedCountries?.includes(args.merchantCountry)) {
        return {
          approved: false,
          declineReason: "COUNTRY_BLOCKED",
          responseTimeMs: Date.now() - startTime,
        };
      }

      // Step 5: Check spending limits
      if (args.amount > card.spendingLimit) {
        return {
          approved: false,
          declineReason: "EXCEEDS_SPENDING_LIMIT",
          responseTimeMs: Date.now() - startTime,
        };
      }

      // Step 6: Run fraud detection (parallel with other checks)
      const fraudResult = await ctx.runAction(internal.fraud.detection.analyzeTransaction, {
        cardId: card._id,
        cardContext: card.cardContext,
        amount: args.amount,
        merchantName: args.merchantName,
        merchantMcc: args.merchantMcc,
        merchantCountry: args.merchantCountry ?? "US",
      });

      if (fraudResult.action === "decline") {
        return {
          approved: false,
          declineReason: "FRAUD_SUSPECTED",
          responseTimeMs: Date.now() - startTime,
        };
      }

      // Step 7: Reserve balance
      const reserved = await ctx.runMutation(internal.cards.cards.reserveBalance, {
        cardId: card._id,
        amount: args.amount,
      });

      if (!reserved) {
        return {
          approved: false,
          declineReason: "BALANCE_RESERVATION_FAILED",
          responseTimeMs: Date.now() - startTime,
        };
      }

      // Step 8: Generate authorization code
      const authorizationCode = generateAuthorizationCode();

      // Step 9: Create authorization record
      await ctx.runMutation(internal.cards.createAuthorization, {
        cardId: card._id,
        cardContext: card.cardContext,
        marqetaTransactionToken: args.marqetaTransactionToken,
        authorizationCode,
        amount: args.amount,
        currencyCode: args.currencyCode,
        merchantName: args.merchantName,
        merchantMcc: args.merchantMcc,
        merchantCountry: args.merchantCountry,
        merchantCity: args.merchantCity,
        riskScore: fraudResult.riskScore,
        riskLevel: fraudResult.riskLevel,
        responseTimeMs: Date.now() - startTime,
      });

      // Step 10: Create authorization hold
      await ctx.runMutation(internal.cards.createAuthorizationHold, {
        cardId: card._id,
        cardContext: card.cardContext,
        authorizationCode,
        holdAmount: args.amount,
        merchantName: args.merchantName,
        merchantMcc: args.merchantMcc,
      });

      const responseTime = Date.now() - startTime;

      // Log warning if response time exceeds threshold
      if (responseTime > 800) {
        console.warn(`Authorization response time ${responseTime}ms exceeds 800ms threshold`);
      }

      return {
        approved: true,
        authorizationCode,
        responseTimeMs: responseTime,
      };
    } catch (error) {
      console.error("Authorization processing error:", error);
      return {
        approved: false,
        declineReason: "PROCESSING_ERROR",
        responseTimeMs: Date.now() - startTime,
      };
    }
  },
});

/**
 * Generate authorization code
 */
function generateAuthorizationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ============ INTERNAL MUTATIONS FOR AUTHORIZATION ============

export const createAuthorization = internalMutation({
  args: {
    cardId: v.id("cards"),
    cardContext: v.string(),
    marqetaTransactionToken: v.string(),
    authorizationCode: v.string(),
    amount: v.number(),
    currencyCode: v.string(),
    merchantName: v.string(),
    merchantMcc: v.string(),
    merchantCountry: v.optional(v.string()),
    merchantCity: v.optional(v.string()),
    riskScore: v.number(),
    riskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    responseTimeMs: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"authorizations">> => {
    return await ctx.db.insert("authorizations", {
      cardId: args.cardId,
      cardContext: args.cardContext,
      marqetaTransactionToken: args.marqetaTransactionToken,
      authorizationCode: args.authorizationCode,
      amount: args.amount,
      currencyCode: args.currencyCode,
      merchantName: args.merchantName,
      merchantMcc: args.merchantMcc,
      merchantCountry: args.merchantCountry,
      merchantCity: args.merchantCity,
      status: "approved",
      riskScore: args.riskScore,
      riskLevel: args.riskLevel,
      responseTimeMs: args.responseTimeMs,
      retryCount: 0,
      processedAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  },
});

export const createAuthorizationHold = internalMutation({
  args: {
    cardId: v.id("cards"),
    cardContext: v.string(),
    authorizationCode: v.string(),
    holdAmount: v.number(),
    merchantName: v.string(),
    merchantMcc: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"authorizationHolds">> => {
    // First, we need to get the authorization ID
    const auth = await ctx.db
      .query("authorizations")
      .withIndex("by_card_context", (q) => q.eq("cardContext", args.cardContext))
      .order("desc")
      .first();

    if (!auth) {
      throw new Error("Authorization not found");
    }

    return await ctx.db.insert("authorizationHolds", {
      cardId: args.cardId,
      authorizationId: auth._id,
      cardContext: args.cardContext,
      holdAmount: args.holdAmount,
      authorizationCode: args.authorizationCode,
      merchantName: args.merchantName,
      merchantMcc: args.merchantMcc,
      status: "active",
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  },
});
