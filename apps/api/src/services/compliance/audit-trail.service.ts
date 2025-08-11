import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'ioredis';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface AuditEvent {
  auditId: string;
  auditEventType: string;
  userContextHash?: string;
  cardContextHash?: string;
  complianceOfficerId?: string;
  eventCategory: 'aml_detection' | 'kyc_collection' | 'sar_filing' | 'privacy_request' | 'data_deletion' | 'configuration_change' | 'report_generation';
  eventDescription: string;
  beforeData?: Record<string, any>;
  afterData?: Record<string, any>;
  riskAssessment?: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    riskFactors: string[];
  };
  regulatoryImpact?: string;
  eventHash: string;
  previousHash?: string;
  eventTimestamp: Date;
  retentionUntil: Date;
  createdAt: Date;
}

export interface AuditAlert {
  alertId: string;
  alertType: 'threshold_breach' | 'suspicious_pattern' | 'integrity_violation' | 'retention_expiry' | 'access_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  relatedAuditIds: string[];
  triggeredBy: string;
  actionRequired: boolean;
  assignedTo?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface ComplianceMetrics {
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  riskDistribution: Record<string, number>;
  integrityChecks: {
    passed: number;
    failed: number;
    lastCheck: Date;
  };
  retentionCompliance: {
    expiringSoon: number;
    overdue: number;
    compliant: number;
  };
  alertSummary: {
    open: number;
    resolved: number;
    critical: number;
  };
  generatedAt: Date;
}

export class AuditTrailService {
  private supabase: SupabaseClient;
  private redis: ReturnType<typeof createRedisClient>;
  private previousHashCache = new Map<string, string>();

