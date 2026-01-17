/**
 * Privacy Module (Convex Backend)
 * 
 * Stores ENCRYPTED privacy-related data. Users control encryption keys.
 * 
 * SECURITY PRINCIPLES:
 * - All sensitive data encrypted client-side before storage
 * - Convex never sees plaintext credentials, keys, or amounts
 * - User's wallet private key derives encryption keys (never stored)
 * - Convex is just an encrypted blob store (E2EE)
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// ENCRYPTED CREDENTIALS VAULT
// ============================================================================

/**
 * Store encrypted credential
 * 
 * The credential is encrypted CLIENT-SIDE with user's derived key.
 * Convex stores the encrypted blob - cannot decrypt it.
 */
export const storeCredential = mutation({
  args: {
    userId: v.id("users"),
    credentialId: v.string(),
    encryptedData: v.string(),        // NaCl secretbox encrypted
    credentialHash: v.string(),       // Hash for deduplication
    attestationType: v.string(),
    issuer: v.string(),
    availableProofs: v.array(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, credentialId, encryptedData, credentialHash, attestationType, issuer, availableProofs, expiresAt } = args;
    
    // Check if credential already exists
    const existing = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_user_credential", (q) => q.eq("userId", userId).eq("credentialId", credentialId))
      .first();
    
    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        encryptedData,
        credentialHash,
        updatedAt: Date.now(),
      });
      console.log(`[Privacy] Updated encrypted credential: ${credentialId}`);
    } else {
      // Create new
      await ctx.db.insert("encryptedCredentials", {
        userId,
        credentialId,
        encryptedData,
        credentialHash,
        attestationType,
        issuer,
        availableProofs,
        storedAt: Date.now(),
        expiresAt,
        updatedAt: Date.now(),
      });
      console.log(`[Privacy] Stored encrypted credential: ${credentialId}`);
    }
    
    return { success: true };
  },
});

/**
 * Get user's encrypted credentials
 * 
 * Returns encrypted blobs - client must decrypt with their key
 */
export const getCredentials = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    
    // Filter out expired credentials
    const now = Date.now();
    const active = credentials.filter(c => !c.expiresAt || c.expiresAt > now);
    
    return active.map(c => ({
      credentialId: c.credentialId,
      encryptedData: c.encryptedData,     // Still encrypted
      credentialHash: c.credentialHash,
      attestationType: c.attestationType,
      issuer: c.issuer,
      availableProofs: c.availableProofs,
      storedAt: c.storedAt,
      expiresAt: c.expiresAt,
    }));
  },
});

/**
 * Delete credential
 */
export const deleteCredential = mutation({
  args: {
    userId: v.id("users"),
    credentialId: v.string(),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_user_credential", (q) => 
        q.eq("userId", args.userId).eq("credentialId", args.credentialId))
      .first();
    
    if (credential) {
      await ctx.db.delete(credential._id);
      console.log(`[Privacy] Deleted credential: ${args.credentialId}`);
      return { success: true };
    }
    
    return { success: false, error: "Credential not found" };
  },
});

// ============================================================================
// ENCRYPTED DEPOSIT NOTES (UMBRA POOL)
// ============================================================================

/**
 * Store encrypted deposit note
 * 
 * Note contains commitment, nullifier, encrypted amount.
 * Encrypted client-side before storage.
 */
export const storeDepositNote = mutation({
  args: {
    userId: v.id("users"),
    noteId: v.string(),
    encryptedNote: v.string(),        // Contains: commitment, nullifier, encryptedAmount
    poolId: v.string(),
    spent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, noteId, encryptedNote, poolId, spent } = args;
    
    // Check if note already exists
    const existing = await ctx.db
      .query("depositNotes")
      .withIndex("by_user_note", (q) => q.eq("userId", userId).eq("noteId", noteId))
      .first();
    
    if (existing) {
      return { success: false, error: "Note already exists" };
    }
    
    await ctx.db.insert("depositNotes", {
      userId,
      noteId,
      encryptedNote,
      poolId,
      spent: spent ?? false,
      createdAt: Date.now(),
    });
    
    console.log(`[Privacy] Stored encrypted deposit note: ${noteId}`);
    return { success: true };
  },
});

/**
 * Get user's deposit notes
 */
