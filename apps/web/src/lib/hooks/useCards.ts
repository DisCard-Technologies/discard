/**
 * React Query hooks for card management
 */

import { useQuery, useMutation, useQueryClient } from '../stubs';
import { Card, CreateCardRequest, CardListRequest } from '@discard/shared';
import { CardApiService } from '../api';

// Query keys
export const QUERY_KEYS = {
  cards: ['cards'] as const,
  cardsList: (filters?: CardListRequest) => ['cards', 'list', filters] as const,
  cardDetails: (cardId: string) => ['cards', 'details', cardId] as const,
};

// Custom hooks for card operations
export function useCards(filters?: CardListRequest) {
  return useQuery({
    queryKey: QUERY_KEYS.cardsList(filters),
    queryFn: () => CardApiService.getCards(filters),
    keepPreviousData: true,
  });
}

export function useCardDetails(cardId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.cardDetails(cardId),
    queryFn: () => CardApiService.getCardDetails(cardId),
    enabled: enabled && !!cardId,
  });
}

export function useCreateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateCardRequest) => CardApiService.createCard(request),
    onSuccess: () => {
      // Invalidate and refetch cards list
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cards });
    },
  });
}

export function useUpdateCardStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cardId, status }: { cardId: string; status: 'active' | 'paused' }) =>
      CardApiService.updateCardStatus(cardId, status),
    onSuccess: (updatedCard: any) => {
      // Update cached card data
      queryClient.setQueryData(QUERY_KEYS.cardDetails(updatedCard.cardId), (oldData: any) => ({
        ...oldData,
        card: updatedCard,
      }));
      
      // Invalidate cards list to refresh status
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cards });
    },
  });
}

export function useDeleteCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cardId: string) => CardApiService.deleteCard(cardId),
    onSuccess: (_: any, cardId: string) => {
      // Remove card from cache
      queryClient.removeQueries({ queryKey: QUERY_KEYS.cardDetails(cardId) });
      
      // Invalidate cards list
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cards });
    },
  });
}