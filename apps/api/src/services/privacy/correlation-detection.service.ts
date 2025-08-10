import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';

interface AccessPattern {
  trackingId: string;
  contextHash: string;
  accessTimestamp: Date;
  accessType: 'read' | 'write' | 'context_switch' | 'query';
  querySignature?: string;
  ipHash?: string;
  sessionHash?: string;
  potentialCorrelation: boolean;
}

interface CorrelationResult {
  correlationType: 'temporal' | 'spatial' | 'behavioral' | 'ip_based' | 'session_based';
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
  affectedContexts: string[];
  detectedAt: Date;
  evidence: any;
}

interface CorrelationRisk {
  overallRiskLevel: 'low' | 'medium' | 'high';
  violationDetected: boolean;
  mitigationRequired: boolean;
  correlationTypes: CorrelationResult[];
}

export class CorrelationDetectionService {
  private supabase: SupabaseClient;
  private readonly TEMPORAL_WINDOW_MS = 300000; // 5 minutes
  private readonly CORRELATION_THRESHOLD = 0.7;
  private readonly MIN_PATTERN_COUNT = 3;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Detect cross-card correlation attempts
   */
  async detectCrossCardCorrelation(): Promise<CorrelationResult[]> {
    try {
      const accessPatterns = await this.getRecentAccessPatterns();
      const correlations: CorrelationResult[] = [];

      // Run multiple correlation detection algorithms
      const temporalCorrelation = await this.analyzeTemporalPatterns(accessPatterns);
      if (temporalCorrelation) correlations.push(temporalCorrelation);

      const spatialCorrelation = await this.analyzeSpatialPatterns(accessPatterns);
      if (spatialCorrelation) correlations.push(spatialCorrelation);

      const behavioralCorrelation = await this.analyzeBehavioralPatterns(accessPatterns);
      if (behavioralCorrelation) correlations.push(behavioralCorrelation);

      const ipCorrelation = await this.analyzeIpPatterns(accessPatterns);
      if (ipCorrelation) correlations.push(ipCorrelation);

      const sessionCorrelation = await this.analyzeSessionPatterns(accessPatterns);
      if (sessionCorrelation) correlations.push(sessionCorrelation);

      // Log detected correlations
      for (const correlation of correlations) {
        await this.logCorrelationDetection(correlation);
      }

      return correlations;
    } catch (error) {
      logger.error('Error detecting cross-card correlation', { error });
      return [];
    }
  }

  /**
   * Monitor access patterns for anomalies
   */
  async monitorAccessPatterns(): Promise<AccessPattern[]> {
    try {
      const { data, error } = await this.supabase
        .from('access_pattern_tracking')
        .select('*')
        .gte('access_timestamp', new Date(Date.now() - this.TEMPORAL_WINDOW_MS).toISOString())
        .order('access_timestamp', { ascending: false });

      if (error) {
        logger.error('Failed to retrieve access patterns', { error });
        return [];
      }

      return this.mapAccessPatterns(data || []);
    } catch (error) {
      logger.error('Error monitoring access patterns', { error });
      return [];
    }
  }

  /**
   * Identify privacy violations
   */
  async identifyPrivacyViolations(): Promise<{
    violationType: string;
    severity: 'low' | 'medium' | 'high';
    affectedCards: string[];
    timestamp: Date;
  }[]> {
    try {
      const correlations = await this.detectCrossCardCorrelation();
      const violations = [];

      for (const correlation of correlations) {
        if (correlation.riskLevel === 'high' || correlation.confidence > 0.8) {
          violations.push({
            violationType: `cross_card_${correlation.correlationType}`,
            severity: correlation.riskLevel,
            affectedCards: correlation.affectedContexts,
            timestamp: correlation.detectedAt
          });
        }
      }

      return violations;
    } catch (error) {
      logger.error('Error identifying privacy violations', { error });
      return [];
    }
  }

