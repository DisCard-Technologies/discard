/**
 * DisCard 2035 - useAddressResolver Hook
 *
 * React hook for resolving Solana addresses, .sol domains, phone numbers, and emails.
 * Features:
 * - Debounced input handling (300ms)
 * - Auto-detection of address type (address, sol_name, phone, email)
 * - Loading and error states
 * - Memory caching via the resolver lib
 * - Convex integration for phone/email user discovery
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Connection } from "@solana/web3.js";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  resolveAddress,
  detectAddressType,
  validateAddressInput,
  formatAddress,
  getDisplayText,
  type ResolvedAddress,
  type AddressType,
  type AddressValidation,
} from "@/lib/transfer/address-resolver";

// Re-export types for convenience
export type { ResolvedAddress, AddressType, AddressValidation };

// ============================================================================
// Types
// ============================================================================

export interface AddressResolverState {
  /** Current input value */
  input: string;
  /** Detected address type */
  type: AddressType;
  /** Whether resolution is in progress */
  isResolving: boolean;
  /** Resolved address data (null if not resolved yet) */
  resolved: ResolvedAddress | null;
  /** Whether the input is valid (format-wise, before resolution) */
  isValidFormat: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether resolution was successful */
  isResolved: boolean;
}

export interface UseAddressResolverOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Solana connection for RPC calls */
  connection?: Connection;
  /** Callback when resolution completes */
  onResolved?: (result: ResolvedAddress) => void;
  /** Callback when resolution fails */
  onError?: (error: string) => void;
}

export interface UseAddressResolverReturn extends AddressResolverState {
  /** Update the input value */
  setInput: (value: string) => void;
  /** Clear the input and reset state */
  clear: () => void;
  /** Manually trigger resolution */
  resolve: () => Promise<ResolvedAddress | null>;
  /** Format an address for display */
  formatAddress: (address: string, chars?: number) => string;
  /** Get display text for resolved address */
  getDisplayText: () => string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DEBOUNCE_MS = 300;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAddressResolver(
  options: UseAddressResolverOptions = {}
): UseAddressResolverReturn {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    connection,
    onResolved,
    onError,
  } = options;

  // Convex client for phone/email lookups
  const convex = useConvex();

