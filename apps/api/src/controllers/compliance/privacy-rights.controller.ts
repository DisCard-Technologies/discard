import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { DataRetentionService } from '../../services/compliance/data-retention.service';
import { KYCService } from '../../services/compliance/kyc.service';
import { TransactionIsolationService } from '../../services/privacy/transaction-isolation.service';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    contextHash: string;
    role: string;
  };
}

export class PrivacyRightsController {
  private dataRetentionService: DataRetentionService;
  private kycService: KYCService;
  private isolationService: TransactionIsolationService;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
    
    this.dataRetentionService = new DataRetentionService(supabaseUrl, supabaseKey);
    this.kycService = new KYCService(supabaseUrl, supabaseKey);
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
  }

  /**
   * Submit data access request (GDPR Article 15, CCPA Right to Know)
   */
  async requestDataAccess(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const { dataCategories, legalBasis, exportFormat } = req.body;

      // Enforce isolation context
      await this.isolationService.enforceTransactionIsolation(req.user.contextHash);

      // Create export request
      const exportRequest = await this.dataRetentionService.exportUserData(
        req.user.contextHash,
        legalBasis === 'gdpr' ? 'gdpr_access' : 'ccpa_access',
        dataCategories || ['kyc_records', 'compliance_events', 'privacy_requests'],
        exportFormat || 'json',
        req.user.id
      );

      res.status(200).json({
        success: true,
        message: 'Data access request submitted successfully',
        data: {
          requestId: exportRequest.exportId,
          status: 'processing',
          estimatedCompletion: new Date(Date.now() + (24 * 60 * 60 * 1000)), // 24 hours
          downloadAvailable: exportRequest.completedAt ? true : false,
          expiresAt: exportRequest.expiresAt
        }
      });

      // Log privacy request
      logger.info('Data access request submitted', {
        userId: req.user.id,
        requestId: exportRequest.exportId,
        dataCategories,
        legalBasis
      });

    } catch (error) {
      logger.error('Error processing data access request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process data access request'
      });
    }
  }

  /**
   * Submit data deletion request (GDPR Article 17, CCPA Right to Delete)
   */
  async requestDataDeletion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const { dataCategories, reason, legalBasis, confirmDeletion } = req.body;

      if (!confirmDeletion) {
        res.status(400).json({
          success: false,
          error: 'Deletion confirmation required'
        });
        return;
      }

      // Enforce isolation context
      await this.isolationService.enforceTransactionIsolation(req.user.contextHash);

      // Create deletion request
      const deletionRequest = await this.dataRetentionService.scheduleDataDeletion(
        req.user.contextHash,
        dataCategories || ['kyc_records', 'compliance_events'],
        'user_requested',
        reason || `${legalBasis} data deletion request`,
        req.user.id
      );

      res.status(200).json({
        success: true,
        message: 'Data deletion request submitted successfully',
        data: {
          requestId: deletionRequest.requestId,
          scheduledDeletionDate: deletionRequest.scheduledDeletionDate,
          gracePeriodDays: 30,
          reversible: true,
          dataCategories: deletionRequest.dataCategories,
          deletionMethod: deletionRequest.deletionMethod
        },
        warning: 'This action cannot be undone after the grace period expires. You have 30 days to cancel this request.'
      });

      // Log privacy request
      logger.info('Data deletion request submitted', {
        userId: req.user.id,
        requestId: deletionRequest.requestId,
        dataCategories,
        legalBasis
      });

    } catch (error) {
      logger.error('Error processing data deletion request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process data deletion request'
      });
    }
  }

  /**
   * Request data portability (GDPR Article 20)
   */
  async requestDataPortability(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const { exportFormat, includeCategories } = req.body;

      // Enforce isolation context
      await this.isolationService.enforceTransactionIsolation(req.user.contextHash);

      // Create portability export request
      const exportRequest = await this.dataRetentionService.exportUserData(
        req.user.contextHash,
        'data_portability',
        includeCategories || ['kyc_records'],
        exportFormat || 'json',
        req.user.id
      );

      res.status(200).json({
        success: true,
        message: 'Data portability request submitted successfully',
        data: {
          requestId: exportRequest.exportId,
          format: exportFormat,
          status: 'processing',
          downloadAvailable: exportRequest.completedAt ? true : false,
          expiresAt: exportRequest.expiresAt
        }
      });

      // Log privacy request
      logger.info('Data portability request submitted', {
        userId: req.user.id,
        requestId: exportRequest.exportId,
        exportFormat
      });

    } catch (error) {
      logger.error('Error processing data portability request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process data portability request'
      });
    }
  }

  /**
   * Update consent preferences
   */
  async updateConsent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const { consentType, granted, version } = req.body;

      // Enforce isolation context
      await this.isolationService.enforceTransactionIsolation(req.user.contextHash);

      // Store consent update (this would integrate with a consent management system)
      const consentRecord = {
        id: crypto.randomUUID(),
        userContextHash: req.user.contextHash,
        consentType,
        granted,
        version: version || '1.0',
        timestamp: new Date(),
        ipAddress: this.hashIP(req.ip),
        userAgent: this.hashUserAgent(req.headers['user-agent'] as string)
      };

      // Log consent update
      logger.info('Consent updated', {
        userId: req.user.id,
        consentId: consentRecord.id,
        consentType,
        granted
      });

      res.status(200).json({
        success: true,
        message: 'Consent preferences updated successfully',
        data: {
          consentId: consentRecord.id,
          consentType,
          granted,
          effectiveDate: consentRecord.timestamp
        }
      });

    } catch (error) {
      logger.error('Error updating consent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update consent preferences'
      });
    }
  }

  /**
   * Get user's privacy controls and settings
   */
  async getPrivacyControls(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      // Enforce isolation context
      await this.isolationService.enforceTransactionIsolation(req.user.contextHash);

      // Get current KYC status
      const kycRecord = await this.kycService.getCurrentKYCRecord(req.user.contextHash);

      // Get retention schedules
      const retentionSchedules = await this.dataRetentionService.getRetentionSchedules();

      const privacyControls = {
        userRights: {
          gdpr: {
            dataAccess: 'Request a copy of your personal data',
            dataPortability: 'Download your data in a portable format',
            dataDeletion: 'Request deletion of your personal data',
            dataRectification: 'Request correction of inaccurate data'
          },
          ccpa: {
            rightToKnow: 'Know what personal information is collected',
            rightToDelete: 'Delete personal information',
            rightToOptOut: 'Opt out of the sale of personal information'
          }
        },
        currentStatus: {
          kycLevel: kycRecord?.kycLevel || 'none',
          kycStatus: kycRecord?.verificationStatus || 'not_started',
          dataCategories: this.getAvailableDataCategories(),
          consentStatus: {
            dataProcessing: true, // Would be retrieved from consent system
            marketing: false,
            analytics: true
          }
        },
        retentionPolicies: retentionSchedules.map(schedule => ({
          category: schedule.dataCategory,
          retentionPeriod: `${schedule.retentionPeriodDays} days`,
          legalBasis: schedule.legalBasisForRetention,
          automaticDeletion: schedule.automaticDeletion
        })),
        availableActions: [
          'request_data_access',
          'request_data_deletion',
          'request_data_portability',
          'update_consent',
          'download_data'
        ]
      };

      res.status(200).json({
        success: true,
        data: privacyControls
      });

    } catch (error) {
      logger.error('Error getting privacy controls:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve privacy controls'
      });
    }
  }

  /**
   * Get status of privacy requests
   */
  async getRequestStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      // For now, return mock status - in production, this would query the actual request status
      const mockStatus = {
        requestId,
        type: 'data_access',
        status: 'completed',
        submittedAt: new Date(Date.now() - (24 * 60 * 60 * 1000)),
        completedAt: new Date(),
        downloadUrl: requestId.startsWith('export') ? `/api/v1/privacy/download/${requestId}` : undefined,
        expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000))
      };

      res.status(200).json({
        success: true,
        data: mockStatus
      });

    } catch (error) {
      logger.error('Error getting request status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve request status'
      });
    }
  }

  /**
   * Cancel a pending privacy request
   */
  async cancelRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;
      const { reason } = req.body;

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      // Log cancellation
      logger.info('Privacy request cancelled', {
        userId: req.user.id,
        requestId,
        reason
      });

      res.status(200).json({
        success: true,
        message: 'Request cancelled successfully',
        data: {
          requestId,
          status: 'cancelled',
          cancelledAt: new Date(),
          reason
        }
      });

    } catch (error) {
      logger.error('Error cancelling request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel request'
      });
    }
  }

  /**
   * Get available data categories for user
   */
  private getAvailableDataCategories(): string[] {
    return [
      'kyc_records',
      'compliance_events',
      'privacy_requests',
      'audit_logs'
    ];
  }

  /**
   * Hash IP address for privacy
   */
  private hashIP(ip: string): string {
    return crypto.createHash('sha256').update(ip || '').digest('hex');
  }

  /**
   * Hash user agent for privacy
   */
  private hashUserAgent(userAgent: string): string {
    return crypto.createHash('sha256').update(userAgent || '').digest('hex');
  }
}