  /**
   * Analyze temporal correlation patterns
   */
  private async analyzeTemporalPatterns(patterns: AccessPattern[]): Promise<CorrelationResult | null> {
    const temporalGroups = this.groupByTimeWindow(patterns, 60000); // 1 minute windows
    
    for (const [window, group] of temporalGroups.entries()) {
      const uniqueContexts = new Set(group.map(p => p.contextHash));
      
      if (uniqueContexts.size >= 2 && group.length >= this.MIN_PATTERN_COUNT) {
        const correlation = this.calculateTemporalCorrelation(group);
        
        if (correlation > this.CORRELATION_THRESHOLD) {
          return {
            correlationType: 'temporal',
            riskLevel: this.calculateRiskLevel(correlation, uniqueContexts.size),
            confidence: correlation,
            affectedContexts: Array.from(uniqueContexts),
            detectedAt: new Date(),
            evidence: {
              timeWindow: window,
              patternCount: group.length,
              uniqueContextCount: uniqueContexts.size
            }
          };
        }
      }
    }

    return null;
  }

  /**
   * Analyze spatial/location-based patterns
   */
  private async analyzeSpatialPatterns(patterns: AccessPattern[]): Promise<CorrelationResult | null> {
    const ipGroups = this.groupByIpHash(patterns);
    
    for (const [ipHash, group] of ipGroups.entries()) {
      const uniqueContexts = new Set(group.map(p => p.contextHash));
      
      if (uniqueContexts.size >= 2 && group.length >= this.MIN_PATTERN_COUNT) {
        const timeDiff = this.calculateTimeSpread(group);
        
        // If multiple contexts accessed from same IP in short time
        if (timeDiff < 300000) { // 5 minutes
          return {
            correlationType: 'spatial',
            riskLevel: uniqueContexts.size > 3 ? 'high' : 'medium',
            confidence: 0.85,
            affectedContexts: Array.from(uniqueContexts),
            detectedAt: new Date(),
            evidence: {
              ipHash,
              contextCount: uniqueContexts.size,
              timeSpread: timeDiff
            }
          };
        }
      }
    }

    return null;
  }

  /**
   * Analyze behavioral patterns
   */
  private async analyzeBehavioralPatterns(patterns: AccessPattern[]): Promise<CorrelationResult | null> {
    const querySignatures = patterns.filter(p => p.querySignature);
    const signatureGroups = this.groupByQuerySignature(querySignatures);
    
    for (const [signature, group] of signatureGroups.entries()) {
      const uniqueContexts = new Set(group.map(p => p.contextHash));
      
      if (uniqueContexts.size >= 2) {
        const similarity = this.calculateQuerySimilarity(group);
        
        if (similarity > 0.8) {
          return {
            correlationType: 'behavioral',
            riskLevel: similarity > 0.9 ? 'high' : 'medium',
            confidence: similarity,
            affectedContexts: Array.from(uniqueContexts),
            detectedAt: new Date(),
            evidence: {
              queryPattern: signature,
              similarityScore: similarity,
              instanceCount: group.length
            }
          };
        }
      }
    }

    return null;
  }

  /**
   * Analyze IP-based correlation patterns
   */
  private async analyzeIpPatterns(patterns: AccessPattern[]): Promise<CorrelationResult | null> {
    const ipPatterns = patterns.filter(p => p.ipHash);
    const ipFrequency = new Map<string, Set<string>>();

    for (const pattern of ipPatterns) {
      if (!ipFrequency.has(pattern.ipHash!)) {
        ipFrequency.set(pattern.ipHash!, new Set());
      }
      ipFrequency.get(pattern.ipHash!)!.add(pattern.contextHash);
    }

    for (const [ipHash, contexts] of ipFrequency.entries()) {
      if (contexts.size >= 3) {
        return {
          correlationType: 'ip_based',
          riskLevel: contexts.size > 5 ? 'high' : 'medium',
          confidence: Math.min(contexts.size / 10, 0.95),
          affectedContexts: Array.from(contexts),
          detectedAt: new Date(),
          evidence: {
            ipHash,
            uniqueContextCount: contexts.size
          }
        };
      }
    }

    return null;
  }

