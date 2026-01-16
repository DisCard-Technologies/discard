/**
 * Starpay Card Issuing Integration
 *
 * Convex actions for interacting with the Starpay API to:
 * - Create prepaid virtual cards (Black or Platinum)
 * - Fund Platinum cards (with privacy-preserving top-ups)
 * - Manage card lifecycle (freeze, unfreeze, close)
 *
 * Card Types:
 * - Starpay Black: Prepaid, one-time use, no top-ups, 0.2% fee
 * - Starpay Platinum: Reloadable, requires 10M $STARPAY tokens
 *
 * Privacy Features:
 * - Balance commitments hide actual amounts
 * - Single-use addresses for top-ups
 * - No on-chain correlation between user and card
 */
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// Starpay API configuration
const STARPAY_API_URL = process.env.STARPAY_API_URL ?? "https://api.starpay.cards/v1";
const STARPAY_API_KEY = process.env.STARPAY_API_KEY;

// Fee configuration
const ISSUANCE_FEE_PERCENT = 0.002; // 0.2%
const MIN_ISSUANCE_FEE_CENTS = 500; // $5
const MAX_ISSUANCE_FEE_CENTS = 50000; // $500

// Default limits
const DEFAULT_MAX_SINGLE_TOPUP_CENTS = 100000; // $1,000
const DEFAULT_DAILY_TOPUP_LIMIT_CENTS = 500000; // $5,000

// ============ UTILITY FUNCTIONS ============

/**
 * Calculate issuance fee for Starpay Black cards
 * Fee: 0.2% of amount, min $5, max $500
 */
function calculateIssuanceFee(amountCents: number): number {
  const feePercent = amountCents * ISSUANCE_FEE_PERCENT;
  return Math.max(MIN_ISSUANCE_FEE_CENTS, Math.min(MAX_ISSUANCE_FEE_CENTS, Math.round(feePercent)));
}

/**
 * Generate balance commitment for privacy
 * commitment = SHA256(cardId || amount || timestamp || randomness)
 */
