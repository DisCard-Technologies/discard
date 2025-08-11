import { Request, Response } from 'express';
import { FraudDetectionService } from '../../services/security/fraud-detection.service';
import { MLFraudModelService } from '../../services/security/ml-fraud-model.service';
import { CardFreezeService } from '../../services/security/card-freeze.service';
import { IncidentResponseService } from '../../services/security/incident-response.service';
import { SecurityNotificationService } from '../../services/notifications/security-notifications.service';
import { MFAService } from '../../services/auth/mfa.service';
import { AuthenticatedRequest } from '../../middleware/validation.middleware';
import { logger } from '../../utils/logger';

export class FraudController {
  private fraudDetectionService: FraudDetectionService;
  private mlFraudService: MLFraudModelService;
  private cardFreezeService: CardFreezeService;
  private incidentResponseService: IncidentResponseService;
  private notificationService: SecurityNotificationService;
  private mfaService: MFAService;

  constructor() {
    this.fraudDetectionService = new FraudDetectionService();
    this.mlFraudService = new MLFraudModelService();
    this.cardFreezeService = new CardFreezeService();
    this.incidentResponseService = new IncidentResponseService();
    this.notificationService = new SecurityNotificationService();
    this.mfaService = new MFAService();
  }

  // GET /api/v1/security/fraud/status/:cardId
  async getFraudStatus(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      
      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      // Get card freeze status
      const freezeStatus = await this.cardFreezeService.getCardFreezeStatus(cardId);
      
      // Get recent fraud events (last 24 hours)
      const recentEvents = await this.getRecentFraudEvents(cardId, 24);
      
      // Get model performance metrics
      const modelPerformance = await this.mlFraudService.getModelPerformance();
      
      // Calculate summary statistics
      const stats = {
        totalEvents: recentEvents.length,
        highRiskEvents: recentEvents.filter(e => e.risk_score >= 75).length,
        falsePositives: recentEvents.filter(e => e.false_positive === true).length,
        averageRiskScore: recentEvents.length > 0 
          ? Math.round(recentEvents.reduce((sum, e) => sum + e.risk_score, 0) / recentEvents.length)
          : 0
      };

      res.json({
        cardId,
        freezeStatus,
        recentActivity: {
          events: recentEvents.slice(0, 10), // Latest 10 events
          statistics: stats
        },
        modelPerformance,
        lastUpdated: new Date().toISOString()
      });

    } catch (error: unknown) {
      logger.error('Get fraud status failed:', error);
      res.status(500).json({ error: 'Failed to retrieve fraud status' });
    }
  }

  // POST /api/v1/security/fraud/analyze
  async analyzeTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { transaction, features } = req.body;
      
      if (!transaction?.cardId) {
        res.status(400).json({ error: 'Transaction with cardId is required' });
        return;
      }

      // Analyze transaction with fraud detection service
      const fraudAnalysis = await this.fraudDetectionService.analyzeTransaction(transaction);
      
      // Get ML fraud score if features provided
      let mlScore = null;
      if (features) {
        mlScore = await this.mlFraudService.scoreTransaction(features);
      }

      // Create incident if high risk
      if (fraudAnalysis.riskScore >= 75) {
        const incident = {
          cardId: transaction.cardId,
          incidentType: 'fraud_attempt' as const,
          severity: fraudAnalysis.riskLevel as any,
          relatedEvents: [transaction.id],
          incidentData: {
            fraudAnalysis,
            mlScore,
            transaction
          }
        };

        const incidentId = await this.incidentResponseService.createIncident(incident);
        
        // Send notification
        await this.notificationService.createFraudAlert(
          transaction.cardId,
          transaction.id,
          fraudAnalysis.riskScore,
          fraudAnalysis.anomalies.map(a => a.type)
        );

        res.json({
          analysis: fraudAnalysis,
          mlScore,
          incidentId,
          actions: {
            notificationSent: true,
            incidentCreated: true
          }
        });
        return;
      }

      res.json({
        analysis: fraudAnalysis,
        mlScore,
        actions: {
          notificationSent: false,
          incidentCreated: false
        }
      });

    } catch (error) {
      logger.error('Transaction analysis failed:', error);
      res.status(500).json({ error: 'Failed to analyze transaction' });
    }
  }

  // POST /api/v1/security/cards/:cardId/freeze
  async freezeCard(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { reason, metadata } = req.body;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      // Check if MFA is required for this action
      const riskAssessment = await this.mfaService.assessTransactionRisk(cardId, {
        action: 'manual_card_freeze',
        deviceId: req.headers['x-device-id'] as string,
        metadata: { userInitiated: true }
      });

      if (riskAssessment.requiresMFA) {
        // Create MFA challenge
        const challenge = await this.mfaService.createMFAChallenge(cardId, {
          action: 'manual_card_freeze',
          riskScore: riskAssessment.riskScore,
          deviceId: req.headers['x-device-id'] as string
        });

        res.status(202).json({
          requiresMFA: true,
          challenge,
          message: 'MFA verification required to freeze card'
        });
        return;
      }

      // Proceed with card freeze
      const result = await this.cardFreezeService.freezeCard({
        cardId,
        reason: reason || 'user_requested',
        metadata: {
          userInitiated: true,
          ...metadata
        }
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      // Send notification
      await this.notificationService.createCardFreezeNotification(
        cardId,
        result.freezeId!,
        reason || 'User requested',
        false
      );

      res.json({
        success: true,
        freezeId: result.freezeId,
        message: 'Card frozen successfully',
        notificationSent: true
      });

    } catch (error) {
      logger.error('Card freeze failed:', error);
      res.status(500).json({ error: 'Failed to freeze card' });
    }
  }

  // POST /api/v1/security/cards/:cardId/unfreeze
  async unfreezeCard(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { reason, mfaVerification } = req.body;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      // Always require MFA for unfreeze operations
      if (mfaVerification?.challengeId && mfaVerification?.code) {
        const mfaValid = await this.mfaService.verifyMFAChallenge(cardId, mfaVerification);
        if (!mfaValid) {
          res.status(401).json({ error: 'Invalid MFA verification' });
          return;
        }
      } else {
        // Create MFA challenge for unfreeze
        const challenge = await this.mfaService.createMFAChallenge(cardId, {
          action: 'manual_card_unfreeze',
          riskScore: 50, // Medium risk for unfreeze
          deviceId: req.headers['x-device-id'] as string
        });

        res.status(202).json({
          requiresMFA: true,
          challenge,
          message: 'MFA verification required to unfreeze card'
        });
        return;
      }

      // Proceed with card unfreeze
      const result = await this.cardFreezeService.unfreezeCard({
        cardId,
        unfreezeBy: 'user',
        reason: reason || 'User requested'
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      // Send notification
      await this.notificationService.createCardUnfreezeNotification(
        cardId,
        result.freezeId!,
        'user'
      );

      res.json({
        success: true,
        freezeId: result.freezeId,
        message: 'Card unfrozen successfully',
        notificationSent: true
      });

    } catch (error) {
      logger.error('Card unfreeze failed:', error);
      res.status(500).json({ error: 'Failed to unfreeze card' });
    }
  }

  // POST /api/v1/security/fraud/feedback
  async submitFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { cardId, eventId, incidentId, feedback } = req.body;
      
      if (!cardId || (!eventId && !incidentId) || typeof feedback !== 'boolean') {
        res.status(400).json({ 
          error: 'cardId, eventId or incidentId, and feedback (boolean) are required' 
        });
        return;
      }

      // Record feedback for ML model
      if (eventId) {
        await this.mlFraudService.recordFeedback(cardId, eventId, feedback);
      }

      // Record false positive for incident
      if (incidentId && feedback === false) {
        await this.incidentResponseService.recordFalsePositive(incidentId, cardId);
      }

      res.json({
        success: true,
        message: 'Feedback recorded successfully',
        eventId,
        incidentId,
        falsePositive: feedback === false
      });

    } catch (error) {
      logger.error('Feedback submission failed:', error);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }

  // GET /api/v1/security/incidents/:cardId
  async getSecurityIncidents(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { limit = 20, status, severity } = req.query;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      const incidents = await this.getIncidents(cardId, {
        limit: parseInt(limit as string),
        status: status as string,
        severity: severity as string
      });

      res.json({
        incidents,
        count: incidents.length,
        filters: {
          status: status || 'all',
          severity: severity || 'all'
        }
      });

    } catch (error) {
      logger.error('Get security incidents failed:', error);
      res.status(500).json({ error: 'Failed to retrieve security incidents' });
    }
  }

  // GET /api/v1/security/notifications/:cardId
  async getSecurityNotifications(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { limit = 50 } = req.query;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      const notifications = await this.notificationService.getNotificationHistory(
        cardId,
        parseInt(limit as string)
      );

      res.json({
        notifications,
        count: notifications.length
      });

    } catch (error) {
      logger.error('Get security notifications failed:', error);
      res.status(500).json({ error: 'Failed to retrieve security notifications' });
    }
  }

  // PUT /api/v1/security/notifications/:cardId/:notificationId/read
  async markNotificationRead(req: Request, res: Response): Promise<void> {
    try {
      const { cardId, notificationId } = req.params;

      if (!cardId || !notificationId) {
        res.status(400).json({ error: 'Card ID and notification ID are required' });
        return;
      }

      await this.notificationService.markNotificationAsRead(cardId, notificationId);

      res.json({
        success: true,
        message: 'Notification marked as read'
      });

    } catch (error) {
      logger.error('Mark notification read failed:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }

  // GET /api/v1/security/notifications/:cardId/preferences
  async getNotificationPreferences(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      const preferences = await this.notificationService.getNotificationPreferences(cardId);

      res.json(preferences);

    } catch (error) {
      logger.error('Get notification preferences failed:', error);
      res.status(500).json({ error: 'Failed to retrieve notification preferences' });
    }
  }

  // PUT /api/v1/security/notifications/:cardId/preferences
  async updateNotificationPreferences(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const preferences = req.body;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      await this.notificationService.updateNotificationPreferences(cardId, preferences);

      res.json({
        success: true,
        message: 'Notification preferences updated successfully'
      });

    } catch (error) {
      logger.error('Update notification preferences failed:', error);
      res.status(500).json({ error: 'Failed to update notification preferences' });
    }
  }

  // GET /api/v1/security/model/performance
  async getModelPerformance(req: Request, res: Response): Promise<void> {
    try {
      const performance = await this.mlFraudService.getModelPerformance();
      
      res.json({
        performance,
        lastUpdated: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get model performance failed:', error);
      res.status(500).json({ error: 'Failed to retrieve model performance' });
    }
  }

  // Helper methods
  private async getRecentFraudEvents(cardId: string, hours: number): Promise<any[]> {
    try {
      // This would typically use the isolation service and query the database
      // For now, return mock data structure
      return [];
    } catch (error) {
      logger.error('Get recent fraud events failed:', error);
      return [];
    }
  }

  private async getIncidents(
    cardId: string, 
    filters: { limit: number; status?: string; severity?: string }
  ): Promise<any[]> {
    try {
      // This would typically use the incident response service
      // For now, return mock data structure
      return [];
    } catch (error) {
      logger.error('Get incidents failed:', error);
      return [];
    }
  }
}