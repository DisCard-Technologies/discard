import { Router } from 'express';
import { cardDeletionController } from '../../controllers/cards/card-deletion.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rateLimitMiddleware } from '../../middleware/rate-limiting.middleware';

const router = Router();

// Apply authentication to all deletion routes
router.use(authMiddleware);

// Apply stricter rate limiting for deletion operations
const deletionRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: {
    success: false,
    error: 'Too many deletion requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

/**
 * @route   DELETE /api/v1/cards/:cardId
 * @desc    Delete a single card with cryptographic deletion
 * @access  Private
 */
router.delete(
  '/:cardId',
  deletionRateLimit,
  cardDeletionController.deleteCard.bind(cardDeletionController)
);

/**
 * @route   POST /api/v1/cards/bulk-delete
 * @desc    Delete multiple cards in bulk operation
 * @access  Private
 */
router.post(
  '/bulk-delete',
  deletionRateLimit,
  cardDeletionController.bulkDeleteCards.bind(cardDeletionController)
);

/**
 * @route   GET /api/v1/cards/:cardId/deletion-proof
 * @desc    Get deletion proof for a card
 * @access  Private
 */
router.get(
  '/:cardId/deletion-proof',
  cardDeletionController.getDeletionProof.bind(cardDeletionController)
);

/**
 * @route   POST /api/v1/cards/verify-deletion-proof
 * @desc    Verify deletion proof authenticity
 * @access  Private
 */
router.post(
  '/verify-deletion-proof',
  cardDeletionController.verifyDeletionProof.bind(cardDeletionController)
);

/**
 * @route   GET /api/v1/cards/bulk-delete/:batchId
 * @desc    Get bulk deletion batch status
 * @access  Private
 */
router.get(
  '/bulk-delete/:batchId',
  cardDeletionController.getBulkDeletionStatus.bind(cardDeletionController)
);

/**
 * @route   POST /api/v1/cards/bulk-delete/:batchId/cancel
 * @desc    Cancel scheduled bulk deletion
 * @access  Private
 */
router.post(
  '/bulk-delete/:batchId/cancel',
  deletionRateLimit,
  cardDeletionController.cancelBulkDeletion.bind(cardDeletionController)
);

export default router;