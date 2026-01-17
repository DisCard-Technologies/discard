/**
 * MoonPay Integration Service
 *
 * Handles crypto on-ramp functionality via MoonPay:
 * - Generate signed widget URLs for crypto purchases
 * - Process webhook events for transaction updates
 * - Convert crypto to USD and credit user accounts
 * - AUTO-SHIELD: Deposits are automatically shielded to Privacy Cash pool
 */
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// MoonPay configuration
const MOONPAY_API_KEY = process.env.MOONPAY_API_KEY;
const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY;
const MOONPAY_BASE_URL = process.env.MOONPAY_ENVIRONMENT === "production"
  ? "https://buy.moonpay.com"
  : "https://buy-sandbox.moonpay.com";
const MOONPAY_API_URL = process.env.MOONPAY_ENVIRONMENT === "production"
  ? "https://api.moonpay.com"
  : "https://api.moonpay.com"; // Same URL, different API key

// Supported currencies for DisCard
const SUPPORTED_CRYPTO = ["eth", "usdc", "usdt", "sol"];
const SUPPORTED_FIAT = ["usd", "eur", "gbp"];

// ============ PUBLIC ACTIONS (for SDK) ============

/**
 * Sign a MoonPay URL for the React Native SDK
 * This is called by the frontend to get a signature for the widget URL
 */
export const signUrl = action({
  args: {
    urlToSign: v.string(),
  },
  handler: async (ctx, args): Promise<{ signature: string }> => {
    if (!MOONPAY_SECRET_KEY) {
      throw new Error("MoonPay secret key not configured");
    }

    // Extract query string directly - don't use URL() as it re-encodes and breaks signature
    // MoonPay expects the signature to include the leading `?`
    const questionIndex = args.urlToSign.indexOf('?');
    const queryStringWithQuestion = questionIndex !== -1
      ? args.urlToSign.substring(questionIndex)  // Include the ? in the signature
      : '';

    // Debug logging
    console.log("[MoonPay] URL to sign:", args.urlToSign);
    console.log("[MoonPay] Query string (with ?):", queryStringWithQuestion);
    console.log("[MoonPay] Secret key (first 20 chars):", MOONPAY_SECRET_KEY?.substring(0, 20) + "...");
    console.log("[MoonPay] Secret key length:", MOONPAY_SECRET_KEY?.length);

    const signature = await generateSignature(queryStringWithQuestion);

    console.log("[MoonPay] Generated signature:", signature);

    return { signature };
  },
});

// ============ QUERIES ============

/**
 * Get MoonPay transaction by ID
 */
export const getTransaction = query({
  args: {
    transactionId: v.id("moonpayTransactions"),
  },
  handler: async (ctx, args): Promise<Doc<"moonpayTransactions"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return null;

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.userId !== user._id) {
      return null;
    }

    return transaction;
  },
});

/**
 * Get user's MoonPay transaction history
 */
export const getTransactions = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("all"),
      v.literal("pending"),
      v.literal("waitingPayment"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    )),
  },
  handler: async (ctx, args): Promise<Doc<"moonpayTransactions">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    let transactions = await ctx.db
      .query("moonpayTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter by status if specified
    if (args.status && args.status !== "all") {
      transactions = transactions.filter((t) => t.status === args.status);
    }

    // Sort by creation date (newest first)
    transactions.sort((a, b) => b.createdAt - a.createdAt);

    // Apply limit
    const limit = args.limit ?? 50;
    return transactions.slice(0, limit);
  },
});

// ============ MUTATIONS ============

/**
 * Initialize a MoonPay transaction
 * Creates a pending record before redirecting to MoonPay widget
 */
