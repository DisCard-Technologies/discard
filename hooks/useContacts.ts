/**
 * DisCard 2035 - useContacts Hook
 *
 * React hook for managing contacts with:
 * - Local AsyncStorage as PRIMARY storage (persists on device)
 * - Real-time state management
 * - Search and filtering
 * - Phone contacts import support
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { ContactsStorage, LocalContact, PhoneContact } from "@/lib/contacts-storage";

// ============================================================================
// Types
// ============================================================================

export type Contact = LocalContact;

export interface ContactInput {
  name: string;
  identifier: string;
  identifierType: "address" | "sol_name" | "phone" | "email";
  resolvedAddress: string;
  verified?: boolean;
  linkedUserId?: string;
  phoneNumber?: string;
  email?: string;
}

export interface UseContactsReturn {
  // Data
  contacts: Contact[];
  recentContacts: Contact[];
  frequentContacts: Contact[];
  favoriteContacts: Contact[];
  isLoading: boolean;
  error: string | null;

  // Actions
  createContact: (input: ContactInput) => Promise<Contact>;
  updateContact: (contactId: string, updates: Partial<ContactInput>) => Promise<void>;
  deleteContact: (contactId: string) => Promise<void>;
  deleteMultipleContacts: (contactIds: string[]) => Promise<number>;
  getOrCreateContact: (input: ContactInput) => Promise<Contact>;
  toggleFavorite: (contactId: string) => Promise<boolean>;
  markUsed: (contactId: string, amountUsd?: number) => Promise<void>;

  // Search
  searchContacts: (query: string) => Contact[];
  getContactByAddress: (address: string) => Contact | null;
  getContactById: (id: string) => Contact | null;

  // Import
  importFromPhone: (
    phoneContacts: PhoneContact[],
    resolveAddress: (identifier: string, type: "phone" | "email") => Promise<string | null>
  ) => Promise<{ imported: number; skipped: number; failed: number }>;

  // Cache
  refreshContacts: () => Promise<void>;
  clearAllContacts: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useContacts(): UseContactsReturn {
  // Local state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const recentContacts = useMemo(() => {
    return [...contacts]
      .filter((c) => c.lastUsedAt !== undefined)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, 5);
  }, [contacts]);

  const frequentContacts = useMemo(() => {
    return [...contacts]
      .filter((c) => c.transferCount > 0)
      .sort((a, b) => b.transferCount - a.transferCount)
      .slice(0, 5);
  }, [contacts]);

  const favoriteContacts = useMemo(() => {
    return [...contacts]
      .filter((c) => c.isFavorite === true)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

  // Load contacts on mount
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await ContactsStorage.getAll();
      setContacts(loaded);
    } catch (err) {
      console.error("[useContacts] Failed to load contacts:", err);
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create contact
  const createContact = useCallback(
    async (input: ContactInput): Promise<Contact> => {
      setError(null);
      try {
        const contact = await ContactsStorage.create({
          name: input.name,
          identifier: input.identifier,
          identifierType: input.identifierType,
          resolvedAddress: input.resolvedAddress,
          verified: input.verified,
          linkedUserId: input.linkedUserId,
          phoneNumber: input.phoneNumber,
          email: input.email,
        });

        // Update local state
        setContacts((prev) => {
          // Check if it was an update (address already existed)
          const existingIndex = prev.findIndex(
            (c) => c.resolvedAddress === input.resolvedAddress
          );
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = contact;
            return updated;
          }
          return [...prev, contact].sort((a, b) => a.name.localeCompare(b.name));
        });

        return contact;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create contact";
        setError(message);
        throw new Error(message);
      }
    },
    []
  );

  // Update contact
  const updateContact = useCallback(
    async (contactId: string, updates: Partial<ContactInput>): Promise<void> => {
      setError(null);
      try {
        const updated = await ContactsStorage.update(contactId, updates);
        if (!updated) {
          throw new Error("Contact not found");
        }

        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? updated : c))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update contact";
        setError(message);
        throw new Error(message);
      }
    },
    []
  );

  // Delete contact
  const deleteContact = useCallback(
    async (contactId: string): Promise<void> => {
      setError(null);

      // Optimistic update
      const previousContacts = contacts;
      setContacts((prev) => prev.filter((c) => c.id !== contactId));

      try {
        const deleted = await ContactsStorage.delete(contactId);
        if (!deleted) {
          // Revert if not found
          setContacts(previousContacts);
          throw new Error("Contact not found");
        }
      } catch (err) {
        // Revert on error
        setContacts(previousContacts);
        const message = err instanceof Error ? err.message : "Failed to delete contact";
        setError(message);
        throw new Error(message);
      }
    },
    [contacts]
  );

  // Delete multiple contacts
  const deleteMultipleContacts = useCallback(
    async (contactIds: string[]): Promise<number> => {
      setError(null);

      // Optimistic update
      const previousContacts = contacts;
      const idSet = new Set(contactIds);
      setContacts((prev) => prev.filter((c) => !idSet.has(c.id)));

      try {
        const deletedCount = await ContactsStorage.deleteMultiple(contactIds);
        return deletedCount;
      } catch (err) {
        // Revert on error
        setContacts(previousContacts);
        const message = err instanceof Error ? err.message : "Failed to delete contacts";
        setError(message);
        throw new Error(message);
      }
    },
    [contacts]
  );

  // Get or create contact
  const getOrCreateContact = useCallback(
    async (input: ContactInput): Promise<Contact> => {
      setError(null);
      try {
        const contact = await ContactsStorage.getOrCreate({
          name: input.name,
          identifier: input.identifier,
          identifierType: input.identifierType,
          resolvedAddress: input.resolvedAddress,
          linkedUserId: input.linkedUserId,
        });

        // Update local state if new
        setContacts((prev) => {
          const exists = prev.some((c) => c.id === contact.id);
          if (!exists) {
            return [...prev, contact].sort((a, b) => a.name.localeCompare(b.name));
          }
          return prev;
        });

        return contact;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to get or create contact";
        setError(message);
        throw new Error(message);
      }
    },
    []
  );

  // Search contacts
  const searchContacts = useCallback(
    (query: string): Contact[] => {
      if (!query.trim()) {
        return contacts;
      }

      const searchLower = query.toLowerCase();
      return contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.identifier.toLowerCase().includes(searchLower) ||
          c.resolvedAddress.toLowerCase().includes(searchLower)
      );
    },
    [contacts]
  );

  // Get contact by address
  const getContactByAddress = useCallback(
    (address: string): Contact | null => {
      return contacts.find((c) => c.resolvedAddress === address) || null;
    },
    [contacts]
  );

  // Get contact by ID
  const getContactById = useCallback(
    (id: string): Contact | null => {
      return contacts.find((c) => c.id === id) || null;
    },
    [contacts]
  );

  // Toggle favorite status
  const toggleFavorite = useCallback(
    async (contactId: string): Promise<boolean> => {
      setError(null);

      // Optimistic update
      let newFavoriteStatus = false;
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id === contactId) {
            newFavoriteStatus = !c.isFavorite;
            return { ...c, isFavorite: newFavoriteStatus };
          }
          return c;
        })
      );

      try {
        const result = await ContactsStorage.toggleFavorite(contactId);
        return result;
      } catch (err) {
        // Revert on error
        setContacts((prev) =>
          prev.map((c) => {
            if (c.id === contactId) {
              return { ...c, isFavorite: !newFavoriteStatus };
            }
            return c;
          })
        );
        const message = err instanceof Error ? err.message : "Failed to toggle favorite";
        setError(message);
        throw new Error(message);
      }
    },
    []
  );

  // Mark contact as used
  const markUsed = useCallback(
    async (contactId: string, amountUsd: number = 0): Promise<void> => {
      // Optimistic update
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id === contactId) {
            return {
              ...c,
              lastUsedAt: Date.now(),
              transferCount: c.transferCount + 1,
              totalAmountSent: c.totalAmountSent + amountUsd,
            };
          }
          return c;
        })
      );

      try {
        await ContactsStorage.markUsed(contactId, amountUsd);
      } catch (err) {
        console.error("[useContacts] Failed to mark contact as used:", err);
        // Don't revert for this operation - it's not critical
      }
    },
    []
  );

  // Import from phone
  const importFromPhone = useCallback(
    async (
      phoneContacts: PhoneContact[],
      resolveAddress: (identifier: string, type: "phone" | "email") => Promise<string | null>
    ): Promise<{ imported: number; skipped: number; failed: number }> => {
      setError(null);
      try {
        const result = await ContactsStorage.importFromPhone(phoneContacts, resolveAddress);

        // Reload contacts after import
        const loaded = await ContactsStorage.getAll();
        setContacts(loaded);

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to import contacts";
        setError(message);
        throw new Error(message);
      }
    },
    []
  );

  // Refresh contacts from storage
  const refreshContacts = useCallback(async () => {
    await loadContacts();
  }, [loadContacts]);

  // Clear all contacts
  const clearAllContacts = useCallback(async () => {
    setError(null);
    try {
      await ContactsStorage.clearAll();
      setContacts([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear contacts";
      setError(message);
      throw new Error(message);
    }
  }, []);

  return {
    // Data
    contacts,
    recentContacts,
    frequentContacts,
    favoriteContacts,
    isLoading,
    error,

    // Actions
    createContact,
    updateContact,
    deleteContact,
    deleteMultipleContacts,
    getOrCreateContact,
    toggleFavorite,
    markUsed,

    // Search
    searchContacts,
    getContactByAddress,
    getContactById,

    // Import
    importFromPhone,

    // Cache
    refreshContacts,
    clearAllContacts,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook to get a single contact by ID
 */
export function useContact(contactId: string | null): {
  contact: Contact | null;
  isLoading: boolean;
} {
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!contactId) {
      setContact(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    ContactsStorage.getById(contactId)
      .then(setContact)
      .finally(() => setIsLoading(false));
  }, [contactId]);

  return { contact, isLoading };
}

/**
 * Hook to check if an address is a known contact
 */
export function useIsContact(address: string | null): {
  isContact: boolean;
  contact: Contact | null;
  isLoading: boolean;
} {
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setContact(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    ContactsStorage.getByAddress(address)
      .then(setContact)
      .finally(() => setIsLoading(false));
  }, [address]);

  return {
    isContact: contact !== null,
    contact,
    isLoading,
  };
}

// ============================================================================
// Re-export types
// ============================================================================

export type { PhoneContact } from "@/lib/contacts-storage";

// ============================================================================
// Export Default
// ============================================================================

export default useContacts;
