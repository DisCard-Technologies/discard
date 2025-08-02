import { Request, Response } from 'express';
import { cardsService } from './cards.service';
import { privacyService } from './privacy.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { InputSanitizer } from '../../utils/input-sanitizer';
import { CreateCardRequest, CardListRequest } from '@discard/shared/src/types/index';

export class CardsController {
  /**
   * Create a new disposable virtual card
   * POST /api/v1/cards
   */
  async createCard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { spendingLimit, expirationDate, merchantRestrictions }: CreateCardRequest = req.body;

      // Validate required fields
      if (!spendingLimit) {
        res.status(400).json({ 
          success: false,
          error: 'Spending limit is required' 
        });
        return;
      }

      // Validate spending limit range
      if (spendingLimit < 100 || spendingLimit > 500000) {
        res.status(400).json({ 
          success: false,
          error: 'Spending limit must be between $1.00 (100 cents) and $5,000.00 (500000 cents)' 
        });
        return;
      }

      // Sanitize inputs
      const sanitizedData = {
        userId: req.user.id,
        spendingLimit,
        expirationDate: expirationDate ? InputSanitizer.sanitizeString(expirationDate) : undefined,
        merchantRestrictions: merchantRestrictions?.map((r: string) => InputSanitizer.sanitizeString(r))
      };

      const result = await cardsService.createCard(sanitizedData);

      res.status(201).json({
        success: true,
        message: 'Card created successfully',
        data: {
          card: result.card,
          cardNumber: result.cardNumber,
          cvv: result.cvv
        }
      });
    } catch (error) {
      console.error('Card creation error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Card creation failed';
      res.status(400).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * List user's cards
   * GET /api/v1/cards
   */
  async listCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { status, limit } = req.query as Partial<CardListRequest>;
      
      // Validate and sanitize query parameters
      const options: CardListRequest = {};
      
             if (status && ['active', 'paused', 'deleted'].includes(status as string)) {
         options.status = status as 'active' | 'paused' | 'deleted';
       }
      
      if (limit) {
        const limitNum = parseInt(String(limit), 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          options.limit = Math.min(limitNum, 50);
        }
      }

      const cards = await cardsService.listCards(req.user.id, options);

      res.json({
        success: true,
        data: cards,
        pagination: {
          total: cards.length,
          limit: options.limit || 50
        }
      });
    } catch (error) {
      console.error('Card listing error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve cards';
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Get card details with transaction history
   * GET /api/v1/cards/:cardId
   */
  async getCardDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { cardId } = req.params;
      
      if (!cardId) {
        res.status(400).json({ 
          success: false,
          error: 'Card ID is required' 
        });
        return;
      }

      const cardDetails = await cardsService.getCardDetails(req.user.id, cardId);

      res.json({
        success: true,
        data: cardDetails
      });
    } catch (error) {
      console.error('Card details error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve card details';
      const statusCode = errorMessage.includes('not found') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Delete card permanently
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
      
      if (!cardId) {
        res.status(400).json({ 
          success: false,
          error: 'Card ID is required' 
        });
        return;
      }

      const deletionProof = await cardsService.deleteCard(req.user.id, cardId);

      res.json({
        success: true,
        message: 'Card deleted successfully',
        data: {
          deletionProof: JSON.stringify(deletionProof)
        }
      });
    } catch (error) {
      console.error('Card deletion error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete card';
      const statusCode = errorMessage.includes('not found') ? 404 : 
                        errorMessage.includes('already deleted') ? 409 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Update card status (pause/resume)
   * PUT /api/v1/cards/:cardId/status
   */
  async updateCardStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { cardId } = req.params;
      const { status } = req.body;
      
      if (!cardId) {
        res.status(400).json({ 
          success: false,
          error: 'Card ID is required' 
        });
        return;
      }

      if (!status || !['active', 'paused'].includes(status)) {
        res.status(400).json({ 
          success: false,
          error: 'Valid status is required (active or paused)' 
        });
        return;
      }

      const updatedCard = await cardsService.updateCardStatus(req.user.id, cardId, status);

      res.json({
        success: true,
        message: `Card ${status === 'active' ? 'activated' : 'paused'} successfully`,
        data: updatedCard
      });
    } catch (error) {
      console.error('Card status update error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to update card status';
      const statusCode = errorMessage.includes('not found') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Get card credentials for secure display
   * GET /api/v1/cards/:cardId/credentials
   */
  async getCardCredentials(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { cardId } = req.params;
      
      if (!cardId) {
        res.status(400).json({ 
          success: false,
          error: 'Card ID is required' 
        });
        return;
      }

      const credentials = await cardsService.getCardCredentials(req.user.id, cardId);

      res.json({
        success: true,
        data: credentials
      });
    } catch (error) {
      console.error('Card credentials error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve card credentials';
      const statusCode = errorMessage.includes('not found') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Get card privacy status
   * GET /api/v1/cards/:cardId/privacy-status
   */
  async getPrivacyStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { cardId } = req.params;
      
      if (!cardId) {
        res.status(400).json({ 
          success: false,
          error: 'Card ID is required' 
        });
        return;
      }

      // Get card to verify ownership and status
      const cardDetails = await cardsService.getCardDetails(req.user.id, cardId);
      
      res.json({
        success: true,
        data: {
          cardId,
          privacyIsolated: true,
          encryptionStatus: 'active',
          deletionVerifiable: cardDetails.card.status !== 'deleted',
          status: cardDetails.card.status
        }
      });
    } catch (error) {
      console.error('Privacy status error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve privacy status';
      const statusCode = errorMessage.includes('not found') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Health check for cards service
   * GET /api/v1/cards/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      message: 'Cards service is healthy',
      timestamp: new Date().toISOString()
    });
  }
}

export const cardsController = new CardsController();