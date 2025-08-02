import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../../app';
import { totpService } from './totp.service';

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
  private readonly jwtExpiryTime = '1h';
  private readonly jwtRefreshExpiryTime = '7d';

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || '';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';
    
    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error('JWT secrets are not configured');
    }
  }

  /**
   * Validates password complexity requirements
   */
  private validatePassword(password: string): { valid: boolean; message?: string } {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    
    if (!hasUpperCase) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    
    if (!hasLowerCase) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    
    if (!hasNumbers) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    
    if (!hasSpecialChar) {
      return { valid: false, message: 'Password must contain at least one special character' };
    }

    return { valid: true };
  }

  /**
   * Validates email format
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
      expiresIn: 3600 // 1 hour in seconds
    };
  }

  /**
   * Creates email verification token
   */
  private async createEmailVerificationToken(userId: string): Promise<string> {
    const token = jwt.sign(
      { user_id: userId, type: 'email_verification' },
      this.jwtSecret,
      { expiresIn: '24h' }
    );

    // Store verification token in database
    await supabase
      .from('user_verification_tokens')
      .insert([{
        user_id: userId,
        token,
        type: 'email_verification',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }]);

    return token;
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<{ user: UserData; tokens: AuthTokens; verificationToken: string }> {
    const { email, password, username } = data;

    // Validate input
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    if (!this.validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message || 'Invalid password');
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with privacy settings
    const { data: user, error } = await supabase
      .from('users')
      .insert([{
        email,
        password_hash: hashedPassword,
        username: username || null,
        email_verified: false,
        privacy_settings: {
          dataRetention: 365, // Default 1 year
          analyticsOptOut: false
        },
        last_active: new Date().toISOString()
      }])
      .select('id, email, username, email_verified, created_at, last_active, privacy_settings')
      .single();

    if (error) {
      console.error('User creation error:', error);
      throw new Error('Failed to create user');
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

    // Validate input
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    if (!this.validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash, username, email_verified, created_at, last_active, privacy_settings, failed_login_attempts, locked_until, totp_enabled')
      .eq('email', email)
      .single();

    if (error || !user) {
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new Error('Account is temporarily locked due to multiple failed login attempts');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null; // Lock for 15 minutes after 5 failed attempts

      await supabase
        .from('users')
        .update({
          failed_login_attempts: failedAttempts,
          locked_until: lockUntil?.toISOString()
        })
        .eq('id', user.id);

      throw new Error('Invalid credentials');
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
        const lockUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

        await supabase
          .from('users')
          .update({
            failed_login_attempts: failedAttempts,
            locked_until: lockUntil?.toISOString()
          })
          .eq('id', user.id);

        throw new Error('Invalid 2FA code');
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
      
      if (decoded.type !== 'email_verification') {
        throw new Error('Invalid token type');
      }

      // Check if token exists in database and is not expired
      const { data: tokenRecord, error: tokenError } = await supabase
        .from('user_verification_tokens')
        .select('user_id, expires_at')
        .eq('token', token)
        .eq('type', 'email_verification')
        .single();

      if (tokenError || !tokenRecord) {
        throw new Error('Invalid or expired verification token');
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        throw new Error('Verification token has expired');
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

      return { success: true, message: 'Email verified successfully' };
    } catch (error) {
      return { success: false, message: 'Invalid or expired verification token' };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;
      
      if (decoded.type !== 'refresh') {
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
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Generate password reset token
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    if (!this.validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (error || !user) {
      // Don't reveal if user exists for security
      return { success: true, message: 'If an account with this email exists, a password reset link has been sent' };
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { user_id: user.id, type: 'password_reset' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    // Store reset token in database
    await supabase
      .from('user_verification_tokens')
      .insert([{
        user_id: user.id,
        token: resetToken,
        type: 'password_reset',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
      }]);

    // TODO: Send email with reset token (implement email service)
    
    return { success: true, message: 'If an account with this email exists, a password reset link has been sent' };
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
      
      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }

      // Check if token exists in database and is not expired
      const { data: tokenRecord, error: tokenError } = await supabase
        .from('user_verification_tokens')
        .select('user_id, expires_at')
        .eq('token', token)
        .eq('type', 'password_reset')
        .single();

      if (tokenError || !tokenRecord) {
        throw new Error('Invalid or expired reset token');
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        throw new Error('Reset token has expired');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

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

      return { success: true, message: 'Password reset successfully' };
    } catch (error) {
      return { success: false, message: 'Invalid or expired reset token' };
    }
  }
}

export const authService = new AuthService();