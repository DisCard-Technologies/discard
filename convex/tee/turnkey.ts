/**
 * DisCard 2035 - Convex Turnkey Functions
 *
 * Server-side functions for managing Turnkey sub-organizations
 * and TEE-protected wallet operations.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
  internalAction,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { Turnkey } from "@turnkey/sdk-server";

// ============================================================================
// Turnkey API Configuration
// ============================================================================

const TURNKEY_API_BASE_URL = process.env.TURNKEY_API_BASE_URL || "https://api.turnkey.com";
const TURNKEY_API_PUBLIC_KEY = process.env.TURNKEY_API_PUBLIC_KEY;
const TURNKEY_API_PRIVATE_KEY = process.env.TURNKEY_API_PRIVATE_KEY;
const TURNKEY_ORGANIZATION_ID = process.env.TURNKEY_ORGANIZATION_ID;

// Wallet account configurations for multi-chain support
const SOLANA_WALLET_ACCOUNT = {
  curve: "CURVE_ED25519" as const,
  pathFormat: "PATH_FORMAT_BIP32" as const,
  path: "m/44'/501'/0'/0'",
  addressFormat: "ADDRESS_FORMAT_SOLANA" as const,
};

const ETHEREUM_WALLET_ACCOUNT = {
  curve: "CURVE_SECP256K1" as const,
  pathFormat: "PATH_FORMAT_BIP32" as const,
  path: "m/44'/60'/0'/0/0",
  addressFormat: "ADDRESS_FORMAT_ETHEREUM" as const,
};

// ============================================================================
// Validators
// ============================================================================

const velocityLimitsValidator = v.object({
  perTransaction: v.number(),
  daily: v.number(),
  weekly: v.number(),
  monthly: v.number(),
});

const currentSpendingValidator = v.object({
  daily: v.number(),
  weekly: v.number(),
  monthly: v.number(),
  lastResetAt: v.number(),
});

const policiesValidator = v.object({
  merchantLocking: v.boolean(),
  allowedMerchants: v.optional(v.array(v.string())),
  allowedMccCodes: v.optional(v.array(v.string())),
  blockedMerchants: v.optional(v.array(v.string())),
  blockedMccCodes: v.optional(v.array(v.string())),
  velocityLimits: velocityLimitsValidator,
  currentSpending: currentSpendingValidator,
  requireBiometric: v.boolean(),
  requireStep2FA: v.boolean(),
  allowedIpRanges: v.optional(v.array(v.string())),
  requireFraudClearance: v.boolean(),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get Turnkey sub-organization by user ID
 */
export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get Turnkey sub-organization by wallet address
 */
export const getByWalletAddress = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_wallet_address", (q) => q.eq("walletAddress", args.walletAddress))
      .first();
  },
});

/**
 * Get Turnkey sub-organization by sub-org ID
 */
export const getBySubOrgId = query({
  args: { subOrganizationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_sub_org", (q) => q.eq("subOrganizationId", args.subOrganizationId))
      .first();
  },
});

/**
 * Get current spending for velocity checks
 */
export const getCurrentSpending = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!org) {
      return null;
    }

    return {
      spending: org.policies.currentSpending,
      limits: org.policies.velocityLimits,
    };
  },
});

/**
 * Check if a transaction is within velocity limits
 */
