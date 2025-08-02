/**
 * Privacy Isolation Tests for Backend Services
 * Testing cryptographic deletion, context isolation, and privacy guarantees
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { privacyService } from '../../../services/cards/privacy.service';
import { cardsService } from '../../../services/cards/cards.service';
import { supabase } from '../../../app';
import { testDataFactory } from '../../utils/test-helpers';
import crypto from 'crypto';

// Mock crypto for consistent testing
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'test-hash'),
  })),
  createCipher: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    final: jest.fn(() => 'encrypted-data'),
  })),
  createDecipher: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    final: jest.fn(() => 'decrypted-data'),
  })),
  pbkdf2Sync: jest.fn(() => Buffer.from('derived-key')),
  timingSafeEqual: jest.fn(() => true),
}));

// Mock Supabase
jest.mock('../../../app', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  },
}));

const mockSupabaseClient = supabase as jest.Mocked<typeof supabase>;

describe('Privacy Isolation Testing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cryptographic Deletion', () => {
    test('should generate cryptographic deletion proof', () => {
      const cardId = 'test-card-id';
      const deletionKey = 'test-deletion-key';

      const deletionProof = privacyService.createDeletionProof(cardId, deletionKey);

      expect(deletionProof).toEqual({
        cardId,
        deletionKey,
        timestamp: expect.any(String),
        signature: expect.any(String),
        cryptographicHash: expect.any(String),
      });

      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });

    test('should verify deletion proof authenticity', () => {
      const cardId = 'test-card-id';
      const deletionKey = 'test-deletion-key';
      const deletionProof = privacyService.createDeletionProof(cardId, deletionKey);

      const isValid = privacyService.verifyDeletionProof(deletionProof);

      expect(isValid).toBe(true);
      expect(crypto.timingSafeEqual).toHaveBeenCalled();
    });

    test('should reject invalid deletion proofs', () => {
      const invalidProof = {
        cardId: 'test-card-id',
        deletionKey: 'wrong-key',
        timestamp: '2024-01-01T00:00:00.000Z',
        signature: 'invalid-signature',
        cryptographicHash: 'invalid-hash',
      };

      (crypto.timingSafeEqual as jest.Mock).mockReturnValue(false);

      const isValid = privacyService.verifyDeletionProof(invalidProof);

      expect(isValid).toBe(false);
    });

    test('should log deletion events with cryptographic proof', async () => {
      const cardId = 'test-card-id';
      const deletionProof = {
        cardId,
        deletionKey: 'test-key',
        timestamp: '2024-01-01T00:00:00.000Z',
        signature: 'test-signature',
        cryptographicHash: 'test-hash',
      };

      const mockQuery = mockSupabaseClient.from('deletion_log');
      mockQuery.single.mockResolvedValue({ data: { id: 'log-id' }, error: null });

      await privacyService.logCardDeletion(cardId, deletionProof);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('deletion_log');
      expect(mockQuery.insert).toHaveBeenCalledWith([{
        card_id: cardId,
        deletion_proof: deletionProof,
        deleted_at: expect.any(String),
        verified: true,
      }]);
    });

    test('should ensure deletion is irreversible', async () => {
      const userId = 'test-user-id';
      const cardId = 'test-card-id';

      // Mock card deletion
      const mockDeleteQuery = mockSupabaseClient.from('cards');
      mockDeleteQuery.single.mockResolvedValue({
        data: { card_id: cardId, status: 'deleted' },
        error: null,
      });

      await cardsService.deleteCard(userId, cardId);

      // Verify card is marked as deleted
      expect(mockDeleteQuery.update).toHaveBeenCalledWith({
        status: 'deleted',
        updated_at: expect.any(String),
      });

      // Try to retrieve deleted card credentials - should fail
      await expect(cardsService.getCardCredentials(userId, cardId))
        .rejects.toThrow('Card not found or deleted');
    });
  });

  describe('Context Isolation', () => {
    test('should generate unique context hash for each card', () => {
      const userId = 'test-user-id';

      const context1 = privacyService.generateCardContext(userId);
      const context2 = privacyService.generateCardContext(userId);

      expect(context1).not.toBe(context2);
      expect(context1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex format
      expect(context2).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should prevent cross-context data access', async () => {
      const userId = 'test-user-id';
      const cardId1 = 'card-1';
      const cardId2 = 'card-2';

      // Mock cards with different contexts
      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single
        .mockResolvedValueOnce({
          data: {
            card_id: cardId1,
            user_id: userId,
            card_context_hash: 'context-1',
            encrypted_card_number: 'encrypted-1',
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            card_id: cardId2,
            user_id: userId,
            card_context_hash: 'context-2',
            encrypted_card_number: 'encrypted-2',
          },
          error: null,
        });

      // Mock decryption to return different values for different contexts
      jest.spyOn(privacyService, 'decryptCardData')
        .mockReturnValueOnce('4111111111111111') // Card 1
        .mockReturnValueOnce('4222222222222222'); // Card 2

      const card1Data = await cardsService.getCardCredentials(userId, cardId1);
      const card2Data = await cardsService.getCardCredentials(userId, cardId2);

      expect(card1Data.cardNumber).toBe('4111111111111111');
      expect(card2Data.cardNumber).toBe('4222222222222222');

      // Verify decryption was called with different context hashes
      expect(privacyService.decryptCardData).toHaveBeenCalledWith('encrypted-1', cardId1);
      expect(privacyService.decryptCardData).toHaveBeenCalledWith('encrypted-2', cardId2);
    });

    test('should enforce row-level security with context isolation', async () => {
      const userId = 'test-user-id';
      const unauthorizedUserId = 'unauthorized-user-id';
      const cardId = 'test-card-id';

      // Mock card belonging to authorized user
      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({
        data: null,
        error: { message: 'Row not found' },
      });

      // Unauthorized user should not be able to access card
      await expect(cardsService.getCardCredentials(unauthorizedUserId, cardId))
        .rejects.toThrow('Card not found');

      // Verify query included user_id constraint
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', unauthorizedUserId);
      expect(mockQuery.eq).toHaveBeenCalledWith('card_id', cardId);
    });
  });

  describe('Encryption Security', () => {
    test('should use strong encryption for card data', () => {
      const cardNumber = '4111111111111111';
      const cardId = 'test-card-id';

      const encryptedData = privacyService.encryptCardData(cardNumber, cardId);

      expect(encryptedData).toBe('encrypted-data');
      expect(crypto.createCipher).toHaveBeenCalledWith('aes-256-cbc', expect.any(String));
    });

    test('should decrypt data only with correct context', () => {
      const encryptedData = 'encrypted-data';
      const cardId = 'test-card-id';

      const decryptedData = privacyService.decryptCardData(encryptedData, cardId);

      expect(decryptedData).toBe('decrypted-data');
      expect(crypto.createDecipher).toHaveBeenCalledWith('aes-256-cbc', expect.any(String));
    });

    test('should derive encryption keys from card context', () => {
      const cardId = 'test-card-id';
      const context = 'test-context';

      const key = privacyService.deriveEncryptionKey(cardId, context);

      expect(crypto.pbkdf2Sync).toHaveBeenCalledWith(
        cardId,
        context,
        100000, // iterations
        32, // key length
        'sha256'
      );
      expect(key).toEqual(Buffer.from('derived-key'));
    });

    test('should validate encryption key strength', () => {
      const weakKey = Buffer.from('weak');
      const strongKey = Buffer.from('a'.repeat(32));

      expect(privacyService.validateKeyStrength(weakKey)).toBe(false);
      expect(privacyService.validateKeyStrength(strongKey)).toBe(true);
    });
  });

  describe('Privacy Policy Compliance', () => {
    test('should implement data minimization', async () => {
      const userId = 'test-user-id';
      const createCardData = {
        spendingLimit: 10000,
        merchantRestrictions: ['grocery'],
      };

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({
        data: testDataFactory.createCard(),
        error: null,
      });

      await cardsService.createCard({ userId, ...createCardData });

      // Verify only necessary data is stored
      expect(mockQuery.insert).toHaveBeenCalledWith([
        expect.not.objectContaining({
          user_email: expect.any(String),
          user_ip: expect.any(String),
          device_info: expect.any(String),
        }),
      ]);
    });

    test('should support right to deletion (GDPR)', async () => {
      const userId = 'test-user-id';
      const cardId = 'test-card-id';

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({
        data: { card_id: cardId, status: 'active' },
        error: null,
      });

      const deletionProof = await cardsService.deleteCard(userId, cardId);

      expect(deletionProof).toEqual(
        expect.objectContaining({
          cardId,
          deletionKey: expect.any(String),
          timestamp: expect.any(String),
        })
      );
    });

    test('should provide data portability (GDPR)', async () => {
      const userId = 'test-user-id';

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.limit.mockResolvedValue({
        data: [testDataFactory.createCard()],
        error: null,
      });

      const exportData = await cardsService.exportUserData(userId);

      expect(exportData).toEqual({
        userId,
        cards: expect.arrayContaining([
          expect.objectContaining({
            cardId: expect.any(String),
            spendingLimit: expect.any(Number),
            createdAt: expect.any(String),
          }),
        ]),
        deletedCards: expect.any(Array),
        exportedAt: expect.any(String),
      });
    });
  });

  describe('Security Monitoring', () => {
    test('should detect unusual access patterns', async () => {
      const userId = 'test-user-id';
      const cardId = 'test-card-id';

      // Simulate rapid credential access
      for (let i = 0; i < 10; i++) {
        await cardsService.getCardCredentials(userId, cardId);
      }

      // Should trigger rate limiting
      expect(privacyService.checkRateLimit).toHaveBeenCalledWith(userId, 'credential_access');
    });

    test('should log privacy-sensitive operations', async () => {
      const userId = 'test-user-id';
      const cardId = 'test-card-id';

      const mockLogQuery = mockSupabaseClient.from('privacy_audit_log');
      mockLogQuery.single.mockResolvedValue({ data: { id: 'log-id' }, error: null });

      await cardsService.getCardCredentials(userId, cardId);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('privacy_audit_log');
      expect(mockLogQuery.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: userId,
          action: 'credential_access',
          resource_id: cardId,
          timestamp: expect.any(String),
        }),
      ]);
    });

    test('should alert on unauthorized access attempts', async () => {
      const userId = 'unauthorized-user';
      const cardId = 'test-card-id';

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ data: null, error: { message: 'Unauthorized' } });

      await expect(cardsService.getCardCredentials(userId, cardId))
        .rejects.toThrow('Card not found');

      // Should log security event
      expect(privacyService.logSecurityEvent).toHaveBeenCalledWith({
        type: 'unauthorized_access',
        userId,
        resource: cardId,
        timestamp: expect.any(String),
      });
    });
  });

  describe('Backup and Recovery', () => {
    test('should create encrypted backups of privacy keys', async () => {
      const userId = 'test-user-id';

      const backup = await privacyService.createPrivacyBackup(userId);

      expect(backup).toEqual(
        expect.objectContaining({
          userId,
          encryptedKeys: expect.any(String),
          backupTimestamp: expect.any(String),
          verificationHash: expect.any(String),
        })
      );
    });

    test('should verify backup integrity', async () => {
      const backup = {
        userId: 'test-user-id',
        encryptedKeys: 'encrypted-backup-data',
        backupTimestamp: '2024-01-01T00:00:00.000Z',
        verificationHash: 'test-hash',
      };

      const isValid = await privacyService.verifyBackupIntegrity(backup);

      expect(isValid).toBe(true);
    });

    test('should restore privacy context from backup', async () => {
      const userId = 'test-user-id';
      const backupData = 'encrypted-backup-data';

      const restoredContext = await privacyService.restoreFromBackup(userId, backupData);

      expect(restoredContext).toEqual(
        expect.objectContaining({
          userId,
          contextRestored: true,
          timestamp: expect.any(String),
        })
      );
    });
  });
});