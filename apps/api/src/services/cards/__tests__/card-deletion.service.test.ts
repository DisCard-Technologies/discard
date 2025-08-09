import { CardDeletionService } from '../card-deletion.service';
import { supabase } from '../../../utils/supabase';
import { marqetaService } from '../../payments/marqeta.service';

// Mock dependencies
jest.mock('../../../utils/supabase');
jest.mock('../../payments/marqeta.service');
jest.mock('../../../utils/logger');

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockMarqetaService = marqetaService as jest.Mocked<typeof marqetaService>;

describe('CardDeletionService', () => {
  let cardDeletionService: CardDeletionService;

  beforeEach(() => {
    cardDeletionService = new CardDeletionService();
    jest.clearAllMocks();
  });

  describe('deleteCard', () => {
    const mockCard = {
      card_id: 'test-card-id',
      user_id: 'test-user-id',
      card_context_hash: 'test-context-hash',
      status: 'active',
      deletion_key: 'test-deletion-key',
      visa_card_details: {
        marqeta_card_token: 'test-marqeta-token',
        provisioning_status: 'active'
      }
    };

    beforeEach(() => {
      // Mock successful card retrieval
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard, error: null })
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        }),
        insert: jest.fn().mockResolvedValue({ error: null })
      } as any);

      // Mock Marqeta service
      mockMarqetaService.cancelCard.mockResolvedValue({
        token: 'test-marqeta-token',
        state: 'TERMINATED'
      } as any);
    });

    it('should successfully delete a card with immediate deactivation', async () => {
      const result = await cardDeletionService.deleteCard('test-user-id', 'test-card-id');

      expect(result.deleted).toBe(true);
      expect(result.deletionProof).toBeDefined();
      expect(result.deletedAt).toBeDefined();
      expect(result.deletionId).toBeDefined();
    });

    it('should complete card deactivation within 30 seconds', async () => {
      const startTime = Date.now();
      
      await cardDeletionService.deleteCard('test-user-id', 'test-card-id');
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(30000); // 30 seconds
    });

    it('should update card status to deleted immediately', async () => {
      await cardDeletionService.deleteCard('test-user-id', 'test-card-id');

      const updateCall = mockSupabase.from().update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
          deleted_at: expect.any(String),
          network_cancellation_status: 'pending'
        })
      );
    });

    it('should throw error for non-existent card', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
            })
          })
        })
      } as any);

      await expect(cardDeletionService.deleteCard('test-user-id', 'nonexistent-card'))
        .rejects.toThrow('Card not found');
    });

    it('should throw error for already deleted card', async () => {
      const deletedCard = { ...mockCard, status: 'deleted' };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: deletedCard, error: null })
            })
          })
        })
      } as any);

      await expect(cardDeletionService.deleteCard('test-user-id', 'test-card-id'))
        .rejects.toThrow('Card is already deleted');
    });

    it('should handle network cancellation failures gracefully', async () => {
      mockMarqetaService.cancelCard.mockRejectedValue(new Error('Network error'));

      // Should still complete deletion even if network cancellation fails
      const result = await cardDeletionService.deleteCard('test-user-id', 'test-card-id');
      
      expect(result.deleted).toBe(true);
      expect(result.networkNotificationStatus).toBe('failed');
    });

    it('should generate cryptographic deletion proof', async () => {
      const result = await cardDeletionService.deleteCard('test-user-id', 'test-card-id');

      expect(result.deletionProof).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash
    });

    it('should create audit trail record', async () => {
      await cardDeletionService.deleteCard('test-user-id', 'test-card-id');

      const insertCalls = mockSupabase.from().insert;
      expect(insertCalls).toHaveBeenCalledWith(
        expect.objectContaining({
          deletion_id: expect.any(String),
          card_context_hash: 'test-context-hash'
        })
      );
    });

    it('should schedule KMS key deletion', async () => {
      await cardDeletionService.deleteCard('test-user-id', 'test-card-id');

      // Verify KMS deletion scheduling was attempted
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending'
        })
      );
    });

    it('should overwrite card data securely', async () => {
      await cardDeletionService.deleteCard('test-user-id', 'test-card-id');

      const updateCall = mockSupabase.from().update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          deletion_scheduled_at: expect.any(String)
        })
      );
    });
  });

  describe('deleteBulkCards', () => {
    const bulkRequest = {
      cardIds: ['card-1', 'card-2', 'card-3'],
      confirmationPhrase: 'DELETE ALL SELECTED'
    };

    beforeEach(() => {
      // Mock bulk deletion batch creation
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      } as any);
    });

    it('should process all cards in bulk request', async () => {
      const result = await cardDeletionService.deleteBulkCards('test-user-id', bulkRequest);

      expect(result.totalCards).toBe(3);
      expect(result.batchId).toBeDefined();
      expect(result.deletionResults).toHaveLength(3);
    });

    it('should create bulk deletion batch coordination record', async () => {
      await cardDeletionService.deleteBulkCards('test-user-id', bulkRequest);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          initiated_by: 'test-user-id',
          total_cards: 3,
          batch_status: 'in_progress'
        })
      );
    });

    it('should handle partial failures in bulk deletion', async () => {
      // Mock some cards failing to delete
      jest.spyOn(cardDeletionService, 'deleteCard')
        .mockResolvedValueOnce({
          deleted: true,
          deletionProof: 'proof-1',
          deletedAt: new Date().toISOString(),
          networkNotificationStatus: 'confirmed',
          deletionId: 'del-1'
        })
        .mockRejectedValueOnce(new Error('Deletion failed'))
        .mockResolvedValueOnce({
          deleted: true,
          deletionProof: 'proof-3',
          deletedAt: new Date().toISOString(),
          networkNotificationStatus: 'confirmed',
          deletionId: 'del-3'
        });

      const result = await cardDeletionService.deleteBulkCards('test-user-id', bulkRequest);

      expect(result.status).toBe('partially_failed');
      expect(result.deletionResults.filter(r => r.status === 'completed')).toHaveLength(2);
      expect(result.deletionResults.filter(r => r.status === 'failed')).toHaveLength(1);
    });

    it('should support scheduled bulk deletion', async () => {
      const scheduledRequest = {
        ...bulkRequest,
        scheduledDeletion: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      };

      const result = await cardDeletionService.deleteBulkCards('test-user-id', scheduledRequest);

      expect(result.batchId).toBeDefined();
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          deletion_scheduled_for: expect.any(String)
        })
      );
    });
  });

  describe('verifyDeletionProof', () => {
    const mockDeletionProof = {
      deletion_id: 'test-deletion-id',
      card_context_hash: 'test-context-hash',
      deletion_proof_hash: 'test-proof-hash',
      verification_data: {
        cardContextHash: 'test-context-hash',
        kmsKeyDeleted: true,
        dataOverwritten: true,
        networkCancelled: true,
        deletionTimestamp: new Date(),
        verificationSalt: 'test-salt'
      }
    };

    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockDeletionProof, error: null })
          })
        })
      } as any);
    });

    it('should verify valid deletion proof', async () => {
      const verification = await cardDeletionService.verifyDeletionProof('test-deletion-id');

      expect(verification.deletionId).toBe('test-deletion-id');
      expect(verification.cardContextHash).toBe('test-context-hash');
      expect(verification.completedSteps.cardDeactivated).toBe(true);
      expect(verification.completedSteps.kmsKeyDeleted).toBe(true);
      expect(verification.completedSteps.dataOverwritten).toBe(true);
      expect(verification.completedSteps.networkCancelled).toBe(true);
    });

    it('should reject invalid deletion proof', async () => {
      const invalidProof = { ...mockDeletionProof, deletion_proof_hash: 'invalid-hash' };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: invalidProof, error: null })
          })
        })
      } as any);

      const verification = await cardDeletionService.verifyDeletionProof('test-deletion-id');

      expect(verification.isValid).toBe(false);
    });

    it('should throw error for non-existent deletion proof', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
          })
        })
      } as any);

      await expect(cardDeletionService.verifyDeletionProof('nonexistent-deletion-id'))
        .rejects.toThrow('Deletion proof not found');
    });
  });

  describe('generateDeletionProof', () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: { deletion_proof_hash: 'test-proof-hash' }, 
              error: null 
            })
          })
        })
      } as any);
    });

    it('should generate deletion proof for valid context hash', async () => {
      const proofHash = await cardDeletionService.generateDeletionProof('test-context-hash');

      expect(proofHash).toBe('test-proof-hash');
    });

    it('should throw error for non-existent context hash', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
          })
        })
      } as any);

      await expect(cardDeletionService.generateDeletionProof('nonexistent-context'))
        .rejects.toThrow('Failed to generate deletion proof');
    });
  });

  describe('Error Handling', () => {
    const mockCard = {
      card_id: 'test-card-id',
      user_id: 'test-user-id',
      card_context_hash: 'test-context-hash',
      status: 'active',
      deletion_key: 'test-deletion-key'
    };

    it('should handle database connection errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockRejectedValue(new Error('Database connection failed'))
            })
          })
        })
      } as any);

      await expect(cardDeletionService.deleteCard('test-user-id', 'test-card-id'))
        .rejects.toThrow('Failed to delete card: Database connection failed');
    });

    it('should handle KMS service errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard, error: null })
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        }),
        insert: jest.fn().mockResolvedValue({ error: null })
      } as any);

      // Mock KMS failure
      jest.spyOn(cardDeletionService as any, 'scheduleKMSKeyDeletion')
        .mockRejectedValue(new Error('KMS service unavailable'));

      await expect(cardDeletionService.deleteCard('test-user-id', 'test-card-id'))
        .rejects.toThrow('Cryptographic deletion failed: KMS service unavailable');
    });

    it('should handle audit trail recording failures', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard, error: null })
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        }),
        insert: jest.fn().mockRejectedValue(new Error('Audit insert failed'))
      } as any);

      await expect(cardDeletionService.deleteCard('test-user-id', 'test-card-id'))
        .rejects.toThrow('Failed to record deletion audit');
    });
  });

  describe('Performance Tests', () => {
    it('should complete single card deletion within performance threshold', async () => {
      const mockCard = {
        card_id: 'test-card-id',
        user_id: 'test-user-id',
        card_context_hash: 'test-context-hash',
        status: 'active',
        deletion_key: 'test-deletion-key'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard, error: null })
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        }),
        insert: jest.fn().mockResolvedValue({ error: null })
      } as any);

      const startTime = Date.now();
      await cardDeletionService.deleteCard('test-user-id', 'test-card-id');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle bulk deletion of 50 cards efficiently', async () => {
      const cardIds = Array.from({ length: 50 }, (_, i) => `card-${i}`);
      const bulkRequest = {
        cardIds,
        confirmationPhrase: 'DELETE ALL SELECTED'
      };

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      } as any);

      const startTime = Date.now();
      const result = await cardDeletionService.deleteBulkCards('test-user-id', bulkRequest);
      const elapsed = Date.now() - startTime;

      expect(result.totalCards).toBe(50);
      expect(elapsed).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });

  describe('Security Tests', () => {
    it('should not delete cards belonging to other users', async () => {
      const otherUserCard = {
        card_id: 'other-card-id',
        user_id: 'other-user-id',
        card_context_hash: 'other-context-hash',
        status: 'active',
        deletion_key: 'other-deletion-key'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null })
            })
          })
        })
      } as any);

      await expect(cardDeletionService.deleteCard('test-user-id', 'other-card-id'))
        .rejects.toThrow('Card not found');
    });

    it('should generate cryptographically secure deletion proofs', async () => {
      const mockCard = {
        card_id: 'test-card-id',
        user_id: 'test-user-id',
        card_context_hash: 'test-context-hash',
        status: 'active',
        deletion_key: 'test-deletion-key'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockCard, error: null })
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        }),
        insert: jest.fn().mockResolvedValue({ error: null })
      } as any);

      const result1 = await cardDeletionService.deleteCard('test-user-id', 'test-card-id-1');
      const result2 = await cardDeletionService.deleteCard('test-user-id', 'test-card-id-2');

      // Deletion proofs should be unique
      expect(result1.deletionProof).not.toBe(result2.deletionProof);
      
      // Should be valid SHA-256 hashes
      expect(result1.deletionProof).toMatch(/^[a-f0-9]{64}$/);
      expect(result2.deletionProof).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should validate input parameters', async () => {
      await expect(cardDeletionService.deleteCard('', 'test-card-id'))
        .rejects.toThrow();

      await expect(cardDeletionService.deleteCard('test-user-id', ''))
        .rejects.toThrow();

      await expect(cardDeletionService.deleteBulkCards('test-user-id', {
        cardIds: [],
        confirmationPhrase: 'DELETE ALL SELECTED'
      })).rejects.toThrow();
    });
  });
});