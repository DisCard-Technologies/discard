/**
 * Authentication constants for centralized configuration
 */

export const AUTH_CONSTANTS = {
  // Password requirements
  PASSWORD: {
    MIN_LENGTH: 8,
    PATTERNS: {
      UPPERCASE: /[A-Z]/,
      LOWERCASE: /[a-z]/,
      NUMBERS: /\d/,
      SPECIAL_CHARS: /[!@#$%^&*(),.?":{}|<>]/,
    },
    BCRYPT_ROUNDS: 12,
  },

  // JWT configuration
  JWT: {
    ACCESS_TOKEN_EXPIRY: '1h',
    REFRESH_TOKEN_EXPIRY: '7d',
    ACCESS_TOKEN_EXPIRY_SECONDS: 3600, // 1 hour
  },

  // Token types
  TOKEN_TYPES: {
    ACCESS: 'access',
    REFRESH: 'refresh',
    EMAIL_VERIFICATION: 'email_verification',
    PASSWORD_RESET: 'password_reset',
  },

  // Security settings
  SECURITY: {
    MAX_FAILED_ATTEMPTS: 5,
    ACCOUNT_LOCK_DURATION_MS: 15 * 60 * 1000, // 15 minutes
    EMAIL_VERIFICATION_EXPIRY: '24h',
    PASSWORD_RESET_EXPIRY: '1h',
  },

  // TOTP settings
  TOTP: {
    SECRET_LENGTH: 32,
    ISSUER: 'DisCard',
    WINDOW: 2, // Allow some time drift
    BACKUP_CODES_COUNT: 8,
    BACKUP_CODE_LENGTH: 8,
  },

  // Privacy defaults
  PRIVACY: {
    DEFAULT_DATA_RETENTION_DAYS: 365,
    DEFAULT_ANALYTICS_OPT_OUT: false,
  },

  // Rate limiting
  RATE_LIMITING: {
    AUTH_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    AUTH_MAX_REQUESTS: 5,
    GENERAL_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    GENERAL_MAX_REQUESTS: 100,
  },

  // Error messages
  ERRORS: {
    EMAIL_REQUIRED: 'Email and password are required',
    INVALID_EMAIL: 'Invalid email format',
    USER_EXISTS: 'User with this email already exists',
    USER_CREATION_FAILED: 'Failed to create user',
    INVALID_CREDENTIALS: 'Invalid credentials',
    ACCOUNT_LOCKED: 'Account is temporarily locked due to multiple failed login attempts',
    TOKEN_REQUIRED: 'Verification token is required',
    INVALID_TOKEN: 'Invalid or expired verification token',
    EMAIL_VERIFICATION_FAILED: 'Email verification failed',
    REFRESH_TOKEN_REQUIRED: 'Refresh token is required',
    INVALID_REFRESH_TOKEN: 'Invalid refresh token',
    PASSWORD_RESET_FAILED: 'Password reset failed',
    TOTP_SETUP_FAILED: 'Failed to setup 2FA',
    TOTP_VERIFICATION_FAILED: 'Failed to verify 2FA',
    TOTP_DISABLE_FAILED: 'Failed to disable 2FA',
    TOTP_STATUS_FAILED: 'Failed to get 2FA status',
    BACKUP_CODES_FAILED: 'Failed to generate backup codes',
    TOTP_ALREADY_ENABLED: '2FA is already enabled for this account',
    TOTP_NOT_ENABLED: '2FA must be enabled to generate backup codes',
    INVALID_2FA_CODE: 'Invalid 2FA code',
    PASSWORD_REQUIRED_DISABLE_2FA: 'Current password is required to disable 2FA',
    AUTHENTICATION_REQUIRED: 'Authentication required',
  },

  // Success messages
  SUCCESS: {
    REGISTRATION: 'User registered successfully. Please check your email to verify your account.',
    LOGIN: 'Login successful',
    EMAIL_VERIFIED: 'Email verified successfully',
    TOKEN_REFRESHED: 'Token refreshed successfully',
    PASSWORD_RESET_REQUESTED: 'If an account with this email exists, a password reset link has been sent',
    PASSWORD_RESET: 'Password reset successfully',
    TOTP_SETUP: 'TOTP setup initiated. Scan the QR code with your authenticator app.',
    TOTP_ACTIVATED: '2FA has been successfully activated.',
    TOTP_DISABLED: '2FA has been successfully disabled.',
    BACKUP_CODES_GENERATED: 'New backup codes generated successfully',
  },
} as const;

export type AuthConstants = typeof AUTH_CONSTANTS;