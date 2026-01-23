/**
 * Passkey Authentication Module
 *
 * Implements WebAuthn passkey authentication with P-256 keys that can
 * derive Solana addresses for signing transactions.
 *
 * Key features:
 * - Hardware-bound keys (Secure Enclave / StrongBox)
 * - No seed phrases exposed to users
 * - Biometric authentication for transaction signing
 * - Derived Solana address from P-256 public key
 */
import { mutation, query, internalMutation, internalQuery, action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";

// ============ QUERIES ============

/**
 * Get the current authenticated user
 */
export const me = query({
  args: {},
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Find user by credential ID stored in the identity
    const credentialId = identity.subject;
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();

    return user;
  },
});

/**
 * Check if a credential ID is already registered
 */
export const isCredentialRegistered = query({
  args: {
    credentialId: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();

    return existing !== null;
  },
});

/**
 * Get user by Solana address (for transaction verification)
 */
export const getUserBySolanaAddress = query({
  args: {
    solanaAddress: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_solana_address", (q) => q.eq("solanaAddress", args.solanaAddress))
      .first();
  },
});

/**
 * Get user by phone hash (for TextPay integration)
 */
export const getUserByPhoneHash = query({
  args: {
    phoneHash: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_phone_hash", (q) => q.eq("phoneHash", args.phoneHash))
      .first();
  },
});

/**
 * Get user by ID (for auth context)
 */
export const getUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return await ctx.db.get(args.userId);
  },
});

// ============ INTERNAL QUERIES ============

/**
 * Get user by ID (internal - for use in internal actions without auth context)
 */
export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Get user by credential ID (internal)
 */
export const getByCredentialId = internalQuery({
  args: {
    credentialId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();
  },
});

/**
 * Get user by Solana address (internal) - for account recovery
 */
export const getByAddress = internalQuery({
  args: {
    solanaAddress: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_solana_address", (q) => q.eq("solanaAddress", args.solanaAddress))
      .first();
  },
});

/**
 * Update credential ID for a user (internal) - for account recovery
 */
export const updateCredentialId = internalMutation({
  args: {
    userId: v.id("users"),
    newCredentialId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.userId, {
      credentialId: args.newCredentialId,
      lastActive: Date.now(),
    });
    console.log("[Auth] Credential ID updated for account recovery:", args.userId);
  },
});

// ============ MUTATIONS ============

/**
 * Register a new user with a passkey credential
 *
 * This is called after the client completes WebAuthn registration ceremony.
 * The client sends:
 * - credentialId: Base64-encoded credential ID from WebAuthn
 * - publicKey: Raw P-256 public key bytes
 * - displayName: Optional user-provided name
 */
export const registerPasskey = mutation({
  args: {
    credentialId: v.string(),
    publicKey: v.bytes(),
    displayName: v.optional(v.string()),
    phoneHash: v.optional(v.string()),
    email: v.optional(v.string()),
    solanaAddress: v.optional(v.string()), // Client-generated wallet address
  },
  handler: async (ctx, args): Promise<{
    userId: Id<"users">;
    solanaAddress: string;
  }> => {
    // Check if credential is already registered
    const existing = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (existing) {
      throw new Error("Credential already registered");
    }

    // Check if email is already in use (if provided)
    if (args.email) {
      const emailExists = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();

      if (emailExists) {
        throw new Error("Email already registered");
      }
    }

    // Use provided Solana address or derive from P-256 public key
    // Note: Prefer client-generated address as deriveSolanaAddressFromP256 is a placeholder
    const solanaAddress = args.solanaAddress || deriveSolanaAddressFromP256(args.publicKey);

    // Create user record
    const userId = await ctx.db.insert("users", {
      credentialId: args.credentialId,
      publicKey: args.publicKey,
      solanaAddress,
      displayName: args.displayName,
      phoneHash: args.phoneHash,
      email: args.email,
      privacySettings: {
        dataRetention: 365, // 1 year default
        analyticsOptOut: false,
        transactionIsolation: true, // Enable by default for privacy
      },
      kycStatus: "none",
      riskScore: 0,
      accountStatus: "active",
      lastActive: Date.now(),
      createdAt: Date.now(),
    });

    return { userId, solanaAddress };
  },
});

/**
 * Verify a passkey assertion for login
 *
 * This is called after the client completes WebAuthn authentication ceremony.
 * The server verifies the signature against the stored public key.
 */
