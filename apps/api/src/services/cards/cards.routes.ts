import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { cardsController } from './cards.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

// Rate limiting for card operations
const cardRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: {
    success: false,
    error: 'Too many card requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const cardCreationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 card creations per hour per IP
  message: {
    success: false,
    error: 'Too many card creation attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const cardDeletionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 deletions per hour per IP
  message: {
    success: false,
    error: 'Too many card deletion attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint (no auth required)
router.get('/health', cardRateLimit, cardsController.healthCheck.bind(cardsController));

// All card endpoints require authentication
router.use(authenticateToken);

// Card management endpoints
router.post('/', cardCreationRateLimit, cardsController.createCard.bind(cardsController));
router.get('/', cardRateLimit, cardsController.listCards.bind(cardsController));
router.get('/:cardId', cardRateLimit, cardsController.getCardDetails.bind(cardsController));
router.delete('/:cardId', cardDeletionRateLimit, cardsController.deleteCard.bind(cardsController));
router.put('/:cardId/status', cardRateLimit, cardsController.updateCardStatus.bind(cardsController));

// Secure endpoints for card credentials and privacy
router.get('/:cardId/credentials', cardRateLimit, cardsController.getCardCredentials.bind(cardsController));
router.get('/:cardId/privacy-status', cardRateLimit, cardsController.getPrivacyStatus.bind(cardsController));

export default router;