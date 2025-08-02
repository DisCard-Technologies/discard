import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { cardsService } from '../../../services/cards/cards.service';
import { privacyService } from '../../../services/cards/privacy.service';
import { supabase } from '../../../app';
import { createMockSupabaseClient, mockScenarios } from '../../utils/supabase-mock';
import { testDataFactory, setupMocks } from '../../utils/test-helpers';

// Mock supabase with centralized factory
jest.mock('../../../app', () => {
  return {
    supabase: {
      from: jest.fn(() => ({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn()
      }))
    }
  };
});

// Mock privacy service
jest.mock('../../../services/cards/privacy.service', () => ({
  privacyService: {
    validateSpendingLimit: jest.fn(),
    generateCardCredentials: jest.fn(),
    generateCardContext: jest.fn(),
    generateDeletionKey: jest.fn(),
    encryptCardData: jest.fn(),
    createDeletionProof: jest.fn(),
    logCardDeletion: jest.fn(),
    decryptCardData: jest.fn()
  }
}));

const mockSupabaseClient = supabase as jest.Mocked<typeof supabase>;
const mockPrivacyService = privacyService as jest.Mocked<typeof privacyService>;

describe('CardsService', () => {
  const mockUserId = 'test-user-id';
  const mockCardId = 'test-card-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createCard', () => {
    test('should create a card successfully', async () => {
      // Arrange
      const createCardData = {
        userId: mockUserId,
        spendingLimit: 10000, // $100.00
        expirationDate: '1226', // Dec 2026
        merchantRestrictions: ['grocery', 'gas']
      };

      const mockCardCredentials = {
        cardNumber: '4111111111111111',
        cvv: '123'
      };

      const mockCardRecord = {
        card_id: mockCardId,
        user_id: mockUserId,
        card_context_hash: 'mock-context-hash',
        encrypted_card_number: 'encrypted-card-number',
        encrypted_cvv: 'encrypted-cvv',
        expiration_date: '1226',
        status: 'active',
        spending_limit: 10000,
        current_balance: 0,
        expires_at: '2026-12-31T23:59:59.999Z',
        merchant_restrictions: ['grocery', 'gas'],
        deletion_key: 'mock-deletion-key',
        created_at: '2024-01-01T00:00:00.000Z'
      };

      // Mock privacy service methods
      mockPrivacyService.validateSpendingLimit.mockReturnValue({ valid: true });
      mockPrivacyService.generateCardCredentials.mockReturnValue(mockCardCredentials);
      mockPrivacyService.generateCardContext.mockReturnValue('mock-context-hash');
      mockPrivacyService.generateDeletionKey.mockReturnValue('mock-deletion-key');
      mockPrivacyService.encryptCardData.mockReturnValue('encrypted-data');

      // Mock supabase insert
      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ data: mockCardRecord, error: null });

      // Act
      const result = await cardsService.createCard(createCardData);

      // Assert
      expect(mockPrivacyService.validateSpendingLimit).toHaveBeenCalledWith(10000);
      expect(mockPrivacyService.generateCardCredentials).toHaveBeenCalled();
      expect(mockPrivacyService.generateCardContext).toHaveBeenCalledWith(mockUserId);
      expect(mockPrivacyService.generateDeletionKey).toHaveBeenCalledWith(expect.any(String));
      expect(mockPrivacyService.encryptCardData).toHaveBeenCalledTimes(2); // card number and CVV

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cards');
      expect(mockQuery.insert).toHaveBeenCalledWith([expect.objectContaining({
        user_id: mockUserId,
        spending_limit: 10000,
        merchant_restrictions: ['grocery', 'gas']
      })]);

      expect(result).toEqual({
        card: expect.objectContaining({
          cardId: mockCardId,
          status: 'active',
          spendingLimit: 10000
        }),
        cardNumber: '4111111111111111',
        cvv: '123'
      });
    });

    test('should throw error for invalid spending limit', async () => {
      // Arrange
      const createCardData = {
        userId: mockUserId,
        spendingLimit: 50, // Too low
      };

      mockPrivacyService.validateSpendingLimit.mockReturnValue({ 
        valid: false, 
        message: 'Spending limit must be at least $1.00 (100 cents)' 
      });

      // Act & Assert
      await expect(cardsService.createCard(createCardData)).rejects.toThrow(
        'Spending limit must be at least $1.00 (100 cents)'
      );
    });

    test('should handle database insertion error', async () => {
      // Arrange
      const createCardData = {
        userId: mockUserId,
        spendingLimit: 10000,
      };

      mockPrivacyService.validateSpendingLimit.mockReturnValue({ valid: true });
      mockPrivacyService.generateCardCredentials.mockReturnValue({
        cardNumber: '4111111111111111',
        cvv: '123'
      });
      mockPrivacyService.generateCardContext.mockReturnValue('mock-context-hash');
      mockPrivacyService.generateDeletionKey.mockReturnValue('mock-deletion-key');
      mockPrivacyService.encryptCardData.mockReturnValue('encrypted-data');

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      // Act & Assert
      await expect(cardsService.createCard(createCardData)).rejects.toThrow('Failed to create card');
    });
  });

  describe('listCards', () => {
    test('should list cards successfully', async () => {
      // Arrange
      const mockCards = [
        {
          card_id: 'card-1',
          user_id: mockUserId,
          card_context_hash: 'context-1',
          encrypted_card_number: 'encrypted-1',
          encrypted_cvv: 'cvv-1',
          expiration_date: '1225',
          status: 'active',
          spending_limit: 10000,
          current_balance: 5000,
          created_at: '2024-01-01T00:00:00.000Z',
          expires_at: '2025-12-31T23:59:59.999Z',
          merchant_restrictions: null,
          deletion_key: 'key-1'
        }
      ];

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.limit.mockResolvedValue({ data: mockCards, error: null });

      // Act
      const result = await cardsService.listCards(mockUserId);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cards');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockQuery.limit).toHaveBeenCalledWith(50);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        cardId: 'card-1',
        status: 'active',
        spendingLimit: 10000,
        currentBalance: 5000
      }));
    });

    test('should filter cards by status', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.limit.mockResolvedValue({ data: [], error: null });

      // Act
      await cardsService.listCards(mockUserId, { status: 'paused', limit: 10 });

      // Assert
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'paused');
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    test('should handle database query error', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.limit.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      // Act & Assert
      await expect(cardsService.listCards(mockUserId)).rejects.toThrow('Failed to retrieve cards');
    });
  });

  describe('deleteCard', () => {
    test('should delete card successfully', async () => {
      // Arrange
      const mockCardRecord = {
        card_id: mockCardId,
        deletion_key: 'deletion-key',
        status: 'active'
      };

      const mockDeletionProof = {
        cardId: mockCardId,
        deletionKey: 'deletion-key',
        timestamp: '2024-01-01T00:00:00.000Z',
        signature: 'mock-signature'
      };

      const mockSelectQuery = mockSupabaseClient.from('cards');
      const mockUpdateQuery = mockSupabaseClient.from('cards');
      
      mockSelectQuery.single.mockResolvedValue({ data: mockCardRecord, error: null });
      mockUpdateQuery.eq.mockResolvedValue({ error: null });

      mockSupabaseClient.from.mockReturnValueOnce(mockSelectQuery)
                   .mockReturnValueOnce(mockUpdateQuery);

      mockPrivacyService.createDeletionProof.mockReturnValue(mockDeletionProof);
      mockPrivacyService.logCardDeletion.mockResolvedValue(undefined);

      // Act
      const result = await cardsService.deleteCard(mockUserId, mockCardId);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cards');
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('card_id', mockCardId);
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      
      expect(mockPrivacyService.createDeletionProof).toHaveBeenCalledWith(mockCardId, 'deletion-key');
      expect(mockPrivacyService.logCardDeletion).toHaveBeenCalledWith(mockCardId, mockDeletionProof);

      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        status: 'deleted',
        updated_at: expect.any(String)
      });

      expect(result).toEqual(mockDeletionProof);
    });

    test('should throw error for non-existent card', async () => {
      // Arrange
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) as any
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery as any);

      // Act & Assert
      await expect(cardsService.deleteCard(mockUserId, mockCardId)).rejects.toThrow('Card not found');
    });

    test('should throw error for already deleted card', async () => {
      // Arrange
      const mockCardRecord = {
        card_id: mockCardId,
        deletion_key: 'deletion-key',
        status: 'deleted'
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCardRecord, error: null }) as any
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery as any);

      // Act & Assert
      await expect(cardsService.deleteCard(mockUserId, mockCardId)).rejects.toThrow('Card is already deleted');
    });
  });

  describe('getCardCredentials', () => {
    test('should return decrypted card credentials', async () => {
      // Arrange
      const mockCardRecord = {
        encrypted_card_number: 'encrypted-card-number',
        encrypted_cvv: 'encrypted-cvv'
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCardRecord, error: null }) as any
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery as any);

      mockPrivacyService.decryptCardData
        .mockReturnValueOnce('4111111111111111') // card number
        .mockReturnValueOnce('123'); // CVV

      // Act
      const result = await cardsService.getCardCredentials(mockUserId, mockCardId);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cards');
      expect(mockQuery.eq).toHaveBeenCalledWith('card_id', mockCardId);
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);

      expect(mockPrivacyService.decryptCardData).toHaveBeenCalledWith('encrypted-card-number', mockCardId);
      expect(mockPrivacyService.decryptCardData).toHaveBeenCalledWith('encrypted-cvv', mockCardId);

      expect(result).toEqual({
        cardNumber: '4111111111111111',
        cvv: '123'
      });
    });

    test('should throw error for non-existent card', async () => {
      // Arrange
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) as any
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery as any);

      // Act & Assert
      await expect(cardsService.getCardCredentials(mockUserId, mockCardId)).rejects.toThrow('Card not found');
    });
  });
});