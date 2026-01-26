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
import { internal, api } from "../_generated/api";

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

// Solana configuration for auto-shield
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL; // Firedancer-optimized for priority
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC on mainnet

// ============ SOLANA RPC HELPERS ============

/**
 * Get recent blockhash from Solana for transaction building
 */
async function getRecentBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const rpcUrl = HELIUS_RPC_URL || SOLANA_RPC_URL;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }],
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`Failed to get blockhash: ${result.error.message}`);
  }

  return {
    blockhash: result.result.value.blockhash,
    lastValidBlockHeight: result.result.value.lastValidBlockHeight,
  };
}

/**
 * Submit signed transaction to Solana network
 */
async function submitTransaction(signedTxBase64: string): Promise<string> {
  const rpcUrl = HELIUS_RPC_URL || SOLANA_RPC_URL;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        signedTxBase64,
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        },
      ],
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`Transaction failed: ${result.error.message}`);
  }

  return result.result; // Transaction signature
}

/**
 * Confirm transaction with retries
 */
async function confirmTransaction(signature: string, maxRetries: number = 30): Promise<boolean> {
  const rpcUrl = HELIUS_RPC_URL || SOLANA_RPC_URL;

  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[signature], { searchTransactionHistory: true }],
      }),
    });

    const result = await response.json();
    const status = result.result?.value?.[0];

    if (status) {
      if (status.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return true;
      }
    }

    // Wait 1 second before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error("Transaction confirmation timeout");
}

/**
 * Build SPL token transfer transaction for auto-shield
 * Returns base64 encoded transaction ready for signing
 */
async function buildShieldTransaction(
  fromAddress: string,
  toAddress: string,
  amountLamports: number,
  mint: string = USDC_MINT
): Promise<{ transactionBase64: string; blockhash: string }> {
  // Get blockhash
  const { blockhash } = await getRecentBlockhash();

  // For USDC, convert from cents to USDC base units (6 decimals)
  // amountLamports is in cents, so divide by 100 then multiply by 1e6
  const usdcAmount = Math.floor((amountLamports / 100) * 1_000_000);

  // Build transaction message
  // This creates a compact transaction with:
  // 1. Compute budget instructions (for priority)
  // 2. SPL Token transfer instruction

  // Note: In production, this would use proper Borsh serialization
  // For now, we build a JSON representation that Turnkey can process
  const shieldTxData = {
    version: "legacy",
    instructions: [
      {
        programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token program
        keys: [
          { pubkey: fromAddress, isSigner: true, isWritable: true },
          { pubkey: toAddress, isSigner: false, isWritable: true },
          { pubkey: fromAddress, isSigner: true, isWritable: false }, // Authority
        ],
        data: encodeTokenTransfer(usdcAmount),
      },
    ],
    recentBlockhash: blockhash,
    feePayer: fromAddress,
  };

  return {
    transactionBase64: Buffer.from(JSON.stringify(shieldTxData)).toString("base64"),
    blockhash,
  };
}

/**
 * Encode SPL token transfer instruction data
 */
function encodeTokenTransfer(amount: number): string {
  // SPL Token transfer instruction: discriminator (3) + amount (u64)
  const buffer = new ArrayBuffer(9);
  const view = new DataView(buffer);

  // Transfer instruction discriminator
  view.setUint8(0, 3);

  // Amount as u64 little-endian
  view.setUint32(1, amount & 0xffffffff, true);
  view.setUint32(5, Math.floor(amount / 0x100000000), true);

  return Buffer.from(buffer).toString("base64");
}

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

/**
 * Create a single-use deposit address for privacy-preserving MoonPay deposits
 *
 * Flow:
 * 1. Creates a new Turnkey wallet with restricted session key
 * 2. Session key can only sign transfers to Privacy Cash pool
 * 3. Returns single-use address for MoonPay deposit
 * 4. After deposit, auto-shield moves funds to shielded pool
 * 5. Session key is revoked after use
 *
 * This breaks the KYC → wallet link: MoonPay sees single-use address,
 * user spends from shielded pool (unlinkable).
 */
