import { IncidentResponseService, SecurityIncident, ResponseAction } from '../incident-response.service';
import { TransactionIsolationService } from '../../privacy/transaction-isolation.service';
import { CardFreezeService } from '../card-freeze.service';
import { createClient } from 'redis';

// Mock dependencies
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK')
  }))
}));

jest.mock('../../privacy/transaction-isolation.service');
jest.mock('../card-freeze.service');
jest.mock('../../../utils/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null })
  }
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

describe('IncidentResponseService', () => {
  let service: IncidentResponseService;
  let mockIsolationService: jest.Mocked<TransactionIsolationService>;
  let mockCardFreezeService: jest.Mocked<CardFreezeService>;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new IncidentResponseService();
    mockIsolationService = (TransactionIsolationService as jest.MockedClass<typeof TransactionIsolationService>).mock.instances[0] as any;
    mockCardFreezeService = (CardFreezeService as jest.MockedClass<typeof CardFreezeService>).mock.instances[0] as any;
    mockRedis = (createClient as jest.Mock).mock.results[0].value;
    
    // Set up default mock implementations
    mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
    mockIsolationService.getCardContext.mockResolvedValue({
      contextId: 'test-context',
      cardContextHash: 'test-hash',
      sessionBoundary: 'test-boundary',
      correlationResistance: {
        ipObfuscation: true,
        timingRandomization: true,
        behaviorMasking: true
      }
    });

    mockCardFreezeService.freezeCard.mockResolvedValue({
      success: true,
      freezeId: 'freeze-123'
    });
  });

  afterEach(async () => {
    await service.disconnect();
  });

  describe('createIncident', () => {
    const baseIncident: SecurityIncident = {
      cardId: 'card-123',
      incidentType: 'fraud_attempt',
      severity: 'high',
      relatedEvents: ['event-1', 'event-2'],
      incidentData: {
        riskScore: 85,
        trigger: 'multiple_anomalies'
      }
    };

    it('should create incident successfully', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock validate related events
      supabase.from().select().eq().single
        .mockResolvedValueOnce({ data: { card_context_hash: 'test-hash' }, error: null })
        .mockResolvedValueOnce({ data: { card_context_hash: 'test-hash' }, error: null });
      
      // Mock incident creation
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { incident_id: 'incident-456' },
        error: null
      });

      // Mock low false positive rate
      mockRedis.get.mockResolvedValue('0.05');
      
      const incidentId = await service.createIncident(baseIncident);
      
      expect(incidentId).toBe('incident-456');
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
      expect(supabase.from).toHaveBeenCalledWith('security_incidents');
    });

    it('should validate related events belong to same card', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock event validation - first event valid, second invalid
      supabase.from().select().eq().single
        .mockResolvedValueOnce({ data: { card_context_hash: 'test-hash' }, error: null })
        .mockResolvedValueOnce({ data: { card_context_hash: 'different-hash' }, error: null });
      
      await expect(service.createIncident(baseIncident)).rejects.toThrow('Invalid or unauthorized event');
    });

    it('should trigger auto-response for high severity incidents', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Set up successful incident creation
      supabase.from().select().eq().single.mockResolvedValue({ 
        data: { card_context_hash: 'test-hash' }, 
        error: null 
      });
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { incident_id: 'incident-456' },
        error: null
      });

      // Mock low false positive rate
      mockRedis.get.mockResolvedValue('0.05');

      const criticalIncident = {
        ...baseIncident,
        severity: 'critical' as const
      };
      
      await service.createIncident(criticalIncident);
      
      // Auto-response should freeze card for critical incidents
      expect(mockCardFreezeService.freezeCard).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 'card-123',
          reason: 'fraud_detected'
        })
      );
    });

    it('should skip auto-response for high false positive rate', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValue({ 
        data: { card_context_hash: 'test-hash' }, 
        error: null 
      });
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { incident_id: 'incident-456' },
        error: null
      });

      // Mock high false positive rate
      mockRedis.get.mockResolvedValue('0.15'); // 15% > 10% threshold

      const criticalIncident = {
        ...baseIncident,
        severity: 'critical' as const
      };
      
      await service.createIncident(criticalIncident);
      
      // Auto-response should be skipped
      expect(mockCardFreezeService.freezeCard).not.toHaveBeenCalled();
    });
  });

  describe('classifyIncident', () => {
    const baseEvents = [
      {
        event_id: 'event-1',
        event_type: 'velocity_exceeded',
        risk_score: 75,
        detected_at: new Date().toISOString(),
        anomalies: [{ type: 'velocity', severity: 'high' }]
      }
    ];

    it('should classify brute force attacks', async () => {
      const recentEvents = Array(6).fill(null).map((_, i) => ({
        ...baseEvents[0],
        event_id: `event-${i}`,
        detected_at: new Date(Date.now() - i * 30000).toISOString() // 30s apart
      }));
      
      const classification = await service.classifyIncident(recentEvents, 'card-123');
      
      expect(classification.incidentType).toBe('account_takeover');
      expect(classification.severity).toBe('high');
      expect(classification.confidence).toBeGreaterThan(0.8);
    });

    it('should classify geographic anomalies', async () => {
      const geoEvents = [
        {
          ...baseEvents[0],
          risk_score: 90,
          anomalies: [
            {
              type: 'geographic',
              severity: 'high',
              details: 'impossible travel speed detected'
            }
          ]
        }
      ];
      
      const classification = await service.classifyIncident(geoEvents, 'card-123');
      
      expect(classification.incidentType).toBe('fraud_attempt');
      expect(classification.severity).toBe('critical');
    });

    it('should classify suspicious patterns', async () => {
      const patternEvents = [
        {
          ...baseEvents[0],
          anomalies: [
            { type: 'velocity', severity: 'medium' },
            { type: 'amount', severity: 'low' },
            { type: 'merchant', severity: 'medium' },
            { type: 'pattern', severity: 'low' }
          ]
        }
      ];
      
      const classification = await service.classifyIncident(patternEvents, 'card-123');
      
      expect(classification.incidentType).toBe('suspicious_pattern');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });

    it('should provide default classification', async () => {
      const normalEvents = [
        {
          ...baseEvents[0],
          risk_score: 80,
          anomalies: [{ type: 'amount', severity: 'medium' }]
        }
      ];
      
      const classification = await service.classifyIncident(normalEvents, 'card-123');
      
      expect(classification.incidentType).toBe('fraud_attempt');
      expect(classification.severity).toBe('high');
    });
  });

  describe('executeResponse', () => {
    const mockActions: ResponseAction[] = [
      {
        actionType: 'card_freeze',
        actionData: { cardId: 'card-123', reason: 'fraud detected' },
        timestamp: new Date()
      },
      {
        actionType: 'alert_user',
        actionData: { cardId: 'card-123', message: 'Security alert' },
        timestamp: new Date()
      }
    ];

    it('should execute all actions successfully', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock incident update
      supabase.from().update().eq.mockResolvedValue({
        data: null,
        error: null
      });
      
      const results = await service.executeResponse('incident-123', mockActions);
      
      expect(results).toHaveLength(2);
      expect(results[0].result).toBe('success');
      expect(results[1].result).toBe('success');
      expect(mockCardFreezeService.freezeCard).toHaveBeenCalled();
    });

    it('should handle action failures gracefully', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock card freeze failure
      mockCardFreezeService.freezeCard.mockResolvedValueOnce({
        success: false,
        error: 'Freeze failed'
      });
      
      supabase.from().update().eq.mockResolvedValue({
        data: null,
        error: null
      });
      
      const results = await service.executeResponse('incident-123', mockActions);
      
      expect(results[0].result).toBe('failure');
      expect(results[0].details).toBe('Failed to freeze card');
    });

    it('should handle unknown action types', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      const unknownAction: ResponseAction = {
        actionType: 'unknown_action' as any,
        actionData: {},
        timestamp: new Date()
      };
      
      supabase.from().update().eq.mockResolvedValue({
        data: null,
        error: null
      });
      
      const results = await service.executeResponse('incident-123', [unknownAction]);
      
      expect(results[0].result).toBe('failure');
      expect(results[0].details).toContain('Unknown action type');
    });
  });

  describe('recordFalsePositive', () => {
    it('should update incident and ML model feedback', async () => {
      const { supabase } = require('../../../utils/supabase');
      const { logger } = require('../../../utils/logger');
      
      // Mock incident resolution
      supabase.from().update().eq.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      // Mock get incident details
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          incident_id: 'incident-123',
          related_events: ['event-1', 'event-2']
        },
        error: null
      });
      
      await service.recordFalsePositive('incident-123', 'card-123');
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
      expect(supabase.from().update).toHaveBeenCalledWith({
        status: 'resolved',
        resolution_summary: 'False positive - user reported'
      });
      
      // Should log feedback for each related event
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Recording feedback for event event-1')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Recording feedback for event event-2')
      );
    });
  });

  describe('incident classification patterns', () => {
    it('should detect brute force with multiple rapid events', async () => {
      const rapidEvents = Array(7).fill(null).map((_, i) => ({
        event_id: `event-${i}`,
        event_type: 'suspicious_transaction',
        risk_score: 60,
        detected_at: new Date(Date.now() - i * 10000).toISOString(), // 10s apart
        anomalies: []
      }));
      
      const classification = await service.classifyIncident(rapidEvents, 'card-123');
      
      expect(classification.incidentType).toBe('account_takeover');
    });

    it('should calculate severity based on risk scores', async () => {
      const highRiskEvents = [
        {
          event_id: 'event-1',
          event_type: 'fraud_attempt',
          risk_score: 95,
          detected_at: new Date().toISOString(),
          anomalies: [{ type: 'amount', severity: 'high' }]
        }
      ];
      
      const classification = await service.classifyIncident(highRiskEvents, 'card-123');
      
      expect(classification.severity).toBe('critical');
    });
  });
});