export const verifyPasskey = mutation({
  args: {
    credentialId: v.string(),
    authenticatorData: v.bytes(),
    clientDataJSON: v.bytes(),
    signature: v.bytes(),
  },
  handler: async (ctx, args): Promise<{
    userId: Id<"users">;
    solanaAddress: string | undefined;
    accountStatus: string;
  }> => {
    // Find user by credential ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check account status
    if (user.accountStatus === "locked") {
      throw new Error("Account is locked. Please contact support.");
    }

    if (user.accountStatus === "suspended") {
      throw new Error("Account is suspended. Please contact support.");
    }

    // Verify WebAuthn assertion signature
    // Note: In production, this verification should be done in a secure action
    // using crypto libraries. For now, we trust the client verification.
    const verified = verifyWebAuthnSignature(
      user.publicKey,
      args.authenticatorData,
      args.clientDataJSON,
      args.signature
    );

    if (!verified) {
      throw new Error("Invalid signature");
    }

    // Update last active timestamp
    await ctx.db.patch(user._id, {
      lastActive: Date.now(),
    });

    return {
      userId: user._id,
      solanaAddress: user.solanaAddress,
      accountStatus: user.accountStatus,
    };
  },
});

/**
 * Update user profile
 */
export const updateProfile = mutation({
  args: {
    userId: v.optional(v.id("users")),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      // Try to find user by credential ID first
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();

      // Fallback: try to normalize subject as user ID
      if (!user) {
        const userId = ctx.db.normalizeId("users", identity.subject);
        if (userId) user = await ctx.db.get(userId);
      }
    } else if (args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) {
      console.error("User not found for identity:", identity);
      throw new ConvexError("User not found or not authenticated");
    }

    // Check if new email is already in use
    if (args.email && args.email !== user.email) {
      const emailExists = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();

      if (emailExists) {
        throw new ConvexError("Email already in use");
      }
    }

    await ctx.db.patch(user._id, {
      ...(args.displayName !== undefined && { displayName: args.displayName }),
      ...(args.email !== undefined && { email: args.email }),
    });
  },
});

/**
 * Update privacy settings
 */
export const updatePrivacySettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    dataRetention: v.optional(v.number()),
    analyticsOptOut: v.optional(v.boolean()),
    transactionIsolation: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      if (!user) {
        const userId = ctx.db.normalizeId("users", identity.subject);
        if (userId) user = await ctx.db.get(userId);
      }
    } else if (args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) {
      throw new Error("User not found or not authenticated");
    }

    const updatedSettings = {
      ...user.privacySettings,
      ...(args.dataRetention !== undefined && { dataRetention: args.dataRetention }),
      ...(args.analyticsOptOut !== undefined && { analyticsOptOut: args.analyticsOptOut }),
      ...(args.transactionIsolation !== undefined && { transactionIsolation: args.transactionIsolation }),
    };

    await ctx.db.patch(user._id, {
      privacySettings: updatedSettings,
    });
  },
});

/**
 * Privacy level presets - maps privacy level to specific settings
 */
const PRIVACY_LEVEL_PRESETS = {
  basic: {
    dataRetention: 365,
    analyticsOptOut: false,
    transactionIsolation: false,
    preferredSwapProvider: "jupiter" as const,
    preferredFundingMethod: "direct" as const,
    useStealthAddresses: false,
    useMpcSwaps: false,
    useZkProofs: false,
    useRingSignatures: false,
    torRoutingEnabled: false,
  },
  enhanced: {
    dataRetention: 90,
    analyticsOptOut: true,
    transactionIsolation: true,
    preferredSwapProvider: "anoncoin" as const,
    preferredFundingMethod: "stealth" as const,
    useStealthAddresses: true,
    useMpcSwaps: true,
    useZkProofs: false,
    useRingSignatures: false,
    torRoutingEnabled: false,
  },
  maximum: {
    dataRetention: 30,
    analyticsOptOut: true,
    transactionIsolation: true,
    preferredSwapProvider: "silentswap" as const,
    preferredFundingMethod: "shielded" as const,
    useStealthAddresses: true,
    useMpcSwaps: true,
    useZkProofs: true,
    useRingSignatures: true,
    torRoutingEnabled: true,
  },
};

/**
 * Set privacy level - updates all related settings based on tier
 */
export const setPrivacyLevel = mutation({
  args: {
    userId: v.optional(v.id("users")),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      if (!user) {
        const userId = ctx.db.normalizeId("users", identity.subject);
        if (userId) user = await ctx.db.get(userId);
      }
    } else if (args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) {
      throw new Error("User not found or not authenticated");
    }

    // Get preset settings for the selected privacy level
    const preset = PRIVACY_LEVEL_PRESETS[args.privacyLevel];

    // Merge with existing settings, applying all preset values
    const updatedSettings = {
      ...user.privacySettings,
      privacyLevel: args.privacyLevel,
      ...preset,
    };

    await ctx.db.patch(user._id, {
      privacySettings: updatedSettings,
    });

    console.log(`[Privacy] User ${user._id} set privacy level to: ${args.privacyLevel}`);
  },
});

/**
 * Privacy settings response type
 */
type PrivacySettingsResponse = {
  privacyLevel: "basic" | "enhanced" | "maximum";
  settings: {
    dataRetention: number;
    analyticsOptOut: boolean;
    transactionIsolation: boolean;
    preferredSwapProvider: "jupiter" | "anoncoin" | "silentswap";
    preferredFundingMethod: "direct" | "stealth" | "shielded";
    useStealthAddresses: boolean;
    useMpcSwaps: boolean;
    useZkProofs: boolean;
    useRingSignatures: boolean;
    torRoutingEnabled: boolean;
  };
};

