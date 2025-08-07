// Set environment variables for testing BEFORE importing modules
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test_anon_key';

import { authService } from '../services/auth/auth.service';
import { supabase } from '../app';
import { createMockSupabaseClient, mockScenarios, mockResponses } from './utils/supabase-mock';
import { testDataFactory, setupMocks } from './utils/test-helpers';

// Mock Supabase
jest.mock('../app', () => {
  const { createMockSupabaseClient } = require('./utils/supabase-mock');
  return {
    supabase: createMockSupabaseClient()
  };
});

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed_password')),
  compare: jest.fn(() => Promise.resolve(true))
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock_jwt_token'),
  verify: jest.fn(() => ({ user_id: 'test-user-id', type: 'email_verification' }))
}));



describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user with valid data', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        username: 'testuser',
        email_verified: false,
        created_at: '2023-01-01T00:00:00Z',
        last_active: '2023-01-01T00:00:00Z',
        privacy_settings: { dataRetention: 365, analyticsOptOut: false }
      };

      // Mock Supabase responses
      const mockSupabaseClient = supabase as jest.Mocked<typeof supabase>;
      
      // Set up complete mock behavior for this test
      mockSupabaseClient.from.mockImplementation((tableName: string) => {
        if (tableName === 'users') {
          const userQuery = createMockSupabaseClient().from(tableName);
          
          // First call - check user existence (return null)
          userQuery.single.mockResolvedValueOnce({ data: null, error: null });
          
          // Second call - user insertion (return new user) 
          userQuery.single.mockResolvedValueOnce({ data: mockUser, error: null });
          
          return userQuery;
        }
        return createMockSupabaseClient().from(tableName);
      });

      const result = await authService.register({
        email: 'test@example.com',
        password: 'TestPassword123!',
        username: 'testuser'
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('verificationToken');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
    });

    it('should throw error for invalid email format', async () => {
      await expect(authService.register({
        email: 'invalid-email',
        password: 'TestPassword123!',
        username: 'testuser'
      })).rejects.toThrow('Invalid email format');
    });

    it('should throw error for weak password', async () => {
      await expect(authService.register({
        email: 'test@example.com',
        password: 'weak',
        username: 'testuser'
      })).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should throw error for password without uppercase', async () => {
      await expect(authService.register({
        email: 'test@example.com',
        password: 'password123!',
        username: 'testuser'
      })).rejects.toThrow('Password must contain at least one uppercase letter');
    });

    it('should throw error for password without special characters', async () => {
      await expect(authService.register({
        email: 'test@example.com',
        password: 'Password123',
        username: 'testuser'
      })).rejects.toThrow('Password must contain at least one special character');
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        username: 'testuser',
        email_verified: true,
        created_at: '2023-01-01T00:00:00Z',
        last_active: '2023-01-01T00:00:00Z',
        privacy_settings: { dataRetention: 365, analyticsOptOut: false },
        failed_login_attempts: 0,
        locked_until: null,
        totp_enabled: false
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'TestPassword123!'
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe('test@example.com');
      expect(result.requires2FA).toBeUndefined();
    });

    it('should return requires2FA true when TOTP is enabled', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        username: 'testuser',
        email_verified: true,
        created_at: '2023-01-01T00:00:00Z',
        last_active: '2023-01-01T00:00:00Z',
        privacy_settings: { dataRetention: 365, analyticsOptOut: false },
        failed_login_attempts: 0,
        locked_until: null,
        totp_enabled: true
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
          })
        })
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'TestPassword123!'
      });

      expect(result.requires2FA).toBe(true);
      expect(result.tokens.accessToken).toBe('');
    });

    it('should throw error for invalid credentials', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: 'User not found' })
          })
        })
      });

      await expect(authService.login({
        email: 'test@example.com',
        password: 'WrongPassword'
      })).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for locked account', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        username: 'testuser',
        email_verified: true,
        created_at: '2023-01-01T00:00:00Z',
        last_active: '2023-01-01T00:00:00Z',
        privacy_settings: { dataRetention: 365, analyticsOptOut: false },
        failed_login_attempts: 5,
        locked_until: new Date(Date.now() + 60000).toISOString(), // Locked for 1 minute from now
        totp_enabled: false
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
          })
        })
      });

      await expect(authService.login({
        email: 'test@example.com',
        password: 'TestPassword123!'
      })).rejects.toThrow('Account is temporarily locked due to multiple failed login attempts');
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email with valid token', async () => {
      const mockTokenRecord = testDataFactory.createToken({
        expires_at: new Date(Date.now() + 60000).toISOString()
      });

      const mockSupabaseClient = supabase as jest.Mocked<typeof supabase>;
      
      // Setup complete mock behavior for verifyEmail test
      let callCount = 0;
      mockSupabaseClient.from.mockImplementation((tableName: string) => {
        const query = createMockSupabaseClient().from(tableName);
        
        if (tableName === 'user_verification_tokens') {
          callCount++;
          if (callCount === 1) {
            // First call: token lookup
            query.single.mockResolvedValue({ data: mockTokenRecord, error: null });
          } else {
            // Second call: token deletion
            query.eq.mockResolvedValue({ data: {}, error: null });
          }
        } else if (tableName === 'users') {
          // User update for email verification
          query.eq.mockResolvedValue({ data: {}, error: null });
        }
        
        return query;
      });

      const result = await authService.verifyEmail('valid_token');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email verified successfully');
    });

    it('should return error for expired token', async () => {
      const mockTokenRecord = {
        user_id: 'test-user-id',
        expires_at: new Date(Date.now() - 60000).toISOString() // Expired 1 minute ago
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockTokenRecord, error: null })
          })
        })
      });

      const result = await authService.verifyEmail('expired_token');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired verification token');
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token with valid refresh token', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com'
      };

      // Mock JWT verification
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({ user_id: 'test-user-id', type: 'refresh' });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
          })
        })
      });

      const result = await authService.refreshToken('valid_refresh_token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
    });

    it('should throw error for invalid refresh token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken('invalid_token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('forgotPassword', () => {
    it('should return success message regardless of user existence', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: 'User not found' })
          })
        })
      });

      const result = await authService.forgotPassword('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account with this email exists');
    });

    it('should throw error for invalid email format', async () => {
      await expect(authService.forgotPassword('invalid-email')).rejects.toThrow('Invalid email format');
    });
  });

  describe('resetPassword', () => {
    it('should successfully reset password with valid token', async () => {
      const mockTokenRecord = {
        user_id: 'test-user-id',
        expires_at: new Date(Date.now() + 60000).toISOString()
      };

      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({ user_id: 'test-user-id', type: 'password_reset' });

      const mockSupabaseClient = supabase as jest.Mocked<typeof supabase>;
      
      // Setup complete mock behavior for resetPassword test
      let callCount = 0;
      mockSupabaseClient.from.mockImplementation((tableName: string) => {
        const query = createMockSupabaseClient().from(tableName);
        
        if (tableName === 'password_reset_tokens') {
          callCount++;
          if (callCount === 1) {
            // First call: token lookup
            query.single.mockResolvedValue({ data: mockTokenRecord, error: null });
          } else {
            // Second call: token deletion
            query.eq.mockResolvedValue({ data: {}, error: null });
          }
        } else if (tableName === 'users') {
          // User password update
          query.eq.mockResolvedValue({ data: {}, error: null });
        }
        
        return query;
      });

      const result = await authService.resetPassword('valid_token', 'NewPassword123!');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password reset successfully');
    });

    it('should return error for weak new password', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({ user_id: 'test-user-id', type: 'password_reset' });

      const result = await authService.resetPassword('valid_token', 'weak');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Password must be at least 8 characters long');
    });
  });
});