// Validation middleware
export const validateDataAccessRequest = [
  body('dataCategories').optional().isArray().withMessage('Data categories must be an array'),
  body('legalBasis').isIn(['gdpr', 'ccpa']).withMessage('Legal basis must be gdpr or ccpa'),
  body('exportFormat').optional().isIn(['json', 'csv', 'xml', 'pdf']).withMessage('Invalid export format')
];

export const validateDataDeletionRequest = [
  body('dataCategories').optional().isArray().withMessage('Data categories must be an array'),
  body('reason').isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),
  body('legalBasis').isIn(['gdpr', 'ccpa']).withMessage('Legal basis must be gdpr or ccpa'),
  body('confirmDeletion').isBoolean().equals('true').withMessage('Deletion confirmation required')
];

export const validateDataPortabilityRequest = [
  body('exportFormat').isIn(['json', 'csv', 'xml']).withMessage('Invalid export format for portability'),
  body('includeCategories').optional().isArray().withMessage('Include categories must be an array')
];

export const validateConsentUpdate = [
  body('consentType').isIn(['data_processing', 'marketing', 'analytics', 'cookies']).withMessage('Invalid consent type'),
  body('granted').isBoolean().withMessage('Granted must be true or false'),
  body('version').optional().isString().withMessage('Version must be a string')
];

export const validateRequestId = [
  param('requestId').isUUID().withMessage('Request ID must be a valid UUID')
];