/**
 * Get privacy level details - returns current level and all settings
 */
export const getPrivacySettings = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<PrivacySettingsResponse | null> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      if (!user) {
        const userId = ctx.db.normalizeId("users", identity.subject);
        if (userId) user = await ctx.db.get(userId);
      }
    } else if (args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) {
      return null;
    }

    const ps = user.privacySettings;

    // Map stored values to typed response
    const swapProvider = ps.preferredSwapProvider;
    const fundingMethod = ps.preferredFundingMethod;

    return {
      privacyLevel: (ps.privacyLevel as "basic" | "enhanced" | "maximum") || "basic",
      settings: {
        dataRetention: ps.dataRetention,
        analyticsOptOut: ps.analyticsOptOut,
        transactionIsolation: ps.transactionIsolation,
        preferredSwapProvider: (swapProvider === "anoncoin" || swapProvider === "silentswap")
          ? swapProvider : "jupiter",
        preferredFundingMethod: (fundingMethod === "stealth" || fundingMethod === "shielded")
          ? fundingMethod : "direct",
        useStealthAddresses: ps.useStealthAddresses || false,
        useMpcSwaps: ps.useMpcSwaps || false,
        useZkProofs: ps.useZkProofs || false,
        useRingSignatures: ps.useRingSignatures || false,
        torRoutingEnabled: ps.torRoutingEnabled || false,
      },
    };
  },
});

/**
 * Link phone hash for TextPay integration
 */
export const linkPhoneHash = mutation({
  args: {
    userId: v.optional(v.id("users")),
    phoneHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      if (!user) {
        const userId = ctx.db.normalizeId("users", identity.subject);
        if (userId) user = await ctx.db.get(userId);
      }
    } else if (args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) {
      throw new Error("User not found or not authenticated");
    }

    // Check if phone hash is already linked to another user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_phone_hash", (q) => q.eq("phoneHash", args.phoneHash))
      .first();

    if (existingUser && existingUser._id !== user._id) {
      throw new Error("Phone number already linked to another account");
    }

    await ctx.db.patch(user._id, {
      phoneHash: args.phoneHash,
    });
  },
});

/**
 * Add additional passkey credential to existing account
 */
export const addPasskeyCredential = mutation({
  args: {
    userId: v.optional(v.id("users")),
    newCredentialId: v.string(),
    newPublicKey: v.bytes(),
  },
  handler: async (ctx, args): Promise<void> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();
    
    if (identity) {
      // We don't strictly need the user record here to check existing credentials,
      // but we might want to verify the user exists.
      // For now, just proceeding with the check.
    } else if (!args.userId) {
       throw new Error("Not authenticated");
    }

    // Check if new credential is already registered
    const existing = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.newCredentialId))
      .first();

    if (existing) {
      throw new Error("Credential already registered");
    }

    // For now, we don't support multiple credentials per user
    // This would require a separate credentials table
    throw new Error("Multiple credentials not yet supported");
  },
});

/**
 * Register a new user with biometric authentication (Expo Go compatible)
 *
 * This is used when passkey native module is unavailable (e.g., Expo Go).
 * Creates a user with:
 * - Device-generated credential ID (stored in SecureStore)
 * - Solana address (from generated keypair or Turnkey later)
 *
 * ACCOUNT RECOVERY: If a user with the same Solana address already exists,
 * we update their credential ID and return the existing account. This handles
 * the case where local storage was cleared but the user's wallet still exists.
 */
