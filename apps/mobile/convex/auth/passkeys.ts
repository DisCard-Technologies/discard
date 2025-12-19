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
import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

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

// ============ INTERNAL MUTATIONS ============

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
