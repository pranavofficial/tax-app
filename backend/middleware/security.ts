import { Request, Response, NextFunction } from 'express';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

// Rate limiting middleware
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Define a custom request type that includes auth information
export interface AuthRequest extends Request {
  auth?: {
    sub: string;
    [key: string]: any;
  };
}

// Configure Auth0 authentication middleware
export const authenticateUser = expressjwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
  }) as unknown as GetVerificationKey,
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256']
});

// Create separate middleware for user validation if needed
export const validateUser = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.auth?.sub) {
    return res.status(401).json({ error: 'No valid user ID found in token' });
  }
  next();
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    // Sanitize each field in the request body
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }
  
  // Sanitize query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key] as string);
      }
    }
  }
  
  next();
};

// Add auth property to Request interface
declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string;
        [key: string]: any;
      };
    }
  }
}

// Simple sanitize function that doesn't rely on external packages
function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove onclick= and similar
    .trim();
}

// Error handler for authentication errors
export const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.name === 'UnauthorizedError') {
    console.error('Auth error details:', err);
    return res.status(401).json({ error: 'Invalid or missing authentication token' });
  }
  next(err);
};