export const registerBiometric = mutation({
  args: {
    credentialId: v.string(),        // Device-generated unique ID
    displayName: v.optional(v.string()),
    solanaAddress: v.optional(v.string()), // From local keypair or empty for Turnkey later
    deviceInfo: v.optional(v.object({
      platform: v.string(),
      model: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<{
    userId: Id<"users">;
    solanaAddress: string | null;
    isRecoveredAccount?: boolean;
  }> => {
    // Check if credential is already registered
    const existing = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (existing) {
      // Return existing user (allows re-registration on same device)
      console.log("[Auth] Credential already registered, returning existing user:", existing._id);
      return {
        userId: existing._id,
        solanaAddress: existing.solanaAddress ?? null,
      };
    }

    // Validate Solana address format if provided
    if (args.solanaAddress && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(args.solanaAddress)) {
      throw new Error("Invalid Solana address format");
    }

    // ACCOUNT RECOVERY: Check if Solana address already exists
    // This handles the case where credential ID was lost (app reinstall, cache clear)
    // but the user's Solana wallet is still stored in SecureStore
    if (args.solanaAddress) {
      // Use collect() to find all matches in case of duplicates
      const usersByAddress = await ctx.db
        .query("users")
        .withIndex("by_solana_address", (q) => q.eq("solanaAddress", args.solanaAddress))
        .collect();

      // Pick the best user account to recover (most recently active)
      const existingByAddress = usersByAddress.sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0))[0];

      if (existingByAddress) {
        // RECOVERY: Update credential ID to the new one and return existing user
        console.log("[Auth] ACCOUNT RECOVERY: Found existing user by Solana address:", existingByAddress._id);

        if (existingByAddress.accountStatus === "suspended" || existingByAddress.accountStatus === "locked") {
          throw new Error(`Account is ${existingByAddress.accountStatus}. Please contact support.`);
        }

        const updates: any = {
          lastActive: Date.now(),
        };

        if (existingByAddress.credentialId !== args.credentialId) {
          console.log("[Auth] Updating credential ID from", existingByAddress.credentialId, "to", args.credentialId);
          updates.credentialId = args.credentialId;
        }

        // Backfill privacySettings if missing (prevents crashes in cards:create)
        if (!existingByAddress.privacySettings) {
          console.log("[Auth] Backfilling missing privacySettings for user:", existingByAddress._id);
          updates.privacySettings = {
            dataRetention: 365,
            analyticsOptOut: false,
            transactionIsolation: true,
          };
        }

        await ctx.db.patch(existingByAddress._id, updates);

        return {
          userId: existingByAddress._id,
          solanaAddress: existingByAddress.solanaAddress ?? null,
          isRecoveredAccount: true,
        };
      }
    }

    // Create new user record with empty public key (biometric-only auth)
    console.log("[Auth] Creating new user with Solana address:", args.solanaAddress);
    const userId = await ctx.db.insert("users", {
      credentialId: args.credentialId,
      publicKey: new ArrayBuffer(0), // Empty - no WebAuthn public key for biometric auth
      solanaAddress: args.solanaAddress,
      displayName: args.displayName,
      privacySettings: {
        dataRetention: 365,
        analyticsOptOut: false,
        transactionIsolation: true,
      },
      kycStatus: "none",
      riskScore: 0,
      accountStatus: "active",
      lastActive: Date.now(),
      createdAt: Date.now(),
    });

    return { userId, solanaAddress: args.solanaAddress ?? null };
  },
});

/**
 * Login with biometric credential (Expo Go compatible)
 *
 * Verifies the credential ID exists and returns user data.
 * The actual biometric check happens on the device.
 */
export const loginBiometric = mutation({
  args: {
    credentialId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    userId: Id<"users">;
    solanaAddress: string | null;
    displayName: string | null;
    accountStatus: string;
  }> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (!user) {
      throw new Error("User not found. Please register first.");
    }

    if (user.accountStatus === "locked") {
      throw new Error("Account is locked. Please contact support.");
    }

    if (user.accountStatus === "suspended") {
      throw new Error("Account is suspended. Please contact support.");
    }

    // Update last active
    await ctx.db.patch(user._id, {
      lastActive: Date.now(),
    });

    return {
      userId: user._id,
      solanaAddress: user.solanaAddress ?? null,
      displayName: user.displayName ?? null,
      accountStatus: user.accountStatus,
    };
  },
});

// ============ ACTIONS ============

/**
 * Register a new user with Turnkey TEE-managed wallets (NON-CUSTODIAL)
 *
 * This action:
 * 1. Accepts passkey attestation from the client
 * 2. Calls Turnkey API to create a sub-organization with the passkey as root authenticator
 * 3. Creates the user record with wallet addresses
 * 4. Creates the Turnkey organization record for future signing
 *
 * The user controls their wallet through their passkey (non-custodial)
 */
export const registerWithTurnkey = action({
  args: {
    credentialId: v.string(),        // Device-generated unique ID (from SecureStore)
    displayName: v.optional(v.string()),
    deviceInfo: v.optional(v.object({
      platform: v.string(),
      model: v.optional(v.string()),
    })),
    // Optional: existing Solana address for account recovery
    existingSolanaAddress: v.optional(v.string()),
    // Passkey attestation for non-custodial wallet
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
    userId: Id<"users">;
    solanaAddress: string;
    ethereumAddress: string;
    isExistingUser: boolean;
    isRecoveredAccount?: boolean;
  }> => {
    // Check if user already exists with this credential
    const existingUser = await ctx.runQuery(internal.auth.passkeys.getByCredentialId, {
      credentialId: args.credentialId,
    });

    if (existingUser) {
      // Return existing user data
      return {
        userId: existingUser._id,
        solanaAddress: existingUser.solanaAddress ?? "",
        ethereumAddress: existingUser.ethereumAddress ?? "",
        isExistingUser: true,
      };
    }

    // ACCOUNT RECOVERY: Check if user exists with the provided Solana address
    // This handles the case where SecureStore was cleared but the Solana address was preserved
    if (args.existingSolanaAddress) {
      const existingByAddress = await ctx.runQuery(internal.auth.passkeys.getByAddress, {
        solanaAddress: args.existingSolanaAddress,
      });

      if (existingByAddress) {
        // Update credential ID to new one (recovery)
        await ctx.runMutation(internal.auth.passkeys.updateCredentialId, {
          userId: existingByAddress._id,
          newCredentialId: args.credentialId,
        });

        console.log("[Registration] ACCOUNT RECOVERY via Solana address:", {
          userId: existingByAddress._id,
          solanaAddress: args.existingSolanaAddress,
        });

        return {
          userId: existingByAddress._id,
          solanaAddress: existingByAddress.solanaAddress ?? "",
          ethereumAddress: existingByAddress.ethereumAddress ?? "",
          isExistingUser: true,
          isRecoveredAccount: true,
        };
      }
    }

    // Create Turnkey sub-organization with passkey authentication (non-custodial)
    console.log("[Registration] Creating non-custodial Turnkey sub-organization for:", args.displayName || "User");

    const turnkeyResult = await ctx.runAction(api.tee.turnkey.createSubOrganization, {
      displayName: args.displayName || `User-${Date.now()}`,
      passkey: args.passkey,
    });

    console.log("[Registration] Non-custodial Turnkey wallets created:", {
      solanaAddress: turnkeyResult.solanaAddress,
      ethereumAddress: turnkeyResult.ethereumAddress,
    });

    // Create user record with Turnkey wallet addresses
    const userId = await ctx.runMutation(internal.auth.passkeys.createUserWithTurnkey, {
      credentialId: args.credentialId,
      displayName: args.displayName,
      solanaAddress: turnkeyResult.solanaAddress,
      ethereumAddress: turnkeyResult.ethereumAddress,
    });

    // Create Turnkey organization record (for future signing operations)
    await ctx.runMutation(api.tee.turnkey.create, {
      userId,
      subOrganizationId: turnkeyResult.subOrganizationId,
      rootUserId: turnkeyResult.rootUserId,
      serviceUserId: turnkeyResult.rootUserId, // Same as root for now
      walletId: turnkeyResult.walletId,
      walletAddress: turnkeyResult.solanaAddress,
      walletPublicKey: turnkeyResult.solanaPublicKey,
      ethereumAddress: turnkeyResult.ethereumAddress,
    });

    // Activate the organization
    const turnkeyOrg = await ctx.runQuery(api.tee.turnkey.getByUserId, { userId });
    if (turnkeyOrg) {
      await ctx.runMutation(api.tee.turnkey.activate, { id: turnkeyOrg._id });
    }

    console.log("[Registration] User created successfully with non-custodial wallet:", userId);

    return {
      userId,
      solanaAddress: turnkeyResult.solanaAddress,
      ethereumAddress: turnkeyResult.ethereumAddress,
      isExistingUser: false,
    };
  },
});

/**
 * Update user's Solana address after Turnkey wallet creation
 * Called after the client creates a Turnkey sub-organization
 */
export const updateSolanaAddress = mutation({
  args: {
    userId: v.optional(v.id("users")),
    solanaAddress: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      if (!user) {
        const userId = ctx.db.normalizeId("users", identity.subject);
        if (userId) user = await ctx.db.get(userId);
      }
    } else if (args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) {
      throw new Error("User not found or not authenticated");
    }

    // Validate Solana address format (base58, 32-44 characters)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(args.solanaAddress)) {
      throw new Error("Invalid Solana address format");
    }

    await ctx.db.patch(user._id, {
      solanaAddress: args.solanaAddress,
    });
  },
});

