/**
 * DisCard 2035 - usePaymentLink Hook
 *
 * React hook for generating and managing payment request links.
 */

import { useState, useCallback } from "react";
import { Share, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useCurrentCredentialId } from "@/stores/authConvex";

import {
  generatePaymentLinks,
  parsePaymentLink,
  type PaymentLinkParams,
  type PaymentLinkResult,
  type ParsedPaymentLink,
} from "@/lib/transfer/payment-link";

// ============================================================================
// Types
// ============================================================================

export interface PaymentRequest {
  id: Id<"paymentRequests">;
  requestId: string;
  amount: number;
  token: string;
  amountUsd: number;
  memo?: string;
  webLink: string;
  solanaPayUri: string;
  qrData: string;
  status: "pending" | "paid" | "expired";
  expiresAt: number;
  createdAt: number;
}

export interface CreatePaymentLinkParams {
  amount: number;
  token: string;
  tokenMint: string;
  tokenDecimals: number;
  amountUsd: number;
  memo?: string;
  recipientName?: string;
}

export interface UsePaymentLinkReturn {
  // State
  isCreating: boolean;
  isCopying: boolean;
  isSharing: boolean;
  error: string | null;
  currentRequest: PaymentRequest | null;

  // Actions
  createPaymentLink: (params: CreatePaymentLinkParams) => Promise<PaymentRequest>;
  copyToClipboard: (text: string) => Promise<void>;
  shareLink: (link: string, message?: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;

  // Queries
  myRequests: Doc<"paymentRequests">[];
  isLoadingRequests: boolean;

  // Parsing
  parseLink: (url: string) => ParsedPaymentLink;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePaymentLink(): UsePaymentLinkReturn {
  // State
  const [isCreating, setIsCreating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRequest, setCurrentRequest] = useState<PaymentRequest | null>(null);

  // Auth - get credentialId for custom auth fallback
  const credentialId = useCurrentCredentialId();

  // Convex
  const createMutation = useMutation(api.transfers.paymentRequests.create);
  const cancelMutation = useMutation(api.transfers.paymentRequests.cancel);
  const myRequestsQuery = useQuery(api.transfers.paymentRequests.getByUser, {
    limit: 10,
    // Pass credentialId for custom auth fallback
    credentialId: credentialId || undefined,
  });

  // Create payment link
  const createPaymentLink = useCallback(
    async (params: CreatePaymentLinkParams): Promise<PaymentRequest> => {
      setIsCreating(true);
      setError(null);

      try {
        const result = await createMutation({
          amount: params.amount,
          token: params.token,
          tokenMint: params.tokenMint,
          tokenDecimals: params.tokenDecimals,
          amountUsd: params.amountUsd,
          memo: params.memo,
          recipientName: params.recipientName,
          // Pass credentialId for custom auth fallback
          credentialId: credentialId || undefined,
        });

        const request: PaymentRequest = {
          id: result.id,
          requestId: result.requestId,
          amount: params.amount,
          token: params.token,
          amountUsd: params.amountUsd,
          memo: params.memo,
          webLink: result.webLink,
          solanaPayUri: result.solanaPayUri,
          qrData: result.qrData,
          status: "pending",
          expiresAt: result.expiresAt,
          createdAt: Date.now(),
        };

        setCurrentRequest(request);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        return request;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create payment link";
        setError(message);
        throw new Error(message);
      } finally {
        setIsCreating(false);
      }
    },
    [createMutation, credentialId]
  );

  // Copy to clipboard
  const copyToClipboard = useCallback(async (text: string): Promise<void> => {
    setIsCopying(true);

    try {
      await Clipboard.setStringAsync(text);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.error("[usePaymentLink] Copy failed:", err);
    } finally {
      setIsCopying(false);
    }
  }, []);

  // Share link
  const shareLink = useCallback(
    async (link: string, message?: string): Promise<void> => {
      setIsSharing(true);

      try {
        const shareMessage = message || `Pay me via DisCard: ${link}`;

        const result = await Share.share({
          message: shareMessage,
          url: link, // iOS will use this for link preview
        });

        if (result.action === Share.sharedAction) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch (err) {
        console.error("[usePaymentLink] Share failed:", err);
      } finally {
        setIsSharing(false);
      }
    },
    []
  );

  // Cancel request
  const cancelRequest = useCallback(
    async (requestId: string): Promise<void> => {
      try {
        await cancelMutation({
          requestId,
          // Pass credentialId for custom auth fallback
          credentialId: credentialId || undefined,
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (currentRequest?.requestId === requestId) {
          setCurrentRequest(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to cancel request";
        setError(message);
        throw new Error(message);
      }
    },
    [cancelMutation, currentRequest, credentialId]
  );

  // Parse link
  const parseLink = useCallback((url: string): ParsedPaymentLink => {
    return parsePaymentLink(url);
  }, []);

  return {
    // State
    isCreating,
    isCopying,
    isSharing,
    error,
    currentRequest,

    // Actions
    createPaymentLink,
    copyToClipboard,
    shareLink,
    cancelRequest,

    // Queries
    myRequests: myRequestsQuery ?? [],
    isLoadingRequests: myRequestsQuery === undefined,

    // Parsing
    parseLink,
  };
}

// ============================================================================
// Additional Hook: Get Payment Request by ID
// ============================================================================

export function usePaymentRequest(requestId: string | null): {
  request: Doc<"paymentRequests"> | null;
  isLoading: boolean;
  isExpired: boolean;
  isPaid: boolean;
} {
  const request = useQuery(
    api.transfers.paymentRequests.getByRequestId,
    requestId ? { requestId } : "skip"
  );

  const isExpired =
    request?.status === "expired" ||
    (request?.expiresAt ? Date.now() > request.expiresAt : false);

  return {
    request: request ?? null,
    isLoading: request === undefined && requestId !== null,
    isExpired,
    isPaid: request?.status === "paid",
  };
}

export default usePaymentLink;
