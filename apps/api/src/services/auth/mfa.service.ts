import { supabase } from '../../utils/supabase';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { logger } from '../../utils/logger';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { createClient } from 'redis';

export interface MFASetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  setupToken: string;
}

export interface MFAChallenge {
  challengeId: string;
  method: 'totp' | 'biometric' | 'backup_code';
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export interface MFAVerification {
  challengeId: string;
  code: string;
  biometricData?: string;
}

export interface MFAConfiguration {
  cardId: string;
  enabled: boolean;
  methods: {
    totp: boolean;
    biometric: boolean;
    backupCodes: boolean;
  };
  riskBasedEnabled: boolean;
  riskThresholds: {
    lowRisk: number;    // 0-25
    mediumRisk: number; // 26-50
    highRisk: number;   // 51-100
  };
}

export interface RiskAssessment {
  riskScore: number;
  factors: RiskFactor[];
  requiresMFA: boolean;
  recommendedMethod: 'totp' | 'biometric' | 'backup_code' | null;
}

export interface RiskFactor {
  type: 'device_unknown' | 'location_unusual' | 'transaction_amount' | 'velocity' | 'time_unusual';
  impact: number; // 0-100
  description: string;
}

export class MFAService {
  private isolationService: TransactionIsolationService;
  private redis: ReturnType<typeof createClient>;
  
  private readonly REDIS_KEYS = {
    MFA_CHALLENGE: (challengeId: string) => `mfa:challenge:${challengeId}`,
    MFA_ATTEMPTS: (cardId: string) => `mfa:attempts:${cardId}`,
    DEVICE_TRUST: (cardId: string, deviceId: string) => `mfa:device:${cardId}:${deviceId}`,
    BIOMETRIC_DATA: (cardId: string) => `mfa:biometric:${cardId}`
  };

  private readonly TTL = {
    CHALLENGE: 300, // 5 minutes
    ATTEMPTS: 3600, // 1 hour
    DEVICE_TRUST: 2592000, // 30 days
    BIOMETRIC: 86400 // 24 hours
  };

  private readonly LIMITS = {
    MAX_ATTEMPTS: 5,
    CHALLENGE_WINDOW: 300, // 5 minutes
    BACKUP_CODES_COUNT: 10,
    TOTP_WINDOW: 1 // Allow 1 step tolerance
  };

