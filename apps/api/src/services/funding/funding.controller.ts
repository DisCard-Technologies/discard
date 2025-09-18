import { Request, Response } from 'express';
import { fundingService } from './funding.service';
import { balanceService } from './balance.service';
import { stripeService } from './stripe.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { InputSanitizer } from '../../utils/input-sanitizer';
import { 
  AccountFundingRequest, 
  CardAllocationRequest, 
  CardTransferRequest,
  FundingRequestOptions 
} from '@discard/shared/src/types/funding';
import { 
  validateStripePaymentMethodId, 
  validateCurrency,
  validateNotificationThreshold 
} from '@discard/shared/src/utils/validation';
import { validateCardId } from '@discard/shared/src/utils/funding';

export class FundingController {
  /**
   * Fund account with traditional payment methods
   * POST /api/v1/funding/account
   */
  async fundAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { amount, paymentMethodId, currency }: AccountFundingRequest = req.body;

      // Validate required fields
      if (!amount || !paymentMethodId) {
        res.status(400).json({ 
          success: false,
          error: 'Amount and payment method ID are required' 
        });
        return;
      }

      // Validate payment method ID
      const paymentMethodValidation = validateStripePaymentMethodId(paymentMethodId);
      if (!paymentMethodValidation.isValid) {
        res.status(400).json({ 
          success: false,
          error: paymentMethodValidation.error 
        });
        return;
      }

      // Validate currency if provided
      if (currency) {
        const currencyValidation = validateCurrency(currency);
        if (!currencyValidation.isValid) {
          res.status(400).json({ 
            success: false,
            error: currencyValidation.error 
          });
          return;
        }
      }

      // Sanitize inputs
      const sanitizedRequest: AccountFundingRequest = {
        amount: parseInt(String(amount), 10),
        paymentMethodId: InputSanitizer.sanitizeString(paymentMethodId),
        currency: currency ? InputSanitizer.sanitizeString(currency).toUpperCase() : undefined,
      };

      const transaction = await fundingService.fundAccount(req.user.id, sanitizedRequest);

