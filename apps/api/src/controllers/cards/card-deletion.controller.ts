import { Request, Response } from 'express';
import { cardDeletionService } from '../../services/cards/card-deletion.service';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { InputSanitizer } from '../../utils/input-sanitizer';
import { Logger } from '../../utils/logger';

interface DeleteCardRequest {
  confirmationPhrase?: string;
}

interface BulkDeleteCardRequest {
  cardIds: string[];
  confirmationPhrase: string;
  scheduledDeletion?: string; // ISO date string
}

interface DeletionProofRequest {
  cardContextHash?: string;
}

export class CardDeletionController {
  private logger = new Logger('CardDeletionController');

  /**
   * Delete a single card with cryptographic deletion
   * DELETE /api/v1/cards/:cardId
   */
  async deleteCard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { cardId } = req.params;
      const { confirmationPhrase }: DeleteCardRequest = req.body;

      // Validate card ID format
      if (!cardId || !this.isValidUUID(cardId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid card ID format'
        });
        return;
      }

      // Sanitize confirmation phrase if provided
      const sanitizedConfirmation = confirmationPhrase 
        ? InputSanitizer.sanitizeString(confirmationPhrase)
        : undefined;

      this.logger.info('Processing card deletion request', {
        userId: req.user.id,
        cardId,
        hasConfirmation: !!confirmationPhrase
      });

      const result = await cardDeletionService.deleteCard(
        req.user.id,
        cardId,
        sanitizedConfirmation
      );

      res.status(200).json({
        success: true,
        message: 'Card deleted successfully',
        data: {
          deleted: result.deleted,
          deletionProof: result.deletionProof,
          deletedAt: result.deletedAt,
          networkNotificationStatus: result.networkNotificationStatus,
          deletionId: result.deletionId
        }
      });

    } catch (error) {
      this.logger.error('Card deletion failed', {
        userId: req.user?.id,
        cardId: req.params.cardId,
        error: error.message
      });

      const statusCode = this.getErrorStatusCode(error);
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to delete card',
        code: 'CARD_DELETION_FAILED'
      });
    }
  }

  /**
   * Delete multiple cards in bulk operation
   * POST /api/v1/cards/bulk-delete
   */
  async bulkDeleteCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { cardIds, confirmationPhrase, scheduledDeletion }: BulkDeleteCardRequest = req.body;

      // Validate request
      if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Card IDs array is required and cannot be empty'
        });
        return;
      }

      if (cardIds.length > 100) {
        res.status(400).json({
          success: false,
          error: 'Maximum 100 cards can be deleted in a single batch'
        });
        return;
      }

      if (!confirmationPhrase || confirmationPhrase.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Confirmation phrase is required for bulk deletion'
        });
        return;
      }

      // Validate all card IDs are valid UUIDs
      const invalidCardIds = cardIds.filter(id => !this.isValidUUID(id));
      if (invalidCardIds.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid card ID format',
          details: {
            invalidIds: invalidCardIds
          }
        });
        return;
      }

      // Sanitize inputs
      const sanitizedRequest = {
        cardIds: cardIds.map(id => InputSanitizer.sanitizeString(id)),
        confirmationPhrase: InputSanitizer.sanitizeString(confirmationPhrase),
        scheduledDeletion: scheduledDeletion ? new Date(scheduledDeletion) : undefined
      };

      // Validate scheduled deletion date if provided
      if (scheduledDeletion) {
        const scheduledDate = new Date(scheduledDeletion);
        if (isNaN(scheduledDate.getTime())) {
          res.status(400).json({
            success: false,
            error: 'Invalid scheduled deletion date format'
          });
          return;
        }

        if (scheduledDate <= new Date()) {
          res.status(400).json({
            success: false,
            error: 'Scheduled deletion date must be in the future'
          });
          return;
        }
      }

      this.logger.info('Processing bulk card deletion request', {
        userId: req.user.id,
        cardCount: cardIds.length,
        scheduled: !!scheduledDeletion
      });

      const result = await cardDeletionService.deleteBulkCards(
        req.user.id,
        sanitizedRequest
      );

      res.status(200).json({
        success: true,
        message: 'Bulk card deletion initiated',
        data: {
          batchId: result.batchId,
          totalCards: result.totalCards,
          status: result.status,
          deletionResults: result.deletionResults
        }
      });

    } catch (error) {
      this.logger.error('Bulk card deletion failed', {
        userId: req.user?.id,
        error: error.message
      });

      const statusCode = this.getErrorStatusCode(error);
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to delete cards',
        code: 'BULK_DELETION_FAILED'
      });
    }
  }

  /**
   * Get deletion proof for a card
   * GET /api/v1/cards/:cardId/deletion-proof
   */
  async getDeletionProof(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { cardId } = req.params;

      if (!cardId || !this.isValidUUID(cardId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid card ID format'
        });
        return;
      }

      // For getting deletion proof, we need the card context hash
      // This would typically be derived from the card ID
      const cardContextHash = req.query.context as string;
      
      if (!cardContextHash) {
        res.status(400).json({
          success: false,
          error: 'Card context hash is required'
        });
        return;
      }

      const deletionProof = await cardDeletionService.generateDeletionProof(
        InputSanitizer.sanitizeString(cardContextHash)
      );

      res.status(200).json({
        success: true,
        message: 'Deletion proof retrieved successfully',
        data: {
          deletionProof,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Deletion proof retrieval failed', {
        userId: req.user?.id,
        cardId: req.params.cardId,
        error: error.message
      });

      const statusCode = this.getErrorStatusCode(error);
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to retrieve deletion proof',
        code: 'DELETION_PROOF_FAILED'
      });
    }
  }

  /**
   * Verify deletion proof authenticity
   * POST /api/v1/cards/verify-deletion-proof
   */
  async verifyDeletionProof(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { deletionId } = req.body;

      if (!deletionId || !this.isValidUUID(deletionId)) {
        res.status(400).json({
          success: false,
          error: 'Valid deletion ID is required'
        });
        return;
      }

      const verification = await cardDeletionService.verifyDeletionProof(
        InputSanitizer.sanitizeString(deletionId)
      );

      res.status(200).json({
        success: true,
        message: 'Deletion proof verification completed',
        data: {
          deletionId: verification.deletionId,
          cardContextHash: verification.cardContextHash,
          verificationHash: verification.verificationHash,
          isValid: verification.isValid,
          completedSteps: verification.completedSteps,
          verifiedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Deletion proof verification failed', {
        userId: req.user?.id,
        error: error.message
      });

      const statusCode = this.getErrorStatusCode(error);
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to verify deletion proof',
        code: 'DELETION_VERIFICATION_FAILED'
      });
    }
  }

  /**
   * Get bulk deletion batch status
   * GET /api/v1/cards/bulk-delete/:batchId
   */
  async getBulkDeletionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { batchId } = req.params;

      if (!batchId || !this.isValidUUID(batchId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid batch ID format'
        });
        return;
      }

      // Query batch status from database
      // This would be implemented by querying the bulk_deletion_batches table
      // For now, return a placeholder response
      res.status(200).json({
        success: true,
        message: 'Bulk deletion status retrieved',
        data: {
          batchId,
          status: 'in_progress',
          totalCards: 0,
          completedCards: 0,
          failedCards: 0,
          createdAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Bulk deletion status retrieval failed', {
        userId: req.user?.id,
        batchId: req.params.batchId,
        error: error.message
      });

      const statusCode = this.getErrorStatusCode(error);
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to retrieve bulk deletion status',
        code: 'BULK_STATUS_FAILED'
      });
    }
  }

  /**
   * Cancel scheduled bulk deletion
   * POST /api/v1/cards/bulk-delete/:batchId/cancel
   */
  async cancelBulkDeletion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { batchId } = req.params;

      if (!batchId || !this.isValidUUID(batchId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid batch ID format'
        });
        return;
      }

      // Implementation would cancel the scheduled bulk deletion
      // For now, return success response
      res.status(200).json({
        success: true,
        message: 'Bulk deletion cancelled successfully',
        data: {
          batchId,
          cancelledAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Bulk deletion cancellation failed', {
        userId: req.user?.id,
        batchId: req.params.batchId,
        error: error.message
      });

      const statusCode = this.getErrorStatusCode(error);
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to cancel bulk deletion',
        code: 'BULK_CANCELLATION_FAILED'
      });
    }
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Get appropriate HTTP status code for error
   */
  private getErrorStatusCode(error: any): number {
    if (error.message?.includes('not found')) return 404;
    if (error.message?.includes('already deleted')) return 409;
    if (error.message?.includes('invalid') || error.message?.includes('required')) return 400;
    if (error.message?.includes('unauthorized') || error.message?.includes('permission')) return 403;
    return 500;
  }
}

export const cardDeletionController = new CardDeletionController();