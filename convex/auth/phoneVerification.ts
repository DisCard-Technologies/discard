/**
 * DisCard 2035 - Phone Verification
 *
 * OTP-based phone verification for P2P discovery.
 * Sends SMS via Vonage and verifies user ownership.
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

// ============================================================================
// Constants
// ============================================================================

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a random 6-digit OTP
 */
function generateOTP(): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
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
 * Get verification by ID (internal)
 */
export const getById = internalQuery({
  args: { id: v.id("phoneVerifications") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get pending verification for user and phone (internal)
 */
export const getPending = internalQuery({
  args: { userId: v.id("users"), phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizePhone(args.phoneNumber);

    const verifications = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("phoneNumber"), normalized),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();

    // Return the most recent pending verification
    return verifications.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  },
});

/**
 * Create a new verification record (internal)
 */
export const createVerification = internalMutation({
  args: {
    userId: v.id("users"),
    phoneNumber: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Expire any existing pending verifications for this user/phone
    const existing = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("phoneNumber"), args.phoneNumber),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();

    for (const v of existing) {
      await ctx.db.patch(v._id, { status: "expired" });
    }

    // Create new verification
    const verificationId = await ctx.db.insert("phoneVerifications", {
      userId: args.userId,
      phoneNumber: args.phoneNumber,
      code: args.code,
      attempts: 0,
      status: "pending",
      expiresAt: now + OTP_EXPIRY_MS,
      createdAt: now,
    });

    return verificationId;
  },
});

/**
 * Update verification status (internal)
 */
export const updateVerification = internalMutation({
  args: {
    id: v.id("phoneVerifications"),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("expired"),
      v.literal("failed")
    )),
    attempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {};
    if (args.status !== undefined) updates.status = args.status;
    if (args.attempts !== undefined) updates.attempts = args.attempts;

    await ctx.db.patch(args.id, updates);
  },
});

/**
 * Link phone number to user (internal)
 */
export const linkPhone = internalMutation({
  args: {
    userId: v.id("users"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { phoneNumber: args.phoneNumber });
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Check if user has a verified phone number
 */
export const hasVerifiedPhone = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }

    // Try to find user by credential ID first
    let user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    // Fallback: try to normalize subject as user ID
    if (!user) {
      const userId = ctx.db.normalizeId("users", identity.subject);
      if (userId) user = await ctx.db.get(userId);
    }

    return !!user?.phoneNumber;
  },
});

/**
 * Get current verification status for user
 */
export const getVerificationStatus = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Try to find user by credential ID first
    let user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    // Fallback: try to normalize subject as user ID
    if (!user) {
      const userId = ctx.db.normalizeId("users", identity.subject);
      if (userId) user = await ctx.db.get(userId);
    }

    if (!user) {
      return null;
    }

    const normalized = normalizePhone(args.phoneNumber);

    const verification = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("phoneNumber"), normalized),
          q.eq(q.field("status"), "pending")
        )
      )
      .order("desc")
      .first();

    if (!verification) {
      return null;
    }

    const isExpired = Date.now() > verification.expiresAt;
    const canResend = Date.now() - verification.createdAt > RESEND_COOLDOWN_MS;

    return {
      status: isExpired ? "expired" : verification.status,
      attempts: verification.attempts,
      canResend,
      expiresAt: verification.expiresAt,
      createdAt: verification.createdAt,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Request phone verification - creates OTP record
 * (Actual SMS sending happens in the action)
 */
export const requestVerification = mutation({
  args: {
    phoneNumber: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
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
      throw new Error("User not found or not authenticated");
    }

    const normalized = normalizePhone(args.phoneNumber);

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new Error("Invalid phone number format. Use E.164 format (e.g., +14155551234)");
    }

    // Check if phone number is already in use by another user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", normalized))
      .first();

    if (existingUser && existingUser._id !== user._id) {
      throw new Error("Phone number already in use by another account");
    }

    // Check rate limiting - get most recent verification for this phone
    const recentVerification = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", normalized))
      .order("desc")
      .first();

    if (recentVerification) {
      const timeSinceLastRequest = Date.now() - recentVerification.createdAt;
      if (timeSinceLastRequest < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastRequest) / 1000);
        throw new Error(`Please wait ${waitSeconds} seconds before requesting another code`);
      }
    }

    // Generate OTP
    const code = generateOTP();

    // Expire any existing pending verifications for this user/phone
    const existing = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("phoneNumber"), normalized),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();

    for (const v of existing) {
      await ctx.db.patch(v._id, { status: "expired" });
    }

    // Create new verification record
    const verificationId = await ctx.db.insert("phoneVerifications", {
      userId: user._id,
      phoneNumber: normalized,
      code,
      attempts: 0,
      status: "pending",
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      createdAt: Date.now(),
    });

    return { verificationId, phoneNumber: normalized };
  },
});

