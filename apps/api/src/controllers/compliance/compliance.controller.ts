import { Request, Response } from 'express';
import { AMLMonitoringService } from '../../services/compliance/aml-monitoring.service';
import { RegulatoryReportingService } from '../../services/compliance/regulatory-reporting.service';
import { AuditTrailService } from '../../services/compliance/audit-trail.service';
import { TransactionMonitoringService } from '../../services/compliance/transaction-monitoring.service';
import { SARReportingService } from '../../services/compliance/sar-reporting.service';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const GenerateReportSchema = z.object({
  reportType: z.enum(['monthly_aml', 'quarterly_compliance', 'annual_summary', 'ad_hoc_suspicious', 'currency_transaction_report']),
  periodStart: z.string().transform(str => new Date(str)),
  periodEnd: z.string().transform(str => new Date(str)),
  privacyMethod: z.enum(['differential_privacy', 'k_anonymity', 'statistical_disclosure_control']).optional(),
  epsilonBudget: z.number().positive().optional(),
  recipient: z.string().optional()
});

const SubmitSARSchema = z.object({
  suspiciousActivityId: z.string().uuid(),
  narrative: z.string().min(50).max(10000),
  complianceOfficerId: z.string().uuid(),
  filingReason: z.enum(['structuring', 'money_laundering', 'terrorist_financing', 'fraud', 'other']),
  urgentFiling: z.boolean().optional().default(false)
});

const MonitoringFiltersSchema = z.object({
  timeWindow: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h'),
  cardContextHash: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  alertType: z.string().optional(),
  dateRange: z.object({
    start: z.string().transform(str => new Date(str)),
    end: z.string().transform(str => new Date(str))
  }).optional()
});