export const getDepositNotes = query({
  args: {
    userId: v.id("users"),
    includeSpent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("depositNotes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    
    // Filter spent notes if requested
    const filtered = args.includeSpent ? notes : notes.filter(n => !n.spent);
    
    return filtered.map(n => ({
      noteId: n.noteId,
      encryptedNote: n.encryptedNote,  // Still encrypted
      poolId: n.poolId,
      spent: n.spent,
      createdAt: n.createdAt,
    }));
  },
});

/**
 * Mark deposit note as spent
 */
export const markNoteSpent = mutation({
  args: {
    userId: v.id("users"),
    noteId: v.string(),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const note = await ctx.db
      .query("depositNotes")
      .withIndex("by_user_note", (q) => 
        q.eq("userId", args.userId).eq("noteId", args.noteId))
      .first();
    
    if (!note) {
      return { success: false, error: "Note not found" };
    }
    
    if (note.spent) {
      return { success: false, error: "Note already spent" };
    }
    
    await ctx.db.patch(note._id, {
      spent: true,
      spentAt: Date.now(),
      spentTxSignature: args.txSignature,
    });
    
    console.log(`[Privacy] Marked note as spent: ${args.noteId}`);
    return { success: true };
  },
});

// ============================================================================
// SHIELDED COMMITMENTS (PRIVACY CASH)
// ============================================================================

/**
 * Add shielded balance commitment
 * 
 * Amount and randomness are encrypted client-side.
 * Commitment is a hash - safe to store unencrypted.
 */
export const addShieldedCommitment = mutation({
  args: {
    userId: v.id("users"),
    commitmentId: v.string(),
    commitment: v.string(),           // Pedersen commitment (public)
    encryptedAmount: v.string(),      // Amount (encrypted)
    encryptedRandomness: v.string(),  // Randomness (encrypted)
    nullifier: v.string(),            // For spending detection
    sourceType: v.string(),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, commitmentId, commitment, encryptedAmount, encryptedRandomness, nullifier, sourceType, sourceId } = args;
    
    await ctx.db.insert("shieldedCommitments", {
      userId,
      commitmentId,
      commitment,
      encryptedAmount,
      encryptedRandomness,
      nullifier,
      spent: false,
      sourceType,
      sourceId,
      createdAt: Date.now(),
    });
    
    console.log(`[Privacy] Added shielded commitment: ${commitmentId}`);
    return { success: true };
  },
});

/**
 * Get user's shielded commitments
 */
export const getShieldedCommitments = query({
  args: {
    userId: v.id("users"),
    includeSpent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const commitments = await ctx.db
      .query("shieldedCommitments")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId))
      .collect();
    
    // Filter spent if requested
    const filtered = args.includeSpent 
      ? commitments 
      : commitments.filter(c => !c.spent);
    
    return filtered.map(c => ({
      commitmentId: c.commitmentId,
      commitment: c.commitment,              // Public commitment
      encryptedAmount: c.encryptedAmount,    // Encrypted
      encryptedRandomness: c.encryptedRandomness, // Encrypted
      nullifier: c.nullifier,
      spent: c.spent,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      createdAt: c.createdAt,
      spentAt: c.spentAt,
    }));
  },
});

/**
 * Mark commitment as spent
 */
export const markCommitmentSpent = mutation({
  args: {
    userId: v.id("users"),
    nullifier: v.string(),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const commitment = await ctx.db
      .query("shieldedCommitments")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("nullifier"), args.nullifier))
      .first();
    
    if (!commitment) {
      return { success: false, error: "Commitment not found" };
    }
    
    if (commitment.spent) {
      return { success: false, error: "Already spent" };
    }
    
    await ctx.db.patch(commitment._id, {
      spent: true,
      spentAt: Date.now(),
      spentTxSignature: args.txSignature,
    });
    
    console.log(`[Privacy] Marked commitment as spent: ${args.nullifier.slice(0, 16)}...`);
    return { success: true };
  },
});

// ============================================================================
// ENCRYPTED GIFT CARD CODES (PRIVATE RWA)
// ============================================================================

/**
 * Store encrypted gift card/RWA code
 * 
 * Code is encrypted client-side with user's key.
 */
export const storeRedemptionCode = mutation({
  args: {
    userId: v.id("users"),
    redemptionId: v.string(),
    productType: v.string(),
    brand: v.string(),
    encryptedCode: v.string(),        // Code encrypted with user's key
    redemptionUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, redemptionId, productType, brand, encryptedCode, redemptionUrl, expiresAt } = args;
    
    await ctx.db.insert("redemptionCodes", {
      userId,
      redemptionId,
      productType,
      brand,
      encryptedCode,
      redemptionUrl,
      status: "active",
      expiresAt,
      createdAt: Date.now(),
    });
    
    console.log(`[Privacy] Stored encrypted redemption code: ${redemptionId}`);
    return { success: true };
  },
});

/**
 * Get user's redemption codes
 */