export const initializeTransaction = mutation({
  args: {
    fiatCurrency: v.string(),
    fiatAmount: v.number(),        // In cents
    cryptoCurrency: v.string(),
  },
  handler: async (ctx, args): Promise<{
    transactionId: Id<"moonpayTransactions">;
  }> => {
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

    // Validate currencies
    const fiatLower = args.fiatCurrency.toLowerCase();
    const cryptoLower = args.cryptoCurrency.toLowerCase();

    if (!SUPPORTED_FIAT.includes(fiatLower)) {
      throw new Error(`Unsupported fiat currency: ${args.fiatCurrency}`);
    }

    if (!SUPPORTED_CRYPTO.includes(cryptoLower)) {
      throw new Error(`Unsupported crypto currency: ${args.cryptoCurrency}`);
    }

    // Validate amount (minimum $10)
    if (args.fiatAmount < 1000) {
      throw new Error("Minimum amount is $10");
    }

    // Create pending transaction record
    const transactionId = await ctx.db.insert("moonpayTransactions", {
      userId: user._id,
      moonpayTransactionId: `pending_${Date.now()}`, // Will be updated by webhook
      fiatCurrency: fiatLower,
      fiatAmount: args.fiatAmount,
      cryptoCurrency: cryptoLower,
      status: "pending",
      createdAt: Date.now(),
    });

    return { transactionId };
  },
});

// ============ ACTIONS ============

/**
 * Generate signed MoonPay widget URL
 */
