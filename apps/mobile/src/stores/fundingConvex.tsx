/**
 * Convex-based Funding Store
 *
 * Replaces REST API calls with Convex real-time subscriptions.
 * Maintains same interface as legacy funding store for backwards compatibility.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrentUserId } from "./authConvex";

// Type definitions (were from @discard/shared)
export interface AccountBalance {
  userId: string;
  availableBalance: number;
  pendingBalance: number;
  reservedBalance: number;
  currency: string;
  lastUpdated: number;
}

export interface CardBalance {
  cardId: string;
  balance: number;
  lastUpdated: number;
}

export interface FundingTransaction {
  _id: Id<"fundingTransactions">;
  id: string;
  userId: Id<"users">;
  transactionType: "deposit" | "withdrawal" | "card_allocation" | "card_transfer";
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed" | "refunded";
  sourceType?: string;
  sourceId?: string;
  targetCardId?: Id<"cards">;
  stripePaymentIntentId?: string;
  createdAt: number;
  completedAt?: number;
}

export interface AccountFundingRequest {
  amount: number;
  currency?: string;
  sourceType: "stripe" | "ach" | "crypto";
}

export interface CardAllocationRequest {
  cardId: string;
  amount: number;
}

export interface CardTransferRequest {
  fromCardId: string;
  toCardId: string;
  amount: number;
}

// State interface (compatible with legacy)
export interface FundingState {
  accountBalance: AccountBalance | null;
  cardBalances: { [cardId: string]: CardBalance };
  transactions: FundingTransaction[];
  selectedTransaction: FundingTransaction | null;
  isLoadingBalance: boolean;
  isLoadingTransactions: boolean;
  isFunding: boolean;
  isAllocating: boolean;
  isTransferring: boolean;
  error: string | null;
  fundingError: string | null;
  allocationError: string | null;
  transferError: string | null;
}

// Actions interface (compatible with legacy)
export interface FundingActions {
  loadBalance: () => Promise<void>;
  loadCardBalance: (cardId: string) => Promise<void>;
  loadTransactions: () => Promise<void>;
  fundAccount: (request: AccountFundingRequest) => Promise<FundingTransaction | null>;
  allocateToCard: (request: CardAllocationRequest) => Promise<FundingTransaction | null>;
  transferBetweenCards: (request: CardTransferRequest) => Promise<FundingTransaction | null>;
  selectTransaction: (transaction: FundingTransaction | null) => void;
  clearError: () => void;
  clearFundingError: () => void;
  clearAllocationError: () => void;
  clearTransferError: () => void;
}

// Context
const FundingContext = createContext<{
  state: FundingState;
  actions: FundingActions;
} | null>(null);

// Provider component
export function FundingProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUserId();

  // Local state
  const [selectedTransaction, setSelectedTransaction] = useState<FundingTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isFunding, setIsFunding] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  // Real-time subscription to account balance
  const balanceData = useQuery(
    api.funding.funding.getAccountBalance,
    userId ? { userId } : "skip"
  );

  // Real-time subscription to transactions
  const transactionsData = useQuery(
    api.funding.funding.listTransactions,
    userId ? { userId } : "skip"
  );

  // Real-time subscription to cards (for card balances)
  const cardsData = useQuery(
    api.cards.cards.list,
    userId ? { userId } : "skip"
  );

  // Mutations
  const fundAccountMutation = useMutation(api.funding.funding.fundAccount);
  const allocateToCardMutation = useMutation(api.funding.funding.allocateToCard);
  const transferBetweenCardsMutation = useMutation(api.funding.funding.transferBetweenCards);

  // Actions
  const createPaymentIntentAction = useAction(api.funding.stripe.createPaymentIntent);

  // Build account balance from Convex data
  const accountBalance: AccountBalance | null = balanceData
    ? {
        userId: userId?.toString() || "",
        availableBalance: balanceData.availableBalance,
        pendingBalance: balanceData.pendingBalance,
        reservedBalance: balanceData.reservedBalance,
        currency: "USD",
        lastUpdated: Date.now(),
      }
    : null;

  // Build card balances from cards data
  const cardBalances: { [cardId: string]: CardBalance } = {};
  if (cardsData) {
    for (const card of cardsData) {
      cardBalances[card._id] = {
        cardId: card._id,
        balance: card.currentBalance,
        lastUpdated: card.updatedAt,
      };
    }
  }

  // Build transactions list
  const transactions: FundingTransaction[] = (transactionsData || []).map((tx) => ({
    ...tx,
    id: tx._id,
  }));

  const isLoadingBalance = balanceData === undefined;
  const isLoadingTransactions = transactionsData === undefined;

  // Build state object
  const state: FundingState = {
    accountBalance,
    cardBalances,
    transactions,
    selectedTransaction,
    isLoadingBalance,
    isLoadingTransactions,
    isFunding,
    isAllocating,
    isTransferring,
    error,
    fundingError,
    allocationError,
    transferError,
  };

  const actions: FundingActions = {
    /**
     * Load balance (no-op with Convex - data is reactive)
     */
    loadBalance: async (): Promise<void> => {
      // Convex handles this automatically via subscription
    },

    /**
     * Load card balance (no-op with Convex - data is reactive)
     */
    loadCardBalance: async (_cardId: string): Promise<void> => {
      // Convex handles this automatically via subscription
    },

    /**
     * Load transactions (no-op with Convex - data is reactive)
     */
    loadTransactions: async (): Promise<void> => {
      // Convex handles this automatically via subscription
    },

    /**
     * Fund account via Stripe
     */
    fundAccount: async (request: AccountFundingRequest): Promise<FundingTransaction | null> => {
      if (!userId) {
        setFundingError("Not authenticated");
        return null;
      }

      try {
        setIsFunding(true);
        setFundingError(null);

        if (request.sourceType === "stripe") {
          // Create Stripe payment intent
          const result = await createPaymentIntentAction({
            userId,
            amount: request.amount,
            currency: request.currency || "usd",
          });

          // In production, you'd use this clientSecret with Stripe SDK
          // For now, simulate the funding
          const txId = await fundAccountMutation({
            userId,
            amount: request.amount,
            currency: request.currency || "USD",
            sourceType: request.sourceType,
            stripePaymentIntentId: result.paymentIntentId,
          });

          // Find the created transaction
          const newTx = transactions.find((tx) => tx._id === txId);
          return newTx || null;
        } else {
          // Other funding sources
          const txId = await fundAccountMutation({
            userId,
            amount: request.amount,
            currency: request.currency || "USD",
            sourceType: request.sourceType,
          });

          const newTx = transactions.find((tx) => tx._id === txId);
          return newTx || null;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fund account";
        setFundingError(message);
        return null;
      } finally {
        setIsFunding(false);
      }
    },

    /**
     * Allocate funds to a card
     */
    allocateToCard: async (request: CardAllocationRequest): Promise<FundingTransaction | null> => {
      if (!userId) {
        setAllocationError("Not authenticated");
        return null;
      }

      try {
        setIsAllocating(true);
        setAllocationError(null);

        const txId = await allocateToCardMutation({
          userId,
          cardId: request.cardId as Id<"cards">,
          amount: request.amount,
        });

        const newTx = transactions.find((tx) => tx._id === txId);
        return newTx || null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to allocate to card";
        setAllocationError(message);
        return null;
      } finally {
        setIsAllocating(false);
      }
    },

    /**
     * Transfer between cards
     */
    transferBetweenCards: async (request: CardTransferRequest): Promise<FundingTransaction | null> => {
      if (!userId) {
        setTransferError("Not authenticated");
        return null;
      }

      try {
        setIsTransferring(true);
        setTransferError(null);

        const txId = await transferBetweenCardsMutation({
          userId,
          sourceCardId: request.fromCardId as Id<"cards">,
          targetCardId: request.toCardId as Id<"cards">,
          amount: request.amount,
        });

        const newTx = transactions.find((tx) => tx._id === txId);
        return newTx || null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to transfer between cards";
        setTransferError(message);
        return null;
      } finally {
        setIsTransferring(false);
      }
    },

    /**
     * Select a transaction for details view
     */
    selectTransaction: (transaction: FundingTransaction | null): void => {
      setSelectedTransaction(transaction);
    },

    /**
     * Clear errors
     */
    clearError: (): void => {
      setError(null);
    },

    clearFundingError: (): void => {
      setFundingError(null);
    },

    clearAllocationError: (): void => {
      setAllocationError(null);
    },

    clearTransferError: (): void => {
      setTransferError(null);
    },
  };

  return (
    <FundingContext.Provider value={{ state, actions }}>
      {children}
    </FundingContext.Provider>
  );
}

// Hook to use funding context
export function useFunding() {
  const context = useContext(FundingContext);
  if (!context) {
    throw new Error("useFunding must be used within a FundingProvider");
  }
  return context;
}

// Hook for funding operations
export function useFundingOperations() {
  const { actions } = useFunding();
  return actions;
}

// Hook for funding state
export function useFundingState() {
  const { state } = useFunding();
  return state;
}
