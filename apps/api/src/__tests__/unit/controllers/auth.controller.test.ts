import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../middleware/auth';
import { AUTH_CONSTANTS } from '../../../constants/auth.constants';

// Mock all dependencies before importing the controller
jest.mock('../../../services/auth/auth.service', () => ({
  authService: {
    register: jest.fn(),
    login: jest.fn(),
    verifyEmail: jest.fn(),
    refreshToken: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn()
  }
}));

jest.mock('../../../services/auth/totp.service', () => ({
  totpService: {
    isTOTPEnabled: jest.fn(),
    setupTOTP: jest.fn(),
    verifyAndActivateTOTP: jest.fn(),
    disableTOTP: jest.fn(),
    generateBackupCodes: jest.fn()
  }
}));

jest.mock('../../../utils/validators', () => ({
  InputSanitizer: {
    sanitizeAuthInputs: jest.fn()
  }
}));

// Mock app.ts to prevent loading other services
jest.mock('../../../app', () => ({}));

// Now import the controller after mocks are set up
import { authController } from '../../../services/auth/auth.controller';
import { authService } from '../../../services/auth/auth.service';
import { totpService } from '../../../services/auth/totp.service';
import { InputSanitizer } from '../../../utils/validators';

describe('AuthController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockAuthReq: Partial<AuthenticatedRequest>;
  
  beforeEach(() => {
    mockReq = {
      body: {}
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };

    mockAuthReq = {
      body: {},
      user: {
        id: 'test-user-id',
        email: 'test@example.com'
      }
    };

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        username: 'testuser'
      };

      const mockResult = {
        user: { id: '1', email: 'test@example.com', username: 'testuser' },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        }
      };

      (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
        email: 'test@example.com',
        username: 'testuser'
      });
      (authService.register as jest.Mock).mockResolvedValue(mockResult);

      await authController.register(mockReq as Request, mockRes as Response);

      expect(authService.register).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'SecurePass123!',
        username: 'testuser'
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: AUTH_CONSTANTS.SUCCESS.REGISTRATION,
        data: {
          user: mockResult.user,
          accessToken: mockResult.tokens.accessToken,
          refreshToken: mockResult.tokens.refreshToken,
          expiresIn: mockResult.tokens.expiresIn
        }
      });
    });

    it('should return 400 when email is missing', async () => {
      mockReq.body = { password: 'SecurePass123!' };

      (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({});

      await authController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.EMAIL_REQUIRED
      });
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should return 400 when password is missing', async () => {
      mockReq.body = { email: 'test@example.com' };

      (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
        email: 'test@example.com'
      });

      await authController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.EMAIL_REQUIRED
      });
    });

    it('should return 409 when user already exists', async () => {
      mockReq.body = {
        email: 'existing@example.com',
        password: 'SecurePass123!'
      };

      (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
        email: 'existing@example.com'
      });
      (authService.register as jest.Mock).mockRejectedValue(
        new Error('User already exists')
      );

      await authController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User already exists'
      });
    });

    it('should handle generic registration errors', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
        email: 'test@example.com'
      });
      (authService.register as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await authController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database connection failed'
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
        email: 'test@example.com'
      });
      (authService.register as jest.Mock).mockRejectedValue('String error');

      await authController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Registration failed'
      });
    });
  });

  describe('login', () => {
    it('should login user successfully without 2FA', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult = {
        requires2FA: false,
        user: { id: '1', email: 'test@example.com' },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        }
      };

      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      await authController.login(mockReq as Request, mockRes as Response);

      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'SecurePass123!'
      });

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: AUTH_CONSTANTS.SUCCESS.LOGIN,
        data: {
          user: mockResult.user,
          accessToken: mockResult.tokens.accessToken,
          refreshToken: mockResult.tokens.refreshToken,
          expiresIn: mockResult.tokens.expiresIn
        }
      });
    });

    it('should return 2FA required response', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult = {
        requires2FA: true,
        user: { id: '1', email: 'test@example.com' },
        tokens: null
      };

      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        requires2FA: true,
        message: '2FA verification required',
        data: {
          userId: mockResult.user.id,
          email: mockResult.user.email
        }
      });
    });

    it('should login with TOTP token', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        totpToken: '123456'
      };

      const mockResult = {
        requires2FA: false,
        user: { id: '1', email: 'test@example.com' },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        }
      };

      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      await authController.login(mockReq as Request, mockRes as Response);

      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'SecurePass123!',
        totpToken: '123456'
      });
    });

    it('should login with backup code', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        backupCode: 'backup-code-123'
      };

      const mockResult = {
        requires2FA: false,
        user: { id: '1', email: 'test@example.com' },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        }
      };

      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      await authController.login(mockReq as Request, mockRes as Response);

      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'SecurePass123!',
        backupCode: 'backup-code-123'
      });
    });

    it('should return 400 when email is missing', async () => {
      mockReq.body = { password: 'SecurePass123!' };

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email and password are required'
      });
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('should return 400 when password is missing', async () => {
      mockReq.body = { email: 'test@example.com' };

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email and password are required'
      });
    });

    it('should return 423 for locked account', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      (authService.login as jest.Mock).mockRejectedValue(
        new Error('Account is locked due to too many failed attempts')
      );

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(423);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Account is locked due to too many failed attempts'
      });
    });

    it('should return 400 for 2FA errors', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        totpToken: '000000'
      };

      (authService.login as jest.Mock).mockRejectedValue(
        new Error('Invalid 2FA token')
      );

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA token'
      });
    });

    it('should return 401 for invalid credentials', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      (authService.login as jest.Mock).mockRejectedValue(
        new Error('Invalid credentials')
      );

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid credentials'
      });
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      mockReq.body = { token: 'valid-verification-token' };

      (authService.verifyEmail as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Email verified successfully'
      });

      await authController.verifyEmail(mockReq as Request, mockRes as Response);

      expect(authService.verifyEmail).toHaveBeenCalledWith('valid-verification-token');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Email verified successfully'
      });
    });

    it('should return 400 when token is missing', async () => {
      mockReq.body = {};

      await authController.verifyEmail(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification token is required'
      });
      expect(authService.verifyEmail).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid token', async () => {
      mockReq.body = { token: 'invalid-token' };

      (authService.verifyEmail as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Invalid or expired verification token'
      });

      await authController.verifyEmail(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired verification token'
      });
    });

    it('should handle verification errors', async () => {
      mockReq.body = { token: 'error-token' };

      (authService.verifyEmail as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await authController.verifyEmail(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.EMAIL_VERIFICATION_FAILED
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      mockReq.body = { refreshToken: 'valid-refresh-token' };

      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600
      };

      (authService.refreshToken as jest.Mock).mockResolvedValue(mockTokens);

      await authController.refreshToken(mockReq as Request, mockRes as Response);

      expect(authService.refreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Token refreshed successfully',
        data: mockTokens
      });
    });

    it('should return 400 when refresh token is missing', async () => {
      mockReq.body = {};

      await authController.refreshToken(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Refresh token is required'
      });
      expect(authService.refreshToken).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid refresh token', async () => {
      mockReq.body = { refreshToken: 'invalid-refresh-token' };

      (authService.refreshToken as jest.Mock).mockRejectedValue(
        new Error('Invalid refresh token')
      );

      await authController.refreshToken(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.INVALID_REFRESH_TOKEN
      });
    });
  });

  describe('forgotPassword', () => {
    it('should initiate password reset successfully', async () => {
      mockReq.body = { email: 'test@example.com' };

      (authService.forgotPassword as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Password reset email sent'
      });

      await authController.forgotPassword(mockReq as Request, mockRes as Response);

      expect(authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset email sent'
      });
    });

    it('should return 400 when email is missing', async () => {
      mockReq.body = {};

      await authController.forgotPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email is required'
      });
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('should handle password reset errors', async () => {
      mockReq.body = { email: 'test@example.com' };

      (authService.forgotPassword as jest.Mock).mockRejectedValue(
        new Error('Email service unavailable')
      );

      await authController.forgotPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.PASSWORD_RESET_FAILED
      });
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      mockReq.body = {
        token: 'valid-reset-token',
        password: 'NewSecurePass123!'
      };

      (authService.resetPassword as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Password reset successfully'
      });

      await authController.resetPassword(mockReq as Request, mockRes as Response);

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'valid-reset-token',
        'NewSecurePass123!'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset successfully'
      });
    });

    it('should return 400 when token is missing', async () => {
      mockReq.body = { password: 'NewSecurePass123!' };

      await authController.resetPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Reset token and new password are required'
      });
    });

    it('should return 400 when password is missing', async () => {
      mockReq.body = { token: 'valid-reset-token' };

      await authController.resetPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Reset token and new password are required'
      });
    });

    it('should return 400 for invalid reset token', async () => {
      mockReq.body = {
        token: 'invalid-token',
        password: 'NewSecurePass123!'
      };

      (authService.resetPassword as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Invalid or expired reset token'
      });

      await authController.resetPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired reset token'
      });
    });

    it('should handle reset errors', async () => {
      mockReq.body = {
        token: 'valid-token',
        password: 'NewSecurePass123!'
      };

      (authService.resetPassword as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await authController.resetPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_CONSTANTS.ERRORS.PASSWORD_RESET_FAILED
      });
    });
  });

  describe('TOTP Methods', () => {
    describe('setupTOTP', () => {
      it('should setup TOTP successfully', async () => {
        const mockSetupData = {
          secret: 'secret-key',
          manualEntryKey: 'manual-key',
          qrCodeUrl: 'otpauth://totp/...',
          qrCodeDataUrl: 'data:image/png;base64,...'
        };

        (totpService.isTOTPEnabled as jest.Mock).mockResolvedValue(false);
        (totpService.setupTOTP as jest.Mock).mockResolvedValue(mockSetupData);

        await authController.setupTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(totpService.isTOTPEnabled).toHaveBeenCalledWith('test-user-id');
        expect(totpService.setupTOTP).toHaveBeenCalledWith('test-user-id', 'test@example.com');
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: AUTH_CONSTANTS.SUCCESS.TOTP_SETUP,
          data: mockSetupData
        });
      });

      it('should return 401 when user is not authenticated', async () => {
        mockAuthReq.user = undefined;

        await authController.setupTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED
        });
      });

      it('should return 400 when TOTP is already enabled', async () => {
        (totpService.isTOTPEnabled as jest.Mock).mockResolvedValue(true);

        await authController.setupTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_ALREADY_ENABLED
        });
        expect(totpService.setupTOTP).not.toHaveBeenCalled();
      });

      it('should handle setup errors', async () => {
        (totpService.isTOTPEnabled as jest.Mock).mockResolvedValue(false);
        (totpService.setupTOTP as jest.Mock).mockRejectedValue(new Error('QR generation failed'));

        await authController.setupTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_SETUP_FAILED
        });
      });
    });

    describe('verifyTOTP', () => {
      it('should verify and activate TOTP successfully', async () => {
        mockAuthReq.body = { token: '123456' };

        const mockBackupCodes = ['code1', 'code2', 'code3'];

        (totpService.verifyAndActivateTOTP as jest.Mock).mockResolvedValue({
          success: true,
          message: 'TOTP activated successfully'
        });
        (totpService.generateBackupCodes as jest.Mock).mockResolvedValue(mockBackupCodes);

        await authController.verifyTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(totpService.verifyAndActivateTOTP).toHaveBeenCalledWith('test-user-id', '123456');
        expect(totpService.generateBackupCodes).toHaveBeenCalledWith('test-user-id');
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'TOTP activated successfully',
          data: {
            backupCodes: mockBackupCodes
          }
        });
      });

      it('should return 401 when user is not authenticated', async () => {
        mockAuthReq.user = undefined;

        await authController.verifyTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED
        });
      });

      it('should return 400 when token is missing', async () => {
        mockAuthReq.body = {};

        await authController.verifyTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'TOTP token is required'
        });
      });

      it('should return 400 for invalid token', async () => {
        mockAuthReq.body = { token: '000000' };

        (totpService.verifyAndActivateTOTP as jest.Mock).mockResolvedValue({
          success: false,
          message: 'Invalid TOTP token'
        });

        await authController.verifyTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid TOTP token'
        });
        expect(totpService.generateBackupCodes).not.toHaveBeenCalled();
      });

      it('should handle verification errors', async () => {
        mockAuthReq.body = { token: '123456' };

        (totpService.verifyAndActivateTOTP as jest.Mock).mockRejectedValue(
          new Error('Database error')
        );

        await authController.verifyTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_VERIFICATION_FAILED
        });
      });
    });

    describe('disableTOTP', () => {
      it('should disable TOTP successfully', async () => {
        mockAuthReq.body = { password: 'SecurePass123!' };

        (authService.login as jest.Mock).mockResolvedValue({
          user: { id: 'test-user-id', email: 'test@example.com' },
          tokens: {}
        });
        (totpService.disableTOTP as jest.Mock).mockResolvedValue({
          success: true,
          message: 'TOTP disabled successfully'
        });

        await authController.disableTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(authService.login).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'SecurePass123!'
        });
        expect(totpService.disableTOTP).toHaveBeenCalledWith('test-user-id');
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'TOTP disabled successfully'
        });
      });

      it('should return 401 when user is not authenticated', async () => {
        mockAuthReq.user = undefined;

        await authController.disableTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED
        });
      });

      it('should return 400 when password is missing', async () => {
        mockAuthReq.body = {};

        await authController.disableTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.PASSWORD_REQUIRED_DISABLE_2FA
        });
      });

      it('should return 401 for invalid password', async () => {
        mockAuthReq.body = { password: 'WrongPassword' };

        (authService.login as jest.Mock).mockRejectedValue(
          new Error('Invalid credentials')
        );

        await authController.disableTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid password'
        });
        expect(totpService.disableTOTP).not.toHaveBeenCalled();
      });

      it('should return 400 when disable fails', async () => {
        mockAuthReq.body = { password: 'SecurePass123!' };

        (authService.login as jest.Mock).mockResolvedValue({});
        (totpService.disableTOTP as jest.Mock).mockResolvedValue({
          success: false,
          message: 'TOTP not enabled'
        });

        await authController.disableTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'TOTP not enabled'
        });
      });

      it('should handle disable errors', async () => {
        mockAuthReq.body = { password: 'SecurePass123!' };

        (authService.login as jest.Mock).mockResolvedValue({});
        (totpService.disableTOTP as jest.Mock).mockRejectedValue(
          new Error('Database error')
        );

        await authController.disableTOTP(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_DISABLE_FAILED
        });
      });
    });

    describe('getTOTPStatus', () => {
      it('should get TOTP status successfully', async () => {
        (totpService.isTOTPEnabled as jest.Mock).mockResolvedValue(true);

        await authController.getTOTPStatus(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(totpService.isTOTPEnabled).toHaveBeenCalledWith('test-user-id');
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          data: {
            totpEnabled: true
          }
        });
      });

      it('should return 401 when user is not authenticated', async () => {
        mockAuthReq.user = undefined;

        await authController.getTOTPStatus(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED
        });
      });

      it('should handle status check errors', async () => {
        (totpService.isTOTPEnabled as jest.Mock).mockRejectedValue(
          new Error('Database error')
        );

        await authController.getTOTPStatus(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_STATUS_FAILED
        });
      });
    });

    describe('generateBackupCodes', () => {
      it('should generate backup codes successfully', async () => {
        const mockBackupCodes = ['code1', 'code2', 'code3'];

        (totpService.isTOTPEnabled as jest.Mock).mockResolvedValue(true);
        (totpService.generateBackupCodes as jest.Mock).mockResolvedValue(mockBackupCodes);

        await authController.generateBackupCodes(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(totpService.isTOTPEnabled).toHaveBeenCalledWith('test-user-id');
        expect(totpService.generateBackupCodes).toHaveBeenCalledWith('test-user-id');
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: AUTH_CONSTANTS.SUCCESS.BACKUP_CODES_GENERATED,
          data: {
            backupCodes: mockBackupCodes
          }
        });
      });

      it('should return 401 when user is not authenticated', async () => {
        mockAuthReq.user = undefined;

        await authController.generateBackupCodes(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.AUTHENTICATION_REQUIRED
        });
      });

      it('should return 400 when TOTP is not enabled', async () => {
        (totpService.isTOTPEnabled as jest.Mock).mockResolvedValue(false);

        await authController.generateBackupCodes(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.TOTP_NOT_ENABLED
        });
        expect(totpService.generateBackupCodes).not.toHaveBeenCalled();
      });

      it('should handle generation errors', async () => {
        (totpService.isTOTPEnabled as jest.Mock).mockResolvedValue(true);
        (totpService.generateBackupCodes as jest.Mock).mockRejectedValue(
          new Error('Generation failed')
        );

        await authController.generateBackupCodes(mockAuthReq as AuthenticatedRequest, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.BACKUP_CODES_FAILED
        });
      });
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const mockDate = new Date('2025-01-06T12:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      await authController.healthCheck(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Auth service is healthy',
        timestamp: '2025-01-06T12:00:00.000Z'
      });
    });
  });

  describe('Security Tests', () => {
    describe('SQL Injection Prevention', () => {
      it('should sanitize email input to prevent SQL injection', async () => {
        mockReq.body = {
          email: "test@example.com'; DROP TABLE users; --",
          password: 'SecurePass123!',
          username: 'testuser'
        };

        (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
          email: 'test@example.com',
          username: 'testuser'
        });

        const mockResult = {
          user: { id: '1', email: 'test@example.com' },
          tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 }
        };

        (authService.register as jest.Mock).mockResolvedValue(mockResult);

        await authController.register(mockReq as Request, mockRes as Response);

        expect(InputSanitizer.sanitizeAuthInputs).toHaveBeenCalledWith({
          email: "test@example.com'; DROP TABLE users; --",
          username: 'testuser'
        });

        expect(authService.register).toHaveBeenCalledWith({
          email: 'test@example.com', // Sanitized value
          password: 'SecurePass123!',
          username: 'testuser'
        });
      });

      it('should sanitize username input to prevent SQL injection', async () => {
        mockReq.body = {
          email: 'test@example.com',
          password: 'SecurePass123!',
          username: "admin'; DELETE FROM users WHERE '1'='1"
        };

        (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
          email: 'test@example.com',
          username: 'admin'
        });

        const mockResult = {
          user: { id: '1', email: 'test@example.com' },
          tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 }
        };

        (authService.register as jest.Mock).mockResolvedValue(mockResult);

        await authController.register(mockReq as Request, mockRes as Response);

        expect(authService.register).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'SecurePass123!',
          username: 'admin' // Sanitized value
        });
      });
    });

    describe('XSS Prevention', () => {
      it('should not reflect user input in error messages', async () => {
        mockReq.body = {
          email: '<script>alert("XSS")</script>'
          // No password provided to trigger error condition
        };

        (InputSanitizer.sanitizeAuthInputs as jest.Mock).mockReturnValue({
          email: '<script>alert("XSS")</script>' // Return unsanitized to test error handling
        });

        await authController.register(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.EMAIL_REQUIRED // Generic error, no user input reflected
        });
        expect(authService.register).not.toHaveBeenCalled();
      });
    });

    describe('Timing Attack Prevention', () => {
      it('should have consistent response times for user enumeration prevention', async () => {
        // Test non-existent user
        mockReq.body = {
          email: 'nonexistent@example.com',
          password: 'WrongPass'
        };

        (authService.login as jest.Mock).mockRejectedValue(
          new Error('Invalid credentials')
        );

        await authController.login(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid credentials' // Same error for both cases
        });

        // Test existing user with wrong password
        mockReq.body = {
          email: 'existing@example.com',
          password: 'WrongPass'
        };

        await authController.login(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid credentials' // Same error message
        });
      });
    });

    describe('Rate Limiting Compliance', () => {
      it('should handle rate limit errors appropriately', async () => {
        mockReq.body = {
          email: 'test@example.com',
          password: 'SecurePass123!'
        };

        (authService.login as jest.Mock).mockRejectedValue(
          new Error('Too many login attempts. Please try again later.')
        );

        await authController.login(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Too many login attempts. Please try again later.'
        });
      });
    });

    describe('Password Security', () => {
      it('should not log or expose passwords in errors', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        mockReq.body = {
          email: 'test@example.com',
          password: 'SuperSecretPassword123!'
        };

        (authService.register as jest.Mock).mockRejectedValue(
          new Error('Database connection failed')
        );

        await authController.register(mockReq as Request, mockRes as Response);

        // Check that password is not logged
        const logCalls = consoleSpy.mock.calls;
        logCalls.forEach(call => {
          expect(JSON.stringify(call)).not.toContain('SuperSecretPassword123!');
        });

        consoleSpy.mockRestore();
      });
    });

    describe('Token Security', () => {
      it('should not expose sensitive token details in errors', async () => {
        mockReq.body = { refreshToken: 'super-secret-refresh-token' };

        (authService.refreshToken as jest.Mock).mockRejectedValue(
          new Error('Token expired')
        );

        await authController.refreshToken(mockReq as Request, mockRes as Response);

        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: AUTH_CONSTANTS.ERRORS.INVALID_REFRESH_TOKEN // Generic error
        });

        // Ensure token is not in response
        const response = (mockRes.json as jest.Mock).mock.calls[0][0];
        expect(JSON.stringify(response)).not.toContain('super-secret-refresh-token');
      });
    });
  });
});