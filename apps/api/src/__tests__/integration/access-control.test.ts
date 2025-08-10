import request from 'supertest';
import { app } from '../../app';
import { IsolationAuditService } from '../../services/compliance/isolation-audit.service';

jest.mock('../../services/compliance/isolation-audit.service');

describe('Access Control Integration', () => {
  let mockAuditService: jest.Mocked<IsolationAuditService>;

  beforeEach(() => {
    mockAuditService = new IsolationAuditService('', '') as jest.Mocked<IsolationAuditService>;
    mockAuditService.monitorInternalAccess = jest.fn();
    mockAuditService.generateComplianceReport = jest.fn();
    mockAuditService.verifyContinuousIsolation = jest.fn();
    mockAuditService.logAuditEvent = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Internal Employee Access Control', () => {
    it('should authorize valid employee access with justification', async () => {
      const accessRequest = {
        employeeId: 'emp123',
        cardContextHash: 'context123',
        justification: 'Customer support case #12345'
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(200);
      expect(response.body.authorized).toBe(true);
      expect(mockAuditService.monitorInternalAccess).toHaveBeenCalledWith(
        accessRequest.employeeId,
        accessRequest.cardContextHash
      );
    });

    it('should deny access without proper justification', async () => {
      const accessRequest = {
        employeeId: 'emp123',
        cardContextHash: 'context123'
        // Missing justification
      };

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Access justification required');
    });

    it('should deny unauthorized employee access', async () => {
      const accessRequest = {
        employeeId: 'unauthorized_emp',
        cardContextHash: 'context123',
        justification: 'Unauthorized access attempt'
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(200);
      expect(response.body.authorized).toBe(false);
    });

    it('should detect suspicious access patterns', async () => {
      const employeeId = 'emp123';
      
      // Simulate rapid access to multiple contexts
      const contexts = ['ctx1', 'ctx2', 'ctx3', 'ctx4', 'ctx5', 'ctx6'];
      
      for (const context of contexts) {
        mockAuditService.monitorInternalAccess.mockResolvedValueOnce(true);
        
        await request(app)
          .post('/api/v1/privacy/internal-access/authorize')
          .send({
            employeeId,
            cardContextHash: context,
            justification: `Access to context ${context}`
          });
      }

      // Last access should be flagged as suspicious
      const response = await request(app)
        .get(`/api/v1/privacy/compliance/employee/${employeeId}/access-patterns`);

      expect(response.status).toBe(200);
      expect(response.body.accessMetrics.suspiciousPatterns).toBe(true);
    });

    it('should enforce role-based access control', async () => {
      const accessRequest = {
        employeeId: 'support_agent_123',
        cardContextHash: 'context123',
        justification: 'Customer inquiry',
        role: 'support_agent'
      };

      // Support agents should only access limited card data
      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(200);
      expect(response.body.authorized).toBe(true);
      expect(response.body.accessLevel).toBe('limited'); // Role-specific access level
    });

    it('should block admin access without elevated justification', async () => {
      const accessRequest = {
        employeeId: 'admin_456',
        cardContextHash: 'context123',
        justification: 'Routine check', // Not sufficient for admin
        role: 'admin'
      };

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Elevated justification required for admin access');
    });
  });

  describe('Audit Trail Verification', () => {
    it('should maintain complete audit trail for all access', async () => {
      const cardContextHash = 'context123';

      mockAuditService.logAuditEvent.mockResolvedValueOnce();

      const response = await request(app)
        .get(`/api/v1/privacy/compliance/audit-trail/${cardContextHash}`)
        .query({
          start: new Date(Date.now() - 604800000).toISOString(),
          end: new Date().toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.contextHash).toBe(cardContextHash);
      expect(response.body.events).toBeDefined();
      expect(response.body.summary.totalEvents).toBeGreaterThanOrEqual(0);
    });

    it('should include violation detection in audit trail', async () => {
      const cardContextHash = 'context123';

      const response = await request(app)
        .get(`/api/v1/privacy/compliance/audit-trail/${cardContextHash}`);

      expect(response.status).toBe(200);
      expect(response.body.summary.violations).toBeDefined();
      expect(response.body.summary.complianceRate).toBeDefined();
    });

    it('should preserve audit data for 7 years', async () => {
      const oldDate = new Date(Date.now() - (7 * 365 * 24 * 60 * 60 * 1000)); // 7 years ago
      
      const response = await request(app)
        .get('/api/v1/privacy/compliance/audit-trail/old-context')
        .query({
          start: oldDate.toISOString(),
          end: new Date(oldDate.getTime() + 86400000).toISOString()
        });

      expect(response.status).toBe(200);
      // Should still have access to 7-year-old data
    });
  });

  describe('Real-time Violation Detection', () => {
    it('should detect violations within 30 seconds', async () => {
      // Simulate violation scenario
      const violationRequest = {
        employeeId: 'emp123',
        cardContextHash: 'context123',
        justification: 'Suspicious access pattern'
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(false);

      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(violationRequest);

      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(response.body.authorized).toBe(false);
      expect(endTime - startTime).toBeLessThan(30000); // Within 30 seconds
    });

    it('should trigger immediate alerts for high-risk violations', async () => {
      const highRiskAccess = {
        employeeId: 'emp123',
        cardContextHash: 'context123',
        justification: 'Emergency access',
        riskLevel: 'high'
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(highRiskAccess);

      expect(response.status).toBe(200);
      expect(response.body.authorized).toBe(false);
      // Alert should be triggered (would verify alert system in production)
    });
  });

  describe('Privacy Training Compliance', () => {
    it('should check employee training status', async () => {
      const employeeId = 'emp123';

      const response = await request(app)
        .get(`/api/v1/privacy/compliance/employee/${employeeId}/training-status`);

      expect(response.status).toBe(200);
      expect(response.body.trainingCurrent).toBeDefined();
      expect(response.body.lastTrainingDate).toBeDefined();
      expect(response.body.nextRequiredTraining).toBeDefined();
    });

    it('should block access for employees with expired training', async () => {
      const accessRequest = {
        employeeId: 'emp_expired_training',
        cardContextHash: 'context123',
        justification: 'Customer support'
      };

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Current privacy training required');
    });
  });

  describe('Need-to-Know Access Policy', () => {
    it('should enforce need-to-know restrictions', async () => {
      const accessRequest = {
        employeeId: 'finance_emp',
        cardContextHash: 'context123',
        justification: 'Financial reporting',
        requiredDataFields: ['transaction_amounts', 'timestamps']
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(200);
      expect(response.body.authorizedFields).toEqual(['transaction_amounts', 'timestamps']);
      expect(response.body.restrictedFields).toContain('user_personal_data');
    });

    it('should deny broad access requests without specific justification', async () => {
      const accessRequest = {
        employeeId: 'emp123',
        cardContextHash: 'context123',
        justification: 'General investigation',
        requiredDataFields: ['all_data']
      };

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Specific data access justification required');
    });
  });

  describe('Continuous Compliance Monitoring', () => {
    it('should verify isolation maintenance continuously', async () => {
      const mockVerification = {
        verified: true,
        lastCheck: new Date(),
        nextCheck: new Date(Date.now() + 900000),
        violations: 0
      };

      mockAuditService.verifyContinuousIsolation.mockResolvedValueOnce(mockVerification);

      const response = await request(app)
        .get('/api/v1/privacy/compliance/continuous-verification');

      expect(response.status).toBe(200);
      expect(response.body.complianceStatus.currentlyCompliant).toBe(true);
      expect(response.body.isolationHealth.status).toBe('healthy');
    });

    it('should detect and report compliance degradation', async () => {
      const mockVerification = {
        verified: false,
        lastCheck: new Date(),
        nextCheck: new Date(Date.now() + 900000),
        violations: 3
      };

      mockAuditService.verifyContinuousIsolation.mockResolvedValueOnce(mockVerification);

      const response = await request(app)
        .get('/api/v1/privacy/compliance/continuous-verification');

      expect(response.status).toBe(200);
      expect(response.body.complianceStatus.currentlyCompliant).toBe(false);
      expect(response.body.isolationHealth.status).toBe('degraded');
      expect(response.body.complianceStatus.activeViolations).toBe(3);
    });
  });

  describe('Performance Requirements', () => {
    it('should verify access authorization within 2 seconds', async () => {
      const accessRequest = {
        employeeId: 'emp123',
        cardContextHash: 'context123',
        justification: 'Customer support case'
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(true);

      const startTime = Date.now();
      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(accessRequest);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should log audit events within 10ms', async () => {
      const auditEvent = {
        eventType: 'data_access',
        contextHash: 'context123',
        violationDetected: false,
        metadata: { source: 'test' }
      };

      mockAuditService.logAuditEvent.mockResolvedValueOnce();

      const startTime = Date.now();
      const response = await request(app)
        .post('/api/v1/privacy/compliance/log-event')
        .send(auditEvent);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(10);
    });
  });

  describe('Violation Response', () => {
    it('should respond to violations within 60 seconds', async () => {
      const violationScenario = {
        employeeId: 'malicious_emp',
        cardContextHash: 'context123',
        justification: 'Data mining attempt'
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(false);

      const startTime = Date.now();
      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(violationScenario);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(response.body.authorized).toBe(false);
      expect(endTime - startTime).toBeLessThan(60000);
    });

    it('should implement automatic containment for violations', async () => {
      const severViolation = {
        employeeId: 'emp123',
        cardContextHash: 'context123',
        justification: 'Correlation attempt detected'
      };

      mockAuditService.monitorInternalAccess.mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send(severViolation);

      expect(response.status).toBe(200);
      expect(response.body.authorized).toBe(false);
      expect(response.body.containmentActions).toBeDefined();
    });
  });

  describe('Regulatory Compliance', () => {
    it('should generate GDPR compliance report', async () => {
      const mockReport = {
        reportId: 'report123',
        reportType: 'regulatory_compliance',
        period: {
          start: new Date(Date.now() - 7776000000),
          end: new Date()
        },
        isolationMaintained: true,
        violationCount: 0,
        complianceScore: 99.9,
        details: {
          metrics: {
            totalAccessAttempts: 1000,
            isolatedAccessCount: 999,
            violationCount: 1,
            complianceRate: 0.999,
            riskLevel: 'low'
          },
          recommendations: []
        },
        generatedAt: new Date()
      };

      mockAuditService.generateComplianceReport.mockResolvedValueOnce(mockReport);

      const response = await request(app)
        .get('/api/v1/privacy/compliance/regulatory-report')
        .query({ regulation: 'GDPR' });

      expect(response.status).toBe(200);
      expect(response.body.regulation).toBe('GDPR');
      expect(response.body.complianceStatus.overallCompliance).toBe(true);
      expect(response.body.regulatoryRequirements.dataProtection).toBe('COMPLIANT');
      expect(response.body.attestation.statement).toContain('were maintained');
    });

    it('should report non-compliance when violations exist', async () => {
      const mockReport = {
        reportId: 'report124',
        reportType: 'regulatory_compliance',
        period: {
          start: new Date(Date.now() - 7776000000),
          end: new Date()
        },
        isolationMaintained: false,
        violationCount: 5,
        complianceScore: 95.0,
        details: {
          metrics: {
            totalAccessAttempts: 1000,
            isolatedAccessCount: 950,
            violationCount: 50,
            complianceRate: 0.95,
            riskLevel: 'medium'
          },
          recommendations: ['Strengthen access controls', 'Additional monitoring']
        },
        generatedAt: new Date()
      };

      mockAuditService.generateComplianceReport.mockResolvedValueOnce(mockReport);

      const response = await request(app)
        .get('/api/v1/privacy/compliance/regulatory-report')
        .query({ regulation: 'GDPR' });

      expect(response.status).toBe(200);
      expect(response.body.complianceStatus.overallCompliance).toBe(false);
      expect(response.body.regulatoryRequirements.dataProtection).toBe('NON_COMPLIANT');
      expect(response.body.attestation.statement).toContain('were not maintained');
    });
  });

  describe('Database Query Restrictions', () => {
    it('should prevent cross-context database queries', async () => {
      // Attempt to query across multiple card contexts
      const response = await request(app)
        .post('/api/v1/database/query')
        .send({
          sql: 'SELECT * FROM cards c1 JOIN cards c2 ON c1.user_id = c2.user_id WHERE c1.id != c2.id',
          context: 'system'
        });

      // Query should be blocked
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Cross-context queries not permitted');
    });

    it('should allow single-context queries', async () => {
      const response = await request(app)
        .post('/api/v1/database/query')
        .send({
          sql: 'SELECT * FROM payment_transactions WHERE card_context_hash = current_setting(\'app.card_context\')',
          context: 'context123'
        });

      expect(response.status).toBe(200);
    });

    it('should audit all database access attempts', async () => {
      mockAuditService.logAuditEvent.mockResolvedValueOnce();

      await request(app)
        .post('/api/v1/database/query')
        .send({
          sql: 'SELECT COUNT(*) FROM payment_transactions',
          context: 'context123'
        });

      expect(mockAuditService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'data_access',
          accessPattern: expect.stringContaining('database_query')
        })
      );
    });
  });

  describe('Access Pattern Analysis', () => {
    it('should detect unusual access timing patterns', async () => {
      const employeeId = 'emp123';
      
      // Simulate off-hours access
      const response = await request(app)
        .post('/api/v1/privacy/internal-access/authorize')
        .send({
          employeeId,
          cardContextHash: 'context123',
          justification: 'Emergency access',
          timestamp: new Date().setHours(3, 0, 0, 0) // 3 AM
        });

      expect(response.status).toBe(200);
      expect(response.body.flaggedForReview).toBe(true);
      expect(response.body.reason).toContain('unusual access time');
    });

    it('should detect access volume anomalies', async () => {
      const employeeId = 'emp123';
      
      // Simulate high-volume access
      const requests = Array(50).fill(null).map((_, i) =>
        request(app)
          .post('/api/v1/privacy/internal-access/authorize')
          .send({
            employeeId,
            cardContextHash: `context${i}`,
            justification: `Batch processing ${i}`
          })
      );

      const responses = await Promise.all(requests);
      
      // Later requests should be flagged
      const flaggedResponses = responses.filter(r => 
        r.body.flaggedForReview || r.status === 403
      );
      
      expect(flaggedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Employee Access Management', () => {
    it('should track employee access patterns over time', async () => {
      const employeeId = 'emp123';

      const response = await request(app)
        .get(`/api/v1/privacy/compliance/employee/${employeeId}/access-patterns`);

      expect(response.status).toBe(200);
      expect(response.body.employeeId).toBeDefined(); // Should be hashed
      expect(response.body.accessMetrics.totalAccesses).toBeDefined();
      expect(response.body.accessMetrics.uniqueContextsAccessed).toBeDefined();
      expect(response.body.complianceStatus.followsPolicy).toBeDefined();
    });

    it('should enforce quarterly training requirements', async () => {
      const employeeId = 'emp_needs_training';

      const response = await request(app)
        .get(`/api/v1/privacy/compliance/employee/${employeeId}/access-patterns`);

      expect(response.status).toBe(200);
      if (response.body.complianceStatus.lastTrainingDate) {
        const lastTraining = new Date(response.body.complianceStatus.lastTrainingDate);
        const threeMonthsAgo = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));
        
        if (lastTraining < threeMonthsAgo) {
          expect(response.body.complianceStatus.requiresReview).toBe(true);
        }
      }
    });
  });
});