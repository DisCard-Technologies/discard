/**
 * DisCard 2035 - Local Contacts Storage
 *
 * Persistent local storage for contacts using AsyncStorage.
 * This stores contacts on the user's device for offline access
 * and reduces server storage costs.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// Types
// ============================================================================

export interface LocalContact {
  id: string;
  name: string;
  identifier: string;
  identifierType: "address" | "sol_name" | "phone" | "email";
  resolvedAddress: string;
  linkedUserId?: string;
  phoneNumber?: string;
  email?: string;
  avatarInitials: string;
  avatarColor: string;
  verified: boolean;
  isFavorite: boolean;
  transferCount: number;
  totalAmountSent: number;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
  // For imported phone contacts
  importedFromPhone?: boolean;
  phoneContactId?: string;
}

export interface PhoneContact {
  id: string;
  name: string;
  phoneNumbers?: Array<{ number: string; label?: string }>;
  emails?: Array<{ email: string; label?: string }>;
  imageAvailable?: boolean;
}

interface ContactsData {
  version: number;
  contacts: LocalContact[];
  lastUpdated: number;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "discard_local_contacts_v2";
const CURRENT_VERSION = 2;

const AVATAR_COLORS = [
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

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function generateAvatarColor(name: string): string {
  // Deterministic color based on name hash for consistency
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ============================================================================
// Storage Functions
// ============================================================================

async function loadContacts(): Promise<LocalContact[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const parsed: ContactsData = JSON.parse(data);
    if (parsed.version !== CURRENT_VERSION) {
      // Handle migration if needed
      return migrateContacts(parsed);
    }
    return parsed.contacts;
  } catch (error) {
    console.error("[ContactsStorage] Failed to load contacts:", error);
    return [];
  }
}

async function saveContacts(contacts: LocalContact[]): Promise<void> {
  try {
    const data: ContactsData = {
      version: CURRENT_VERSION,
      contacts,
      lastUpdated: Date.now(),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("[ContactsStorage] Failed to save contacts:", error);
    throw error;
  }
}

function migrateContacts(oldData: ContactsData): LocalContact[] {
  // Future migrations can be handled here
  return oldData.contacts.map((c) => ({
    ...c,
    isFavorite: c.isFavorite ?? false,
    importedFromPhone: c.importedFromPhone ?? false,
  }));
}

// ============================================================================
// Contact Operations
// ============================================================================

export const ContactsStorage = {
  /**
   * Get all contacts
   */
  async getAll(): Promise<LocalContact[]> {
    const contacts = await loadContacts();
    return contacts.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Get a contact by ID
   */
  async getById(id: string): Promise<LocalContact | null> {
    const contacts = await loadContacts();
    return contacts.find((c) => c.id === id) || null;
  },

  /**
   * Get contact by resolved address
   */
  async getByAddress(address: string): Promise<LocalContact | null> {
    const contacts = await loadContacts();
    return contacts.find((c) => c.resolvedAddress === address) || null;
  },

  /**
   * Search contacts by name or identifier
   */
  async search(query: string): Promise<LocalContact[]> {
    const contacts = await loadContacts();
    const searchLower = query.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.identifier.toLowerCase().includes(searchLower) ||
        c.resolvedAddress.toLowerCase().includes(searchLower)
    );
  },

  /**
   * Get recent contacts (by lastUsedAt)
   */
  async getRecent(limit: number = 5): Promise<LocalContact[]> {
    const contacts = await loadContacts();
    return contacts
      .filter((c) => c.lastUsedAt !== undefined)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, limit);
  },

  /**
   * Get frequent contacts (by transfer count)
   */
  async getFrequent(limit: number = 5): Promise<LocalContact[]> {
    const contacts = await loadContacts();
    return contacts
      .filter((c) => c.transferCount > 0)
      .sort((a, b) => b.transferCount - a.transferCount)
      .slice(0, limit);
  },

  /**
   * Get favorite contacts
   */
  async getFavorites(): Promise<LocalContact[]> {
    const contacts = await loadContacts();
    return contacts
      .filter((c) => c.isFavorite)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Create a new contact
   */
  async create(input: {
    name: string;
    identifier: string;
    identifierType: "address" | "sol_name" | "phone" | "email";
    resolvedAddress: string;
    verified?: boolean;
    linkedUserId?: string;
    phoneNumber?: string;
    email?: string;
    importedFromPhone?: boolean;
    phoneContactId?: string;
  }): Promise<LocalContact> {
    const contacts = await loadContacts();

    // Check if contact already exists for this address
    const existing = contacts.find(
      (c) => c.resolvedAddress === input.resolvedAddress
    );
    if (existing) {
      // Update existing contact
      const updated: LocalContact = {
        ...existing,
        name: input.name,
        identifier: input.identifier,
        identifierType: input.identifierType,
        avatarInitials: getInitials(input.name),
        updatedAt: Date.now(),
      };
      const updatedContacts = contacts.map((c) =>
        c.id === existing.id ? updated : c
      );
      await saveContacts(updatedContacts);
      return updated;
    }

    // Create new contact
    const newContact: LocalContact = {
      id: generateId(),
      name: input.name,
      identifier: input.identifier,
      identifierType: input.identifierType,
      resolvedAddress: input.resolvedAddress,
      linkedUserId: input.linkedUserId,
      phoneNumber: input.phoneNumber,
      email: input.email,
      avatarInitials: getInitials(input.name),
      avatarColor: generateAvatarColor(input.name),
      verified: input.verified ?? false,
      isFavorite: false,
      transferCount: 0,
      totalAmountSent: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      importedFromPhone: input.importedFromPhone,
      phoneContactId: input.phoneContactId,
    };

    await saveContacts([...contacts, newContact]);
    return newContact;
  },

  /**
   * Get or create a contact (idempotent)
   */
  async getOrCreate(input: {
    name: string;
    identifier: string;
    identifierType: "address" | "sol_name" | "phone" | "email";
    resolvedAddress: string;
    linkedUserId?: string;
  }): Promise<LocalContact> {
    const existing = await this.getByAddress(input.resolvedAddress);
    if (existing) {
      return existing;
    }
    return this.create(input);
  },

  /**
   * Update a contact
   */
  async update(
    id: string,
    updates: Partial<Omit<LocalContact, "id" | "createdAt">>
  ): Promise<LocalContact | null> {
    const contacts = await loadContacts();
    const index = contacts.findIndex((c) => c.id === id);
    if (index === -1) return null;

    const updated: LocalContact = {
      ...contacts[index],
      ...updates,
      updatedAt: Date.now(),
    };

    // Regenerate initials if name changed
    if (updates.name) {
      updated.avatarInitials = getInitials(updates.name);
    }

    contacts[index] = updated;
    await saveContacts(contacts);
    return updated;
  },

  /**
   * Delete a contact
   */
  async delete(id: string): Promise<boolean> {
    const contacts = await loadContacts();
    const filtered = contacts.filter((c) => c.id !== id);
    if (filtered.length === contacts.length) return false;
    await saveContacts(filtered);
    return true;
  },

  /**
   * Delete multiple contacts
   */
  async deleteMultiple(ids: string[]): Promise<number> {
    const contacts = await loadContacts();
    const idSet = new Set(ids);
    const filtered = contacts.filter((c) => !idSet.has(c.id));
    const deletedCount = contacts.length - filtered.length;
    if (deletedCount > 0) {
      await saveContacts(filtered);
    }
    return deletedCount;
  },

  /**
   * Toggle favorite status
   */
  async toggleFavorite(id: string): Promise<boolean> {
    const contacts = await loadContacts();
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return false;

    contact.isFavorite = !contact.isFavorite;
    contact.updatedAt = Date.now();
    await saveContacts(contacts);
    return contact.isFavorite;
  },

  /**
   * Mark contact as used (after a transfer)
   */
  async markUsed(id: string, amountUsd: number = 0): Promise<void> {
    const contacts = await loadContacts();
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return;

    contact.lastUsedAt = Date.now();
    contact.transferCount += 1;
    contact.totalAmountSent += amountUsd;
    contact.updatedAt = Date.now();
    await saveContacts(contacts);
  },

  /**
   * Import contacts from phone (batch operation)
   */
  async importFromPhone(
    phoneContacts: PhoneContact[],
    resolveAddress: (
      identifier: string,
      type: "phone" | "email"
    ) => Promise<string | null>
  ): Promise<{ imported: number; skipped: number; failed: number }> {
    const existingContacts = await loadContacts();
    const existingAddresses = new Set(
      existingContacts.map((c) => c.resolvedAddress)
    );
    const existingPhoneIds = new Set(
      existingContacts
        .filter((c) => c.phoneContactId)
        .map((c) => c.phoneContactId)
    );

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const newContacts: LocalContact[] = [];

    for (const phoneContact of phoneContacts) {
      // Skip if already imported
      if (existingPhoneIds.has(phoneContact.id)) {
        skipped++;
        continue;
      }

      // Try to resolve phone number first, then email
      let resolvedAddress: string | null = null;
      let identifier: string = "";
      let identifierType: "phone" | "email" = "phone";

      // Try phone numbers
      if (phoneContact.phoneNumbers?.length) {
        for (const phone of phoneContact.phoneNumbers) {
          resolvedAddress = await resolveAddress(phone.number, "phone");
          if (resolvedAddress) {
            identifier = phone.number;
            identifierType = "phone";
            break;
          }
        }
      }

      // Try emails if no phone resolved
      if (!resolvedAddress && phoneContact.emails?.length) {
        for (const email of phoneContact.emails) {
          resolvedAddress = await resolveAddress(email.email, "email");
          if (resolvedAddress) {
            identifier = email.email;
            identifierType = "email";
            break;
          }
        }
      }

      if (!resolvedAddress) {
        failed++;
        continue;
      }

      // Skip if address already exists
      if (existingAddresses.has(resolvedAddress)) {
        skipped++;
        continue;
      }

      const newContact: LocalContact = {
        id: generateId(),
        name: phoneContact.name,
        identifier,
        identifierType,
        resolvedAddress,
        phoneNumber:
          identifierType === "phone"
            ? identifier
            : phoneContact.phoneNumbers?.[0]?.number,
        email:
          identifierType === "email"
            ? identifier
            : phoneContact.emails?.[0]?.email,
        avatarInitials: getInitials(phoneContact.name),
        avatarColor: generateAvatarColor(phoneContact.name),
        verified: true, // Verified since they have a DisCard account
        isFavorite: false,
        transferCount: 0,
        totalAmountSent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        importedFromPhone: true,
        phoneContactId: phoneContact.id,
      };

      newContacts.push(newContact);
      existingAddresses.add(resolvedAddress);
      imported++;
    }

    if (newContacts.length > 0) {
      await saveContacts([...existingContacts, ...newContacts]);
    }

    return { imported, skipped, failed };
  },

  /**
   * Clear all contacts (for testing/reset)
   */
  async clearAll(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },

  /**
   * Export contacts for backup
   */
  async exportAll(): Promise<LocalContact[]> {
    return loadContacts();
  },

  /**
   * Import contacts from backup
   */
  async importBackup(
    contacts: LocalContact[],
    merge: boolean = true
  ): Promise<number> {
    if (merge) {
      const existing = await loadContacts();
      const existingAddresses = new Set(existing.map((c) => c.resolvedAddress));
      const newContacts = contacts.filter(
        (c) => !existingAddresses.has(c.resolvedAddress)
      );
      await saveContacts([...existing, ...newContacts]);
      return newContacts.length;
    } else {
      await saveContacts(contacts);
      return contacts.length;
    }
  },
};

export default ContactsStorage;