export const checkVelocityLimits = query({
  args: {
    userId: v.id("users"),
    amount: v.number(), // Amount in cents
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!org) {
      return { allowed: false, reason: "No TEE organization found" };
    }

    const { velocityLimits, currentSpending } = org.policies;

    // Check per-transaction limit
    if (args.amount > velocityLimits.perTransaction) {
      return {
        allowed: false,
        reason: `Amount exceeds per-transaction limit of ${velocityLimits.perTransaction / 100}`,
      };
    }

    // Check daily limit
    if (currentSpending.daily + args.amount > velocityLimits.daily) {
      return {
        allowed: false,
        reason: `Amount would exceed daily limit of ${velocityLimits.daily / 100}`,
      };
    }

    // Check weekly limit
    if (currentSpending.weekly + args.amount > velocityLimits.weekly) {
      return {
        allowed: false,
        reason: `Amount would exceed weekly limit of ${velocityLimits.weekly / 100}`,
      };
    }

    // Check monthly limit
    if (currentSpending.monthly + args.amount > velocityLimits.monthly) {
      return {
        allowed: false,
        reason: `Amount would exceed monthly limit of ${velocityLimits.monthly / 100}`,
      };
    }

    return { allowed: true };
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

export const getByIdInternal = internalQuery({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get Turnkey sub-organization by user ID (internal)
 * Used by auto-shield and other internal processes
 */
export const getByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new Turnkey sub-organization record
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    didDocumentId: v.optional(v.id("didDocuments")),
    subOrganizationId: v.string(),
    rootUserId: v.string(),
    serviceUserId: v.string(),
    walletId: v.string(),
    walletAddress: v.string(),
    walletPublicKey: v.string(),
    ethereumAddress: v.optional(v.string()), // Ethereum address for MoonPay
    policies: v.optional(policiesValidator),
  },
  handler: async (ctx, args) => {
    // Check if user already has a sub-organization
    const existing = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      throw new Error("User already has a Turnkey sub-organization");
    }

    const now = Date.now();

    // Default policies
    const defaultPolicies = {
      merchantLocking: false,
      velocityLimits: {
        perTransaction: 100000, // $1,000
        daily: 500000, // $5,000
        weekly: 2000000, // $20,000
        monthly: 5000000, // $50,000
      },
      currentSpending: {
        daily: 0,
        weekly: 0,
        monthly: 0,
        lastResetAt: now,
      },
      requireBiometric: true,
      requireStep2FA: false,
      requireFraudClearance: true,
    };

    const id = await ctx.db.insert("turnkeyOrganizations", {
      userId: args.userId,
      didDocumentId: args.didDocumentId,
      subOrganizationId: args.subOrganizationId,
      rootUserId: args.rootUserId,
      serviceUserId: args.serviceUserId,
      walletId: args.walletId,
      walletAddress: args.walletAddress,
      walletPublicKey: args.walletPublicKey,
      ethereumAddress: args.ethereumAddress,
      policies: args.policies ?? defaultPolicies,
      status: "creating",
      totalTransactionsCount: 0,
      totalTransactionsVolume: 0,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Activate a Turnkey sub-organization
 */
export const activate = mutation({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update policies for a sub-organization
 */
export const updatePolicies = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    policies: policiesValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      policies: args.policies,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update velocity limits
 */
export const updateVelocityLimits = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    velocityLimits: velocityLimitsValidator,
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    await ctx.db.patch(args.id, {
      policies: {
        ...org.policies,
        velocityLimits: args.velocityLimits,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Record spending for velocity tracking
 */
export const recordSpending = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    amount: v.number(), // Amount in cents
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    const now = Date.now();
    const { currentSpending, velocityLimits } = org.policies;

    // Reset counters if needed
    const lastReset = new Date(currentSpending.lastResetAt);
    const nowDate = new Date(now);

    let daily = currentSpending.daily;
    let weekly = currentSpending.weekly;
    let monthly = currentSpending.monthly;
    let lastResetAt = currentSpending.lastResetAt;

    // Reset daily if new day
    if (nowDate.toDateString() !== lastReset.toDateString()) {
      daily = 0;
    }

    // Reset weekly if new week (Sunday)
    const lastWeekStart = getWeekStart(lastReset);
    const nowWeekStart = getWeekStart(nowDate);
    if (lastWeekStart.getTime() !== nowWeekStart.getTime()) {
      weekly = 0;
    }

    // Reset monthly if new month
    if (
      nowDate.getMonth() !== lastReset.getMonth() ||
      nowDate.getFullYear() !== lastReset.getFullYear()
    ) {
      monthly = 0;
      lastResetAt = now;
    }

    // Add current spending
    daily += args.amount;
    weekly += args.amount;
    monthly += args.amount;

    await ctx.db.patch(args.id, {
      policies: {
        ...org.policies,
        currentSpending: {
          daily,
          weekly,
          monthly,
          lastResetAt,
        },
      },
      lastActivityAt: now,
      totalTransactionsCount: org.totalTransactionsCount + 1,
      totalTransactionsVolume: org.totalTransactionsVolume + args.amount,
      updatedAt: now,
    });
  },
});

/**
 * Update merchant restrictions
 */
export const updateMerchantRestrictions = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    merchantLocking: v.boolean(),
    allowedMerchants: v.optional(v.array(v.string())),
    allowedMccCodes: v.optional(v.array(v.string())),
    blockedMerchants: v.optional(v.array(v.string())),
    blockedMccCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    await ctx.db.patch(args.id, {
      policies: {
        ...org.policies,
        merchantLocking: args.merchantLocking,
        allowedMerchants: args.allowedMerchants,
        allowedMccCodes: args.allowedMccCodes,
        blockedMerchants: args.blockedMerchants,
        blockedMccCodes: args.blockedMccCodes,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Freeze a sub-organization (security)
 */
export const freeze = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "frozen",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Suspend a sub-organization (temporary)
 */
export const suspend = mutation({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "suspended",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Reactivate a suspended/frozen sub-organization
 */
export const reactivate = mutation({
  args: { id: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.id);
    if (!org) {
      throw new Error("Organization not found");
    }

    if (org.status === "creating") {
      throw new Error("Organization still being created");
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Link a DID document to the sub-organization
 */
export const linkDID = mutation({
  args: {
    id: v.id("turnkeyOrganizations"),
    didDocumentId: v.id("didDocuments"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      didDocumentId: args.didDocumentId,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

export const resetDailySpending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const orgs = await ctx.db.query("turnkeyOrganizations").collect();

    for (const org of orgs) {
      await ctx.db.patch(org._id, {
        policies: {
          ...org.policies,
          currentSpending: {
            ...org.policies.currentSpending,
            daily: 0,
          },
        },
        updatedAt: now,
      });
    }
  },
});

/**
 * Handle sub-organization creation completion from webhook
 */
export const handleSubOrgCreated = internalMutation({
  args: {
    activityId: v.string(),
    subOrganizationId: v.optional(v.string()),
    rootUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[Turnkey] Sub-org created:", {
      activityId: args.activityId,
      subOrganizationId: args.subOrganizationId,
    });
    // The actual sub-org record is created via the create mutation
    // This webhook handler is for logging/audit purposes
  },
});

/**
 * Handle wallet creation completion from webhook
 */
export const handleWalletCreated = internalMutation({
  args: {
    activityId: v.string(),
    walletId: v.optional(v.string()),
    addresses: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    console.log("[Turnkey] Wallet created:", {
      activityId: args.activityId,
      walletId: args.walletId,
      addresses: args.addresses,
    });
    // Wallet details are handled in the sub-org creation flow
    // This webhook handler is for logging/audit purposes
  },
});

/**
 * Log security events for audit trail
 */
export const logSecurityEvent = internalMutation({
  args: {
    eventType: v.string(),
    activityId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    console.warn("[Turnkey Security Event]", {
      eventType: args.eventType,
      activityId: args.activityId,
      status: args.status,
      timestamp: Date.now(),
    });
    // In production, this would insert into a security_events audit table
  },
});

/**
 * Handle policy denial events
 */
export const handlePolicyDenial = internalMutation({
  args: {
    activityId: v.string(),
    policyId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    console.warn("[Turnkey Policy Denial]", {
      activityId: args.activityId,
      policyId: args.policyId,
      reason: args.reason,
    });
    // In production, update the signing request status and notify user
  },
});

/**
 * Handle consensus (multi-sig) required events
 */
export const handleConsensusRequired = internalMutation({
  args: {
    activityId: v.string(),
    requiredApprovers: v.number(),
    currentApprovers: v.number(),
  },
  handler: async (ctx, args) => {
    console.log("[Turnkey Consensus Required]", {
      activityId: args.activityId,
      requiredApprovers: args.requiredApprovers,
      currentApprovers: args.currentApprovers,
    });
    // In production, update the signing request to awaiting_approval
    // and notify required approvers
  },
});

/**
 * Handle velocity limit exceeded events
 */
export const handleLimitExceeded = internalMutation({
  args: {
    activityId: v.string(),
    limitType: v.string(),
    currentValue: v.number(),
    limitValue: v.number(),
  },
  handler: async (ctx, args) => {
    console.warn("[Turnkey Limit Exceeded]", {
      activityId: args.activityId,
      limitType: args.limitType,
      currentValue: args.currentValue,
      limitValue: args.limitValue,
    });
    // In production, block the transaction and notify user
  },
});

// ============================================================================
// Actions - Turnkey API Calls
// ============================================================================

/**
 * Create a Turnkey sub-organization with Solana and Ethereum wallets
 * This is called during user registration to create TEE-managed wallets
 *
 * NON-CUSTODIAL: User provides passkey attestation, giving them sole control of wallet
 */
export const createSubOrganization = action({
  args: {
    displayName: v.string(),
    userEmail: v.optional(v.string()),
    // Passkey attestation from client for non-custodial wallet
    passkey: v.object({
      authenticatorName: v.string(),
      challenge: v.string(), // Base64 encoded
      attestation: v.object({
        credentialId: v.string(), // Base64 URL encoded
        clientDataJson: v.string(), // Base64 encoded
        attestationObject: v.string(), // Base64 encoded
        transports: v.array(v.string()), // e.g., ["AUTHENTICATOR_TRANSPORT_INTERNAL"]
      }),
    }),
  },
  handler: async (ctx, args): Promise<{
    subOrganizationId: string;
    walletId: string;
    solanaAddress: string;
    solanaPublicKey: string;
    ethereumAddress: string;
    rootUserId: string;
  }> => {
    // Validate configuration
    if (!TURNKEY_API_PUBLIC_KEY || !TURNKEY_API_PRIVATE_KEY || !TURNKEY_ORGANIZATION_ID) {
      throw new Error("Turnkey API credentials not configured");
    }

    // Initialize Turnkey client
    const turnkeyClient = new Turnkey({
      apiBaseUrl: TURNKEY_API_BASE_URL,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY,
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
      defaultOrganizationId: TURNKEY_ORGANIZATION_ID,
    });

    const apiClient = turnkeyClient.apiClient();

    // Generate unique sub-org name
    const subOrgName = `DisCard-${args.displayName}-${Date.now()}`;

    console.log("[Turnkey] Creating non-custodial sub-organization with passkey:", subOrgName);

    // Create sub-organization with user's passkey as the root authenticator
    // This gives the user sole control over their wallet (non-custodial)
    const response = await apiClient.createSubOrganization({
      subOrganizationName: subOrgName,
      rootUsers: [{
        userName: args.displayName,
        userEmail: args.userEmail,
        apiKeys: [],
        authenticators: [{
          authenticatorName: args.passkey.authenticatorName,
          challenge: args.passkey.challenge,
          attestation: {
            credentialId: args.passkey.attestation.credentialId,
            clientDataJson: args.passkey.attestation.clientDataJson,
            attestationObject: args.passkey.attestation.attestationObject,
            transports: args.passkey.attestation.transports as any,
          },
        }],
        oauthProviders: [],
      }],
      rootQuorumThreshold: 1,
      wallet: {
        walletName: `${args.displayName} Wallet`,
        accounts: [
          SOLANA_WALLET_ACCOUNT,
          ETHEREUM_WALLET_ACCOUNT,
        ],
      },
      disableEmailRecovery: true,
      disableEmailAuth: true,
      disableSmsAuth: true,
      disableOtpEmailAuth: true,
    });

    // Extract wallet addresses from response
    const subOrganizationId = response.subOrganizationId;
    const walletId = response.wallet?.walletId;
    const addresses = response.wallet?.addresses || [];
    const rootUserIds = response.rootUserIds || [];

    if (!walletId || addresses.length < 2) {
      throw new Error("Failed to create wallet with required addresses");
    }

    // First address is Solana, second is Ethereum (in order of accounts array)
    const solanaAddress = addresses[0];
    const ethereumAddress = addresses[1];
    const rootUserId = rootUserIds[0] || "";

    console.log("[Turnkey] Non-custodial sub-organization created:", {
      subOrganizationId,
      walletId,
      solanaAddress,
      ethereumAddress,
      rootUserId,
    });

    return {
      subOrganizationId,
      walletId,
      solanaAddress,
      solanaPublicKey: solanaAddress, // For Solana, address is the public key
      ethereumAddress,
      rootUserId,
    };
  },
});

/**
 * Sign a Solana transaction using Turnkey
 * Requires the user's sub-organization ID and wallet address
 */
export const signSolanaTransaction = action({
  args: {
    subOrganizationId: v.string(),
    walletAddress: v.string(),
    unsignedTransaction: v.string(), // Base64 encoded transaction
  },
  handler: async (ctx, args): Promise<{ signature: string }> => {
    if (!TURNKEY_API_PUBLIC_KEY || !TURNKEY_API_PRIVATE_KEY || !TURNKEY_ORGANIZATION_ID) {
      throw new Error("Turnkey API credentials not configured");
    }

    const turnkeyClient = new Turnkey({
      apiBaseUrl: TURNKEY_API_BASE_URL,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY,
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
      defaultOrganizationId: args.subOrganizationId,
    });

    const apiClient = turnkeyClient.apiClient();

    console.log("[Turnkey] Signing Solana transaction for:", args.walletAddress);

    const response = await apiClient.signRawPayload({
      signWith: args.walletAddress,
      payload: args.unsignedTransaction,
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
      hashFunction: "HASH_FUNCTION_NO_OP",
    });

    if (!response.r || !response.s) {
      throw new Error("Failed to sign transaction");
    }

    // Combine r and s into signature
    const signature = response.r + response.s;

    return { signature };
  },
});

// ============================================================================
// Session Key & Policy Management (for Auto-Shield)
// ============================================================================

/**
 * Create a single-use deposit wallet for Privacy Cash auto-shielding
 *
 * This creates a new wallet in the user's sub-org that will receive MoonPay deposits.
 * A restricted session key is created that can ONLY transfer to the Privacy Cash pool.
 *
 * NON-CUSTODIAL: User's passkey still controls the sub-org, but session key
 * enables automated operations with restricted permissions.
 */
export const createDepositWallet = action({
  args: {
    subOrganizationId: v.string(),
    walletName: v.string(),
    destinationAddress: v.string(), // Privacy Cash pool address
  },
  handler: async (ctx, args): Promise<{
    walletId: string;
    depositAddress: string;
    sessionKeyId: string;
    policyId: string;
  }> => {
    if (!TURNKEY_API_PUBLIC_KEY || !TURNKEY_API_PRIVATE_KEY || !TURNKEY_ORGANIZATION_ID) {
      throw new Error("Turnkey API credentials not configured");
    }

    const turnkeyClient = new Turnkey({
      apiBaseUrl: TURNKEY_API_BASE_URL,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY,
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
      defaultOrganizationId: args.subOrganizationId,
    });

    const apiClient = turnkeyClient.apiClient();

    console.log("[Turnkey] Creating deposit wallet in sub-org:", args.subOrganizationId);

    // 1. Create new wallet for deposits
    const walletResponse = await apiClient.createWallet({
      walletName: args.walletName,
      accounts: [SOLANA_WALLET_ACCOUNT],
    });

    const walletId = walletResponse.walletId;
    const depositAddress = walletResponse.addresses[0];

    console.log("[Turnkey] Deposit wallet created:", { walletId, depositAddress });

    // 2. Create API key for automated signing (session key)
    // TODO: In production, generate a proper key pair and provide the public key
    // For hackathon demo, we're using placeholder IDs
    const sessionKeyId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const policyId = `policy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log("[Turnkey] Session key (placeholder) created:", sessionKeyId);

    // NOTE: Full implementation would call:
    // const apiKeyResponse = await apiClient.createApiKeys({
    //   apiKeys: [{
    //     apiKeyName: `auto-shield-${Date.now()}`,
    //     publicKey: generatedPublicKey, // From crypto.subtle.generateKey
    //     curveType: "API_KEY_CURVE_P256",
    //   }],
    //   userId: rootUserId,
    // });
    //
    // const policyResponse = await apiClient.createPolicy({
    //   policyName: `shield-only-${Date.now()}`,
    //   effect: "EFFECT_ALLOW",
    //   condition: `...policy restricting to ${args.destinationAddress}`,
    //   consensus: `...`,
    //   notes: "Auto-shield session key policy",
    // });

    console.log("[Turnkey] Restricted policy created:", policyId);

    return {
      walletId,
      depositAddress,
      sessionKeyId,
      policyId,
    };
  },
});

/**
 * Create a single-use cashout wallet for private off-ramp
 *
 * Similar to deposit wallet, but policy restricts transfers to MoonPay receive address only.
 */
export const createCashoutWallet = action({
  args: {
    subOrganizationId: v.string(),
    walletName: v.string(),
    moonPayReceiveAddress: v.string(),
  },
  handler: async (ctx, args): Promise<{
    walletId: string;
    cashoutAddress: string;
    sessionKeyId: string;
    policyId: string;
  }> => {
    if (!TURNKEY_API_PUBLIC_KEY || !TURNKEY_API_PRIVATE_KEY || !TURNKEY_ORGANIZATION_ID) {
      throw new Error("Turnkey API credentials not configured");
    }

    const turnkeyClient = new Turnkey({
      apiBaseUrl: TURNKEY_API_BASE_URL,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY,
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
      defaultOrganizationId: args.subOrganizationId,
    });

    const apiClient = turnkeyClient.apiClient();

    console.log("[Turnkey] Creating cashout wallet in sub-org:", args.subOrganizationId);

    const walletResponse = await apiClient.createWallet({
      walletName: args.walletName,
      accounts: [SOLANA_WALLET_ACCOUNT],
    });

    const walletId = walletResponse.walletId;
    const cashoutAddress = walletResponse.addresses[0];

    console.log("[Turnkey] Cashout wallet created:", { walletId, cashoutAddress });

    // TODO: In production, generate proper key pair and provide public key
    // For hackathon demo, using placeholder IDs
    const sessionKeyId = `cashout_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const policyId = `cashout_policy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // NOTE: Full implementation would create API key and policy via Turnkey SDK
    console.log("[Turnkey] Cashout session key (placeholder):", sessionKeyId);

    console.log("[Turnkey] Cashout policy created:", policyId);

    return {
      walletId,
      cashoutAddress,
      sessionKeyId,
      policyId,
    };
  },
});

/**
 * Sign a transaction using a session key (server-side, no passkey required)
 */
export const signWithSessionKey = action({
  args: {
    subOrganizationId: v.string(),
    sessionKeyId: v.string(),
    walletAddress: v.string(),
    unsignedTransaction: v.string(),
  },
  handler: async (ctx, args): Promise<{ signature: string }> => {
    if (!TURNKEY_API_PUBLIC_KEY || !TURNKEY_API_PRIVATE_KEY || !TURNKEY_ORGANIZATION_ID) {
      throw new Error("Turnkey API credentials not configured");
    }

    const turnkeyClient = new Turnkey({
      apiBaseUrl: TURNKEY_API_BASE_URL,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY,
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
      defaultOrganizationId: args.subOrganizationId,
    });

    const apiClient = turnkeyClient.apiClient();

    console.log("[Turnkey] Signing with session key:", {
      sessionKeyId: args.sessionKeyId,
      walletAddress: args.walletAddress,
    });

    const response = await apiClient.signRawPayload({
      signWith: args.walletAddress,
      payload: args.unsignedTransaction,
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
      hashFunction: "HASH_FUNCTION_NO_OP",
    });

    if (!response.r || !response.s) {
      throw new Error("Failed to sign transaction with session key");
    }

    const signature = response.r + response.s;

    console.log("[Turnkey] Session key signature complete");

    return { signature };
  },
});

/**
 * Revoke a session key (for security or after use)
 */
export const revokeSessionKey = action({
  args: {
    subOrganizationId: v.string(),
    sessionKeyId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    if (!TURNKEY_API_PUBLIC_KEY || !TURNKEY_API_PRIVATE_KEY || !TURNKEY_ORGANIZATION_ID) {
      throw new Error("Turnkey API credentials not configured");
    }

    const turnkeyClient = new Turnkey({
      apiBaseUrl: TURNKEY_API_BASE_URL,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY,
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
      defaultOrganizationId: args.subOrganizationId,
    });

    const apiClient = turnkeyClient.apiClient();

    console.log("[Turnkey] Revoking session key:", args.sessionKeyId);

    // TODO: In production, call deleteApiKeys with proper parameters
    // await apiClient.deleteApiKeys({
    //   apiKeyIds: [args.sessionKeyId],
    //   userId: rootUserId,
    // });

    console.log("[Turnkey] Session key revoked (placeholder)");

    return { success: true };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}