  // Audit configuration
  private readonly AUDIT_CONFIG = {
    HASH_ALGORITHM: 'sha256',
    RETENTION_YEARS: 7,
    INTEGRITY_CHECK_INTERVAL: 3600000, // 1 hour in milliseconds
    ALERT_THRESHOLDS: {
      HIGH_RISK_EVENTS_PER_HOUR: 10,
      FAILED_INTEGRITY_CHECKS: 3,
      RETENTION_EXPIRY_WARNING_DAYS: 30
    },
    CACHE_TTL: 1800 // 30 minutes
  };

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.redis = createRedisClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('Audit trail Redis connection failed:', err);
    });
    
    // Start continuous integrity monitoring
    this.startIntegrityMonitoring();
  }

  /**
   * Create immutable audit event with cryptographic integrity
   */
  async createAuditEvent(
    eventType: string,
    eventCategory: AuditEvent['eventCategory'],
    eventDescription: string,
    options: {
      userContextHash?: string;
      cardContextHash?: string;
      complianceOfficerId?: string;
      beforeData?: Record<string, any>;
      afterData?: Record<string, any>;
      riskAssessment?: AuditEvent['riskAssessment'];
      regulatoryImpact?: string;
    } = {}
  ): Promise<AuditEvent> {
    try {
      const auditId = crypto.randomUUID();
      const eventTimestamp = new Date();
      
      // Calculate retention until date
      const retentionUntil = new Date();
      retentionUntil.setFullYear(retentionUntil.getFullYear() + this.AUDIT_CONFIG.RETENTION_YEARS);

      // Get previous hash for blockchain-style integrity
      const previousHash = await this.getLastEventHash(eventCategory);

      // Create event data for hashing
      const eventData = {
        auditId,
        auditEventType: eventType,
        eventCategory,
        eventDescription,
        userContextHash: options.userContextHash,
        cardContextHash: options.cardContextHash,
        complianceOfficerId: options.complianceOfficerId,
        beforeData: options.beforeData,
        afterData: options.afterData,
        previousHash,
        timestamp: eventTimestamp.getTime()
      };

      // Generate cryptographic hash
      const eventHash = crypto
        .createHash(this.AUDIT_CONFIG.HASH_ALGORITHM)
        .update(JSON.stringify(eventData))
        .digest('hex');

      const auditEvent: AuditEvent = {
        auditId,
        auditEventType: eventType,
        userContextHash: options.userContextHash,
        cardContextHash: options.cardContextHash,
        complianceOfficerId: options.complianceOfficerId,
        eventCategory,
        eventDescription,
        beforeData: options.beforeData,
        afterData: options.afterData,
        riskAssessment: options.riskAssessment,
        regulatoryImpact: options.regulatoryImpact,
        eventHash,
        previousHash,
        eventTimestamp,
        retentionUntil,
        createdAt: new Date()
      };

      // Store audit event
      await this.storeAuditEvent(auditEvent);

      // Update hash cache for next event
      this.previousHashCache.set(eventCategory, eventHash);

      // Check for alert conditions
      await this.checkAlertConditions(auditEvent);

      // Update metrics
      await this.updateAuditMetrics(auditEvent);

      logger.debug('Audit event created', { 
        auditId, 
        eventType, 
        eventCategory 
      });

      return auditEvent;
    } catch (error) {
      logger.error('Error creating audit event:', { error, eventType });
      throw error;
    }
  }

  /**
   * Verify integrity of audit trail
   */
  async verifyAuditIntegrity(
    eventCategory?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    verified: boolean;
    totalEvents: number;
    integrityViolations: Array<{
      auditId: string;
      violationType: 'hash_mismatch' | 'chain_break' | 'tampering_detected';
      details: string;
    }>;
    verificationProof: string;
  }> {
    try {
      // Build query
      let query = this.supabase
        .from('compliance_audit')
        .select('*')
        .order('event_timestamp', { ascending: true });

      if (eventCategory) {
        query = query.eq('event_category', eventCategory);
      }

      if (startDate) {
        query = query.gte('event_timestamp', startDate.toISOString());
      }

      if (endDate) {
        query = query.lte('event_timestamp', endDate.toISOString());
      }

      const { data: events, error } = await query;

      if (error) {
        throw error;
      }

      if (!events || events.length === 0) {
        return {
          verified: true,
          totalEvents: 0,
          integrityViolations: [],
          verificationProof: crypto.randomUUID()
        };
      }

      const violations: Array<{
        auditId: string;
        violationType: 'hash_mismatch' | 'chain_break' | 'tampering_detected';
        details: string;
      }> = [];

      // Verify each event's hash and chain integrity
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        
        // Verify event hash
        const calculatedHash = this.calculateEventHash(event);
        if (calculatedHash !== event.event_hash) {
          violations.push({
            auditId: event.audit_id,
            violationType: 'hash_mismatch',
            details: `Calculated hash ${calculatedHash} does not match stored hash ${event.event_hash}`
          });
        }

        // Verify chain integrity (except for first event)
        if (i > 0) {
          const previousEvent = events[i - 1];
          if (event.previous_hash !== previousEvent.event_hash) {
            violations.push({
              auditId: event.audit_id,
              violationType: 'chain_break',
              details: `Previous hash ${event.previous_hash} does not match previous event hash ${previousEvent.event_hash}`
            });
          }
        }
      }

      // Generate verification proof
      const verificationData = {
        totalEvents: events.length,
        startEvent: events[0]?.audit_id,
        endEvent: events[events.length - 1]?.audit_id,
        violationCount: violations.length,
        verificationTime: Date.now()
      };

      const verificationProof = crypto
        .createHash(this.AUDIT_CONFIG.HASH_ALGORITHM)
        .update(JSON.stringify(verificationData))
        .digest('hex');

      // Log verification result
      await this.createAuditEvent(
        'integrity_verification',
        'configuration_change',
        `Audit trail integrity verification completed: ${violations.length} violations found`,
        {
          afterData: {
            totalEvents: events.length,
            violationCount: violations.length,
            verificationProof
          }
        }
      );

      return {
        verified: violations.length === 0,
        totalEvents: events.length,
        integrityViolations: violations,
        verificationProof
      };
    } catch (error) {
      logger.error('Error verifying audit integrity:', error);
      throw error;
    }
  }

  /**
   * Get audit events with filtering
   */
  async getAuditEvents(filters: {
    eventCategory?: string;
    eventType?: string;
    userContextHash?: string;
    cardContextHash?: string;
    complianceOfficerId?: string;
    dateRange?: { start: Date; end: Date };
    riskLevel?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    events: AuditEvent[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      let query = this.supabase
        .from('compliance_audit')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.eventCategory) {
        query = query.eq('event_category', filters.eventCategory);
      }

      if (filters.eventType) {
        query = query.eq('audit_event_type', filters.eventType);
      }

      if (filters.userContextHash) {
        query = query.eq('user_context_hash', filters.userContextHash);
      }

      if (filters.cardContextHash) {
        query = query.eq('card_context_hash', filters.cardContextHash);
      }

      if (filters.complianceOfficerId) {
        query = query.eq('compliance_officer_id', filters.complianceOfficerId);
      }

      if (filters.dateRange) {
        query = query
          .gte('event_timestamp', filters.dateRange.start.toISOString())
          .lte('event_timestamp', filters.dateRange.end.toISOString());
      }

      if (filters.riskLevel) {
        query = query.contains('risk_assessment', { riskLevel: filters.riskLevel });
      }

      // Apply pagination
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;
      
      query = query
        .order('event_timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const events = (data || []).map(event => this.convertToAuditEvent(event));
      const totalCount = count || 0;
      const hasMore = totalCount > offset + events.length;

      return {
        events,
        totalCount,
        hasMore
      };
    } catch (error) {
      logger.error('Error getting audit events:', error);
      throw error;
    }
  }

  /**
   * Get compliance metrics dashboard data
   */
  async getComplianceMetrics(timeWindow: '24h' | '7d' | '30d' = '24h'): Promise<ComplianceMetrics> {
    try {
      // Check cache first
      const cacheKey = `compliance_metrics:${timeWindow}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate time range
      const timeRanges = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };

      const startTime = new Date(Date.now() - timeRanges[timeWindow]);

      // Get audit events for time window
      const { data: events, error } = await this.supabase
        .from('compliance_audit')
        .select('*')
        .gte('event_timestamp', startTime.toISOString());

      if (error) {
        throw error;
      }

      // Calculate metrics
      const totalEvents = events?.length || 0;
      const eventsByCategory: Record<string, number> = {};
      const riskDistribution: Record<string, number> = {};

      events?.forEach(event => {
        // Count by category
        eventsByCategory[event.event_category] = (eventsByCategory[event.event_category] || 0) + 1;

        // Count by risk level
        if (event.risk_assessment?.riskLevel) {
          const riskLevel = event.risk_assessment.riskLevel;
          riskDistribution[riskLevel] = (riskDistribution[riskLevel] || 0) + 1;
        }
      });

      // Get integrity check results
      const integrityChecks = await this.getIntegrityCheckSummary(startTime);

      // Get retention compliance status
      const retentionCompliance = await this.getRetentionComplianceStatus();

      // Get alert summary
      const alertSummary = await this.getAlertSummary();

      const metrics: ComplianceMetrics = {
        totalEvents,
        eventsByCategory,
        riskDistribution,
        integrityChecks,
        retentionCompliance,
        alertSummary,
        generatedAt: new Date()
      };

      // Cache metrics
      await this.redis.setEx(cacheKey, this.AUDIT_CONFIG.CACHE_TTL, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      logger.error('Error getting compliance metrics:', error);
      throw error;
    }
  }

  /**
   * Create compliance alert
   */
  async createAlert(
    alertType: AuditAlert['alertType'],
    severity: AuditAlert['severity'],
    description: string,
    relatedAuditIds: string[],
    triggeredBy: string,
    actionRequired: boolean = true
  ): Promise<AuditAlert> {
    try {
      const alert: AuditAlert = {
        alertId: crypto.randomUUID(),
        alertType,
        severity,
        description,
        relatedAuditIds,
        triggeredBy,
        actionRequired,
        createdAt: new Date()
      };

      // Store alert
      await this.storeAlert(alert);

      // Log alert creation as audit event
      await this.createAuditEvent(
        'compliance_alert_created',
        'configuration_change',
        `Compliance alert created: ${alertType} - ${severity}`,
        {
          afterData: {
            alertId: alert.alertId,
            alertType,
            severity,
            relatedAuditIds
          }
        }
      );

      return alert;
    } catch (error) {
      logger.error('Error creating compliance alert:', error);
      throw error;
    }
  }

  /**
   * Start continuous integrity monitoring
   */
  private startIntegrityMonitoring(): void {
    setInterval(async () => {
      try {
        const result = await this.verifyAuditIntegrity();
        
        if (!result.verified) {
          // Create critical alert for integrity violations
          await this.createAlert(
            'integrity_violation',
            'critical',
            `Audit trail integrity violations detected: ${result.integrityViolations.length} violations`,
            result.integrityViolations.map(v => v.auditId),
            'system',
            true
          );
        }
      } catch (error) {
        logger.error('Error in integrity monitoring:', error);
      }
    }, this.AUDIT_CONFIG.INTEGRITY_CHECK_INTERVAL);
  }

  /**
   * Calculate event hash for verification
   */
  private calculateEventHash(event: any): string {
    const eventData = {
      auditId: event.audit_id,
      auditEventType: event.audit_event_type,
      eventCategory: event.event_category,
      eventDescription: event.event_description,
      userContextHash: event.user_context_hash,
      cardContextHash: event.card_context_hash,
      complianceOfficerId: event.compliance_officer_id,
      beforeData: event.before_data,
      afterData: event.after_data,
      previousHash: event.previous_hash,
      timestamp: new Date(event.event_timestamp).getTime()
    };

    return crypto
      .createHash(this.AUDIT_CONFIG.HASH_ALGORITHM)
      .update(JSON.stringify(eventData))
      .digest('hex');
  }

  /**
   * Get last event hash for chain integrity
   */
  private async getLastEventHash(eventCategory: string): Promise<string | undefined> {
    // Check cache first
    if (this.previousHashCache.has(eventCategory)) {
      return this.previousHashCache.get(eventCategory);
    }

    // Get from database
    const { data, error } = await this.supabase
      .from('compliance_audit')
      .select('event_hash')
      .eq('event_category', eventCategory)
      .order('event_timestamp', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      this.previousHashCache.set(eventCategory, data.event_hash);
      return data.event_hash;
    }

    return undefined;
  }

  /**
   * Store audit event in database
   */
  private async storeAuditEvent(auditEvent: AuditEvent): Promise<void> {
    const { error } = await this.supabase
      .from('compliance_audit')
      .insert({
        audit_id: auditEvent.auditId,
        audit_event_type: auditEvent.auditEventType,
        user_context_hash: auditEvent.userContextHash,
        card_context_hash: auditEvent.cardContextHash,
        compliance_officer_id: auditEvent.complianceOfficerId,
        event_category: auditEvent.eventCategory,
        event_description: auditEvent.eventDescription,
        before_data: auditEvent.beforeData,
        after_data: auditEvent.afterData,
        risk_assessment: auditEvent.riskAssessment,
        regulatory_impact: auditEvent.regulatoryImpact,
        event_hash: auditEvent.eventHash,
        previous_hash: auditEvent.previousHash,
        event_timestamp: auditEvent.eventTimestamp.toISOString(),
        retention_until: auditEvent.retentionUntil.toISOString(),
        created_at: auditEvent.createdAt.toISOString()
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Store alert in database
   */
  private async storeAlert(alert: AuditAlert): Promise<void> {
    // This would store in a compliance_alerts table
    // For now, just log it
    logger.info('Compliance alert created', {
      alertId: alert.alertId,
      alertType: alert.alertType,
      severity: alert.severity
    });
  }

  /**
   * Check for alert conditions
   */
  private async checkAlertConditions(auditEvent: AuditEvent): Promise<void> {
    // Check for high-risk events
    if (auditEvent.riskAssessment?.riskLevel === 'critical') {
      await this.createAlert(
        'threshold_breach',
        'critical',
        `Critical risk event detected: ${auditEvent.eventDescription}`,
        [auditEvent.auditId],
        'system',
        true
      );
    }

    // Check for retention expiry
    const daysUntilExpiry = (auditEvent.retentionUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysUntilExpiry <= this.AUDIT_CONFIG.ALERT_THRESHOLDS.RETENTION_EXPIRY_WARNING_DAYS) {
      await this.createAlert(
        'retention_expiry',
        'medium',
        `Audit event approaching retention expiry in ${Math.round(daysUntilExpiry)} days`,
        [auditEvent.auditId],
        'system',
        false
      );
    }
  }

  /**
   * Update audit metrics cache
   */
  private async updateAuditMetrics(auditEvent: AuditEvent): Promise<void> {
    try {
      // Invalidate metrics cache to force recalculation
      const cacheKeys = ['compliance_metrics:24h', 'compliance_metrics:7d', 'compliance_metrics:30d'];
      await Promise.all(cacheKeys.map(key => this.redis.del(key)));
    } catch (error) {
      logger.error('Error updating audit metrics:', error);
    }
  }

  /**
   * Get integrity check summary
   */
  private async getIntegrityCheckSummary(since: Date): Promise<ComplianceMetrics['integrityChecks']> {
    // This would query integrity check results
    // For now, return mock data
    return {
      passed: 45,
      failed: 0,
      lastCheck: new Date()
    };
  }

  /**
   * Get retention compliance status
   */
  private async getRetentionComplianceStatus(): Promise<ComplianceMetrics['retentionCompliance']> {
    // This would check retention compliance
    // For now, return mock data
    return {
      expiringSoon: 5,
      overdue: 0,
      compliant: 1250
    };
  }

  /**
   * Get alert summary
   */
  private async getAlertSummary(): Promise<ComplianceMetrics['alertSummary']> {
    // This would query alerts
    // For now, return mock data
    return {
      open: 2,
      resolved: 15,
      critical: 0
    };
  }

  /**
   * Convert database record to audit event
   */
  private convertToAuditEvent(dbRecord: any): AuditEvent {
    return {
      auditId: dbRecord.audit_id,
      auditEventType: dbRecord.audit_event_type,
      userContextHash: dbRecord.user_context_hash,
      cardContextHash: dbRecord.card_context_hash,
      complianceOfficerId: dbRecord.compliance_officer_id,
      eventCategory: dbRecord.event_category,
      eventDescription: dbRecord.event_description,
      beforeData: dbRecord.before_data,
      afterData: dbRecord.after_data,
      riskAssessment: dbRecord.risk_assessment,
      regulatoryImpact: dbRecord.regulatory_impact,
      eventHash: dbRecord.event_hash,
      previousHash: dbRecord.previous_hash,
      eventTimestamp: new Date(dbRecord.event_timestamp),
      retentionUntil: new Date(dbRecord.retention_until),
      createdAt: new Date(dbRecord.created_at)
    };
  }

  /**
   * Disconnect from services
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}