export const createWidgetUrl = action({
  args: {
    transactionId: v.id("moonpayTransactions"),
    walletAddress: v.string(),     // Destination wallet for crypto
    redirectUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    if (!MOONPAY_API_KEY || !MOONPAY_SECRET_KEY) {
      throw new Error("MoonPay credentials not configured");
    }

    // Get the transaction record
    const transaction = await ctx.runQuery(internal.funding.moonpay.getTransactionInternal, {
      transactionId: args.transactionId,
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Build widget URL parameters
    const params = new URLSearchParams({
      apiKey: MOONPAY_API_KEY,
      currencyCode: transaction.cryptoCurrency,
      baseCurrencyCode: transaction.fiatCurrency,
      baseCurrencyAmount: (transaction.fiatAmount / 100).toString(),
      walletAddress: args.walletAddress,
      externalTransactionId: args.transactionId,
      showWalletAddressForm: "false",
    });

    if (args.redirectUrl) {
      params.append("redirectURL", args.redirectUrl);
    }

    // Generate signature - MoonPay requires the leading ? to be included
    const queryString = '?' + params.toString();
    const signature = await generateSignature(queryString);
    params.append("signature", signature);

    // Update transaction with wallet address
    await ctx.runMutation(internal.funding.moonpay.updateWalletAddress, {
      transactionId: args.transactionId,
      walletAddress: args.walletAddress,
    });

    return {
      url: `${MOONPAY_BASE_URL}?${params.toString()}`,
    };
  },
});

/**
 * Get MoonPay transaction status from API
 */
export const checkTransactionStatus = internalAction({
  args: {
    moonpayTransactionId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    status: string;
    cryptoAmount?: number;
    usdAmount?: number;
  }> => {
    if (!MOONPAY_SECRET_KEY) {
      throw new Error("MoonPay secret key not configured");
    }

    const response = await fetch(
      `${MOONPAY_API_URL}/v1/transactions/${args.moonpayTransactionId}`,
      {
        headers: {
          Authorization: `Api-Key ${MOONPAY_SECRET_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`MoonPay API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      status: data.status,
      cryptoAmount: data.quoteCurrencyAmount,
      usdAmount: data.usdRate ? Math.round(data.quoteCurrencyAmount * data.usdRate * 100) : undefined,
    };
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Internal query to get transaction
 */
export const getTransactionInternal = internalQuery({
  args: {
    transactionId: v.id("moonpayTransactions"),
  },
  handler: async (ctx, args): Promise<Doc<"moonpayTransactions"> | null> => {
    return await ctx.db.get(args.transactionId);
  },
});

/**
 * Update wallet address on transaction
 */
export const updateWalletAddress = internalMutation({
  args: {
    transactionId: v.id("moonpayTransactions"),
    walletAddress: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.transactionId, {
      walletAddress: args.walletAddress,
    });
  },
});

/**
 * Process MoonPay webhook - transaction created
 */
export const handleTransactionCreated = internalMutation({
  args: {
    externalTransactionId: v.string(),      // Our transaction ID
    moonpayTransactionId: v.string(),       // MoonPay's ID
    fiatCurrency: v.string(),
    fiatAmount: v.number(),
    cryptoCurrency: v.string(),
    walletAddress: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find our pending transaction
    const transaction = await ctx.db.get(args.externalTransactionId as Id<"moonpayTransactions">);

    if (!transaction) {
      console.error("MoonPay webhook: Transaction not found:", args.externalTransactionId);
      return;
    }

    // Update with MoonPay's transaction ID
    await ctx.db.patch(transaction._id, {
      moonpayTransactionId: args.moonpayTransactionId,
      status: "waitingPayment",
      walletAddress: args.walletAddress,
    });
  },
});

/**
 * Process MoonPay webhook - transaction status update
 */
export const handleTransactionUpdated = internalMutation({
  args: {
    moonpayTransactionId: v.string(),
    status: v.string(),
    cryptoAmount: v.optional(v.number()),
    moonpayFee: v.optional(v.number()),
    networkFee: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find transaction by MoonPay ID
    const transaction = await ctx.db
      .query("moonpayTransactions")
      .withIndex("by_moonpay_id", (q) => q.eq("moonpayTransactionId", args.moonpayTransactionId))
      .first();

    if (!transaction) {
      console.error("MoonPay webhook: Transaction not found:", args.moonpayTransactionId);
      return;
    }

    // Map MoonPay status to our status
    let status: "pending" | "waitingPayment" | "processing" | "completed" | "failed";
    switch (args.status) {
      case "waitingPayment":
        status = "waitingPayment";
        break;
      case "pending":
      case "waitingAuthorization":
        status = "processing";
        break;
      case "completed":
        status = "completed";
        break;
      case "failed":
      case "cancelled":
        status = "failed";
        break;
      default:
        status = "processing";
    }

    const updates: Partial<Doc<"moonpayTransactions">> = {
      status,
    };

    if (args.cryptoAmount !== undefined) {
      updates.cryptoAmount = args.cryptoAmount;
    }

    if (args.moonpayFee !== undefined) {
      updates.moonpayFee = Math.round(args.moonpayFee * 100); // Convert to cents
    }

    if (args.networkFee !== undefined) {
      updates.networkFee = Math.round(args.networkFee * 100);
    }

    if (args.failureReason) {
      updates.failureReason = args.failureReason;
    }

    if (status === "completed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(transaction._id, updates);
  },
});

/**
 * Process MoonPay webhook - transaction completed
 * Creates funding transaction and credits user account
 */
export const handleTransactionCompleted = internalMutation({
  args: {
    moonpayTransactionId: v.string(),
    cryptoAmount: v.number(),
    usdAmount: v.number(),           // USD value in cents
  },
  handler: async (ctx, args): Promise<void> => {
    // Find transaction by MoonPay ID
    const transaction = await ctx.db
      .query("moonpayTransactions")
      .withIndex("by_moonpay_id", (q) => q.eq("moonpayTransactionId", args.moonpayTransactionId))
      .first();

    if (!transaction) {
      console.error("MoonPay completed webhook: Transaction not found:", args.moonpayTransactionId);
      return;
    }

    // Prevent duplicate processing
    if (transaction.status === "completed" && transaction.fundingTransactionId) {
      console.log("MoonPay transaction already processed:", args.moonpayTransactionId);
      return;
    }

    // Update MoonPay transaction
    await ctx.db.patch(transaction._id, {
      status: "completed",
      cryptoAmount: args.cryptoAmount,
      usdAmount: args.usdAmount,
      completedAt: Date.now(),
    });

    // Create funding transaction to credit the account
    const fundingTransactionId = await ctx.db.insert("fundingTransactions", {
      userId: transaction.userId,
      transactionType: "account_funding",
      amount: args.usdAmount,
      currency: "USD",
      sourceType: "moonpay",
      sourceId: args.moonpayTransactionId,
      status: "completed",
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    // Link funding transaction to MoonPay transaction
    await ctx.db.patch(transaction._id, {
      fundingTransactionId,
    });

    console.log(`MoonPay transaction completed: ${args.moonpayTransactionId}, credited $${(args.usdAmount / 100).toFixed(2)}`);

    // PRIVACY CASH: Trigger auto-shield if using private deposit address
    if (transaction.walletAddress) {
      await ctx.scheduler.runAfter(0, internal.funding.moonpay.triggerAutoShield, {
        userId: transaction.userId,
        depositAddress: transaction.walletAddress,
        amount: args.usdAmount,
        moonpayTransactionId: args.moonpayTransactionId,
      });
    }
  },
});

/**
 * Auto-shield deposited funds to Privacy Cash pool
 * Called after MoonPay deposit completes
 */
export const triggerAutoShield = internalAction({
  args: {
    userId: v.id("users"),
    depositAddress: v.string(),
    amount: v.number(),
    moonpayTransactionId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    console.log("[AutoShield] Starting for:", args.depositAddress);
    try {
      // Get user's Turnkey org
      const turnkeyOrg = await ctx.runQuery(internal.tee.turnkey.getByUserIdInternal, {
        userId: args.userId,
      });
      if (!turnkeyOrg) {
        console.error("[AutoShield] No Turnkey org found");
        return;
      }

      // Look up session key for this deposit address
      const depositRecord = await ctx.runQuery(internal.funding.moonpay.getDepositAddressInternal, {
        depositAddress: args.depositAddress,
      });
      if (!depositRecord?.sessionKeyId) {
        console.log("[AutoShield] No session key - skipping");
        return;
      }

      // TODO: Build and sign shield transaction with Privacy Cash SDK
      console.log("[AutoShield] Would shield", args.amount, "to Privacy Cash pool");
      // Result would be stored via recordShieldedDeposit mutation
    } catch (error) {
      console.error("[AutoShield] Failed:", error);
    }
  },
});

/**
 * Get deposit address session key for auto-shield
 */
export const getDepositAddressInternal = internalQuery({
  args: { depositAddress: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("depositAddresses")
      .withIndex("by_address", (q) => q.eq("address", args.depositAddress))
      .first();
    return record ? { sessionKeyId: record.sessionKeyId, policyId: record.policyId } : null;
  },
});

/**
 * Process MoonPay webhook - transaction failed
 */
export const handleTransactionFailed = internalMutation({
  args: {
    moonpayTransactionId: v.string(),
    failureReason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const transaction = await ctx.db
      .query("moonpayTransactions")
      .withIndex("by_moonpay_id", (q) => q.eq("moonpayTransactionId", args.moonpayTransactionId))
      .first();

    if (!transaction) {
      console.error("MoonPay failed webhook: Transaction not found:", args.moonpayTransactionId);
      return;
    }

    await ctx.db.patch(transaction._id, {
      status: "failed",
      failureReason: args.failureReason,
    });
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Generate HMAC-SHA256 signature for MoonPay URL
 * Signs the query string WITH the leading ? (MoonPay requirement)
 */
async function generateSignature(queryString: string): Promise<string> {
  if (!MOONPAY_SECRET_KEY) {
    throw new Error("MoonPay secret key not configured");
  }

  // Use Web Crypto API for HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(MOONPAY_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign the query string (including the leading ?)
  console.log("[MoonPay] Actually signing:", queryString);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(queryString)
  );

  // Convert to base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify MoonPay webhook signature
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;

  const webhookSecret = process.env.MOONPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn("MOONPAY_WEBHOOK_SECRET not configured - skipping verification");
    return true; // Allow in development
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
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
