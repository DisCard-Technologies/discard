/**
 * DisCard 2035 - useContacts Hook
 *
 * React hook for managing contacts with:
 * - Convex backend synchronization
 * - Local AsyncStorage caching
 * - Optimistic updates
 * - Search and filtering
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";

// AsyncStorage is optional - may not be available in Expo Go
let AsyncStorage: typeof import("@react-native-async-storage/async-storage").default | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch {
  console.warn("[useContacts] AsyncStorage not available, caching disabled");
}

// ============================================================================
// Types
// ============================================================================

export type Contact = Doc<"contacts">;

export interface ContactInput {
  name: string;
  identifier: string;
  identifierType: "address" | "sol_name";
  resolvedAddress: string;
  verified?: boolean;
}

export interface UseContactsReturn {
  // Data
  contacts: Contact[];
  recentContacts: Contact[];
  frequentContacts: Contact[];
  isLoading: boolean;
  error: string | null;

  // Actions
  createContact: (input: ContactInput) => Promise<Id<"contacts">>;
  updateContact: (contactId: Id<"contacts">, updates: Partial<ContactInput>) => Promise<void>;
  deleteContact: (contactId: Id<"contacts">) => Promise<void>;
  getOrCreateContact: (input: ContactInput) => Promise<Contact>;

  // Search
  searchContacts: (query: string) => Contact[];
  getContactByAddress: (address: string) => Contact | null;

  // Cache
  refreshCache: () => Promise<void>;
  clearCache: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY = "discard_contacts_cache";
const CACHE_VERSION = 1;

interface CachedData {
  version: number;
  contacts: Contact[];
  timestamp: number;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useContacts(): UseContactsReturn {
  // Local state
  const [cachedContacts, setCachedContacts] = useState<Contact[]>([]);
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convex queries
  const allContacts = useQuery(api.transfers.contacts.getAll);
  const recentContactsQuery = useQuery(api.transfers.contacts.getRecent, { limit: 5 });
  const frequentContactsQuery = useQuery(api.transfers.contacts.getFrequent, { limit: 5 });

  // Convex mutations
  const createContactMutation = useMutation(api.transfers.contacts.create);
  const updateContactMutation = useMutation(api.transfers.contacts.update);
  const deleteContactMutation = useMutation(api.transfers.contacts.remove);
  const getOrCreateMutation = useMutation(api.transfers.contacts.getOrCreate);

  // Combine cached and server contacts (server takes precedence)
  const contacts = useMemo(() => {
    if (allContacts !== undefined) {
      return allContacts;
    }
    return cachedContacts;
  }, [allContacts, cachedContacts]);

  const recentContacts = useMemo(() => {
    if (recentContactsQuery !== undefined) {
      return recentContactsQuery;
    }
    // Fallback to cached contacts sorted by lastUsedAt
    return [...cachedContacts]
      .filter((c) => c.lastUsedAt !== undefined)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, 5);
  }, [recentContactsQuery, cachedContacts]);

  const frequentContacts = useMemo(() => {
    if (frequentContactsQuery !== undefined) {
      return frequentContactsQuery;
    }
    // Fallback to cached contacts sorted by transferCount
    return [...cachedContacts]
      .filter((c) => c.transferCount > 0)
      .sort((a, b) => b.transferCount - a.transferCount)
      .slice(0, 5);
  }, [frequentContactsQuery, cachedContacts]);

  const isLoading = allContacts === undefined && isLoadingCache;

  // Load cache on mount
  useEffect(() => {
    loadCache();
  }, []);

  // Update cache when server data changes
  useEffect(() => {
    if (allContacts !== undefined) {
      saveCache(allContacts);
    }
  }, [allContacts]);

  // Cache functions
  const loadCache = useCallback(async () => {
    if (!AsyncStorage) {
      setIsLoadingCache(false);
      return;
    }

    try {
      setIsLoadingCache(true);
      const cached = await AsyncStorage.getItem(CACHE_KEY);

      if (cached) {
        const data: CachedData = JSON.parse(cached);
        if (data.version === CACHE_VERSION) {
          setCachedContacts(data.contacts);
        }
      }
    } catch (err) {
      console.error("[useContacts] Failed to load cache:", err);
    } finally {
      setIsLoadingCache(false);
    }
  }, []);

  const saveCache = useCallback(async (contactsToCache: Contact[]) => {
    if (!AsyncStorage) return;

    try {
      const data: CachedData = {
        version: CACHE_VERSION,
        contacts: contactsToCache,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("[useContacts] Failed to save cache:", err);
    }
  }, []);

  const refreshCache = useCallback(async () => {
    if (allContacts) {
      await saveCache(allContacts);
      setCachedContacts(allContacts);
    }
  }, [allContacts, saveCache]);

  const clearCache = useCallback(async () => {
    if (!AsyncStorage) {
      setCachedContacts([]);
      return;
    }

    try {
      await AsyncStorage.removeItem(CACHE_KEY);
      setCachedContacts([]);
    } catch (err) {
      console.error("[useContacts] Failed to clear cache:", err);
    }
  }, []);

  // Create contact
  const createContact = useCallback(
    async (input: ContactInput): Promise<Id<"contacts">> => {
      setError(null);

      try {
        const contactId = await createContactMutation({
          name: input.name,
          identifier: input.identifier,
          identifierType: input.identifierType,
          resolvedAddress: input.resolvedAddress,
          verified: input.verified,
        });

        return contactId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create contact";
        setError(message);
        throw new Error(message);
      }
    },
    [createContactMutation]
  );

  // Update contact
  const updateContact = useCallback(
    async (contactId: Id<"contacts">, updates: Partial<ContactInput>): Promise<void> => {
      setError(null);

      try {
        await updateContactMutation({
          contactId,
          ...updates,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update contact";
        setError(message);
        throw new Error(message);
      }
    },
    [updateContactMutation]
  );

  // Delete contact
  const deleteContact = useCallback(
    async (contactId: Id<"contacts">): Promise<void> => {
      setError(null);

      // Optimistic update
      setCachedContacts((prev) => prev.filter((c) => c._id !== contactId));

      try {
        await deleteContactMutation({ contactId });
      } catch (err) {
        // Revert optimistic update
        if (allContacts) {
          setCachedContacts(allContacts);
        }

        const message = err instanceof Error ? err.message : "Failed to delete contact";
        setError(message);
        throw new Error(message);
      }
    },
    [deleteContactMutation, allContacts]
  );

  // Get or create contact
  const getOrCreateContact = useCallback(
    async (input: ContactInput): Promise<Contact> => {
      setError(null);

      try {
        const contact = await getOrCreateMutation({
          name: input.name,
          identifier: input.identifier,
          identifierType: input.identifierType,
          resolvedAddress: input.resolvedAddress,
        });

        if (!contact) {
          throw new Error("Failed to get or create contact");
        }

        return contact;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to get or create contact";
        setError(message);
        throw new Error(message);
      }
    },
    [getOrCreateMutation]
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

  return {
    // Data
    contacts,
    recentContacts,
    frequentContacts,
    isLoading,
    error,

    // Actions
    createContact,
    updateContact,
    deleteContact,
    getOrCreateContact,

    // Search
    searchContacts,
    getContactByAddress,

    // Cache
    refreshCache,
    clearCache,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook to get a single contact by ID
 */
export function useContact(contactId: Id<"contacts"> | null): {
  contact: Contact | null;
  isLoading: boolean;
} {
  const contact = useQuery(
    api.transfers.contacts.get,
    contactId ? { contactId } : "skip"
  );

  return {
    contact: contact ?? null,
    isLoading: contact === undefined && contactId !== null,
  };
}

/**
 * Hook to search contacts with Convex (server-side)
 */
export function useContactSearch(query: string): {
  results: Contact[];
  isLoading: boolean;
} {
  const results = useQuery(api.transfers.contacts.search, {
    query,
    limit: 10,
  });

  return {
    results: results ?? [],
    isLoading: results === undefined,
  };
}

/**
 * Hook to check if an address is a known contact
 */
export function useIsContact(address: string | null): {
  isContact: boolean;
  contact: Contact | null;
  isLoading: boolean;
} {
  const contact = useQuery(
    api.transfers.contacts.getByAddress,
    address ? { address } : "skip"
  );

  return {
    isContact: contact !== null && contact !== undefined,
    contact: contact ?? null,
    isLoading: contact === undefined && address !== null,
  };
}

// ============================================================================
// Export Default
// ============================================================================

export default useContacts;
