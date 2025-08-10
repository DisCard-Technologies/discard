import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { TransactionIsolationService } from '../services/privacy/transaction-isolation.service';
import { logger } from '../utils/logger';

interface IsolationRequest extends Request {
  isolationContext?: {
    cardId?: string;
    contextHash?: string;
    isolationVerified?: boolean;
  };
}

/**
 * Middleware to enforce transaction isolation at the request level
 */
export class IsolationMiddleware {
  private isolationService: TransactionIsolationService;
  private readonly CONTEXT_HEADER = 'x-card-context';
  private readonly SESSION_HEADER = 'x-session-id';
  
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
  }

  /**
   * Enforce isolation for card-specific routes
   */
  enforceIsolation() {
    return async (req: IsolationRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Extract card context from request
        const cardId = this.extractCardId(req);
        
        if (!cardId) {
          res.status(400).json({ 
            error: 'Card context required for this operation' 
          });
          return;
        }

        // Validate card ID format
        if (!this.isValidCardId(cardId)) {
          res.status(400).json({ 
            error: 'Invalid card ID format' 
          });
          return;
        }

        // Check for existing isolation context to avoid redundant enforcement
        if (req.isolationContext?.cardId === cardId && req.isolationContext.isolationVerified) {
          next();
          return;
        }

        // Enforce transaction isolation
        await this.isolationService.enforceTransactionIsolation(cardId);

        // Generate context hash with additional entropy
        const contextHash = this.generateContextHash(cardId);

        // Add isolation context to request
        req.isolationContext = {
          cardId,
          contextHash,
          isolationVerified: true
        };

        // Add isolation headers to response
        res.setHeader('X-Isolation-Verified', 'true');
        res.setHeader('X-Context-Hash', contextHash);
        res.setHeader('X-Isolation-Timestamp', new Date().toISOString());

        next();
      } catch (error) {
        logger.error('Isolation enforcement failed', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          cardId: this.extractCardId(req),
          path: req.path 
        });
        res.status(403).json({ 
          error: 'Privacy isolation could not be verified' 
        });
        return;
      }
    };
  }

  /**
   * Verify isolation is maintained
   */
  verifyIsolation() {
    return async (req: IsolationRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.isolationContext?.contextHash) {
          res.status(403).json({ 
            error: 'Isolation context not established' 
          });
          return;
        }

        const verification = await this.isolationService.verifyIsolation(
          req.isolationContext.contextHash
        );

        if (!verification.isolated) {
          logger.warn('Isolation verification failed', { 
            contextHash: req.isolationContext.contextHash,
            violations: verification.privacyViolations 
          });
          
          res.status(403).json({ 
            error: 'Privacy isolation violation detected' 
          });
          return;
        }

        // Update verification timestamp
        res.setHeader('X-Isolation-Last-Verified', verification.lastVerified);

        next();
      } catch (error) {
        logger.error('Isolation verification error', { error });
        res.status(500).json({ 
          error: 'Isolation verification failed' 
        });
        return;
      }
    };
  }

  /**
   * Log access patterns for correlation detection
   */
  logAccessPattern() {
    return async (req: IsolationRequest, res: Response, next: NextFunction) => {
      try {
        const contextHash = req.isolationContext?.contextHash || 'unknown';
        const accessPattern = {
          context_hash: contextHash,
          access_type: this.determineAccessType(req),
          query_signature: this.generateQuerySignature(req),
          ip_hash: this.hashIpAddress(req.ip),
          session_hash: this.hashSessionId(req),
          access_timestamp: new Date().toISOString()
        };

        // Log asynchronously to not block request
        this.logAccessPatternAsync(accessPattern);

        next();
      } catch (error) {
        logger.error('Failed to log access pattern', { error });
        next(); // Continue even if logging fails
      }
    };
  }

  /**
   * Prevent cross-card access
   */
  preventCrossCardAccess() {
    return async (req: IsolationRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const requestedCardId = this.extractCardId(req);
        const contextCardId = req.isolationContext?.cardId;

        if (requestedCardId && contextCardId && requestedCardId !== contextCardId) {
          logger.warn('Cross-card access attempt detected', {
            requested: requestedCardId,
            context: contextCardId
          });

          res.status(403).json({ 
            error: 'Cross-card access not permitted' 
          });
          return;
        }

        next();
      } catch (error) {
        logger.error('Cross-card access check failed', { error });
        res.status(500).json({ 
          error: 'Access verification failed' 
        });
        return;
      }
    };
  }

  /**
   * Add privacy headers
   */
  addPrivacyHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Add privacy-preserving headers
      res.setHeader('X-Privacy-Protected', 'true');
      res.setHeader('X-Correlation-Resistant', 'true');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Remove potentially identifying headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');

      next();
    };
  }

  /**
   * Rate limit by card context with sliding window
   */
  rateLimitByContext(maxRequests: number = 100, windowMs: number = 60000) {
    const contextLimits = new Map<string, { requests: number[]; }>();

    return (req: IsolationRequest, res: Response, next: NextFunction) => {
      const contextHash = req.isolationContext?.contextHash;
      
      if (!contextHash) {
        return next();
      }

      const now = Date.now();
      let contextData = contextLimits.get(contextHash);
      
      if (!contextData) {
        contextData = { requests: [] };
        contextLimits.set(contextHash, contextData);
      }

      // Remove expired requests from sliding window
      contextData.requests = contextData.requests.filter(timestamp => 
        now - timestamp < windowMs
      );

      if (contextData.requests.length >= maxRequests) {
        // Calculate time until oldest request expires
        const oldestRequest = Math.min(...contextData.requests);
        const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
        
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('Retry-After', retryAfter.toString());
        
        return res.status(429).json({ 
          error: 'Rate limit exceeded for this context',
          retryAfter 
        });
      }

      contextData.requests.push(now);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - contextData.requests.length).toString());
      
      // Clean up old contexts periodically (every 100 requests)
      if (Math.random() < 0.01) {
        this.cleanupOldContexts(contextLimits, windowMs);
      }
      
      next();
    };
  }

  /**
   * Extract card ID from request
   */
  private extractCardId(req: IsolationRequest): string | null {
    // Try multiple sources
    return req.params.cardId || 
           req.body?.cardId || 
           (req.query.cardId as string) || 
           (req.headers[this.CONTEXT_HEADER] as string) || 
           null;
  }

  /**
   * Generate context hash
   */
  private generateContextHash(cardId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${cardId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
      .digest('hex');
  }

  /**
   * Determine access type from request
   */
  private determineAccessType(req: Request): string {
    if (req.method === 'GET') return 'read';
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) return 'write';
    if (req.path.includes('context')) return 'context_switch';
    return 'query';
  }

  /**
   * Generate anonymized query signature
   */
  private generateQuerySignature(req: Request): string {
    const signature = {
      method: req.method,
      pathPattern: this.anonymizePath(req.path),
      hasBody: !!req.body && Object.keys(req.body).length > 0,
      queryParams: Object.keys(req.query).sort()
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(signature))
      .digest('hex');
  }

  /**
   * Anonymize path by removing IDs
   */
  private anonymizePath(path: string): string {
    return path.replace(/\/[a-f0-9-]{36}/g, '/:id'); // Replace UUIDs
  }

  /**
   * Hash IP address for privacy
   */
  private hashIpAddress(ip?: string): string {
    if (!ip) return 'unknown';
    
    // Add daily salt for IP rotation
    const dailySalt = new Date().toISOString().split('T')[0];
    return crypto
      .createHash('sha256')
      .update(`${ip}:${dailySalt}`)
      .digest('hex');
  }

  /**
   * Hash session ID
   */
  private hashSessionId(req: Request): string {
    const sessionId = req.headers[this.SESSION_HEADER] as string || 
                     (req as any).sessionID || 
                     'no-session';
    
    return crypto
      .createHash('sha256')
      .update(sessionId)
      .digest('hex');
  }

  /**
   * Log access pattern asynchronously
   */
  private async logAccessPatternAsync(pattern: any): Promise<void> {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
      
      if (!supabaseUrl || !supabaseKey) {
        logger.warn('Supabase credentials not configured for access pattern logging');
        return;
      }
      
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from('access_pattern_tracking')
        .insert(pattern);
        
      if (error) {
        logger.error('Failed to insert access pattern', { error: error.message });
      }
    } catch (error) {
      logger.error('Failed to log access pattern to database', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Validate card ID format
   */
  private isValidCardId(cardId: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(cardId);
  }

  /**
   * Clean up old contexts from rate limiter
   */
  private cleanupOldContexts(contextLimits: Map<string, { requests: number[] }>, windowMs: number): void {
    const now = Date.now();
    for (const [contextHash, data] of contextLimits.entries()) {
      data.requests = data.requests.filter(timestamp => now - timestamp < windowMs);
      if (data.requests.length === 0) {
        contextLimits.delete(contextHash);
      }
    }
  }
}

// Export middleware instances
export const isolationMiddleware = new IsolationMiddleware();

// Convenience exports
export const enforceIsolation = isolationMiddleware.enforceIsolation();
export const verifyIsolation = isolationMiddleware.verifyIsolation();
export const logAccessPattern = isolationMiddleware.logAccessPattern();
export const preventCrossCardAccess = isolationMiddleware.preventCrossCardAccess();
export const addPrivacyHeaders = isolationMiddleware.addPrivacyHeaders();
export const rateLimitByContext = isolationMiddleware.rateLimitByContext();