/**
 * DisCard 2035 - useOneTimePayment Hook
 *
 * React hook for creating and managing privacy-preserving
 * one-time disposable payment links.
 *
 * Features:
 * - Single-claim enforcement
 * - Stealth address generation at claim time
 * - No persistent recipient identity on-chain
 * - Short-lived links (15 min expiry)
 */

import { useState, useCallback, useMemo } from "react";
import { Share, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentCredentialId } from "@/stores/authConvex";

import {
  getOneTimePaymentService,
  type OneTimePaymentParams,
  type OneTimeLinkData,
  type OneTimeLinkResult,
  type ClaimResult,
} from "@/services/oneTimePaymentClient";

// ============================================================================
// Types
// ============================================================================

export interface OneTimePaymentState {
  phase:
    | "idle"
    | "creating"
    | "created"
    | "claiming"
    | "claimed"
    | "delivering"
    | "completed"
    | "failed";
  currentLink?: OneTimeLinkResult;
  claimResult?: ClaimResult;
  error?: string;
}

export interface CreateOneTimeLinkParams {
  amount: number;
  token: string;
  tokenMint: string;
  tokenDecimals: number;
  amountUsd: number;
  memo?: string;
}

export interface UseOneTimePaymentReturn {
  // State
  state: OneTimePaymentState;
  isLoading: boolean;
  myLinks: OneTimeLinkData[];
  isLoadingLinks: boolean;

  // Actions
  createOneTimeLink: (params: CreateOneTimeLinkParams) => Promise<OneTimeLinkResult | null>;
  claimLink: (linkId: string) => Promise<ClaimResult | null>;
  copyToClipboard: (text: string) => Promise<void>;
  shareLink: (link: string, amount: string, token: string) => Promise<void>;
  cancelLink: (linkId: string) => Promise<void>;

  // Utilities
  reset: () => void;
  formatTimeRemaining: (expiresAt: number) => string;
  isAvailable: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useOneTimePayment(): UseOneTimePaymentReturn {
  const [state, setState] = useState<OneTimePaymentState>({ phase: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const [myLinks, setMyLinks] = useState<OneTimeLinkData[]>([]);

  const credentialId = useCurrentCredentialId();
  const oneTimeService = getOneTimePaymentService();

  // Convex mutations
  const createMutation = useMutation(api.transfers.oneTimePayments.create);
  const claimMutation = useMutation(api.transfers.oneTimePayments.claim);
  const cancelMutation = useMutation(api.transfers.oneTimePayments.cancel);
  const myLinksQuery = useQuery(api.transfers.oneTimePayments.getByCreator, {
    limit: 20,
    credentialId: credentialId || undefined,
  });

  // ==========================================================================
  // Create One-Time Link
  // ==========================================================================

  const createOneTimeLink = useCallback(
    async (params: CreateOneTimeLinkParams): Promise<OneTimeLinkResult | null> => {
      setIsLoading(true);
      setState({ phase: "creating" });

      try {
        // Create link via service (generates stealth address components)
        const linkResult = await oneTimeService.createOneTimeLink({
          ...params,
        });

        // Store in Convex for tracking
        await createMutation({
          linkId: linkResult.linkId,
          amount: params.amount,
          token: params.token,
          tokenMint: params.tokenMint,
          tokenDecimals: params.tokenDecimals,
          amountUsd: params.amountUsd,
          encryptedSeed: linkResult.linkData.encryptedSeed,
          viewingKey: linkResult.linkData.viewingKey,
          encryptedMemo: linkResult.linkData.encryptedMemo,
          expiresAt: linkResult.linkData.expiresAt,
          credentialId: credentialId || undefined,
        });

        setState({
          phase: "created",
          currentLink: linkResult,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsLoading(false);
        return linkResult;
      } catch (error) {
        console.error("[useOneTimePayment] Create failed:", error);
        setState({
          phase: "failed",
          error: error instanceof Error ? error.message : "Failed to create link",
        });
        setIsLoading(false);
        return null;
      }
    },
    [oneTimeService, createMutation, credentialId]
  );

  // ==========================================================================
  // Claim Link
  // ==========================================================================

  const claimLink = useCallback(
    async (linkId: string): Promise<ClaimResult | null> => {
      setIsLoading(true);
      setState({ phase: "claiming" });

      try {
        // Get link data from Convex
        const linkData = await claimMutation({
          linkId,
        });

        if (!linkData) {
          setState({
            phase: "failed",
            error: "Link not found",
          });
          setIsLoading(false);
          return null;
        }

        // Claim via service (generates stealth address)
        const claimResult = await oneTimeService.claimLink(linkData as OneTimeLinkData);

        if (!claimResult.success) {
          setState({
            phase: "failed",
            error: claimResult.error,
          });
          setIsLoading(false);
          return null;
        }

        setState({
          phase: "claimed",
          claimResult,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsLoading(false);
        return claimResult;
      } catch (error) {
        console.error("[useOneTimePayment] Claim failed:", error);
        setState({
          phase: "failed",
          error: error instanceof Error ? error.message : "Failed to claim link",
        });
        setIsLoading(false);
        return null;
      }
    },
    [oneTimeService, claimMutation]
  );

  // ==========================================================================
  // Cancel Link
  // ==========================================================================

  const cancelLink = useCallback(
    async (linkId: string): Promise<void> => {
      try {
        await cancelMutation({
          linkId,
          credentialId: credentialId || undefined,
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error("[useOneTimePayment] Cancel failed:", error);
        throw error;
      }
    },
    [cancelMutation, credentialId]
  );

  // ==========================================================================
  // Clipboard & Share
  // ==========================================================================

  const copyToClipboard = useCallback(async (text: string): Promise<void> => {
    try {
      await Clipboard.setStringAsync(text);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("[useOneTimePayment] Copy failed:", error);
    }
  }, []);

  const shareLink = useCallback(
    async (link: string, amount: string, token: string): Promise<void> => {
      try {
        const message = `Claim ${amount} ${token} privately via DisCard (one-time link, expires in 15 min): ${link}`;

        await Share.share({
          message,
          url: link,
        });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error("[useOneTimePayment] Share failed:", error);
      }
    },
    []
  );

  // ==========================================================================
  // Utilities
  // ==========================================================================

  const reset = useCallback(() => {
    setState({ phase: "idle" });
    setIsLoading(false);
  }, []);

  const formatTimeRemaining = useCallback(
    (expiresAt: number): string => {
      return oneTimeService.getTimeRemaining(expiresAt);
    },
    [oneTimeService]
  );

  // Update myLinks from query
  const computedMyLinks = useMemo(() => {
    if (!myLinksQuery) return [];
    return myLinksQuery as unknown as OneTimeLinkData[];
  }, [myLinksQuery]);

  return {
    // State
    state,
    isLoading,
    myLinks: computedMyLinks,
    isLoadingLinks: myLinksQuery === undefined,

    // Actions
    createOneTimeLink,
    claimLink,
    copyToClipboard,
    shareLink,
    cancelLink,

    // Utilities
    reset,
    formatTimeRemaining,
    isAvailable: oneTimeService.isAvailable(),
  };
}

export default useOneTimePayment;
