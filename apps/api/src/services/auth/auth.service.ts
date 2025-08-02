import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../../app';
import { totpService } from './totp.service';
import { AUTH_CONSTANTS } from '../../constants/auth.constants';
import { InputValidator, InputSanitizer } from '../../utils/validators';

export interface RegisterData {
  email: string;
  password: string;
  username?: string;
}

export interface LoginData {
  email: string;
  password: string;
  totpToken?: string;
  backupCode?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserData {
  id: string;
  email: string;
  username?: string;
  emailVerified: boolean;
  createdAt: string;
  lastActive: string;
  privacySettings: {
    dataRetention: number;
    analyticsOptOut: boolean;
  };
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtExpiryTime = AUTH_CONSTANTS.JWT.ACCESS_TOKEN_EXPIRY;
  private readonly jwtRefreshExpiryTime = AUTH_CONSTANTS.JWT.REFRESH_TOKEN_EXPIRY;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || '';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';
    
    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error('JWT secrets are not configured');
    }
  }

  /**
   * Validates password complexity requirements
   * @deprecated Use InputValidator.validatePassword instead
   */
  private validatePassword(password: string): { valid: boolean; message?: string } {
    return InputValidator.validatePassword(password);
  }

  /**
   * Validates email format
   * @deprecated Use InputValidator.validateEmail instead
   */
  private validateEmail(email: string): boolean {
    const result = InputValidator.validateEmail(email);
    return result.valid;
  }

  /**
   * Generates JWT tokens for authentication
   */
  private generateTokens(userId: string, email: string): AuthTokens {
    const accessToken = jwt.sign(
      { user_id: userId, email, type: 'access' },
      this.jwtSecret,
      { expiresIn: this.jwtExpiryTime }
    );

    const refreshToken = jwt.sign(
      { user_id: userId, email, type: 'refresh' },
      this.jwtRefreshSecret,
      { expiresIn: this.jwtRefreshExpiryTime }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: AUTH_CONSTANTS.JWT.ACCESS_TOKEN_EXPIRY_SECONDS
    };
  }

  /**
   * Creates email verification token
   */
  private async createEmailVerificationToken(userId: string): Promise<string> {
    const token = jwt.sign(
      { user_id: userId, type: AUTH_CONSTANTS.TOKEN_TYPES.EMAIL_VERIFICATION },
      this.jwtSecret,
      { expiresIn: AUTH_CONSTANTS.SECURITY.EMAIL_VERIFICATION_EXPIRY }
    );

    // Store verification token in database
    await supabase
      .from('user_verification_tokens')
      .insert([{
        user_id: userId,
        token,
        type: AUTH_CONSTANTS.TOKEN_TYPES.EMAIL_VERIFICATION,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }]);

    return token;
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<{ user: UserData; tokens: AuthTokens; verificationToken: string }> {
    const { email, password, username } = data;

    // Sanitize inputs
    const sanitized = InputSanitizer.sanitizeAuthInputs({ email, username });
    const cleanEmail = sanitized.email || email;
    const cleanUsername = sanitized.username || username;

    // Validate input
    const validation = InputValidator.validateRegistrationInput(cleanEmail, password, cleanUsername);
    if (!validation.valid) {
      throw new Error(validation.message || 'Invalid input');
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .single();

    if (existingUser) {
      throw new Error(AUTH_CONSTANTS.ERRORS.USER_EXISTS);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, AUTH_CONSTANTS.PASSWORD.BCRYPT_ROUNDS);

    // Create user with privacy settings
    const { data: user, error } = await supabase
      .from('users')
      .insert([{
        email: cleanEmail,
        password_hash: hashedPassword,
        username: cleanUsername || null,
        email_verified: false,
        privacy_settings: {
          dataRetention: AUTH_CONSTANTS.PRIVACY.DEFAULT_DATA_RETENTION_DAYS,
          analyticsOptOut: AUTH_CONSTANTS.PRIVACY.DEFAULT_ANALYTICS_OPT_OUT
        },
        last_active: new Date().toISOString()
      }])
      .select('id, email, username, email_verified, created_at, last_active, privacy_settings')
      .single();

    if (error) {
      console.error('User creation error:', error);
      throw new Error(AUTH_CONSTANTS.ERRORS.USER_CREATION_FAILED);
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    // Create email verification token
    const verificationToken = await this.createEmailVerificationToken(user.id);

    const userData: UserData = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.email_verified,
      createdAt: user.created_at,
      lastActive: user.last_active,
      privacySettings: user.privacy_settings
    };

    return { user: userData, tokens, verificationToken };
  }

  /**
   * Login user with email and password (and optional 2FA)
   */
  async login(data: LoginData): Promise<{ user: UserData; tokens: AuthTokens; requires2FA?: boolean }> {
    const { email, password, totpToken, backupCode } = data;

    // Sanitize inputs
    const sanitized = InputSanitizer.sanitizeAuthInputs({ email });
    const cleanEmail = sanitized.email || email;

    // Validate input
    const validation = InputValidator.validateLoginInput(cleanEmail, password, totpToken, backupCode);
    if (!validation.valid) {
      throw new Error(validation.message || 'Invalid input');
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash, username, email_verified, created_at, last_active, privacy_settings, failed_login_attempts, locked_until, totp_enabled')
      .eq('email', cleanEmail)
      .single();

    if (error || !user) {
      throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_CREDENTIALS);
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new Error(AUTH_CONSTANTS.ERRORS.ACCOUNT_LOCKED);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = failedAttempts >= AUTH_CONSTANTS.SECURITY.MAX_FAILED_ATTEMPTS 
        ? new Date(Date.now() + AUTH_CONSTANTS.SECURITY.ACCOUNT_LOCK_DURATION_MS) 
        : null;

      await supabase
        .from('users')
        .update({
          failed_login_attempts: failedAttempts,
          locked_until: lockUntil?.toISOString()
        })
        .eq('id', user.id);

      throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_CREDENTIALS);
    }

    // Check if 2FA is enabled
    if (user.totp_enabled) {
      // Require 2FA verification
      if (!totpToken && !backupCode) {
        // Return special response indicating 2FA is required
        const userData: UserData = {
          id: user.id,
          email: user.email,
          username: user.username,
          emailVerified: user.email_verified,
          createdAt: user.created_at,
          lastActive: user.last_active,
          privacySettings: user.privacy_settings
        };

        return { 
          user: userData, 
          tokens: { accessToken: '', refreshToken: '', expiresIn: 0 }, 
          requires2FA: true 
        };
      }

      // Verify 2FA token or backup code
      let totpValid = false;
      if (totpToken) {
        totpValid = await totpService.verifyTOTP(user.id, totpToken);
      } else if (backupCode) {
        totpValid = await totpService.verifyBackupCode(user.id, backupCode);
      }

      if (!totpValid) {
        // Increment failed login attempts for invalid 2FA
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        const lockUntil = failedAttempts >= AUTH_CONSTANTS.SECURITY.MAX_FAILED_ATTEMPTS 
          ? new Date(Date.now() + AUTH_CONSTANTS.SECURITY.ACCOUNT_LOCK_DURATION_MS) 
          : null;

        await supabase
          .from('users')
          .update({
            failed_login_attempts: failedAttempts,
            locked_until: lockUntil?.toISOString()
          })
          .eq('id', user.id);

        throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_2FA_CODE);
      }
    }

    // Reset failed login attempts and update last active
    await supabase
      .from('users')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_active: new Date().toISOString()
      })
      .eq('id', user.id);

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    const userData: UserData = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.email_verified,
      createdAt: user.created_at,
      lastActive: new Date().toISOString(),
      privacySettings: user.privacy_settings
    };

    return { user: userData, tokens };
  }

  /**
   * Verify email with verification token
   */
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    try {
      // Verify token
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      if (decoded.type !== AUTH_CONSTANTS.TOKEN_TYPES.EMAIL_VERIFICATION) {
        throw new Error('Invalid token type');
      }

      // Check if token exists in database and is not expired
      const { data: tokenRecord, error: tokenError } = await supabase
        .from('user_verification_tokens')
        .select('user_id, expires_at')
        .eq('token', token)
        .eq('type', AUTH_CONSTANTS.TOKEN_TYPES.EMAIL_VERIFICATION)
        .single();

      if (tokenError || !tokenRecord) {
        throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_TOKEN);
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_TOKEN);
      }

      // Update user email verification status
      const { error: updateError } = await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('id', tokenRecord.user_id);

      if (updateError) {
        throw new Error('Failed to verify email');
      }

      // Delete used token
      await supabase
        .from('user_verification_tokens')
        .delete()
        .eq('token', token);

      return { success: true, message: AUTH_CONSTANTS.SUCCESS.EMAIL_VERIFIED };
    } catch (error) {
      return { success: false, message: AUTH_CONSTANTS.ERRORS.INVALID_TOKEN };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;
      
      if (decoded.type !== AUTH_CONSTANTS.TOKEN_TYPES.REFRESH) {
        throw new Error('Invalid token type');
      }

      // Verify user still exists
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', decoded.user_id)
        .single();

      if (error || !user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      return this.generateTokens(user.id, user.email);
    } catch (error) {
      throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_REFRESH_TOKEN);
    }
  }

  /**
   * Generate password reset token
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    // Sanitize email
    const cleanEmail = InputSanitizer.sanitizeEmail(email);
    
    const emailValidation = InputValidator.validateEmail(cleanEmail);
    if (!emailValidation.valid) {
      throw new Error(emailValidation.message || AUTH_CONSTANTS.ERRORS.INVALID_EMAIL);
    }

    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .single();

    if (error || !user) {
      // Don't reveal if user exists for security
      return { success: true, message: AUTH_CONSTANTS.SUCCESS.PASSWORD_RESET_REQUESTED };
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { user_id: user.id, type: AUTH_CONSTANTS.TOKEN_TYPES.PASSWORD_RESET },
      this.jwtSecret,
      { expiresIn: AUTH_CONSTANTS.SECURITY.PASSWORD_RESET_EXPIRY }
    );

    // Store reset token in database
    await supabase
      .from('user_verification_tokens')
      .insert([{
        user_id: user.id,
        token: resetToken,
        type: AUTH_CONSTANTS.TOKEN_TYPES.PASSWORD_RESET,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
      }]);

    // TODO: Send email with reset token (implement email service)
    
    return { success: true, message: AUTH_CONSTANTS.SUCCESS.PASSWORD_RESET_REQUESTED };
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate new password
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        throw new Error(passwordValidation.message || 'Invalid password');
      }

      // Verify token
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      if (decoded.type !== AUTH_CONSTANTS.TOKEN_TYPES.PASSWORD_RESET) {
        throw new Error('Invalid token type');
      }

      // Check if token exists in database and is not expired
      const { data: tokenRecord, error: tokenError } = await supabase
        .from('user_verification_tokens')
        .select('user_id, expires_at')
        .eq('token', token)
        .eq('type', AUTH_CONSTANTS.TOKEN_TYPES.PASSWORD_RESET)
        .single();

      if (tokenError || !tokenRecord) {
        throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_TOKEN);
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        throw new Error(AUTH_CONSTANTS.ERRORS.INVALID_TOKEN);
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, AUTH_CONSTANTS.PASSWORD.BCRYPT_ROUNDS);

      // Update user password
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          password_hash: hashedPassword,
          failed_login_attempts: 0,
          locked_until: null
        })
        .eq('id', tokenRecord.user_id);

      if (updateError) {
        throw new Error('Failed to reset password');
      }

      // Delete used token
      await supabase
        .from('user_verification_tokens')
        .delete()
        .eq('token', token);

      return { success: true, message: AUTH_CONSTANTS.SUCCESS.PASSWORD_RESET };
    } catch (error) {
      return { success: false, message: AUTH_CONSTANTS.ERRORS.INVALID_TOKEN };
    }
  }
}

export const authService = new AuthService();