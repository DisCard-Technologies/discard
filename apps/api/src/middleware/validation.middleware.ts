import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    cardContext: string;
  };
}

export const validateCardAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cardId } = req.params;
    const userCardContext = req.user?.cardContext;

    if (!cardId) {
      res.status(400).json({ error: 'Card ID is required' });
      return;
    }

    if (!userCardContext) {
      res.status(401).json({ error: 'User context not found' });
      return;
    }

    // Verify the user has access to this specific card
    // This would typically check against a database of user-card relationships
    // For now, we'll allow access if the user is authenticated
    if (!req.user?.id) {
      res.status(403).json({ error: 'Access denied to card' });
      return;
    }

    next();
  } catch (error) {
    logger.error('Card access validation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const validateRequestBody = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
      return;
    }
    
    next();
  };
};

export const validateQueryParams = (requiredParams: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingParams = requiredParams.filter(param => !req.query[param]);
    
    if (missingParams.length > 0) {
      res.status(400).json({ 
        error: `Missing required query parameters: ${missingParams.join(', ')}` 
      });
      return;
    }
    
    next();
  };
};

export { AuthenticatedRequest };