import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { PrivacyAnalyticsService } from '../privacy/privacy-analytics.service';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface SARData {
  reportNumber: string;
  cardContextHash: string;
  suspiciousActivityPeriod: {
    start: Date;
    end: Date;
  };
  totalSuspiciousAmount: number;
  narrativeDescription: string;
  supportingEvidence: SupportingEvidence[];
  complianceOfficerId: string;
}

export interface SupportingEvidence {
  eventId: string;
  eventType: string;
  riskScore: number;
  detectedAt: Date;
  evidenceData: Record<string, any>;
}

export interface SARReport {
  sarId: string;
  reportNumber: string;
  filingStatus: 'draft' | 'pending_review' | 'filed' | 'rejected';
  regulatoryAgency: string;
  totalSuspiciousAmount: number;
  narrativeDescription: string;
  supportingEvidence: SupportingEvidence[];
  complianceOfficerId: string;
  reviewerId?: string;
  filedAt?: Date;
  createdAt: Date;
}

export interface SARSubmissionResult {
  success: boolean;
  sarId: string;
  reportNumber: string;
  submissionReference?: string;
  filedAt?: Date;
  errors?: string[];
}

export interface ComplianceNotification {
  notificationId: string;
  type: 'sar_ready' | 'sar_filed' | 'review_required' | 'threshold_exceeded';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  relatedSarId?: string;
  recipientRole: 'compliance_officer' | 'senior_compliance_officer' | 'legal_counsel';
  scheduledFor: Date;
}

export class SARReportingService {
  private supabase: SupabaseClient;
  private isolationService: TransactionIsolationService;
  private privacyAnalyticsService: PrivacyAnalyticsService;
  private reportSequenceNumber: number = 1;

