import { Request, Response } from 'express';
import { transactionHistoryService } from '../../services/transactions/transaction-history.service';
import { validatePaginationParams, validateDateRange } from '../../utils/validators';
import { logger } from '../../utils/logger';

export class TransactionHistoryController {
  /**
   * GET /api/v1/cards/{cardId}/transactions
   * Get paginated transaction history for a specific card
   */
  async getCardTransactions(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const { 
        page = '1', 
        limit = '20', 
        status, 
        startDate, 
        endDate 
      } = req.query;

      // Validate pagination
      const paginationParams = validatePaginationParams(
        parseInt(page as string), 
        parseInt(limit as string),
        100 // max limit
      );

      // Validate date range if provided
      if (startDate || endDate) {
        const dateValidation = validateDateRange(
          startDate as string, 
          endDate as string,
          90 // max 90 days
        );
        if (!dateValidation.valid) {
          return res.status(400).json({ 
            error: 'Invalid date range', 
            details: dateValidation.errors 
          });
        }
      }

      // Get transactions with privacy isolation
      const result = await transactionHistoryService.getCardTransactions({
        cardId,
        userId: req.user!.id,
        pagination: paginationParams,
        filters: {
          status: status as string,
          startDate: startDate as string,
          endDate: endDate as string
        }
      });

      // Return 404 for unauthorized access (privacy-preserving)
      if (!result) {
        return res.status(404).json({ error: 'Card not found' });
      }

      res.json(result);
    } catch (error) {
      logger.error('Error fetching card transactions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/v1/transactions/{transactionId}
   * Get detailed transaction information with privacy protection
   */
  async getTransactionDetail(req: Request, res: Response) {
    try {
      const { transactionId } = req.params;
      const userId = req.user!.id;

      const transaction = await transactionHistoryService.getTransactionDetail(
        transactionId,
        userId
      );

      // Return 404 for unauthorized access (privacy-preserving)
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json(transaction);
    } catch (error) {
      logger.error('Error fetching transaction detail:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const transactionHistoryController = new TransactionHistoryController();