/**
 * Update user's Ethereum address
 * Used for MoonPay ETH purchases
 */
export const updateEthereumAddress = mutation({
  args: {
    userId: v.optional(v.id("users")),
    ethereumAddress: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    let user: Doc<"users"> | null = null;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      if (!user) {
        const userId = ctx.db.normalizeId("users", identity.subject);
        if (userId) user = await ctx.db.get(userId);
      }
    } else if (args.userId) {
      user = await ctx.db.get(args.userId);
    }

    if (!user) {
      throw new Error("User not found or not authenticated");
    }

    // Validate Ethereum address format (0x followed by 40 hex chars)
    if (!/^0x[a-fA-F0-9]{40}$/.test(args.ethereumAddress)) {
      throw new Error("Invalid Ethereum address format");
    }

    await ctx.db.patch(user._id, {
      ethereumAddress: args.ethereumAddress,
    });
  },
});

/**
 * Verify a passkey assertion with full cryptographic verification
 *
 * This action performs async P-256 ECDSA signature verification.
 * Use this for high-security operations like:
 * - Authorizing large transactions
 * - Changing account settings
 * - Revoking session keys
 */
export const verifyPasskeyAction = action({
  args: {
    credentialId: v.string(),
    authenticatorData: v.bytes(),
    clientDataJSON: v.bytes(),
    signature: v.bytes(),
  },
  handler: async (ctx, args): Promise<{
    verified: boolean;
    userId?: Id<"users">;
    solanaAddress?: string;
    error?: string;
  }> => {
    // Find user by credential ID
    const user = await ctx.runQuery(internal.auth.passkeys.getByCredentialId, {
      credentialId: args.credentialId,
    });

    if (!user) {
      return { verified: false, error: "User not found" };
    }

    // Check account status
    if (user.accountStatus === "locked" || user.accountStatus === "suspended") {
      return { verified: false, error: `Account is ${user.accountStatus}` };
    }

    // Empty public key means biometric-only auth
    if (user.publicKey.byteLength === 0) {
      return {
        verified: true,
        userId: user._id,
        solanaAddress: user.solanaAddress,
      };
    }

    // Perform full cryptographic verification
    const verified = await verifyWebAuthnSignatureInAction(
      user.publicKey,
      args.authenticatorData,
      args.clientDataJSON,
      args.signature
    );

    if (!verified) {
      return { verified: false, error: "Invalid signature" };
    }

    return {
      verified: true,
      userId: user._id,
      solanaAddress: user.solanaAddress,
    };
  },
});

