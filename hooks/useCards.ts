/**
 * Cards Hook
 *
 * Provides real-time card management with Convex subscriptions.
 * Replaces REST API calls with reactive queries and mutations.
 */
import { useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface CreateCardParams {
  nickname?: string;
  color?: string;
  spendingLimit?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  blockedMccCodes?: string[];
  blockedCountries?: string[];
  privacyIsolated?: boolean;
}

interface UseCardsReturn {
  cards: any[] | undefined;
  isLoading: boolean;
  getCard: (cardId: Id<"cards">) => any | undefined;
  createCard: (params: CreateCardParams) => Promise<Id<"cards">>;
  freezeCard: (cardId: Id<"cards">) => Promise<void>;
  unfreezeCard: (cardId: Id<"cards">) => Promise<void>;
  updateCardLimits: (
    cardId: Id<"cards">,
    limits: {
      spendingLimit?: number;
      dailyLimit?: number;
      monthlyLimit?: number;
    }
  ) => Promise<void>;
  deleteCard: (cardId: Id<"cards">) => Promise<void>;
}

export function useCards(userId: Id<"users"> | null): UseCardsReturn {
  // Real-time subscription to user's cards
  const cardsData = useQuery(
    api.cards.cards.list,
    userId ? {} : "skip"
  );

  // Mutations
  const createCardMutation = useMutation(api.cards.cards.create);
  const freezeCardMutation = useMutation(api.cards.cards.freeze);
  const unfreezeCardMutation = useMutation(api.cards.cards.unfreeze);
  const updateStatusMutation = useMutation(api.cards.cards.updateStatus);
  const deleteCardMutation = useMutation(api.cards.cards.deleteCard);

  const cards = cardsData?.cards;
  const isLoading = cardsData === undefined;

  /**
   * Get a specific card by ID
   */
  const getCard = useCallback(
    (cardId: Id<"cards">) => {
      return cards?.find((card) => card._id === cardId);
    },
    [cards]
  );

  /**
   * Create a new virtual card
   */
  const createCard = useCallback(
    async (params: CreateCardParams): Promise<Id<"cards">> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      return await createCardMutation({
        userId,
        nickname: params.nickname,
        color: params.color,
        spendingLimit: params.spendingLimit,
        dailyLimit: params.dailyLimit,
        monthlyLimit: params.monthlyLimit,
        blockedMccCodes: params.blockedMccCodes,
        blockedCountries: params.blockedCountries,
        privacyIsolated: params.privacyIsolated,
      });
    },
    [userId, createCardMutation]
  );

  /**
   * Freeze a card (temporary pause)
   */
  const freezeCard = useCallback(
    async (cardId: Id<"cards">): Promise<void> => {
      await freezeCardMutation({ cardId });
    },
    [freezeCardMutation]
  );

  /**
   * Unfreeze a card
   */
  const unfreezeCard = useCallback(
    async (cardId: Id<"cards">): Promise<void> => {
      await unfreezeCardMutation({ cardId });
    },
    [unfreezeCardMutation]
  );

  /**
   * Update card spending limits
   */
  const updateCardLimits = useCallback(
    async (
      cardId: Id<"cards">,
      limits: {
        spendingLimit?: number;
        dailyLimit?: number;
        monthlyLimit?: number;
      }
    ): Promise<void> => {
      await updateStatusMutation({
        cardId,
        ...limits,
      });
    },
    [updateStatusMutation]
  );

  /**
   * Delete a card permanently
   */
  const deleteCard = useCallback(
    async (cardId: Id<"cards">): Promise<void> => {
      await deleteCardMutation({ cardId });
    },
    [deleteCardMutation]
  );

  return {
    cards,
    isLoading,
    getCard,
    createCard,
    freezeCard,
    unfreezeCard,
    updateCardLimits,
    deleteCard,
  };
}

/**
 * Hook for getting card details with real-time updates
 */
export function useCard(cardId: Id<"cards"> | null) {
  const card = useQuery(
    api.cards.cards.get,
    cardId ? { cardId } : "skip"
  );

  return {
    card,
    isLoading: card === undefined,
  };
}

/**
 * Hook for getting card authorizations
 */
export function useCardAuthorizations(cardId: Id<"cards"> | null) {
  const authorizations = useQuery(
    api.cards.cards.getAuthorizations,
    cardId ? { cardId } : "skip"
  );

  return {
    authorizations,
    isLoading: authorizations === undefined,
  };
}