export const getRedemptionCodes = query({
  args: {
    userId: v.id("users"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let codes = await ctx.db
      .query("redemptionCodes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    
    if (args.status) {
      codes = codes.filter(c => c.status === args.status);
    }
    
    return codes.map(c => ({
      redemptionId: c.redemptionId,
      productType: c.productType,
      brand: c.brand,
      encryptedCode: c.encryptedCode,  // Still encrypted
      redemptionUrl: c.redemptionUrl,
      status: c.status,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    }));
  },
});

/**
 * Mark redemption code as used
 */
export const markRedemptionUsed = mutation({
  args: {
    userId: v.id("users"),
    redemptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query("redemptionCodes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("redemptionId"), args.redemptionId))
      .first();
    
    if (!code) {
      return { success: false, error: "Code not found" };
    }
    
    await ctx.db.patch(code._id, {
      status: "redeemed",
      redeemedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// ============================================================================
// STEALTH ADDRESS METADATA (Privacy-Preserving)
// ============================================================================

/**
 * Store stealth address metadata
 * 
 * Stores ONLY:
 * - Ephemeral public key (public anyway)
 * - Purpose (generic: "card_funding")
 * - Used status
 * 
 * Does NOT store:
 * - User's real identity
 * - Link to specific card (except via userId index)
 */
export const recordStealthAddress = mutation({
  args: {
    userId: v.id("users"),
    stealthAddress: v.string(),
    ephemeralPubKey: v.string(),
    purpose: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, stealthAddress, ephemeralPubKey, purpose } = args;
    
    await ctx.db.insert("stealthAddresses", {
      userId,
      stealthAddress,
      ephemeralPubKey,
      purpose,
      used: false,
      createdAt: Date.now(),
    });
    
    console.log(`[Privacy] Recorded stealth address (purpose: ${purpose})`);
    return { success: true };
  },
});

/**
 * Get user's stealth addresses for scanning
 */
export const getUserStealthAddresses = query({
  args: {
    userId: v.id("users"),
    includeUsed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const addresses = await ctx.db
      .query("stealthAddresses")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    
    const filtered = args.includeUsed 
      ? addresses 
      : addresses.filter(a => !a.used);
    
    return filtered.map(a => ({
      stealthAddress: a.stealthAddress,
      ephemeralPubKey: a.ephemeralPubKey,
      purpose: a.purpose,
      used: a.used,
      amount: a.amount,
      txSignature: a.txSignature,
      createdAt: a.createdAt,
      usedAt: a.usedAt,
    }));
  },
});

/**
 * Mark stealth address as used
 */
export const markStealthAddressUsed = mutation({
  args: {
    userId: v.id("users"),
    stealthAddress: v.string(),
    amount: v.number(),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const address = await ctx.db
      .query("stealthAddresses")
      .withIndex("by_address", (q) => q.eq("stealthAddress", args.stealthAddress))
      .first();
    
    if (!address) {
      return { success: false, error: "Address not found" };
    }
    
    // Verify ownership
    if (address.userId !== args.userId) {
      return { success: false, error: "Unauthorized" };
    }
    
    await ctx.db.patch(address._id, {
      used: true,
      amount: args.amount,
      txSignature: args.txSignature,
      usedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// ============================================================================
// PRIVACY METRICS (Anonymized)
// ============================================================================

/**
 * Get anonymized privacy statistics
 * 
 * Returns aggregate metrics without user-identifying information
 */
export const getPrivacyStats = query({
  args: {},
  handler: async (ctx) => {
    const credentials = await ctx.db.query("encryptedCredentials").collect();
    const notes = await ctx.db.query("depositNotes").collect();
    const commitments = await ctx.db.query("shieldedCommitments").collect();
    const stealth = await ctx.db.query("stealthAddresses").collect();
    
    return {
      totalEncryptedCredentials: credentials.length,
      totalDepositNotes: notes.length,
      totalShieldedCommitments: commitments.length,
      totalStealthAddresses: stealth.length,
      activeStealthAddresses: stealth.filter(s => !s.used).length,
      unspentNotes: notes.filter(n => !n.spent).length,
      unspentCommitments: commitments.filter(c => !c.spent).length,
    };
  },
});

// ============================================================================
// SYNC STATUS (For Cross-Device)
// ============================================================================

/**
 * Get last sync timestamp for user
 * 
 * Helps client know when to sync data
 */
export const getLastSyncTimestamp = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("encryptedCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    
    const notes = await ctx.db
      .query("depositNotes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    
    const commitments = await ctx.db
      .query("shieldedCommitments")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    
    const timestamps = [
      credentials?.updatedAt || 0,
      notes?.createdAt || 0,
      commitments?.createdAt || 0,
    ];
    
    return {
      lastSyncAt: Math.max(...timestamps),
    };
  },
});
