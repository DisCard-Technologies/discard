/**
 * DisCard 2035 - MWA Provider
 *
 * Context provider for Mobile Wallet Adapter functionality.
 * Only renders children with MWA context on Android devices.
 * On non-Android platforms, provides a no-op context.
 */

import React, { createContext, useContext, ReactNode, useMemo } from "react";
import { Platform } from "react-native";
import { Id } from "@/convex/_generated/dataModel";
import { useMWAWallet, type UseMWAWalletReturn } from "@/hooks/useMWAWallet";
import { isMWASupported, getDeviceInfo, type MWADeviceInfo } from "@/lib/mwa/mwa-client";

// ============================================================================
// Types
// ============================================================================

export interface MWAContextValue extends UseMWAWalletReturn {
  /** Whether MWA is supported on this platform */
  isSupported: boolean;
  /** Whether this is a Seeker device with Seed Vault */
  isSeekerDevice: boolean;
}

// ============================================================================
// Context
// ============================================================================

const defaultDeviceInfo: MWADeviceInfo = {
  isAndroid: false,
  isSeeker: false,
  isSaga: false,
  isMWASupported: false,
  deviceModel: "unknown",
};

// Default context for non-Android platforms
const defaultContext: MWAContextValue = {
  isSupported: false,
  isSeekerDevice: false,
  isAvailable: false,
  isConnected: false,
  isConnecting: false,
  walletAddress: null,
  walletName: null,
  walletId: null,
  error: null,
  deviceInfo: defaultDeviceInfo,
  connect: async () => false,
  disconnect: async () => {},
  signTransaction: async () => {
    throw new Error("MWA is not supported on this platform");
  },
  signMessage: async () => {
    throw new Error("MWA is not supported on this platform");
  },
  signAllTransactions: async () => {
    throw new Error("MWA is not supported on this platform");
  },
  refreshSession: async () => {},
};

const MWAContext = createContext<MWAContextValue>(defaultContext);

// ============================================================================
// Provider Implementation
// ============================================================================

interface MWAProviderProps {
  children: ReactNode;
  userId: Id<"users"> | null;
}

/**
 * Internal provider that uses the MWA hook
 */
function MWAProviderInternal({
  children,
  userId,
}: MWAProviderProps) {
  const mwaWallet = useMWAWallet(userId);

  const value: MWAContextValue = useMemo(
    () => ({
      ...mwaWallet,
      isSupported: true,
      isSeekerDevice: mwaWallet.deviceInfo.isSeeker,
    }),
    [mwaWallet]
  );

  return <MWAContext.Provider value={value}>{children}</MWAContext.Provider>;
}

/**
 * Fallback provider for non-Android platforms
 */
function MWAProviderFallback({ children }: { children: ReactNode }) {
  return <MWAContext.Provider value={defaultContext}>{children}</MWAContext.Provider>;
}

/**
 * MWA Provider - provides MWA context to the app
 *
 * On Android, this initializes the MWA hook and provides full functionality.
 * On other platforms, it provides a no-op context that indicates MWA is unavailable.
 */
export function MWAProvider({ children, userId }: MWAProviderProps) {
  // Only initialize MWA hook on Android to avoid unnecessary overhead
  if (Platform.OS === "android") {
    return <MWAProviderInternal userId={userId}>{children}</MWAProviderInternal>;
  }

  return <MWAProviderFallback>{children}</MWAProviderFallback>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access MWA context
 */
export function useMWA(): MWAContextValue {
  const context = useContext(MWAContext);
  if (!context) {
    throw new Error("useMWA must be used within an MWAProvider");
  }
  return context;
}

/**
 * Hook to check if Seed Vault is available
 */
export function useSeedVaultAvailability() {
  const { isSupported, isAvailable, isSeekerDevice, deviceInfo } = useMWA();

  return {
    /** MWA is supported (Android) */
    isSupported,
    /** MWA wallet app is available */
    isAvailable,
    /** Running on a Seeker device */
    isSeekerDevice,
    /** Running on a Saga device */
    isSagaDevice: deviceInfo.isSaga,
    /** Should show Seed Vault option in UI */
    shouldShowSeedVault: isSupported && isAvailable,
    /** Device model name */
    deviceModel: deviceInfo.deviceModel,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default MWAProvider;
