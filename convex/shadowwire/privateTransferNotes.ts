/**
 * Private Transfer Notes - Encrypted note registry for confidential P2P
 *
 * Enables recipient discovery and claim flow:
 * 1. Sender publishes encrypted note after private transfer
 * 2. Recipient queries by recipientHash (SHA-256 of their public key)
 * 3. Recipient decrypts note, derives stealth keypair, sweeps funds
 *
 * Privacy: recipientHash is a one-way hash — no raw addresses stored.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================================================
// Mutations
// ============================================================================

/**
 * Publish an encrypted transfer note for recipient discovery.
 * Called by sender after a successful private transfer.
 */
export const publishNote = mutation({
  args: {
    recipientHash: v.string(),      // SHA-256(recipientPublicKey)
    encryptedNote: v.string(),      // NaCl box ciphertext
    ephemeralPubKey: v.string(),    // Sender's ephemeral public key for ECDH
    stealthAddress: v.string(),     // Where the funds sit
    amount: v.optional(v.number()), // Display amount (base units)
    token: v.optional(v.string()),  // Token mint
    tokenSymbol: v.optional(v.string()), // e.g. "USDC"
    transferId: v.optional(v.string()),  // Link to transfers table
    // Used server-side only for recipient lookup — not stored
    recipientAddress: v.optional(v.string()),
    // Auth fallback
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    const now = Date.now();

    // Store the encrypted note
    const noteId = await ctx.db.insert("privateTransferNotes", {
      recipientHash: args.recipientHash,
      encryptedNote: args.encryptedNote,
      ephemeralPubKey: args.ephemeralPubKey,
      stealthAddress: args.stealthAddress,
      amount: args.amount,
      token: args.token,
      tokenSymbol: args.tokenSymbol,
      transferId: args.transferId,
      claimed: false,
      createdAt: now,
      notifiedAt: now,
    });

    // Look up recipient by Solana address to send push notification
    if (args.recipientAddress) {
      const recipientUser = await ctx.db
        .query("users")
        .withIndex("by_solana_address", (q) =>
          q.eq("solanaAddress", args.recipientAddress!)
        )
        .first();

      if (recipientUser) {
        // Schedule push notification via internal action
        await ctx.scheduler.runAfter(0, internal.notifications.send.sendToUser, {
          userId: recipientUser._id,
          type: "crypto_receipt" as const,
          title: "Private Transfer Received",
          body: args.tokenSymbol && args.amount
            ? `You received ${args.amount} ${args.tokenSymbol}. Tap to claim.`
            : "You received a private transfer. Tap to claim.",
          data: {
            screen: "claim",
            stealthAddress: args.stealthAddress,
            noteId: noteId,
          },
          sourceType: "transaction" as const,
          sourceId: args.transferId,
        });
      }
    }

    return noteId;
  },
});

/**
 * Notify recipient about an incoming private transfer.
 * Called after publishNote when the sender knows the recipient's userId.
 */
export const notifyRecipient = mutation({
  args: {
    noteId: v.id("privateTransferNotes"),
    recipientUserId: v.id("users"),
    amount: v.optional(v.number()),
    tokenSymbol: v.optional(v.string()),
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) {
      throw new Error("Note not found");
    }

    // Schedule push notification
    await ctx.scheduler.runAfter(0, internal.notifications.send.sendToUser, {
      userId: args.recipientUserId,
      type: "crypto_receipt" as const,
      title: "Private Transfer Received",
      body: args.tokenSymbol && args.amount
        ? `You received ${args.amount} ${args.tokenSymbol}. Tap to claim.`
        : "You received a private transfer. Tap to claim.",
      data: {
        screen: "claim",
        stealthAddress: note.stealthAddress,
        noteId: args.noteId,
      },
      sourceType: "transaction" as const,
      sourceId: note.transferId,
    });

    // Update notifiedAt
    await ctx.db.patch(args.noteId, { notifiedAt: Date.now() });
  },
});

/**
 * Mark a note as claimed after the recipient sweeps funds.
 */
export const markNoteClaimed = mutation({
  args: {
    noteId: v.id("privateTransferNotes"),
    claimTxSignature: v.string(),
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) {
      throw new Error("Note not found");
    }

    if (note.claimed) {
      throw new Error("Note already claimed");
    }

    await ctx.db.patch(args.noteId, {
      claimed: true,
      claimTxSignature: args.claimTxSignature,
    });
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get unclaimed notes for a recipient (by recipientHash).
 * Reactive — auto-updates UI when new notes arrive or are claimed.
 */
export const getNotesForRecipient = query({
  args: {
    recipientHash: v.string(),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("privateTransferNotes")
      .withIndex("by_recipient_hash", (q) =>
        q.eq("recipientHash", args.recipientHash).eq("claimed", false)
      )
      .order("desc")
      .take(50);

    return notes;
  },
});

/**
 * Get count of claimable (unclaimed) notes for a recipient.
 * Useful for badge display.
 */
export const getClaimableCount = query({
  args: {
    recipientHash: v.string(),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("privateTransferNotes")
      .withIndex("by_recipient_hash", (q) =>
        q.eq("recipientHash", args.recipientHash).eq("claimed", false)
      )
      .collect();

    return notes.length;
  },
});

/**
 * Get a note by its stealth address (for claim verification).
 */
export const getByStealthAddress = query({
  args: {
    stealthAddress: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("privateTransferNotes")
      .withIndex("by_stealth_address", (q) =>
        q.eq("stealthAddress", args.stealthAddress)
      )
      .first();
  },
});
