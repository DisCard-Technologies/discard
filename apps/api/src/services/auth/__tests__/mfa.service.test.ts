import { MFAService, MFAConfiguration } from '../mfa.service';
import { TransactionIsolationService } from '../../privacy/transaction-isolation.service';
import { createClient } from 'redis';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

// Mock dependencies
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  }))
}));

jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(),
  totp: {
    verify: jest.fn()
  }
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn()
}));

jest.mock('../../privacy/transaction-isolation.service');
jest.mock('../../../utils/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
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

describe('MFAService', () => {
  let service: MFAService;
  let mockIsolationService: jest.Mocked<TransactionIsolationService>;
  let mockRedis: any;
  let mockSpeakeasy: jest.Mocked<typeof speakeasy>;
  let mockQRCode: jest.Mocked<typeof QRCode>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new MFAService();
    mockIsolationService = (TransactionIsolationService as jest.MockedClass<typeof TransactionIsolationService>).mock.instances[0] as any;
    mockRedis = (createClient as jest.Mock).mock.results[0].value;
    mockSpeakeasy = speakeasy as any;
    mockQRCode = QRCode as any;
    
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
  });

  afterEach(async () => {
    await service.disconnect();
  });

  describe('setupMFA', () => {
    it('should setup MFA successfully', async () => {
      const mockSecret = {
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/DisCard%20%28card-123%29?secret=JBSWY3DPEHPK3PXP&issuer=DisCard'
      };
      
      mockSpeakeasy.generateSecret.mockReturnValue(mockSecret as any);
      mockQRCode.toDataURL.mockResolvedValue('data:image/png;base64,mockqrcode');
      
      const setup = await service.setupMFA('card-123', 'DisCard');
      
      expect(setup.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(setup.qrCodeUrl).toBe('data:image/png;base64,mockqrcode');
      expect(setup.backupCodes).toHaveLength(10);
      expect(setup.setupToken).toMatch(/^setup_/);
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.stringContaining('mfa:setup:card-123'),
        3600,
        expect.any(String)
      );
    });

    it('should handle setup errors gracefully', async () => {
      mockSpeakeasy.generateSecret.mockImplementation(() => {
        throw new Error('Secret generation failed');
      });
      
      await expect(service.setupMFA('card-123')).rejects.toThrow('Failed to setup MFA');
    });
  });

  describe('verifyMFASetup', () => {
    it('should verify MFA setup successfully', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock setup data
      const setupData = {
        secret: 'JBSWY3DPEHPK3PXP',
        backupCodes: ['CODE1', 'CODE2'],
        setupToken: 'setup_token',
        cardContextHash: 'test-hash'
      };
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(setupData));
      mockSpeakeasy.totp.verify.mockReturnValue(true);
      
      // Mock database operations
      supabase.from().upsert.mockResolvedValue({ error: null });
      supabase.from().insert.mockResolvedValue({ error: null });
      
      const result = await service.verifyMFASetup('card-123', 'setup_token', '123456');
      
      expect(result).toBe(true);
      expect(mockSpeakeasy.totp.verify).toHaveBeenCalledWith({
        secret: 'JBSWY3DPEHPK3PXP',
        token: '123456',
        window: 1
      });
    });

    it('should reject invalid verification codes', async () => {
      const setupData = {
        secret: 'JBSWY3DPEHPK3PXP',
        setupToken: 'setup_token'
      };
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(setupData));
      mockSpeakeasy.totp.verify.mockReturnValue(false);
      
      const result = await service.verifyMFASetup('card-123', 'setup_token', 'invalid');
      
      expect(result).toBe(false);
    });

    it('should reject invalid setup tokens', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      
      await expect(service.verifyMFASetup('card-123', 'invalid_token', '123456'))
        .rejects.toThrow('Invalid setup token');
    });
  });

  describe('createMFAChallenge', () => {
    const mockConfig: MFAConfiguration = {
      cardId: 'card-123',
      enabled: true,
      methods: { totp: true, biometric: false, backupCodes: true },
      riskBasedEnabled: true,
      riskThresholds: { lowRisk: 25, mediumRisk: 50, highRisk: 75 }
    };

    it('should create MFA challenge for high-risk transaction', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock MFA configuration
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          enabled: true,
          methods: mockConfig.methods,
          risk_based_enabled: true,
          risk_thresholds: mockConfig.riskThresholds
        },
        error: null
      });
      
      // Mock device trust (unknown device)
      mockRedis.get.mockResolvedValueOnce(null);
      
      const context = {
        action: 'high_value_transaction',
        riskScore: 85,
        deviceId: 'unknown_device',
        amount: 5000
      };
      
      const challenge = await service.createMFAChallenge('card-123', context);
      
      expect(challenge.challengeId).toMatch(/^challenge_/);
      expect(challenge.method).toBe('totp');
      expect(challenge.metadata?.action).toBe('high_value_transaction');
      expect(challenge.metadata?.riskScore).toBeGreaterThan(50);
    });

    it('should throw error if MFA not enabled', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: { enabled: false },
        error: null
      });
      
      const context = { action: 'test', riskScore: 100 };
      
      await expect(service.createMFAChallenge('card-123', context))
        .rejects.toThrow('MFA not enabled');
    });

    it('should throw error if MFA not required for low risk', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          enabled: true,
          risk_based_enabled: true,
          risk_thresholds: { lowRisk: 50, mediumRisk: 70, highRisk: 90 }
        },
        error: null
      });
      
      // Mock trusted device
      mockRedis.get.mockResolvedValueOnce('trusted');
      
      const context = {
        action: 'low_risk_transaction',
        riskScore: 10,
        deviceId: 'trusted_device',
        amount: 50
      };
      
      await expect(service.createMFAChallenge('card-123', context))
        .rejects.toThrow('MFA not required');
    });
  });

  describe('verifyMFAChallenge', () => {
    it('should verify TOTP challenge successfully', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      const challenge = {
        challengeId: 'challenge_123',
        method: 'totp',
        expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
        metadata: { action: 'test' },
        cardId: 'card-123'
      };
      
      // Mock challenge data
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(challenge));
      
      // Mock MFA configuration
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          enabled: true,
          methods: { totp: true }
        },
        error: null
      });
      
      // Mock TOTP secret
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: { totp_secret: 'JBSWY3DPEHPK3PXP' },
        error: null
      });
      
      mockSpeakeasy.totp.verify.mockReturnValue(true);
      
      const verification = {
        challengeId: 'challenge_123',
        code: '123456'
      };
      
      const result = await service.verifyMFAChallenge('card-123', verification);
      
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining('challenge_123'));
    });

    it('should reject expired challenges', async () => {
      const challenge = {
        challengeId: 'challenge_123',
        method: 'totp',
        expiresAt: new Date(Date.now() - 1000), // Expired
        cardId: 'card-123'
      };
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(challenge));
      
      const verification = {
        challengeId: 'challenge_123',
        code: '123456'
      };
      
      const result = await service.verifyMFAChallenge('card-123', verification);
      
      expect(result).toBe(false);
    });

    it('should handle invalid challenge IDs', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      
      const verification = {
        challengeId: 'invalid_challenge',
        code: '123456'
      };
      
      const result = await service.verifyMFAChallenge('card-123', verification);
      
      expect(result).toBe(false);
    });
  });

  describe('assessTransactionRisk', () => {
    beforeEach(() => {
      const mockConfig: MFAConfiguration = {
        cardId: 'card-123',
        enabled: true,
        methods: { totp: true, biometric: true, backupCodes: true },
        riskBasedEnabled: true,
        riskThresholds: { lowRisk: 25, mediumRisk: 50, highRisk: 75 }
      };

      const { supabase } = require('../../../utils/supabase');
      supabase.from().select().eq().single.mockResolvedValue({
        data: {
          enabled: mockConfig.enabled,
          methods: mockConfig.methods,
          risk_based_enabled: mockConfig.riskBasedEnabled,
          risk_thresholds: mockConfig.riskThresholds
        },
        error: null
      });
    });

    it('should assess high risk for unknown device and high amount', async () => {
      // Mock unknown device
      mockRedis.get.mockResolvedValueOnce(null);
      
      const context = {
        action: 'transaction',
        riskScore: 60,
        deviceId: 'unknown_device',
        amount: 10000
      };
      
      const assessment = await service.assessTransactionRisk('card-123', context);
      
      expect(assessment.riskScore).toBeGreaterThan(50);
      expect(assessment.requiresMFA).toBe(true);
      expect(assessment.recommendedMethod).toBe('biometric'); // High risk
      expect(assessment.factors.length).toBeGreaterThan(1);
    });

    it('should assess low risk for trusted device and small amount', async () => {
      // Mock trusted device
      mockRedis.get.mockResolvedValueOnce('trusted');
      
      const context = {
        action: 'transaction',
        riskScore: 10,
        deviceId: 'trusted_device',
        amount: 50
      };
      
      const assessment = await service.assessTransactionRisk('card-123', context);
      
      expect(assessment.riskScore).toBeLessThan(25);
      expect(assessment.requiresMFA).toBe(false);
      expect(assessment.recommendedMethod).toBeNull();
    });

    it('should add time-based risk factor for unusual hours', async () => {
      // Mock 3 AM transaction
      const originalDate = Date;
      const mockDate = jest.fn(() => ({
        getHours: () => 3
      })) as any;
      global.Date = mockDate;
      
      mockRedis.get.mockResolvedValueOnce('trusted');
      
      const context = {
        action: 'transaction',
        deviceId: 'trusted_device',
        amount: 100
      };
      
      const assessment = await service.assessTransactionRisk('card-123', context);
      
      const timeRiskFactor = assessment.factors.find(f => f.type === 'time_unusual');
      expect(timeRiskFactor).toBeDefined();
      expect(timeRiskFactor?.impact).toBeGreaterThan(0);
      
      global.Date = originalDate;
    });
  });

  describe('getMFAConfiguration', () => {
    it('should return stored configuration', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      const storedConfig = {
        enabled: true,
        methods: { totp: true, biometric: false, backupCodes: true },
        risk_based_enabled: true,
        risk_thresholds: { lowRisk: 30, mediumRisk: 60, highRisk: 90 }
      };
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: storedConfig,
        error: null
      });
      
      const config = await service.getMFAConfiguration('card-123');
      
      expect(config.enabled).toBe(true);
      expect(config.methods.totp).toBe(true);
      expect(config.methods.biometric).toBe(false);
      expect(config.riskThresholds.highRisk).toBe(90);
    });

    it('should return default configuration when none stored', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const config = await service.getMFAConfiguration('card-123');
      
      expect(config.enabled).toBe(false);
      expect(config.methods.totp).toBe(false);
      expect(config.riskBasedEnabled).toBe(false);
      expect(config.riskThresholds.lowRisk).toBe(25);
    });
  });

  describe('disableMFA', () => {
    it('should disable MFA with valid verification', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock TOTP verification
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: { totp_secret: 'JBSWY3DPEHPK3PXP' },
        error: null
      });
      
      mockSpeakeasy.totp.verify.mockReturnValue(true);
      
      // Mock configuration update
      supabase.from().upsert.mockResolvedValueOnce({ error: null });
      
      // Mock cleanup operations
      supabase.from().delete().eq.mockResolvedValue({ error: null });
      
      const result = await service.disableMFA('card-123', '123456');
      
      expect(result).toBe(true);
      expect(mockSpeakeasy.totp.verify).toHaveBeenCalledWith({
        secret: 'JBSWY3DPEHPK3PXP',
        token: '123456',
        window: 1
      });
    });

    it('should not disable MFA with invalid verification', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: { totp_secret: 'JBSWY3DPEHPK3PXP' },
        error: null
      });
      
      mockSpeakeasy.totp.verify.mockReturnValue(false);
      
      const result = await service.disableMFA('card-123', 'invalid');
      
      expect(result).toBe(false);
    });
  });
});