/**
 * Verify OTP code
 */
export const verifyCode = mutation({
  args: {
    phoneNumber: v.string(),
    code: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
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
      throw new Error("User not found or not authenticated");
    }

    const normalized = normalizePhone(args.phoneNumber);

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new Error("Invalid phone number format. Use E.164 format (e.g., +14155551234)");
    }

    // DEV BYPASS: Accept "000000" to skip OTP verification
    if (args.code === "000000") {
      console.log(`[PhoneVerification] DEV BYPASS: Linking ${normalized} to user ${user._id}`);
      await ctx.db.patch(user._id, { phoneNumber: normalized });
      return { success: true, bypassed: true };
    }

    // Get the most recent pending verification for this user/phone
    const verification = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("phoneNumber"), normalized),
          q.eq(q.field("status"), "pending")
        )
      )
      .order("desc")
      .first();

    if (!verification) {
      throw new Error("No pending verification found. Please request a new code.");
    }

    // Check if expired
    if (Date.now() > verification.expiresAt) {
      await ctx.db.patch(verification._id, { status: "expired" });
      throw new Error("Verification code expired. Please request a new code.");
    }

    // Check attempts
    if (verification.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(verification._id, { status: "failed" });
      throw new Error("Too many failed attempts. Please request a new code.");
    }

    // Verify code
    if (verification.code !== args.code) {
      await ctx.db.patch(verification._id, {
        attempts: verification.attempts + 1,
      });

      const remaining = MAX_ATTEMPTS - verification.attempts - 1;
      if (remaining <= 0) {
        await ctx.db.patch(verification._id, { status: "failed" });
        throw new Error("Too many failed attempts. Please request a new code.");
      }

      throw new Error(`Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
    }

    // Success! Mark as verified and link phone to user
    await ctx.db.patch(verification._id, { status: "verified" });
    await ctx.db.patch(user._id, { phoneNumber: normalized });

    return { success: true };
  },
});

/**
 * DEV ONLY: Directly link phone number without verification
 */
export const linkPhoneDev = mutation({
  args: {
    phoneNumber: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get user from auth identity or provided userId
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
      throw new Error("User not found or not authenticated");
    }

    const normalized = normalizePhone(args.phoneNumber);

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new Error("Invalid phone number format. Use E.164 format (e.g., +14155551234)");
    }

    console.log(`[PhoneVerification] DEV: Linking ${normalized} to user ${user._id}`);

    await ctx.db.patch(user._id, { phoneNumber: normalized });
    return { success: true, phoneNumber: normalized };
  },
});

// ============================================================================
// Actions (for SMS sending)
// ============================================================================

/**
 * Send verification SMS via Vonage
 */
export const sendVerificationSMS = action({
  args: { verificationId: v.id("phoneVerifications") },
  handler: async (ctx, args): Promise<{ success: boolean; message: string; code?: string }> => {
    // Get verification record
    const verification = await ctx.runQuery(internal.auth.phoneVerification.getById, {
      id: args.verificationId,
    }) as { phoneNumber: string; code: string; status: string } | null;

    if (!verification) {
      throw new Error("Verification not found");
    }

    if (verification.status !== "pending") {
      throw new Error("Verification is no longer pending");
    }

    // Build SMS message
    const smsText = `Your DisCard verification code is: ${verification.code}. This code expires in 10 minutes.`;

    // Get Vonage credentials
    const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
    const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;
    const VONAGE_FROM_NUMBER = process.env.VONAGE_FROM_NUMBER;

    if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM_NUMBER) {
      // In development, just log the code
      console.log(`[PhoneVerification] SMS would be sent to ${verification.phoneNumber}: ${smsText}`);
      console.log(`[PhoneVerification] OTP Code: ${verification.code}`);
      return { success: true, message: "SMS sent (dev mode)", code: verification.code };
    }

    try {
      const response = await fetch("https://rest.nexmo.com/sms/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: VONAGE_API_KEY,
          api_secret: VONAGE_API_SECRET,
          from: VONAGE_FROM_NUMBER,
          to: verification.phoneNumber.replace("+", ""),
          text: smsText,
        }),
      });

      const result = await response.json();

      if (result.messages?.[0]?.status === "0") {
        return { success: true, message: "SMS sent" };
      } else {
        const errorText = result.messages?.[0]?.["error-text"] || "Unknown error";
        throw new Error(`SMS failed: ${errorText}`);
      }
    } catch (err) {
      console.error("[PhoneVerification] SMS error:", err);
      throw err;
    }
  },
});
