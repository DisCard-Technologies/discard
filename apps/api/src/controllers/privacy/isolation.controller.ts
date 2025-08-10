import { Request, Response } from 'express';
import { TransactionIsolationService } from '../../services/privacy/transaction-isolation.service';
import { CorrelationDetectionService } from '../../services/privacy/correlation-detection.service';
import { IsolationAuditService } from '../../services/compliance/isolation-audit.service';
import { logger } from '../../utils/logger';
import { inputSanitizer } from '../../utils/input-sanitizer';

interface IsolationRequest extends Request {
  isolationContext?: {
    cardId?: string;
    contextHash?: string;
    isolationVerified?: boolean;
  };
}

export class IsolationController {
  private isolationService: TransactionIsolationService;
  private correlationService: CorrelationDetectionService;
  private auditService: IsolationAuditService;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
    
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
    this.correlationService = new CorrelationDetectionService(supabaseUrl, supabaseKey);
    this.auditService = new IsolationAuditService(supabaseUrl, supabaseKey);
  }

  /**
   * Verify isolation status for a card
   */
  async verifyIsolation(req: IsolationRequest, res: Response): Promise<void> {
    try {
      const cardId = inputSanitizer.sanitizeCardId(req.params.cardId);
      
      if (!cardId) {
        res.status(400).json({ error: 'Invalid card ID' });
        return;
      }

      const status = await this.isolationService.getIsolationStatus(cardId);

      res.json({
        isolated: status.isolated,
        lastVerified: status.lastVerified.toISOString(),
        riskLevel: status.riskLevel,
        violationCount: status.violationCount
      });
    } catch (error) {
      logger.error('Error verifying isolation', { error });
      res.status(500).json({ error: 'Failed to verify isolation' });
    }
  }

  /**
   * Get isolation metrics
   */
  async getIsolationMetrics(req: Request, res: Response): Promise<void> {
    try {
      const timeRange = {
        start: req.query.start as string || new Date(Date.now() - 86400000).toISOString(),
        end: req.query.end as string || new Date().toISOString()
      };

      const verificationResult = await this.auditService.verifyContinuousIsolation();

      res.json({
        continuousIsolation: {
          verified: verificationResult.verified,
          lastCheck: verificationResult.lastCheck,
          nextCheck: verificationResult.nextCheck,
          violations: verificationResult.violations
        },
        timeRange
      });
    } catch (error) {
      logger.error('Error getting isolation metrics', { error });
      res.status(500).json({ error: 'Failed to retrieve isolation metrics' });
    }
  }

  /**
   * Detect correlation patterns
   */
  async detectCorrelations(req: Request, res: Response): Promise<void> {
    try {
      const correlations = await this.correlationService.detectCrossCardCorrelation();
      
      const summary = {
        correlationsDetected: correlations.length,
        highRisk: correlations.filter(c => c.riskLevel === 'high').length,
        mediumRisk: correlations.filter(c => c.riskLevel === 'medium').length,
        lowRisk: correlations.filter(c => c.riskLevel === 'low').length,
        types: correlations.map(c => ({
          type: c.correlationType,
          riskLevel: c.riskLevel,
          confidence: c.confidence,
          affectedContexts: c.affectedContexts.length
        }))
      };

      res.json(summary);
    } catch (error) {
      logger.error('Error detecting correlations', { error });
      res.status(500).json({ error: 'Failed to detect correlations' });
    }
  }

  /**
   * Switch isolation context
   */
  async switchContext(req: IsolationRequest, res: Response): Promise<void> {
    try {
      const { fromCardId, toCardId } = req.body;
      
      if (!fromCardId || !toCardId) {
        res.status(400).json({ error: 'Both fromCardId and toCardId are required' });
        return;
      }

      const sanitizedFromCardId = inputSanitizer.sanitizeCardId(fromCardId);
      const sanitizedToCardId = inputSanitizer.sanitizeCardId(toCardId);

      await this.isolationService.switchContext(sanitizedFromCardId, sanitizedToCardId);

      res.json({
        success: true,
        newContext: {
          cardId: sanitizedToCardId,
          isolationVerified: true,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error switching context', { error });
      res.status(500).json({ error: 'Failed to switch isolation context' });
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(req: Request, res: Response): Promise<void> {
    try {
      const reportType = req.query.type as 'isolation_verification' | 'privacy_audit' | 'regulatory_compliance' || 'privacy_audit';
      const period = {
        start: new Date(req.query.start as string || Date.now() - 7776000000), // Default 90 days
        end: new Date(req.query.end as string || Date.now())
      };

      const report = await this.auditService.generateComplianceReport(reportType, period);

      res.json({
        reportId: report.reportId,
        reportType: report.reportType,
        period: {
          start: report.period.start.toISOString(),
          end: report.period.end.toISOString()
        },
        isolationMaintained: report.isolationMaintained,
        violationCount: report.violationCount,
        complianceScore: report.complianceScore,
        generatedAt: report.generatedAt.toISOString(),
        summary: {
          totalEvents: report.details.auditSummary.totalEvents,
          violationRate: report.details.auditSummary.violationRate,
          recommendations: report.details.recommendations
        }
      });
    } catch (error) {
      logger.error('Error generating compliance report', { error });
      res.status(500).json({ error: 'Failed to generate compliance report' });
    }
  }

  /**
   * Monitor internal access
   */
  async monitorAccess(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, cardContextHash } = req.body;
      
      if (!employeeId || !cardContextHash) {
        res.status(400).json({ error: 'Employee ID and card context hash required' });
        return;
      }

      const authorized = await this.auditService.monitorInternalAccess(
        employeeId,
        cardContextHash
      );

      res.json({
        authorized,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error monitoring access', { error });
      res.status(500).json({ error: 'Failed to monitor access' });
    }
  }

  /**
   * Get privacy violations
   */
  async getPrivacyViolations(req: Request, res: Response): Promise<void> {
    try {
      const violations = await this.correlationService.identifyPrivacyViolations();

      res.json({
        violationCount: violations.length,
        violations: violations.map(v => ({
          type: v.violationType,
          severity: v.severity,
          affectedCards: v.affectedCards.length,
          timestamp: v.timestamp.toISOString()
        }))
      });
    } catch (error) {
      logger.error('Error getting privacy violations', { error });
      res.status(500).json({ error: 'Failed to retrieve privacy violations' });
    }
  }

  /**
   * Start isolation monitoring
   */
  async startMonitoring(req: Request, res: Response): Promise<void> {
    try {
      // Start continuous monitoring
      this.isolationService.startIsolationMonitoring();
      
      // Start correlation monitoring
      this.correlationService.startCorrelationMonitoring(async (risk) => {
        logger.warn('Correlation risk detected', {
          riskLevel: risk.overallRiskLevel,
          violationDetected: risk.violationDetected,
          correlationTypes: risk.correlationTypes.length
        });

        // Log to audit service
        await this.auditService.logAuditEvent({
          eventType: 'correlation_attempt',
          contextHash: 'monitoring',
          accessPattern: 'continuous_monitoring',
          timestamp: new Date(),
          violationDetected: risk.violationDetected,
          metadata: { risk }
        });
      });

      res.json({
        status: 'monitoring_started',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error starting monitoring', { error });
      res.status(500).json({ error: 'Failed to start monitoring' });
    }
  }
}

// Create controller instance
const isolationController = new IsolationController();

// Export controller methods
export const verifyIsolation = isolationController.verifyIsolation.bind(isolationController);
export const getIsolationMetrics = isolationController.getIsolationMetrics.bind(isolationController);
export const detectCorrelations = isolationController.detectCorrelations.bind(isolationController);
export const switchContext = isolationController.switchContext.bind(isolationController);
export const generateComplianceReport = isolationController.generateComplianceReport.bind(isolationController);
export const monitorAccess = isolationController.monitorAccess.bind(isolationController);
export const getPrivacyViolations = isolationController.getPrivacyViolations.bind(isolationController);
export const startMonitoring = isolationController.startMonitoring.bind(isolationController);