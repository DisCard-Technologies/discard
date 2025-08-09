import request from 'supertest';
import app from '../../app';
import { supabase } from '../../utils/supabase';
import { MarqetaService } from '../../services/payments/marqeta.service';

// Mock external dependencies
jest.mock('../../utils/supabase');
jest.mock('../../services/payments/marqeta.service', () => ({
  MarqetaService: jest.fn().mockImplementation(() => ({
    cancelCard: jest.fn()
  }))
}));
jest.mock('../../utils/logger');

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockMarqetaInstance = {
  cancelCard: jest.fn()
};

describe('Card Deletion Integration Tests', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com'
  };

  const mockCard = {
    card_id: 'test-card-id',
    user_id: 'test-user-id',
    card_context_hash: 'test-context-hash',
    status: 'active',
    deletion_key: 'test-deletion-key',
    current_balance: 1000,
    spending_limit: 50000,
    created_at: '2023-01-01T00:00:00Z',
    visa_card_details: {
      marqeta_card_token: 'test-marqeta-token',
      provisioning_status: 'active',
      encrypted_card_number: 'encrypted-card-number',
      encrypted_cvv: 'encrypted-cvv'
    }
  };

  let authToken: string;

  beforeEach(() => {
    jest.clearAllMocks();
    authToken = 'mock-jwt-token';

    // Mock authentication middleware
    jest.doMock('../../middleware/auth.middleware', () => ({
      authMiddleware: (req: any, res: any, next: any) => {
        req.user = mockUser;
        next();
      }
    }));

    // Setup default Supabase mocks
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
    mockMarqetaInstance.cancelCard.mockResolvedValue({
      token: 'test-marqeta-token',
      state: 'TERMINATED',
      state_reason: 'CARD_DELETION_REQUEST'
    } as any);

    // Mock the constructor to return our mocked instance
    (MarqetaService as jest.MockedClass<typeof MarqetaService>).mockImplementation(() => mockMarqetaInstance as any);
  });

  describe('DELETE /api/v1/cards/:cardId', () => {
    it('should successfully delete a card with complete workflow', async () => {
      const response = await request(app)
        .delete('/api/v1/cards/test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
      expect(response.body.data.deletionProof).toBeDefined();
      expect(response.body.data.deletionId).toBeDefined();
      expect(response.body.data.deletedAt).toBeDefined();
      expect(response.body.data.networkNotificationStatus).toBeDefined();
    });

    it('should validate card ownership during deletion', async () => {
      // Mock card not found for this user
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
            })
          })
        })
      } as any);

      const response = await request(app)
        .delete('/api/v1/cards/other-user-card')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should prevent deletion of already deleted cards', async () => {
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

      const response = await request(app)
        .delete('/api/v1/cards/test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already deleted');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/v1/cards/test-card-id')
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should validate card ID format', async () => {
      const response = await request(app)
        .delete('/api/v1/cards/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid card ID format');
    });

    it('should handle network cancellation failures gracefully', async () => {
      mockMarqetaInstance.cancelCard.mockRejectedValue(new Error('Network timeout'));

      const response = await request(app)
        .delete('/api/v1/cards/test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.networkNotificationStatus).toBe('failed');
    });

    it('should complete deletion within performance threshold', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .delete('/api/v1/cards/test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      const elapsed = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('POST /api/v1/cards/bulk-delete', () => {
    const bulkDeleteRequest = {
      cardIds: ['card-1', 'card-2', 'card-3'],
      confirmationPhrase: 'DELETE ALL SELECTED'
    };

    it('should successfully process bulk card deletion', async () => {
      const response = await request(app)
        .post('/api/v1/cards/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkDeleteRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toBeDefined();
      expect(response.body.data.totalCards).toBe(3);
      expect(response.body.data.deletionResults).toHaveLength(3);
    });

    it('should validate bulk deletion request', async () => {
      const invalidRequest = {
        cardIds: [],
        confirmationPhrase: 'DELETE ALL SELECTED'
      };

      const response = await request(app)
        .post('/api/v1/cards/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('cannot be empty');
    });

    it('should require confirmation phrase for bulk deletion', async () => {
      const noConfirmationRequest = {
        cardIds: ['card-1', 'card-2'],
        confirmationPhrase: ''
      };

      const response = await request(app)
        .post('/api/v1/cards/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send(noConfirmationRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Confirmation phrase is required');
    });

    it('should enforce maximum bulk deletion limit', async () => {
      const tooManyCardsRequest = {
        cardIds: Array.from({ length: 101 }, (_, i) => `card-${i}`),
        confirmationPhrase: 'DELETE ALL SELECTED'
      };

      const response = await request(app)
        .post('/api/v1/cards/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tooManyCardsRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Maximum 100 cards');
    });

    it('should validate card ID formats in bulk request', async () => {
      const invalidIdsRequest = {
        cardIds: ['valid-uuid-here', 'invalid-id', 'another-invalid-id'],
        confirmationPhrase: 'DELETE ALL SELECTED'
      };

      const response = await request(app)
        .post('/api/v1/cards/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidIdsRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid card ID format');
      expect(response.body.details.invalidIds).toEqual(['invalid-id', 'another-invalid-id']);
    });

    it('should support scheduled bulk deletion', async () => {
      const scheduledRequest = {
        ...bulkDeleteRequest,
        scheduledDeletion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await request(app)
        .post('/api/v1/cards/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scheduledRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toBeDefined();
    });

    it('should reject past scheduled deletion dates', async () => {
      const pastDateRequest = {
        ...bulkDeleteRequest,
        scheduledDeletion: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await request(app)
        .post('/api/v1/cards/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send(pastDateRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('must be in the future');
    });
  });

  describe('GET /api/v1/cards/:cardId/deletion-proof', () => {
    it('should retrieve deletion proof for deleted card', async () => {
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

      const response = await request(app)
        .get('/api/v1/cards/test-card-id/deletion-proof')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ context: 'test-context-hash' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deletionProof).toBe('test-proof-hash');
      expect(response.body.data.generatedAt).toBeDefined();
    });

    it('should require card context hash parameter', async () => {
      const response = await request(app)
        .get('/api/v1/cards/test-card-id/deletion-proof')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Card context hash is required');
    });

    it('should handle non-existent deletion proof', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
          })
        })
      } as any);

      const response = await request(app)
        .get('/api/v1/cards/nonexistent-card/deletion-proof')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ context: 'test-context-hash' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/cards/verify-deletion-proof', () => {
    const mockVerificationData = {
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

    it('should verify valid deletion proof', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockVerificationData, error: null })
          })
        })
      } as any);

      const response = await request(app)
        .post('/api/v1/cards/verify-deletion-proof')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          deletionId: 'test-deletion-id'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deletionId).toBe('test-deletion-id');
      expect(response.body.data.isValid).toBeDefined();
      expect(response.body.data.completedSteps).toBeDefined();
    });

    it('should validate deletion ID format', async () => {
      const response = await request(app)
        .post('/api/v1/cards/verify-deletion-proof')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          deletionId: 'invalid-uuid'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Valid deletion ID is required');
    });

    it('should require deletion ID parameter', async () => {
      const response = await request(app)
        .post('/api/v1/cards/verify-deletion-proof')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Valid deletion ID is required');
    });
  });

  describe('GET /api/v1/cards/bulk-delete/:batchId', () => {
    it('should retrieve bulk deletion batch status', async () => {
      const response = await request(app)
        .get('/api/v1/cards/bulk-delete/test-batch-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toBe('test-batch-id');
      expect(response.body.data.status).toBeDefined();
    });

    it('should validate batch ID format', async () => {
      const response = await request(app)
        .get('/api/v1/cards/bulk-delete/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid batch ID format');
    });
  });

  describe('POST /api/v1/cards/bulk-delete/:batchId/cancel', () => {
    it('should cancel scheduled bulk deletion', async () => {
      const response = await request(app)
        .post('/api/v1/cards/bulk-delete/test-batch-id/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toBe('test-batch-id');
      expect(response.body.data.cancelledAt).toBeDefined();
    });

    it('should validate batch ID format for cancellation', async () => {
      const response = await request(app)
        .post('/api/v1/cards/bulk-delete/invalid-uuid/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send();

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid batch ID format');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on deletion endpoints', async () => {
      // Make multiple rapid deletion requests
      const requests = Array.from({ length: 12 }, () =>
        request(app)
          .delete('/api/v1/cards/test-card-id')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ confirmationPhrase: 'DELETE PERMANENTLY' })
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited (HTTP 429)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Complete Deletion Workflow Integration', () => {
    it('should execute complete deletion workflow with all steps', async () => {
      // Step 1: Delete card
      const deleteResponse = await request(app)
        .delete('/api/v1/cards/test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          confirmationPhrase: 'DELETE PERMANENTLY'
        });

      expect(deleteResponse.status).toBe(200);
      const { deletionId, deletionProof } = deleteResponse.body.data;

      // Step 2: Verify deletion proof
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: {
                deletion_id: deletionId,
                card_context_hash: 'test-context-hash',
                deletion_proof_hash: deletionProof,
                verification_data: {
                  cardContextHash: 'test-context-hash',
                  kmsKeyDeleted: true,
                  dataOverwritten: true,
                  networkCancelled: true,
                  deletionTimestamp: new Date(),
                  verificationSalt: 'test-salt'
                }
              }, 
              error: null 
            })
          })
        })
      } as any);

      const verifyResponse = await request(app)
        .post('/api/v1/cards/verify-deletion-proof')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          deletionId
        });

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.data.isValid).toBe(true);
      expect(verifyResponse.body.data.completedSteps.cardDeactivated).toBe(true);
      expect(verifyResponse.body.data.completedSteps.kmsKeyDeleted).toBe(true);
      expect(verifyResponse.body.data.completedSteps.dataOverwritten).toBe(true);
      expect(verifyResponse.body.data.completedSteps.networkCancelled).toBe(true);

      // Step 3: Retrieve deletion proof
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: { deletion_proof_hash: deletionProof }, 
              error: null 
            })
          })
        })
      } as any);

      const proofResponse = await request(app)
        .get('/api/v1/cards/test-card-id/deletion-proof')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ context: 'test-context-hash' });

      expect(proofResponse.status).toBe(200);
      expect(proofResponse.body.data.deletionProof).toBe(deletionProof);

      // Verify all services were called appropriately
      expect(mockMarqetaInstance.cancelCard).toHaveBeenCalledWith('test-marqeta-token');
    });
  });
});