/**
 * Virtual IBAN Integration Service
 *
 * Handles virtual IBAN provisioning for direct bank deposits:
 * - Create virtual IBAN accounts for users
 * - Process incoming bank transfer notifications
 * - Convert EUR/GBP deposits to USD
 *
 * Supports providers:
 * - Stripe Treasury (recommended if on Stripe)
 * - Railsr (ClearBank) for UK/EU
 * - Wise Platform for global
 */
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// Provider configuration
const IBAN_PROVIDER = (process.env.IBAN_PROVIDER || "stripe_treasury") as
  | "stripe_treasury"
  | "railsr"
  | "wise";

// Stripe Treasury configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API_VERSION = "2023-10-16";
const STRIPE_BASE_URL = "https://api.stripe.com/v1";

// Default limits
const DEFAULT_DAILY_LIMIT = 500000;    // $5,000
const DEFAULT_MONTHLY_LIMIT = 5000000; // $50,000

// ============ QUERIES ============

/**
 * Get user's virtual IBAN
 */
export const getVirtualIban = query({
  args: {},
  handler: async (ctx): Promise<Doc<"virtualIbans"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return null;

    return await ctx.db
      .query("virtualIbans")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
  },
});

/**
 * Get IBAN deposit history
 */
export const getDepositHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"fundingTransactions">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    // Get IBAN-sourced funding transactions
    const transactions = await ctx.db
      .query("fundingTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("sourceType"), "iban"))
      .collect();

    // Sort by creation date (newest first)
    transactions.sort((a, b) => b.createdAt - a.createdAt);

    const limit = args.limit ?? 50;
    return transactions.slice(0, limit);
  },
});

// ============ MUTATIONS ============

/**
 * Request a virtual IBAN for the user
 */
export const requestVirtualIban = mutation({
  args: {},
  handler: async (ctx): Promise<{ ibanId: Id<"virtualIbans"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if user already has an IBAN
    const existingIban = await ctx.db
      .query("virtualIbans")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existingIban) {
      if (existingIban.status === "active") {
        throw new Error("You already have an active virtual IBAN");
      }
      if (existingIban.status === "pending") {
        throw new Error("Your virtual IBAN is being provisioned");
      }
    }

    // Check KYC status - require verification for IBAN
    if (user.kycStatus !== "verified") {
      throw new Error("KYC verification required for virtual IBAN");
    }

    // Create pending IBAN record
    const ibanId = await ctx.db.insert("virtualIbans", {
      userId: user._id,
      iban: "",                    // Will be populated by provider
      bic: "",
      accountHolderName: user.displayName || "DisCard User",
      bankName: "",
      provider: IBAN_PROVIDER,
      externalAccountId: "",
      status: "pending",
      dailyLimit: DEFAULT_DAILY_LIMIT,
      monthlyLimit: DEFAULT_MONTHLY_LIMIT,
      createdAt: Date.now(),
    });

    // Schedule IBAN provisioning
    await ctx.scheduler.runAfter(0, internal.funding.iban.provisionIban, {
      ibanId,
      userId: user._id,
      displayName: user.displayName || "DisCard User",
    });

    return { ibanId };
  },
});

/**
 * Close virtual IBAN
 */
export const closeVirtualIban = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const iban = await ctx.db
      .query("virtualIbans")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!iban) {
      throw new Error("No virtual IBAN found");
    }

    if (iban.status === "closed") {
      throw new Error("IBAN is already closed");
    }

    // Schedule closure with provider
    await ctx.scheduler.runAfter(0, internal.funding.iban.closeIbanWithProvider, {
      ibanId: iban._id,
    });

    // Update status to closed
    await ctx.db.patch(iban._id, {
      status: "closed",
    });
  },
});

// ============ INTERNAL ACTIONS ============

/**
 * Provision IBAN with provider
 */
export const provisionIban = internalAction({
  args: {
    ibanId: v.id("virtualIbans"),
    userId: v.id("users"),
    displayName: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      let result: {
        iban: string;
        bic: string;
        bankName: string;
        externalAccountId: string;
      };

      switch (IBAN_PROVIDER) {
        case "stripe_treasury":
          result = await provisionStripeTreasuryAccount(args.displayName);
          break;
        case "railsr":
          result = await provisionRailsrAccount(args.displayName);
          break;
        case "wise":
          result = await provisionWiseAccount(args.displayName);
          break;
        default:
          throw new Error(`Unknown IBAN provider: ${IBAN_PROVIDER}`);
      }

      // Update IBAN record with provisioned details
      await ctx.runMutation(internal.funding.iban.activateIban, {
        ibanId: args.ibanId,
        iban: result.iban,
        bic: result.bic,
        bankName: result.bankName,
        externalAccountId: result.externalAccountId,
      });

    } catch (error) {
      console.error("Failed to provision IBAN:", error);

      await ctx.runMutation(internal.funding.iban.failIbanProvisioning, {
        ibanId: args.ibanId,
        error: error instanceof Error ? error.message : "Provisioning failed",
      });
    }
  },
});

