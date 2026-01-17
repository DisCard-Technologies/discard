/**
 * useCards Hook Tests
 *
 * Tests for the card management hook including:
 * - Card listing and filtering
 * - Card creation
 * - Card freezing/unfreezing
 * - Card limit updates
 * - Card deletion
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useCards, useCard, useCardAuthorizations } from '@/hooks/useCards';
import {
  mockUseQuery,
  mockUseMutation,
  mockQuery,
  mockMutation,
  mockMutationError,
  resetConvexMocks,
} from '../../helpers/convex';
import {
  createTestCard,
  createFrozenCard,
  createPrivacyIsolatedCard,
  createTestCards,
  resetCardCounter,
} from '../../fixtures/cards';
import { createHookWrapper } from '../../helpers/render';
import type { Id } from '@/convex/_generated/dataModel';

describe('useCards Hook', () => {
  const testUserId = 'test_user_001' as Id<'users'>;

  beforeEach(() => {
    resetConvexMocks();
    resetCardCounter();
  });

  // ==========================================================================
  // Card Listing
  // ==========================================================================

  describe('Card Listing', () => {
    test('returns undefined while loading', () => {
      mockUseQuery.mockReturnValue(undefined);

      const { result } = renderHook(() => useCards(testUserId));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.cards).toBeUndefined();
    });

    test('returns empty array when no cards exist', () => {
      mockUseQuery.mockReturnValue({ cards: [] });

      const { result } = renderHook(() => useCards(testUserId));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.cards).toEqual([]);
    });

    test('returns cards when available', () => {
      const testCards = createTestCards(3, {}, testUserId);
      mockUseQuery.mockReturnValue({ cards: testCards });

      const { result } = renderHook(() => useCards(testUserId));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.cards).toHaveLength(3);
    });

    test('skips query when userId is null', () => {
      const { result } = renderHook(() => useCards(null));

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        'skip'
      );
    });

    test('getCard returns specific card by ID', () => {
      const testCards = createTestCards(3, {}, testUserId);
      const targetCard = testCards[1];
      mockUseQuery.mockReturnValue({ cards: testCards });

      const { result } = renderHook(() => useCards(testUserId));
      const foundCard = result.current.getCard(targetCard._id);

      expect(foundCard).toEqual(targetCard);
    });

    test('getCard returns undefined for non-existent card', () => {
      const testCards = createTestCards(3, {}, testUserId);
      mockUseQuery.mockReturnValue({ cards: testCards });

      const { result } = renderHook(() => useCards(testUserId));
      const foundCard = result.current.getCard('non_existent_id' as Id<'cards'>);

      expect(foundCard).toBeUndefined();
    });
  });

  // ==========================================================================
  // Card Creation
  // ==========================================================================

  describe('Card Creation', () => {
    test('creates card with default values', async () => {
      const mockCards: any[] = [];
      mockUseQuery.mockReturnValue({ cards: mockCards });

      const createMock = jest.fn().mockResolvedValue('new_card_id');
      mockUseMutation.mockReturnValue(createMock);

      const { result } = renderHook(() => useCards(testUserId));

      let cardId: Id<'cards'>;
      await act(async () => {
        cardId = await result.current.createCard({});
      });

      expect(createMock).toHaveBeenCalledWith({
        userId: testUserId,
        nickname: undefined,
        color: undefined,
        spendingLimit: undefined,
        dailyLimit: undefined,
        monthlyLimit: undefined,
        blockedMccCodes: undefined,
        blockedCountries: undefined,
        privacyIsolated: undefined,
      });
      expect(cardId!).toBe('new_card_id');
    });

    test('creates card with custom values', async () => {
      mockUseQuery.mockReturnValue({ cards: [] });

      const createMock = jest.fn().mockResolvedValue('new_card_id');
      mockUseMutation.mockReturnValue(createMock);

      const { result } = renderHook(() => useCards(testUserId));

      await act(async () => {
        await result.current.createCard({
          nickname: 'Travel Card',
          color: '#10B981',
          spendingLimit: 50000,
          dailyLimit: 10000,
          privacyIsolated: true,
        });
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nickname: 'Travel Card',
          color: '#10B981',
          spendingLimit: 50000,
          dailyLimit: 10000,
          privacyIsolated: true,
        })
      );
    });

    test('throws error when not authenticated', async () => {
      const { result } = renderHook(() => useCards(null));

      await expect(
        act(async () => {
          await result.current.createCard({});
        })
      ).rejects.toThrow('User not authenticated');
    });
  });

  // ==========================================================================
  // Card Freezing
  // ==========================================================================

  describe('Card Freezing', () => {
    test('freezes card successfully', async () => {
      const testCard = createTestCard({}, testUserId);
      mockUseQuery.mockReturnValue({ cards: [testCard] });

      const freezeMock = jest.fn().mockResolvedValue(undefined);
      mockUseMutation.mockReturnValue(freezeMock);

      const { result } = renderHook(() => useCards(testUserId));

      await act(async () => {
        await result.current.freezeCard(testCard._id);
      });

      expect(freezeMock).toHaveBeenCalledWith({ cardId: testCard._id });
    });

    test('unfreezes card successfully', async () => {
      const testCard = createFrozenCard({}, testUserId);
      mockUseQuery.mockReturnValue({ cards: [testCard] });

      const unfreezeMock = jest.fn().mockResolvedValue(undefined);
      mockUseMutation.mockReturnValue(unfreezeMock);

      const { result } = renderHook(() => useCards(testUserId));

      await act(async () => {
        await result.current.unfreezeCard(testCard._id);
      });

      expect(unfreezeMock).toHaveBeenCalledWith({ cardId: testCard._id });
    });
  });

  // ==========================================================================
  // Card Limit Updates
  // ==========================================================================

  describe('Card Limit Updates', () => {
    test('updates spending limit', async () => {
      const testCard = createTestCard({}, testUserId);
      mockUseQuery.mockReturnValue({ cards: [testCard] });

      const updateMock = jest.fn().mockResolvedValue(undefined);
      mockUseMutation.mockReturnValue(updateMock);

      const { result } = renderHook(() => useCards(testUserId));

      await act(async () => {
        await result.current.updateCardLimits(testCard._id, {
          spendingLimit: 200000,
        });
      });

      expect(updateMock).toHaveBeenCalledWith({
        cardId: testCard._id,
        spendingLimit: 200000,
      });
    });

    test('updates multiple limits at once', async () => {
      const testCard = createTestCard({}, testUserId);
      mockUseQuery.mockReturnValue({ cards: [testCard] });

      const updateMock = jest.fn().mockResolvedValue(undefined);
      mockUseMutation.mockReturnValue(updateMock);

      const { result } = renderHook(() => useCards(testUserId));

      await act(async () => {
        await result.current.updateCardLimits(testCard._id, {
          spendingLimit: 200000,
          dailyLimit: 50000,
          monthlyLimit: 500000,
        });
      });

      expect(updateMock).toHaveBeenCalledWith({
        cardId: testCard._id,
        spendingLimit: 200000,
        dailyLimit: 50000,
        monthlyLimit: 500000,
      });
    });
  });

  // ==========================================================================
  // Card Deletion
  // ==========================================================================

  describe('Card Deletion', () => {
    test('deletes card successfully', async () => {
      const testCard = createTestCard({}, testUserId);
      mockUseQuery.mockReturnValue({ cards: [testCard] });

      const deleteMock = jest.fn().mockResolvedValue(undefined);
      mockUseMutation.mockReturnValue(deleteMock);

      const { result } = renderHook(() => useCards(testUserId));

      await act(async () => {
        await result.current.deleteCard(testCard._id);
      });

      expect(deleteMock).toHaveBeenCalledWith({ cardId: testCard._id });
    });
  });
});

// ==========================================================================
// useCard Hook Tests
// ==========================================================================

describe('useCard Hook', () => {
  beforeEach(() => {
    resetConvexMocks();
    resetCardCounter();
  });

  test('returns card data when cardId is provided', () => {
    const testCard = createTestCard();
    mockUseQuery.mockReturnValue(testCard);

    const { result } = renderHook(() => useCard(testCard._id));

    expect(result.current.card).toEqual(testCard);
    expect(result.current.isLoading).toBe(false);
  });

  test('returns undefined when cardId is null', () => {
    mockUseQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useCard(null));

    expect(result.current.card).toBeUndefined();
  });

  test('shows loading state while fetching', () => {
    mockUseQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useCard('card_001' as Id<'cards'>));

    expect(result.current.isLoading).toBe(true);
  });
});

// ==========================================================================
// useCardAuthorizations Hook Tests
// ==========================================================================

describe('useCardAuthorizations Hook', () => {
  beforeEach(() => {
    resetConvexMocks();
  });

  test('returns authorizations for a card', () => {
    const mockAuthorizations = [
      { _id: 'auth_1', amount: 2500, merchant: 'Coffee Shop', status: 'approved' },
      { _id: 'auth_2', amount: 5000, merchant: 'Gas Station', status: 'approved' },
    ];
    mockUseQuery.mockReturnValue(mockAuthorizations);

    const { result } = renderHook(() =>
      useCardAuthorizations('card_001' as Id<'cards'>)
    );

    expect(result.current.authorizations).toEqual(mockAuthorizations);
    expect(result.current.isLoading).toBe(false);
  });

  test('skips query when cardId is null', () => {
    const { result } = renderHook(() => useCardAuthorizations(null));

    expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), 'skip');
  });
});
