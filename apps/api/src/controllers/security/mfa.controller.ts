import { Request, Response } from 'express';
import { MFAService } from '../../services/auth/mfa.service';
import { logger } from '../../utils/logger';

export class MFAController {
  private mfaService: MFAService;

  constructor() {
    this.mfaService = new MFAService();
  }

  // POST /api/v1/security/mfa/:cardId/setup
  async setupMFA(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { appName = 'DisCard' } = req.body;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      // Check if MFA is already enabled
      const config = await this.mfaService.getMFAConfiguration(cardId);
      if (config.enabled) {
        res.status(409).json({ error: 'MFA is already enabled for this card' });
        return;
      }

      const setup = await this.mfaService.setupMFA(cardId, appName);

      // Don't send the secret in the response for security
      res.json({
        qrCodeUrl: setup.qrCodeUrl,
        backupCodes: setup.backupCodes,
        setupToken: setup.setupToken,
        instructions: {
          step1: 'Scan the QR code with your authenticator app',
          step2: 'Enter the 6-digit verification code from your app',
          step3: 'Save your backup codes in a secure location'
        }
      });

    } catch (error) {
      logger.error('MFA setup failed:', error);
      res.status(500).json({ error: 'Failed to setup MFA' });
    }
  }

  // POST /api/v1/security/mfa/:cardId/verify-setup
  async verifySetup(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { setupToken, verificationCode } = req.body;

      if (!cardId || !setupToken || !verificationCode) {
        res.status(400).json({ 
          error: 'Card ID, setup token, and verification code are required' 
        });
        return;
      }

      const isValid = await this.mfaService.verifyMFASetup(
        cardId,
        setupToken,
        verificationCode
      );

      if (!isValid) {
        res.status(400).json({ 
          error: 'Invalid verification code. Please check your authenticator app.' 
        });
        return;
      }

      res.json({
        success: true,
        message: 'MFA setup completed successfully',
        mfaEnabled: true
      });

    } catch (error) {
      logger.error('MFA setup verification failed:', error);
      res.status(500).json({ error: 'Failed to verify MFA setup' });
    }
  }

  // POST /api/v1/security/mfa/:cardId/challenge
  async createChallenge(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { action, amount, metadata } = req.body;

      if (!cardId || !action) {
        res.status(400).json({ error: 'Card ID and action are required' });
        return;
      }

      // Assess transaction risk
      const riskAssessment = await this.mfaService.assessTransactionRisk(cardId, {
        action,
        amount,
        deviceId: req.headers['x-device-id'] as string,
        metadata
      });

      if (!riskAssessment.requiresMFA) {
        res.json({
          requiresMFA: false,
          riskAssessment,
          message: 'MFA not required for this transaction'
        });
        return;
      }

      // Create MFA challenge
      const challenge = await this.mfaService.createMFAChallenge(cardId, {
        action,
        riskScore: riskAssessment.riskScore,
        deviceId: req.headers['x-device-id'] as string,
        metadata: { amount, ...metadata }
      });

      res.json({
        requiresMFA: true,
        challenge,
        riskAssessment,
        instructions: this.getChallengeInstructions(challenge.method)
      });

    } catch (error) {
      logger.error('MFA challenge creation failed:', error);
      res.status(500).json({ error: 'Failed to create MFA challenge' });
    }
  }

  // POST /api/v1/security/mfa/:cardId/verify
  async verifyChallenge(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { challengeId, code, biometricData } = req.body;

      if (!cardId || !challengeId) {
        res.status(400).json({ error: 'Card ID and challenge ID are required' });
        return;
      }

      const verification = {
        challengeId,
        code,
        biometricData
      };

      const isValid = await this.mfaService.verifyMFAChallenge(cardId, verification);

      if (!isValid) {
        res.status(401).json({ 
          error: 'MFA verification failed. Please check your code and try again.' 
        });
        return;
      }

      res.json({
        success: true,
        verified: true,
        message: 'MFA verification successful'
      });

    } catch (error) {
      logger.error('MFA verification failed:', error);
      res.status(500).json({ error: 'Failed to verify MFA challenge' });
    }
  }

  // GET /api/v1/security/mfa/:cardId/config
  async getConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      const config = await this.mfaService.getMFAConfiguration(cardId);

      // Remove sensitive configuration details
      const safeConfig = {
        enabled: config.enabled,
        methods: config.methods,
        riskBasedEnabled: config.riskBasedEnabled,
        riskThresholds: {
          lowRisk: config.riskThresholds.lowRisk,
          mediumRisk: config.riskThresholds.mediumRisk,
          highRisk: config.riskThresholds.highRisk
        }
      };

      res.json(safeConfig);

    } catch (error) {
      logger.error('Get MFA configuration failed:', error);
      res.status(500).json({ error: 'Failed to retrieve MFA configuration' });
    }
  }

  // PUT /api/v1/security/mfa/:cardId/config
  async updateConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { 
        riskBasedEnabled,
        riskThresholds,
        methods
      } = req.body;

      if (!cardId) {
        res.status(400).json({ error: 'Card ID is required' });
        return;
      }

      // Validate risk thresholds
      if (riskThresholds) {
        const { lowRisk, mediumRisk, highRisk } = riskThresholds;
        if (lowRisk >= mediumRisk || mediumRisk >= highRisk || highRisk > 100) {
          res.status(400).json({ 
            error: 'Invalid risk thresholds. Must be: lowRisk < mediumRisk < highRisk <= 100' 
          });
          return;
        }
      }

      await this.mfaService.updateMFAConfiguration(cardId, {
        riskBasedEnabled,
        riskThresholds,
        methods
      });

      res.json({
        success: true,
        message: 'MFA configuration updated successfully'
      });

    } catch (error) {
      logger.error('Update MFA configuration failed:', error);
      res.status(500).json({ error: 'Failed to update MFA configuration' });
    }
  }

  // POST /api/v1/security/mfa/:cardId/disable
  async disableMFA(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { verificationCode } = req.body;

      if (!cardId || !verificationCode) {
        res.status(400).json({ error: 'Card ID and verification code are required' });
        return;
      }

      const success = await this.mfaService.disableMFA(cardId, verificationCode);

      if (!success) {
        res.status(401).json({ 
          error: 'Invalid verification code. Cannot disable MFA.' 
        });
        return;
      }

      res.json({
        success: true,
        message: 'MFA disabled successfully',
        mfaEnabled: false
      });

    } catch (error) {
      logger.error('Disable MFA failed:', error);
      res.status(500).json({ error: 'Failed to disable MFA' });
    }
  }

  // POST /api/v1/security/mfa/:cardId/assess-risk
  async assessRisk(req: Request, res: Response): Promise<void> {
    try {
      const { cardId } = req.params;
      const { action, amount, metadata } = req.body;

      if (!cardId || !action) {
        res.status(400).json({ error: 'Card ID and action are required' });
        return;
      }

      const assessment = await this.mfaService.assessTransactionRisk(cardId, {
        action,
        amount,
        deviceId: req.headers['x-device-id'] as string,
        metadata
      });

      res.json({
        riskScore: assessment.riskScore,
        factors: assessment.factors,
        requiresMFA: assessment.requiresMFA,
        recommendedMethod: assessment.recommendedMethod,
        riskLevel: this.getRiskLevel(assessment.riskScore)
      });

    } catch (error) {
      logger.error('Risk assessment failed:', error);
      res.status(500).json({ error: 'Failed to assess transaction risk' });
    }
  }

  // Helper methods
  private getChallengeInstructions(method: string): Record<string, string> {
    const instructions = {
      totp: {
        title: 'Authenticator App Verification',
        description: 'Open your authenticator app and enter the 6-digit code',
        inputLabel: 'Verification Code',
        inputPlaceholder: '000000'
      },
      biometric: {
        title: 'Biometric Verification',
        description: 'Use your fingerprint or face ID to verify your identity',
        inputLabel: 'Biometric Data',
        inputPlaceholder: 'Touch sensor or look at camera'
      },
      backup_code: {
        title: 'Backup Code Verification',
        description: 'Enter one of your saved backup codes',
        inputLabel: 'Backup Code',
        inputPlaceholder: 'XXXXXXXX'
      }
    };

    return instructions[method] || instructions.totp;
  }

  private getRiskLevel(riskScore: number): string {
    if (riskScore >= 75) return 'high';
    if (riskScore >= 50) return 'medium';
    if (riskScore >= 25) return 'low';
    return 'minimal';
  }
}