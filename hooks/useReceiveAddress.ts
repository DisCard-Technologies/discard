/**
 * useReceiveAddress — Generate and track stealth receive addresses
 *
 * Provides a stealth address for the Receive screen QR code.
 * Tracks deposit detection in real-time via Convex reactive query.
 *
 * Usage:
 * ```tsx
 * const { stealthAddress, status, generate, isGenerating } = useReceiveAddress();
 * // stealthAddress is ready for QR code / copy / share
 * // status updates reactively when deposit arrives
 * ```
 */

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentCredentialId } from "@/stores/authConvex";

// ============================================================================
// Types
// ============================================================================

export interface ReceiveAddressState {
  /** The stealth address for QR / copy / share (null until generated) */
  stealthAddress: string | null;
  /** Current status: active, funded, shielding, shielded, quarantined, expired */
  status: string | null;
  /** When the active window expires */
  expiresAt: number | null;
  /** Whether address generation is in progress */
  isGenerating: boolean;
  /** Error message if generation failed */
  error: string | null;
  /** Generate a new stealth receive address */
  generate: () => Promise<string | null>;
  /** Whether a deposit has been detected */
  isDeposited: boolean;
  /** Whether the address is still valid */
  isActive: boolean;
  /** Whether funds are being processed */
  isProcessing: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useReceiveAddress(): ReceiveAddressState {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAddress, setGeneratedAddress] = useState<string | null>(null);

  const credentialId = useCurrentCredentialId();

  // Convex mutations
  const generateMutation = useMutation(api.external.receiveAddresses.generate);

  // Reactive subscription to the user's active receive address
  const activeAddress = useQuery(
    api.external.receiveAddresses.getActiveForUser,
    credentialId ? { credentialId } : "skip"
  );

  // Use the reactive address if available, otherwise the locally generated one
  const currentAddress = activeAddress?.stealthAddress ?? generatedAddress;
  const currentStatus = activeAddress?.status ?? null;
  const expiresAt = activeAddress?.expiresAt ?? null;

  // Generate a new stealth receive address
  const generate = useCallback(async (): Promise<string | null> => {
    if (!credentialId) {
      setError("Not authenticated");
      return null;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateMutation({
        credentialId,
      });

      setGeneratedAddress(result.stealthAddress);
      return result.stealthAddress;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate address";
      setError(message);
      console.error("[useReceiveAddress] Generation failed:", err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [credentialId, generateMutation]);

  // Auto-generate on mount if no active address exists
  useEffect(() => {
    if (credentialId && activeAddress === null && !generatedAddress && !isGenerating) {
      generate();
    }
  }, [credentialId, activeAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDeposited = currentStatus === "funded" || currentStatus === "shielding" || currentStatus === "shielded";
  const isActive = currentStatus === "active";
  const isProcessing = currentStatus === "funded" || currentStatus === "shielding";

  return {
    stealthAddress: currentAddress,
    status: currentStatus,
    expiresAt,
    isGenerating,
    error,
    generate,
    isDeposited,
    isActive,
    isProcessing,
  };
}

export default useReceiveAddress;