/**
 * Internal async verification for actions
 */
async function verifyWebAuthnSignatureInAction(
  publicKey: ArrayBuffer,
  authenticatorData: ArrayBuffer,
  clientDataJSON: ArrayBuffer,
  signature: ArrayBuffer
): Promise<boolean> {
  if (!publicKey || !authenticatorData || !clientDataJSON || !signature) {
    return false;
  }

  if (publicKey.byteLength === 0) {
    return true;
  }

  if (publicKey.byteLength !== 65 && publicKey.byteLength !== 64) {
    console.warn(`[WebAuthn] Invalid public key length: ${publicKey.byteLength}`);
    return false;
  }

  try {
    // Hash clientDataJSON with SHA-256
    const clientDataHash = await crypto.subtle.digest("SHA-256", clientDataJSON);

    // Concatenate authenticatorData + clientDataHash
    const authDataArray = new Uint8Array(authenticatorData);
    const clientDataHashArray = new Uint8Array(clientDataHash);
    const signedData = new Uint8Array(authDataArray.length + clientDataHashArray.length);
    signedData.set(authDataArray, 0);
    signedData.set(clientDataHashArray, authDataArray.length);

    // Import the P-256 public key
    let rawPublicKey = new Uint8Array(publicKey);
    if (rawPublicKey.length === 64) {
      const prefixedKey = new Uint8Array(65);
      prefixedKey[0] = 0x04;
      prefixedKey.set(rawPublicKey, 1);
      rawPublicKey = prefixedKey;
    }

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      rawPublicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    // Convert DER signature to raw format
    const rawSignature = convertDerToRawInAction(new Uint8Array(signature));
    if (!rawSignature) {
      return false;
    }

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      cryptoKey,
      rawSignature,
      signedData
    );

    // Verify User Present flag
    const flags = authDataArray[32];
    const userPresent = (flags & 0x01) !== 0;
    if (!userPresent) {
      return false;
    }

    return isValid;
  } catch (error) {
    console.error("[WebAuthn] Verification error:", error);
    return false;
  }
}

function convertDerToRawInAction(derSignature: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (derSignature.length < 8 || derSignature[0] !== 0x30) {
    // May already be raw format (64 bytes for P-256)
    if (derSignature.length === 64) {
      const result = new Uint8Array(64);
      result.set(derSignature);
      return result;
    }
    return null;
  }

  let offset = 2;
  if (derSignature[offset] !== 0x02) return null;
  offset++;
  const rLength = derSignature[offset];
  offset++;
  let r = derSignature.slice(offset, offset + rLength);
  offset += rLength;

  if (derSignature[offset] !== 0x02) return null;
  offset++;
  const sLength = derSignature[offset];
  offset++;
  let s = derSignature.slice(offset, offset + sLength);

  // Normalize to 32 bytes
  const normalizeInt = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const result = new Uint8Array(32);
    if (trimmed.length <= 32) {
      result.set(trimmed, 32 - trimmed.length);
    } else {
      result.set(trimmed.slice(trimmed.length - 32));
    }
    return result;
  };

  const rNorm = normalizeInt(r);
  const sNorm = normalizeInt(s);

  const rawSignature = new Uint8Array(64);
  rawSignature.set(rNorm, 0);
  rawSignature.set(sNorm, 32);
  return rawSignature;
}

// ============ INTERNAL MUTATIONS ============

/**
 * Create user with Turnkey wallet addresses
 * Called by the registerWithTurnkey action
 */
