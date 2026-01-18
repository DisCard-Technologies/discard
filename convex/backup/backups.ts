/**
 * Wallet Backup Mutations and Queries
 *
 * Manages backup metadata in Convex (NOT the encrypted backup itself).
 * The encrypted backup is stored in cloud storage (iCloud/Google Drive/local file).
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Record a new backup
 * Called after successfully uploading to cloud storage
 */
export const recordBackup = mutation({
  args: {
    userId: v.id("users"),
    backupId: v.string(),
    backupProvider: v.union(
      v.literal("icloud"),
      v.literal("google_drive"),
      v.literal("local_file")
    ),
    backupHash: v.string(),
    walletFingerprint: v.optional(v.string()),
    deviceName: v.optional(v.string()),
    wordCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Mark any existing active backups as superseded
    const existingBackups = await ctx.db
      .query("walletBackups")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .collect();

    for (const backup of existingBackups) {
      await ctx.db.patch(backup._id, { status: "superseded" });
    }

    // Create new backup record
    const backupDocId = await ctx.db.insert("walletBackups", {
      userId: args.userId,
      backupId: args.backupId,
      backupProvider: args.backupProvider,
      backupHash: args.backupHash,
      walletFingerprint: args.walletFingerprint,
      deviceName: args.deviceName,
      wordCount: args.wordCount,
      status: "active",
      createdAt: Date.now(),
    });

    return {
      backupDocId,
      backupId: args.backupId,
    };
  },
});

/**
 * Check if user has an active backup
 */
export const hasBackup = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db
      .query("walletBackups")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();

    return {
      hasBackup: backup !== null,
      provider: backup?.backupProvider,
      createdAt: backup?.createdAt,
      walletFingerprint: backup?.walletFingerprint,
    };
  },
});

/**
 * Get backup history for a user
 */
export const getBackupHistory = query({
  args: {
    userId: v.id("users"),
    includeSuperseded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("walletBackups")
      .withIndex("by_user", (q) => q.eq("userId", args.userId));

    let backups = await query.collect();

    // Filter by status if not including superseded
    if (!args.includeSuperseded) {
      backups = backups.filter((b) => b.status === "active");
    }

    // Sort by created date (newest first)
    backups.sort((a, b) => b.createdAt - a.createdAt);

    return backups.map((b) => ({
      id: b._id,
      backupId: b.backupId,
      provider: b.backupProvider,
      status: b.status,
      createdAt: b.createdAt,
      verifiedAt: b.verifiedAt,
      deviceName: b.deviceName,
      wordCount: b.wordCount,
      walletFingerprint: b.walletFingerprint,
    }));
  },
});

/**
 * Get the active backup for a user
 */
export const getActiveBackup = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db
      .query("walletBackups")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();

    if (!backup) return null;

    return {
      id: backup._id,
      backupId: backup.backupId,
      provider: backup.backupProvider,
      backupHash: backup.backupHash,
      walletFingerprint: backup.walletFingerprint,
      deviceName: backup.deviceName,
      wordCount: backup.wordCount,
      createdAt: backup.createdAt,
      verifiedAt: backup.verifiedAt,
    };
  },
});

/**
 * Verify a backup (record that user confirmed backup is working)
 */
export const markBackupVerified = mutation({
  args: {
    backupId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db
      .query("walletBackups")
      .withIndex("by_backup_id", (q) => q.eq("backupId", args.backupId))
      .first();

    if (!backup) {
      throw new Error("Backup not found");
    }

    if (backup.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(backup._id, {
      verifiedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete a backup record (mark as deleted)
 */
export const deleteBackup = mutation({
  args: {
    backupId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db
      .query("walletBackups")
      .withIndex("by_backup_id", (q) => q.eq("backupId", args.backupId))
      .first();

    if (!backup) {
      throw new Error("Backup not found");
    }

    if (backup.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(backup._id, {
      status: "deleted",
    });

    return { success: true };
  },
});

/**
 * Verify backup hash matches
 * Used when restoring to confirm the downloaded backup is correct
 */
export const verifyBackupHash = query({
  args: {
    backupHash: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db
      .query("walletBackups")
      .withIndex("by_hash", (q) => q.eq("backupHash", args.backupHash))
      .first();

    if (!backup) {
      return {
        valid: false,
        reason: "No backup with this hash found",
      };
    }

    if (backup.userId !== args.userId) {
      return {
        valid: false,
        reason: "Backup belongs to different user",
      };
    }

    return {
      valid: true,
      backupId: backup.backupId,
      provider: backup.backupProvider,
      createdAt: backup.createdAt,
      status: backup.status,
    };
  },
});
