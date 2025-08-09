import { AUTH_CONSTANTS } from '../constants/auth.constants';

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface SanitizedInput {
  email?: string;
  password?: string;
  username?: string;
  token?: string;
}

/**
 * Input sanitization utilities
 */
export class InputSanitizer {
  /**
   * Sanitize email input - trim whitespace and convert to lowercase
   */
  static sanitizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Sanitize username input - trim whitespace and remove special chars
   */
  static sanitizeUsername(username: string): string {
    return username.trim().replace(/[<>\"']/g, '');
  }

  /**
   * Sanitize token input - trim whitespace only
   */
  static sanitizeToken(token: string): string {
    return token.trim();
  }

  /**
   * Sanitize all authentication inputs
   */
  static sanitizeAuthInputs(inputs: Record<string, any>): SanitizedInput {
    const sanitized: SanitizedInput = {};

    if (inputs.email && typeof inputs.email === 'string') {
      sanitized.email = this.sanitizeEmail(inputs.email);
    }

    if (inputs.password && typeof inputs.password === 'string') {
      sanitized.password = inputs.password; // Don't modify passwords
    }

    if (inputs.username && typeof inputs.username === 'string') {
      sanitized.username = this.sanitizeUsername(inputs.username);
    }

    if (inputs.token && typeof inputs.token === 'string') {
      sanitized.token = this.sanitizeToken(inputs.token);
    }

    return sanitized;
  }
}

/**
 * Input validation utilities
 */
export class InputValidator {
  /**
   * Validates email format
   */
  static validateEmail(email: string): ValidationResult {
    if (!email) {
      return { valid: false, message: AUTH_CONSTANTS.ERRORS.EMAIL_REQUIRED };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, message: AUTH_CONSTANTS.ERRORS.INVALID_EMAIL };
    }

    return { valid: true };
  }

  /**
   * Validates password complexity requirements
   */
  static validatePassword(password: string): ValidationResult {
    if (!password) {
      return { valid: false, message: AUTH_CONSTANTS.ERRORS.EMAIL_REQUIRED };
    }

    const { MIN_LENGTH, PATTERNS } = AUTH_CONSTANTS.PASSWORD;

    if (password.length < MIN_LENGTH) {
      return { 
        valid: false, 
        message: `Password must be at least ${MIN_LENGTH} characters long` 
      };
    }
    
    if (!PATTERNS.UPPERCASE.test(password)) {
      return { 
        valid: false, 
        message: 'Password must contain at least one uppercase letter' 
      };
    }
    
    if (!PATTERNS.LOWERCASE.test(password)) {
      return { 
        valid: false, 
        message: 'Password must contain at least one lowercase letter' 
      };
    }
    
    if (!PATTERNS.NUMBERS.test(password)) {
      return { 
        valid: false, 
        message: 'Password must contain at least one number' 
      };
    }
    
    if (!PATTERNS.SPECIAL_CHARS.test(password)) {
      return { 
        valid: false, 
        message: 'Password must contain at least one special character' 
      };
    }

    return { valid: true };
  }

  /**
   * Validates username format (optional field)
   */
  static validateUsername(username: string): ValidationResult {
    if (!username) {
      return { valid: true }; // Username is optional
    }

    if (username.length < 3) {
      return { 
        valid: false, 
        message: 'Username must be at least 3 characters long' 
      };
    }

    if (username.length > 50) {
      return { 
        valid: false, 
        message: 'Username must be no more than 50 characters long' 
      };
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return { 
        valid: false, 
        message: 'Username can only contain letters, numbers, underscores, and hyphens' 
      };
    }

    return { valid: true };
  }

  /**
   * Validates TOTP token format
   */
  static validateTOTPToken(token: string): ValidationResult {
    if (!token) {
      return { valid: false, message: 'TOTP token is required' };
    }

    // TOTP tokens are typically 6 digits
    const totpRegex = /^\d{6}$/;
    if (!totpRegex.test(token)) {
      return { 
        valid: false, 
        message: 'TOTP token must be 6 digits' 
      };
    }

    return { valid: true };
  }

  /**
   * Validates backup code format
   */
  static validateBackupCode(code: string): ValidationResult {
    if (!code) {
      return { valid: false, message: 'Backup code is required' };
    }

    // Backup codes are typically 8 alphanumeric characters
    const backupCodeRegex = /^[A-Z0-9]{8}$/;
    if (!backupCodeRegex.test(code.toUpperCase())) {
      return { 
        valid: false, 
        message: 'Invalid backup code format' 
      };
    }

    return { valid: true };
  }

  /**
   * Validates JWT token format (basic structure check)
   */
  static validateJWTToken(token: string): ValidationResult {
    if (!token) {
      return { valid: false, message: 'Token is required' };
    }

    // JWT tokens have 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { 
        valid: false, 
        message: 'Invalid token format' 
      };
    }

    return { valid: true };
  }

  /**
   * Validates registration input
   */
  static validateRegistrationInput(
    email: string, 
    password: string, 
    username?: string
  ): ValidationResult {
    const emailValidation = this.validateEmail(email);
    if (!emailValidation.valid) {
      return emailValidation;
    }

    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      return passwordValidation;
    }

    if (username) {
      const usernameValidation = this.validateUsername(username);
      if (!usernameValidation.valid) {
        return usernameValidation;
      }
    }

    return { valid: true };
  }

  /**
   * Validates login input
   */
  static validateLoginInput(
    email: string, 
    password: string, 
    totpToken?: string, 
    backupCode?: string
  ): ValidationResult {
    const emailValidation = this.validateEmail(email);
    if (!emailValidation.valid) {
      return emailValidation;
    }

    if (!password) {
      return { valid: false, message: AUTH_CONSTANTS.ERRORS.EMAIL_REQUIRED };
    }

    if (totpToken) {
      const totpValidation = this.validateTOTPToken(totpToken);
      if (!totpValidation.valid) {
        return totpValidation;
      }
    }

    if (backupCode) {
      const backupValidation = this.validateBackupCode(backupCode);
      if (!backupValidation.valid) {
        return backupValidation;
      }
    }

    return { valid: true };
  }
}

/**
 * Pagination parameters validation
 */
export function validatePaginationParams(page: number, limit: number, maxLimit: number = 100) {
  const validPage = Math.max(1, Math.floor(page) || 1);
  const validLimit = Math.min(maxLimit, Math.max(1, Math.floor(limit) || 20));
  
  return {
    page: validPage,
    limit: validLimit
  };
}

/**
 * Date range validation
 */
export function validateDateRange(startDate?: string, endDate?: string, maxDays: number = 90) {
  const errors: string[] = [];
  
  if (!startDate && !endDate) {
    return { valid: true, errors: [] };
  }
  
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  
  if (start && isNaN(start.getTime())) {
    errors.push('Invalid start date format');
  }
  
  if (end && isNaN(end.getTime())) {
    errors.push('Invalid end date format');
  }
  
  if (start && end && start > end) {
    errors.push('Start date must be before end date');
  }
  
  if (start && end) {
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > maxDays) {
      errors.push(`Date range cannot exceed ${maxDays} days`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}