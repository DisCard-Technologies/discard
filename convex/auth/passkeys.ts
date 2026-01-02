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
import { v } from "convex/values";
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

    // Derive Solana address from P-256 public key
    // This uses a deterministic derivation compatible with the TextPay program
    const solanaAddress = deriveSolanaAddressFromP256(args.publicKey);

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
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
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

    // Check if new email is already in use
    if (args.email && args.email !== user.email) {
      const emailExists = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();

      if (emailExists) {
        throw new Error("Email already in use");
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
    dataRetention: v.optional(v.number()),
    analyticsOptOut: v.optional(v.boolean()),
    transactionIsolation: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
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
 * Link phone hash for TextPay integration
 */
export const linkPhoneHash = mutation({
  args: {
    phoneHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
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
    newCredentialId: v.string(),
    newPublicKey: v.bytes(),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
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
  }> => {
    // Check if credential is already registered
    const existing = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .first();

    if (existing) {
      // Return existing user (allows re-registration on same device)
      return {
        userId: existing._id,
        solanaAddress: existing.solanaAddress ?? null,
      };
    }

    // Validate Solana address format if provided
    if (args.solanaAddress && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(args.solanaAddress)) {
      throw new Error("Invalid Solana address format");
    }

    // Create user record with empty public key (biometric-only auth)
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
    solanaAddress: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
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
    userId: v.id("users"),
    ethereumAddress: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
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
 * Verify a WebAuthn assertion signature
 *
 * This verifies that the signature was created by the private key
 * corresponding to the stored public key.
 *
 * Note: In production, this should be done in a Convex action using
 * proper WebAuthn verification libraries.
 */
function verifyWebAuthnSignature(
  publicKey: ArrayBuffer,
  authenticatorData: ArrayBuffer,
  clientDataJSON: ArrayBuffer,
  signature: ArrayBuffer
): boolean {
  // In production, this would:
  // 1. Hash clientDataJSON with SHA-256
  // 2. Concatenate authenticatorData + clientDataHash
  // 3. Verify signature against concatenated data using publicKey
  // 4. Verify authenticator flags and counter

  // For now, return true to allow testing
  // The actual implementation will use SubtleCrypto or a verification library
  console.log("WebAuthn signature verification placeholder - implement in action");

  // Basic sanity checks
  if (!publicKey || !authenticatorData || !clientDataJSON || !signature) {
    return false;
  }

  // Placeholder - always returns true
  // IMPORTANT: Replace with actual verification before production
  return true;
}
