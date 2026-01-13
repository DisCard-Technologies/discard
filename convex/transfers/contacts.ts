/**
 * DisCard 2035 - Contacts Mutations & Queries
 *
 * Convex functions for contact management.
 */

import { v } from "convex/values";
import { mutation, query, internalQuery } from "../_generated/server";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate initials from a name
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Generate a random avatar color
 */
function generateAvatarColor(): string {
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FFEAA7",
    "#DDA0DD",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E9",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new contact
 */
export const create = mutation({
  args: {
    name: v.string(),
    identifier: v.string(),
    identifierType: v.union(
      v.literal("address"),
      v.literal("sol_name"),
      v.literal("phone"),
      v.literal("email")
    ),
    resolvedAddress: v.string(),
    verified: v.optional(v.boolean()),
    linkedUserId: v.optional(v.id("users")),
    phoneNumber: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if contact already exists for this address
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_user_address", (q) =>
        q.eq("userId", user._id).eq("resolvedAddress", args.resolvedAddress)
      )
      .first();

    if (existing) {
      // Update existing contact
      await ctx.db.patch(existing._id, {
        name: args.name,
        identifier: args.identifier,
        identifierType: args.identifierType,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new contact
    const contactId = await ctx.db.insert("contacts", {
      userId: user._id,
      name: args.name,
      identifier: args.identifier,
      identifierType: args.identifierType,
      resolvedAddress: args.resolvedAddress,
      linkedUserId: args.linkedUserId,
      phoneNumber: args.phoneNumber,
      email: args.email,
      avatarInitials: getInitials(args.name),
      avatarColor: generateAvatarColor(),
      verified: args.verified ?? false,
      transferCount: 0,
      totalAmountSent: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return contactId;
  },
});

/**
 * Update a contact
 */
export const update = mutation({
  args: {
    contactId: v.id("contacts"),
    name: v.optional(v.string()),
    identifier: v.optional(v.string()),
    identifierType: v.optional(
      v.union(
        v.literal("address"),
        v.literal("sol_name"),
        v.literal("phone"),
        v.literal("email")
      )
    ),
    resolvedAddress: v.optional(v.string()),
    verified: v.optional(v.boolean()),
    isFavorite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      updates.name = args.name;
      updates.avatarInitials = getInitials(args.name);
    }

    if (args.identifier !== undefined) {
      updates.identifier = args.identifier;
    }

    if (args.identifierType !== undefined) {
      updates.identifierType = args.identifierType;
    }

    if (args.resolvedAddress !== undefined) {
      updates.resolvedAddress = args.resolvedAddress;
    }

    if (args.verified !== undefined) {
      updates.verified = args.verified;
    }

    if (args.isFavorite !== undefined) {
      updates.isFavorite = args.isFavorite;
    }

    await ctx.db.patch(args.contactId, updates);
  },
});

/**
 * Delete a contact
 */
export const remove = mutation({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    await ctx.db.delete(args.contactId);
  },
});

/**
 * Mark contact as used (updates lastUsedAt and transferCount)
 */
export const markUsed = mutation({
  args: {
    contactId: v.id("contacts"),
    amountUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    await ctx.db.patch(args.contactId, {
      lastUsedAt: Date.now(),
      transferCount: contact.transferCount + 1,
      totalAmountSent: contact.totalAmountSent + args.amountUsd,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Get or create a contact for a transfer
 */
export const getOrCreate = mutation({
  args: {
    name: v.string(),
    identifier: v.string(),
    identifierType: v.union(
      v.literal("address"),
      v.literal("sol_name"),
      v.literal("phone"),
      v.literal("email")
    ),
    resolvedAddress: v.string(),
    linkedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if contact already exists
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_user_address", (q) =>
        q.eq("userId", user._id).eq("resolvedAddress", args.resolvedAddress)
      )
      .first();

    if (existing) {
      return existing;
    }

    // Create new contact
    const contactId = await ctx.db.insert("contacts", {
      userId: user._id,
      name: args.name,
      identifier: args.identifier,
      identifierType: args.identifierType,
      resolvedAddress: args.resolvedAddress,
      linkedUserId: args.linkedUserId,
      avatarInitials: getInitials(args.name),
      avatarColor: generateAvatarColor(),
      verified: false,
      transferCount: 0,
      totalAmountSent: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(contactId);
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get a single contact by ID
 */
export const get = query({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId);
  },
});

/**
 * Get all contacts for the current user
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Sort by name
    return contacts.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Get recent contacts (sorted by lastUsedAt)
 */
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    // Get all contacts and sort by lastUsedAt
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter to only those with lastUsedAt and sort
    const recentContacts = contacts
      .filter((c) => c.lastUsedAt !== undefined)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, args.limit ?? 5);

    return recentContacts;
  },
});

/**
 * Search contacts by name or identifier
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    const searchQuery = args.query.toLowerCase();

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter by name or identifier
    const matched = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery) ||
        c.identifier.toLowerCase().includes(searchQuery)
    );

    return matched.slice(0, args.limit ?? 10);
  },
});

/**
 * Get contact by resolved address
 */
export const getByAddress = query({
  args: {
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return null;
    }

    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_user_address", (q) =>
        q.eq("userId", user._id).eq("resolvedAddress", args.address)
      )
      .first();

    return contact;
  },
});

/**
 * Get frequent contacts (sorted by transfer count)
 */
export const getFrequent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Sort by transfer count
    const frequentContacts = contacts
      .filter((c) => c.transferCount > 0)
      .sort((a, b) => b.transferCount - a.transferCount)
      .slice(0, args.limit ?? 5);

    return frequentContacts;
  },
});

/**
 * Get favorite contacts
 */
export const getFavorites = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", identity.subject)
      )
      .first();

    if (!user) {
      return [];
    }

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter favorites and sort by name
    const favoriteContacts = contacts
      .filter((c) => c.isFavorite === true)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, args.limit ?? 20);

    return favoriteContacts;
  },
});

// ============================================================================
// Internal Queries (for use by other Convex functions)
// ============================================================================

/**
 * Get all contacts for a user by userId (internal use)
 */
export const listByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return contacts.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Toggle favorite status for a contact
 */
export const toggleFavorite = mutation({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    // Toggle the favorite status
    const newFavoriteStatus = !contact.isFavorite;

    await ctx.db.patch(args.contactId, {
      isFavorite: newFavoriteStatus,
      updatedAt: Date.now(),
    });

    return { isFavorite: newFavoriteStatus };
  },
});
