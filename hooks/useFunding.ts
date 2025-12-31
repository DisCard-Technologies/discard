/**
 * Funding Hook
 *
 * Provides account funding and balance management with Stripe integration.
 * Handles card balance allocation and transfers.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isMockUserId } from "@/stores/authConvex";

type FundingSourceType = "stripe" | "ach" | "crypto";
type TransactionStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

interface FundingTransaction {
  _id: Id<"fundingTransactions">;
  userId: Id<"users">;
  transactionType: "deposit" | "withdrawal" | "card_allocation" | "card_transfer";
  amount: number;
  currency: string;
  status: TransactionStatus;
  sourceType: FundingSourceType;
  createdAt: number;
}

interface UseFundingReturn {
  accountBalance: number | undefined;
  transactions: FundingTransaction[] | undefined;
  isLoading: boolean;
  fundAccount: (amount: number, sourceType: FundingSourceType) => Promise<string>;
  allocateToCard: (cardId: Id<"cards">, amount: number) => Promise<void>;
  transferBetweenCards: (
    sourceCardId: Id<"cards">,
    targetCardId: Id<"cards">,
    amount: number
  ) => Promise<void>;
  withdrawToBank: (amount: number) => Promise<void>;
}

export function useFunding(userId: Id<"users"> | null): UseFundingReturn {
  // Real-time subscription to account balance
  const balanceData = useQuery(
    api.funding.funding.accountBalance,
    userId ? {} : "skip"
  );

  // Real-time subscription to funding transactions
  const transactions = useQuery(
    api.funding.funding.transactions,
    userId ? {} : "skip"
  );

  // Mutations
  const fundAccountMutation = useMutation(api.funding.funding.fundAccount);
  const allocateToCardMutation = useMutation(api.funding.funding.allocateToCard);
  const transferBetweenCardsMutation = useMutation(api.funding.funding.transferBetweenCards);

  // Actions
  const createPaymentIntentAction = useAction(api.funding.stripe.createPaymentIntent);

  const isLoading = balanceData === undefined || transactions === undefined;

  /**
   * Fund account via Stripe or other source
   */
  const fundAccount = useCallback(
    async (amount: number, sourceType: FundingSourceType): Promise<string> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      if (sourceType === "stripe") {
        // Create Stripe payment intent
        const result = await createPaymentIntentAction({
          userId,
          amount,
          currency: "usd",
        });

        return result.clientSecret;
      } else if (sourceType === "ach") {
        // ACH funding would use Stripe's ACH integration
        const result = await createPaymentIntentAction({
          userId,
          amount,
          currency: "usd",
        });

        return result.clientSecret;
      } else {
        throw new Error(`Unsupported funding source: ${sourceType}`);
      }
    },
    [userId, createPaymentIntentAction]
  );

  /**
   * Allocate funds from account to a specific card
   */
  const allocateToCard = useCallback(
    async (cardId: Id<"cards">, amount: number): Promise<void> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      await allocateToCardMutation({
        cardId,
        amount,
      });
    },
    [userId, allocateToCardMutation]
  );

  /**
   * Transfer funds between cards
   */
  const transferBetweenCards = useCallback(
    async (
      sourceCardId: Id<"cards">,
      targetCardId: Id<"cards">,
      amount: number
    ): Promise<void> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      await transferBetweenCardsMutation({
        sourceCardId,
        targetCardId,
        amount,
      });
    },
    [userId, transferBetweenCardsMutation]
  );

  /**
   * Withdraw funds to bank (placeholder)
   */
  const withdrawToBank = useCallback(
    async (_amount: number): Promise<void> => {
      // Withdrawal would be implemented with Stripe Connect or similar
      throw new Error("Bank withdrawal not yet implemented");
    },
    []
  );

  return {
    accountBalance: balanceData?.availableBalance,
    transactions: transactions?.transactions as FundingTransaction[] | undefined,
    isLoading,
    fundAccount,
    allocateToCard,
    transferBetweenCards,
    withdrawToBank,
  };
}

/**
 * Hook for Stripe payment sheet integration
 */
export function useStripePayment() {
  const confirmPaymentAction = useAction(api.funding.stripe.confirmPaymentIntent);

  const confirmPayment = useCallback(
    async (paymentIntentId: string): Promise<boolean> => {
      const result = await confirmPaymentAction({ paymentIntentId });
      return result.success;
    },
    [confirmPaymentAction]
  );

  return {
    confirmPayment,
  };
}

/**
 * Hook for crypto funding (from connected wallets)
 */
export function useCryptoFunding(userId: Id<"users"> | null) {
  // Skip query for mock users (dev mode) or null userId
  const validUserId = userId && !isMockUserId(userId) ? userId : null;
  
  const wallets = useQuery(
    api.wallets.wallets.list,
    validUserId ? { userId: validUserId } : "skip"
  );

  const fundFromWalletMutation = useMutation(api.funding.funding.fundFromWallet);

  const fundFromWallet = useCallback(
    async (
      walletId: Id<"wallets">,
      amount: number,
      currency: string
    ): Promise<void> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      await fundFromWalletMutation({
        userId,
        walletId,
        amount,
        currency,
      });
    },
    [userId, fundFromWalletMutation]
  );

  return {
    wallets,
    isLoading: wallets === undefined,
    fundFromWallet,
  };
}
