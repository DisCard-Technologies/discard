import { Request, Response } from 'express';
import { authService } from './auth.service';
import { totpService } from './totp.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { AUTH_CONSTANTS } from '../../constants/auth.constants';
import { InputSanitizer } from '../../utils/validators';

export class AuthController {
  /**
   * Register a new user
   * POST /auth/register
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, username } = req.body;

      // Sanitize and validate inputs
      const sanitized = InputSanitizer.sanitizeAuthInputs({ email, username });
      const cleanEmail = sanitized.email || email;
      const cleanUsername = sanitized.username || username;

      if (!cleanEmail || !password) {
        res.status(400).json({ 
          success: false,
          error: AUTH_CONSTANTS.ERRORS.EMAIL_REQUIRED 
        });
        return;
      }

      const result = await authService.register({ email: cleanEmail, password, username: cleanUsername });

      res.status(201).json({
        success: true,
        message: AUTH_CONSTANTS.SUCCESS.REGISTRATION,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      const statusCode = errorMessage.includes('already exists') ? 409 : 400;
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Login user
   * POST /auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, totpToken, backupCode } = req.body;

      // Input validation
      if (!email || !password) {
        res.status(400).json({ 
          success: false,
          error: 'Email and password are required' 
        });
        return;
      }

      const result = await authService.login({ email, password, totpToken, backupCode });

      // Check if 2FA is required
      if (result.requires2FA) {
        res.status(200).json({
          success: false,
          requires2FA: true,
          message: '2FA verification required',
          data: {
            userId: result.user.id,
            email: result.user.email
          }
        });
        return;
      }

      res.json({
        success: true,
        message: AUTH_CONSTANTS.SUCCESS.LOGIN,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      let statusCode = 401;
      
      if (errorMessage.includes('locked')) {
        statusCode = 423;
      } else if (errorMessage.includes('2FA')) {
        statusCode = 400;
      }
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Verify email address
   * POST /auth/verify-email
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ 
          success: false,
          error: 'Verification token is required' 
        });
        return;
      }

      const result = await authService.verifyEmail(token);

      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(400).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.EMAIL_VERIFICATION_FAILED
      });
    }
  }

  /**
   * Refresh access token
   * POST /auth/refresh-token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ 
          success: false,
          error: 'Refresh token is required' 
        });
        return;
      }

      const tokens = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn
        }
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.INVALID_REFRESH_TOKEN
      });
    }
  }

  /**
   * Initiate password reset
   * POST /auth/forgot-password
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ 
          success: false,
          error: 'Email is required' 
        });
        return;
      }

      const result = await authService.forgotPassword(email);

      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(400).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.PASSWORD_RESET_FAILED
      });
    }
  }

  /**
   * Reset password with token
   * POST /auth/reset-password
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        res.status(400).json({ 
          success: false,
          error: 'Reset token and new password are required' 
        });
        return;
      }

      const result = await authService.resetPassword(token, password);

      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(400).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.PASSWORD_RESET_FAILED
      });
    }
  }

  /**
   * Setup TOTP 2FA for user
   * POST /auth/totp/setup
   */
  async setupTOTP(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED 
        });
        return;
      }

      // Check if 2FA is already enabled
      const isEnabled = await totpService.isTOTPEnabled(req.user.id);
      if (isEnabled) {
        res.status(400).json({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_ALREADY_ENABLED
        });
        return;
      }

      const setupData = await totpService.setupTOTP(req.user.id, req.user.email);

      res.json({
        success: true,
        message: AUTH_CONSTANTS.SUCCESS.TOTP_SETUP,
        data: {
          secret: setupData.secret,
          manualEntryKey: setupData.manualEntryKey,
          qrCodeUrl: setupData.qrCodeUrl,
          qrCodeDataUrl: setupData.qrCodeDataUrl
        }
      });
    } catch (error) {
      console.error('TOTP setup error:', error);
      res.status(500).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.TOTP_SETUP_FAILED
      });
    }
  }

  /**
   * Verify and activate TOTP 2FA
   * POST /auth/totp/verify
   */
  async verifyTOTP(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED 
        });
        return;
      }

      const { token } = req.body;

      if (!token) {
        res.status(400).json({ 
          success: false,
          error: 'TOTP token is required' 
        });
        return;
      }

      const result = await totpService.verifyAndActivateTOTP(req.user.id, token);

      if (result.success) {
        // Generate backup codes
        const backupCodes = await totpService.generateBackupCodes(req.user.id);
        
        res.json({
          success: true,
          message: result.message,
          data: {
            backupCodes
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error) {
      console.error('TOTP verification error:', error);
      res.status(400).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.TOTP_VERIFICATION_FAILED
      });
    }
  }

  /**
   * Disable TOTP 2FA
   * POST /auth/totp/disable
   */
  async disableTOTP(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED 
        });
        return;
      }

      const { password } = req.body;

      if (!password) {
        res.status(400).json({ 
          success: false,
          error: AUTH_CONSTANTS.ERRORS.PASSWORD_REQUIRED_DISABLE_2FA 
        });
        return;
      }

      // Verify current password before disabling 2FA
      try {
        await authService.login({ email: req.user.email, password });
      } catch (error) {
        res.status(401).json({
          success: false,
          error: 'Invalid password'
        });
        return;
      }

      const result = await totpService.disableTOTP(req.user.id);

      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error) {
      console.error('TOTP disable error:', error);
      res.status(500).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.TOTP_DISABLE_FAILED
      });
    }
  }

  /**
   * Get 2FA status for user
   * GET /auth/totp/status
   */
  async getTOTPStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED 
        });
        return;
      }

      const isEnabled = await totpService.isTOTPEnabled(req.user.id);

      res.json({
        success: true,
        data: {
          totpEnabled: isEnabled
        }
      });
    } catch (error) {
      console.error('TOTP status error:', error);
      res.status(500).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.TOTP_STATUS_FAILED
      });
    }
  }

  /**
   * Generate new backup codes
   * POST /auth/totp/backup-codes
   */
  async generateBackupCodes(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED 
        });
        return;
      }

      // Check if 2FA is enabled
      const isEnabled = await totpService.isTOTPEnabled(req.user.id);
      if (!isEnabled) {
        res.status(400).json({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_NOT_ENABLED
        });
        return;
      }

      const backupCodes = await totpService.generateBackupCodes(req.user.id);

      res.json({
        success: true,
        message: AUTH_CONSTANTS.SUCCESS.BACKUP_CODES_GENERATED,
        data: {
          backupCodes
        }
      });
    } catch (error) {
      console.error('Backup codes generation error:', error);
      res.status(500).json({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.BACKUP_CODES_FAILED
      });
    }
  }

  /**
   * Health check for auth service
   * GET /auth/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      message: 'Auth service is healthy',
      timestamp: new Date().toISOString()
    });
  }
}

export const authController = new AuthController();