async function generateBalanceCommitment(
  cardId: string,
  amount: number,
  timestamp: number,
  randomness: string
): Promise<string> {
  const data = new TextEncoder().encode(
    `${cardId}||${amount}||${timestamp}||${randomness}`
  );
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate random bytes for commitment
 */
function generateRandomness(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Make authenticated request to Starpay API
 */
async function starpayRequest<T>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!STARPAY_API_KEY) {
    throw new Error("Starpay API key not configured. Set STARPAY_API_KEY in Convex environment.");
  }

  const response = await fetch(`${STARPAY_API_URL}${endpoint}`, {
    method,
    headers: {
      "Authorization": `Bearer ${STARPAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Starpay API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

// ============ INTERNAL ACTIONS ============

/**
 * Provision a new Starpay card
 */
export const provisionCard = internalAction({
  args: {
    cardId: v.id("cards"),
    userId: v.id("users"),
    cardType: v.union(v.literal("black"), v.literal("platinum")),
    initialAmount: v.number(), // In cents
  },
  handler: async (ctx, args): Promise<void> => {
    console.log(`[Starpay] Provisioning ${args.cardType} card ${args.cardId}, amount: $${args.initialAmount / 100}`);

    if (!STARPAY_API_KEY) {
      throw new Error("Starpay API key not configured");
    }

    try {
      // Get user details
      const user = await ctx.runQuery(internal.auth.passkeys.getUserById, {
        userId: args.userId,
      });
      if (!user) {
        throw new Error("User not found");
      }

      // Calculate fee for Black cards
      const issuanceFee = args.cardType === "black" ? calculateIssuanceFee(args.initialAmount) : 0;
      const netAmount = args.initialAmount - issuanceFee;

      // Create card via Starpay API
      const cardResponse = await starpayRequest<{
        card_id: string;
        card_number: string;
        cvv: string;
        expiry_month: number;
        expiry_year: number;
        balance: number;
        status: string;
      }>("POST", "/cards", {
        type: args.cardType,
        amount: netAmount,
        currency: "USD",
        metadata: {
          user_id: args.userId,
          card_id: args.cardId,
        },
      });

      // Generate balance commitment for privacy
      const timestamp = Date.now();
      const randomness = generateRandomness();
      const commitment = await generateBalanceCommitment(
        args.cardId,
        cardResponse.balance,
        timestamp,
        randomness
      );

      // Update card record in Convex
      await ctx.runMutation(internal.cards.starpay.updateFromStarpay, {
        cardId: args.cardId,
        starpayCardId: cardResponse.card_id,
        starpayCardType: args.cardType,
        last4: cardResponse.card_number.slice(-4),
        expirationMonth: cardResponse.expiry_month,
        expirationYear: cardResponse.expiry_year,
        prepaidBalance: cardResponse.balance,
        balanceCommitment: commitment,
        balanceRandomness: randomness,
        issuanceFee,
      });

      console.log(`Card ${args.cardId} provisioned with Starpay ID ${cardResponse.card_id}`);
    } catch (error) {
      console.error(`Failed to provision Starpay card ${args.cardId}:`, error);
      throw error;
    }
  },
});

/**
 * Fund a Platinum card (top-up)
 */
export const fundCard = internalAction({
  args: {
    cardId: v.id("cards"),
    amount: v.number(), // In cents
    singleUseAddress: v.optional(v.string()), // Privacy-preserving funding source
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    newBalance?: number;
    transactionId?: string;
    error?: string;
  }> => {
    console.log(`[Starpay] Funding card ${args.cardId} with $${args.amount / 100}`);

    try {
      // Get card details
      const card = await ctx.runQuery(internal.cards.starpay.getCardById, {
        cardId: args.cardId,
      });

      if (!card) {
        return { success: false, error: "Card not found" };
      }

      if (card.provider !== "starpay") {
        return { success: false, error: "Card is not a Starpay card" };
      }

      if (card.starpayCardType === "black") {
        return { success: false, error: "Black cards cannot be topped up" };
      }

      // Check daily limit
      const now = Date.now();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const totalToday = card.topUpResetAt && card.topUpResetAt > todayStart
        ? (card.totalTopUpToday ?? 0)
        : 0;

      const dailyLimit = card.dailyTopUpLimit ?? DEFAULT_DAILY_TOPUP_LIMIT_CENTS;
      if (totalToday + args.amount > dailyLimit) {
        return {
          success: false,
          error: `Daily top-up limit exceeded. Limit: $${dailyLimit / 100}, Used: $${totalToday / 100}`,
        };
      }

      // Check single top-up limit
      const maxSingle = card.maxSingleTopUp ?? DEFAULT_MAX_SINGLE_TOPUP_CENTS;
      if (args.amount > maxSingle) {
        return {
          success: false,
          error: `Max single top-up exceeded. Limit: $${maxSingle / 100}`,
        };
      }

      // Fund via Starpay API
      const response = await starpayRequest<{
        transaction_id: string;
        new_balance: number;
      }>("POST", `/cards/${card.providerCardToken}/fund`, {
        amount: args.amount,
        source_address: args.singleUseAddress,
      });

      // Generate new balance commitment
      const timestamp = Date.now();
      const randomness = generateRandomness();
      const commitment = await generateBalanceCommitment(
        args.cardId,
        response.new_balance,
        timestamp,
        randomness
      );

      // Update card record
      await ctx.runMutation(internal.cards.starpay.updateBalance, {
        cardId: args.cardId,
        newBalance: response.new_balance,
        balanceCommitment: commitment,
        balanceRandomness: randomness,
        topUpAmount: args.amount,
      });

      return {
        success: true,
        newBalance: response.new_balance,
        transactionId: response.transaction_id,
      };
    } catch (error) {
      console.error(`Failed to fund card ${args.cardId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Freeze a Starpay card
 */
export const freezeCard = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<void> => {
    const card = await ctx.runQuery(internal.cards.starpay.getCardById, {
      cardId: args.cardId,
    });

    if (!card || !card.providerCardToken) {
      throw new Error("Card not found or missing Starpay token");
    }

    await starpayRequest("POST", `/cards/${card.providerCardToken}/freeze`, {});

    await ctx.runMutation(internal.cards.cards.updateStatus, {
      cardId: args.cardId,
      status: "frozen",
    });
  },
});

/**
 * Unfreeze a Starpay card
 */
export const unfreezeCard = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<void> => {
    const card = await ctx.runQuery(internal.cards.starpay.getCardById, {
      cardId: args.cardId,
    });

    if (!card || !card.providerCardToken) {
      throw new Error("Card not found or missing Starpay token");
    }

    await starpayRequest("POST", `/cards/${card.providerCardToken}/unfreeze`, {});

    await ctx.runMutation(internal.cards.cards.updateStatus, {
      cardId: args.cardId,
      status: "active",
    });
  },
});

/**
 * Close a Starpay card
 */
export const closeCard = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<void> => {
    const card = await ctx.runQuery(internal.cards.starpay.getCardById, {
      cardId: args.cardId,
    });

    if (!card || !card.providerCardToken) {
      throw new Error("Card not found or missing Starpay token");
    }

    await starpayRequest("DELETE", `/cards/${card.providerCardToken}`, {});

    await ctx.runMutation(internal.cards.cards.updateStatus, {
      cardId: args.cardId,
      status: "terminated",
    });
  },
});

