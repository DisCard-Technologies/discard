import { Request, Response } from 'express';
import { transactionSearchService } from '../../services/transactions/transaction-search.service';
import { logger } from '../../utils/logger';

export class TransactionSearchController {
  /**
   * GET /api/v1/cards/{cardId}/transactions/search
   * Search transactions within card context with privacy protection
   */
  async searchTransactions(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const { 
        merchantName, 
        minAmount, 
        maxAmount, 
        merchantCategory 
      } = req.query;

      // Validate search parameters
      if (!merchantName && !minAmount && !maxAmount && !merchantCategory) {
        return res.status(400).json({ 
          error: 'At least one search parameter is required' 
        });
      }

      // Validate amount range if provided
      if (minAmount && maxAmount) {
        const min = parseInt(minAmount as string);
        const max = parseInt(maxAmount as string);
        if (isNaN(min) || isNaN(max) || min > max) {
          return res.status(400).json({ 
            error: 'Invalid amount range' 
          });
        }
      }

      const searchParams = {
        merchantName: merchantName as string,
        minAmount: minAmount ? parseInt(minAmount as string) : undefined,
        maxAmount: maxAmount ? parseInt(maxAmount as string) : undefined,
        merchantCategory: merchantCategory as string
      };

      const results = await transactionSearchService.searchTransactions({
        cardId,
        userId: req.user!.id,
        searchParams
      });

      // Return 404 for unauthorized access (privacy-preserving)
      if (!results) {
        return res.status(404).json({ error: 'Card not found' });
      }

      res.json(results);
    } catch (error) {
      logger.error('Error searching transactions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const transactionSearchController = new TransactionSearchController();