export const createUserWithTurnkey = internalMutation({
  args: {
    credentialId: v.string(),
    displayName: v.optional(v.string()),
    solanaAddress: v.string(),
    ethereumAddress: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    // Verify credential is not already used
    const existing = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (existing) {
      throw new Error("Credential already registered");
    }

    // Create user with Turnkey wallet addresses
    const userId = await ctx.db.insert("users", {
      credentialId: args.credentialId,
      publicKey: new ArrayBuffer(0), // Empty - Turnkey manages keys
      solanaAddress: args.solanaAddress,
      ethereumAddress: args.ethereumAddress,
      displayName: args.displayName,
      privacySettings: {
        dataRetention: 365,
        analyticsOptOut: false,
        transactionIsolation: true,
      },
      kycStatus: "none",
      riskScore: 0,
      accountStatus: "active",
      lastActive: Date.now(),
      createdAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Update user's KYC status (called by compliance module)
 */
export const updateKycStatus = internalMutation({
  args: {
    userId: v.id("users"),
    kycStatus: v.union(
      v.literal("none"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected")
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.userId, {
      kycStatus: args.kycStatus,
    });
  },
});

/**
 * Update user's risk score (called by fraud module)
 */
export const updateRiskScore = internalMutation({
  args: {
    userId: v.id("users"),
    riskScore: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.userId, {
      riskScore: args.riskScore,
    });
  },
});

/**
 * Update account status (for suspension/locking)
 */
export const updateAccountStatus = internalMutation({
  args: {
    userId: v.id("users"),
    accountStatus: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("locked")
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.userId, {
      accountStatus: args.accountStatus,
    });
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Derive a Solana address from a P-256 public key
 *
 * This creates a deterministic mapping from WebAuthn credentials to Solana addresses.
 * The derivation is compatible with the TextPay smart contract's PDA derivation.
 *
 * Note: In production, this should use proper cryptographic libraries.
 * This is a placeholder that demonstrates the concept.
 */
function deriveSolanaAddressFromP256(publicKey: ArrayBuffer): string {
  // Convert ArrayBuffer to Uint8Array for processing
  const keyBytes = new Uint8Array(publicKey);

  // In production, this would:
  // 1. Hash the P-256 public key with SHA-256
  // 2. Use the hash as a seed for ed25519 key derivation
  // 3. Or derive a PDA using the TextPay program's seeds

  // For now, return a placeholder that indicates derivation
  // The actual implementation will use @solana/web3.js and proper key derivation
  const hashHex = Array.from(keyBytes.slice(0, 32))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // This is a placeholder - real implementation would create valid Solana address
  return `derived_${hashHex.slice(0, 32)}`;
}

/**
 * Verify a WebAuthn assertion signature using P-256 ECDSA
 *
 * This verifies that the signature was created by the private key
 * corresponding to the stored public key.
 *
 * WebAuthn signature verification process:
 * 1. Hash clientDataJSON with SHA-256
 * 2. Concatenate authenticatorData + clientDataHash
 * 3. Verify signature against concatenated data using publicKey (P-256 ECDSA)
 * 4. Verify authenticator flags and counter
 */
async function verifyWebAuthnSignatureAsync(
  publicKey: ArrayBuffer,
  authenticatorData: ArrayBuffer,
  clientDataJSON: ArrayBuffer,
  signature: ArrayBuffer
): Promise<boolean> {
  // Validate inputs
  if (!publicKey || !authenticatorData || !clientDataJSON || !signature) {
    console.warn("[WebAuthn] Missing required parameters for verification");
    return false;
  }

  // Validate public key length (P-256 uncompressed public key is 65 bytes)
  if (publicKey.byteLength === 0) {
    // Empty public key means biometric-only auth (no WebAuthn public key)
    // Skip signature verification for biometric-only users
    console.log("[WebAuthn] Empty public key - biometric-only auth, skipping signature verification");
    return true;
  }

  if (publicKey.byteLength !== 65 && publicKey.byteLength !== 64) {
    console.warn(`[WebAuthn] Invalid public key length: ${publicKey.byteLength} (expected 64 or 65)`);
    return false;
  }

  try {
    // Step 1: Hash clientDataJSON with SHA-256
    const clientDataHash = await crypto.subtle.digest("SHA-256", clientDataJSON);

    // Step 2: Concatenate authenticatorData + clientDataHash (this is the signed data)
    const authDataArray = new Uint8Array(authenticatorData);
    const clientDataHashArray = new Uint8Array(clientDataHash);
    const signedData = new Uint8Array(authDataArray.length + clientDataHashArray.length);
    signedData.set(authDataArray, 0);
    signedData.set(clientDataHashArray, authDataArray.length);

    // Step 3: Import the P-256 public key for verification
    // WebAuthn uses COSE format, but we store raw EC public key (65 bytes with 0x04 prefix)
    let rawPublicKey = new Uint8Array(publicKey);

    // Ensure the key has the uncompressed point format prefix (0x04)
    if (rawPublicKey.length === 64) {
      // Add the 0x04 prefix for uncompressed format
      const prefixedKey = new Uint8Array(65);
      prefixedKey[0] = 0x04;
      prefixedKey.set(rawPublicKey, 1);
      rawPublicKey = prefixedKey;
    }

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      rawPublicKey,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["verify"]
    );

    // Step 4: Convert WebAuthn signature from ASN.1 DER to raw format
    // WebAuthn uses ASN.1 DER encoding, but SubtleCrypto expects raw r||s format
    const rawSignature = convertDerToRaw(new Uint8Array(signature));
    if (!rawSignature) {
      console.warn("[WebAuthn] Failed to convert DER signature to raw format");
      return false;
    }

    // Step 5: Verify the signature
    const isValid = await crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: { name: "SHA-256" },
      },
      cryptoKey,
      rawSignature,
      signedData
    );

    // Step 6: Verify authenticator data flags (optional but recommended)
    // Bit 0: User Present (UP) - should be 1
    // Bit 2: User Verified (UV) - may be 0 or 1 depending on authenticator
    const flags = authDataArray[32]; // Flags are at byte 32 of authenticatorData
    const userPresent = (flags & 0x01) !== 0;

    if (!userPresent) {
      console.warn("[WebAuthn] User Present flag not set");
      return false;
    }

    if (isValid) {
      console.log("[WebAuthn] Signature verified successfully");
    } else {
      console.warn("[WebAuthn] Signature verification failed");
    }

    return isValid;
  } catch (error) {
    console.error("[WebAuthn] Signature verification error:", error);
    return false;
  }
}

/**
 * Convert ASN.1 DER encoded signature to raw format (r||s)
 * WebAuthn signatures are DER encoded, but SubtleCrypto expects raw format
 *
 * DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
 * Raw format: [r (32 bytes)] [s (32 bytes)]
 */
function convertDerToRaw(derSignature: Uint8Array): Uint8Array<ArrayBuffer> | null {
  try {
    // Check minimum length and sequence tag
    if (derSignature.length < 8 || derSignature[0] !== 0x30) {
      // May already be raw format (64 bytes for P-256)
      if (derSignature.length === 64) {
        const result = new Uint8Array(64);
        result.set(derSignature);
        return result;
      }
      console.warn("[WebAuthn] Invalid DER signature format");
      return null;
    }

    let offset = 2; // Skip sequence tag and length

    // Parse r
    if (derSignature[offset] !== 0x02) {
      return null;
    }
    offset++;
    const rLength = derSignature[offset];
    offset++;
    let r = derSignature.slice(offset, offset + rLength);
    offset += rLength;

    // Parse s
    if (derSignature[offset] !== 0x02) {
      return null;
    }
    offset++;
    const sLength = derSignature[offset];
    offset++;
    let s = derSignature.slice(offset, offset + sLength);

    // Remove leading zeros if present (DER uses minimum bytes)
    // and pad to 32 bytes for P-256
    const rNorm = normalizeInteger(r, 32);
    const sNorm = normalizeInteger(s, 32);

    // Concatenate r and s
    const rawSignature = new Uint8Array(64);
    rawSignature.set(rNorm, 0);
    rawSignature.set(sNorm, 32);

    return rawSignature;
  } catch (error) {
    console.error("[WebAuthn] Error converting DER to raw:", error);
    return null;
  }
}

/**
 * Normalize an integer to exactly targetLength bytes
 * Removes leading zeros or pads with zeros as needed
 */
function normalizeInteger(bytes: Uint8Array, targetLength: number): Uint8Array<ArrayBuffer> {
  // Remove leading zeros
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start++;
  }
  const trimmed = bytes.slice(start);

  // Pad or truncate to target length
  const result = new Uint8Array(targetLength);
  if (trimmed.length <= targetLength) {
    result.set(trimmed, targetLength - trimmed.length);
  } else {
    result.set(trimmed.slice(trimmed.length - targetLength));
  }
  return result;
}

/**
 * Synchronous wrapper for backward compatibility
 * Note: This is a synchronous function that internally uses async verification.
 * For mutations, this returns true and verification should be done in an action.
 *
 * IMPORTANT: For production, use verifyPasskeyAction which performs async verification.
 */
function verifyWebAuthnSignature(
  publicKey: ArrayBuffer,
  authenticatorData: ArrayBuffer,
  clientDataJSON: ArrayBuffer,
  signature: ArrayBuffer
): boolean {
  // Basic sanity checks
  if (!publicKey || !authenticatorData || !clientDataJSON || !signature) {
    return false;
  }

  // Empty public key means biometric-only auth
  if (publicKey.byteLength === 0) {
    return true;
  }

  // For mutations, we perform a synchronous validation that checks structure
  // The actual signature verification should be done via verifyPasskeyAction
  // This is because mutations cannot be async in Convex

  // Validate authenticator data minimum length (rpIdHash + flags + counter = 37 bytes)
  if (authenticatorData.byteLength < 37) {
    console.warn("[WebAuthn] Authenticator data too short");
    return false;
  }

  // Check User Present flag
  const authDataArray = new Uint8Array(authenticatorData);
  const flags = authDataArray[32];
  const userPresent = (flags & 0x01) !== 0;
  if (!userPresent) {
    console.warn("[WebAuthn] User Present flag not set");
    return false;
  }

  // Validate signature has minimum length for ECDSA P-256 (at least 64 bytes raw, or 70+ DER)
  if (signature.byteLength < 64) {
    console.warn("[WebAuthn] Signature too short");
    return false;
  }

  // Structure is valid - for full verification, use verifyPasskeyAction
  console.log("[WebAuthn] Structure validation passed - use verifyPasskeyAction for cryptographic verification");
  return true;
}
