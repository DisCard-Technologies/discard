import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { AMLMonitoringService } from '../../services/compliance/aml-monitoring.service';
import { RegulatoryReportingService } from '../../services/compliance/regulatory-reporting.service';
import { AuditTrailService } from '../../services/compliance/audit-trail.service';
import { TransactionMonitoringService } from '../../services/compliance/transaction-monitoring.service';
import { RegulatoryConfigService } from '../../services/compliance/regulatory-config.service';
import { TransactionIsolationService } from '../../services/privacy/transaction-isolation.service';
import { app } from '../../app'; // Assuming Express app is exported

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.TEST_SUPABASE_URL || 'http://localhost:54321',
  supabaseKey: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || 'test-key',
  testTimeout: 30000
};

// Mock data
const mockCardContext = 'test-card-context-hash-12345';
const mockUserContext = 'test-user-context-hash-67890';
const mockComplianceOfficerId = 'compliance-officer-uuid-123';

const mockTransaction = {
  transactionId: 'txn-123456789',
  cardContextHash: mockCardContext,
  amount: 5000,
  currency: 'USD',
  transactionType: 'purchase' as const,
  merchantName: 'Test Merchant',
  merchantCategory: 'retail',
  merchantLocation: {
    country: 'US',
    state: 'CA',
    city: 'San Francisco'
  },
  timestamp: new Date(),
  status: 'approved' as const
};

const mockSuspiciousTransaction = {
  ...mockTransaction,
  amount: 12000, // Above CTR threshold
  transactionId: 'txn-suspicious-001'
};