  constructor() {
    this.isolationService = new TransactionIsolationService(supabase);
    this.redis = createClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('Redis connection failed:', err);
    });
  }

  async setupMFA(cardId: string, appName: string = 'DisCard'): Promise<MFASetup> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `${appName} (${cardId.slice(-4)})`,
        issuer: appName,
        length: 32
      });
      
      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      
      // Create setup token for verification
      const setupToken = this.generateSetupToken();
      
      // Store temporary setup data
      await this.storeSetupData(cardId, {
        secret: secret.base32,
        backupCodes,
        setupToken,
        cardContextHash: isolationContext.cardContextHash
      });
      
      return {
        secret: secret.base32,
        qrCodeUrl,
        backupCodes,
        setupToken
      };
      
    } catch (error) {
      logger.error('MFA setup failed:', error);
      throw new Error('Failed to setup MFA');
    }
  }

  async verifyMFASetup(
    cardId: string,
    setupToken: string,
    verificationCode: string
  ): Promise<boolean> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      // Get setup data
      const setupData = await this.getSetupData(cardId, setupToken);
      if (!setupData) {
        throw new Error('Invalid setup token');
      }
      
      // Verify TOTP code
      const isValid = speakeasy.totp.verify({
        secret: setupData.secret,
        token: verificationCode,
        window: this.LIMITS.TOTP_WINDOW
      });
      
      if (!isValid) {
        return false;
      }
      
      // Save MFA configuration to database
      await this.saveMFAConfiguration(cardId, setupData);
      
      // Clean up setup data
      await this.cleanupSetupData(cardId, setupToken);
      
      return true;
      
    } catch (error) {
      logger.error('MFA setup verification failed:', error);
      return false;
    }
  }

  async createMFAChallenge(
    cardId: string,
    context: {
      action: string;
      riskScore?: number;
      deviceId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<MFAChallenge> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      // Check if MFA is enabled
      const config = await this.getMFAConfiguration(cardId);
      if (!config.enabled) {
        throw new Error('MFA not enabled');
      }
      
      // Assess risk and determine if MFA is required
      const riskAssessment = await this.assessTransactionRisk(cardId, context);
      if (!riskAssessment.requiresMFA) {
        throw new Error('MFA not required for this transaction');
      }
      
      // Check attempt limits
      await this.checkAttemptLimits(cardId);
      
      // Determine MFA method
      const method = riskAssessment.recommendedMethod || this.selectMFAMethod(config);
      
      // Create challenge
      const challengeId = this.generateChallengeId();
      const challenge: MFAChallenge = {
        challengeId,
        method,
        expiresAt: new Date(Date.now() + (this.LIMITS.CHALLENGE_WINDOW * 1000)),
        metadata: {
          action: context.action,
          riskScore: riskAssessment.riskScore,
          deviceId: context.deviceId,
          ...context.metadata
        }
      };
      
      // Store challenge
      await this.storeChallenge(challenge, cardId);
      
      return challenge;
      
    } catch (error) {
      logger.error('Failed to create MFA challenge:', error);
      throw error;
    }
  }

  async verifyMFAChallenge(
    cardId: string,
    verification: MFAVerification
  ): Promise<boolean> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      // Get challenge
      const challenge = await this.getChallenge(verification.challengeId);
      if (!challenge) {
        throw new Error('Invalid challenge ID');
      }
      
      // Check expiration
      if (new Date() > challenge.expiresAt) {
        await this.cleanupChallenge(verification.challengeId);
        throw new Error('Challenge expired');
      }
      
      // Get MFA configuration
      const config = await this.getMFAConfiguration(cardId);
      
      let isValid = false;
      
      switch (challenge.method) {
        case 'totp':
          isValid = await this.verifyTOTP(cardId, verification.code);
          break;
          
        case 'biometric':
          isValid = await this.verifyBiometric(cardId, verification.biometricData!);
          break;
          
        case 'backup_code':
          isValid = await this.verifyBackupCode(cardId, verification.code);
          break;
          
        default:
          throw new Error('Unsupported MFA method');
      }
      
      // Record attempt
      await this.recordAttempt(cardId, challenge.method, isValid);
      
      if (isValid) {
        // Clean up challenge
        await this.cleanupChallenge(verification.challengeId);
        
        // Update device trust if successful
        if (challenge.metadata?.deviceId) {
          await this.updateDeviceTrust(cardId, challenge.metadata.deviceId);
        }
      }
      
      return isValid;
      
    } catch (error) {
      logger.error('MFA verification failed:', error);
      return false;
    }
  }

  async assessTransactionRisk(
    cardId: string,
    context: {
      action: string;
      riskScore?: number;
      deviceId?: string;
      amount?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<RiskAssessment> {
    try {
      const factors: RiskFactor[] = [];
      let totalRiskScore = 0;
      
      // Base risk from fraud detection system
      if (context.riskScore !== undefined) {
        totalRiskScore += context.riskScore * 0.4; // 40% weight
        
        if (context.riskScore > 75) {
          factors.push({
            type: 'transaction_amount',
            impact: context.riskScore,
            description: 'High fraud risk detected'
          });
        }
      }
      
      // Device trust factor
      if (context.deviceId) {
        const deviceTrust = await this.getDeviceTrust(cardId, context.deviceId);
        const deviceRisk = deviceTrust ? 0 : 30;
        totalRiskScore += deviceRisk;
        
        if (deviceRisk > 0) {
          factors.push({
            type: 'device_unknown',
            impact: deviceRisk,
            description: 'Unknown or untrusted device'
          });
        }
      }
      
      // Transaction amount factor
      if (context.amount !== undefined) {
        const amountRisk = this.calculateAmountRisk(context.amount);
        totalRiskScore += amountRisk;
        
        if (amountRisk > 0) {
          factors.push({
            type: 'transaction_amount',
            impact: amountRisk,
            description: `High transaction amount: $${context.amount}`
          });
        }
      }
      
      // Time-based factor
      const timeRisk = this.calculateTimeRisk();
      totalRiskScore += timeRisk;
      
      if (timeRisk > 0) {
        factors.push({
          type: 'time_unusual',
          impact: timeRisk,
          description: 'Transaction during unusual hours'
        });
      }
      
      // Get MFA configuration for thresholds
      const config = await this.getMFAConfiguration(cardId);
      const requiresMFA = config.riskBasedEnabled && (
        totalRiskScore >= config.riskThresholds.lowRisk
      );
      
      // Recommend method based on risk level
      let recommendedMethod: 'totp' | 'biometric' | 'backup_code' | null = null;
      if (requiresMFA) {
        if (totalRiskScore >= config.riskThresholds.highRisk && config.methods.biometric) {
          recommendedMethod = 'biometric';
        } else if (totalRiskScore >= config.riskThresholds.mediumRisk && config.methods.totp) {
          recommendedMethod = 'totp';
        } else {
          recommendedMethod = config.methods.totp ? 'totp' : 'backup_code';
        }
      }
      
      return {
        riskScore: Math.min(100, Math.round(totalRiskScore)),
        factors,
        requiresMFA,
        recommendedMethod
      };
      
    } catch (error) {
      logger.error('Risk assessment failed:', error);
      // Default to requiring MFA on error
      return {
        riskScore: 100,
        factors: [{
          type: 'device_unknown',
          impact: 100,
          description: 'Risk assessment failed - requiring MFA for security'
        }],
        requiresMFA: true,
        recommendedMethod: 'totp'
      };
    }
  }

  async getMFAConfiguration(cardId: string): Promise<MFAConfiguration> {
    try {
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      const { data, error } = await supabase
        .from('mfa_configurations')
        .select('*')
        .eq('card_context_hash', isolationContext.cardContextHash)
        .single();
      
      if (error || !data) {
        // Return default configuration
        return {
          cardId,
          enabled: false,
          methods: {
            totp: false,
            biometric: false,
            backupCodes: false
          },
          riskBasedEnabled: false,
          riskThresholds: {
            lowRisk: 25,
            mediumRisk: 50,
            highRisk: 75
          }
        };
      }
      
      return {
        cardId,
        enabled: data.enabled,
        methods: data.methods,
        riskBasedEnabled: data.risk_based_enabled,
        riskThresholds: data.risk_thresholds
      };
      
    } catch (error) {
      logger.error('Failed to get MFA configuration:', error);
      throw error;
    }
  }

  async updateMFAConfiguration(
    cardId: string,
    config: Partial<MFAConfiguration>
  ): Promise<void> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      const { error } = await supabase
        .from('mfa_configurations')
        .upsert({
          card_context_hash: isolationContext.cardContextHash,
          enabled: config.enabled,
          methods: config.methods,
          risk_based_enabled: config.riskBasedEnabled,
          risk_thresholds: config.riskThresholds
        });
      
      if (error) {
        throw new Error(`Failed to update MFA configuration: ${error.message}`);
      }
      
    } catch (error) {
      logger.error('Failed to update MFA configuration:', error);
      throw error;
    }
  }

  async disableMFA(cardId: string, verificationCode: string): Promise<boolean> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      // Verify current MFA before disabling
      const isValid = await this.verifyTOTP(cardId, verificationCode);
      if (!isValid) {
        return false;
      }
      
      // Disable MFA
      await this.updateMFAConfiguration(cardId, { enabled: false });
      
      // Clean up MFA data
      await this.cleanupMFAData(cardId);
      
      return true;
      
    } catch (error) {
      logger.error('Failed to disable MFA:', error);
      return false;
    }
  }

  private async verifyTOTP(cardId: string, code: string): Promise<boolean> {
    try {
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      const { data } = await supabase
        .from('mfa_secrets')
        .select('totp_secret')
        .eq('card_context_hash', isolationContext.cardContextHash)
        .single();
      
      if (!data?.totp_secret) {
        return false;
      }
      
      return speakeasy.totp.verify({
        secret: data.totp_secret,
        token: code,
        window: this.LIMITS.TOTP_WINDOW
      });
      
    } catch (error) {
      logger.error('TOTP verification failed:', error);
      return false;
    }
  }

  private async verifyBiometric(cardId: string, biometricData: string): Promise<boolean> {
    try {
      // Get stored biometric template
      const storedTemplate = await this.redis.get(this.REDIS_KEYS.BIOMETRIC_DATA(cardId));
      if (!storedTemplate) {
        return false;
      }
      
      // In real implementation, use biometric matching algorithm
      // For now, simple string comparison (not secure for production)
      return biometricData === storedTemplate;
      
    } catch (error) {
      logger.error('Biometric verification failed:', error);
      return false;
    }
  }

  private async verifyBackupCode(cardId: string, code: string): Promise<boolean> {
    try {
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      const { data } = await supabase
        .from('mfa_backup_codes')
        .select('*')
        .eq('card_context_hash', isolationContext.cardContextHash)
        .eq('code_hash', this.hashBackupCode(code))
        .eq('used', false)
        .single();
      
      if (!data) {
        return false;
      }
      
      // Mark code as used
      await supabase
        .from('mfa_backup_codes')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('code_id', data.code_id);
      
      return true;
      
    } catch (error) {
      logger.error('Backup code verification failed:', error);
      return false;
    }
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.LIMITS.BACKUP_CODES_COUNT; i++) {
      codes.push(this.generateRandomCode(8));
    }
    return codes;
  }

  private generateRandomCode(length: number): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateSetupToken(): string {
    return `setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateChallengeId(): string {
    return `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateAmountRisk(amount: number): number {
    if (amount > 10000) return 40;  // $10,000+
    if (amount > 5000) return 25;   // $5,000+
    if (amount > 1000) return 15;   // $1,000+
    if (amount > 500) return 10;    // $500+
    return 0;
  }

  private calculateTimeRisk(): number {
    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 5) return 20; // 2-5 AM
    if (hour >= 22 || hour <= 1) return 10; // 10 PM - 1 AM
    return 0;
  }

  private selectMFAMethod(config: MFAConfiguration): 'totp' | 'biometric' | 'backup_code' {
    if (config.methods.totp) return 'totp';
    if (config.methods.biometric) return 'biometric';
    return 'backup_code';
  }

  private async storeSetupData(cardId: string, data: any): Promise<void> {
    await this.redis.setEx(`mfa:setup:${cardId}`, 3600, JSON.stringify(data));
  }

  private async getSetupData(cardId: string, token: string): Promise<any> {
    const data = await this.redis.get(`mfa:setup:${cardId}`);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    return parsed.setupToken === token ? parsed : null;
  }

  private async storeChallenge(challenge: MFAChallenge, cardId: string): Promise<void> {
    await this.redis.setEx(
      this.REDIS_KEYS.MFA_CHALLENGE(challenge.challengeId),
      this.TTL.CHALLENGE,
      JSON.stringify({ ...challenge, cardId })
    );
  }

  private async getChallenge(challengeId: string): Promise<(MFAChallenge & { cardId: string }) | null> {
    const data = await this.redis.get(this.REDIS_KEYS.MFA_CHALLENGE(challengeId));
    return data ? JSON.parse(data) : null;
  }

  private async cleanupChallenge(challengeId: string): Promise<void> {
    await this.redis.del(this.REDIS_KEYS.MFA_CHALLENGE(challengeId));
  }

  private async saveMFAConfiguration(cardId: string, setupData: any): Promise<void> {
    const isolationContext = await this.isolationService.getCardContext(cardId);
    
    // Save MFA configuration
    await supabase.from('mfa_configurations').upsert({
      card_context_hash: isolationContext.cardContextHash,
      enabled: true,
      methods: { totp: true, biometric: false, backupCodes: true },
      risk_based_enabled: true,
      risk_thresholds: { lowRisk: 25, mediumRisk: 50, highRisk: 75 }
    });
    
    // Save TOTP secret
    await supabase.from('mfa_secrets').upsert({
      card_context_hash: isolationContext.cardContextHash,
      totp_secret: setupData.secret
    });
    
    // Save backup codes
    for (const code of setupData.backupCodes) {
      await supabase.from('mfa_backup_codes').insert({
        card_context_hash: isolationContext.cardContextHash,
        code_hash: this.hashBackupCode(code),
        used: false
      });
    }
  }

  private hashBackupCode(code: string): string {
    // Simple hash - in production use proper cryptographic hash
    return Buffer.from(code).toString('base64');
  }

  private async getDeviceTrust(cardId: string, deviceId: string): Promise<boolean> {
    const trustData = await this.redis.get(this.REDIS_KEYS.DEVICE_TRUST(cardId, deviceId));
    return trustData === 'trusted';
  }

  private async updateDeviceTrust(cardId: string, deviceId: string): Promise<void> {
    await this.redis.setEx(
      this.REDIS_KEYS.DEVICE_TRUST(cardId, deviceId),
      this.TTL.DEVICE_TRUST,
      'trusted'
    );
  }

  private async checkAttemptLimits(cardId: string): Promise<void> {
    const attempts = await this.redis.get(this.REDIS_KEYS.MFA_ATTEMPTS(cardId));
    const attemptCount = attempts ? parseInt(attempts) : 0;
    
    if (attemptCount >= this.LIMITS.MAX_ATTEMPTS) {
      throw new Error('Too many MFA attempts. Please try again later.');
    }
  }

  private async recordAttempt(cardId: string, method: string, success: boolean): Promise<void> {
    const key = this.REDIS_KEYS.MFA_ATTEMPTS(cardId);
    const attempts = await this.redis.get(key);
    const attemptCount = attempts ? parseInt(attempts) : 0;
    
    if (success) {
      // Reset attempts on success
      await this.redis.del(key);
    } else {
      // Increment attempts on failure
      await this.redis.setEx(key, this.TTL.ATTEMPTS, (attemptCount + 1).toString());
    }
  }

  private async cleanupSetupData(cardId: string, token: string): Promise<void> {
    await this.redis.del(`mfa:setup:${cardId}`);
  }

  private async cleanupMFAData(cardId: string): Promise<void> {
    const isolationContext = await this.isolationService.getCardContext(cardId);
    
    // Remove MFA secrets and backup codes
    await supabase.from('mfa_secrets').delete().eq('card_context_hash', isolationContext.cardContextHash);
    await supabase.from('mfa_backup_codes').delete().eq('card_context_hash', isolationContext.cardContextHash);
    
    // Clean Redis data
    await this.redis.del(this.REDIS_KEYS.MFA_ATTEMPTS(cardId));
    await this.redis.del(this.REDIS_KEYS.BIOMETRIC_DATA(cardId));
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}