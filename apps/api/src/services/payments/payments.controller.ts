import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { VisaService } from './visa.service';
import { AuthorizationService } from './authorization.service';
import { RestrictionsService } from './restrictions.service';
import { Logger } from '../../utils/logger';

interface MarqetaErrorResponse {
  error_code: string;
  error_message: string;
  details?: any;
}

export class PaymentsController {
  private visaService = new VisaService();
  private authorizationService = new AuthorizationService();
  private restrictionsService = new RestrictionsService();
  private logger = new Logger('PaymentsController');

  /**
   * Process authorization request
   * POST /api/v1/payments/authorize
   */
  async processAuthorization(req: Request, res: Response): Promise<void> {
    try {
      const {
        cardContext,
        marqetaTransactionToken,
        merchantName,
        merchantCategoryCode,
        amount,
        currencyCode = 'USD',
        merchantLocation
      } = req.body;

      // Validate required fields
      if (!cardContext || !marqetaTransactionToken || !merchantName || !merchantCategoryCode || !amount) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: cardContext, marqetaTransactionToken, merchantName, merchantCategoryCode, amount'
        });
        return;
      }

      // Process authorization
      const authResult = await this.authorizationService.processAuthorization({
        cardContext,
        marqetaTransactionToken,
        merchantName,
        merchantCategoryCode,
        amount,
        currencyCode,
        merchantLocation
      });

      const statusCode = authResult.approved ? 200 : 202; // 202 for declined transactions

      res.status(statusCode).json({
        success: true,
        data: {
          approved: authResult.approved,
          authorizationCode: authResult.authorizationCode,
          declineReason: authResult.declineReason,
          declineCode: authResult.declineCode,
          holdId: authResult.holdId,
          responseTimeMs: authResult.responseTimeMs
        }
      });
    } catch (error) {
      this.logger.error('Authorization processing failed', { error, body: req.body });
      
      res.status(500).json({
        success: false,
        error: 'Authorization processing failed',
        data: {
          approved: false,
          declineCode: 'PROCESSING_ERROR',
          declineReason: 'Internal processing error'
        }
      });
    }
  }

  /**
   * Clear authorization hold
   * POST /api/v1/payments/holds/:holdId/clear
   */
  async clearHold(req: Request, res: Response): Promise<void> {
    try {
      const { holdId } = req.params;
      const { settledAmount } = req.body;

      if (!holdId) {
        res.status(400).json({
          success: false,
          error: 'Hold ID is required'
        });
        return;
      }

      await this.authorizationService.clearAuthorizationHold(holdId, settledAmount);

      res.json({
        success: true,
        message: 'Authorization hold cleared successfully'
      });
    } catch (error) {
      this.logger.error('Failed to clear hold', { error, holdId: req.params.holdId });
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear hold';
      const statusCode = errorMessage.includes('not found') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Reverse authorization hold
   * POST /api/v1/payments/holds/:holdId/reverse
   */
  async reverseHold(req: Request, res: Response): Promise<void> {
    try {
      const { holdId } = req.params;

      if (!holdId) {
        res.status(400).json({
          success: false,
          error: 'Hold ID is required'
        });
        return;
      }

      await this.authorizationService.reverseAuthorizationHold(holdId);

      res.json({
        success: true,
        message: 'Authorization hold reversed successfully'
      });
    } catch (error) {
      this.logger.error('Failed to reverse hold', { error, holdId: req.params.holdId });
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to reverse hold';
      const statusCode = errorMessage.includes('not found') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Get active authorization holds for a card
   * GET /api/v1/payments/cards/:cardContext/holds
   */
  async getActiveHolds(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { cardContext } = req.params;

      if (!cardContext) {
        res.status(400).json({
          success: false,
          error: 'Card context is required'
        });
        return;
      }

      const holds = await this.authorizationService.getActiveHolds(cardContext);

      res.json({
        success: true,
        data: {
          holds,
          count: holds.length
        }
      });
    } catch (error) {
      this.logger.error('Failed to get active holds', { error, cardContext: req.params.cardContext });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve authorization holds'
      });
    }
  }

  /**
   * Get card restrictions
   * GET /api/v1/payments/cards/:cardContext/restrictions
   */
  async getCardRestrictions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { cardContext } = req.params;

      if (!cardContext) {
        res.status(400).json({
          success: false,
          error: 'Card context is required'
        });
        return;
      }

      const restrictions = await this.restrictionsService.getCardRestrictions(cardContext);
      const templates = this.restrictionsService.getAvailableTemplates();

      res.json({
        success: true,
        data: {
          restrictions,
          availableTemplates: templates,
          count: restrictions.length
        }
      });
    } catch (error) {
      this.logger.error('Failed to get card restrictions', { error, cardContext: req.params.cardContext });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve card restrictions'
      });
    }
  }

  /**
   * Validate transaction against restrictions
   * POST /api/v1/payments/validate-transaction
   */
  async validateTransaction(req: Request, res: Response): Promise<void> {
    try {
      const {
        cardContext,
        merchantCategoryCode,
        countryCode,
        merchantName
      } = req.body;

      if (!cardContext || !merchantCategoryCode || !countryCode) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: cardContext, merchantCategoryCode, countryCode'
        });
        return;
      }

      const validationResult = await this.restrictionsService.validateTransaction(
        cardContext,
        merchantCategoryCode,
        countryCode,
        merchantName
      );

      res.json({
        success: true,
        data: validationResult
      });
    } catch (error) {
      this.logger.error('Transaction validation failed', { error, body: req.body });
      
      res.status(500).json({
        success: false,
        error: 'Transaction validation failed'
      });
    }
  }

  /**
   * Get merchant category information
   * GET /api/v1/payments/merchant-categories/:mcc
   */
  async getMerchantCategoryInfo(req: Request, res: Response): Promise<void> {
    try {
      const { mcc } = req.params;

      if (!mcc || !/^\d{4}$/.test(mcc)) {
        res.status(400).json({
          success: false,
          error: 'Valid 4-digit MCC code is required'
        });
        return;
      }

      const categoryInfo = this.restrictionsService.getMerchantCategoryInfo(mcc);

      res.json({
        success: true,
        data: {
          mcc,
          ...categoryInfo
        }
      });
    } catch (error) {
      this.logger.error('Failed to get MCC info', { error, mcc: req.params.mcc });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve merchant category information'
      });
    }
  }

  /**
   * Expire old authorization holds (maintenance endpoint)
   * POST /api/v1/payments/maintenance/expire-holds
   */
  async expireOldHolds(req: Request, res: Response): Promise<void> {
    try {
      const expiredCount = await this.authorizationService.expireOldHolds();

      res.json({
        success: true,
        message: `Expired ${expiredCount} old authorization holds`,
        data: {
          expiredCount
        }
      });
    } catch (error) {
      this.logger.error('Failed to expire holds', { error });
      
      res.status(500).json({
        success: false,
        error: 'Failed to expire old holds'
      });
    }
  }

  /**
   * Get payment processing health
   * GET /api/v1/payments/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const networkStatus = await this.visaService.checkNetworkStatus();

      res.json({
        success: true,
        message: 'Payment processing service is healthy',
        data: {
          timestamp: new Date().toISOString(),
          networkHealth: networkStatus
        }
      });
    } catch (error) {
      this.logger.error('Health check failed', { error });
      
      res.status(200).json({
        success: true,
        message: 'Payment processing service is running (network status unavailable)',
        data: {
          timestamp: new Date().toISOString(),
          networkHealth: {
            isHealthy: false,
            status: 'Health check failed'
          }
        }
      });
    }
  }

  /**
   * Map Marqeta error codes to user-friendly messages
   */
  private mapMarqetaError(error: any): { code: string; message: string } {
    const marqetaError = error.response?.data as MarqetaErrorResponse;
    
    if (!marqetaError) {
      return {
        code: 'UNKNOWN_ERROR',
        message: 'An unknown error occurred'
      };
    }

    const errorMappings: Record<string, string> = {
      'CARD_NOT_FOUND': 'Card not found or inactive',
      'INSUFFICIENT_FUNDS': 'Insufficient funds available',
      'CARD_SUSPENDED': 'Card is currently suspended',
      'CARD_EXPIRED': 'Card has expired',
      'MERCHANT_BLOCKED': 'Transaction blocked by merchant restrictions',
      'GEOGRAPHIC_RESTRICTION': 'Transaction blocked by geographic restrictions',
      'AMOUNT_LIMIT_EXCEEDED': 'Transaction amount exceeds card limits',
      'FRAUD_SUSPECTED': 'Transaction flagged for suspected fraud',
      'NETWORK_ERROR': 'Network communication error',
      'RATE_LIMIT_EXCEEDED': 'Too many requests, please try again later'
    };

    return {
      code: marqetaError.error_code,
      message: errorMappings[marqetaError.error_code] || marqetaError.error_message || 'Transaction processing failed'
    };
  }

  /**
   * Handle response formatting with error mapping
   */
  private handleError(res: Response, error: any, defaultMessage: string, defaultStatusCode: number = 500): void {
    this.logger.error('Payment processing error', { error });

    // Check if it's a Marqeta API error
    if (error.response?.data?.error_code) {
      const mappedError = this.mapMarqetaError(error);
      res.status(400).json({
        success: false,
        error: mappedError.message,
        errorCode: mappedError.code
      });
      return;
    }

    // Generic error handling
    const errorMessage = error instanceof Error ? error.message : defaultMessage;
    const statusCode = errorMessage.includes('not found') ? 404 : 
                      errorMessage.includes('already exists') ? 409 : 
                      defaultStatusCode;

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
}

export const paymentsController = new PaymentsController();