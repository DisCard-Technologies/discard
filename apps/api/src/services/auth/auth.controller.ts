import { Request, Response } from 'express';
import { authService } from './auth.service';

export class AuthController {
  /**
   * Register a new user
   * POST /auth/register
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, username } = req.body;

      // Input validation
      if (!email || !password) {
        res.status(400).json({ 
          success: false,
          error: 'Email and password are required' 
        });
        return;
      }

      const result = await authService.register({ email, password, username });

      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please check your email to verify your account.',
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
      const { email, password } = req.body;

      // Input validation
      if (!email || !password) {
        res.status(400).json({ 
          success: false,
          error: 'Email and password are required' 
        });
        return;
      }

      const result = await authService.login({ email, password });

      res.json({
        success: true,
        message: 'Login successful',
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
      const statusCode = errorMessage.includes('locked') ? 423 : 401;
      
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
        error: 'Email verification failed'
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
        error: 'Invalid refresh token'
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
        error: 'Password reset request failed'
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
        error: 'Password reset failed'
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