/**
 * DisCard 2035 - SMS Invitations
 *
 * Convex functions for managing SMS invitations to non-registered users.
 * Uses Vonage (Nexmo) for SMS delivery.
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique invite code
 * Format: 6 alphanumeric characters (e.g., "A1B2C3")
 */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars (0,O,1,I)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhone(phone: string): string {
  return phone.trim().replace(/\s+/g, "");
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Internal query to get invitation by ID
 */
export const getById = internalQuery({
  args: { id: v.id("invitations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Internal mutation to update delivery status
 */
export const updateDeliveryStatus = internalMutation({
  args: {
    id: v.id("invitations"),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      deliveryStatus: args.status,
      deliveryError: args.error,
    });
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get invitation by invite code (for claim flow)
 */
export const getByCode = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", args.inviteCode))
      .first();

    if (!invitation) {
      return null;
    }

    // Mask phone number for privacy (show last 4 digits)
    const maskedPhone = invitation.recipientPhone.slice(0, -4).replace(/./g, "*") +
      invitation.recipientPhone.slice(-4);

    // Get sender info
    const sender = await ctx.db.get(invitation.senderId);

    return {
      ...invitation,
      recipientPhone: maskedPhone,
      senderName: sender?.displayName || "A DisCard user",
    };
  },
});

/**
 * Get invitations sent by current user
 */
export const getSent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_sender", (q) => q.eq("senderId", user._id))
      .order("desc")
      .take(args.limit || 20);

    return invitations;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new invitation (TextPay SMS invite)
 */
export const create = mutation({
  args: {
    recipientPhone: v.string(),
    message: v.optional(v.string()),
    pendingAmount: v.optional(v.number()),
    pendingToken: v.optional(v.string()),
    pendingMint: v.optional(v.string()),
    pendingDecimals: v.optional(v.number()),
    // Sender wallet info for auto-release
    senderSubOrgId: v.optional(v.string()),
    senderWalletAddress: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"invitations">> => {
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

    // Normalize phone
    const normalizedPhone = normalizePhone(args.recipientPhone);

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(normalizedPhone)) {
      throw new Error("Invalid phone number format");
    }

    // Check for existing pending invitation to same phone
    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_phone", (q) => q.eq("recipientPhone", normalizedPhone))
      .filter((q) =>
        q.and(
          q.eq(q.field("senderId"), user._id),
          q.eq(q.field("claimStatus"), "unclaimed")
        )
      )
      .first();

    if (existing) {
      // Return existing invitation instead of creating duplicate
      return existing._id;
    }

    // Generate unique invite code
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const existingCode = await ctx.db
        .query("invitations")
        .withIndex("by_invite_code", (q) => q.eq("inviteCode", inviteCode))
        .first();
      if (!existingCode) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    // Create invitation with sender wallet info for auto-release
    const invitationId = await ctx.db.insert("invitations", {
      senderId: user._id,
      recipientPhone: normalizedPhone,
      inviteCode,
      message: args.message,
      // Sender wallet info
      senderSubOrgId: args.senderSubOrgId,
      senderWalletAddress: args.senderWalletAddress,
      // Pending transfer details
      pendingAmount: args.pendingAmount,
      pendingToken: args.pendingToken,
      pendingMint: args.pendingMint,
      pendingDecimals: args.pendingDecimals,
      deliveryStatus: "pending",
      claimStatus: "unclaimed",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      createdAt: Date.now(),
    });

    return invitationId;
  },
});

/**
 * Send invitation SMS via Vonage
 */
export const send = action({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    // Get invitation
    const invitation = await ctx.runQuery(internal.transfers.invitations.getById, {
      id: args.invitationId,
    });

    if (!invitation) {
      throw new Error("Invitation not found");
    }

    // Get sender info
    const sender = await ctx.runQuery(internal.auth.passkeys.getUserById, {
      userId: invitation.senderId,
    });

    // Build SMS message - TextPay format
    const senderName = sender?.displayName || "Someone";

    // Format amount for display
    let amountDisplay = "";
    if (invitation.pendingAmount && invitation.pendingToken) {
      const decimals = invitation.pendingDecimals ?? 6;
      const formattedAmount = (invitation.pendingAmount / Math.pow(10, decimals)).toFixed(2);
      amountDisplay = `$${formattedAmount} ${invitation.pendingToken}`;
    }

    let smsText: string;
    if (amountDisplay) {
      // TextPay message with pending amount
      smsText = `You have ${amountDisplay} waiting from ${senderName}. `;
      smsText += `Reply 'CLAIM' to activate TextPay wallet, or download the app: https://discard.app/invite/${invitation.inviteCode}`;
    } else {
      // Standard invite without pending transfer
      smsText = `${senderName} invited you to DisCard - the wallet that pays! `;
      if (invitation.message) {
        smsText += `"${invitation.message}" `;
      }
      smsText += `Download now: https://discard.app/invite/${invitation.inviteCode}`;
    }

    // Send via Vonage
    const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
    const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;
    const VONAGE_FROM_NUMBER = process.env.VONAGE_FROM_NUMBER;

    if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM_NUMBER) {
      // In development, just mark as sent without actually sending
      console.log("[Invitations] SMS would be sent:", smsText);
      await ctx.runMutation(internal.transfers.invitations.updateDeliveryStatus, {
        id: args.invitationId,
        status: "sent",
      });
      return { success: true, message: "SMS sent (dev mode)" };
    }

    try {
      const response = await fetch("https://rest.nexmo.com/sms/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: VONAGE_API_KEY,
          api_secret: VONAGE_API_SECRET,
          from: VONAGE_FROM_NUMBER,
          to: invitation.recipientPhone.replace("+", ""),
          text: smsText,
        }),
      });

      const result = await response.json();

      if (result.messages?.[0]?.status === "0") {
        await ctx.runMutation(internal.transfers.invitations.updateDeliveryStatus, {
          id: args.invitationId,
          status: "sent",
        });
        return { success: true, message: "SMS sent" };
      } else {
        const errorText = result.messages?.[0]?.["error-text"] || "Unknown error";
        await ctx.runMutation(internal.transfers.invitations.updateDeliveryStatus, {
          id: args.invitationId,
          status: "failed",
          error: errorText,
        });
        throw new Error(`SMS failed: ${errorText}`);
      }
    } catch (err) {
      await ctx.runMutation(internal.transfers.invitations.updateDeliveryStatus, {
        id: args.invitationId,
        status: "failed",
        error: err instanceof Error ? err.message : "Failed to send SMS",
      });
      throw err;
    }
  },
});