      res.status(201).json({
        success: true,
        message: 'Account funding initiated successfully',
        data: {
          transaction,
        }
      });
    } catch (error) {
      console.error('Account funding error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Account funding failed';
      res.status(400).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Allocate funds to a specific card
   * POST /api/v1/funding/card/{cardId}
   */
  async allocateToCard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { cardId } = req.params;
      const { amount }: { amount: number } = req.body;

      // Validate card ID
      const cardIdValidation = validateCardId(cardId);
      if (!cardIdValidation.isValid) {
        res.status(400).json({ 
          success: false,
          error: cardIdValidation.error 
        });
        return;
      }

      // Validate required fields
      if (!amount) {
        res.status(400).json({ 
          success: false,
          error: 'Amount is required' 
        });
        return;
      }

      // Sanitize inputs
      const sanitizedRequest: CardAllocationRequest = {
        cardId: InputSanitizer.sanitizeString(cardId),
        amount: parseInt(String(amount), 10),
      };

      const transaction = await fundingService.allocateToCard(req.user.id, sanitizedRequest);

      res.status(201).json({
        success: true,
        message: 'Card allocation completed successfully',
        data: {
          transaction,
        }
      });
    } catch (error) {
      console.error('Card allocation error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Card allocation failed';
      const statusCode = errorMessage.includes('not found') ? 404 : 
                        errorMessage.includes('Insufficient') ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Transfer funds between cards
   * POST /api/v1/funding/transfer
   */
  async transferBetweenCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { fromCardId, toCardId, amount }: CardTransferRequest = req.body;

      // Validate required fields
      if (!fromCardId || !toCardId || !amount) {
        res.status(400).json({ 
          success: false,
          error: 'From card ID, to card ID, and amount are required' 
        });
        return;
      }

      // Validate card IDs
      const fromCardValidation = validateCardId(fromCardId);
      if (!fromCardValidation.isValid) {
        res.status(400).json({ 
          success: false,
          error: `Source card: ${fromCardValidation.error}` 
        });
        return;
      }

      const toCardValidation = validateCardId(toCardId);
      if (!toCardValidation.isValid) {
        res.status(400).json({ 
          success: false,
          error: `Target card: ${toCardValidation.error}` 
        });
        return;
      }

      // Ensure cards are different
      if (fromCardId === toCardId) {
        res.status(400).json({ 
          success: false,
          error: 'Source and target cards must be different' 
        });
        return;
      }

      // Sanitize inputs
      const sanitizedRequest: CardTransferRequest = {
        fromCardId: InputSanitizer.sanitizeString(fromCardId),
        toCardId: InputSanitizer.sanitizeString(toCardId),
        amount: parseInt(String(amount), 10),
      };

      const transaction = await fundingService.transferBetweenCards(req.user.id, sanitizedRequest);

      res.status(201).json({
        success: true,
        message: 'Card transfer completed successfully',
        data: {
          transaction,
        }
      });
    } catch (error) {
      console.error('Card transfer error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Card transfer failed';
      const statusCode = errorMessage.includes('not found') ? 404 : 
                        errorMessage.includes('Insufficient') ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Get account balance and funding information
   * GET /api/v1/funding/balance
   */
  async getBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const accountBalance = await balanceService.getAccountBalance(req.user.id);
      const notificationThresholds = await balanceService.getNotificationThresholds(req.user.id);

      res.json({
        success: true,
        data: {
          balance: accountBalance,
          notificationThresholds,
        }
      });
    } catch (error) {
      console.error('Balance retrieval error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve balance';
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Get funding transaction history
   * GET /api/v1/funding/transactions
   */
  async getFundingTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { status, type, limit, offset, startDate, endDate } = req.query;
      
      // Validate and sanitize query parameters
      const options: FundingRequestOptions = {};
      
      if (status && ['pending', 'processing', 'completed', 'failed'].includes(status as string)) {
        options.status = status as any;
      }
      
      if (type && ['account_funding', 'card_allocation', 'card_transfer'].includes(type as string)) {
        options.type = type as any;
      }
      
      if (limit) {
        const limitNum = parseInt(String(limit), 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          options.limit = Math.min(limitNum, 100); // Max 100 transactions per request
        }
      }
      
      if (offset) {
        const offsetNum = parseInt(String(offset), 10);
        if (!isNaN(offsetNum) && offsetNum >= 0) {
          options.offset = offsetNum;
        }
      }
      
      if (startDate && typeof startDate === 'string') {
        options.startDate = InputSanitizer.sanitizeString(startDate);
      }
      
      if (endDate && typeof endDate === 'string') {
        options.endDate = InputSanitizer.sanitizeString(endDate);
      }

      const transactions = await fundingService.getFundingTransactions(req.user.id, options);

      res.json({
        success: true,
        data: transactions,
        pagination: {
          total: transactions.length,
          limit: options.limit || 50,
          offset: options.offset || 0,
        }
      });
    } catch (error) {
      console.error('Funding transactions retrieval error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve funding transactions';
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Update notification thresholds
   * PUT /api/v1/funding/notifications
   */
  async updateNotificationThresholds(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { accountThreshold, cardThreshold, enableNotifications, notificationMethods } = req.body;

      // Validate thresholds if provided
      if (accountThreshold !== undefined) {
        const accountValidation = validateNotificationThreshold(accountThreshold);
        if (!accountValidation.isValid) {
          res.status(400).json({ 
            success: false,
            error: `Account threshold: ${accountValidation.error}` 
          });
          return;
        }
      }

      if (cardThreshold !== undefined) {
        const cardValidation = validateNotificationThreshold(cardThreshold);
        if (!cardValidation.isValid) {
          res.status(400).json({ 
            success: false,
            error: `Card threshold: ${cardValidation.error}` 
          });
          return;
        }
      }

      // Validate notification methods if provided
      if (notificationMethods && Array.isArray(notificationMethods)) {
        const validMethods = ['email', 'push', 'sms'];
        const invalidMethods = notificationMethods.filter(method => !validMethods.includes(method));
        if (invalidMethods.length > 0) {
          res.status(400).json({ 
            success: false,
            error: `Invalid notification methods: ${invalidMethods.join(', ')}` 
          });
          return;
        }
      }

      // Sanitize inputs
      const updateData: any = {};
      
      if (accountThreshold !== undefined) {
        updateData.accountThreshold = parseInt(String(accountThreshold), 10);
      }
      
      if (cardThreshold !== undefined) {
        updateData.cardThreshold = parseInt(String(cardThreshold), 10);
      }
      
      if (enableNotifications !== undefined) {
        updateData.enableNotifications = Boolean(enableNotifications);
      }
      
      if (notificationMethods) {
        updateData.notificationMethods = notificationMethods.map((method: string) => 
          InputSanitizer.sanitizeString(method)
        );
      }

      const updatedThresholds = await balanceService.updateNotificationThresholds(req.user.id, updateData);

      res.json({
        success: true,
        message: 'Notification thresholds updated successfully',
        data: updatedThresholds
      });
    } catch (error) {
      console.error('Notification thresholds update error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to update notification thresholds';
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Process Stripe webhooks
   * POST /api/v1/funding/webhooks/stripe
   */
  async handleStripeWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string;
      
      if (!signature) {
        res.status(400).json({ 
          success: false,
          error: 'Missing Stripe signature' 
        });
        return;
      }

      // Validate webhook signature and construct event
      const event = stripeService.validateWebhookSignature(req.body, signature);

      // Process the webhook event
      await fundingService.processStripeWebhook(event);

      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Webhook processing failed';
      res.status(400).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Add a new funding source
   * POST /api/v1/funding/sources
   */
  async addFundingSource(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { sourceType, sourceIdentifier } = req.body;

      if (!sourceType || !sourceIdentifier) {
        res.status(400).json({ 
          success: false,
          error: 'sourceType and sourceIdentifier are required' 
        });
        return;
      }

      // TODO: Add validation for sourceType and sourceIdentifier (e.g., check for valid address format)

      const sanitizedRequest = {
        sourceType: InputSanitizer.sanitizeString(sourceType),
        sourceIdentifier: InputSanitizer.sanitizeString(sourceIdentifier),
      };

      const fundingSource = await fundingService.addFundingSource(req.user.id, sanitizedRequest);

      res.status(201).json({
        success: true,
        message: 'Funding source added successfully',
        data: fundingSource
      });
    } catch (error) {
      console.error('Add funding source error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to add funding source';
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Health check for funding service
   * GET /api/v1/funding/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      message: 'Funding service is healthy',
      timestamp: new Date().toISOString()
    });
  }
}

export const fundingController = new FundingController();