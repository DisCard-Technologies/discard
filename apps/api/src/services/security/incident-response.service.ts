import { supabase } from '../../utils/supabase';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { CardFreezeService } from './card-freeze.service';
import { logger } from '../../utils/logger';
import { createClient } from 'redis';

export interface SecurityIncident {
  incidentId?: string;
  cardId: string;
  incidentType: 'fraud_attempt' | 'account_takeover' | 'suspicious_pattern' | 'compliance_violation' | 'system_breach_attempt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  relatedEvents: string[]; // fraud event IDs
  incidentData: Record<string, any>;
  responseActions?: ResponseAction[];
}

export interface ResponseAction {
  actionType: 'card_freeze' | 'alert_user' | 'escalate' | 'investigate' | 'mitigate' | 'log_only';
  actionData: Record<string, any>;
  timestamp: Date;
  result?: 'success' | 'failure' | 'pending';
  details?: string;
}

export interface IncidentClassification {
  incidentType: SecurityIncident['incidentType'];
  severity: SecurityIncident['severity'];
  confidence: number; // 0-1
  reasoning: string;
}

export interface AutoResponseConfig {
  enabled: boolean;
  severityThreshold: 'medium' | 'high' | 'critical';
  actions: {
    cardFreeze: boolean;
    userAlert: boolean;
    escalation: boolean;
  };
  falsePositiveThreshold: number; // 0-1
}

export class IncidentResponseService {
  private isolationService: TransactionIsolationService;
  private cardFreezeService: CardFreezeService;
  private redis: ReturnType<typeof createClient>;
  
  private readonly REDIS_KEYS = {
    FALSE_POSITIVE_RATE: (cardId: string) => `incident:fp_rate:${cardId}`,
    INCIDENT_CACHE: (incidentId: string) => `incident:cache:${incidentId}`,
    RESPONSE_HISTORY: (cardId: string) => `incident:history:${cardId}`
  };

  private readonly TTL = {
    FALSE_POSITIVE_RATE: 86400, // 24 hours
    INCIDENT_CACHE: 3600, // 1 hour
    RESPONSE_HISTORY: 604800 // 7 days
  };

  // Default response configuration
  private readonly DEFAULT_CONFIG: AutoResponseConfig = {
    enabled: true,
    severityThreshold: 'high',
    actions: {
      cardFreeze: true,
      userAlert: true,
      escalation: false
    },
    falsePositiveThreshold: 0.1 // 10%
  };