/**
 * Close IBAN with provider
 */
export const closeIbanWithProvider = internalAction({
  args: {
    ibanId: v.id("virtualIbans"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Get IBAN details
    const iban = await ctx.runQuery(internal.funding.iban.getIbanInternal, {
      ibanId: args.ibanId,
    });

    if (!iban) return;

    try {
      switch (iban.provider) {
        case "stripe_treasury":
          await closeStripeTreasuryAccount(iban.externalAccountId);
          break;
        case "railsr":
          await closeRailsrAccount(iban.externalAccountId);
          break;
        case "wise":
          await closeWiseAccount(iban.externalAccountId);
          break;
      }
    } catch (error) {
      console.error("Failed to close IBAN with provider:", error);
    }
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Get IBAN record internally
 */
export const getIbanInternal = internalQuery({
  args: {
    ibanId: v.id("virtualIbans"),
  },
  handler: async (ctx, args): Promise<Doc<"virtualIbans"> | null> => {
    return await ctx.db.get(args.ibanId);
  },
});

/**
 * Activate IBAN after successful provisioning
 */
export const activateIban = internalMutation({
  args: {
    ibanId: v.id("virtualIbans"),
    iban: v.string(),
    bic: v.string(),
    bankName: v.string(),
    externalAccountId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.ibanId, {
      iban: args.iban,
      bic: args.bic,
      bankName: args.bankName,
      externalAccountId: args.externalAccountId,
      status: "active",
      activatedAt: Date.now(),
    });
  },
});

/**
 * Mark IBAN provisioning as failed
 */
export const failIbanProvisioning = internalMutation({
  args: {
    ibanId: v.id("virtualIbans"),
    error: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Delete the failed record
    await ctx.db.delete(args.ibanId);
    console.error("IBAN provisioning failed:", args.error);
  },
});

/**
 * Process incoming IBAN deposit
 * Called by webhook handler when bank transfer is received
 */
export const processDeposit = internalMutation({
  args: {
    externalAccountId: v.string(),
    amount: v.number(),              // Amount in cents (original currency)
    currency: v.string(),            // EUR, GBP, USD
    usdAmount: v.number(),           // Converted USD amount in cents
    senderName: v.optional(v.string()),
    senderIban: v.optional(v.string()),
    reference: v.optional(v.string()),
    providerTransactionId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find IBAN by external account ID
    const iban = await ctx.db
      .query("virtualIbans")
      .withIndex("by_external_id", (q) => q.eq("externalAccountId", args.externalAccountId))
      .first();

    if (!iban) {
      console.error("IBAN deposit: Account not found:", args.externalAccountId);
      return;
    }

    if (iban.status !== "active") {
      console.error("IBAN deposit: Account not active:", args.externalAccountId);
      return;
    }

    // Check daily limit
    const dailyTotal = await checkDailyTotal(ctx, iban.userId);
    if (dailyTotal + args.usdAmount > iban.dailyLimit) {
      console.error("IBAN deposit: Daily limit exceeded for user:", iban.userId);
      // In production, you'd want to hold the funds and notify the user
      return;
    }

    // Check monthly limit
    const monthlyTotal = await checkMonthlyTotal(ctx, iban.userId);
    if (monthlyTotal + args.usdAmount > iban.monthlyLimit) {
      console.error("IBAN deposit: Monthly limit exceeded for user:", iban.userId);
      return;
    }

    // Create funding transaction
    await ctx.db.insert("fundingTransactions", {
      userId: iban.userId,
      transactionType: "account_funding",
      amount: args.usdAmount,
      currency: "USD",
      convertedAmount: args.currency !== "USD" ? args.amount : undefined,
      conversionRate: args.currency !== "USD" ? args.usdAmount / args.amount : undefined,
      sourceType: "iban",
      sourceId: args.providerTransactionId,
      status: "completed",
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    console.log(`IBAN deposit processed: ${args.providerTransactionId}, credited $${(args.usdAmount / 100).toFixed(2)}`);
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Check daily deposit total for user
 */
async function checkDailyTotal(ctx: any, userId: Id<"users">): Promise<number> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const transactions = await ctx.db
    .query("fundingTransactions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field("sourceType"), "iban"),
        q.gte(q.field("createdAt"), dayStart.getTime()),
        q.eq(q.field("status"), "completed")
      )
    )
    .collect();

  return transactions.reduce((sum: number, t: any) => sum + t.amount, 0);
}

/**
 * Check monthly deposit total for user
 */
async function checkMonthlyTotal(ctx: any, userId: Id<"users">): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const transactions = await ctx.db
    .query("fundingTransactions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field("sourceType"), "iban"),
        q.gte(q.field("createdAt"), monthStart.getTime()),
        q.eq(q.field("status"), "completed")
      )
    )
    .collect();

  return transactions.reduce((sum: number, t: any) => sum + t.amount, 0);
}

// ============ PROVIDER IMPLEMENTATIONS ============

/**
 * Stripe Treasury - Create financial account with IBAN
 */
async function provisionStripeTreasuryAccount(displayName: string): Promise<{
  iban: string;
  bic: string;
  bankName: string;
  externalAccountId: string;
}> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key not configured");
  }

  // Create financial account
  const accountResponse = await fetch(`${STRIPE_BASE_URL}/treasury/financial_accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: (() => {
      const params = new URLSearchParams();
      params.append("supported_currencies[]", "usd");
      params.append("supported_currencies[]", "eur");
      params.append("features[inbound_transfers][ach][requested]", "true");
      params.append("features[financial_addresses][aba][requested]", "true");
      return params;
    })(),
  });

  if (!accountResponse.ok) {
    const error = await accountResponse.json();
    throw new Error(error.error?.message || "Failed to create financial account");
  }

  const account = await accountResponse.json();

  // Get financial addresses (IBAN)
  const addressResponse = await fetch(
    `${STRIPE_BASE_URL}/treasury/financial_accounts/${account.id}/financial_addresses`,
    {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Stripe-Version": STRIPE_API_VERSION,
      },
    }
  );

  if (!addressResponse.ok) {
    throw new Error("Failed to get financial addresses");
  }

  const addresses = await addressResponse.json();
  const ibanAddress = addresses.data.find((a: any) => a.type === "iban");

  if (!ibanAddress) {
    // Stripe Treasury in US may not have IBAN, use ABA instead
    const abaAddress = addresses.data.find((a: any) => a.type === "aba");
    if (abaAddress) {
      return {
        iban: `US${abaAddress.aba.routing_number}${abaAddress.aba.account_number}`,
        bic: "STRIPE",
        bankName: "Stripe Treasury",
        externalAccountId: account.id,
      };
    }
    throw new Error("No financial address available");
  }

  return {
    iban: ibanAddress.iban.iban,
    bic: ibanAddress.iban.bic,
    bankName: "Stripe Treasury",
    externalAccountId: account.id,
  };
}

/**
 * Stripe Treasury - Close financial account
 */
async function closeStripeTreasuryAccount(externalAccountId: string): Promise<void> {
  if (!STRIPE_SECRET_KEY) return;

  await fetch(`${STRIPE_BASE_URL}/treasury/financial_accounts/${externalAccountId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: new URLSearchParams({
      status: "closed",
    }),
  });
}

/**
 * Railsr (ClearBank) - Create account with IBAN
 * Placeholder - implement based on Railsr API docs
 */
async function provisionRailsrAccount(displayName: string): Promise<{
  iban: string;
  bic: string;
  bankName: string;
  externalAccountId: string;
}> {
  const apiKey = process.env.RAILSR_API_KEY;
  if (!apiKey) {
    throw new Error("Railsr API key not configured");
  }

  // TODO: Implement Railsr API integration
  // https://docs.railsr.com/

  throw new Error("Railsr integration not yet implemented");
}

async function closeRailsrAccount(externalAccountId: string): Promise<void> {
  // TODO: Implement
}

/**
 * Wise Platform - Create account with multi-currency IBANs
 * Placeholder - implement based on Wise API docs
 */
async function provisionWiseAccount(displayName: string): Promise<{
  iban: string;
  bic: string;
  bankName: string;
  externalAccountId: string;
}> {
  const apiKey = process.env.WISE_API_KEY;
  if (!apiKey) {
    throw new Error("Wise API key not configured");
  }

  // TODO: Implement Wise Platform API integration
  // https://api-docs.wise.com/

  throw new Error("Wise integration not yet implemented");
}

async function closeWiseAccount(externalAccountId: string): Promise<void> {
  // TODO: Implement
}

// ============ WEBHOOK SIGNATURE VERIFICATION ============

/**
 * Verify Stripe Treasury webhook signature
 */
export async function verifyStripeTreasurySignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("STRIPE_WEBHOOK_SECRET not configured");
    return true; // Allow in development
  }

  // Stripe signature format: t=timestamp,v1=signature
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sig = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!timestamp || !sig) return false;

  const payload = `${timestamp}.${body}`;
  const encoder = new TextEncoder();

  try {
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