export class ComplianceController {
  private amlService: AMLMonitoringService;
  private reportingService: RegulatoryReportingService;
  private auditService: AuditTrailService;
  private monitoringService: TransactionMonitoringService;
  private sarService: SARReportingService;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    this.amlService = new AMLMonitoringService(supabaseUrl, supabaseKey);
    this.reportingService = new RegulatoryReportingService(supabaseUrl, supabaseKey);
    this.auditService = new AuditTrailService(supabaseUrl, supabaseKey);
    this.monitoringService = new TransactionMonitoringService(supabaseUrl, supabaseKey);
    this.sarService = new SARReportingService(supabaseUrl, supabaseKey);
  }

  /**
   * Generate regulatory compliance report
   */
  generateReport = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate compliance officer access
      if (!this.hasComplianceAccess(req)) {
        res.status(403).json({ 
          success: false, 
          error: 'Compliance officer access required',
          code: 'COMPLIANCE_ACCESS_DENIED' 
        });
        return;
      }

      const validation = GenerateReportSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          details: validation.error.errors,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { reportType, periodStart, periodEnd, privacyMethod, epsilonBudget, recipient } = validation.data;

      // Generate compliance report
      const report = await this.reportingService.generateComplianceReport(
        reportType,
        periodStart,
        periodEnd,
        {
          privacyMethod,
          epsilonBudget,
          recipient
        }
      );

      // Log compliance report generation
      await this.auditService.createAuditEvent(
        'compliance_report_generated',
        'report_generation',
        `Regulatory report generated: ${reportType}`,
        {
          complianceOfficerId: req.user?.id,
          afterData: {
            reportId: report.reportId,
            reportType,
            privacyMethod: report.privacyPreservingMethod,
            epsilonBudget: report.epsilonBudgetUsed
          }
        }
      );

      res.status(200).json({
        success: true,
        data: {
          reportId: report.reportId,
          reportType: report.reportType,
          reportingPeriod: {
            start: report.reportingPeriodStart,
            end: report.reportingPeriodEnd
          },
          privacyMethod: report.privacyPreservingMethod,
          filingDeadline: report.filingDeadline,
          generatedAt: report.createdAt,
          reportHash: report.reportHash
        },
        message: 'Compliance report generated successfully'
      });
    } catch (error) {
      logger.error('Error generating compliance report:', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to generate compliance report',
        code: 'REPORT_GENERATION_ERROR'
      });
    }
  };

  /**
   * Submit regulatory report to authorities
   */
  submitReport = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.hasComplianceAccess(req)) {
        res.status(403).json({ 
          success: false, 
          error: 'Compliance officer access required',
          code: 'COMPLIANCE_ACCESS_DENIED' 
        });
        return;
      }

      const { reportId } = req.params;
      if (!reportId) {
        res.status(400).json({
          success: false,
          error: 'Report ID is required',
          code: 'MISSING_REPORT_ID'
        });
        return;
      }

      const submissionResult = await this.reportingService.submitReport(reportId);

      if (!submissionResult.success) {
        res.status(400).json({
          success: false,
          error: 'Report submission failed',
          details: submissionResult.errors,
          warnings: submissionResult.warnings,
          code: 'SUBMISSION_FAILED'
        });
        return;
      }

      // Log successful submission
      await this.auditService.createAuditEvent(
        'compliance_report_submitted',
        'report_generation',
        `Regulatory report submitted: ${reportId}`,
        {
          complianceOfficerId: req.user?.id,
          afterData: {
            reportId,
            submissionReference: submissionResult.submissionReference,
            submittedAt: submissionResult.submittedAt
          }
        }
      );

      res.status(200).json({
        success: true,
        data: {
          reportId,
          submissionReference: submissionResult.submissionReference,
          submittedAt: submissionResult.submittedAt,
          warnings: submissionResult.warnings
        },
        message: 'Report submitted successfully'
      });
    } catch (error) {
      logger.error('Error submitting report:', { error, reportId: req.params.reportId });
      res.status(500).json({
        success: false,
        error: 'Failed to submit report',
        code: 'SUBMISSION_ERROR'
      });
    }
  };

  /**
   * Get compliance dashboard metrics
   */
  getDashboardMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.hasComplianceAccess(req)) {
        res.status(403).json({ 
          success: false, 
          error: 'Compliance officer access required',
          code: 'COMPLIANCE_ACCESS_DENIED' 
        });
        return;
      }

      const validation = MonitoringFiltersSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.errors,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { timeWindow } = validation.data;

      // Get comprehensive compliance metrics
      const [
        complianceMetrics,
        regulatoryAlerts,
        auditMetrics
      ] = await Promise.all([
        this.getAggregatedComplianceMetrics(timeWindow),
        this.monitoringService.getRegulatoryAlerts({
          dateRange: validation.data.dateRange,
          alertType: validation.data.alertType
        }),
        this.auditService.getComplianceMetrics(timeWindow)
      ]);

      res.status(200).json({
        success: true,
        data: {
          timeWindow,
          metrics: complianceMetrics,
          alerts: {
            total: regulatoryAlerts.length,
            critical: regulatoryAlerts.filter(a => a.severity === 'critical').length,
            pending: regulatoryAlerts.filter(a => a.escalationRequired).length,
            recent: regulatoryAlerts.slice(0, 10) // Most recent 10 alerts
          },
          auditTrail: auditMetrics,
          generatedAt: new Date()
        },
        message: 'Dashboard metrics retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting dashboard metrics:', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard metrics',
        code: 'METRICS_ERROR'
      });
    }
  };

  /**
   * Get suspicious activity reports for review
   */
  getSuspiciousActivities = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.hasComplianceAccess(req)) {
        res.status(403).json({ 
          success: false, 
          error: 'Compliance officer access required',
          code: 'COMPLIANCE_ACCESS_DENIED' 
        });
        return;
      }

      const validation = MonitoringFiltersSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.errors,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const filters = validation.data;

      // Get suspicious activities requiring review
      const suspiciousActivities = await this.amlService.getSuspiciousActivities({
        riskLevel: filters.riskLevel || 'medium',
        dateRange: filters.dateRange,
        requiresReview: true,
        limit: 50
      });

      res.status(200).json({
        success: true,
        data: {
          activities: suspiciousActivities.activities,
          totalCount: suspiciousActivities.totalCount,
          filters: filters,
          summary: {
            highRisk: suspiciousActivities.activities.filter(a => a.riskScore >= 80).length,
            pendingReview: suspiciousActivities.activities.filter(a => a.reviewStatus === 'pending').length,
            requiresSAR: suspiciousActivities.activities.filter(a => a.sarRecommended).length
          }
        },
        message: 'Suspicious activities retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting suspicious activities:', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve suspicious activities',
        code: 'ACTIVITIES_ERROR'
      });
    }
  };

  /**
   * Submit Suspicious Activity Report (SAR)
   */
  submitSAR = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.hasComplianceAccess(req)) {
        res.status(403).json({ 
          success: false, 
          error: 'Compliance officer access required',
          code: 'COMPLIANCE_ACCESS_DENIED' 
        });
        return;
      }

      const validation = SubmitSARSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid SAR submission data',
          details: validation.error.errors,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { suspiciousActivityId, narrative, complianceOfficerId, filingReason, urgentFiling } = validation.data;

      // Submit SAR through reporting service
      const sarResult = await this.sarService.submitSAR(
        suspiciousActivityId,
        narrative,
        complianceOfficerId,
        {
          filingReason,
          urgentFiling,
          submittedBy: req.user?.id
        }
      );

      if (!sarResult.success) {
        res.status(400).json({
          success: false,
          error: 'SAR submission failed',
          details: sarResult.errors,
          code: 'SAR_SUBMISSION_FAILED'
        });
        return;
      }

      // Log SAR submission
      await this.auditService.createAuditEvent(
        'sar_submitted',
        'sar_filing',
        `Suspicious Activity Report submitted for activity: ${suspiciousActivityId}`,
        {
          complianceOfficerId,
          afterData: {
            sarId: sarResult.sarId,
            suspiciousActivityId,
            filingReason,
            urgentFiling,
            submittedBy: req.user?.id
          },
          riskAssessment: {
            riskLevel: urgentFiling ? 'critical' : 'high',
            riskScore: urgentFiling ? 95 : 80,
            riskFactors: [filingReason, 'regulatory_filing']
          }
        }
      );

      res.status(200).json({
        success: true,
        data: {
          sarId: sarResult.sarId,
          filingReference: sarResult.filingReference,
          submittedAt: sarResult.submittedAt,
          filingDeadline: sarResult.filingDeadline
        },
        message: 'SAR submitted successfully'
      });
    } catch (error) {
      logger.error('Error submitting SAR:', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to submit SAR',
        code: 'SAR_ERROR'
      });
    }
  };

  /**
   * Get audit trail for compliance review
   */
  getAuditTrail = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.hasComplianceAccess(req)) {
        res.status(403).json({ 
          success: false, 
          error: 'Compliance officer access required',
          code: 'COMPLIANCE_ACCESS_DENIED' 
        });
        return;
      }

      const validation = MonitoringFiltersSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.errors,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const filters = validation.data;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      // Get audit events
      const auditResult = await this.auditService.getAuditEvents({
        dateRange: filters.dateRange,
        eventType: req.query.eventType as string,
        eventCategory: req.query.eventCategory as string,
        limit,
        offset
      });

      res.status(200).json({
        success: true,
        data: {
          events: auditResult.events,
          totalCount: auditResult.totalCount,
          hasMore: auditResult.hasMore,
          pagination: {
            limit,
            offset,
            currentPage: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(auditResult.totalCount / limit)
          }
        },
        message: 'Audit trail retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting audit trail:', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit trail',
        code: 'AUDIT_ERROR'
      });
    }
  };

  /**
   * Verify audit trail integrity
   */
  verifyAuditIntegrity = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.hasComplianceAccess(req)) {
        res.status(403).json({ 
          success: false, 
          error: 'Compliance officer access required',
          code: 'COMPLIANCE_ACCESS_DENIED' 
        });
        return;
      }

      const { eventCategory, startDate, endDate } = req.query;

      const verificationResult = await this.auditService.verifyAuditIntegrity(
        eventCategory as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.status(200).json({
        success: true,
        data: {
          verified: verificationResult.verified,
          totalEvents: verificationResult.totalEvents,
          integrityViolations: verificationResult.integrityViolations,
          verificationProof: verificationResult.verificationProof,
          verifiedAt: new Date()
        },
        message: verificationResult.verified 
          ? 'Audit trail integrity verified' 
          : `Integrity violations detected: ${verificationResult.integrityViolations.length}`
      });
    } catch (error) {
      logger.error('Error verifying audit integrity:', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to verify audit integrity',
        code: 'VERIFICATION_ERROR'
      });
    }
  };

  /**
   * Check if user has compliance officer access
   */
  private hasComplianceAccess(req: Request): boolean {
    // This would check user roles and permissions
    // For now, check if user has compliance role
    return req.user?.roles?.includes('compliance_officer') || 
           req.user?.permissions?.includes('compliance_access') ||
           req.user?.role === 'admin';
  }

  /**
   * Get aggregated compliance metrics across all services
   */
  private async getAggregatedComplianceMetrics(timeWindow: string): Promise<any> {
    // This would aggregate metrics from multiple compliance services
    // For now, return mock aggregated data
    return {
      amlDetections: {
        total: 15,
        highRisk: 3,
        falsePositives: 2,
        averageRiskScore: 45.5
      },
      regulatoryReports: {
        generated: 4,
        submitted: 3,
        pending: 1,
        overdue: 0
      },
      transactionMonitoring: {
        transactionsMonitored: 12450,
        patternsDetected: 28,
        thresholdBreaches: 5,
        alertsGenerated: 12
      },
      sarFilings: {
        total: 2,
        pending: 0,
        submitted: 2,
        averageProcessingTime: 3.5
      }
    };
  }
}

// Create controller instance and export route handlers
const complianceController = new ComplianceController();

export const {
  generateReport,
  submitReport,
  getDashboardMetrics,
  getSuspiciousActivities,
  submitSAR,
  getAuditTrail,
  verifyAuditIntegrity
} = complianceController;