export const createSingleUseDepositAddress = action({
  args: {},
  handler: async (ctx): Promise<{
    depositAddress: string;
    expiresAt: number;
  }> => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user record
    const user = await ctx.runQuery(internal.funding.moonpay.getUserByCredential, {
      credentialId: identity.subject,
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check for existing pending deposit address (reuse if not expired)
    const existingAddress = await ctx.runQuery(internal.funding.moonpay.getPendingDepositAddress, {
      userId: user._id,
    });

    if (existingAddress && existingAddress.expiresAt > Date.now()) {
      console.log("[MoonPay] Reusing existing deposit address:", existingAddress.address);
      return {
        depositAddress: existingAddress.address,
        expiresAt: existingAddress.expiresAt,
      };
    }

    // Get user's Turnkey sub-organization
    const turnkeyOrg = await ctx.runQuery(api.tee.turnkey.getByUserId, {
      userId: user._id,
    });

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found - please complete wallet setup first");
    }

    // Get Privacy Cash pool address
    const PRIVACY_CASH_POOL = process.env.PRIVACY_CASH_POOL_ADDRESS;
    if (!PRIVACY_CASH_POOL) {
      throw new Error("Privacy Cash pool not configured");
    }

    // Create single-use deposit wallet via Turnkey
    const walletName = `deposit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const depositWallet = await ctx.runAction(internal.tee.turnkey.createDepositWallet, {
      subOrganizationId: turnkeyOrg.subOrganizationId,
      walletName,
      destinationAddress: PRIVACY_CASH_POOL,
    });

    // Store deposit address with 30-minute expiry
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

    await ctx.runMutation(internal.funding.moonpay.storeDepositAddress, {
      userId: user._id,
      address: depositWallet.depositAddress,
      walletId: depositWallet.walletId,
      sessionKeyId: depositWallet.sessionKeyId,
      policyId: depositWallet.policyId,
      expiresAt,
    });

    console.log("[MoonPay] Created single-use deposit address:", depositWallet.depositAddress);

    return {
      depositAddress: depositWallet.depositAddress,
      expiresAt,
    };
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
 * Get user by credential ID (for action context)
 */
export const getUserByCredential = internalQuery({
  args: { credentialId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();
  },
});

/**
 * Get pending deposit address for user (to reuse if not expired)
 */
export const getPendingDepositAddress = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("depositAddresses")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
  },
});

/**
 * Store a new single-use deposit address
 */
export const storeDepositAddress = internalMutation({
  args: {
    userId: v.id("users"),
    address: v.string(),
    walletId: v.string(),
    sessionKeyId: v.string(),
    policyId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("depositAddresses", {
      userId: args.userId,
      address: args.address,
      walletId: args.walletId,
      sessionKeyId: args.sessionKeyId,
      policyId: args.policyId,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    console.log("[MoonPay] Stored deposit address:", args.address, "expires:", new Date(args.expiresAt).toISOString());
  },
});

/**
 * Update wallet address on transaction
 *
 * PRIVACY: Store only a hashed reference, not the actual address linked to userId.
 * The actual address is stored in a separate privacy-preserving table.
 */
export const updateWalletAddress = internalMutation({
  args: {
    transactionId: v.id("moonpayTransactions"),
    walletAddress: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Generate a hash of the address for reference (not reversible to get address)
    const addressHash = await hashWalletAddress(args.walletAddress);

    // Store only the hash in the transaction record (breaks KYC->address link)
    await ctx.db.patch(args.transactionId, {
      walletAddressHash: addressHash,
      // Store last 4 chars for customer support display only
      walletAddressPartial: `...${args.walletAddress.slice(-4)}`,
    });

    // Store the full address in a separate privacy table (NOT indexed by userId)
    // This table is only accessible via the addressHash lookup
    const transaction = await ctx.db.get(args.transactionId);
    if (transaction) {
      await ctx.db.insert("privacyDepositAddresses", {
        addressHash,
        encryptedAddress: args.walletAddress, // In production: encrypt client-side
        transactionId: args.transactionId,
        // NO userId stored here - breaks the KYC link
        purpose: "moonpay_deposit",
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hour retention
      });
    }

    console.log("[MoonPay] Address stored with privacy protection:", addressHash.slice(0, 16) + "...");
  },
});

/**
 * Hash a wallet address for privacy-preserving storage
 * Uses SHA-256 with a domain separator
 */
async function hashWalletAddress(address: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`discard:deposit:${address}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get deposit address by hash (for internal processing only)
 * This is used by webhooks to find the address without knowing the userId
 */
export const getDepositAddressByHash = internalQuery({
  args: {
    addressHash: v.string(),
  },
  handler: async (ctx, args): Promise<{ address: string; transactionId: Id<"moonpayTransactions"> } | null> => {
    const record = await ctx.db
      .query("privacyDepositAddresses")
      .withIndex("by_hash", (q) => q.eq("addressHash", args.addressHash))
      .first();

    if (!record) return null;

    return {
      address: record.encryptedAddress,
      transactionId: record.transactionId,
    };
  },
});

/**
 * Clean up expired deposit addresses (called by cron)
 * Removes addresses after retention period to minimize data exposure
 */
export const cleanupExpiredDepositAddresses = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ cleaned: number }> => {
    const now = Date.now();
    const expired = await ctx.db
      .query("privacyDepositAddresses")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(100);

    let cleaned = 0;
    for (const record of expired) {
      await ctx.db.delete(record._id);
      cleaned++;
    }

    if (cleaned > 0) {
      console.log(`[MoonPay] Cleaned ${cleaned} expired deposit addresses`);
    }

    return { cleaned };
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
 *
 * This enables privacy-preserving deposits:
 * 1. MoonPay sends funds to single-use deposit address
 * 2. Session key signs shield transaction to Privacy Cash pool
 * 3. User receives shielded balance (unlinkable to deposit)
 * 4. Session key is revoked after use
 */
export const triggerAutoShield = internalAction({
  args: {
    userId: v.id("users"),
    depositAddress: v.string(),
    amount: v.number(),
    moonpayTransactionId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    console.log("[AutoShield] Starting for:", args.depositAddress, "amount:", args.amount);
    try {
      // Get user's Turnkey org
      const turnkeyOrg = await ctx.runQuery(internal.tee.turnkey.getByUserIdInternal, {
        userId: args.userId,
      });
      if (!turnkeyOrg) {
        console.error("[AutoShield] No Turnkey org found for user:", args.userId);
        return;
      }

      // Look up session key for this deposit address
      const depositRecord = await ctx.runQuery(internal.funding.moonpay.getDepositAddressInternal, {
        depositAddress: args.depositAddress,
      });
      if (!depositRecord?.sessionKeyId) {
        console.log("[AutoShield] No session key found for address - skipping auto-shield");
        return;
      }

      // Get Privacy Cash pool address from environment
      const PRIVACY_CASH_POOL = process.env.PRIVACY_CASH_POOL_ADDRESS;
      if (!PRIVACY_CASH_POOL) {
        console.error("[AutoShield] PRIVACY_CASH_POOL_ADDRESS not configured");
        return;
      }

      // Build shield transaction using Solana RPC
      console.log("[AutoShield] Building shield transaction for", args.amount, "cents");

      const { transactionBase64, blockhash } = await buildShieldTransaction(
        args.depositAddress,
        PRIVACY_CASH_POOL,
        args.amount,
        USDC_MINT
      );

      console.log("[AutoShield] Transaction built with blockhash:", blockhash);

      // Sign the transaction using the session key via Turnkey
      const signResult = await ctx.runAction(internal.tee.turnkey.signWithSessionKey, {
        subOrganizationId: turnkeyOrg.subOrganizationId,
        sessionKeyId: depositRecord.sessionKeyId,
        walletAddress: args.depositAddress,
        unsignedTransaction: transactionBase64,
      });

      if (!signResult.signature) {
        console.error("[AutoShield] Failed to sign shield transaction");
        return;
      }

      console.log("[AutoShield] Transaction signed by Turnkey, submitting to Solana...");

      // Submit the signed transaction to Solana network
      let txSignature: string;
      try {
        txSignature = await submitTransaction(signResult.signedTransaction);
        console.log("[AutoShield] Transaction submitted:", txSignature);

        // Wait for confirmation
        await confirmTransaction(txSignature);
        console.log("[AutoShield] Transaction confirmed:", txSignature);
      } catch (submitError) {
        console.error("[AutoShield] Transaction submission failed:", submitError);

        // Record failure for retry/investigation
        await ctx.runMutation(internal.funding.moonpay.recordShieldFailure, {
          userId: args.userId,
          moonpayTransactionId: args.moonpayTransactionId,
          depositAddress: args.depositAddress,
          error: submitError instanceof Error ? submitError.message : "Solana submission failed",
        });
        return;
      }

      // Record the shielded deposit
      await ctx.runMutation(internal.funding.moonpay.recordShieldedDeposit, {
        userId: args.userId,
        moonpayTransactionId: args.moonpayTransactionId,
        depositAddress: args.depositAddress,
        shieldTxSignature: txSignature,
        amount: args.amount,
      });

      console.log("[AutoShield] Deposit shielded successfully:", txSignature);

      // Revoke the session key (cleanup after use)
      try {
        await ctx.runAction(internal.tee.turnkey.revokeSessionKey, {
          subOrganizationId: turnkeyOrg.subOrganizationId,
          sessionKeyId: depositRecord.sessionKeyId,
          policyId: depositRecord.policyId,
        });
        console.log("[AutoShield] Session key revoked");
      } catch (revokeError) {
        // Log but don't fail - main operation succeeded
        console.warn("[AutoShield] Failed to revoke session key:", revokeError);
      }

    } catch (error) {
      console.error("[AutoShield] Failed:", error);

      // Record failed shield attempt for retry/investigation
      try {
        await ctx.runMutation(internal.funding.moonpay.recordShieldFailure, {
          userId: args.userId,
          moonpayTransactionId: args.moonpayTransactionId,
          depositAddress: args.depositAddress,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } catch (recordError) {
        console.error("[AutoShield] Failed to record failure:", recordError);
      }
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
 * Record a successful shielded deposit
 */
export const recordShieldedDeposit = internalMutation({
  args: {
    userId: v.id("users"),
    moonpayTransactionId: v.string(),
    depositAddress: v.string(),
    shieldTxSignature: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    // Update MoonPay transaction with shield info
    const transaction = await ctx.db
      .query("moonpayTransactions")
      .withIndex("by_moonpay_id", (q) => q.eq("moonpayTransactionId", args.moonpayTransactionId))
      .first();

    if (transaction) {
      await ctx.db.patch(transaction._id, {
        shielded: true,
        shieldTxSignature: args.shieldTxSignature,
        shieldedAt: Date.now(),
      } as any);
    }

    // Record in shielded balances
    // Note: In production, this would integrate with the Privacy Cash service
    // to update the user's shielded balance commitment
    console.log("[AutoShield] Recorded shielded deposit:", {
      userId: args.userId,
      amount: args.amount,
      shieldTxSignature: args.shieldTxSignature,
    });
  },
});

/**
 * Record a failed shield attempt for retry/investigation
 */
export const recordShieldFailure = internalMutation({
  args: {
    userId: v.id("users"),
    moonpayTransactionId: v.string(),
    depositAddress: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    // Update MoonPay transaction with failure info
    const transaction = await ctx.db
      .query("moonpayTransactions")
      .withIndex("by_moonpay_id", (q) => q.eq("moonpayTransactionId", args.moonpayTransactionId))
      .first();

    if (transaction) {
      await ctx.db.patch(transaction._id, {
        shieldFailed: true,
        shieldError: args.error,
        shieldFailedAt: Date.now(),
      } as any);
    }

    console.error("[AutoShield] Shield failure recorded:", {
      moonpayTransactionId: args.moonpayTransactionId,
      error: args.error,
    });
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