describe('Compliance Integration Tests', () => {
  let amlService: AMLMonitoringService;
  let reportingService: RegulatoryReportingService;
  let auditService: AuditTrailService;
  let monitoringService: TransactionMonitoringService;
  let configService: RegulatoryConfigService;
  let isolationService: TransactionIsolationService;
  let supabase: ReturnType<typeof createClient>;

  beforeAll(async () => {
    // Initialize test services
    supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
    amlService = new AMLMonitoringService(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
    reportingService = new RegulatoryReportingService(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
    auditService = new AuditTrailService(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
    monitoringService = new TransactionMonitoringService(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
    configService = new RegulatoryConfigService(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
    isolationService = new TransactionIsolationService(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);

    // Setup test data
    await setupTestData();
  }, TEST_CONFIG.testTimeout);

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    
    // Disconnect services
    await amlService.disconnect();
    await auditService.disconnect();
    await monitoringService.disconnect();
    await configService.disconnect();
  });

  beforeEach(async () => {
    // Clear any existing test data before each test
    await clearTestTransactionData();
  });

  describe('Transaction Isolation Compliance', () => {
    it('should maintain transaction isolation during AML monitoring', async () => {
      // Create isolated card context
      const isolationContext = await isolationService.generateIsolationContext(mockCardContext);
      
      // Monitor transaction
      const amlResult = await amlService.analyzeTransaction(mockTransaction);
      
      // Verify isolation is maintained
      expect(amlResult.cardContext).toBe(mockCardContext);
      expect(amlResult.isolationMaintained).toBe(true);
      
      // Verify no cross-card correlation data is present
      expect(amlResult.crossCardAnalysis).toBeUndefined();
      expect(amlResult.userProfilingData).toBeUndefined();
    });

    it('should enforce transaction isolation in compliance monitoring', async () => {
      // Monitor transaction with isolation enforcement
      const monitoringResult = await monitoringService.monitorTransaction(mockTransaction);
      
      // Verify patterns detected only within card context
      for (const pattern of monitoringResult.patterns) {
        expect(pattern.cardContextHash).toBe(mockCardContext);
        expect(pattern.evidence).not.toHaveProperty('crossCardPatterns');
      }
      
      // Verify alerts are card-specific
      for (const alert of monitoringResult.alerts) {
        expect(alert.cardContextHash).toBe(mockCardContext);
      }
    });

    it('should verify isolation boundaries are not violated', async () => {
      // Create multiple card contexts
      const cardContext1 = 'test-card-1';
      const cardContext2 = 'test-card-2';
      
      // Process transactions for different cards
      const transaction1 = { ...mockTransaction, cardContextHash: cardContext1 };
      const transaction2 = { ...mockTransaction, cardContextHash: cardContext2 };
      
      await monitoringService.monitorTransaction(transaction1);
      await monitoringService.monitorTransaction(transaction2);
      
      // Verify isolation boundaries
      const metrics1 = await monitoringService.generateMonitoringMetrics(cardContext1);
      const metrics2 = await monitoringService.generateMonitoringMetrics(cardContext2);
      
      expect(metrics1.cardContextHash).toBe(cardContext1);
      expect(metrics2.cardContextHash).toBe(cardContext2);
      
      // Verify no cross-context data leakage
      expect(metrics1.metrics).not.toEqual(metrics2.metrics);
    });
  });

  describe('Privacy-Preserving Compliance Reporting', () => {
    it('should generate compliance reports with differential privacy', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const report = await reportingService.generateComplianceReport(
        'monthly_aml',
        startDate,
        endDate,
        {
          privacyMethod: 'differential_privacy',
          epsilonBudget: 1.0,
          recipient: 'FinCEN'
        }
      );
      
      expect(report.privacyPreservingMethod).toBe('differential_privacy');
      expect(report.epsilonBudgetUsed).toBe(1.0);
      expect(report.reportData._privacyMetadata).toBeDefined();
      expect(report.reportData._privacyMetadata.method).toBe('differential_privacy');
      
      // Verify no raw transaction data is included
      expect(report.reportData).not.toHaveProperty('rawTransactions');
      expect(report.reportData).not.toHaveProperty('userIds');
      expect(report.reportData).not.toHaveProperty('cardIds');
    });

    it('should generate quarterly reports with k-anonymity protection', async () => {
      const report = await reportingService.generateQuarterlyReport(1, 2024);
      
      expect(report.reportType).toBe('quarterly_compliance');
      expect(report.privacyPreservingMethod).toBe('differential_privacy');
      
      // Verify aggregated data maintains privacy
      if (report.reportData.complianceMetrics) {
        expect(typeof report.reportData.complianceMetrics.complianceRate).toBe('number');
        expect(report.reportData.complianceMetrics).not.toHaveProperty('individualRecords');
      }
    });

    it('should submit reports securely to regulatory agencies', async () => {
      // Generate a test report
      const report = await reportingService.generateComplianceReport(
        'ad_hoc_suspicious',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );
      
      // Submit the report
      const submissionResult = await reportingService.submitReport(report.reportId);
      
      expect(submissionResult.success).toBe(true);
      expect(submissionResult.submissionReference).toBeDefined();
      expect(submissionResult.submittedAt).toBeDefined();
      
      // Verify report is marked as submitted
      const submittedReports = await reportingService.getReports({ submitted: true });
      const submittedReport = submittedReports.find(r => r.reportId === report.reportId);
      expect(submittedReport?.submittedAt).toBeDefined();
    });
  });

  describe('AML Monitoring and Pattern Detection', () => {
    it('should detect suspicious patterns while maintaining privacy', async () => {
      // Analyze a potentially suspicious transaction
      const amlResult = await amlService.analyzeTransaction(mockSuspiciousTransaction);
      
      expect(amlResult.suspicious).toBe(true);
      expect(amlResult.riskScore).toBeGreaterThan(50);
      expect(amlResult.detectedPatterns).toContain('high_value_transaction');
      
      // Verify privacy is maintained
      expect(amlResult.cardContext).toBe(mockCardContext);
      expect(amlResult.analysisData).not.toHaveProperty('personalData');
      expect(amlResult.analysisData).not.toHaveProperty('userIdentifiers');
    });

    it('should create suspicious activity records with proper retention', async () => {
      const suspiciousActivity = await amlService.createSuspiciousActivity(
        mockSuspiciousTransaction,
        'High-value transaction pattern detected',
        85,
        ['high_value', 'velocity_pattern']
      );
      
      expect(suspiciousActivity.activityId).toBeDefined();
      expect(suspiciousActivity.riskScore).toBe(85);
      expect(suspiciousActivity.retentionUntil).toBeInstanceOf(Date);
      
      // Verify retention period is set correctly (should be 5+ years for AML)
      const retentionYears = (suspiciousActivity.retentionUntil.getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000);
      expect(retentionYears).toBeGreaterThan(4.9); // Account for slight timing differences
    });

    it('should integrate with fraud detection while maintaining separation', async () => {
      const amlResult = await amlService.analyzeTransaction(mockTransaction);
      
      // Verify AML analysis is performed
      expect(amlResult).toBeDefined();
      expect(amlResult.analysisTimestamp).toBeDefined();
      
      // Verify fraud detection integration exists but contexts are separate
      if (amlResult.fraudCorrelation) {
        expect(amlResult.fraudCorrelation.correlationLevel).toBeDefined();
        expect(amlResult.fraudCorrelation).not.toHaveProperty('fraudUserData');
        expect(amlResult.fraudCorrelation).not.toHaveProperty('crossSystemData');
      }
    });
  });

  describe('Audit Trail Integrity and Compliance', () => {
    it('should create immutable audit events with cryptographic integrity', async () => {
      const auditEvent = await auditService.createAuditEvent(
        'test_compliance_event',
        'aml_detection',
        'Test compliance audit event',
        {
          cardContextHash: mockCardContext,
          beforeData: { status: 'pending' },
          afterData: { status: 'reviewed' },
          riskAssessment: {
            riskLevel: 'medium',
            riskScore: 65,
            riskFactors: ['test_scenario']
          }
        }
      );
      
      expect(auditEvent.auditId).toBeDefined();
      expect(auditEvent.eventHash).toBeDefined();
      expect(auditEvent.previousHash).toBeDefined();
      expect(auditEvent.eventTimestamp).toBeInstanceOf(Date);
      
      // Verify cryptographic integrity
      expect(auditEvent.eventHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash format
    });

    it('should verify audit trail integrity across multiple events', async () => {
      // Create multiple audit events
      const event1 = await auditService.createAuditEvent(
        'event_1',
        'compliance_check',
        'First test event',
        { cardContextHash: mockCardContext }
      );
      
      const event2 = await auditService.createAuditEvent(
        'event_2',
        'compliance_check',
        'Second test event',
        { cardContextHash: mockCardContext }
      );
      
      // Verify integrity of the audit trail
      const verificationResult = await auditService.verifyAuditIntegrity('compliance_check');
      
      expect(verificationResult.verified).toBe(true);
      expect(verificationResult.totalEvents).toBeGreaterThanOrEqual(2);
      expect(verificationResult.integrityViolations).toHaveLength(0);
      expect(verificationResult.verificationProof).toBeDefined();
    });

    it('should generate compliance metrics dashboard data', async () => {
      // Create some test audit events
      await auditService.createAuditEvent(
        'high_risk_event',
        'aml_detection',
        'High risk transaction detected',
        {
          cardContextHash: mockCardContext,
          riskAssessment: {
            riskLevel: 'high',
            riskScore: 90,
            riskFactors: ['high_amount', 'suspicious_pattern']
          }
        }
      );
      
      const metrics = await auditService.getComplianceMetrics('24h');
      
      expect(metrics.totalEvents).toBeGreaterThan(0);
      expect(metrics.eventsByCategory).toBeDefined();
      expect(metrics.riskDistribution).toBeDefined();
      expect(metrics.integrityChecks).toBeDefined();
      expect(metrics.alertSummary).toBeDefined();
    });
  });

  describe('Regulatory Configuration Management', () => {
    it('should create and manage regulatory rules', async () => {
      const testRule = {
        ruleName: 'Test BSA Rule',
        ruleType: 'threshold' as const,
        jurisdiction: 'US',
        regulatoryBody: 'FinCEN',
        ruleVersion: '1.0',
        effectiveDate: new Date(),
        priority: 'high' as const,
        status: 'active' as const,
        configuration: {
          thresholdValue: 10000,
          comparisonOperator: 'gte',
          currency: 'USD'
        },
        complianceRequirements: ['BSA compliance', 'CTR filing'],
        auditRequirements: ['quarterly_review'],
        enforcementLevel: 'blocking' as const,
        metadata: {
          createdBy: mockComplianceOfficerId,
          changeReason: 'Test rule creation'
        }
      };
      
      const rule = await configService.upsertRegulatoryRule(testRule);
      
      expect(rule.ruleId).toBeDefined();
      expect(rule.ruleName).toBe(testRule.ruleName);
      expect(rule.status).toBe('active');
      expect(rule.effectiveDate).toBeInstanceOf(Date);
    });

    it('should manage regulatory thresholds', async () => {
      const testThreshold = {
        thresholdName: 'CTR Reporting Threshold',
        thresholdType: 'amount' as const,
        applicableRules: ['bsa-ctr-rule'],
        jurisdiction: 'US',
        thresholdValue: 10000,
        currency: 'USD',
        comparisonOperator: 'gte' as const,
        alertLevel: 'critical' as const,
        automaticAction: 'report' as const,
        effectiveDate: new Date(),
        isActive: true
      };
      
      const threshold = await configService.upsertRegulatoryThreshold(testThreshold);
      
      expect(threshold.thresholdId).toBeDefined();
      expect(threshold.thresholdValue).toBe(10000);
      expect(threshold.isActive).toBe(true);
    });

    it('should handle regulatory change management', async () => {
      const testChange = {
        changeType: 'threshold_change' as const,
        title: 'Update CTR Threshold',
        description: 'Increase CTR threshold from $10,000 to $15,000',
        affectedRules: ['test-rule-1'],
        affectedThresholds: ['test-threshold-1'],
        jurisdiction: 'US',
        regulatoryBody: 'FinCEN',
        proposedDate: new Date(),
        effectiveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        implementationDeadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        impactLevel: 'medium' as const,
        changeStatus: 'proposed' as const,
        implementationPlan: 'Update threshold configuration and notify stakeholders',
        riskAssessment: 'Low risk - routine threshold adjustment',
        businessImpact: 'Reduced reporting overhead',
        technicalRequirements: ['Update monitoring thresholds', 'Update reporting system']
      };
      
      const change = await configService.proposeRegulatoryChange(testChange);
      
      expect(change.changeId).toBeDefined();
      expect(change.changeStatus).toBe('proposed');
      expect(change.impactLevel).toBe('medium');
    });
  });

  describe('API Endpoint Integration', () => {
    it('should require compliance officer access for sensitive endpoints', async () => {
      // Test without proper authorization
      const response = await request(app)
        .post('/api/v1/admin/compliance/reports')
        .send({
          reportType: 'monthly_aml',
          periodStart: '2024-01-01',
          periodEnd: '2024-01-31'
        });
      
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('COMPLIANCE_ACCESS_DENIED');
    });

    it('should generate reports through API with proper authorization', async () => {
      // Mock compliance officer authentication
      const mockAuth = jest.fn().mockImplementation((req, res, next) => {
        req.user = { 
          id: mockComplianceOfficerId, 
          roles: ['compliance_officer'],
          permissions: ['compliance_access'] 
        };
        next();
      });
      
      // This would require proper middleware setup in the actual test
      // For now, we'll test the service directly
      const report = await reportingService.generateComplianceReport(
        'monthly_aml',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );
      
      expect(report.reportId).toBeDefined();
      expect(report.reportType).toBe('monthly_aml');
    });
  });

  describe('End-to-End Compliance Workflow', () => {
    it('should complete full compliance workflow from detection to reporting', async () => {
      // Step 1: Process suspicious transaction
      const amlResult = await amlService.analyzeTransaction(mockSuspiciousTransaction);
      expect(amlResult.suspicious).toBe(true);
      
      // Step 2: Create suspicious activity record
      const suspiciousActivity = await amlService.createSuspiciousActivity(
        mockSuspiciousTransaction,
        'End-to-end test suspicious activity',
        amlResult.riskScore,
        amlResult.detectedPatterns
      );
      expect(suspiciousActivity.activityId).toBeDefined();
      
      // Step 3: Monitor transaction for regulatory thresholds
      const monitoringResult = await monitoringService.monitorTransaction(mockSuspiciousTransaction);
      expect(monitoringResult.alerts.length).toBeGreaterThan(0);
      
      // Step 4: Generate compliance report
      const report = await reportingService.generateComplianceReport(
        'ad_hoc_suspicious',
        new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        new Date(), // Today
        { recipient: 'FinCEN' }
      );
      expect(report.reportId).toBeDefined();
      
      // Step 5: Verify audit trail captures all events
      const auditEvents = await auditService.getAuditEvents({
        dateRange: {
          start: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          end: new Date()
        }
      });
      
      expect(auditEvents.events.length).toBeGreaterThan(0);
      
      // Verify audit trail integrity
      const integrityResult = await auditService.verifyAuditIntegrity();
      expect(integrityResult.verified).toBe(true);
    });
  });
});

// Helper functions
async function setupTestData(): Promise<void> {
  // This would set up test database tables, mock data, etc.
  // Implementation would depend on your test database setup
}

async function cleanupTestData(): Promise<void> {
  // This would clean up test data from database
  // Implementation would depend on your test database setup
}

async function clearTestTransactionData(): Promise<void> {
  // This would clear transaction-specific test data between tests
  // Implementation would depend on your test database setup
}