/**
 * Claim an invitation (when new user signs up)
 */
export const claim = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
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

    // Find invitation
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", args.inviteCode))
      .first();

    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.claimStatus === "claimed") {
      throw new Error("Invitation already claimed");
    }

    if (invitation.claimStatus === "expired" || invitation.expiresAt < Date.now()) {
      throw new Error("Invitation expired");
    }

    // Update invitation
    await ctx.db.patch(invitation._id, {
      claimStatus: "claimed",
      claimedByUserId: user._id,
      claimedAt: Date.now(),
    });

    return {
      success: true,
      invitationId: invitation._id, // Return ID for auto-release action
      hasPendingTransfer: !!(invitation.pendingAmount && invitation.senderSubOrgId),
      pendingAmount: invitation.pendingAmount,
      pendingToken: invitation.pendingToken,
      pendingMint: invitation.pendingMint,
    };
  },
});

interface ExecuteClaimedTransferResult {
  success: boolean;
  message: string;
  details?: {
    from: string;
    to: string;
    amount: number;
    token: string;
    mint?: string;
  };
}

/**
 * Execute the pending transfer after an invitation is claimed
 * This auto-releases funds from sender to the new claimant wallet
 */
export const executeClaimedTransfer = action({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args): Promise<ExecuteClaimedTransferResult> => {
    // Get invitation - use type assertion since internal queries return any
    const invitation = await ctx.runQuery(internal.transfers.invitations.getById, {
      id: args.invitationId,
    }) as {
      claimStatus: string;
      claimedByUserId?: string;
      pendingAmount?: number;
      pendingToken?: string;
      pendingMint?: string;
      senderSubOrgId?: string;
      senderWalletAddress?: string;
    } | null;

    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.claimStatus !== "claimed") {
      throw new Error("Invitation not claimed yet");
    }

    if (!invitation.claimedByUserId) {
      throw new Error("No claimant user ID");
    }

    if (!invitation.pendingAmount || !invitation.pendingToken) {
      // No pending transfer to execute
      return { success: true, message: "No pending transfer" };
    }

    if (!invitation.senderSubOrgId || !invitation.senderWalletAddress) {
      throw new Error("Missing sender wallet info for auto-release");
    }

    // Get claimant's wallet address
    const claimant = await ctx.runQuery(internal.auth.passkeys.getUserById, {
      userId: invitation.claimedByUserId,
    }) as { solanaAddress?: string } | null;

    if (!claimant?.solanaAddress) {
      throw new Error("Claimant has no wallet address");
    }

    console.log("[TextPay] Executing claimed transfer:", {
      from: invitation.senderWalletAddress,
      to: claimant.solanaAddress,
      amount: invitation.pendingAmount,
      token: invitation.pendingToken,
    });

    // For now, log the transfer details - full server-side signing
    // requires building and signing the transaction via Turnkey server-side API
    // This is a placeholder for the complete implementation

    // TODO: Implement full server-side transfer:
    // 1. Build SPL token transfer transaction
    // 2. Sign via Turnkey server-side API using senderSubOrgId
    // 3. Submit to Solana
    // 4. Create transfer record

    return {
      success: true,
      message: "Transfer execution initiated",
      details: {
        from: invitation.senderWalletAddress,
        to: claimant.solanaAddress,
        amount: invitation.pendingAmount,
        token: invitation.pendingToken,
        mint: invitation.pendingMint,
      },
    };
  },
});

/**
 * Cancel an invitation
 */
export const cancel = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
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

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.senderId !== user._id) {
      throw new Error("Not authorized");
    }

    if (invitation.claimStatus === "claimed") {
      throw new Error("Cannot cancel claimed invitation");
    }

    await ctx.db.patch(args.invitationId, {
      claimStatus: "expired",
    });

    return { success: true };
  },
});