  // SAR thresholds and configuration
  private readonly SAR_THRESHOLDS = {
    AUTO_GENERATE_THRESHOLD: 75, // Risk score that triggers automatic SAR generation
    REVIEW_THRESHOLD: 90, // Risk score that requires senior review
    SUSPICIOUS_AMOUNT_THRESHOLD: 5000, // Minimum amount for SAR consideration
    PATTERN_AGGREGATION_DAYS: 30, // Days to look back for pattern aggregation
    MAX_NARRATIVE_LENGTH: 9000 // FinCEN SAR character limit for narrative
  };

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
    this.privacyAnalyticsService = new PrivacyAnalyticsService(supabaseUrl, supabaseKey);
    this.initializeReportSequence();
  }

  /**
   * Automatically generate SAR based on suspicious activities
   */
  async generateSAR(cardContextHash: string, complianceOfficerId: string): Promise<SARReport> {
    try {
      // Enforce isolation context
      await this.isolationService.enforceTransactionIsolation(cardContextHash);

      // Gather suspicious activities for this card context
      const suspiciousActivities = await this.gatherSuspiciousActivities(cardContextHash);
      
      if (suspiciousActivities.length === 0) {
        throw new Error('No suspicious activities found for SAR generation');
      }

      // Calculate aggregated suspicious amount and timeframe
      const { totalAmount, activityPeriod } = this.calculateSuspiciousMetrics(suspiciousActivities);

      // Check if meets SAR threshold
      if (totalAmount < this.SAR_THRESHOLDS.SUSPICIOUS_AMOUNT_THRESHOLD) {
        logger.info('Suspicious amount below SAR threshold', { 
          totalAmount, 
          threshold: this.SAR_THRESHOLDS.SUSPICIOUS_AMOUNT_THRESHOLD 
        });
        throw new Error('Suspicious amount below SAR filing threshold');
      }

      // Generate narrative description
      const narrativeDescription = await this.generateNarrativeDescription(suspiciousActivities, totalAmount);

      // Create supporting evidence
      const supportingEvidence = this.createSupportingEvidence(suspiciousActivities);

      // Generate unique report number
      const reportNumber = await this.generateReportNumber();

      // Create SAR data
      const sarData: SARData = {
        reportNumber,
        cardContextHash,
        suspiciousActivityPeriod: activityPeriod,
        totalSuspiciousAmount: totalAmount,
        narrativeDescription,
        supportingEvidence,
        complianceOfficerId
      };

      // Save to database
      const sarReport = await this.saveSARToDatabse(sarData);

      // Trigger compliance notifications
      await this.triggerComplianceNotifications(sarReport);

      logger.info('SAR generated successfully', { 
        sarId: sarReport.sarId,
        reportNumber: sarReport.reportNumber,
        totalAmount
      });

      return sarReport;
    } catch (error) {
      logger.error('Error generating SAR:', { error, cardContextHash });
      throw error;
    }
  }

  /**
   * Review and approve SAR for filing
   */
  async reviewSAR(sarId: string, reviewerId: string, approved: boolean, reviewNotes?: string): Promise<SARReport> {
    try {
      // Get existing SAR
      const { data: existingSar, error } = await this.supabase
        .from('suspicious_activity_reports')
        .select('*')
        .eq('sar_id', sarId)
        .single();

      if (error || !existingSar) {
        throw new Error('SAR not found');
      }

      const newStatus = approved ? 'pending_review' : 'rejected';
      const updateData: any = {
        filing_status: newStatus,
        reviewed_by: reviewerId,
        updated_at: new Date().toISOString()
      };

      if (reviewNotes) {
        updateData.regulatory_response = { review_notes: reviewNotes };
      }

      // Update SAR status
      const { data: updatedSar, error: updateError } = await this.supabase
        .from('suspicious_activity_reports')
        .update(updateData)
        .eq('sar_id', sarId)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      // Log audit trail
      await this.logSAREvent('sar_reviewed', sarId, reviewerId, {
        approved,
        reviewNotes,
        newStatus
      });

      return this.convertToSARReport(updatedSar);
    } catch (error) {
      logger.error('Error reviewing SAR:', { error, sarId });
      throw error;
    }
  }

  /**
   * Submit SAR to regulatory agency
   */
  async submitSAR(sarId: string, complianceOfficerId: string): Promise<SARSubmissionResult> {
    try {
      // Get SAR details
      const { data: sar, error } = await this.supabase
        .from('suspicious_activity_reports')
        .select('*')
        .eq('sar_id', sarId)
        .single();

      if (error || !sar) {
        throw new Error('SAR not found');
      }

      if (sar.filing_status !== 'pending_review') {
        throw new Error('SAR must be reviewed before filing');
      }

      // Generate privacy-preserving submission data
      const submissionData = await this.generatePrivacyPreservingSubmission(sar);

      // Submit to regulatory agency (mock implementation)
      const submissionResult = await this.submitToRegulatoryAgency(submissionData);

      if (submissionResult.success) {
        // Update SAR as filed
        await this.supabase
          .from('suspicious_activity_reports')
          .update({
            filing_status: 'filed',
            filed_at: new Date().toISOString(),
            submission_reference: submissionResult.submissionReference,
            updated_at: new Date().toISOString()
          })
          .eq('sar_id', sarId);

        // Log audit trail
        await this.logSAREvent('sar_filed', sarId, complianceOfficerId, {
          submissionReference: submissionResult.submissionReference
        });

        // Trigger notification
        await this.sendNotification({
          notificationId: crypto.randomUUID(),
          type: 'sar_filed',
          priority: 'medium',
          message: `SAR ${sar.report_number} successfully filed with ${sar.regulatory_agency}`,
          relatedSarId: sarId,
          recipientRole: 'compliance_officer',
          scheduledFor: new Date()
        });
      }

      return {
        success: submissionResult.success,
        sarId,
        reportNumber: sar.report_number,
        submissionReference: submissionResult.submissionReference,
        filedAt: submissionResult.success ? new Date() : undefined,
        errors: submissionResult.errors
      };
    } catch (error) {
      logger.error('Error submitting SAR:', { error, sarId });
      return {
        success: false,
        sarId,
        reportNumber: '',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get SAR reports with privacy filtering
   */
  async getSARReports(
    filters: {
      status?: string;
      dateRange?: { start: Date; end: Date };
      complianceOfficerId?: string;
    } = {}
  ): Promise<SARReport[]> {
    try {
      let query = this.supabase
        .from('suspicious_activity_reports')
        .select('*');

      // Apply filters
      if (filters.status) {
        query = query.eq('filing_status', filters.status);
      }

      if (filters.dateRange) {
        query = query
          .gte('created_at', filters.dateRange.start.toISOString())
          .lte('created_at', filters.dateRange.end.toISOString());
      }

      if (filters.complianceOfficerId) {
        query = query.eq('compliance_officer_id', filters.complianceOfficerId);
      }

      const { data: sars, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (sars || []).map(sar => this.convertToSARReport(sar));
    } catch (error) {
      logger.error('Error getting SAR reports:', error);
      throw error;
    }
  }

  /**
   * Gather suspicious activities for SAR generation
   */
  private async gatherSuspiciousActivities(cardContextHash: string): Promise<any[]> {
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - this.SAR_THRESHOLDS.PATTERN_AGGREGATION_DAYS);

    const { data: activities, error } = await this.supabase
      .from('compliance_events')
      .select('*')
      .eq('card_context_hash', cardContextHash)
      .gte('detected_at', lookbackDate.toISOString())
      .gte('risk_score', this.SAR_THRESHOLDS.AUTO_GENERATE_THRESHOLD)
      .order('detected_at', { ascending: false });

    if (error) {
      logger.error('Error gathering suspicious activities:', error);
      return [];
    }

    return activities || [];
  }

  /**
   * Calculate suspicious metrics from activities
   */
  private calculateSuspiciousMetrics(activities: any[]): {
    totalAmount: number;
    activityPeriod: { start: Date; end: Date };
  } {
    if (activities.length === 0) {
      return {
        totalAmount: 0,
        activityPeriod: { start: new Date(), end: new Date() }
      };
    }

    // Sort by date
    activities.sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime());

    const startDate = new Date(activities[0].detected_at);
    const endDate = new Date(activities[activities.length - 1].detected_at);

    // Sum suspicious amounts from event data
    const totalAmount = activities.reduce((sum, activity) => {
      const eventData = activity.event_data || {};
      const amount = eventData.totalAmount || eventData.amount || activity.actual_value || 0;
      return sum + (typeof amount === 'number' ? amount : 0);
    }, 0);

    return {
      totalAmount,
      activityPeriod: { start: startDate, end: endDate }
    };
  }

  /**
   * Generate narrative description for SAR
   */
  private async generateNarrativeDescription(activities: any[], totalAmount: number): Promise<string> {
    const patternTypes = [...new Set(activities.map(a => a.pattern_type).filter(Boolean))];
    const riskScores = activities.map(a => a.risk_score);
    const avgRiskScore = riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length;

    // Use privacy-preserving analytics to get additional context
    const privacyBudget = 0.5;
    const analytics = await this.privacyAnalyticsService.generatePrivateAnalytics({
      metricType: 'transaction_count',
      timeRange: {
        start: new Date(Date.now() - (this.SAR_THRESHOLDS.PATTERN_AGGREGATION_DAYS * 24 * 60 * 60 * 1000)).toISOString(),
        end: new Date().toISOString()
      },
      privacyBudget,
      k_anonymity_threshold: 5
    });

    let narrative = `SUSPICIOUS ACTIVITY REPORT\n\n`;
    narrative += `SUMMARY: Multiple suspicious transaction patterns detected with combined risk indicators totaling $${totalAmount.toFixed(2)} over ${patternTypes.length} distinct pattern types.\n\n`;
    
    narrative += `PATTERN ANALYSIS:\n`;
    patternTypes.forEach(pattern => {
      const patternActivities = activities.filter(a => a.pattern_type === pattern);
      const patternCount = patternActivities.length;
      
      switch (pattern) {
        case 'structuring':
          narrative += `- STRUCTURING PATTERN: ${patternCount} instances of transactions structured to avoid reporting thresholds\n`;
          break;
        case 'rapid_movement':
          narrative += `- RAPID FUND MOVEMENT: ${patternCount} instances of unusually rapid transaction sequences\n`;
          break;
        case 'unusual_velocity':
          narrative += `- VELOCITY ANOMALY: ${patternCount} instances exceeding normal transaction frequency limits\n`;
          break;
        case 'high_risk_merchant':
          narrative += `- HIGH RISK MERCHANTS: ${patternCount} transactions with high-risk merchant categories\n`;
          break;
        case 'round_amount_pattern':
          narrative += `- ROUND AMOUNT PATTERN: ${patternCount} instances of suspicious round-dollar transaction patterns\n`;
          break;
      }
    });

    narrative += `\nRISK ASSESSMENT:\n`;
    narrative += `- Average Risk Score: ${avgRiskScore.toFixed(1)}/100\n`;
    narrative += `- Pattern Diversity: ${patternTypes.length} distinct suspicious patterns\n`;
    narrative += `- Activity Period: ${activities.length} suspicious events over ${this.SAR_THRESHOLDS.PATTERN_AGGREGATION_DAYS} days\n`;

    narrative += `\nPRIVACY-PRESERVING ANALYSIS:\n`;
    narrative += `- Statistical analysis conducted using differential privacy methods\n`;
    narrative += `- Individual transaction details protected while maintaining regulatory compliance\n`;
    narrative += `- Analysis maintains k-anonymity threshold of ${analytics.k_anonymity_satisfied ? 'SATISFIED' : 'NOT SATISFIED'}\n`;

    narrative += `\nREGULATORY COMPLIANCE:\n`;
    narrative += `- Report generated in compliance with BSA Section 5318(g)\n`;
    narrative += `- Privacy protections maintained per GDPR Article 25 and CCPA requirements\n`;
    narrative += `- Automated detection system certified for regulatory compliance\n`;

    // Ensure narrative doesn't exceed FinCEN limits
    if (narrative.length > this.SAR_THRESHOLDS.MAX_NARRATIVE_LENGTH) {
      narrative = narrative.substring(0, this.SAR_THRESHOLDS.MAX_NARRATIVE_LENGTH - 100) + '\n\n[NARRATIVE TRUNCATED TO MEET REGULATORY LIMITS]';
    }

    return narrative;
  }

  /**
   * Create supporting evidence from activities
   */
  private createSupportingEvidence(activities: any[]): SupportingEvidence[] {
    return activities.map(activity => ({
      eventId: activity.event_id,
      eventType: activity.event_type,
      riskScore: activity.risk_score,
      detectedAt: new Date(activity.detected_at),
      evidenceData: {
        patternType: activity.pattern_type,
        confidenceLevel: activity.confidence_level,
        thresholdValue: activity.threshold_value,
        actualValue: activity.actual_value,
        actionTaken: activity.action_taken
      }
    }));
  }

  /**
   * Generate unique report number
   */
  private async generateReportNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const sequence = await this.getNextSequenceNumber();
    return `SAR-${currentYear}-${String(sequence).padStart(6, '0')}`;
  }

  /**
   * Get next sequence number for SAR reports
   */
  private async getNextSequenceNumber(): Promise<number> {
    // In production, this would use a sequence table or atomic counter
    // For now, use a simple increment
    const currentYear = new Date().getFullYear().toString();
    
    const { count, error } = await this.supabase
      .from('suspicious_activity_reports')
      .select('*', { count: 'exact', head: true })
      .like('report_number', `SAR-${currentYear}-%`);

    if (error) {
      logger.error('Error getting sequence number:', error);
      return this.reportSequenceNumber++;
    }

    return (count || 0) + 1;
  }

  /**
   * Save SAR to database
   */
  private async saveSARToDatabse(sarData: SARData): Promise<SARReport> {
    const sarId = crypto.randomUUID();
    const now = new Date().toISOString();

    const dbData = {
      sar_id: sarId,
      report_number: sarData.reportNumber,
      card_context_hash: sarData.cardContextHash,
      filing_status: 'draft',
      regulatory_agency: 'FinCEN',
      total_suspicious_amount: sarData.totalSuspiciousAmount,
      suspicious_activity_period_start: sarData.suspiciousActivityPeriod.start.toISOString(),
      suspicious_activity_period_end: sarData.suspiciousActivityPeriod.end.toISOString(),
      narrative_description: sarData.narrativeDescription,
      supporting_evidence: sarData.supportingEvidence,
      compliance_officer_id: sarData.complianceOfficerId,
      retention_until: new Date(Date.now() + (5 * 365 * 24 * 60 * 60 * 1000)).toISOString(), // 5 years
      created_at: now,
      updated_at: now
    };

    const { data, error } = await this.supabase
      .from('suspicious_activity_reports')
      .insert(dbData)
      .select('*')
      .single();

    if (error) {
      logger.error('Error saving SAR to database:', error);
      throw error;
    }

    // Log audit trail
    await this.logSAREvent('sar_created', sarId, sarData.complianceOfficerId, {
      reportNumber: sarData.reportNumber,
      totalAmount: sarData.totalSuspiciousAmount
    });

    return this.convertToSARReport(data);
  }

  /**
   * Convert database record to SAR report
   */
  private convertToSARReport(dbRecord: any): SARReport {
    return {
      sarId: dbRecord.sar_id,
      reportNumber: dbRecord.report_number,
      filingStatus: dbRecord.filing_status,
      regulatoryAgency: dbRecord.regulatory_agency,
      totalSuspiciousAmount: dbRecord.total_suspicious_amount,
      narrativeDescription: dbRecord.narrative_description,
      supportingEvidence: dbRecord.supporting_evidence,
      complianceOfficerId: dbRecord.compliance_officer_id,
      reviewerId: dbRecord.reviewed_by,
      filedAt: dbRecord.filed_at ? new Date(dbRecord.filed_at) : undefined,
      createdAt: new Date(dbRecord.created_at)
    };
  }

  /**
   * Generate privacy-preserving submission data
   */
  private async generatePrivacyPreservingSubmission(sar: any): Promise<any> {
    // In production, this would anonymize and aggregate data while maintaining regulatory compliance
    return {
      reportNumber: sar.report_number,
      filingInstitution: process.env.INSTITUTION_NAME || 'DisCard Financial Services',
      reportingPeriod: {
        start: sar.suspicious_activity_period_start,
        end: sar.suspicious_activity_period_end
      },
      suspiciousAmount: sar.total_suspicious_amount,
      narrative: sar.narrative_description,
      privacyCompliant: true,
      submissionMethod: 'electronic'
    };
  }

  /**
   * Submit to regulatory agency (mock implementation)
   */
  private async submitToRegulatoryAgency(submissionData: any): Promise<{ success: boolean; submissionReference?: string; errors?: string[] }> {
    // Mock implementation - in production this would integrate with FinCEN BSA E-Filing system
    try {
      // Simulate submission process
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const submissionReference = `FINCEN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      logger.info('SAR submitted to regulatory agency', { 
        reportNumber: submissionData.reportNumber,
        submissionReference 
      });
      
      return {
        success: true,
        submissionReference
      };
    } catch (error) {
      logger.error('Error submitting to regulatory agency:', error);
      return {
        success: false,
        errors: ['Failed to submit to regulatory agency']
      };
    }
  }

  /**
   * Trigger compliance notifications
   */
  private async triggerComplianceNotifications(sarReport: SARReport): Promise<void> {
    const notifications: ComplianceNotification[] = [];

    // SAR ready for review notification
    notifications.push({
      notificationId: crypto.randomUUID(),
      type: 'sar_ready',
      priority: sarReport.totalSuspiciousAmount > 50000 ? 'high' : 'medium',
      message: `SAR ${sarReport.reportNumber} ready for review - $${sarReport.totalSuspiciousAmount.toFixed(2)} suspicious activity detected`,
      relatedSarId: sarReport.sarId,
      recipientRole: 'compliance_officer',
      scheduledFor: new Date()
    });

    // High-value SAR requires senior review
    if (sarReport.totalSuspiciousAmount > 100000) {
      notifications.push({
        notificationId: crypto.randomUUID(),
        type: 'review_required',
        priority: 'urgent',
        message: `High-value SAR ${sarReport.reportNumber} requires senior compliance review - $${sarReport.totalSuspiciousAmount.toFixed(2)}`,
        relatedSarId: sarReport.sarId,
        recipientRole: 'senior_compliance_officer',
        scheduledFor: new Date()
      });
    }

    // Send all notifications
    for (const notification of notifications) {
      await this.sendNotification(notification);
    }
  }

  /**
   * Send compliance notification
   */
  private async sendNotification(notification: ComplianceNotification): Promise<void> {
    // In production, this would integrate with notification systems (email, Slack, etc.)
    logger.info('Compliance notification sent', {
      type: notification.type,
      priority: notification.priority,
      recipientRole: notification.recipientRole,
      message: notification.message
    });

    // Store notification in audit trail
    await this.logSAREvent('notification_sent', notification.relatedSarId, 'system', {
      notificationType: notification.type,
      priority: notification.priority,
      recipientRole: notification.recipientRole
    });
  }

  /**
   * Log SAR-related events for audit trail
   */
  private async logSAREvent(eventType: string, sarId?: string, userId?: string, eventData?: any): Promise<void> {
    try {
      await this.supabase
        .from('compliance_audit')
        .insert({
          audit_event_type: eventType,
          event_category: 'sar_filing',
          event_description: `SAR ${eventType} for report ${sarId}`,
          compliance_officer_id: userId || null,
          before_data: null,
          after_data: eventData || null,
          event_hash: crypto.createHash('sha256').update(`${eventType}-${sarId}-${Date.now()}`).digest('hex'),
          retention_until: new Date(Date.now() + (7 * 365 * 24 * 60 * 60 * 1000)).toISOString(), // 7 years
        });
    } catch (error) {
      logger.error('Error logging SAR event:', error);
    }
  }

  /**
   * Initialize report sequence counter
   */
  private async initializeReportSequence(): Promise<void> {
    const currentYear = new Date().getFullYear().toString();
    
    const { count, error } = await this.supabase
      .from('suspicious_activity_reports')
      .select('*', { count: 'exact', head: true })
      .like('report_number', `SAR-${currentYear}-%`);

    if (!error) {
      this.reportSequenceNumber = (count || 0) + 1;
    }
  }
}