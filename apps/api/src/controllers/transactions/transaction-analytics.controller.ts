import { Request, Response } from 'express';
import { transactionAnalyticsService } from '../../services/transactions/transaction-analytics.service';
import { logger } from '../../utils/logger';

export class TransactionAnalyticsController {
  /**
   * GET /api/v1/cards/{cardId}/analytics
   * Get real-time spending analytics for a specific card
   */
  async getCardAnalytics(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const { period = '30' } = req.query;

      // Validate period
      const periodDays = parseInt(period as string);
      if (isNaN(periodDays) || periodDays < 1 || periodDays > 90) {
        return res.status(400).json({ 
          error: 'Invalid period. Must be between 1 and 90 days' 
        });
      }

      const analytics = await transactionAnalyticsService.getCardAnalytics({
        cardId,
        userId: req.user!.id,
        periodDays
      });

      // Return 404 for unauthorized access (privacy-preserving)
      if (!analytics) {
        return res.status(404).json({ error: 'Card not found' });
      }

      res.json({
        cardId,
        period: periodDays,
        analytics,
        privacyNotice: 'Analytics are computed in real-time and not stored or correlated across cards'
      });
    } catch (error) {
      logger.error('Error fetching card analytics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const transactionAnalyticsController = new TransactionAnalyticsController();