/**
 * Get card details (PAN, CVV) from Starpay
 */
export const getCardDetails = internalAction({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<{
    pan: string;
    cvv: string;
    expirationMonth: number;
    expirationYear: number;
  }> => {
    const card = await ctx.runQuery(internal.cards.starpay.getCardById, {
      cardId: args.cardId,
    });

    if (!card || !card.providerCardToken) {
      throw new Error("Card not found or missing Starpay token");
    }

    const response = await starpayRequest<{
      card_number: string;
      cvv: string;
      expiry_month: number;
      expiry_year: number;
    }>("GET", `/cards/${card.providerCardToken}/details`);

    return {
      pan: response.card_number,
      cvv: response.cvv,
      expirationMonth: response.expiry_month,
      expirationYear: response.expiry_year,
    };
  },
});

// ============ INTERNAL QUERIES ============

/**
 * Get card by ID (internal)
 */
export const getCardById = internalQuery({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.cardId);
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Update card after Starpay provisioning
 */
export const updateFromStarpay = internalMutation({
  args: {
    cardId: v.id("cards"),
    starpayCardId: v.string(),
    starpayCardType: v.union(v.literal("black"), v.literal("platinum")),
    last4: v.string(),
    expirationMonth: v.number(),
    expirationYear: v.number(),
    prepaidBalance: v.number(),
    balanceCommitment: v.string(),
    balanceRandomness: v.string(),
    issuanceFee: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cardId, {
      provider: "starpay",
      providerCardToken: args.starpayCardId,
      starpayCardType: args.starpayCardType,
      last4: args.last4,
      expirationMonth: args.expirationMonth,
      expirationYear: args.expirationYear,
      prepaidBalance: args.prepaidBalance,
      balanceCommitment: args.balanceCommitment,
      balanceRandomness: args.balanceRandomness,
      currentBalance: args.prepaidBalance, // For display consistency
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update card balance after top-up
 */
export const updateBalance = internalMutation({
  args: {
    cardId: v.id("cards"),
    newBalance: v.number(),
    balanceCommitment: v.string(),
    balanceRandomness: v.string(),
    topUpAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);

    // Reset daily counter if new day
    const totalToday = card.topUpResetAt && card.topUpResetAt > todayStart
      ? (card.totalTopUpToday ?? 0) + args.topUpAmount
      : args.topUpAmount;

    await ctx.db.patch(args.cardId, {
      prepaidBalance: args.newBalance,
      currentBalance: args.newBalance, // For display consistency
      balanceCommitment: args.balanceCommitment,
      balanceRandomness: args.balanceRandomness,
      lastTopUpAt: now,
      totalTopUpToday: totalToday,
      topUpResetAt: now,
      updatedAt: now,
    });
  },
});

// ============ PUBLIC QUERIES ============

/**
 * Get issuance fee estimate for Black card
 */
export const getIssuanceFeeEstimate = internalQuery({
  args: {
    amount: v.number(), // In cents
  },
  handler: async (_ctx, args) => {
    const fee = calculateIssuanceFee(args.amount);
    return {
      grossAmount: args.amount,
      fee,
      netAmount: args.amount - fee,
      feePercent: ISSUANCE_FEE_PERCENT * 100,
    };
  },
});
