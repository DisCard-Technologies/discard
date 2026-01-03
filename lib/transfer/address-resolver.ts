/**
 * DisCard 2035 - Address Resolver
 *
 * Universal address resolution for P2P transfers supporting:
 * - Raw Solana addresses (base58)
 * - SNS .sol domain names (via Bonfida)
 *
 * Features:
 * - Auto-detection of address type
 * - Caching of resolved addresses
 * - Validation of Solana addresses
 */

import { Connection, PublicKey } from "@solana/web3.js";

// SNS resolution is currently disabled in React Native due to bundler compatibility issues
// with @bonfida/spl-name-service. TODO: Implement SNS resolution via API endpoint.
const SNS_ENABLED = false;

// ============================================================================
// Types
// ============================================================================

export type AddressType = "address" | "sol_name" | "unknown";

export interface ResolvedAddress {
  /** Original input string */
  input: string;
  /** Detected input type */
  type: AddressType;
  /** Resolved Solana address (base58) */
  address: string;
  /** Display name if available */
  displayName?: string;
  /** Whether resolution was successful */
  isValid: boolean;
  /** Error message if resolution failed */
  error?: string;
}

export interface AddressValidation {
  isValid: boolean;
  type: AddressType;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Regex for valid base58 Solana addresses (32-44 chars) */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Regex for .sol domain names */
const SOL_DOMAIN_REGEX = /^[a-zA-Z0-9-]+\.sol$/i;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** RPC endpoint for SNS resolution */
const SOLANA_RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

// ============================================================================
// Address Resolution Cache
// ============================================================================

interface CacheEntry {
  result: ResolvedAddress;
  timestamp: number;
}

const resolutionCache = new Map<string, CacheEntry>();

function getCachedResult(input: string): ResolvedAddress | null {
  const entry = resolutionCache.get(input.toLowerCase());
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    resolutionCache.delete(input.toLowerCase());
    return null;
  }

  return entry.result;
}

function setCachedResult(input: string, result: ResolvedAddress): void {
  resolutionCache.set(input.toLowerCase(), {
    result,
    timestamp: Date.now(),
  });
}

// ============================================================================
// Address Detection
// ============================================================================

/**
 * Detect the type of address input
 */
export function detectAddressType(input: string): AddressType {
  const trimmed = input.trim();

  // Check for .sol domain
  if (SOL_DOMAIN_REGEX.test(trimmed)) {
    return "sol_name";
  }

  // Check for valid Solana address
  if (SOLANA_ADDRESS_REGEX.test(trimmed)) {
    try {
      // Validate it's actually a valid public key
      new PublicKey(trimmed);
      return "address";
    } catch {
      return "unknown";
    }
  }

  return "unknown";
}

/**
 * Validate if a string is a valid Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!SOLANA_ADDRESS_REGEX.test(address)) {
    return false;
  }

  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate address input without resolving
 */
export function validateAddressInput(input: string): AddressValidation {
  const type = detectAddressType(input);

  if (type === "unknown") {
    return {
      isValid: false,
      type: "unknown",
      error: "Invalid address format. Enter a Solana address or .sol domain.",
    };
  }

  if (type === "address") {
    if (!isValidSolanaAddress(input)) {
      return {
        isValid: false,
        type: "address",
        error: "Invalid Solana address.",
      };
    }
  }

  return {
    isValid: true,
    type,
  };
}

// ============================================================================
// SNS Domain Resolution
// ============================================================================

/**
 * Resolve a .sol domain name to a Solana address
 */
async function resolveSolDomain(
  domain: string,
  connection?: Connection
): Promise<{ address: string; displayName: string } | null> {
  // SNS resolution currently disabled in React Native
  if (!SNS_ENABLED) {
    console.warn("[AddressResolver] SNS resolution disabled, .sol domains not supported");
    return null;
  }

  // TODO: Implement SNS resolution via API when available
  // For now, return null to indicate resolution not available
  return null;
}

/**
 * Reverse lookup: get .sol domain from address
 */
export async function reverseLookupAddress(
  address: string,
  connection?: Connection
): Promise<string | null> {
  // SNS resolution currently disabled in React Native
  if (!SNS_ENABLED) {
    return null;
  }

  // TODO: Implement reverse lookup via API when available
  return null;
}

/**
 * Get all domains owned by an address
 */
export async function getDomainsForAddress(
  address: string,
  connection?: Connection
): Promise<string[]> {
  // SNS resolution currently disabled in React Native
  if (!SNS_ENABLED) {
    return [];
  }

  // TODO: Implement domain lookup via API when available
  return [];
}

// ============================================================================
// Main Resolution Function
// ============================================================================

/**
 * Resolve any address input (raw address or .sol domain) to a Solana address
 *
 * @param input - The address or domain to resolve
 * @param connection - Optional Solana connection (uses default if not provided)
 * @returns Resolved address information
 */
export async function resolveAddress(
  input: string,
  connection?: Connection
): Promise<ResolvedAddress> {
  const trimmedInput = input.trim();

  // Check cache first
  const cached = getCachedResult(trimmedInput);
  if (cached) {
    return cached;
  }

  // Detect type
  const type = detectAddressType(trimmedInput);

  // Handle raw address
  if (type === "address") {
    const result: ResolvedAddress = {
      input: trimmedInput,
      type: "address",
      address: trimmedInput,
      isValid: true,
    };
    setCachedResult(trimmedInput, result);
    return result;
  }

  // Handle .sol domain
  if (type === "sol_name") {
    const resolved = await resolveSolDomain(trimmedInput, connection);

    if (resolved) {
      const result: ResolvedAddress = {
        input: trimmedInput,
        type: "sol_name",
        address: resolved.address,
        displayName: resolved.displayName,
        isValid: true,
      };
      setCachedResult(trimmedInput, result);
      return result;
    }

    const result: ResolvedAddress = {
      input: trimmedInput,
      type: "sol_name",
      address: "",
      isValid: false,
      error: `Could not resolve "${trimmedInput}". Domain may not exist.`,
    };
    setCachedResult(trimmedInput, result);
    return result;
  }

  // Unknown type
  const result: ResolvedAddress = {
    input: trimmedInput,
    type: "unknown",
    address: "",
    isValid: false,
    error: "Invalid address format. Enter a Solana address or .sol domain.",
  };
  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format an address for display (truncated)
 */
export function formatAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get display text for a resolved address
 */
export function getDisplayText(resolved: ResolvedAddress): string {
  if (resolved.displayName) {
    return resolved.displayName;
  }
  return formatAddress(resolved.address);
}

/**
 * Clear the resolution cache
 */
export function clearResolutionCache(): void {
  resolutionCache.clear();
}

/**
 * Get cache size (for debugging)
 */
export function getCacheSize(): number {
  return resolutionCache.size;
}