  constructor() {
    this.isolationService = new TransactionIsolationService(supabase);
    this.cardFreezeService = new CardFreezeService();
    this.redis = createClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('Redis connection failed:', err);
    });
  }

  async createIncident(incident: SecurityIncident): Promise<string> {
    try {
      // Enforce isolation
      await this.isolationService.enforceTransactionIsolation(incident.cardId);
      const isolationContext = await this.isolationService.getCardContext(incident.cardId);
      
      // Validate related events exist and belong to same card
      await this.validateRelatedEvents(incident.relatedEvents, isolationContext.cardContextHash);
      
      // Store incident in database
      const { data, error } = await supabase
        .from('security_incidents')
        .insert({
          card_context_hash: isolationContext.cardContextHash,
          incident_type: incident.incidentType,
          severity: incident.severity,
          related_events: incident.relatedEvents,
          incident_data: this.encryptSensitiveData(incident.incidentData),
          status: 'detected'
        })
        .select('incident_id')
        .single();
      
      if (error) {
        throw new Error(`Failed to create incident: ${error.message}`);
      }
      
      const incidentId = data.incident_id;
      
      // Cache incident for quick access
      await this.cacheIncident(incidentId, incident);
      
      // Trigger automatic response if configured
      await this.triggerAutoResponse(incidentId, incident);
      
      return incidentId;
      
    } catch (error) {
      logger.error('Failed to create security incident:', error);
      throw error;
    }
  }

  async classifyIncident(
    events: any[],
    cardId: string
  ): Promise<IncidentClassification> {
    try {
      // Analyze event patterns
      const eventTypes = events.map(e => e.event_type);
      const riskScores = events.map(e => e.risk_score);
      const maxRiskScore = Math.max(...riskScores);
      const eventCount = events.length;
      
      // Classification logic
      if (this.hasBruteForcePattern(events)) {
        return {
          incidentType: 'account_takeover',
          severity: maxRiskScore > 80 ? 'critical' : 'high',
          confidence: 0.85,
          reasoning: 'Multiple failed authentication or high-velocity suspicious transactions detected'
        };
      }
      
      if (this.hasGeographicAnomalies(events)) {
        return {
          incidentType: 'fraud_attempt',
          severity: this.calculateGeographicSeverity(events),
          confidence: 0.75,
          reasoning: 'Impossible geographic travel patterns detected'
        };
      }
      
      if (this.hasSuspiciousPatterns(events)) {
        return {
          incidentType: 'suspicious_pattern',
          severity: this.calculatePatternSeverity(events),
          confidence: 0.6,
          reasoning: 'Unusual transaction patterns requiring investigation'
        };
      }
      
      // Default classification
      return {
        incidentType: 'fraud_attempt',
        severity: maxRiskScore > 75 ? 'high' : 'medium',
        confidence: 0.5,
        reasoning: 'Standard fraud detection based on risk scores'
      };
      
    } catch (error) {
      logger.error('Failed to classify incident:', error);
      throw error;
    }
  }

  async executeResponse(
    incidentId: string,
    actions: ResponseAction[]
  ): Promise<ResponseAction[]> {
    try {
      const executedActions: ResponseAction[] = [];
      
      for (const action of actions) {
        const executedAction = await this.executeAction(incidentId, action);
        executedActions.push(executedAction);
        
        // Update incident with response actions
        await this.updateIncidentActions(incidentId, executedActions);
      }
      
      return executedActions;
      
    } catch (error) {
      logger.error('Failed to execute incident response:', error);
      throw error;
    }
  }

  private async executeAction(
    incidentId: string,
    action: ResponseAction
  ): Promise<ResponseAction> {
    const startTime = Date.now();
    
    try {
      let result: ResponseAction['result'] = 'pending';
      let details = '';
      
      switch (action.actionType) {
        case 'card_freeze':
          result = await this.executeCardFreeze(action);
          details = result === 'success' ? 'Card frozen successfully' : 'Failed to freeze card';
          break;
          
        case 'alert_user':
          result = await this.executeUserAlert(action);
          details = result === 'success' ? 'User alert sent' : 'Failed to send alert';
          break;
          
        case 'escalate':
          result = await this.executeEscalation(action);
          details = result === 'success' ? 'Incident escalated' : 'Escalation failed';
          break;
          
        case 'investigate':
          result = await this.executeInvestigation(action);
          details = 'Investigation initiated';
          break;
          
        case 'mitigate':
          result = await this.executeMitigation(action);
          details = 'Mitigation measures applied';
          break;
          
        case 'log_only':
          result = 'success';
          details = 'Incident logged for review';
          break;
          
        default:
          result = 'failure';
          details = `Unknown action type: ${action.actionType}`;
      }
      
      const executionTime = Date.now() - startTime;
      logger.info(`Executed ${action.actionType} in ${executionTime}ms`);
      
      return {
        ...action,
        timestamp: new Date(),
        result,
        details
      };
      
    } catch (error) {
      logger.error(`Failed to execute ${action.actionType}:`, error);
      return {
        ...action,
        timestamp: new Date(),
        result: 'failure',
        details: error.message
      };
    }
  }

  private async executeCardFreeze(action: ResponseAction): Promise<'success' | 'failure'> {
    try {
      const { cardId, reason } = action.actionData;
      const result = await this.cardFreezeService.freezeCard({
        cardId,
        reason: 'fraud_detected',
        metadata: { automated: true, reason }
      });
      
      return result.success ? 'success' : 'failure';
    } catch (error) {
      return 'failure';
    }
  }

  private async executeUserAlert(action: ResponseAction): Promise<'success' | 'failure'> {
    try {
      // In real implementation, this would send push notification
      // For now, just log the alert
      logger.info('User alert:', action.actionData);
      return 'success';
    } catch (error) {
      return 'failure';
    }
  }

  private async executeEscalation(action: ResponseAction): Promise<'success' | 'failure'> {
    try {
      // In real implementation, this would notify security team
      logger.warn('Security incident escalated:', action.actionData);
      return 'success';
    } catch (error) {
      return 'failure';
    }
  }

  private async executeInvestigation(action: ResponseAction): Promise<'success' | 'failure'> {
    try {
      // Mark incident for investigation
      logger.info('Investigation initiated:', action.actionData);
      return 'success';
    } catch (error) {
      return 'failure';
    }
  }

  private async executeMitigation(action: ResponseAction): Promise<'success' | 'failure'> {
    try {
      // Apply mitigation measures
      logger.info('Mitigation applied:', action.actionData);
      return 'success';
    } catch (error) {
      return 'failure';
    }
  }

  async recordFalsePositive(incidentId: string, cardId: string): Promise<void> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      // Update incident status
      await supabase
        .from('security_incidents')
        .update({
          status: 'resolved',
          resolution_summary: 'False positive - user reported'
        })
        .eq('incident_id', incidentId);
      
      // Update false positive rate
      await this.updateFalsePositiveRate(cardId, true);
      
      // Update ML model with feedback
      const incident = await this.getIncidentDetails(incidentId);
      if (incident?.related_events) {
        for (const eventId of incident.related_events) {
          await this.recordEventFeedback(cardId, eventId, true);
        }
      }
      
    } catch (error) {
      logger.error('Failed to record false positive:', error);
      throw error;
    }
  }

  private async triggerAutoResponse(
    incidentId: string,
    incident: SecurityIncident
  ): Promise<void> {
    try {
      const config = this.DEFAULT_CONFIG; // In real app, get user/card-specific config
      
      if (!config.enabled) {
        return;
      }
      
      // Check severity threshold
      const severityOrder = ['low', 'medium', 'high', 'critical'];
      const incidentSeverityIndex = severityOrder.indexOf(incident.severity);
      const thresholdIndex = severityOrder.indexOf(config.severityThreshold);
      
      if (incidentSeverityIndex < thresholdIndex) {
        return;
      }
      
      // Check false positive rate
      const fpRate = await this.getFalsePositiveRate(incident.cardId);
      if (fpRate > config.falsePositiveThreshold) {
        logger.info(`Skipping auto-response due to high FP rate: ${fpRate}`);
        return;
      }
      
      // Generate response actions
      const actions: ResponseAction[] = [];
      
      if (config.actions.cardFreeze && incident.severity === 'critical') {
        actions.push({
          actionType: 'card_freeze',
          actionData: {
            cardId: incident.cardId,
            reason: `Auto-freeze for ${incident.incidentType}`
          },
          timestamp: new Date()
        });
      }
      
      if (config.actions.userAlert) {
        actions.push({
          actionType: 'alert_user',
          actionData: {
            cardId: incident.cardId,
            message: `Security alert: ${incident.incidentType} detected`,
            severity: incident.severity
          },
          timestamp: new Date()
        });
      }
      
      if (config.actions.escalation && incident.severity === 'critical') {
        actions.push({
          actionType: 'escalate',
          actionData: {
            incidentId,
            severity: incident.severity,
            type: incident.incidentType
          },
          timestamp: new Date()
        });
      }
      
      // Execute actions
      if (actions.length > 0) {
        await this.executeResponse(incidentId, actions);
      }
      
    } catch (error) {
      logger.error('Auto-response failed:', error);
    }
  }

  private hasBruteForcePattern(events: any[]): boolean {
    const recentEvents = events.filter(e => 
      new Date(e.detected_at).getTime() > Date.now() - (5 * 60 * 1000) // Last 5 minutes
    );
    
    return recentEvents.length >= 5; // 5+ events in 5 minutes
  }

  private hasGeographicAnomalies(events: any[]): boolean {
    return events.some(e => 
      e.anomalies?.some((a: any) => 
        a.type === 'geographic' && a.details?.includes('impossible')
      )
    );
  }

  private hasSuspiciousPatterns(events: any[]): boolean {
    const patternTypes = events.flatMap(e => 
      e.anomalies?.map((a: any) => a.type) || []
    );
    
    // Multiple different anomaly types = suspicious pattern
    return new Set(patternTypes).size >= 3;
  }

  private calculateGeographicSeverity(events: any[]): 'medium' | 'high' | 'critical' {
    const impossibleTravel = events.some(e =>
      e.anomalies?.some((a: any) => a.details?.includes('impossible'))
    );
    
    return impossibleTravel ? 'critical' : 'high';
  }

  private calculatePatternSeverity(events: any[]): 'low' | 'medium' | 'high' {
    const avgRiskScore = events.reduce((sum, e) => sum + e.risk_score, 0) / events.length;
    
    if (avgRiskScore > 70) return 'high';
    if (avgRiskScore > 40) return 'medium';
    return 'low';
  }

  private async validateRelatedEvents(
    eventIds: string[],
    cardContextHash: string
  ): Promise<void> {
    for (const eventId of eventIds) {
      const { data, error } = await supabase
        .from('fraud_events')
        .select('card_context_hash')
        .eq('event_id', eventId)
        .single();
      
      if (error || !data || data.card_context_hash !== cardContextHash) {
        throw new Error(`Invalid or unauthorized event: ${eventId}`);
      }
    }
  }

  private encryptSensitiveData(data: Record<string, any>): Record<string, any> {
    // In real implementation, encrypt sensitive fields
    return data;
  }

  private async cacheIncident(incidentId: string, incident: SecurityIncident): Promise<void> {
    await this.redis.setEx(
      this.REDIS_KEYS.INCIDENT_CACHE(incidentId),
      this.TTL.INCIDENT_CACHE,
      JSON.stringify(incident)
    );
  }

  private async updateIncidentActions(
    incidentId: string,
    actions: ResponseAction[]
  ): Promise<void> {
    await supabase
      .from('security_incidents')
      .update({
        response_actions: actions,
        status: actions.some(a => a.result === 'failure') ? 'investigating' : 'mitigated'
      })
      .eq('incident_id', incidentId);
  }

  private async getIncidentDetails(incidentId: string): Promise<any> {
    const { data } = await supabase
      .from('security_incidents')
      .select('*')
      .eq('incident_id', incidentId)
      .single();
    
    return data;
  }

  private async getFalsePositiveRate(cardId: string): Promise<number> {
    const cached = await this.redis.get(this.REDIS_KEYS.FALSE_POSITIVE_RATE(cardId));
    if (cached) {
      return parseFloat(cached);
    }
    
    // Calculate from database
    // In real implementation, this would calculate FP rate from historical data
    return 0.05; // Default 5%
  }

  private async updateFalsePositiveRate(cardId: string, isFalsePositive: boolean): Promise<void> {
    // In real implementation, update running FP rate calculation
    const currentRate = await this.getFalsePositiveRate(cardId);
    const newRate = isFalsePositive ? Math.min(1, currentRate + 0.01) : Math.max(0, currentRate - 0.01);
    
    await this.redis.setEx(
      this.REDIS_KEYS.FALSE_POSITIVE_RATE(cardId),
      this.TTL.FALSE_POSITIVE_RATE,
      newRate.toString()
    );
  }

  private async recordEventFeedback(cardId: string, eventId: string, falsePositive: boolean): Promise<void> {
    // Use ML service to record feedback
    // This would typically import MLFraudModelService
    logger.info(`Recording feedback for event ${eventId}: FP=${falsePositive}`);
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}