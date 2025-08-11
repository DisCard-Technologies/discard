import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'ioredis';
import { AuditTrailService } from './audit-trail.service';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface RegulatoryRule {
  ruleId: string;
  ruleName: string;
  ruleType: 'threshold' | 'pattern' | 'reporting' | 'data_retention' | 'privacy' | 'aml' | 'kyc';
  jurisdiction: string; // 'US', 'EU', 'CA', etc.
  regulatoryBody: string; // 'FinCEN', 'GDPR', 'CCPA', etc.
  ruleVersion: string;
  effectiveDate: Date;
  expiryDate?: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'active' | 'deprecated' | 'suspended';
  configuration: Record<string, any>;
  complianceRequirements: string[];
  auditRequirements: string[];
  enforcementLevel: 'advisory' | 'warning' | 'blocking' | 'reporting';
  metadata: {
    createdBy: string;
    approvedBy?: string;
    lastModifiedBy?: string;
    changeReason?: string;
    impactAssessment?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface RegulatoryThreshold {
  thresholdId: string;
  thresholdName: string;
  thresholdType: 'amount' | 'frequency' | 'velocity' | 'count' | 'percentage' | 'time_period';
  applicableRules: string[];
  jurisdiction: string;
  thresholdValue: number;
  timeWindow?: number; // in milliseconds
  currency?: string;
  comparisonOperator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between';
  secondaryValue?: number; // for 'between' operator
  alertLevel: 'info' | 'warning' | 'critical';
  automaticAction: 'none' | 'alert' | 'block' | 'report' | 'escalate';
  effectiveDate: Date;
  isActive: boolean;
}

export interface RegulatoryChange {
  changeId: string;
  changeType: 'rule_update' | 'threshold_change' | 'new_requirement' | 'repeal' | 'interpretation';
  title: string;
  description: string;
  affectedRules: string[];
  affectedThresholds: string[];
  jurisdiction: string;
  regulatoryBody: string;
  proposedDate: Date;
  effectiveDate: Date;
  implementationDeadline: Date;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  changeStatus: 'proposed' | 'approved' | 'implemented' | 'rejected' | 'deferred';
  implementationPlan: string;
  riskAssessment: string;
  businessImpact: string;
  technicalRequirements: string[];
  assignedTo?: string;
  approvedBy?: string;
  implementedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceConfig {
  configId: string;
  configType: 'global' | 'jurisdiction_specific' | 'rule_specific';
  configName: string;
  jurisdiction?: string;
  applicableRules?: string[];
  configuration: Record<string, any>;
  isActive: boolean;
  effectiveDate: Date;
  lastUpdated: Date;
}

export class RegulatoryConfigService {
  private supabase: SupabaseClient;
  private redis: ReturnType<typeof createRedisClient>;
  private auditService: AuditTrailService;
  
  // Cache TTLs
  private readonly CACHE_CONFIG = {
    RULES_TTL: 3600, // 1 hour for rules cache
    THRESHOLDS_TTL: 1800, // 30 minutes for thresholds
    CHANGES_TTL: 600, // 10 minutes for regulatory changes
    CONFIG_TTL: 7200 // 2 hours for compliance config
  };

  // Default regulatory configurations
  private readonly DEFAULT_CONFIGS = {
    BSA_AML: {
      ctr_threshold: 10000,
      sar_threshold: 5000,
      velocity_monitoring: true,
      structuring_detection: true,
      reporting_deadline_days: 15
    },
    GDPR: {
      data_retention_max_years: 7,
      deletion_request_days: 30,
      breach_notification_hours: 72,
      consent_required: true,
      right_to_portability: true
    },
    CCPA: {
      data_retention_max_years: 5,
      deletion_request_days: 45,
      opt_out_required: true,
      data_sale_notification: true
    },
    PCI_DSS: {
      encryption_required: true,
      key_rotation_days: 90,
      access_logging: true,
      vulnerability_scanning: true
    }
  };

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.redis = createRedisClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('Regulatory config Redis connection failed:', err);
    });
    this.auditService = new AuditTrailService(supabaseUrl, supabaseKey);
  }

  /**
   * Create or update regulatory rule
   */
  async upsertRegulatoryRule(
    rule: Omit<RegulatoryRule, 'ruleId' | 'createdAt' | 'updatedAt'> & { ruleId?: string }
  ): Promise<RegulatoryRule> {
    try {
      const now = new Date();
      const ruleId = rule.ruleId || crypto.randomUUID();
      
      // Validate rule configuration
      await this.validateRuleConfiguration(rule);

      const regulatoryRule: RegulatoryRule = {
        ...rule,
        ruleId,
        createdAt: rule.ruleId ? rule.createdAt || now : now,
        updatedAt: now
      };

      // Store in database
      await this.storeRegulatoryRule(regulatoryRule);

      // Clear related caches
      await this.clearRuleCache(rule.ruleType, rule.jurisdiction);

      // Create audit event
      await this.auditService.createAuditEvent(
        rule.ruleId ? 'regulatory_rule_updated' : 'regulatory_rule_created',
        'configuration_change',
        `Regulatory rule ${rule.ruleId ? 'updated' : 'created'}: ${rule.ruleName}`,
        {
          complianceOfficerId: rule.metadata.createdBy,
          afterData: {
            ruleId,
            ruleName: rule.ruleName,
            ruleType: rule.ruleType,
            jurisdiction: rule.jurisdiction,
            effectiveDate: rule.effectiveDate,
            priority: rule.priority
          },
          riskAssessment: {
            riskLevel: rule.priority === 'critical' ? 'critical' : 'medium',
            riskScore: this.calculateRuleRiskScore(rule),
            riskFactors: ['regulatory_compliance', 'rule_change']
          }
        }
      );

      logger.info('Regulatory rule processed', { 
        ruleId, 
        ruleName: rule.ruleName, 
        action: rule.ruleId ? 'updated' : 'created' 
      });

      return regulatoryRule;
    } catch (error) {
      logger.error('Error upserting regulatory rule:', { error, ruleName: rule.ruleName });
      throw error;
    }
  }

  /**
   * Create or update regulatory threshold
   */
  async upsertRegulatoryThreshold(
    threshold: Omit<RegulatoryThreshold, 'thresholdId'> & { thresholdId?: string }
  ): Promise<RegulatoryThreshold> {
    try {
      const thresholdId = threshold.thresholdId || crypto.randomUUID();
      
      const regulatoryThreshold: RegulatoryThreshold = {
        ...threshold,
        thresholdId
      };

      // Validate threshold configuration
      this.validateThresholdConfiguration(threshold);

      // Store in database
      await this.storeRegulatoryThreshold(regulatoryThreshold);

      // Clear thresholds cache
      await this.clearThresholdsCache(threshold.jurisdiction);

      // Create audit event
      await this.auditService.createAuditEvent(
        threshold.thresholdId ? 'regulatory_threshold_updated' : 'regulatory_threshold_created',
        'configuration_change',
        `Regulatory threshold ${threshold.thresholdId ? 'updated' : 'created'}: ${threshold.thresholdName}`,
        {
          afterData: {
            thresholdId,
            thresholdName: threshold.thresholdName,
            thresholdValue: threshold.thresholdValue,
            jurisdiction: threshold.jurisdiction,
            alertLevel: threshold.alertLevel
          }
        }
      );

      return regulatoryThreshold;
    } catch (error) {
      logger.error('Error upserting regulatory threshold:', { error, thresholdName: threshold.thresholdName });
      throw error;
    }
  }

  /**
   * Get active regulatory rules
   */
  async getActiveRules(filters: {
    ruleType?: string;
    jurisdiction?: string;
    regulatoryBody?: string;
    effectiveAsOf?: Date;
  } = {}): Promise<RegulatoryRule[]> {
    try {
      // Check cache first
      const cacheKey = `regulatory_rules:${JSON.stringify(filters)}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Build query
      let query = this.supabase
        .from('regulatory_rules')
        .select('*')
        .eq('status', 'active');

      if (filters.ruleType) {
        query = query.eq('rule_type', filters.ruleType);
      }

      if (filters.jurisdiction) {
        query = query.eq('jurisdiction', filters.jurisdiction);
      }

      if (filters.regulatoryBody) {
        query = query.eq('regulatory_body', filters.regulatoryBody);
      }

      if (filters.effectiveAsOf) {
        query = query.lte('effective_date', filters.effectiveAsOf.toISOString());
      }

      const { data, error } = await query.order('priority', { ascending: false });

      if (error) {
        throw error;
      }

      const rules = (data || []).map(rule => this.convertToRegulatoryRule(rule));

      // Cache the results
      await this.redis.setEx(cacheKey, this.CACHE_CONFIG.RULES_TTL, JSON.stringify(rules));

      return rules;
    } catch (error) {
      logger.error('Error getting active rules:', { error, filters });
      throw error;
    }
  }

  /**
   * Get regulatory thresholds
   */
  async getRegulatoryThresholds(jurisdiction?: string): Promise<RegulatoryThreshold[]> {
    try {
      const cacheKey = `regulatory_thresholds:${jurisdiction || 'all'}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      let query = this.supabase
        .from('regulatory_thresholds')
        .select('*')
        .eq('is_active', true);

      if (jurisdiction) {
        query = query.eq('jurisdiction', jurisdiction);
      }

      const { data, error } = await query.order('alert_level', { ascending: false });

      if (error) {
        throw error;
      }

      const thresholds = (data || []).map(threshold => this.convertToRegulatoryThreshold(threshold));

      // Cache the results
      await this.redis.setEx(cacheKey, this.CACHE_CONFIG.THRESHOLDS_TTL, JSON.stringify(thresholds));

      return thresholds;
    } catch (error) {
      logger.error('Error getting regulatory thresholds:', { error, jurisdiction });
      throw error;
    }
  }

  /**
   * Create regulatory change proposal
   */
  async proposeRegulatoryChange(
    change: Omit<RegulatoryChange, 'changeId' | 'createdAt' | 'updatedAt'>
  ): Promise<RegulatoryChange> {
    try {
      const changeId = crypto.randomUUID();
      const now = new Date();

      const regulatoryChange: RegulatoryChange = {
        ...change,
        changeId,
        createdAt: now,
        updatedAt: now
      };

      // Store in database
      await this.storeRegulatoryChange(regulatoryChange);

      // Create audit event
      await this.auditService.createAuditEvent(
        'regulatory_change_proposed',
        'configuration_change',
        `Regulatory change proposed: ${change.title}`,
        {
          afterData: {
            changeId,
            title: change.title,
            changeType: change.changeType,
            jurisdiction: change.jurisdiction,
            impactLevel: change.impactLevel,
            effectiveDate: change.effectiveDate
          },
          riskAssessment: {
            riskLevel: change.impactLevel,
            riskScore: change.impactLevel === 'critical' ? 90 : change.impactLevel === 'high' ? 75 : 50,
            riskFactors: ['regulatory_change', 'compliance_impact']
          }
        }
      );

      logger.info('Regulatory change proposed', { changeId, title: change.title });

      return regulatoryChange;
    } catch (error) {
      logger.error('Error proposing regulatory change:', { error, title: change.title });
      throw error;
    }
  }

  /**
   * Implement regulatory change
   */
  async implementRegulatoryChange(
    changeId: string,
    implementedBy: string,
    implementationNotes?: string
  ): Promise<void> {
    try {
      // Get the change
      const change = await this.getRegulatoryChange(changeId);
      if (!change) {
        throw new Error('Regulatory change not found');
      }

      if (change.changeStatus !== 'approved') {
        throw new Error('Change must be approved before implementation');
      }

      // Update change status
      await this.updateRegulatoryChangeStatus(changeId, 'implemented', implementedBy);

      // Apply the changes based on change type
      await this.applyRegulatoryChange(change);

      // Create audit event
      await this.auditService.createAuditEvent(
        'regulatory_change_implemented',
        'configuration_change',
        `Regulatory change implemented: ${change.title}`,
        {
          complianceOfficerId: implementedBy,
          afterData: {
            changeId,
            title: change.title,
            implementedBy,
            implementationNotes
          }
        }
      );

      logger.info('Regulatory change implemented', { changeId, implementedBy });
    } catch (error) {
      logger.error('Error implementing regulatory change:', { error, changeId });
      throw error;
    }
  }

  /**
   * Get compliance configuration
   */
  async getComplianceConfig(
    configType: ComplianceConfig['configType'],
    jurisdiction?: string
  ): Promise<ComplianceConfig[]> {
    try {
      const cacheKey = `compliance_config:${configType}:${jurisdiction || 'global'}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      let query = this.supabase
        .from('compliance_config')
        .select('*')
        .eq('config_type', configType)
        .eq('is_active', true);

      if (jurisdiction) {
        query = query.eq('jurisdiction', jurisdiction);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const configs = (data || []).map(config => this.convertToComplianceConfig(config));

      // Cache the results
      await this.redis.setEx(cacheKey, this.CACHE_CONFIG.CONFIG_TTL, JSON.stringify(configs));

      return configs;
    } catch (error) {
      logger.error('Error getting compliance config:', { error, configType, jurisdiction });
      throw error;
    }
  }

  /**
   * Initialize default regulatory configurations
   */
  async initializeDefaultConfigurations(): Promise<void> {
    try {
      // Initialize BSA/AML rules
      await this.initializeBSAConfig();

      // Initialize GDPR rules
      await this.initializeGDPRConfig();

      // Initialize CCPA rules
      await this.initializeCCPAConfig();

      // Initialize PCI DSS rules
      await this.initializePCIConfig();

      logger.info('Default regulatory configurations initialized');
    } catch (error) {
      logger.error('Error initializing default configurations:', error);
      throw error;
    }
  }

  /**
   * Validate rule configuration
   */
  private async validateRuleConfiguration(rule: any): Promise<void> {
    // Basic validation
    if (!rule.ruleName || !rule.ruleType || !rule.jurisdiction) {
      throw new Error('Rule name, type, and jurisdiction are required');
    }

    if (rule.effectiveDate && rule.expiryDate && rule.effectiveDate >= rule.expiryDate) {
      throw new Error('Effective date must be before expiry date');
    }

    if (!['draft', 'active', 'deprecated', 'suspended'].includes(rule.status)) {
      throw new Error('Invalid rule status');
    }

    // Type-specific validation
    switch (rule.ruleType) {
      case 'threshold':
        if (!rule.configuration.thresholdValue || !rule.configuration.comparisonOperator) {
          throw new Error('Threshold rules must specify value and comparison operator');
        }
        break;
      case 'reporting':
        if (!rule.configuration.reportingFrequency || !rule.configuration.recipientAgency) {
          throw new Error('Reporting rules must specify frequency and recipient agency');
        }
        break;
    }
  }

  /**
   * Validate threshold configuration
   */
  private validateThresholdConfiguration(threshold: any): void {
    if (!threshold.thresholdName || !threshold.thresholdType) {
      throw new Error('Threshold name and type are required');
    }

    if (threshold.thresholdValue === undefined || threshold.thresholdValue === null) {
      throw new Error('Threshold value is required');
    }

    if (!['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between'].includes(threshold.comparisonOperator)) {
      throw new Error('Invalid comparison operator');
    }

    if (threshold.comparisonOperator === 'between' && !threshold.secondaryValue) {
      throw new Error('Secondary value required for "between" operator');
    }
  }

  /**
   * Calculate risk score for regulatory rule
   */
  private calculateRuleRiskScore(rule: any): number {
    let score = 50; // Base score

    // Priority multiplier
    switch (rule.priority) {
      case 'critical': score += 40; break;
      case 'high': score += 25; break;
      case 'medium': score += 10; break;
      case 'low': score += 0; break;
    }

    // Rule type impact
    switch (rule.ruleType) {
      case 'aml': score += 20; break;
      case 'kyc': score += 15; break;
      case 'reporting': score += 10; break;
      case 'threshold': score += 15; break;
      case 'data_retention': score += 5; break;
    }

    // Enforcement level
    switch (rule.enforcementLevel) {
      case 'blocking': score += 20; break;
      case 'reporting': score += 15; break;
      case 'warning': score += 10; break;
      case 'advisory': score += 5; break;
    }

    return Math.min(score, 100);
  }

  /**
   * Apply regulatory change to system configuration
   */
  private async applyRegulatoryChange(change: RegulatoryChange): Promise<void> {
    switch (change.changeType) {
      case 'threshold_change':
        // Update affected thresholds
        for (const thresholdId of change.affectedThresholds) {
          await this.updateThresholdFromChange(thresholdId, change);
        }
        break;
      
      case 'rule_update':
        // Update affected rules
        for (const ruleId of change.affectedRules) {
          await this.updateRuleFromChange(ruleId, change);
        }
        break;
      
      case 'new_requirement':
        // Create new rules/thresholds based on change description
        await this.createRequirementsFromChange(change);
        break;
    }

    // Clear all related caches
    await this.clearAllConfigCaches();
  }

  /**
   * Store regulatory rule in database
   */
  private async storeRegulatoryRule(rule: RegulatoryRule): Promise<void> {
    const { error } = await this.supabase
      .from('regulatory_rules')
      .upsert({
        rule_id: rule.ruleId,
        rule_name: rule.ruleName,
        rule_type: rule.ruleType,
        jurisdiction: rule.jurisdiction,
        regulatory_body: rule.regulatoryBody,
        rule_version: rule.ruleVersion,
        effective_date: rule.effectiveDate.toISOString(),
        expiry_date: rule.expiryDate?.toISOString(),
        priority: rule.priority,
        status: rule.status,
        configuration: rule.configuration,
        compliance_requirements: rule.complianceRequirements,
        audit_requirements: rule.auditRequirements,
        enforcement_level: rule.enforcementLevel,
        metadata: rule.metadata,
        created_at: rule.createdAt.toISOString(),
        updated_at: rule.updatedAt.toISOString()
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Store regulatory threshold in database
   */
  private async storeRegulatoryThreshold(threshold: RegulatoryThreshold): Promise<void> {
    const { error } = await this.supabase
      .from('regulatory_thresholds')
      .upsert({
        threshold_id: threshold.thresholdId,
        threshold_name: threshold.thresholdName,
        threshold_type: threshold.thresholdType,
        applicable_rules: threshold.applicableRules,
        jurisdiction: threshold.jurisdiction,
        threshold_value: threshold.thresholdValue,
        time_window: threshold.timeWindow,
        currency: threshold.currency,
        comparison_operator: threshold.comparisonOperator,
        secondary_value: threshold.secondaryValue,
        alert_level: threshold.alertLevel,
        automatic_action: threshold.automaticAction,
        effective_date: threshold.effectiveDate.toISOString(),
        is_active: threshold.isActive
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Store regulatory change in database
   */
  private async storeRegulatoryChange(change: RegulatoryChange): Promise<void> {
    const { error } = await this.supabase
      .from('regulatory_changes')
      .insert({
        change_id: change.changeId,
        change_type: change.changeType,
        title: change.title,
        description: change.description,
        affected_rules: change.affectedRules,
        affected_thresholds: change.affectedThresholds,
        jurisdiction: change.jurisdiction,
        regulatory_body: change.regulatoryBody,
        proposed_date: change.proposedDate.toISOString(),
        effective_date: change.effectiveDate.toISOString(),
        implementation_deadline: change.implementationDeadline.toISOString(),
        impact_level: change.impactLevel,
        change_status: change.changeStatus,
        implementation_plan: change.implementationPlan,
        risk_assessment: change.riskAssessment,
        business_impact: change.businessImpact,
        technical_requirements: change.technicalRequirements,
        assigned_to: change.assignedTo,
        approved_by: change.approvedBy,
        implemented_by: change.implementedBy,
        created_at: change.createdAt.toISOString(),
        updated_at: change.updatedAt.toISOString()
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Clear rule-specific cache
   */
  private async clearRuleCache(ruleType: string, jurisdiction: string): Promise<void> {
    const patterns = [
      `regulatory_rules:*${ruleType}*`,
      `regulatory_rules:*${jurisdiction}*`,
      'compliance_config:*'
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Clear thresholds cache
   */
  private async clearThresholdsCache(jurisdiction: string): Promise<void> {
    const patterns = [
      `regulatory_thresholds:${jurisdiction}`,
      'regulatory_thresholds:all'
    ];

    for (const pattern of patterns) {
      await this.redis.del(pattern);
    }
  }

  /**
   * Clear all configuration caches
   */
  private async clearAllConfigCaches(): Promise<void> {
    const patterns = [
      'regulatory_rules:*',
      'regulatory_thresholds:*',
      'compliance_config:*'
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Initialize BSA/AML configuration
   */
  private async initializeBSAConfig(): Promise<void> {
    // This would create default BSA/AML rules and thresholds
    // Implementation omitted for brevity
  }

  /**
   * Initialize GDPR configuration
   */
  private async initializeGDPRConfig(): Promise<void> {
    // This would create default GDPR rules
    // Implementation omitted for brevity
  }

  /**
   * Initialize CCPA configuration
   */
  private async initializeCCPAConfig(): Promise<void> {
    // This would create default CCPA rules
    // Implementation omitted for brevity
  }

  /**
   * Initialize PCI DSS configuration
   */
  private async initializePCIConfig(): Promise<void> {
    // This would create default PCI DSS rules
    // Implementation omitted for brevity
  }

  // Helper methods for database conversions (implementation omitted for brevity)
  private convertToRegulatoryRule(dbRecord: any): RegulatoryRule {
    return {
      ruleId: dbRecord.rule_id,
      ruleName: dbRecord.rule_name,
      ruleType: dbRecord.rule_type,
      jurisdiction: dbRecord.jurisdiction,
      regulatoryBody: dbRecord.regulatory_body,
      ruleVersion: dbRecord.rule_version,
      effectiveDate: new Date(dbRecord.effective_date),
      expiryDate: dbRecord.expiry_date ? new Date(dbRecord.expiry_date) : undefined,
      priority: dbRecord.priority,
      status: dbRecord.status,
      configuration: dbRecord.configuration,
      complianceRequirements: dbRecord.compliance_requirements,
      auditRequirements: dbRecord.audit_requirements,
      enforcementLevel: dbRecord.enforcement_level,
      metadata: dbRecord.metadata,
      createdAt: new Date(dbRecord.created_at),
      updatedAt: new Date(dbRecord.updated_at)
    };
  }

  private convertToRegulatoryThreshold(dbRecord: any): RegulatoryThreshold {
    return {
      thresholdId: dbRecord.threshold_id,
      thresholdName: dbRecord.threshold_name,
      thresholdType: dbRecord.threshold_type,
      applicableRules: dbRecord.applicable_rules,
      jurisdiction: dbRecord.jurisdiction,
      thresholdValue: dbRecord.threshold_value,
      timeWindow: dbRecord.time_window,
      currency: dbRecord.currency,
      comparisonOperator: dbRecord.comparison_operator,
      secondaryValue: dbRecord.secondary_value,
      alertLevel: dbRecord.alert_level,
      automaticAction: dbRecord.automatic_action,
      effectiveDate: new Date(dbRecord.effective_date),
      isActive: dbRecord.is_active
    };
  }

  private convertToComplianceConfig(dbRecord: any): ComplianceConfig {
    return {
      configId: dbRecord.config_id,
      configType: dbRecord.config_type,
      configName: dbRecord.config_name,
      jurisdiction: dbRecord.jurisdiction,
      applicableRules: dbRecord.applicable_rules,
      configuration: dbRecord.configuration,
      isActive: dbRecord.is_active,
      effectiveDate: new Date(dbRecord.effective_date),
      lastUpdated: new Date(dbRecord.last_updated)
    };
  }

  // Additional helper methods (stubs for brevity)
  private async getRegulatoryChange(changeId: string): Promise<RegulatoryChange | null> { return null; }
  private async updateRegulatoryChangeStatus(changeId: string, status: string, implementedBy: string): Promise<void> {}
  private async updateThresholdFromChange(thresholdId: string, change: RegulatoryChange): Promise<void> {}
  private async updateRuleFromChange(ruleId: string, change: RegulatoryChange): Promise<void> {}
  private async createRequirementsFromChange(change: RegulatoryChange): Promise<void> {}

  /**
   * Disconnect from services
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
    await this.auditService.disconnect();
  }
}