  // State
  const [input, setInputState] = useState("");
  const [type, setType] = useState<AddressType>("unknown");
  const [isResolving, setIsResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedAddress | null>(null);
  const [isValidFormat, setIsValidFormat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for debouncing and cleanup
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestInputRef = useRef(input);

  // Update ref when input changes
  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Resolution function
  const performResolution = useCallback(
    async (value: string): Promise<ResolvedAddress | null> => {
      if (!value.trim()) {
        setResolved(null);
        setError(null);
        return null;
      }

      // Cancel any pending resolution
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsResolving(true);
      setError(null);

      try {
        const trimmed = value.trim();
        const detectedType = detectAddressType(trimmed);

        // Handle phone number lookup via Convex
        if (detectedType === "phone") {
          const user = await convex.query(api.transfers.lookup.findByPhone, {
            phoneNumber: trimmed,
          });

          // Check if this is still the latest input
          if (value !== latestInputRef.current) {
            return null;
          }

          if (user && user.solanaAddress) {
            const result: ResolvedAddress = {
              input: trimmed,
              type: "phone",
              address: user.solanaAddress,
              displayName: user.displayName || undefined,
              isValid: true,
              userId: user.userId,
            };
            setResolved(result);
            onResolved?.(result);
            return result;
          } else {
            // User not found - can invite via SMS
            const result: ResolvedAddress = {
              input: trimmed,
              type: "phone",
              address: "",
              isValid: false,
              error: "Not a DisCard user",
              canInvite: true,
            };
            setResolved(result);
            setError("Not a DisCard user");
            return result;
          }
        }

        // Handle email lookup via Convex
        if (detectedType === "email") {
          const user = await convex.query(api.transfers.lookup.findByEmail, {
            email: trimmed,
          });

          // Check if this is still the latest input
          if (value !== latestInputRef.current) {
            return null;
          }

          if (user && user.solanaAddress) {
            const result: ResolvedAddress = {
              input: trimmed,
              type: "email",
              address: user.solanaAddress,
              displayName: user.displayName || undefined,
              isValid: true,
              userId: user.userId,
            };
            setResolved(result);
            onResolved?.(result);
            return result;
          } else {
            // User not found - cannot invite via email (deferred feature)
            const result: ResolvedAddress = {
              input: trimmed,
              type: "email",
              address: "",
              isValid: false,
              error: "Not a DisCard user",
              canInvite: false, // Email invitations deferred
            };
            setResolved(result);
            setError("Not a DisCard user");
            return result;
          }
        }

        // Handle address and sol_name via existing resolver
        const result = await resolveAddress(value, connection);

        // Check if this is still the latest input
        if (value !== latestInputRef.current) {
          return null;
        }

        setResolved(result);

        if (result.isValid) {
          onResolved?.(result);
        } else {
          setError(result.error || "Resolution failed");
          onError?.(result.error || "Resolution failed");
        }

        return result;
      } catch (err) {
        // Check if aborted
        if (err instanceof Error && err.name === "AbortError") {
          return null;
        }

        const errorMessage =
          err instanceof Error ? err.message : "Resolution failed";
        setError(errorMessage);
        onError?.(errorMessage);
        return null;
      } finally {
        setIsResolving(false);
      }
    },
    [connection, convex, onResolved, onError]
  );

  // Debounced input handler
  const setInput = useCallback(
    (value: string) => {
      setInputState(value);

      // Clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Immediate validation
      const trimmed = value.trim();
      if (!trimmed) {
        setType("unknown");
        setIsValidFormat(false);
        setResolved(null);
        setError(null);
        setIsResolving(false);
        return;
      }

      // Detect type immediately
      const detectedType = detectAddressType(trimmed);
      setType(detectedType);

      // Validate format
      const validation = validateAddressInput(trimmed);
      setIsValidFormat(validation.isValid);

      if (!validation.isValid) {
        setError(validation.error || null);
        setResolved(null);
        return;
      }

      // Clear error since format is valid
      setError(null);

      // For raw addresses, resolve immediately (no network call needed)
      if (detectedType === "address") {
        setResolved({
          input: trimmed,
          type: "address",
          address: trimmed,
          isValid: true,
        });
        return;
      }

      // For .sol domains, phone, and email - debounce the resolution
      // These all require async lookups (SNS or Convex)
      setIsResolving(true);
      debounceTimerRef.current = setTimeout(() => {
        performResolution(trimmed);
      }, debounceMs);
    },
    [debounceMs, performResolution]
  );

  // Clear function
  const clear = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setInputState("");
    setType("unknown");
    setIsResolving(false);
    setResolved(null);
    setIsValidFormat(false);
    setError(null);
  }, []);

  // Manual resolve function
  const resolve = useCallback(async (): Promise<ResolvedAddress | null> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    return performResolution(input);
  }, [input, performResolution]);

  // Get display text helper
  const getDisplayTextFn = useCallback((): string => {
    if (!resolved) return "";
    return getDisplayText(resolved);
  }, [resolved]);

  // Format address helper
  const formatAddressFn = useCallback(
    (address: string, chars?: number): string => {
      return formatAddress(address, chars);
    },
    []
  );

  return {
    // State
    input,
    type,
    isResolving,
    resolved,
    isValidFormat,
    error,
    isResolved: resolved?.isValid ?? false,

    // Actions
    setInput,
    clear,
    resolve,

    // Helpers
    formatAddress: formatAddressFn,
    getDisplayText: getDisplayTextFn,
  };
}

// ============================================================================
// Additional Hooks
// ============================================================================

/**
 * Hook to get display name for an address (reverse lookup)
 */
export function useAddressDisplayName(
  address: string | null,
  connection?: Connection
): { displayName: string | null; isLoading: boolean } {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setDisplayName(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    // Import dynamically to avoid circular deps
    import("@/lib/transfer/address-resolver").then(({ reverseLookupAddress }) => {
      reverseLookupAddress(address, connection)
        .then((name) => {
          if (!cancelled) {
            setDisplayName(name);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [address, connection]);

  return { displayName, isLoading };
}

export default useAddressResolver;