  /**
   * Analyze session-based patterns
   */
  private async analyzeSessionPatterns(patterns: AccessPattern[]): Promise<CorrelationResult | null> {
    const sessionPatterns = patterns.filter(p => p.sessionHash);
    const sessionGroups = this.groupBySessionHash(sessionPatterns);

    for (const [sessionHash, group] of sessionGroups.entries()) {
      const uniqueContexts = new Set(group.map(p => p.contextHash));
      
      if (uniqueContexts.size >= 2) {
        const sessionDuration = this.calculateTimeSpread(group);
        const accessFrequency = group.length / (sessionDuration / 60000); // accesses per minute

        if (accessFrequency > 1) {
          return {
            correlationType: 'session_based',
            riskLevel: uniqueContexts.size > 3 ? 'high' : 'medium',
            confidence: Math.min(accessFrequency / 5, 0.9),
            affectedContexts: Array.from(uniqueContexts),
            detectedAt: new Date(),
            evidence: {
              sessionHash,
              sessionDuration,
              accessFrequency,
              contextSwitches: uniqueContexts.size - 1
            }
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate overall correlation risk
   */
  async detectPotentialCorrelation(accessPatterns: AccessPattern[]): Promise<CorrelationRisk> {
    const correlations = await this.detectCrossCardCorrelation();
    
    const highRiskCount = correlations.filter(c => c.riskLevel === 'high').length;
    const mediumRiskCount = correlations.filter(c => c.riskLevel === 'medium').length;
    
    let overallRiskLevel: 'low' | 'medium' | 'high' = 'low';
    if (highRiskCount > 0) {
      overallRiskLevel = 'high';
    } else if (mediumRiskCount > 1) {
      overallRiskLevel = 'medium';
    }

    return {
      overallRiskLevel,
      violationDetected: highRiskCount > 0 || mediumRiskCount > 2,
      mitigationRequired: overallRiskLevel !== 'low',
      correlationTypes: correlations
    };
  }

  /**
   * Get recent access patterns
   */
  private async getRecentAccessPatterns(): Promise<AccessPattern[]> {
    const { data, error } = await this.supabase
      .from('access_pattern_tracking')
      .select('*')
      .gte('access_timestamp', new Date(Date.now() - this.TEMPORAL_WINDOW_MS).toISOString())
      .order('access_timestamp', { ascending: false });

    if (error) {
      logger.error('Failed to retrieve recent access patterns', { error });
      return [];
    }

    return this.mapAccessPatterns(data || []);
  }

  /**
   * Map database records to AccessPattern interface
   */
  private mapAccessPatterns(data: any[]): AccessPattern[] {
    return data.map(record => ({
      trackingId: record.tracking_id,
      contextHash: record.context_hash,
      accessTimestamp: new Date(record.access_timestamp),
      accessType: record.access_type,
      querySignature: record.query_signature,
      ipHash: record.ip_hash,
      sessionHash: record.session_hash,
      potentialCorrelation: record.potential_correlation
    }));
  }

  /**
   * Group patterns by time window
   */
  private groupByTimeWindow(patterns: AccessPattern[], windowMs: number): Map<number, AccessPattern[]> {
    const groups = new Map<number, AccessPattern[]>();
    
    for (const pattern of patterns) {
      const window = Math.floor(pattern.accessTimestamp.getTime() / windowMs);
      if (!groups.has(window)) {
        groups.set(window, []);
      }
      groups.get(window)!.push(pattern);
    }

    return groups;
  }

  /**
   * Group patterns by IP hash
   */
  private groupByIpHash(patterns: AccessPattern[]): Map<string, AccessPattern[]> {
    const groups = new Map<string, AccessPattern[]>();
    
    for (const pattern of patterns) {
      if (pattern.ipHash) {
        if (!groups.has(pattern.ipHash)) {
          groups.set(pattern.ipHash, []);
        }
        groups.get(pattern.ipHash)!.push(pattern);
      }
    }

    return groups;
  }

  /**
   * Group patterns by query signature
   */
  private groupByQuerySignature(patterns: AccessPattern[]): Map<string, AccessPattern[]> {
    const groups = new Map<string, AccessPattern[]>();
    
    for (const pattern of patterns) {
      if (pattern.querySignature) {
        if (!groups.has(pattern.querySignature)) {
          groups.set(pattern.querySignature, []);
        }
        groups.get(pattern.querySignature)!.push(pattern);
      }
    }

    return groups;
  }

  /**
   * Group patterns by session hash
   */
  private groupBySessionHash(patterns: AccessPattern[]): Map<string, AccessPattern[]> {
    const groups = new Map<string, AccessPattern[]>();
    
    for (const pattern of patterns) {
      if (pattern.sessionHash) {
        if (!groups.has(pattern.sessionHash)) {
          groups.set(pattern.sessionHash, []);
        }
        groups.get(pattern.sessionHash)!.push(pattern);
      }
    }

    return groups;
  }

  /**
   * Calculate temporal correlation coefficient
   */
  private calculateTemporalCorrelation(patterns: AccessPattern[]): number {
    if (patterns.length < 2) return 0;

    const timestamps = patterns.map(p => p.accessTimestamp.getTime()).sort();
    const intervals = [];
    
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i-1]);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation indicates higher correlation
    return Math.max(0, 1 - (stdDev / avgInterval));
  }

  /**
   * Calculate time spread of patterns
   */
  private calculateTimeSpread(patterns: AccessPattern[]): number {
    if (patterns.length === 0) return 0;
    
    const timestamps = patterns.map(p => p.accessTimestamp.getTime());
    return Math.max(...timestamps) - Math.min(...timestamps);
  }

  /**
   * Calculate query similarity score
   */
  private calculateQuerySimilarity(patterns: AccessPattern[]): number {
    if (patterns.length < 2) return 0;

    const signatures = patterns.map(p => p.querySignature).filter(Boolean);
    if (signatures.length < 2) return 0;

    // Simple similarity based on exact matches
    const uniqueSignatures = new Set(signatures);
    return 1 - (uniqueSignatures.size - 1) / signatures.length;
  }

  /**
   * Calculate risk level based on correlation strength
   */
  private calculateRiskLevel(correlation: number, contextCount: number): 'low' | 'medium' | 'high' {
    if (correlation > 0.9 || contextCount > 5) return 'high';
    if (correlation > 0.7 || contextCount > 3) return 'medium';
    return 'low';
  }

  /**
   * Log correlation detection for audit
   */
  private async logCorrelationDetection(correlation: CorrelationResult): Promise<void> {
    try {
      await this.supabase
        .from('compliance_audit')
        .insert({
          audit_event_type: 'correlation_detected',
          isolation_event_data: {
            correlationType: correlation.correlationType,
            riskLevel: correlation.riskLevel,
            confidence: correlation.confidence,
            affectedContexts: correlation.affectedContexts
          },
          correlation_detection_result: true,
          event_timestamp: new Date().toISOString()
        });
    } catch (error) {
      logger.error('Failed to log correlation detection', { error, correlation });
    }
  }

  /**
   * Real-time correlation monitoring
   */
  async startCorrelationMonitoring(callback: (risk: CorrelationRisk) => void): Promise<void> {
    // Monitor every 30 seconds
    setInterval(async () => {
      try {
        const patterns = await this.monitorAccessPatterns();
        const risk = await this.detectPotentialCorrelation(patterns);
        
        if (risk.mitigationRequired) {
          callback(risk);
        }
      } catch (error) {
        logger.error('Correlation monitoring error', { error });
      }
    }, 30000);
  }
}