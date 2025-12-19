/**
 * Convex-based Card Management Store
 *
 * Replaces REST API calls with Convex real-time subscriptions.
 * Maintains same interface as legacy cards store for backwards compatibility.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrentUserId } from "./authConvex";

// Card interface (compatible with legacy)
export interface CardWithDetails {
  _id: Id<"cards">;
  cardId: string; // Legacy compatibility
  userId: Id<"users">;
  cardContext: string;
  last4: string;
  expirationMonth: number;
  expirationYear: number;
  cardType: "virtual" | "physical";
  status: "pending" | "active" | "frozen" | "cancelled" | "reissuing";
  spendingLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
  currentBalance: number;
  reservedBalance: number;
  overdraftLimit: number;
  blockedMccCodes?: string[];
  blockedCountries?: string[];
  privacyIsolated: boolean;
  nickname?: string;
  color?: string;
  marqetaCardToken?: string;
  // Temporary sensitive data (cleared after display)
  cardNumber?: string;
  cvv?: string;
  // UI state
  isLoading?: boolean;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// State interface (compatible with legacy)
export interface CardsState {
  cards: CardWithDetails[];
  selectedCard: CardWithDetails | null;
  isLoading: boolean;
  error: string | null;
  createCardLoading: boolean;
  deleteCardLoading: { [cardId: string]: boolean };
}

// Actions interface (compatible with legacy)
export interface CardsActions {
  loadCards: () => Promise<void>;
  createCard: (cardData: CreateCardRequest) => Promise<CardWithDetails | null>;
  getCardDetails: (cardId: string) => Promise<any | null>;
  updateCardStatus: (cardId: string, status: CardWithDetails["status"]) => Promise<void>;
  deleteCard: (cardId: string) => Promise<boolean>;
  selectCard: (card: CardWithDetails | null) => void;
  clearSensitiveData: (cardId: string) => void;
  clearError: () => void;
  freezeCard: (cardId: string, reason?: string) => Promise<{ success: boolean }>;
  unfreezeCard: (cardId: string) => Promise<{ success: boolean }>;
  getCardStatus: (cardId: string) => Promise<{ isFrozen: boolean }>;
}

// Create card request
export interface CreateCardRequest {
  nickname?: string;
  color?: string;
  spendingLimit?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  blockedMccCodes?: string[];
  blockedCountries?: string[];
  privacyIsolated?: boolean;
}

// Context
const CardsContext = createContext<{
  state: CardsState;
  actions: CardsActions;
} | null>(null);

// Provider component
export function CardsProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUserId();
  const [selectedCard, setSelectedCard] = useState<CardWithDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createCardLoading, setCreateCardLoading] = useState(false);
  const [deleteCardLoading, setDeleteCardLoading] = useState<{ [key: string]: boolean }>({});
  const [sensitiveData, setSensitiveData] = useState<{ [key: string]: { cardNumber?: string; cvv?: string } }>({});

  // Real-time subscription to cards
  const cardsData = useQuery(
    api.cards.cards.list,
    userId ? { userId } : "skip"
  );

  // Mutations
  const createCardMutation = useMutation(api.cards.cards.create);
  const freezeCardMutation = useMutation(api.cards.cards.freeze);
  const unfreezeCardMutation = useMutation(api.cards.cards.unfreeze);
  const deleteCardMutation = useMutation(api.cards.cards.deleteCard);
  const updateStatusMutation = useMutation(api.cards.cards.updateStatus);

  // Actions
  const provisionCardAction = useAction(api.cards.marqeta.provisionCard);

  // Transform Convex cards to legacy format
  const cards: CardWithDetails[] = (cardsData || []).map((card) => ({
    ...card,
    cardId: card._id, // Legacy compatibility
    cardNumber: sensitiveData[card._id]?.cardNumber,
    cvv: sensitiveData[card._id]?.cvv,
  }));

  const isLoading = cardsData === undefined;

  // Build state object
  const state: CardsState = {
    cards,
    selectedCard,
    isLoading,
    error,
    createCardLoading,
    deleteCardLoading,
  };

  const actions: CardsActions = {
    /**
     * Load cards (no-op with Convex - data is reactive)
     */
    loadCards: async (): Promise<void> => {
      // Convex handles this automatically via subscription
      // This is kept for backwards compatibility
    },

    /**
     * Create a new card
     */
    createCard: async (cardData: CreateCardRequest): Promise<CardWithDetails | null> => {
      if (!userId) {
        setError("Not authenticated");
        return null;
      }

      try {
        setCreateCardLoading(true);
        setError(null);

        // Create card in Convex
        const cardId = await createCardMutation({
          userId,
          nickname: cardData.nickname,
          color: cardData.color,
          spendingLimit: cardData.spendingLimit,
          dailyLimit: cardData.dailyLimit,
          monthlyLimit: cardData.monthlyLimit,
          blockedMccCodes: cardData.blockedMccCodes,
          blockedCountries: cardData.blockedCountries,
          privacyIsolated: cardData.privacyIsolated,
        });

        // Provision with Marqeta
        try {
          const provisionResult = await provisionCardAction({
            cardId,
            userId,
          });

          // Store sensitive data temporarily
          if (provisionResult.cardNumber && provisionResult.cvv) {
            setSensitiveData((prev) => ({
              ...prev,
              [cardId]: {
                cardNumber: provisionResult.cardNumber,
                cvv: provisionResult.cvv,
              },
            }));

            // Auto-clear after 60 seconds
            setTimeout(() => {
              actions.clearSensitiveData(cardId);
            }, 60000);
          }
        } catch (provisionError) {
          console.error("Card provisioning failed:", provisionError);
          // Card is created but not provisioned - will retry
        }

        // Return the newly created card
        const newCard = cards.find((c) => c._id === cardId);
        return newCard || null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create card";
        setError(message);
        return null;
      } finally {
        setCreateCardLoading(false);
      }
    },

    /**
     * Get card details
     */
    getCardDetails: async (cardId: string): Promise<any | null> => {
      // With Convex, card details are already in the subscription
      const card = cards.find((c) => c._id === cardId || c.cardId === cardId);
      return card || null;
    },

    /**
     * Update card status
     */
    updateCardStatus: async (
      cardId: string,
      status: CardWithDetails["status"]
    ): Promise<void> => {
      try {
        await updateStatusMutation({
          cardId: cardId as Id<"cards">,
          status,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update status";
        setError(message);
      }
    },

    /**
     * Delete a card
     */
    deleteCard: async (cardId: string): Promise<boolean> => {
      try {
        setDeleteCardLoading((prev) => ({ ...prev, [cardId]: true }));

        await deleteCardMutation({
          cardId: cardId as Id<"cards">,
        });

        // Clear from selected if needed
        if (selectedCard?._id === cardId) {
          setSelectedCard(null);
        }

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete card";
        setError(message);
        return false;
      } finally {
        setDeleteCardLoading((prev) => ({ ...prev, [cardId]: false }));
      }
    },

    /**
     * Select a card
     */
    selectCard: (card: CardWithDetails | null): void => {
      setSelectedCard(card);
    },

    /**
     * Clear sensitive data
     */
    clearSensitiveData: (cardId: string): void => {
      setSensitiveData((prev) => {
        const { [cardId]: _, ...rest } = prev;
        return rest;
      });
    },

    /**
     * Clear error
     */
    clearError: (): void => {
      setError(null);
    },

    /**
     * Freeze a card
     */
    freezeCard: async (cardId: string, _reason?: string): Promise<{ success: boolean }> => {
      try {
        await freezeCardMutation({
          cardId: cardId as Id<"cards">,
        });
        return { success: true };
      } catch (err) {
        console.error("Failed to freeze card:", err);
        return { success: false };
      }
    },

    /**
     * Unfreeze a card
     */
    unfreezeCard: async (cardId: string): Promise<{ success: boolean }> => {
      try {
        await unfreezeCardMutation({
          cardId: cardId as Id<"cards">,
        });
        return { success: true };
      } catch (err) {
        console.error("Failed to unfreeze card:", err);
        return { success: false };
      }
    },

    /**
     * Get card frozen status
     */
    getCardStatus: async (cardId: string): Promise<{ isFrozen: boolean }> => {
      const card = cards.find((c) => c._id === cardId || c.cardId === cardId);
      return { isFrozen: card?.status === "frozen" };
    },
  };

  return (
    <CardsContext.Provider value={{ state, actions }}>
      {children}
    </CardsContext.Provider>
  );
}

// Hook to use cards context
export function useCards() {
  const context = useContext(CardsContext);
  if (!context) {
    throw new Error("useCards must be used within a CardsProvider");
  }
  return context;
}

// Hook for card operations
export function useCardOperations() {
  const { actions } = useCards();
  return actions;
}

// Hook for cards state
export function useCardsState() {
  const { state } = useCards();
  return state;
}
